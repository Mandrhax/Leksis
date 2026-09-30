import 'server-only'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// promisify(crypto.scrypt) only exposes the 3-arg overload (no cost options) via its typed `promisify.custom`
// signature — wrapped by hand here so N/r/p can be passed through.
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

// N/r/p écrits dans chaque hash (voir ci-dessous) : on peut durcir ces paramètres plus tard sans invalider
// les mots de passe déjà enregistrés, chacun garde les siens.
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

/**
 * Hash un mot de passe en "scrypt:N:r:p:selHex:hashHex" — format auto-descriptif comme celui de crypto.ts
 * ("iv:tag:cipher"). node:crypto uniquement (scrypt), pas de nouvelle dépendance.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('hex')}:${hash.toString('hex')}`
}

/** Mot de passe aléatoire fort (20 caractères, base64url — 15 octets, pile sans padding). Pour un reset admin. */
export function generateRandomPassword(): string {
  return randomBytes(15).toString('base64url')
}

/** Vérifie un mot de passe contre un hash produit par hashPassword(). Ne lève jamais sur un format invalide. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts
  const N = Number(nStr), r = Number(rStr), p = Number(pStr)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = await scrypt(password, salt, expected.length, { N, r, p })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
