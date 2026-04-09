import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY manquante ou invalide (64 caractères hex requis)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Chiffre une chaîne en AES-256-GCM.
 * Retourne "iv:authTag:ciphertext" encodé en hex.
 */
export function encrypt(plaintext: string): string {
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * Déchiffre une chaîne produite par encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key  = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Format de ciphertext invalide')
  const [ivHex, tagHex, encHex] = parts
  const iv       = Buffer.from(ivHex, 'hex')
  const tag      = Buffer.from(tagHex, 'hex')
  const enc      = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
