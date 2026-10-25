import { describe, expect, it } from 'vitest'
import { messages as en } from '@/locales/en'
import { messages as fr } from '@/locales/fr'
import { apiErrorMessage, ApiResponseError } from '@/lib/api-error'

describe('apiErrorMessage', () => {
  it('translates a known code with its values, never shows the English server text', () => {
    const body = { error: 'Document exceeds the 12000 character limit (15000 chars).', code: 'doc_too_long', limit: 12000, count: 15000 }
    expect(apiErrorMessage(fr, body, 400)).toBe('Le document compte 15000 caractères ; la limite est de 12000.')
    expect(apiErrorMessage(en, { code: 'page_limit', pages: 25, limit: 20 }, 400)).toBe('This scanned PDF has 25 pages; the limit is 20.')
  })
  it('falls back on the HTTP status, then on a generic message with the status', () => {
    expect(apiErrorMessage(en, null, 401)).toBe(en.apiErrors.unauthorized)
    expect(apiErrorMessage(en, { error: 'boom' }, 502)).toBe(en.apiErrors.aiUnavailable)
    expect(apiErrorMessage(fr, { error: 'Invalid tone.' }, 400)).toBe('Une erreur est survenue (erreur 400). Veuillez réessayer.')
  })
  it('keeps the response of a failed request for later translation', () => {
    const err = new ApiResponseError(429, { error: 'Too many requests.', code: 'rate_limited' })
    expect(err.message).toBe('Too many requests.')
    expect(apiErrorMessage(fr, err.body, err.status)).toBe(fr.apiErrors.rateLimited)
  })
})
