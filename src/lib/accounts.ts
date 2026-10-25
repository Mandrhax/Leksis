import 'server-only'
import { randomBytes } from 'node:crypto'
import { query } from './db'

export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // un lien d'invitation se transmet à la main : une semaine
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24h — plus long que l'OTP (10 min) : un lien de vérification
                                                // dort dans une boîte mail, un code se tape tout de suite.

// Additif à otp.ts, jamais un remplacement : otp.ts reste intact pour garder à zéro le diff sur le flux
// par défaut dont dépendent toutes les installations existantes. Un petit SELECT dupliqué coûte moins
// cher que le risque de toucher un fichier importé par auth.ts et la route OTP.

export interface Account {
  id: string
  email: string
  name: string | null
  role: string
  disabled: boolean
  status: 'active' | 'pending_approval' | 'pending_verification'
  password_hash: string | null
}

const ACCOUNT_COLUMNS = 'id, email, name, role, disabled, status, password_hash'

/** Retourne le compte par email, ou null s'il n'existe pas. */
export async function getAccountByEmail(email: string): Promise<Account | null> {
  const result = await query<Account>(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE email = $1`, [email])
  return result.rowCount ? result.rows[0] : null
}

/**
 * Compte d'une identité SSO (OIDC). Le premier login lie le compte à `(issuer, sub)` — l'identifiant stable que
 * l'IdP attribue à la personne ; ensuite, seul ce couple ouvre ce compte, plus jamais l'email seul. Sans ça, un
 * IdP où l'utilisateur peut modifier son adresse (schéma « nOAuth ») permettait de prendre un compte existant,
 * admin compris, en y écrivant son email.
 *  - lien (issuer, sub) connu → ce compte, quel que soit l'email présenté aujourd'hui ;
 *  - sinon compte trouvé par email : lié s'il ne l'est pas encore à un autre sujet du MÊME issuer (un compte lié
 *    à un autre IdP — l'admin a changé de fournisseur — est relié au nouveau) ; déjà lié à quelqu'un d'autre → null ;
 *  - sinon nouveau compte (sauf `create: false`, mode invitation seulement).
 */
export async function resolveOidcAccount(opts: {
  issuer: string; sub: string; email: string; name?: string | null; create: boolean
}): Promise<Account | null> {
  const { issuer, sub, email } = opts
  const linked = await query<Account>(
    `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE oidc_issuer = $1 AND oidc_sub = $2`, [issuer, sub],
  )
  if (linked.rowCount) return linked.rows[0]

  const byEmail = await query<Account & { oidc_issuer: string | null; oidc_sub: string | null }>(
    `SELECT ${ACCOUNT_COLUMNS}, oidc_issuer, oidc_sub FROM users WHERE email = $1`, [email],
  )
  const existing = byEmail.rows[0]
  if (existing) {
    if (existing.oidc_sub && existing.oidc_issuer === issuer) return null
    await query('UPDATE users SET oidc_issuer = $2, oidc_sub = $3 WHERE id = $1', [existing.id, issuer, sub])
    return existing
  }
  if (!opts.create) return null

  const created = await query<Account>(
    `INSERT INTO users (email, name, oidc_issuer, oidc_sub) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${ACCOUNT_COLUMNS}`,
    [email, opts.name ?? null, issuer, sub],
  )
  return created.rows[0] ?? null
}

/** Compte déjà lié à une identité SSO (sans rien créer ni lier). */
export async function getAccountByOidcIdentity(issuer: string, sub: string): Promise<Account | null> {
  const r = await query<Account>(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE oidc_issuer = $1 AND oidc_sub = $2`, [issuer, sub])
  return r.rowCount ? r.rows[0] : null
}

export type CreateOrAttachResult =
  | { outcome: 'created'; account: Account }
  | { outcome: 'resend_verification'; account: Account }
  | { outcome: 'already_pending' | 'already_active' }

/**
 * Inscription par mot de passe (/api/auth/signup, tranche 3) :
 *  - email inconnu → nouveau compte, statut `status`.
 *  - compte existant sans mot de passe (OTP/OIDC/admin d'installation) → refusé comme 'already_active', rien
 *    n'est écrit : sinon n'importe qui pourrait y poser son mot de passe (pré-piratage).
 *  - compte déjà en attente de vérification email → 'resend_verification' (le premier email a pu se perdre,
 *    l'appelant renvoie un nouveau token plutôt que de bloquer).
 *  - compte déjà en attente de validation admin, ou déjà actif → signalé tel quel, aucune écriture.
 */
export async function createOrAttachPendingAccount(
  email: string,
  name: string | null,
  passwordHash: string,
  status: 'pending_approval' | 'pending_verification',
): Promise<CreateOrAttachResult> {
  const existing = await getAccountByEmail(email)

  if (!existing) {
    const result = await query<Account>(
      `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, $4)
       RETURNING ${ACCOUNT_COLUMNS}`,
      [email, name, passwordHash, status],
    )
    return { outcome: 'created', account: result.rows[0] }
  }

  // Compte sans mot de passe (admin d'installation, OTP, SSO) : jamais de mot de passe posé par un inconnu
  // qui connaît l'email. Le propriétaire passe par un administrateur (réinitialisation) ou sa méthode habituelle.
  if (!existing.password_hash) return { outcome: 'already_active' }

  if (existing.status === 'active') return { outcome: 'already_active' }
  if (existing.status === 'pending_verification') {
    // La dernière inscription l'emporte : si un inconnu s'est inscrit d'abord avec cette adresse, le vrai
    // propriétaire qui s'inscrit à son tour remplace ce mot de passe. La confirmation exige ensuite le mot de
    // passe (POST /api/auth/verify-email) : l'inconnu, qui ne reçoit pas l'email, ne peut rien confirmer.
    const updated = await query<Account>(
      `UPDATE users SET password_hash = $2, name = COALESCE($3, name)
       WHERE id = $1 AND status = 'pending_verification'
       RETURNING ${ACCOUNT_COLUMNS}`,
      [existing.id, passwordHash, name],
    )
    return { outcome: 'resend_verification', account: updated.rows[0] ?? existing }
  }
  return { outcome: 'already_pending' }
}

/** Marque un compte comme actif une fois son email vérifié. Sans effet si le statut a changé entre-temps. */
export async function activateVerifiedAccount(email: string): Promise<boolean> {
  const result = await query(
    `UPDATE users SET status = 'active' WHERE email = $1 AND status = 'pending_verification'`,
    [email],
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Token à usage unique pour un flux par email (vérification aujourd'hui ; `purpose` permet de réutiliser
 * la table pour un futur reset de mot de passe sans nouvelle migration). Même logique que otp.ts::generateOtp,
 * opaque (256 bits) au lieu d'un code à 6 chiffres : ce token n'est jamais tapé à la main, seulement cliqué.
 */
export async function createEmailToken(email: string, purpose: string, ttlMs = EMAIL_TOKEN_TTL_MS): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + ttlMs)

  // Invalider les anciens tokens non utilisés du même email et de la même finalité
  await query(`UPDATE email_tokens SET used = TRUE WHERE email = $1 AND purpose = $2 AND used = FALSE`, [email, purpose])
  // Ménage : les tokens expirés depuis plus d'un jour ne servent plus à rien
  await query(`DELETE FROM email_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`)

  await query(
    `INSERT INTO email_tokens (email, token, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [email, token, purpose, expiresAt],
  )
  return token
}

/**
 * Consomme un token à usage unique : retourne l'email associé, ou null si invalide/expiré/déjà utilisé.
 * Un seul UPDATE ... RETURNING : deux consommations simultanées du même token ne peuvent pas réussir toutes les deux.
 */
export async function consumeEmailToken(token: string, purpose: string): Promise<string | null> {
  const result = await query<{ email: string }>(
    `UPDATE email_tokens
     SET used = TRUE
     WHERE token = $1 AND purpose = $2 AND used = FALSE AND expires_at > NOW()
     RETURNING email`,
    [token, purpose],
  )
  return result.rowCount ? result.rows[0].email : null
}

/** Email associé à un jeton encore valable, SANS le consommer (la page d'invitation vérifie le lien avant d'afficher le formulaire). */
export async function peekEmailToken(token: string, purpose: string): Promise<string | null> {
  const result = await query<{ email: string }>(
    `SELECT email FROM email_tokens WHERE token = $1 AND purpose = $2 AND used = FALSE AND expires_at > NOW()`,
    [token, purpose],
  )
  return result.rowCount ? result.rows[0].email : null
}

/**
 * Lien d'invitation : consomme le jeton (une seule fois) puis pose le mot de passe choisi par la personne et
 * active le compte. Le jeton n'est émis que par un administrateur, pour une adresse précise : le détenteur du
 * lien est donc la personne invitée (contrairement à l'inscription libre, où n'importe qui connaît l'email).
 * Un compte désactivé ou supprimé entre-temps ne reçoit rien.
 */
export async function acceptInvitation(token: string, passwordHash: string): Promise<{ ok: true; email: string } | { ok: false }> {
  const email = await consumeEmailToken(token, 'invite')
  if (!email) return { ok: false }
  const result = await query(
    `UPDATE users SET password_hash = $2, status = 'active' WHERE email = $1 AND NOT disabled`,
    [email, passwordHash],
  )
  return (result.rowCount ?? 0) > 0 ? { ok: true, email } : { ok: false }
}
