'use client'

import { signOut } from 'next-auth/react'

/**
 * Déconnexion puis retour à la page de connexion.
 * On navigue nous-mêmes vers un chemin relatif : l'adresse renvoyée par Auth.js peut être celle du serveur
 * interne (http://0.0.0.0:3000) et n'est pas fiable pour rediriger le navigateur.
 */
export async function signOutToSignIn(): Promise<void> {
  await signOut({ redirect: false })
  window.location.assign('/auth/signin')
}
