// État de santé public (/api/health) — la logique de synthèse est pure pour rester testable.

export type CheckState = 'ok' | 'down' | 'unconfigured'

export interface HealthReport {
  /** ok : tout répond · degraded : l'application sert mais le moteur IA ne répond pas · down : base injoignable */
  status: 'ok' | 'degraded' | 'down'
  checks: { database: CheckState; ai: CheckState }
}

/**
 * La base est indispensable (sans elle plus personne ne se connecte) ; le moteur IA ne l'est pas pour que
 * l'application réponde : il « dégrade » seulement. Un moteur non configuré n'est pas une panne.
 */
export function summarizeHealth(database: CheckState, ai: CheckState): HealthReport {
  const status = database !== 'ok' ? 'down' : ai === 'down' ? 'degraded' : 'ok'
  return { status, checks: { database, ai } }
}

/** 200 tant que l'application sert (ok / degraded), 503 si la base est injoignable. */
export function healthHttpStatus(report: HealthReport): number {
  return report.status === 'down' ? 503 : 200
}
