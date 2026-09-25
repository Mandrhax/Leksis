import { describe, expect, it } from 'vitest'
import { aiModeOf, DEFAULT_NUM_CTX, isValidNumCtx, LOCAL_OLLAMA_URL, NUM_CTX_MAX, NUM_CTX_MIN } from '@/lib/llm/types'

describe('isValidNumCtx', () => {
  it('accepts whole numbers within the bounds, including the default', () => {
    for (const v of [String(DEFAULT_NUM_CTX), String(NUM_CTX_MIN), String(NUM_CTX_MAX), '16384']) {
      expect(isValidNumCtx(v), v).toBe(true)
    }
  })
  it('rejects anything else', () => {
    for (const v of ['', ' ', 'abc', 'ddd', '8192.5', '-8192', '8 192', '1e4', String(NUM_CTX_MIN - 1), String(NUM_CTX_MAX + 1)]) {
      expect(isValidNumCtx(v), v).toBe(false)
    }
  })
})

describe('aiModeOf', () => {
  it('recognises the Ollama container of this server, whatever the slash or case', () => {
    for (const url of [LOCAL_OLLAMA_URL, LOCAL_OLLAMA_URL + '/', ' HTTP://Ollama:11434 ']) {
      expect(aiModeOf('ollama', url), url).toBe('ollama-local')
    }
  })
  it('treats any other Ollama address as a remote server, including an empty one', () => {
    for (const url of ['', 'http://192.168.1.39:11434', 'http://ollama:11435', 'http://ollama.example.com:11434', 'http://ollama:11434/api']) {
      expect(aiModeOf('ollama', url), url).toBe('ollama-remote')
    }
  })
  it('is openai whatever the address', () => {
    expect(aiModeOf('openai', 'http://192.168.1.50:8000/v1')).toBe('openai')
    expect(aiModeOf('openai', LOCAL_OLLAMA_URL)).toBe('openai')
  })
})
