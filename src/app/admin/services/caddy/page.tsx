export const dynamic = 'force-dynamic'

import { requireAdmin }  from '@/lib/admin-guard'
import { getSetting }    from '@/lib/settings'
import { resolveCaddyConfig } from '@/lib/caddy-config'
import { ServicesPanel }   from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CaddyMetrics, CaddyStatusStrip } from '@/components/admin/CaddyMetrics'
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
      <CaddyStatusStrip />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 items-start">
        <ServicesPanel mode="caddy" initial={initial} />
        <CaddyMetrics />
      </div>
    </div>
  )
}
