import NextAuth, { CredentialsSignin } from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyOtp, getUserByEmail } from '@/lib/otp'
import { getAccountByEmail, getOrCreateAccount } from '@/lib/accounts'
import { verifyPassword } from '@/lib/password'
import { getUserRole } from '@/lib/users'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { authConfig } from '@/auth.config'
import { isOidcIdentityAccepted } from '@/lib/oidc-access'
import { decryptOidcClientSecret, getAllowedDomains, getAuthMethod, getInviteOnly, getOidcConfig, isOidcConfigured } from '@/lib/auth-methods'
import { isEmailDomainAllowed } from '@/lib/email-domains'

// Codes distincts propagés jusqu'au client via signIn(...).code (CredentialsSignin.code devient le paramètre
// `code` de l'URL de redirection — voir node_modules/@auth/core/errors.js) : SignInForm les traduit,
// contrairement à un simple null qui ne distingue pas "mauvais mot de passe" de "compte pas encore validé".
class AccountDisabledError extends CredentialsSignin { code = 'account_disabled' }
class DomainNotAllowedError extends CredentialsSignin { code = 'domain_not_allowed' }
class PendingApprovalError extends CredentialsSignin { code = 'pending_approval' }
class PendingVerificationError extends CredentialsSignin { code = 'pending_verification' }

/**
 * Un seul fournisseur enregistré à la fois : celui de la méthode de connexion active (Réglages → Connexion,
 * site_settings.auth_config). Relue à chaque requête (getAuthMethod(), caché 5s par getSetting) — changer
 * de méthode prend effet sans redémarrer, et une méthode désactivée n'a structurellement plus de provider
 * enregistré (plus fort qu'une vérification interne à authorize()).
 *
 * Le fournisseur Credentials OTP n'a pas d'id explicite (id par défaut : 'credentials') : lui seul existe
 * tant que les méthodes mot de passe ne sont pas ajoutées, donc `signIn('credentials', …)` côté client n'a
 * pas besoin de changer ici. Seul un fournisseur structurellement différent (OIDC, plus tard) a besoin
 * d'un id explicite pour son propre appel signIn().
 */
async function buildProviders(): Promise<NextAuthConfig['providers']> {
  const method = await getAuthMethod()
  const providers: NextAuthConfig['providers'] = []

  if (method === 'otp_display' || method === 'otp_email') {
    providers.push(
      Credentials({
        name: 'OTP',
        credentials: {
          email: { label: 'Email', type: 'email' },
          otp:   { label: 'Code OTP', type: 'text' },
        },
        async authorize(credentials) {
          const email = credentials?.email as string | undefined
          const otp   = credentials?.otp   as string | undefined

          if (!email || !otp) return null

          // Freine les essais de codes à répétition sur un même email
          if (!checkRateLimit(`otp-verify:${email.toLowerCase()}`, 10).ok) return null

          const valid = await verifyOtp(email, otp)
          if (!valid) return null

          const user = await getUserByEmail(email)
          if (!user || user.disabled) return null // compte inconnu ou désactivé
          if (!isEmailDomainAllowed(user.email, await getAllowedDomains())) return null // domaine plus autorisé

          return { id: user.id, email: user.email, name: user.name ?? undefined }
        },
      }),
    )
  }

  if (method === 'sso_oidc') {
    const oidc = await getOidcConfig()
    if (isOidcConfigured(oidc)) {
      providers.push({
        id: 'oidc',
        name: oidc.buttonLabel,
        type: 'oidc',
        issuer: oidc.issuer,
        clientId: oidc.clientId,
        clientSecret: decryptOidcClientSecret(oidc),
        authorization: { params: { scope: oidc.scopes } },
        // checks (pkce par défaut) laissés aux défauts d'Auth.js — le plus interopérable pour un IdP générique inconnu
      })
    }
  }

  if (method === 'password_admin_approval' || method === 'password_email_verify') {
    providers.push(
      Credentials({
        name: 'Password',
        credentials: {
          email:    { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials, request) {
          const email    = credentials?.email    as string | undefined
          const password = credentials?.password as string | undefined
          if (!email || !password) return null

          // Même schéma double (IP puis email) que /api/auth/otp
          const ip = getClientIp(request)
          if (ip !== 'unknown' && !checkRateLimit(`password-login-ip:${ip}`, 20).ok) return null
          if (!checkRateLimit(`password-login-email:${email.toLowerCase()}`, 10).ok) return null

          const account = await getAccountByEmail(email)
          if (!account) return null // email inconnu : pas d'indice, message générique
          if (account.disabled) throw new AccountDisabledError()
          if (!account.password_hash || !(await verifyPassword(account.password_hash, password))) return null

          // Après la vérification du mot de passe : ne révèle rien à qui ne le connaît pas
          if (!isEmailDomainAllowed(account.email, await getAllowedDomains())) throw new DomainNotAllowedError()

          // status ne gate que ce fournisseur : OTP et OIDC établissent la confiance par possession
          // (boîte mail/code affiché, ou l'IdP lui-même), déjà plus fort que ce que "pending" filtre ici.
          if (account.status === 'pending_approval') throw new PendingApprovalError()
          if (account.status === 'pending_verification') throw new PendingVerificationError()

          return { id: account.id, email: account.email, name: account.name ?? undefined }
        },
      }),
    )
  }

  return providers
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => ({
  ...authConfig,

  // Pas d'adaptateur : sessions en JWT + fournisseurs Credentials, aucune table NextAuth (accounts, sessions,
  // verification_token) n'est lue ni écrite — les comptes sont gérés par lib/otp.ts (OTP) et lib/accounts.ts
  // (méthodes mot de passe / SSO, à venir).
  providers: await buildProviders(),

  callbacks: {
    ...authConfig.callbacks,
    // Équivalent d'authorize() pour OIDC, qui n'en a pas : premier login SSO → auto-provisioning
    // (role='user'/status='active' par défaut de colonne, comme otp.ts::getOrCreateUser).
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'oidc') return true
      if (!user.email) return false
      // Domaine autorisé + email non déclaré « non vérifié » : sinon n'importe quel compte du fournisseur
      // (ou un fournisseur laxiste sur les emails) entrerait, voire usurperait un compte existant par son email.
      const allowedDomains = await getAllowedDomains()
      if (!isOidcIdentityAccepted({
        email: user.email,
        emailVerified: typeof profile?.email_verified === 'boolean' ? profile.email_verified : undefined,
        allowedDomains,
      })) return false
      // Invitation seulement : l'identité SSO doit déjà avoir un compte (pas d'auto-création au premier login)
      const acct = (await getInviteOnly())
        ? await getAccountByEmail(user.email)
        : await getOrCreateAccount(user.email, user.name)
      if (!acct) return false
      return !acct.disabled
    },
    async jwt({ token, user, account }) {
      if (user) {
        // L'id renvoyé par le fournisseur OIDC est le `sub` de l'IdP, pas notre id de ligne — on résout
        // le vrai compte via l'email (signIn() vient de le créer/retrouver juste avant).
        let id = user.id, email = user.email, name = user.name
        if (account?.provider === 'oidc' && user.email) {
          const acct = await getAccountByEmail(user.email)
          if (acct) { id = acct.id; email = acct.email; name = acct.name }
        }
        token.id    = id
        token.email = email
        token.name  = name
        // Lire le rôle depuis la DB au moment du login — jamais celui du provider, pour OTP/mot de passe/OIDC alike
        token.role = (await getUserRole(id as string, { fresh: true })) ?? 'user'
      } else if (typeof token.id === 'string') {
        // Appelé à chaque lecture de session : une rétrogradation ou une suppression de compte
        // doit prendre effet tout de suite, pas au bout des 30 jours de validité du JWT.
        try {
          const role = await getUserRole(token.id)
          if (role === null) return null // compte supprimé : session invalidée
          token.role = role
          // Domaines restreints après coup : les sessions déjà ouvertes d'un domaine exclu tombent aussi
          if (!isEmailDomainAllowed(token.email, await getAllowedDomains())) return null
        } catch {
          // Base injoignable : on garde le rôle du jeton plutôt que de déconnecter tout le monde
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id    = token.id as string
        session.user.email = token.email as string
        session.user.name  = token.name as string | null | undefined
        session.user.role  = (token.role as string) ?? 'user'
      }
      return session
    },
  },
}))
