import 'server-only'
import tls from 'node:tls'

export interface TlsInfo {
  /** Certificat présenté pour ce domaine et accepté par les autorités de confiance */
  ok:        boolean
  issuer?:   string
  validTo?:  string   // ISO
  error?:    string
}

/**
 * Interroge Caddy (réseau Docker interne, port 443) avec le nom de domaine en SNI
 * et renvoie le certificat qu'il présente : permet d'afficher « émis par Let's Encrypt »
 * ou « en attente » sans sortir du conteneur.
 */
export function checkCertificate(domain: string, connectHost = 'caddy', port = 443): Promise<TlsInfo> {
  return new Promise(resolve => {
    let settled = false
    const done = (info: TlsInfo) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(info)
    }

    const socket = tls.connect({
      host: connectHost,
      port,
      servername: domain,
      rejectUnauthorized: false, // on lit le certificat, `authorized` dit s'il est de confiance
      timeout: 4000,
    })

    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      // Selon la version des types Node, une valeur d'émetteur peut être une chaîne ou un tableau
      const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
      const issuer = first(cert?.issuer?.O) || first(cert?.issuer?.CN) || undefined
      const validTo = cert?.valid_to ? new Date(cert.valid_to).toISOString() : undefined
      done({
        ok: socket.authorized === true,
        issuer,
        validTo,
        error: socket.authorized ? undefined : String(socket.authorizationError ?? 'untrusted certificate'),
      })
    })
    socket.once('timeout', () => done({ ok: false, error: 'timeout' }))
    socket.once('error', err => done({ ok: false, error: err.message }))
  })
}
