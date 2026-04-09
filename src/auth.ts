import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import PostgresAdapter from '@auth/pg-adapter'
import { pool } from '@/lib/db'
import { query } from '@/lib/db'
import { verifyOtp, getUserByEmail } from '@/lib/otp'
import { authConfig } from '@/auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  adapter: PostgresAdapter(pool),

  providers: [
    Credentials({
      name: 'OTP',
      credentials: {
        email: { label: 'Email', type: 'email' },
        otp:   { label: 'Code OTP', type: 'text' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const otp   = credentials?.otp   as string | undefined

        if (!email || !otp) return null

        const valid = await verifyOtp(email, otp)
        if (!valid) return null

        const user = await getUserByEmail(email)
        if (!user) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id    = user.id
        token.email = user.email
        token.name  = user.name
        // Lire le rôle depuis la DB au moment du login
        const r = await query<{ role: string }>(
          'SELECT role FROM users WHERE id = $1',
          [user.id]
        )
        token.role = r.rows[0]?.role ?? 'user'
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id    = token.id as string
        session.user.email = token.email as string
        session.user.name  = token.name as string | null | undefined
        session.user.role  = (token.role as string) ?? 'user'
      }
      return session
    },
  },
})
