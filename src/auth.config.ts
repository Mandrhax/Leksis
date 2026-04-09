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
  },
  trustHost: true,
}
