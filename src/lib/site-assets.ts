import 'server-only'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// Logo et image de fond du site : stockés dans UPLOAD_DIR (volume Docker) et servis par /api/site-assets/[filename].
// Le format est déterminé par le CONTENU du fichier (octets magiques), jamais par le type MIME ou le nom envoyés
// par le client. Le SVG est refusé : c'est du code (scripts) servi depuis l'origine de l'application.

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'ico'

export interface AssetKind {
  slug:     'site-logo' | 'site-bg'
  maxBytes: number
  formats:  readonly ImageFormat[]
}

export const LOGO: AssetKind       = { slug: 'site-logo', maxBytes: 2 * 1024 * 1024, formats: ['png', 'jpg', 'webp', 'ico'] }
export const BACKGROUND: AssetKind = { slug: 'site-bg',   maxBytes: 5 * 1024 * 1024, formats: ['png', 'jpg', 'webp'] }

// Extensions que ce module peut avoir écrites (svg : logos enregistrés avant que le SVG soit refusé)
const KNOWN_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'ico', 'svg']

export function uploadsDir(): string {
  return process.env.UPLOAD_DIR || '/tmp/uploads'
}

/** Format d'image d'après les premiers octets, ou null si ce n'est pas un PNG / JPEG / WebP / ICO. */
export function detectImageFormat(buf: Buffer): ImageFormat | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'ico'
  return null
}

export type AssetCheck = { ok: true; format: ImageFormat } | { ok: false; error: 'too_large' | 'unsupported_format' }

/** Contrôle taille + format réel d'un fichier avant écriture. */
export function checkAsset(kind: AssetKind, buf: Buffer): AssetCheck {
  if (buf.length > kind.maxBytes) return { ok: false, error: 'too_large' }
  const format = detectImageFormat(buf)
  if (!format || !kind.formats.includes(format)) return { ok: false, error: 'unsupported_format' }
  return { ok: true, format }
}

/** Supprime toutes les variantes (extensions) d'un asset. */
export async function removeAsset(kind: AssetKind): Promise<void> {
  const dir = uploadsDir()
  await Promise.all(KNOWN_EXTS.map(ext => unlink(join(/*turbopackIgnore: true*/ dir, `${kind.slug}.${ext}`)).catch(() => {})))
}

/** Remplace l'asset par ce fichier (déjà contrôlé par checkAsset) et renvoie son URL publique. */
export async function saveAsset(kind: AssetKind, buf: Buffer, format: ImageFormat): Promise<string> {
  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  await removeAsset(kind)
  const filename = `${kind.slug}.${format}`
  await writeFile(join(/*turbopackIgnore: true*/ dir, filename), buf)
  return `/api/site-assets/${filename}?v=${Date.now()}`
}

/** Chemin disque d'une URL /api/site-assets/<fichier>[?v=…], ou null pour toute autre URL. */
export function assetPathFromUrl(url: string): string | null {
  const match = url.split('?')[0].match(/^\/api\/site-assets\/(.+)$/)
  return match ? join(/*turbopackIgnore: true*/ uploadsDir(), basename(match[1])) : null
}
