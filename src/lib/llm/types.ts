// Types partagés de la couche LLM. Aucun import serveur ici : ce fichier est
// importable (type-only) depuis les composants client.

export type AiProviderId = 'ollama' | 'openai'

/** Fenêtre de contexte demandée à Ollama (tokens) quand l'admin n'en a pas choisi. */
export const DEFAULT_NUM_CTX = 8192

export interface LlmRequest {
  prompt:  string
  system?: string
  /** Images en base64 (sans préfixe data:) — modèles vision uniquement */
  images?: string[]
  model:   string
  signal?: AbortSignal
}

export interface LlmModel {
  name:       string
  size:       number   // octets (0 si le serveur ne le dit pas)
  modifiedAt: string
}

/** Ce que le serveur sait faire au-delà de générer du texte (actions admin). */
export interface LlmCapabilities {
  pull:    boolean
  delete:  boolean
  warmup:  boolean
  unload:  boolean
  running: boolean
}

export interface LlmProvider {
  readonly id: AiProviderId
  readonly capabilities: LlmCapabilities
  /** Flux de texte brut UTF-8 (les tokens, sans enveloppe JSON/SSE). */
  stream(req: LlmRequest): ReadableStream<Uint8Array>
  /** Texte complet (routes qui attendent le résultat entier). */
  complete(req: LlmRequest): Promise<string>
  listModels(signal?: AbortSignal): Promise<LlmModel[]>
}

export interface AiRunningModel {
  name:      string
  sizeVram:  number
  size:      number
  expiresAt: string
}

/** Réponse de GET /api/admin/services/ai/metrics */
export interface AiMetricsResult {
  provider:         AiProviderId
  capabilities:     LlmCapabilities
  version:          string
  latencyMs:        number
  models:           LlmModel[]
  running:          AiRunningModel[]
  configuredModels: string[]
}

/** Réglage IA tel qu'il est renvoyé à l'admin (jamais la clé API). */
export interface AiPublicConfig {
  provider:         AiProviderId
  baseUrl:          string
  translationModel: string
  ocrModel:         string
  rewriteModel:     string
  sameModelForAll:  boolean
  allowExternal:    boolean
  hasApiKey:        boolean
  /** Contexte Ollama en tokens (ignoré par les API OpenAI-compatibles) */
  numCtx:           number
}

export const NO_CAPABILITIES: LlmCapabilities = {
  pull: false, delete: false, warmup: false, unload: false, running: false,
}
