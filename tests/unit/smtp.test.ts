import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings: Record<string, Record<string, unknown>> = {}
vi.mock('@/lib/settings', () => ({
  getSetting: async (key: string) => settings[key] ?? {},
}))

vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))

import { getSmtpConfig, getSmtpPublicConfig, isSmtpConfigured } from '@/lib/smtp'
import { encrypt } from '@/lib/crypto'

describe('isSmtpConfigured', () => {
  it('requires both a host and a from address', () => {
    expect(isSmtpConfigured({ host: '', fromAddress: '' })).toBe(false)
    expect(isSmtpConfigured({ host: 'smtp.example.com', fromAddress: '' })).toBe(false)
    expect(isSmtpConfigured({ host: '', fromAddress: 'noreply@example.com' })).toBe(false)
    expect(isSmtpConfigured({ host: 'smtp.example.com', fromAddress: 'noreply@example.com' })).toBe(true)
  })
})

describe('getSmtpConfig / getSmtpPublicConfig', () => {
  beforeEach(() => { for (const k of Object.keys(settings)) delete settings[k] })
  afterEach(() => { vi.unstubAllEnvs(); vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64)) })

  it('sans rien en base : configuration vide, port par défaut', async () => {
    const cfg = await getSmtpConfig()
    expect(cfg).toMatchObject({ host: '', port: 587, secure: false, user: '', passEnc: '', fromAddress: '', fromName: '' })
    const pub = await getSmtpPublicConfig()
    expect(pub.hasPassword).toBe(false)
  })

  it('lit la configuration stockée et ne renvoie jamais le mot de passe au public', async () => {
    const passEnc = encrypt('s3cret')
    settings.smtp_config = { host: 'smtp.example.com', port: 465, secure: true, user: 'bot', passEnc, fromAddress: 'noreply@example.com', fromName: 'Leksis' }

    const cfg = await getSmtpConfig()
    expect(cfg.host).toBe('smtp.example.com')
    expect(cfg.port).toBe(465)
    expect(cfg.secure).toBe(true)
    // Chiffré en base : cette couche transporte le chiffré tel quel, le déchiffrement se fait au dernier moment (createTransport)
    expect(cfg.passEnc).toBe(passEnc)

    const pub = await getSmtpPublicConfig()
    expect(pub.hasPassword).toBe(true)
    expect((pub as unknown as Record<string, unknown>).passEnc).toBeUndefined()
    expect((pub as unknown as Record<string, unknown>).password).toBeUndefined()
  })
})
