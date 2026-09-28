import { describe, expect, it } from 'vitest'
import { validateAudioSize, AUDIO_MAX_BYTES } from '@/lib/validators'

describe('validateAudioSize', () => {
  it('accepts a clip within the limit', () => {
    expect(validateAudioSize(AUDIO_MAX_BYTES - 1)).toBeNull()
    expect(validateAudioSize(0)).toBeNull()
  })

  it('refuses a clip over the limit, with the limit in MB in the message', () => {
    const error = validateAudioSize(AUDIO_MAX_BYTES + 1)
    expect(error).toContain(String(Math.round(AUDIO_MAX_BYTES / (1024 * 1024))))
  })

  it('honours a custom limit', () => {
    expect(validateAudioSize(2 * 1024 * 1024, 1 * 1024 * 1024)).not.toBeNull()
    expect(validateAudioSize(1 * 1024 * 1024, 2 * 1024 * 1024)).toBeNull()
  })
})
