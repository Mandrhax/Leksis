import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { query } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// GET /api/user/glossary-prefs
// Returns all glossaries with enabled state for the current user
// Absence of a row in user_glossary_prefs means enabled = true (default)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const result = await query(
    `SELECT g.id, g.name, g.description,
            COALESCE(ugp.enabled, TRUE) AS enabled
     FROM glossaries g
     LEFT JOIN user_glossary_prefs ugp
       ON ugp.glossary_id = g.id AND ugp.user_id = $1
     ORDER BY g.created_at ASC`,
    [userId],
  )

  const prefs = result.rows.map((r) => ({
    glossaryId: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
  }))

  return NextResponse.json(prefs)
}

const patchSchema = z.object({
  glossaryId: z.number().int().positive(),
  enabled: z.boolean(),
})

// PATCH /api/user/glossary-prefs
// Toggle a glossary on/off for the current user
// Convention: only store rows when enabled = false
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { glossaryId, enabled } = parsed.data

  if (enabled) {
    // User re-enabled: remove the row (default = enabled)
    await query(
      'DELETE FROM user_glossary_prefs WHERE user_id = $1 AND glossary_id = $2',
      [userId, glossaryId],
    )
  } else {
    // User disabled: upsert with enabled = false
    await query(
      `INSERT INTO user_glossary_prefs (user_id, glossary_id, enabled)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (user_id, glossary_id) DO UPDATE SET enabled = FALSE`,
      [userId, glossaryId],
    )
  }

  return NextResponse.json({ ok: true })
}
