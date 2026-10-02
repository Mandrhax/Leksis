import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAiOrError } from '@/lib/llm'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { healthHttpStatus, summarizeHealth, type CheckState } from '@/lib/health'

export const dynamic = 'force-dynamic'

const HEALTH_PER_IP_PER_MIN = 60
const CHECK_TIMEOUT_MS = 3000

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS))])
}

async function checkDatabase(): Promise<CheckState> {
  try {
    await withTimeout(query('SELECT 1'))
    return 'ok'
  } catch {
    return 'down'
  }
}

async function checkAi(): Promise<CheckState> {
  try {
    const r = await getAiOrError()
    if (r.error) return 'down' // serveur externe non autorisé : l'IA ne peut pas servir
    if (!r.ai.cfg.translationModel) return 'unconfigured'
    await withTimeout(r.ai.provider.listModels(AbortSignal.timeout(CHECK_TIMEOUT_MS)))
    return 'ok'
  } catch {
    return 'down'
  }
}

/**
 * Supervision (Uptime Kuma, Zabbix, sonde de load balancer…) : publique, sans session, et volontairement
 * sobre — aucune version, adresse ni message d'erreur, seulement des états. 200 = l'application sert,
 * 503 = base injoignable.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const limit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`health-ip:${ip}`, HEALTH_PER_IP_PER_MIN)
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec)

  const [database, ai] = await Promise.all([checkDatabase(), checkAi()])
  const report = summarizeHealth(database, ai)
  return NextResponse.json(report, { status: healthHttpStatus(report), headers: { 'Cache-Control': 'no-store' } })
}
