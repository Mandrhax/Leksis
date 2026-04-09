import { query } from './db'

const OTP_TTL_MINUTES = 10

export interface LeksissUser {
  id: string
  email: string
  name: string | null
}

/** Génère un code OTP à 6 chiffres, le stocke en DB et le retourne. */
export async function generateOtp(email: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  // Invalider les anciens codes non utilisés pour cet email
  await query(
    `UPDATE otp_tokens SET used = TRUE WHERE email = $1 AND used = FALSE`,
    [email]
  )

  await query(
    `INSERT INTO otp_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
    [email, code, expiresAt]
  )

  return code
}

/**
 * Vérifie un OTP : doit être non expiré, non utilisé.
 * Marque le token comme utilisé si valide.
 */
export async function verifyOtp(email: string, token: string): Promise<boolean> {
  const result = await query(
    `SELECT id FROM otp_tokens
     WHERE email = $1
       AND token = $2
       AND used = FALSE
       AND expires_at > NOW()
     LIMIT 1`,
    [email, token]
  )

  if (!result.rowCount) return false

  const id = result.rows[0].id
  await query(`UPDATE otp_tokens SET used = TRUE WHERE id = $1`, [id])
  return true
}

/** Retourne l'utilisateur par email, ou null s'il n'existe pas. */
export async function getUserByEmail(email: string): Promise<LeksissUser | null> {
  const result = await query<LeksissUser>(
    `SELECT id, email, name FROM users WHERE email = $1`,
    [email]
  )
  return result.rowCount ? result.rows[0] : null
}

/** Retourne l'utilisateur existant ou le crée s'il n'existe pas encore. */
export async function getOrCreateUser(email: string): Promise<LeksissUser> {
  const existing = await getUserByEmail(email)
  if (existing) return existing

  const result = await query<LeksissUser>(
    `INSERT INTO users (email) VALUES ($1) RETURNING id, email, name`,
    [email]
  )
  return result.rows[0]
}
