import 'server-only'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { isCrossSiteRequest } from '@/lib/csrf'
import type { Session } from 'next-auth'

/**
 * À appeler en tête de chaque page et route API admin.
 * Redirige vers /auth/signin si non connecté, vers / si non-admin.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  if (session.user.role !== 'admin') redirect('/')
  return session
}

/**
 * Version pour les routes API : retourne null au lieu de rediriger.
 * Refuse aussi une requête venue d'un autre site (CSRF, voir lib/csrf.ts).
 */
export async function getAdminSession(): Promise<Session | null> {
  if (isCrossSiteRequest(await headers())) return null
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}
