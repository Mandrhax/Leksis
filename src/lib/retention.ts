import 'server-only'
import { query } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { logAudit } from '@/lib/audit'
import { RETENTION_DEFAULTS } from '@/lib/settings-schema'

// Les journaux d'usage et d'audit grossissent sans fin : les entrées plus anciennes que la durée réglée dans
// Admin → Réglages → Général (0 = garder indéfiniment) sont supprimées automatiquement, par petits lots pour ne
// pas bloquer la base.

const BATCH_SIZE = 10_000
const MAX_BATCHES = 100 // borne par exécution (1 000 000 lignes) : le reste sera pris à la suivante

const FIRST_RUN_DELAY_MS = Number(process.env.LEKSIS_RETENTION_DELAY_SEC ?? 120) * 1000
const INTERVAL_MS = 6 * 60 * 60 * 1000

export interface RetentionResult {
  usage: number // lignes supprimées de usage_log
  audit: number // lignes supprimées de audit_log
}

async function purgeOlderThan(table: 'usage_log' | 'audit_log', days: number): Promise<number> {
  if (days <= 0) return 0
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const r = await query(
      `DELETE FROM ${table}
       WHERE ctid IN (SELECT ctid FROM ${table} WHERE created_at < NOW() - make_interval(days => $1) LIMIT ${BATCH_SIZE})`,
      [days],
    )
    const n = r.rowCount ?? 0
    total += n
    if (n < BATCH_SIZE) break
  }
  return total
}

/** Supprime les entrées expirées selon les réglages ; l'action est elle-même inscrite au journal d'audit. */
export async function purgeExpiredLogs(): Promise<RetentionResult> {
  const general = await getSetting<{ usageRetentionDays?: number; auditRetentionDays?: number }>('general')
  const usageDays = general.usageRetentionDays ?? RETENTION_DEFAULTS.usageRetentionDays
  const auditDays = general.auditRetentionDays ?? RETENTION_DEFAULTS.auditRetentionDays

  const result: RetentionResult = {
    usage: await purgeOlderThan('usage_log', usageDays),
    audit: await purgeOlderThan('audit_log', auditDays),
  }
  // Écrit après la suppression : la trace ne s'efface pas elle-même
  if (result.usage) await logAudit('system', 'system', 'AUTO_PURGE_USAGE', 'usage_log', { deleted: result.usage, retentionDays: usageDays })
  if (result.audit) await logAudit('system', 'system', 'AUTO_PURGE_AUDIT', 'audit_log', { deleted: result.audit, retentionDays: auditDays })
  return result
}

declare global {
  var _leksisRetentionTimer: ReturnType<typeof setInterval> | undefined
}

/** Lance le nettoyage peu après le démarrage du serveur, puis toutes les 6 h. Sans effet si déjà lancé. */
export function startRetentionSchedule(): void {
  if (globalThis._leksisRetentionTimer) return

  const run = () => {
    purgeExpiredLogs().then(
      r => { if (r.usage || r.audit) console.log(`[retention] deleted ${r.usage} usage and ${r.audit} audit entries`) },
      err => console.error('[retention] purge failed:', err instanceof Error ? err.message : err),
    )
  }
  const first = setTimeout(run, FIRST_RUN_DELAY_MS)
  const timer = setInterval(run, INTERVAL_MS)
  first.unref()
  timer.unref() // ne retient pas l'arrêt du processus
  globalThis._leksisRetentionTimer = timer
  console.log('[retention] scheduled')
}
