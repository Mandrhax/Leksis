import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'wrong password')).toBe(false)
  })

  it('salts every hash differently, even for the same password', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a).not.toBe(b)
    expect(await verifyPassword(a, 'same password')).toBe(true)
    expect(await verifyPassword(b, 'same password')).toBe(true)
  })

  it('is self-describing ("scrypt:N:r:p:salt:hash")', async () => {
    const hash = await hashPassword('x')
    const parts = hash.split(':')
    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
  })

  it('never throws on a malformed stored hash', async () => {
    await expect(verifyPassword('', 'x')).resolves.toBe(false)
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false)
    await expect(verifyPassword('scrypt:oops:8:1:aa:bb', 'x')).resolves.toBe(false)
    await expect(verifyPassword('bcrypt:10:salt:hash:x:y', 'x')).resolves.toBe(false)
  })
})
