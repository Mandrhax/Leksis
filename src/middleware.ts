import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// Le middleware utilise la config allégée (edge-compatible, sans pg)
// NextAuth redirige automatiquement vers pages.signIn si !auth.user
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    // Exclure : assets Next.js, auth, et fichiers statiques uploadés (logo, bg)
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.svg$|.*\\.ico$|.*\\.gif$).*)',
  ],
}
