import type { NextAuthConfig } from 'next-auth'

// Config allégée — edge-compatible (pas de pg, pas de crypto Node.js)
// Partagée entre le middleware et auth.ts pour garantir la cohérence des cookies
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    // Pas de callback `redirect` : le client next-auth analyse l'URL renvoyée par signIn() avec `new URL()`, elle doit
    // donc rester absolue. L'adresse absolue peut être celle du serveur interne (http://0.0.0.0:3000, HOSTNAME du
    // conteneur) : c'est pourquoi la connexion et la déconnexion naviguent elles-mêmes vers un chemin relatif
    // (SignInForm.safeCallbackPath, lib/sign-out.ts) au lieu de suivre l'URL du serveur.
  },
  trustHost: true,
}
