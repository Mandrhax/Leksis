import 'server-only'
import { getSetting } from '@/lib/settings'
import { getSmtpConfig, isSmtpConfigured } from '@/lib/smtp'
import { decrypt } from '@/lib/crypto'
import { AUTH_METHODS, type AuthMethod } from '@/lib/settings-schema'

export type { AuthMethod }
export { AUTH_METHODS }

function isAuthMethod(v: unknown): v is AuthMethod {
  return typeof v === 'string' && (AUTH_METHODS as readonly string[]).includes(v)
}

/**
 * Méthode de connexion active. Si l'admin n'a jamais rien enregistré (clé absente en base — y compris
 * toute installation d'avant la 1.8), on préserve le comportement historique : OTP par email si un relais
 * SMTP est déjà configuré, sinon OTP affiché à l'écran. Un « Reset to defaults » écrit explicitement
 * `otp_display` : ne pas confondre « jamais configuré » et « réinitialisé ».
 */
export async function getAuthMethod(): Promise<AuthMethod> {
  const raw = await getSetting<Record<string, unknown>>('auth_config')
  if (isAuthMethod(raw.method)) return raw.method

  const smtp = await getSmtpConfig()
  return isSmtpConfigured(smtp) ? 'otp_email' : 'otp_display'
}

/**
 * Domaines email autorisés à utiliser la plateforme, toutes méthodes de connexion confondues (texte libre,
 * voir email-domains.ts) ; chaîne vide = aucune restriction. Stocké dans auth_config avec la méthode.
 */
export async function getAllowedDomains(): Promise<string> {
  const raw = await getSetting<Record<string, unknown>>('auth_config')
  return typeof raw.allowedDomains === 'string' ? raw.allowedDomains.trim() : ''
}

/**
 * Mode « invitation seulement » : seuls les comptes que l'admin a créés à l'avance peuvent se connecter,
 * aucune méthode ne crée plus de compte toute seule (code, SSO, inscription). Stocké dans auth_config.
 */
export async function getInviteOnly(): Promise<boolean> {
  const raw = await getSetting<Record<string, unknown>>('auth_config')
  return raw.inviteOnly === true
}

export interface OidcConfig {
  issuer: string
  clientId: string
  /** Chiffré en base (AES-256-GCM) — jamais renvoyé au client */
  clientSecretEnc: string
  buttonLabel: string
  scopes: string
}

export interface OidcPublicConfig {
  issuer: string
  clientId: string
  hasClientSecret: boolean
  buttonLabel: string
  scopes: string
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback)

async function readOidcRaw(): Promise<Record<string, unknown>> {
  return getSetting<Record<string, unknown>>('oidc_config')
}

/** Configuration OIDC effective, avec le secret encore chiffré. À appeler côté serveur uniquement. */
export async function getOidcConfig(): Promise<OidcConfig> {
  const raw = await readOidcRaw()
  return {
    issuer: str(raw.issuer),
    clientId: str(raw.clientId),
    clientSecretEnc: str(raw.clientSecretEnc),
    buttonLabel: str(raw.buttonLabel, 'SSO'),
    scopes: str(raw.scopes, 'openid email profile'),
  }
}

/** Configuration renvoyée à l'admin (Réglages → Connexion) — sans le secret. */
export async function getOidcPublicConfig(): Promise<OidcPublicConfig> {
  const raw = await readOidcRaw()
  return {
    issuer: str(raw.issuer),
    clientId: str(raw.clientId),
    hasClientSecret: str(raw.clientSecretEnc) !== '',
    buttonLabel: str(raw.buttonLabel, 'SSO'),
    scopes: str(raw.scopes, 'openid email profile'),
  }
}

/** Un fournisseur OIDC est utilisable dès qu'un issuer, un client id et un secret sont renseignés. */
export function isOidcConfigured(cfg: Pick<OidcConfig, 'issuer' | 'clientId' | 'clientSecretEnc'>): boolean {
  return cfg.issuer !== '' && cfg.clientId !== '' && cfg.clientSecretEnc !== ''
}

/** Secret déchiffré, prêt à passer au provider next-auth. Lève si le déchiffrement échoue (config corrompue). */
export function decryptOidcClientSecret(cfg: Pick<OidcConfig, 'clientSecretEnc'>): string {
  return decrypt(cfg.clientSecretEnc)
}

/** Vue publique combinée, consommée par la page de connexion pour savoir quoi afficher — jamais de secret. */
export async function getAuthPublicConfig(): Promise<{ method: AuthMethod; oidc: OidcPublicConfig; inviteOnly: boolean }> {
  const [method, oidc, inviteOnly] = await Promise.all([getAuthMethod(), getOidcPublicConfig(), getInviteOnly()])
  return { method, oidc, inviteOnly }
}

export interface OidcTestResult {
  ok: boolean
  message?: string
}

/**
 * Vérifie que l'issuer expose un document de découverte OIDC valide (`.well-known/openid-configuration`) —
 * ne demande ni clientId ni secret, ne persiste jamais rien. Une vraie requête réseau plutôt qu'une simple
 * validation de format d'URL : c'est la seule preuve qu'un serveur OIDC répond réellement à cette adresse.
 */
export async function testOidcDiscovery(issuer: string): Promise<OidcTestResult> {
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
    const doc = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!doc || typeof doc.authorization_endpoint !== 'string' || typeof doc.token_endpoint !== 'string') {
      return { ok: false, message: 'Invalid discovery document' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'unknown error' }
  }
}
