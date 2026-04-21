'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

interface ServiceHealth {
  key: 'ollama' | 'db' | 'caddy'
  name: string
  icon: string
  href: string
  ok: boolean | null
  version: string | null
  latency: string | null
}

interface DashboardStats {
  userCount:     number
  callsToday:    number
  glossaryTerms: number
}

interface AuditEntry {
  action:     string
  resource:   string
  user_email: string
  created_at: string
}

interface Props {
  stats:          DashboardStats
  recentActivity: AuditEntry[]
  appVersion:     string
}

const ICON_MAP: Record<string, string> = {
  settings:       'settings',
  users:          'group',
  ollama:         'smart_toy',
  tones:          'auto_fix_high',
  features:       'tune',
  branding:       'palette',
  design:         'brush',
  general:        'lock',
  glossary:       'menu_book',
  db:             'storage',
  caddy:          'router',
  backup:         'cloud_download',
}

function iconFor(resource: string): string {
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (resource.toLowerCase().includes(key)) return icon
  }
  return 'history'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs} h ago`
  return `${Math.floor(hrs / 24)} days ago`
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant inline-block" />
        …
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
      ok
        ? 'bg-[rgba(39,174,96,0.1)] text-[#27ae60]'
        : 'bg-error/10 text-error'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${ok ? 'bg-[#27ae60]' : 'bg-error'}`} />
      {ok ? 'Connected' : 'Unreachable'}
    </span>
  )
}

export function AdminDashboard({ stats, recentActivity, appVersion }: Props) {
  const { t } = useI18n()
  const router = useRouter()

  const [services, setServices] = useState<ServiceHealth[]>([
    { key: 'ollama', name: 'Ollama',     icon: 'smart_toy', href: '/admin/services/ai',    ok: null, version: null, latency: null },
    { key: 'db',     name: 'PostgreSQL', icon: 'storage',   href: '/admin/services/db',    ok: null, version: null, latency: null },
    { key: 'caddy',  name: 'Caddy',      icon: 'router',    href: '/admin/services/caddy', ok: null, version: null, latency: null },
  ])
  const [loadedModels, setLoadedModels] = useState<number | null>(null)

  async function fetchMetrics() {
    setServices(s => s.map(svc => ({ ...svc, ok: null, version: null, latency: null })))
    setLoadedModels(null)

    async function fetchOne(key: ServiceHealth['key']) {
      try {
        const res = await fetch(`/api/admin/services/${key === 'ollama' ? 'ollama' : key === 'db' ? 'db' : 'caddy'}/metrics`, { cache: 'no-store' })
        const data = await res.json()

        if (key === 'ollama') {
          setServices(s => s.map(svc => svc.key !== 'ollama' ? svc : {
            ...svc,
            ok:      data.version != null,
            version: data.version ?? null,
            latency: data.latencyMs != null ? `${data.latencyMs} ms` : null,
          }))
          setLoadedModels((data.running ?? []).length)
        } else if (key === 'db') {
          setServices(s => s.map(svc => svc.key !== 'db' ? svc : {
            ...svc,
            ok:      true,
            version: data.version?.replace('PostgreSQL ', '').split(' ')[0] ?? null,
            latency: null,
          }))
        } else {
          setServices(s => s.map(svc => svc.key !== 'caddy' ? svc : {
            ...svc,
            ok:      data.reachable ?? false,
            version: data.version ?? null,
            latency: null,
          }))
        }
      } catch {
        setServices(s => s.map(svc => svc.key !== key ? svc : { ...svc, ok: false }))
      }
    }

    await Promise.all(['ollama', 'db', 'caddy'].map(k => fetchOne(k as ServiceHealth['key'])))
  }

  useEffect(() => { fetchMetrics() }, [])

  const statItems = [
    { label: t.adminPages.dashboardStatUsers,        value: stats.userCount,     icon: 'group'     },
    { label: t.adminPages.dashboardStatCallsToday,   value: stats.callsToday,    icon: 'bar_chart' },
    { label: t.adminPages.dashboardStatGlossaryTerms,value: stats.glossaryTerms, icon: 'menu_book' },
    { label: t.adminPages.dashboardStatLoadedModels, value: loadedModels ?? '—', icon: 'memory'    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="font-headline font-bold text-xl text-on-surface">{t.adminPages.dashboardTitle}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{t.adminPages.dashboardDesc}</p>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          className="action-btn"
        >
          <span className="material-symbols-outlined text-[0.95rem] leading-none" aria-hidden="true">refresh</span>
          {t.adminPages.dashboardRefresh}
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Service health */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
            {t.adminPages.dashboardServiceHealth}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {services.map(svc => (
              <button
                key={svc.key}
                type="button"
                onClick={() => router.push(svc.href)}
                className={`bg-surface-container-lowest rounded-xl border p-4 text-left hover:shadow-sm transition-shadow cursor-pointer ${
                  svc.ok === false
                    ? 'border-error/25'
                    : svc.ok === true
                      ? 'border-[rgba(39,174,96,0.2)]'
                      : 'border-outline-variant/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="material-symbols-outlined text-[1.2rem] leading-none"
                    style={{ color: svc.ok === false ? '#9f403d' : svc.ok === true ? '#27ae60' : '#717c82' }}
                    aria-hidden="true"
                  >
                    {svc.icon}
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface flex-1">{svc.name}</span>
                  <StatusBadge ok={svc.ok} />
                </div>
                <div className="flex gap-4">
                  {svc.version && (
                    <span className="text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">{svc.version}</span>
                    </span>
                  )}
                  {svc.latency && (
                    <span className="text-xs text-on-surface-variant">
                      Latency: <span className="font-medium text-on-surface">{svc.latency}</span>
                    </span>
                  )}
                  {svc.ok === false && (
                    <span className="text-xs font-medium text-error">{t.adminPages.dashboardCheckConfig}</span>
                  )}
                </div>
              </button>
            ))}
            {/* App card — static, always running */}
            <div className="bg-surface-container-lowest rounded-xl border border-[rgba(39,174,96,0.2)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[1.2rem] leading-none" style={{ color: '#27ae60' }} aria-hidden="true">
                  deployed_code
                </span>
                <span className="font-headline font-bold text-sm text-on-surface flex-1">Leksis</span>
                <StatusBadge ok={true} />
              </div>
              <div className="flex gap-4">
                <span className="text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">v{appVersion}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-start">
          {/* Stats */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
              {t.adminPages.dashboardStats}
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
              {statItems.map((s, i) => (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 px-4 py-3 ${i < statItems.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                >
                  <span className="material-symbols-outlined text-[1rem] leading-none text-on-surface-variant/50" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="flex-1 text-[13px] text-on-surface-variant">{s.label}</span>
                  <span className="font-headline font-bold text-[15px] text-on-surface">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
              {t.adminPages.dashboardRecentActivity}
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
              {recentActivity.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-on-surface-variant">—</div>
              ) : (
                recentActivity.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-5 py-3 ${i < recentActivity.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[0.95rem] leading-none text-primary" aria-hidden="true">
                        {iconFor(entry.resource)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-on-surface truncate">{entry.action}</div>
                      <div className="text-xs text-on-surface-variant">
                        <code className="text-[11.5px] bg-surface-container px-1 py-px rounded text-on-surface">{entry.resource}</code>
                        {' · '}{entry.user_email}
                      </div>
                    </div>
                    <div className="text-[11.5px] text-on-surface-variant/60 whitespace-nowrap flex-shrink-0">
                      {timeAgo(entry.created_at)}
                    </div>
                  </div>
                ))
              )}
              <div className="px-5 py-2.5 border-t border-outline-variant/10">
                <Link
                  href="/admin/audit"
                  className="text-[12.5px] font-semibold text-primary flex items-center gap-1 hover:underline"
                >
                  {t.adminPages.dashboardViewAuditLog}
                  <span className="material-symbols-outlined text-[0.9rem] leading-none" aria-hidden="true">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
