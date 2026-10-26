import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { glossaryChanged } from '@/lib/glossary'

export const dynamic = 'force-dynamic'

// GET /api/admin/glossary — list all glossaries with entry count
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const result = await query(
    `SELECT g.id, g.name, g.description, g.group_name, g.created_at,
            COUNT(ge.id)::int AS entry_count
     FROM glossaries g
     LEFT JOIN glossary_entries ge ON ge.glossary_id = g.id
     GROUP BY g.id
     ORDER BY g.created_at ASC`,
  )

  const glossaries = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    groupName: r.group_name,
    entryCount: r.entry_count,
    createdAt: r.created_at,
  }))

  return NextResponse.json(glossaries)
}

// Une chaîne vide équivaut à "pas de groupe" (le formulaire envoie '' quand le champ est laissé vide)
const groupNameSchema = z.string().max(100).optional().transform((v) => (v?.trim() ? v.trim() : null))

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  groupName: groupNameSchema,
})

// POST /api/admin/glossary — create a new glossary
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { name, description, groupName } = parsed.data

  const result = await query(
    `INSERT INTO glossaries (name, description, group_name) VALUES ($1, $2, $3)
     RETURNING id, name, description, group_name, created_at`,
    [name, description ?? null, groupName],
  )

  const g = result.rows[0]
  glossaryChanged()
  await logAudit(session.user.id, session.user.email!, 'CREATE_GLOSSARY', `glossary:${g.id}`, { name: g.name })
  return NextResponse.json({
    id: g.id,
    name: g.name,
    description: g.description,
    groupName: g.group_name,
    entryCount: 0,
    createdAt: g.created_at,
  })
}
