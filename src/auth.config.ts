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
    // Le serveur Next tourne avec HOSTNAME=0.0.0.0 (Docker) et Auth.js en déduit une adresse « http://0.0.0.0:3000 »,
    // même derrière Caddy ou un proxy : on ne renvoie donc jamais d'adresse absolue au navigateur, seulement un
    // chemin du site (relatif à l'adresse que l'utilisateur utilise réellement). Une URL externe est ramenée à son chemin.
    redirect({ url }) {
      if (url.startsWith('/') && !url.startsWith('//')) return url
      try {
        const u = new URL(url)
        return `${u.pathname}${u.search}${u.hash}` || '/'
      } catch {
        return '/'
      }
    },
  },
  trustHost: true,
}
