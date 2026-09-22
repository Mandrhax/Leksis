export const dynamic = 'force-dynamic'

import { requireAdmin }  from '@/lib/admin-guard'
import { getSetting }    from '@/lib/settings'
import { resolveCaddyConfig } from '@/lib/caddy-config'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CaddyServicesLayout } from '@/components/admin/CaddyServicesLayout'
import { PinnedUrlNotice } from '@/components/admin/PinnedUrlNotice'

export default async function AdminServicesCaddyPage() {
  await requireAdmin()
  // Rien d'enregistré (installation neuve) : l'état vient de CADDY_HOST
  const saved   = await getSetting<Record<string, unknown>>('caddy_config')
  const initial = resolveCaddyConfig(saved, process.env.CADDY_HOST ?? '')

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesCaddy" />
      <PinnedUrlNotice url={process.env.NEXTAUTH_URL ?? ''} />
      <CaddyServicesLayout initial={initial} />
    </div>
  )
}
