import 'server-only'
import { channelOf, compareVersions, pickLatest, type Channel, type PublishedRelease } from '@/lib/version-compare'

// « Nouvelle version disponible » (dashboard admin). Seul appel sortant de l'application hors moteur IA :
// la liste publique des versions sur GitHub, sans aucune donnée de l'installation (ni contenu, ni compte, ni
// version — juste l'en-tête User-Agent exigé par GitHub). Au plus une fois par jour (une fois par heure après un
// échec), résultat gardé en mémoire. Désactivable (Réglages → General → updateCheck). Pas d'accès à Internet :
// « vérification impossible », jamais une erreur.
//
// LEKSIS_UPDATE_CHECK_URL remplace l'adresse (tests e2e, miroir interne) : même format que l'API GitHub.

const DEFAULT_URL = 'https://api.github.com/repos/Mandrhax/Leksis/releases?per_page=50'
const OK_TTL_MS   = 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 60 * 60 * 1000
const TIMEOUT_MS  = 5000

export type UpdateStatus = 'disabled' | 'up_to_date' | 'available' | 'unavailable'

export interface UpdateInfo {
  status:     UpdateStatus
  current:    string
  channel:    Channel
  latest?:    string
  /** Notes de version (page GitHub de la release) */
  url?:       string
  checkedAt?: string
}

interface CacheEntry { at: number; current: string; releases: PublishedRelease[] | null }
let cache: CacheEntry | null = null

/** Pour les tests */
export function resetUpdateCache(): void { cache = null }

function parseReleases(json: unknown): PublishedRelease[] {
  if (!Array.isArray(json)) throw new Error('unexpected response')
  return json.flatMap(r => {
    const rel = r as { tag_name?: unknown; prerelease?: unknown; draft?: unknown; html_url?: unknown }
    if (typeof rel.tag_name !== 'string' || rel.draft === true) return []
    // Lien affiché dans l'admin : seulement une page GitHub, jamais un autre schéma (javascript:…)
    const url = typeof rel.html_url === 'string' && rel.html_url.startsWith('https://github.com/') ? rel.html_url : ''
    return [{ tag: rel.tag_name, prerelease: rel.prerelease === true, url }]
  })
}

export async function checkForUpdate(
  current: string,
  enabled: boolean,
  opts: { now?: number; fetchFn?: typeof fetch; url?: string } = {},
): Promise<UpdateInfo> {
  const channel = channelOf(current)
  if (!enabled) return { status: 'disabled', current, channel }

  const now = opts.now ?? Date.now()
  const fresh = cache && cache.current === current && now - cache.at < (cache.releases ? OK_TTL_MS : FAIL_TTL_MS)
  if (!fresh) {
    let releases: PublishedRelease[] | null = null
    try {
      const res = await (opts.fetchFn ?? fetch)(opts.url ?? process.env.LEKSIS_UPDATE_CHECK_URL ?? DEFAULT_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Leksis' },
        signal:  AbortSignal.timeout(TIMEOUT_MS),
        cache:   'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      releases = parseReleases(await res.json())
    } catch (err) {
      console.warn('[update-check] could not reach the release list:', (err as Error).message)
    }
    cache = { at: now, current, releases }
  }

  const checkedAt = new Date(cache!.at).toISOString()
  if (!cache!.releases) return { status: 'unavailable', current, channel, checkedAt }
  const latest = pickLatest(cache!.releases, channel)
  if (!latest || compareVersions(latest.tag.replace(/^v/, ''), current) <= 0) {
    return { status: 'up_to_date', current, channel, checkedAt }
  }
  return { status: 'available', current, channel, latest: latest.tag.replace(/^v/, ''), url: latest.url || undefined, checkedAt }
}
