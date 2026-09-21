// Point d'entrée unique des appels IA (server-only).
// Les routes n'importent que ce module : elles ignorent quel fournisseur est actif.
export { getAi, getAiOrError, getAiConfig, getAiPublicConfig, createProvider, assertAiAllowed, getOllamaAdminBase, aiErrorResponse, AiConfigError } from './config'
export type { AiConfig } from './config'
export { fetchAiMetrics, sameModelName } from './service'
export { isExternalUrl } from './network'
export type { LlmProvider, LlmRequest, LlmModel, LlmCapabilities, AiProviderId, AiMetricsResult, AiPublicConfig } from './types'
