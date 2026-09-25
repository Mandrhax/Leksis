import 'server-only'
import { getSetting } from '@/lib/settings'
import { decrypt } from '@/lib/crypto'
import { isExternalUrl } from './network'
import { createOllamaProvider } from './ollama-provider'
import { createOpenAiProvider } from './openai-provider'
import type { AiProviderId, AiPublicConfig, LlmProvider } from './types'

export interface AiConfig {
  provider:         AiProviderId
  baseUrl:          string
  /** Clé API en clair — serveur uniquement, jamais renvoyée au client */
  apiKey:           string
  translationModel: string
  ocrModel:         string
  rewriteModel:     string
  /** Autorise un serveur IA hors réseau privé (les textes quittent le réseau) */
  allowExternal:    boolean
}

export class AiConfigError extends Error {
  constructor(public code: 'external_blocked' | 'unsupported_provider', message: string) {
    super(message)
    this.name = 'AiConfigError'
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

async function readRaw(): Promise<{ raw: Record<string, unknown>; fromLegacy: boolean }> {
  try {
    const ai = await getSetting<Record<string, unknown>>('ai_config')
    if (Object.keys(ai).length > 0) return { raw: ai, fromLegacy: false }
    // Installations d'avant le multi-fournisseur : ancienne clé ollama_config
    const legacy = await getSetting<Record<string, unknown>>('ollama_config')
    return { raw: legacy, fromLegacy: true }
  } catch {
    return { raw: {}, fromLegacy: false } // base indisponible : variables d'environnement seules
  }
}

/**
 * Configuration IA effective : ai_config (base) → ollama_config (ancienne clé)
 * → variables d'environnement. À appeler côté serveur uniquement.
 */
export async function getAiConfig(): Promise<AiConfig> {
  const { raw, fromLegacy } = await readRaw()
  // Sans provider explicite en base (ou avec l'ancienne clé ollama_config), la variable d'environnement décide
  // "vllm" : identifiant utilisé par les versions 1.5.0-beta.*, ramené au fournisseur générique
  const normalize = (p: string) => (p === 'vllm' ? 'openai' : p)
  const envProvider: AiProviderId = normalize(process.env.AI_PROVIDER ?? '') === 'openai' ? 'openai' : 'ollama'
  const explicit = fromLegacy ? '' : normalize(str(raw.provider))
  const effectiveProvider: AiProviderId =
    explicit === 'openai' ? 'openai' : explicit === 'ollama' ? 'ollama' : envProvider

  const defaultUrl = effectiveProvider === 'openai' ? 'http://localhost:8000/v1' : 'http://localhost:11434'
  const baseUrl = str(raw.baseUrl) || process.env.AI_BASE_URL || process.env.OLLAMA_BASE_URL || defaultUrl

  let apiKey = ''
  const enc = str(raw.apiKeyEnc)
  if (enc) {
    try { apiKey = decrypt(enc) } catch { apiKey = '' }
  }
  if (!apiKey) apiKey = process.env.AI_API_KEY ?? ''

  return {
    provider:         effectiveProvider,
    baseUrl,
    apiKey,
    // "model" : ancienne clé de compatibilité
    translationModel: str(raw.translationModel) || str(raw.model) || process.env.OLLAMA_MODEL         || 'translategemma:27b',
    ocrModel:         str(raw.ocrModel)         || process.env.OLLAMA_OCR_MODEL                        || 'maternion/LightOnOCR-2:latest',
    rewriteModel:     str(raw.rewriteModel)     || process.env.OLLAMA_REWRITE_MODEL                    || 'qwen2.5:14b',
    allowExternal:    raw.allowExternal === true,
  }
}

/** Configuration renvoyée à l'admin (page Services → AI) — sans la clé API. */
export async function getAiPublicConfig(): Promise<AiPublicConfig> {
  const { raw } = await readRaw()
  const cfg = await getAiConfig()
  return {
    provider:         cfg.provider,
    baseUrl:          cfg.baseUrl,
    translationModel: cfg.translationModel,
    ocrModel:         cfg.ocrModel,
    rewriteModel:     cfg.rewriteModel,
    sameModelForAll:  raw.sameModelForAll === true,
    allowExternal:    cfg.allowExternal,
    hasApiKey:        cfg.apiKey !== '',
  }
}

export function createProvider(cfg: Pick<AiConfig, 'provider' | 'baseUrl' | 'apiKey'>): LlmProvider {
  return cfg.provider === 'openai'
    ? createOpenAiProvider(cfg.baseUrl, cfg.apiKey)
    : createOllamaProvider(cfg.baseUrl)
}

/** Refuse un serveur IA externe tant que l'admin ne l'a pas autorisé. */
export async function assertAiAllowed(cfg: Pick<AiConfig, 'baseUrl' | 'allowExternal'>): Promise<void> {
  if (!cfg.allowExternal && await isExternalUrl(cfg.baseUrl)) {
    throw new AiConfigError(
      'external_blocked',
      'The configured AI server is outside the private network and external providers are not allowed (Admin → Services → AI).',
    )
  }
}

/** Configuration + fournisseur prêt à l'emploi. Lève AiConfigError si le serveur est bloqué. */
export async function getAi(): Promise<{ cfg: AiConfig; provider: LlmProvider }> {
  const cfg = await getAiConfig()
  await assertAiAllowed(cfg)
  return { cfg, provider: createProvider(cfg) }
}

/**
 * Variante pour les routes : renvoie soit l'IA prête à l'emploi, soit la réponse HTTP d'erreur à retourner.
 *   const r = await getAiOrError(); if (r.error) return r.error; const { cfg, provider } = r.ai
 */
export async function getAiOrError(): Promise<
  { ai: { cfg: AiConfig; provider: LlmProvider }; error?: undefined } | { ai?: undefined; error: Response }
> {
  try {
    return { ai: await getAi() }
  } catch (err) {
    const response = aiErrorResponse(err)
    if (response) return { error: response }
    throw err
  }
}

/** Base URL d'un serveur Ollama pour les actions admin (pull, delete, warmup, unload). */
export async function getOllamaAdminBase(): Promise<string> {
  const cfg = await getAiConfig()
  if (cfg.provider !== 'ollama') {
    throw new AiConfigError('unsupported_provider', 'This action is only available with an Ollama server.')
  }
  await assertAiAllowed(cfg)
  return cfg.baseUrl.replace(/\/+$/, '')
}

/** Traduit une erreur de configuration en réponse HTTP ; null pour les autres erreurs. */
export function aiErrorResponse(err: unknown): Response | null {
  if (err instanceof AiConfigError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.code === 'external_blocked' ? 403 : 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}
