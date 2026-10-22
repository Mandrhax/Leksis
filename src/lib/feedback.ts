import 'server-only'
import { query, withTransaction } from '@/lib/db'
import { detectImageFormat } from '@/lib/site-assets'
import {
  FEEDBACK_IMAGE_MAX_BYTES, FEEDBACK_MAX_IMAGES, FEEDBACK_STATUSES,
  type FeedbackCategory, type FeedbackContext, type FeedbackStatus,
} from '@/lib/feedback-schema'

// Messages « Signaler un problème ou suggérer une amélioration » : écrits par les utilisateurs, lus et classés par
// les administrateurs (Admin → Retours). Les images sont en base (bytea), jamais dans le volume des uploads, servi
// sans authentification.

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const

export type ImageCheck = { ok: true; mime: string } | { ok: false; error: 'too_large' | 'unsupported_format' }

/** Taille + format réel (octets magiques) d'une image jointe. PNG, JPEG et WebP seulement : ni SVG, ni ICO. */
export function checkFeedbackImage(buf: Buffer): ImageCheck {
  if (buf.length === 0 || buf.length > FEEDBACK_IMAGE_MAX_BYTES) return { ok: false, error: 'too_large' }
  const format = detectImageFormat(buf)
  if (!format || !(format in IMAGE_MIME)) return { ok: false, error: 'unsupported_format' }
  return { ok: true, mime: IMAGE_MIME[format as keyof typeof IMAGE_MIME] }
}

export interface NewFeedback {
  userId:    string
  userEmail: string
  category:  FeedbackCategory
  message:   string
  context:   FeedbackContext | null
  images:    { mime: string; data: Buffer }[]
}

/** Enregistre le message et ses images en une seule transaction. */
export async function createFeedback(f: NewFeedback): Promise<string> {
  if (f.images.length > FEEDBACK_MAX_IMAGES) throw new Error('Too many images')
  return withTransaction(async q => {
    const r = await q<{ id: string }>(
      `INSERT INTO feedback (user_id, user_email, category, message, context)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [f.userId, f.userEmail, f.category, f.message, f.context ? JSON.stringify(f.context) : null],
    )
    const id = r.rows[0].id
    for (const [i, img] of f.images.entries()) {
      await q(
        'INSERT INTO feedback_attachments (feedback_id, position, mime, size, data) VALUES ($1, $2, $3, $4, $5)',
        [id, i, img.mime, img.data.length, img.data],
      )
    }
    return id
  })
}

export interface FeedbackRow {
  id:               string
  user_email:       string
  category:         FeedbackCategory
  message:          string
  status:           FeedbackStatus
  created_at:       string
  attachment_count: number
}

export interface FeedbackDetail extends FeedbackRow {
  context:     FeedbackContext | null
  admin_note:  string
  updated_at:  string
  /** false si le compte de l'auteur a été supprimé depuis */
  user_exists: boolean
  attachments: { id: string; mime: string; size: number }[]
}

export type StatusCounts = Record<FeedbackStatus, number>

export interface FeedbackListOptions {
  /** 'open' = nouveaux + en cours ; 'all' ou absent = tous */
  status?:   FeedbackStatus | 'open' | 'all'
  category?: FeedbackCategory
  page?:     number
  pageSize?: number
}

/** Liste paginée, du plus récent au plus ancien, avec le nombre de messages par statut (onglets du filtre). */
export async function listFeedback(opts: FeedbackListOptions = {}): Promise<{ rows: FeedbackRow[]; total: number; counts: StatusCounts }> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100)
  const page = Math.max(opts.page ?? 1, 1)
  const where: string[] = []
  const params: unknown[] = []

  if (opts.status === 'open') where.push(`f.status IN ('new', 'in_progress')`)
  else if (opts.status && opts.status !== 'all') { params.push(opts.status); where.push(`f.status = $${params.length}`) }
  if (opts.category) { params.push(opts.category); where.push(`f.category = $${params.length}`) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows, total, counts] = await Promise.all([
    query<FeedbackRow>(
      `SELECT f.id, f.user_email, f.category, f.message, f.status, f.created_at,
              (SELECT COUNT(*)::int FROM feedback_attachments a WHERE a.feedback_id = f.id) AS attachment_count
       FROM feedback f ${whereSql}
       ORDER BY f.created_at DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM feedback f ${whereSql}`, params),
    countByStatus(),
  ])
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts }
}

export async function countByStatus(): Promise<StatusCounts> {
  const r = await query<{ status: FeedbackStatus; n: number }>('SELECT status, COUNT(*)::int AS n FROM feedback GROUP BY status')
  const counts = Object.fromEntries(FEEDBACK_STATUSES.map(s => [s, 0])) as StatusCounts
  for (const row of r.rows) counts[row.status] = Number(row.n)
  return counts
}

export async function getFeedback(id: string): Promise<FeedbackDetail | null> {
  const r = await query<Omit<FeedbackDetail, 'attachments' | 'attachment_count'>>(
    `SELECT f.id, f.user_email, f.category, f.message, f.status, f.context, f.admin_note, f.created_at, f.updated_at,
            (u.id IS NOT NULL) AS user_exists
     FROM feedback f LEFT JOIN users u ON u.id = f.user_id
     WHERE f.id = $1`,
    [id],
  )
  if (!r.rows[0]) return null
  const att = await query<{ id: string; mime: string; size: number }>(
    'SELECT id, mime, size FROM feedback_attachments WHERE feedback_id = $1 ORDER BY position',
    [id],
  )
  return { ...r.rows[0], attachments: att.rows, attachment_count: att.rows.length }
}

/** Change le statut et/ou la note interne. Renvoie l'état d'avant (pour l'audit), ou null si le message n'existe pas. */
export async function updateFeedback(
  id: string,
  change: { status?: FeedbackStatus; adminNote?: string },
): Promise<{ before: { status: FeedbackStatus; admin_note: string }; after: { status: FeedbackStatus; admin_note: string } } | null> {
  return withTransaction(async q => {
    const cur = await q<{ status: FeedbackStatus; admin_note: string }>(
      'SELECT status, admin_note FROM feedback WHERE id = $1 FOR UPDATE', [id])
    const before = cur.rows[0]
    if (!before) return null
    const after = { status: change.status ?? before.status, admin_note: change.adminNote ?? before.admin_note }
    await q('UPDATE feedback SET status = $2, admin_note = $3, updated_at = NOW() WHERE id = $1', [id, after.status, after.admin_note])
    return { before, after }
  })
}

/** Supprime le message et ses images. Renvoie ce qu'il faut garder dans l'audit, ou null s'il n'existe pas. */
export async function deleteFeedback(id: string): Promise<{ user_email: string; category: FeedbackCategory } | null> {
  const r = await query<{ user_email: string; category: FeedbackCategory }>(
    'DELETE FROM feedback WHERE id = $1 RETURNING user_email, category', [id])
  return r.rows[0] ?? null
}

export async function getAttachment(id: string): Promise<{ mime: string; data: Buffer } | null> {
  const r = await query<{ mime: string; data: Buffer | Uint8Array }>('SELECT mime, data FROM feedback_attachments WHERE id = $1', [id])
  const row = r.rows[0]
  return row ? { mime: row.mime, data: Buffer.from(row.data) } : null
}
