import { describe, expect, it } from 'vitest'
import {
  AiConfigImportSchema, isValidatedSettingKey, parseSetting, SETTING_DEFAULTS, SETTING_SCHEMAS,
  type ValidatedSettingKey,
} from '@/lib/settings-schema'
import { DEFAULT_TONES } from '@/lib/tones'
import { DOCUMENT_MAX_CHARS, IMAGE_MAX_BYTES, RATE_LIMIT_PER_MIN, TEXT_MAX_CHARS } from '@/lib/validators'

describe('SETTING_DEFAULTS', () => {
  it.each(Object.keys(SETTING_DEFAULTS) as (keyof typeof SETTING_DEFAULTS)[])('the default of "%s" passes its own schema unchanged', key => {
    const checked = parseSetting(key, SETTING_DEFAULTS[key])
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.value).toEqual(SETTING_DEFAULTS[key]) // nothing stripped: no unknown key in the defaults
  })

  it('the default tones pass the tones schema', () => {
    expect(parseSetting('rewrite_tones', DEFAULT_TONES).ok).toBe(true)
  })

  it('every validated setting has a default (tones live in lib/tones.ts)', () => {
    const keys = (Object.keys(SETTING_SCHEMAS) as ValidatedSettingKey[]).filter(k => k !== 'rewrite_tones')
    expect(keys.sort()).toEqual(Object.keys(SETTING_DEFAULTS).sort())
  })

  it('takes the limits from the constants used as database fallback (one source)', () => {
    expect(SETTING_DEFAULTS.features.limits).toEqual({
      maxTextChars: TEXT_MAX_CHARS,
      maxDocChars: DOCUMENT_MAX_CHARS,
      maxImageMB: IMAGE_MAX_BYTES / (1024 * 1024),
      rateLimitPerMin: RATE_LIMIT_PER_MIN,
    })
  })

  it('keeps 365 days of usage and 730 days of audit by default', () => {
    expect(SETTING_DEFAULTS.general).toMatchObject({ usageRetentionDays: 365, auditRetentionDays: 730 })
  })
})

describe('parseSetting', () => {
  it('drops unknown keys', () => {
    const r = parseSetting('general', { contactEmail: 'a@x.ch', darkMode: true })
    expect(r).toEqual({ ok: true, value: { contactEmail: 'a@x.ch' } })
  })
  it('rejects values that would end up in CSS or links unchecked', () => {
    expect(parseSetting('branding', { siteName: 'x', primaryColor: 'red; background:url(x)' }).ok).toBe(false)
    expect(parseSetting('branding', { siteName: 'x', primaryColor: '#123456', logoUrl: 'https://evil.example/x.png' }).ok).toBe(false)
    expect(parseSetting('design', { footerLinks: [{ label: 'x', url: 'javascript:alert(1)' }] }).ok).toBe(false)
  })
  it('bounds the numbers', () => {
    expect(parseSetting('general', { usageRetentionDays: -1 }).ok).toBe(false)
    expect(parseSetting('general', { auditRetentionDays: 99_999 }).ok).toBe(false)
    expect(parseSetting('general', { usageRetentionDays: 0 }).ok).toBe(true)
    expect(parseSetting('features', { limits: { rateLimitPerMin: 0 } }).ok).toBe(true)
    expect(parseSetting('features', { limits: { maxImageMB: 0 } }).ok).toBe(false)
  })
  it('requires between 1 and 6 tones', () => {
    expect(parseSetting('rewrite_tones', []).ok).toBe(false)
    expect(parseSetting('rewrite_tones', [...DEFAULT_TONES, ...DEFAULT_TONES.map(t => ({ ...t, id: t.id + '2' }))]).ok).toBe(false)
  })
  it('knows which keys are validated', () => {
    expect(isValidatedSettingKey('general')).toBe(true)
    expect(isValidatedSettingKey('ai_config')).toBe(false)
    expect(isValidatedSettingKey('db_config')).toBe(false)
  })
})

describe('AiConfigImportSchema', () => {
  it('accepts a config without secret and refuses a non-http URL', () => {
    const base = { provider: 'ollama', translationModel: 'm', ocrModel: 'm', rewriteModel: 'm' }
    expect(AiConfigImportSchema.safeParse({ ...base, baseUrl: 'http://ollama:11434' }).success).toBe(true)
    expect(AiConfigImportSchema.safeParse({ ...base, baseUrl: 'file:///etc/passwd' }).success).toBe(false)
  })
})
