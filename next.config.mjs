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
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-parse'],
  async headers() {
    return [
      // /api/site-assets pose ses propres en-têtes (CSP « sandbox » pour les images téléversées)
      { source: '/((?!api/site-assets).*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
