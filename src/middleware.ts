import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// Le middleware utilise la config allégée (edge-compatible, sans pg)
// NextAuth redirige automatiquement vers pages.signIn si !auth.user
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
