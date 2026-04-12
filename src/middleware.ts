import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// Le middleware utilise la config allégée (edge-compatible, sans pg)
// NextAuth redirige automatiquement vers pages.signIn si !auth.user
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    // Exclure : assets Next.js, auth, assets site (servis via API), et fichiers statiques
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|api/auth|api/site-assets|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.svg$|.*\\.ico$|.*\\.gif$).*)',
  ],
}
