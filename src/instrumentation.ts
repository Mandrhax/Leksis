// Exécuté une fois au démarrage du serveur Next.js
export async function register() {
  // Le nettoyage des journaux a besoin de Node (base de données), pas du runtime edge
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startRetentionSchedule } = await import('@/lib/retention')
  startRetentionSchedule()
}
