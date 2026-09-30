import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// Le proxy utilise la config allégée (edge-compatible, sans pg)
// NextAuth redirige automatiquement vers pages.signIn si !auth.user
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    // Exclure : assets Next.js, auth (+ inscription — méthodes mot de passe), pages légales publiques
    // (lisibles avant la connexion) + leur export PDF, assets site (servis via API), et fichiers statiques.
    // pages.signIn (/auth/signin) est épargnée nativement par Auth.js ; /auth/signup ne l'est pas, on doit
    // l'exclure nous-mêmes sous peine de rediriger un visiteur pas encore inscrit loin de la seule page utile.
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|fonts/|legal/|auth/signup|api/auth|api/site-assets|api/legal|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.svg$|.*\\.ico$|.*\\.gif$|.*\\.woff2?$).*)',
  ],
}
