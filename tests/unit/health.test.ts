import { describe, expect, it } from 'vitest'
import { healthHttpStatus, summarizeHealth } from '@/lib/health'

describe('summarizeHealth', () => {
  it('is ok when the database and the AI engine answer', () => {
    expect(summarizeHealth('ok', 'ok')).toEqual({ status: 'ok', checks: { database: 'ok', ai: 'ok' } })
  })
  it('is degraded, not down, when only the AI engine fails', () => {
    expect(summarizeHealth('ok', 'down').status).toBe('degraded')
  })
  it('does not treat an unconfigured AI engine as a failure', () => {
    expect(summarizeHealth('ok', 'unconfigured').status).toBe('ok')
  })
  it('is down when the database fails, whatever the AI engine does', () => {
    expect(summarizeHealth('down', 'ok').status).toBe('down')
    expect(summarizeHealth('down', 'down').status).toBe('down')
  })
})

describe('healthHttpStatus', () => {
  it('answers 200 while the app serves (ok / degraded) and 503 only when it is down', () => {
    expect(healthHttpStatus(summarizeHealth('ok', 'ok'))).toBe(200)
    expect(healthHttpStatus(summarizeHealth('ok', 'down'))).toBe(200)
    expect(healthHttpStatus(summarizeHealth('down', 'ok'))).toBe(503)
  })
})
