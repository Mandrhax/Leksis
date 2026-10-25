const isProd = process.env.NODE_ENV === 'production'

// CSP : 'unsafe-inline' reste nécessaire (scripts d'hydratation Next.js, <style> des couleurs du site) ; on bloque
// le reste — encadrement dans une iframe, plugins, <base>, formulaires vers l'extérieur, ressources tierces.
// Pas de CSP en développement : le rechargement à chaud de Next.js a besoin de 'unsafe-eval'.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  ...(isProd ? [{ key: 'Content-Security-Policy', value: csp }] : []),
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // microphone=(self) : nécessaire à la dictée vocale (bouton micro, Tabs Texte/Réécriture) ; sans elle,
  // getUserMedia() est bloqué par la politique du navigateur avant même la demande d'autorisation
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  // next/image n'est pas utilisé : sans ça, sharp (et libvips) partaient dans l'image Docker pour rien
  images: { unoptimized: true },
  outputFileTracingExcludes: { '*': ['node_modules/sharp/**', 'node_modules/@img/**'] },
  async headers() {
    return [
      // /api/site-assets et les images jointes aux retours (/api/admin/feedback/attachments) posent leurs propres
      // en-têtes (CSP « sandbox » pour les images téléversées) : la CSP globale l'écraserait
      { source: '/((?!api/site-assets|api/admin/feedback/attachments).*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
