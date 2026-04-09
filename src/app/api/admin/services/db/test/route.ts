import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { decrypt } from '@/lib/crypto'
import pg from 'pg'

const { Client } = pg

const Schema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(5432),
  database:    z.string().min(1),
  user:        z.string().min(1),
  // Soit un mot de passe en clair (si modifié), soit un ciphertext (si non modifié)
  password:    z.string().optional(),
  passwordEnc: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { host, port, database, user, password, passwordEnc } = parsed.data

  // Résoudre le mot de passe : priorité au mot de passe en clair (nouvelle valeur)
  let resolvedPassword = ''
  if (password) {
    resolvedPassword = password
  } else if (passwordEnc) {
    try {
      resolvedPassword = decrypt(passwordEnc)
    } catch {
      return NextResponse.json({ ok: false, message: 'Impossible de déchiffrer le mot de passe stocké' })
    }
  }

  const start = Date.now()
  const client = new Client({ host, port, database, user, password: resolvedPassword, connectionTimeoutMillis: 5000 })

  try {
    await client.connect()
    await client.query('SELECT 1')
    const latencyMs = Date.now() - start
    await client.end()

    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:db', { ok: true, latencyMs })

    return NextResponse.json({ ok: true, latencyMs, message: `Connexion réussie en ${latencyMs}ms` })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    try { await client.end() } catch { /* ignore */ }
    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:db', { ok: false, message })
    return NextResponse.json({ ok: false, message: `Connexion échouée : ${message}` })
  }
}
