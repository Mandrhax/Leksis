import 'server-only'
import { randomBytes } from 'node:crypto'
import { query } from './db'

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
 * Retourne le compte existant ou le crée (rôle/statut par défaut de colonne : 'user'/'active').
 * Utilisé pour l'auto-provisioning au premier login SSO — même logique que otp.ts::getOrCreateUser.
 */
export async function getOrCreateAccount(email: string, name?: string | null): Promise<Account> {
  const existing = await getAccountByEmail(email)
  if (existing) return existing

  // ON CONFLICT : deux demandes simultanées pour un nouvel email ne doivent pas s'écraser en erreur
  const result = await query<Account>(
    `INSERT INTO users (email, name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING ${ACCOUNT_COLUMNS}`,
    [email, name ?? null],
  )
  return result.rows[0]
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
  if (existing.status === 'pending_verification') return { outcome: 'resend_verification', account: existing }
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
export async function createEmailToken(email: string, purpose: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS)

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
