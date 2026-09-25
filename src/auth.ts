import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyOtp, getUserByEmail } from '@/lib/otp'
import { getUserRole } from '@/lib/users'
import { checkRateLimit } from '@/lib/rate-limit'
import { authConfig } from '@/auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  // Pas d'adaptateur : sessions en JWT + fournisseur Credentials, aucune table NextAuth (accounts, sessions,
  // verification_token) n'est lue ni écrite — les comptes sont gérés par lib/otp.ts.
  providers: [
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

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id    = user.id
        token.email = user.email
        token.name  = user.name
        // Lire le rôle depuis la DB au moment du login
        token.role = (await getUserRole(user.id as string, { fresh: true })) ?? 'user'
      } else if (typeof token.id === 'string') {
        // Appelé à chaque lecture de session : une rétrogradation ou une suppression de compte
        // doit prendre effet tout de suite, pas au bout des 30 jours de validité du JWT.
        try {
          const role = await getUserRole(token.id)
          if (role === null) return null // compte supprimé : session invalidée
          token.role = role
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
})
