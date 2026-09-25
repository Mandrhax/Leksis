import { describe, expect, it, vi } from 'vitest'
import {
  neutralizeSeparator, splitIntoBatches, splitTranslation, translateSegments, type TranslateBatch,
} from '@/lib/doc-translate'

/** A model that upper-cases each segment and keeps the separators. */
const upper: TranslateBatch = async joined => joined.toUpperCase()

describe('splitTranslation', () => {
  it('splits on ||| whatever the spacing', () => {
    expect(splitTranslation('A ||| B|||C |||D')).toEqual(['A', 'B', 'C', 'D'])
  })
  it('ignores a separator at the start or the end', () => {
    expect(splitTranslation(' ||| A ||| B |||')).toEqual(['A', 'B'])
  })
  it('keeps a text without separator as one segment', () => {
    expect(splitTranslation('  Hello  ')).toEqual(['Hello'])
  })
})

describe('splitIntoBatches', () => {
  it('groups consecutive segments up to the size limit', () => {
    expect(splitIntoBatches(['aaaa', 'bbbb', 'cc', 'dddd'], 8)).toEqual([['aaaa', 'bbbb'], ['cc', 'dddd']])
  })
  it('gives an oversized segment its own batch and never returns an empty batch', () => {
    expect(splitIntoBatches(['xxxxxxxxxx', 'a'], 5)).toEqual([['xxxxxxxxxx'], ['a']])
    expect(splitIntoBatches([], 5)).toEqual([])
  })
})

describe('neutralizeSeparator', () => {
  it('removes ||| from source text so it cannot be mistaken for a separator', () => {
    expect(neutralizeSeparator('a ||| b')).not.toContain('|||')
    expect(neutralizeSeparator('a || b | c')).toBe('a || b | c')
  })
})

describe('translateSegments', () => {
  it('translates in order with one call when everything goes well', async () => {
    const translate = vi.fn(upper)
    const { segments, stats } = await translateSegments(['one', 'two', 'three'], translate)
    expect(segments).toEqual(['ONE', 'TWO', 'THREE'])
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate).toHaveBeenCalledWith('one ||| two ||| three', 3)
    expect(stats).toEqual({ batches: 1, retries: 0, splits: 0 })
  })

  it('does not send empty segments to the model and keeps them in place', async () => {
    const translate = vi.fn(upper)
    const { segments } = await translateSegments(['a', '', '  ', 'b'], translate)
    expect(segments).toEqual(['A', '', '  ', 'B'])
    expect(translate).toHaveBeenCalledWith('a ||| b', 2)
  })

  it('sends nothing when there is nothing to translate', async () => {
    const translate = vi.fn(upper)
    expect((await translateSegments([], translate)).segments).toEqual([])
    expect((await translateSegments(['', ' '], translate)).segments).toEqual(['', ' '])
    expect(translate).not.toHaveBeenCalled()
  })

  it('cuts a long document into batches', async () => {
    const translate = vi.fn(upper)
    const { segments, stats } = await translateSegments(['aaaa', 'bbbb', 'cccc', 'dddd'], translate, { maxChars: 8 })
    expect(segments).toEqual(['AAAA', 'BBBB', 'CCCC', 'DDDD'])
    expect(stats.batches).toBe(2)
  })

  it('asks again when the model loses a separator, and accepts the next good answer', async () => {
    let call = 0
    const translate: TranslateBatch = async joined => (++call === 1 ? joined.toUpperCase().replace(' ||| ', ' ') : joined.toUpperCase())
    const { segments, stats } = await translateSegments(['a', 'b', 'c'], translate)
    expect(segments).toEqual(['A', 'B', 'C'])
    expect(stats).toEqual({ batches: 2, retries: 1, splits: 0 })
  })

  it('cuts the batch in half when the model keeps getting it wrong, without ever misaligning', async () => {
    // Merges any group of more than 2 segments into one; answers correctly for 1 or 2 segments
    const translate: TranslateBatch = async joined => {
      const parts = joined.split(' ||| ')
      return parts.length > 2 ? parts.join(' ').toUpperCase() : joined.toUpperCase()
    }
    const input = ['a', 'b', 'c', 'd', 'e']
    const { segments, stats } = await translateSegments(input, translate)
    expect(segments).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(stats.splits).toBeGreaterThan(0)
  })

  it('always ends with one translation per segment, even for a model that never uses separators', async () => {
    const translate: TranslateBatch = async joined => joined.replace(/ \|\|\| /g, ' ').toUpperCase()
    const { segments } = await translateSegments(['a', 'b', 'c', 'd'], translate)
    expect(segments).toEqual(['A', 'B', 'C', 'D'])
  })

  it('joins extra text back when a single segment comes back split', async () => {
    const translate: TranslateBatch = async () => 'x ||| y'
    expect((await translateSegments(['only'], translate)).segments).toEqual(['x y'])
  })

  it('never lets a "|||" in the source reach the model as a separator', async () => {
    const translate = vi.fn(upper)
    const { segments } = await translateSegments(['a ||| b', 'c'], translate)
    expect(translate.mock.calls[0][0].split(' ||| ')).toHaveLength(2)
    expect(segments).toHaveLength(2)
  })

  it('lets a model error through', async () => {
    const translate: TranslateBatch = async () => { throw new Error('AI server down') }
    await expect(translateSegments(['a', 'b'], translate)).rejects.toThrow('AI server down')
  })
})
