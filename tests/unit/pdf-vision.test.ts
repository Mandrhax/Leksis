import { describe, expect, it } from 'vitest'
import { OCR_MAX_PAGE_PX, renderScale } from '@/lib/pdf-vision'

describe('renderScale', () => {
  it('renders an A4 page at about 150 DPI', () => {
    expect(renderScale({ width: 595, height: 842 })).toBe(1.5)
  })
  it('caps the longest side of a huge page (the PDF chooses its own page size)', () => {
    const scale = renderScale({ width: 14400, height: 14400 })
    expect(14400 * scale).toBeLessThanOrEqual(OCR_MAX_PAGE_PX)
  })
})
