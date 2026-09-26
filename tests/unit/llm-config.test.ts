import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings: Record<string, Record<string, unknown>> = {}
vi.mock('@/lib/settings', () => ({
  getSetting: async (key: string) => settings[key] ?? {},
}))

import { getAiConfig } from '@/lib/llm/config'

const ENV_KEYS = [
  'AI_PROVIDER', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_OCR_MODEL', 'AI_REWRITE_MODEL',
  'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_OCR_MODEL', 'OLLAMA_REWRITE_MODEL',
]

describe('getAiConfig : variables d\'environnement', () => {
  beforeEach(() => {
    for (const k of Object.keys(settings)) delete settings[k]
    for (const k of ENV_KEYS) vi.stubEnv(k, '')
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('lit les noms AI_*', async () => {
    vi.stubEnv('AI_BASE_URL', 'http://10.0.0.5:11434')
    vi.stubEnv('AI_MODEL', 'm-translate')
    vi.stubEnv('AI_OCR_MODEL', 'm-ocr')
    vi.stubEnv('AI_REWRITE_MODEL', 'm-rewrite')
    const cfg = await getAiConfig()
    expect(cfg.baseUrl).toBe('http://10.0.0.5:11434')
    expect([cfg.translationModel, cfg.ocrModel, cfg.rewriteModel]).toEqual(['m-translate', 'm-ocr', 'm-rewrite'])
  })

  it('retombe sur les anciens noms OLLAMA_* d\'un .env non migré', async () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://10.0.0.6:11434')
    vi.stubEnv('OLLAMA_MODEL', 'old-translate')
    vi.stubEnv('OLLAMA_OCR_MODEL', 'old-ocr')
    vi.stubEnv('OLLAMA_REWRITE_MODEL', 'old-rewrite')
    const cfg = await getAiConfig()
    expect(cfg.baseUrl).toBe('http://10.0.0.6:11434')
    expect([cfg.translationModel, cfg.ocrModel, cfg.rewriteModel]).toEqual(['old-translate', 'old-ocr', 'old-rewrite'])
  })

  it('les noms AI_* l\'emportent sur les anciens', async () => {
    vi.stubEnv('AI_MODEL', 'new')
    vi.stubEnv('OLLAMA_MODEL', 'old')
    vi.stubEnv('AI_BASE_URL', 'http://new:1')
    vi.stubEnv('OLLAMA_BASE_URL', 'http://old:1')
    const cfg = await getAiConfig()
    expect(cfg.translationModel).toBe('new')
    expect(cfg.baseUrl).toBe('http://new:1')
  })

  it('la base l\'emporte sur les variables d\'environnement', async () => {
    settings.ai_config = { provider: 'ollama', baseUrl: 'http://db:1', translationModel: 'from-db' }
    vi.stubEnv('AI_MODEL', 'from-env')
    vi.stubEnv('AI_BASE_URL', 'http://env:1')
    const cfg = await getAiConfig()
    expect(cfg.translationModel).toBe('from-db')
    expect(cfg.baseUrl).toBe('http://db:1')
  })

  it('sans rien : modèles vides, jamais un nom deviné', async () => {
    const cfg = await getAiConfig()
    expect([cfg.translationModel, cfg.ocrModel, cfg.rewriteModel]).toEqual(['', '', ''])
  })
})
