import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Un serveur IA « externe » (hors réseau privé) reçoit les textes des utilisateurs :
// il est bloqué tant que l'admin ne l'a pas autorisé explicitement (ai_config.allowExternal).

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)          // link-local
    || (a === 100 && b >= 64 && b <= 127) // CGNAT (Tailscale, etc.)
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true
  if (v.startsWith('fc') || v.startsWith('fd')) return true   // fc00::/7
  if (/^fe[89ab]/.test(v)) return true                        // fe80::/10
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIPv4(mapped[1]) : false
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return false
}

const PRIVATE_SUFFIXES = ['.local', '.lan', '.internal', '.home.arpa', '.localdomain']
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { external: boolean; at: number }>()

/** true si l'hôte n'est pas sur un réseau privé (ou si on ne sait pas le résoudre). */
export async function isExternalHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return true
  if (isIP(host)) return !isPrivateIp(host)
  // localhost, noms Docker/compose sans point (ollama, vllm…), suffixes internes
  if (host === 'localhost' || !host.includes('.') || PRIVATE_SUFFIXES.some(s => host.endsWith(s))) return false

  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.external

  let external: boolean
  try {
    const addresses = await lookup(host, { all: true })
    // Un nom qui résout vers au moins une IP publique est considéré externe
    external = addresses.length === 0 || addresses.some(a => !isPrivateIp(a.address))
  } catch {
    external = true // fail closed
  }
  cache.set(host, { external, at: Date.now() })
  return external
}

export async function isExternalUrl(url: string): Promise<boolean> {
  try {
    return await isExternalHost(new URL(url).hostname)
  } catch {
    return true
  }
}
