// Client-safe et pur : comparaison de versions semver (« 1.10.0 » > « 1.10.0-beta.2 » > « 1.10.0-beta.1 » > « 1.9.0 »),
// et choix de la dernière version publiée pour un canal — même règle que `latest_tag` d'install.sh : une
// installation stable ne voit jamais les pré-versions, une installation beta voit les deux.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export type Channel = 'stable' | 'beta'

export function isValidVersion(v: string): boolean {
  return SEMVER.test(v)
}

export function channelOf(version: string): Channel {
  return version.includes('-') ? 'beta' : 'stable'
}

/** < 0 si a < b, 0 si égales, > 0 si a > b. Une version invalide est plus petite que toute version valide. */
export function compareVersions(a: string, b: string): number {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (!ma || !mb) return (ma ? 1 : 0) - (mb ? 1 : 0)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d) return d
  }
  const pa = ma[4]
  const pb = mb[4]
  if (!pa || !pb) return (pa ? -1 : 0) - (pb ? -1 : 0) // sans suffixe = version finale, au-dessus de ses betas
  const xa = pa.split('.')
  const xb = pb.split('.')
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1
    if (xb[i] === undefined) return 1
    const na = /^\d+$/.test(xa[i])
    const nb = /^\d+$/.test(xb[i])
    if (na && nb) { const d = Number(xa[i]) - Number(xb[i]); if (d) return d; continue }
    if (na !== nb) return na ? -1 : 1
    if (xa[i] !== xb[i]) return xa[i] < xb[i] ? -1 : 1
  }
  return 0
}

export interface PublishedRelease {
  tag:        string
  prerelease: boolean
  url:        string
}

/** Plus haute version publiée visible depuis ce canal, ou null */
export function pickLatest(releases: PublishedRelease[], channel: Channel): PublishedRelease | null {
  let best: PublishedRelease | null = null
  for (const r of releases) {
    if (!isValidVersion(r.tag)) continue
    if (channel === 'stable' && (r.prerelease || r.tag.includes('-'))) continue
    if (!best || compareVersions(r.tag, best.tag) > 0) best = r
  }
  return best
}
