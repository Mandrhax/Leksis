import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { createProvider } from '@/lib/llm'
import { LOCAL_OLLAMA_URL } from '@/lib/llm/types'

/**
 * Le conteneur Ollama installé avec Leksis répond-il ? Sert à activer ou griser la carte « Ollama (ce serveur) »
 * de Services → AI. Pas d'entrée d'audit : la page l'appelle à chaque ouverture (contrairement à ai/test).
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    await createProvider({ provider: 'ollama', baseUrl: LOCAL_OLLAMA_URL, apiKey: '' }).listModels(AbortSignal.timeout(2500))
    return NextResponse.json({ available: true })
  } catch {
    return NextResponse.json({ available: false })
  }
}
