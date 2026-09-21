import 'server-only'
import { createProvider } from './config'
import type { AiConfig } from './config'
import type { AiMetricsResult, AiRunningModel, LlmModel } from './types'

async function getJson(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return {}
    return await res.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Version du serveur (Ollama : /api/version, vLLM & co : /version) — chaîne vide si inconnue. */
async function serverVersion(cfg: Pick<AiConfig, 'provider' | 'baseUrl' | 'apiKey'>): Promise<string> {
  if (cfg.provider === 'ollama') {
    const json = await getJson(`${cfg.baseUrl.replace(/\/+$/, '')}/api/version`)
    return typeof json.version === 'string' ? json.version : ''
  }
  try {
    const origin = new URL(cfg.baseUrl).origin
    const json = await getJson(`${origin}/version`, cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {})
    return typeof json.version === 'string' ? json.version : ''
  } catch {
    return ''
  }
}

/** Modèles en mémoire (Ollama uniquement : /api/ps). */
async function runningModels(cfg: Pick<AiConfig, 'provider' | 'baseUrl'>): Promise<AiRunningModel[]> {
  if (cfg.provider !== 'ollama') return []
  const json = await getJson(`${cfg.baseUrl.replace(/\/+$/, '')}/api/ps`) as { models?: Record<string, unknown>[] }
  return (json.models ?? []).map(m => ({
    name:      String(m.name ?? ''),
    sizeVram:  Number(m.size_vram ?? 0),
    size:      Number(m.size ?? 0),
    expiresAt: String(m.expires_at ?? ''),
  }))
}

/** Interroge le serveur IA. Lève une erreur s'il est injoignable. */
export async function fetchAiMetrics(cfg: AiConfig): Promise<AiMetricsResult> {
  const provider = createProvider(cfg)
  const start = Date.now()
  const models: LlmModel[] = await provider.listModels(AbortSignal.timeout(5000))
  const latencyMs = Date.now() - start

  const [version, running] = await Promise.all([serverVersion(cfg), runningModels(cfg)])
  const configuredModels = [...new Set([cfg.translationModel, cfg.ocrModel, cfg.rewriteModel].filter(Boolean))]

  return {
    provider:     provider.id,
    capabilities: provider.capabilities,
    version,
    latencyMs,
    models,
    running,
    configuredModels,
  }
}

/** « qwen2.5 » et « qwen2.5:latest » désignent le même modèle Ollama. */
export function sameModelName(provider: AiConfig['provider'], a: string, b: string): boolean {
  if (provider !== 'ollama') return a.trim() === b.trim()
  const norm = (n: string) => (n.includes(':') ? n : `${n}:latest`).trim()
  return norm(a) === norm(b)
}
