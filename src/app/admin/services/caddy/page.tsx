export const dynamic = 'force-dynamic'

import { requireAdmin }  from '@/lib/admin-guard'
import { getSetting }    from '@/lib/settings'
import { DEFAULT_CADDY_CONFIG } from '@/lib/caddy'
import type { CaddyConfig }     from '@/lib/caddy'
import { ServicesPanel }   from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CaddyMetrics, CaddyStatusStrip } from '@/components/admin/CaddyMetrics'

export default async function AdminServicesCaddyPage() {
  await requireAdmin()
  const saved   = await getSetting<Partial<CaddyConfig>>('caddy_config')
  const initial = {
    ...DEFAULT_CADDY_CONFIG,
    ...saved,
    nextauthUrl: saved.nextauthUrl ?? process.env.NEXTAUTH_URL ?? '',
  }

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesCaddy" />
      <CaddyStatusStrip />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 items-start">
        <ServicesPanel mode="caddy" initial={initial} />
        <CaddyMetrics />
      </div>
    </div>
  )
}
