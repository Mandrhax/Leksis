// Message à afficher pour une réponse d'erreur d'une API de l'espace de travail — module client.
// Les routes renvoient un `code` stable (+ valeurs utiles) ; le texte anglais `error` n'est jamais montré tel quel.

import type { Messages } from '@/locales/en'

type ErrorBody = { error?: unknown; code?: unknown; limit?: unknown; count?: unknown; pages?: unknown }

const n = (v: unknown) => (typeof v === 'number' ? String(v) : '?')

/** Texte traduit d'une erreur d'API, d'après son code (et son statut HTTP à défaut de code connu). */
export function apiErrorMessage(t: Messages, body: unknown, status: number): string {
  const e = (body && typeof body === 'object' ? body : {}) as ErrorBody
  const m = t.apiErrors
  switch (e.code) {
    case 'disabled':             return m.disabled
    case 'maintenance':          return m.maintenance
    case 'rate_limited':         return m.rateLimited
    case 'text_required':        return m.textRequired
    case 'text_too_long':        return m.textTooLong.replace('{0}', n(e.limit))
    case 'too_large':            return m.tooLarge.replace('{0}', n(e.limit))
    case 'unsupported_format':   return m.unsupportedFormat
    case 'page_limit':           return m.pageLimit.replace('{0}', n(e.pages)).replace('{1}', n(e.limit))
    case 'extraction_failed':    return m.extractionFailed
    case 'doc_too_long':         return m.docTooLong.replace('{0}', n(e.limit)).replace('{1}', n(e.count))
    case 'translation_failed':   return m.translationFailed
    case 'transcription_failed': return m.transcriptionFailed
    case 'same_language':        return t.textTab.sameLanguage
    case 'external_blocked':
    case 'unsupported_provider': return m.aiUnavailable
  }
  if (status === 401) return m.unauthorized
  if (status === 413) return m.tooLarge.replace('{0}', '?')
  if (status === 502 || status === 503 || status === 504) return m.aiUnavailable
  return m.generic.replace('{0}', String(status))
}

/** Réponse en échec, gardée telle quelle pour un code sans accès aux traductions (translate-scheduler.ts). */
export class ApiResponseError extends Error {
  constructor(public status: number, public body: unknown) {
    super((body as ErrorBody | null)?.error as string || `HTTP ${status}`)
    this.name = 'ApiResponseError'
  }

  static async from(res: Response): Promise<ApiResponseError> {
    return new ApiResponseError(res.status, await res.json().catch(() => null))
  }
}

/** Error localisée à partir d'une réponse HTTP en échec (corps JSON lu s'il y en a un). */
export async function apiError(t: Messages, res: Response): Promise<Error> {
  const body = await res.json().catch(() => null)
  return new Error(apiErrorMessage(t, body, res.status))
}
