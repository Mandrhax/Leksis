import { createHash, randomInt } from 'node:crypto'
import { query } from './db'

const OTP_TTL_MINUTES = 10
/** Mauvais essais tolérés sur un même code avant qu'il soit invalidé (il faut alors en redemander un). */
export const OTP_MAX_ATTEMPTS = 5

// Seule l'empreinte du code est en base : une copie de la base (sauvegarde, dump) ne livre aucun code valable
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex')

export interface LeksissUser {
  id: string
  email: string
  name: string | null
  disabled: boolean
}

/** Génère un code OTP à 6 chiffres, le stocke en DB et le retourne. */
export async function generateOtp(email: string): Promise<string> {
  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  // Invalider les anciens codes non utilisés pour cet email
  await query(
    `UPDATE otp_tokens SET used = TRUE WHERE email = $1 AND used = FALSE`,
    [email]
  )

  // Ménage : les codes expirés depuis plus d'un jour ne servent plus à rien
  await query(`DELETE FROM otp_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`)

  await query(
    `INSERT INTO otp_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
    [email, hashCode(code), expiresAt]
  )

  return code
}

/**
 * Vérifie un OTP : doit être non expiré, non utilisé, et avoir subi moins de OTP_MAX_ATTEMPTS mauvais essais.
 * Un seul UPDATE ... RETURNING : deux connexions simultanées avec le même code ne peuvent pas réussir toutes les deux.
 * Un mauvais code compte un essai sur le code en cours ; au 5ᵉ, il est invalidé. Sans ça, 10 essais par minute
 * pendant les 10 minutes de validité, renouvelables à chaque nouveau code, finissaient par deviner 6 chiffres.
 */
export async function verifyOtp(email: string, token: string): Promise<boolean> {
  const result = await query(
    `UPDATE otp_tokens
     SET used = TRUE
     WHERE email = $1
       AND token = $2
       AND used = FALSE
       AND attempts < $3
       AND expires_at > NOW()
     RETURNING id`,
    [email, hashCode(token.trim()), OTP_MAX_ATTEMPTS]
  )
  if ((result.rowCount ?? 0) > 0) return true

  await query(
    `UPDATE otp_tokens
     SET attempts = attempts + 1, used = (attempts + 1 >= $2)
     WHERE email = $1 AND used = FALSE AND expires_at > NOW()`,
    [email, OTP_MAX_ATTEMPTS]
  )
  return false
}

/** Retourne l'utilisateur par email, ou null s'il n'existe pas. */
export async function getUserByEmail(email: string): Promise<LeksissUser | null> {
  const result = await query<LeksissUser>(
    `SELECT id, email, name, disabled FROM users WHERE email = $1`,
    [email]
  )
  return result.rowCount ? result.rows[0] : null
}

/** Retourne l'utilisateur existant ou le crée s'il n'existe pas encore. */
export async function getOrCreateUser(email: string): Promise<LeksissUser> {
  const existing = await getUserByEmail(email)
  if (existing) return existing

  // ON CONFLICT : deux demandes simultanées pour un nouvel email ne doivent pas s'écraser en erreur
  const result = await query<LeksissUser>(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email, name, disabled`,
    [email]
  )
  return result.rows[0]
}
