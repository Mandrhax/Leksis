import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings: Record<string, Record<string, unknown>> = {}
vi.mock('@/lib/settings', () => ({
  getSetting: async (key: string) => settings[key] ?? {},
}))

vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))

import {
  decryptOidcClientSecret, getAuthMethod, getAuthPublicConfig, getOidcConfig, getOidcPublicConfig, isOidcConfigured,
} from '@/lib/auth-methods'
import { encrypt } from '@/lib/crypto'

beforeEach(() => { for (const k of Object.keys(settings)) delete settings[k] })
afterEach(() => { vi.unstubAllEnvs(); vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64)) })

describe('getAuthMethod', () => {
  it('defaults to otp_display when nothing is configured', async () => {
    expect(await getAuthMethod()).toBe('otp_display')
  })

  it('infers otp_email when SMTP is already configured but auth_config was never saved (pre-1.8 install)', async () => {
    settings.smtp_config = { host: 'smtp.example.com', fromAddress: 'noreply@example.com' }
    expect(await getAuthMethod()).toBe('otp_email')
  })

  it('respects an explicitly saved method, even otp_display via Reset while SMTP is configured', async () => {
    settings.smtp_config = { host: 'smtp.example.com', fromAddress: 'noreply@example.com' }
    settings.auth_config = { method: 'otp_display' }
    expect(await getAuthMethod()).toBe('otp_display')
  })

  it('ignores a malformed method and falls back to inference', async () => {
    settings.auth_config = { method: 'not-a-real-method' }
    expect(await getAuthMethod()).toBe('otp_display')
  })

  it('respects password/SSO methods once explicitly saved', async () => {
    settings.auth_config = { method: 'password_admin_approval' }
    expect(await getAuthMethod()).toBe('password_admin_approval')
  })
})

describe('isOidcConfigured / getOidcConfig / getOidcPublicConfig', () => {
  it('is not configured with nothing set', async () => {
    const cfg = await getOidcConfig()
    expect(isOidcConfigured(cfg)).toBe(false)
    expect((await getOidcPublicConfig()).hasClientSecret).toBe(false)
  })

  it('is configured once issuer/clientId/secret are all set, and never exposes the secret publicly', async () => {
    const clientSecretEnc = encrypt('s3cret')
    settings.oidc_config = {
      issuer: 'https://idp.example.com', clientId: 'leksis', clientSecretEnc, buttonLabel: 'Acme SSO', scopes: 'openid email',
      allowedDomains: 'acme.ch',
    }

    const cfg = await getOidcConfig()
    expect(isOidcConfigured(cfg)).toBe(true)
    expect(cfg.clientSecretEnc).toBe(clientSecretEnc)
    expect(decryptOidcClientSecret(cfg)).toBe('s3cret')

    const pub = await getOidcPublicConfig()
    expect(pub).toEqual({
      issuer: 'https://idp.example.com', clientId: 'leksis', hasClientSecret: true, buttonLabel: 'Acme SSO', scopes: 'openid email',
      allowedDomains: 'acme.ch',
    })
    expect((pub as unknown as Record<string, unknown>).clientSecretEnc).toBeUndefined()
  })

  it('is not configured when only some fields are set', async () => {
    settings.oidc_config = { issuer: 'https://idp.example.com', clientId: 'leksis' } // no secret yet
    expect(isOidcConfigured(await getOidcConfig())).toBe(false)
  })

  it('defaults buttonLabel and scopes when unset', async () => {
    const cfg = await getOidcConfig()
    expect(cfg.buttonLabel).toBe('SSO')
    expect(cfg.scopes).toBe('openid email profile')
    expect(cfg.allowedDomains).toBe('')
  })
})

describe('getAuthPublicConfig', () => {
  it('combines the active method and the public OIDC config, never a secret', async () => {
    settings.auth_config = { method: 'sso_oidc' }
    settings.oidc_config = {
      issuer: 'https://idp.example.com', clientId: 'leksis', clientSecretEnc: encrypt('s'), buttonLabel: 'Acme', scopes: 'openid',
    }
    expect(await getAuthPublicConfig()).toEqual({
      method: 'sso_oidc',
      oidc: { issuer: 'https://idp.example.com', clientId: 'leksis', hasClientSecret: true, buttonLabel: 'Acme', scopes: 'openid', allowedDomains: '' },
    })
  })
})
