import { describe, expect, it } from 'vitest'
import { BACKGROUND, checkAsset, detectImageFormat, LOGO, tooLarge, unsupportedFormat } from '@/lib/site-assets'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('detectImageFormat / checkAsset', () => {
  it('recognises images by their first bytes, not by name or MIME type', () => {
    expect(detectImageFormat(PNG)).toBe('png')
    expect(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(detectImageFormat(Buffer.from('just text'))).toBeNull()
  })
  it('refuses SVG and text, and files over the limit', () => {
    expect(checkAsset(LOGO, Buffer.from('<svg></svg>'))).toEqual({ ok: false, error: 'unsupported_format' })
    expect(checkAsset(LOGO, PNG)).toEqual({ ok: true, format: 'png' })
    expect(checkAsset(LOGO, Buffer.concat([PNG, Buffer.alloc(LOGO.maxBytes)]))).toEqual({ ok: false, error: 'too_large' })
  })
  it('allows ICO for the logo only', () => {
    const ico = Buffer.from([0, 0, 1, 0, 1, 0])
    expect(checkAsset(LOGO, ico)).toEqual({ ok: true, format: 'ico' })
    expect(checkAsset(BACKGROUND, ico)).toEqual({ ok: false, error: 'unsupported_format' })
  })
})

describe('upload error responses', () => {
  it('carry a stable code and the values the form needs to translate the message', () => {
    expect(tooLarge(LOGO)).toMatchObject({ code: 'too_large', maxMB: 2 })
    expect(tooLarge(BACKGROUND)).toMatchObject({ code: 'too_large', maxMB: 5 })
    expect(unsupportedFormat(LOGO)).toMatchObject({ code: 'unsupported_format', formats: ['PNG', 'JPG', 'WEBP', 'ICO'] })
    expect(unsupportedFormat(BACKGROUND).formats).toEqual(['PNG', 'JPG', 'WEBP'])
  })
})
