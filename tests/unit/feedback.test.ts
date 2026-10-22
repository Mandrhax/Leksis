import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// `@/lib/db` backed by an in-memory PostgreSQL loaded with the real schema
const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) =>
    pg.db.transaction(async tx => fn(async (text: string, params?: unknown[]) => {
      const r = await tx.query(text, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    })),
}))

import {
  checkFeedbackImage, countByStatus, createFeedback, deleteFeedback, getAttachment, getFeedback, listFeedback, updateFeedback,
} from '@/lib/feedback'
import { FEEDBACK_IMAGE_MAX_BYTES, FeedbackSubmitSchema, FeedbackUpdateSchema } from '@/lib/feedback-schema'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest of a png')])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg body')])

async function addUser(email: string): Promise<string> {
  const r = await pg.db.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
  return r.rows[0].id
}

async function send(userId: string, email: string, over: Partial<Parameters<typeof createFeedback>[0]> = {}) {
  return createFeedback({ userId, userEmail: email, category: 'problem', message: 'It broke', context: null, images: [], ...over })
}

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

describe('checkFeedbackImage', () => {
  it('accepts PNG, JPEG and WebP by their content, not their name', () => {
    expect(checkFeedbackImage(PNG)).toEqual({ ok: true, mime: 'image/png' })
    expect(checkFeedbackImage(JPG)).toEqual({ ok: true, mime: 'image/jpeg' })
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
    expect(checkFeedbackImage(webp)).toEqual({ ok: true, mime: 'image/webp' })
  })

  it('refuses SVG (code), ICO, other files, empty and oversized images', () => {
    expect(checkFeedbackImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toEqual({ ok: false, error: 'unsupported_format' })
    expect(checkFeedbackImage(Buffer.from([0, 0, 1, 0, 1, 0]))).toEqual({ ok: false, error: 'unsupported_format' })
    expect(checkFeedbackImage(Buffer.from('%PDF-1.7'))).toEqual({ ok: false, error: 'unsupported_format' })
    expect(checkFeedbackImage(Buffer.alloc(0))).toEqual({ ok: false, error: 'too_large' })
    const big = Buffer.concat([PNG, Buffer.alloc(FEEDBACK_IMAGE_MAX_BYTES)])
    expect(checkFeedbackImage(big)).toEqual({ ok: false, error: 'too_large' })
  })
})

describe('FeedbackSubmitSchema', () => {
  it('accepts the four categories, including translation', () => {
    for (const category of ['problem', 'improvement', 'translation', 'other']) {
      expect(FeedbackSubmitSchema.safeParse({ category, message: 'x', includeContext: false }).success).toBe(true)
    }
  })

  it('refuses an unknown category, a blank or too long message and an unknown tab', () => {
    expect(FeedbackSubmitSchema.safeParse({ category: 'spam', message: 'x', includeContext: false }).success).toBe(false)
    expect(FeedbackSubmitSchema.safeParse({ category: 'other', message: '   ', includeContext: false }).success).toBe(false)
    expect(FeedbackSubmitSchema.safeParse({ category: 'other', message: 'x'.repeat(5001), includeContext: false }).success).toBe(false)
    expect(FeedbackSubmitSchema.safeParse({ category: 'other', message: 'x', includeContext: true, tab: 'admin' }).success).toBe(false)
  })

  it('needs something to update', () => {
    expect(FeedbackUpdateSchema.safeParse({}).success).toBe(false)
    expect(FeedbackUpdateSchema.safeParse({ status: 'done' }).success).toBe(true)
    expect(FeedbackUpdateSchema.safeParse({ status: 'read' }).success).toBe(false)
  })
})

describe('feedback inbox', () => {
  it('stores the message with its images in order and serves them back byte for byte', async () => {
    const bob = await addUser('bob@x.ch')
    const id = await send(bob, 'bob@x.ch', {
      category: 'translation',
      message: 'Wrong term for "contract"',
      context: { tab: 'text', uiLocale: 'fr', appVersion: '1.9.0' },
      images: [{ mime: 'image/png', data: PNG }, { mime: 'image/jpeg', data: JPG }],
    })
    const item = await getFeedback(id)
    expect(item).toMatchObject({
      user_email: 'bob@x.ch', category: 'translation', status: 'new', admin_note: '', user_exists: true,
      context: { tab: 'text', uiLocale: 'fr', appVersion: '1.9.0' }, attachment_count: 2,
    })
    expect(item!.attachments.map(a => a.mime)).toEqual(['image/png', 'image/jpeg'])
    const att = await getAttachment(item!.attachments[1].id)
    expect(att!.mime).toBe('image/jpeg')
    expect(Buffer.compare(att!.data, JPG)).toBe(0)
  })

  it('refuses more than 5 images without writing anything', async () => {
    const bob = await addUser('bob@x.ch')
    const images = Array.from({ length: 6 }, () => ({ mime: 'image/png', data: PNG }))
    await expect(send(bob, 'bob@x.ch', { images })).rejects.toThrow()
    expect((await listFeedback()).total).toBe(0)
  })

  it('filters by status and category, newest first, and counts each status', async () => {
    const bob = await addUser('bob@x.ch')
    const a = await send(bob, 'bob@x.ch', { category: 'problem' })
    const b = await send(bob, 'bob@x.ch', { category: 'improvement' })
    const c = await send(bob, 'bob@x.ch', { category: 'translation' })
    await pg.db.query("UPDATE feedback SET created_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [a])
    await updateFeedback(b, { status: 'done' })
    await updateFeedback(c, { status: 'in_progress' })

    expect((await listFeedback({ status: 'open' })).rows.map(r => r.id)).toEqual([c, a])
    expect((await listFeedback({ status: 'done' })).rows.map(r => r.id)).toEqual([b])
    expect((await listFeedback({ status: 'all', category: 'translation' })).rows.map(r => r.id)).toEqual([c])
    expect(await countByStatus()).toEqual({ new: 1, in_progress: 1, done: 1, archived: 0 })
    const page2 = await listFeedback({ status: 'all', page: 2, pageSize: 2 })
    expect(page2.total).toBe(3)
    expect(page2.rows.map(r => r.id)).toEqual([a])
  })

  it('returns the previous state on update, for the audit log', async () => {
    const bob = await addUser('bob@x.ch')
    const id = await send(bob, 'bob@x.ch')
    expect(await updateFeedback(id, { status: 'in_progress', adminNote: 'Looking into it' })).toEqual({
      before: { status: 'new', admin_note: '' },
      after: { status: 'in_progress', admin_note: 'Looking into it' },
    })
    expect(await updateFeedback(id, { status: 'done' })).toMatchObject({ after: { status: 'done', admin_note: 'Looking into it' } })
    expect(await updateFeedback('missing', { status: 'done' })).toBeNull()
  })

  it('keeps the message and the email of a deleted account', async () => {
    const bob = await addUser('bob@x.ch')
    const id = await send(bob, 'bob@x.ch')
    await pg.db.query('DELETE FROM users WHERE id = $1', [bob])
    expect(await getFeedback(id)).toMatchObject({ user_email: 'bob@x.ch', user_exists: false })
  })

  it('deletes the message together with its images', async () => {
    const bob = await addUser('bob@x.ch')
    const id = await send(bob, 'bob@x.ch', { images: [{ mime: 'image/png', data: PNG }] })
    expect(await deleteFeedback(id)).toEqual({ user_email: 'bob@x.ch', category: 'problem' })
    expect(await getFeedback(id)).toBeNull()
    expect((await pg.db.query('SELECT 1 FROM feedback_attachments')).rows).toHaveLength(0)
    expect(await deleteFeedback(id)).toBeNull()
  })
})
