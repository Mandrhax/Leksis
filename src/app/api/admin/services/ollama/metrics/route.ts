import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaConfig } from '@/lib/ollama'

export interface OllamaModel {
  name:        string
  size:        number        // bytes
  modifiedAt:  string
}

export interface OllamaRunningModel {
  name:      string
  sizeVram:  number          // bytes
  size:      number          // bytes
  expiresAt: string          // ISO date
}

export interface OllamaMetricsResult {
  version:          string
  latencyMs:        number
  models:           OllamaModel[]
  running:          OllamaRunningModel[]
  configuredModels: string[]   // models currently referenced in Leksis config
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { baseUrl } = await getOllamaConfig()

  const timeout = AbortSignal.timeout(5000)

  try {
    const [versionRes, tagsRes, psRes] = await Promise.all([
      fetch(`${baseUrl}/api/version`, { signal: timeout }).catch(() => null),
      fetch(`${baseUrl}/api/tags`,    { signal: timeout }).catch(() => null),
      fetch(`${baseUrl}/api/ps`,      { signal: timeout }).catch(() => null),
    ])

    const start = Date.now()

    const versionJson = versionRes?.ok ? await versionRes.json().catch(() => ({})) : {}
    const tagsJson    = tagsRes?.ok    ? await tagsRes.json().catch(() => ({}))    : {}
    const psJson      = psRes?.ok      ? await psRes.json().catch(() => ({}))      : {}

    const latencyMs = Date.now() - start

    const models: OllamaModel[] = (tagsJson.models ?? []).map((m: Record<string, unknown>) => ({
      name:       m.name       as string,
      size:       m.size       as number ?? 0,
      modifiedAt: m.modified_at as string ?? '',
    }))

    const running: OllamaRunningModel[] = (psJson.models ?? []).map((m: Record<string, unknown>) => ({
      name:      m.name       as string,
      sizeVram:  m.size_vram  as number ?? 0,
      size:      m.size       as number ?? 0,
      expiresAt: m.expires_at as string ?? '',
    }))

    const { translationModel, ocrModel, rewriteModel } = await getOllamaConfig()
    const configuredModels = [...new Set([translationModel, ocrModel, rewriteModel].filter(Boolean))]

    const result: OllamaMetricsResult = {
      version:   versionJson.version ?? '',
      latencyMs,
      models,
      running,
      configuredModels,
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Ollama unreachable' }, { status: 503 })
  }
}
