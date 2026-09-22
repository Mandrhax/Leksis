'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import type { Messages } from '@/locales/en'

type AdminPagesMessages = Messages['adminPages']

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

interface TrendPoint {
  day:   string
  count: number
}

interface FeatureCounts {
  text:     number
  document: number
  image:    number
  rewrite:  number
}

interface Props {
  stats:          DashboardStats
  recentActivity: AuditEntry[]
  appVersion:     string
  trend:          TrendPoint[]
  featureCounts:  FeatureCounts
  lastBackupAt:   string | null
}

const ICON_MAP: Record<string, string> = {
  settings:       'settings',
  users:          'group',
  ollama:         'smart_toy',
  tones:          'auto_fix_high',
  features:       'tune',
  branding:       'palette',
  design:         'brush',
  general:        'info',
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

function timeAgo(iso: string, at: AdminPagesMessages): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return at.dashboardTimeJustNow
  if (mins < 60) return at.dashboardTimeMinAgo.replace('{0}', String(mins))
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return at.dashboardTimeHoursAgo.replace('{0}', String(hrs))
  return at.dashboardTimeDaysAgo.replace('{0}', String(Math.floor(hrs / 24)))
}

function StatusBadge({ ok, at }: { ok: boolean | null; at: AdminPagesMessages }) {
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
      {ok ? at.dashboardConnected : at.dashboardUnreachable}
    </span>
  )
}

// 7-day bar chart — single series, height is the only signal, today's bar stands out
function ActivityChart({ trend, locale }: { trend: TrendPoint[]; locale: string }) {
  const max = Math.max(1, ...trend.map(p => p.count))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {trend.map((p, i) => {
          const pct = Math.round((p.count / max) * 100)
          const isToday = i === trend.length - 1
          return (
            <div key={p.day} className="flex-1 h-full flex items-end" title={`${p.count} — ${p.day}`}>
              <div
                className={`w-full rounded-t transition-all ${isToday ? 'bg-primary' : 'bg-primary/50'}`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        {trend.map(p => (
          <div key={p.day} className="flex-1 text-center text-[10px] font-medium text-on-surface-variant/60 uppercase">
            {new Date(`${p.day}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Relative bar list — color carries no identity here, icon + label do
function FeatureBreakdown({ counts, t }: { counts: FeatureCounts; t: Messages }) {
  const items = [
    { key: 'text',     label: t.home.tabText,     icon: 'translate',     value: counts.text     },
    { key: 'document', label: t.home.tabDocument, icon: 'description',   value: counts.document },
    { key: 'image',    label: t.home.tabImage,    icon: 'image_search',  value: counts.image    },
    { key: 'rewrite',  label: t.home.tabRewrite,  icon: 'auto_fix_high', value: counts.rewrite  },
  ]
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="flex flex-col gap-3">
      {items.map(i => (
        <div key={i.key} className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant text-base leading-none shrink-0" aria-hidden="true">{i.icon}</span>
          <span className="text-[13px] text-on-surface-variant w-28 shrink-0 truncate">{i.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-outline-variant/20 overflow-hidden">
            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round((i.value / max) * 100)}%` }} />
          </div>
          <span className="text-[13px] font-semibold text-on-surface w-6 text-right shrink-0">{i.value}</span>
        </div>
      ))}
    </div>
  )
}

export function AdminDashboard({ stats, recentActivity, appVersion, trend, featureCounts, lastBackupAt }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const at = t.adminPages

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
        const res = await fetch(`/api/admin/services/${key === 'ollama' ? 'ai' : key === 'db' ? 'db' : 'caddy'}/metrics`, { cache: 'no-store' })
        const data = await res.json()

        if (key === 'ollama') {
          setServices(s => s.map(svc => svc.key !== 'ollama' ? svc : {
            ...svc,
            name:    data.provider ? (data.provider === 'openai' ? 'OpenAI API' : 'Ollama') : svc.name,
            ok:      res.ok,
            version: data.version || null,
            latency: data.latencyMs != null ? `${data.latencyMs} ms` : null,
          }))
          setLoadedModels((data.capabilities?.running ? (data.running ?? []) : (data.models ?? [])).length)
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
    { label: at.dashboardStatUsers,        value: stats.userCount,     icon: 'group'     },
    { label: at.dashboardStatCallsToday,   value: stats.callsToday,    icon: 'bar_chart' },
    { label: at.dashboardStatGlossaryTerms,value: stats.glossaryTerms, icon: 'menu_book' },
    { label: at.dashboardStatLoadedModels, value: loadedModels ?? '—', icon: 'memory'    },
  ]

  // Backups: green within 8 days, red otherwise (or never)
  const backupOk = lastBackupAt != null && (Date.now() - new Date(lastBackupAt).getTime()) <= 8 * 24 * 60 * 60 * 1000

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="font-headline font-bold text-xl text-on-surface">{at.dashboardTitle}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{at.dashboardDesc}</p>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          className="action-btn"
        >
          <span className="material-symbols-outlined text-[0.95rem] leading-none" aria-hidden="true">refresh</span>
          {at.dashboardRefresh}
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Service health */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
            {at.dashboardServiceHealth}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
                  <StatusBadge ok={svc.ok} at={at} />
                </div>
                <div className="flex gap-4">
                  {svc.version && (
                    <span className="text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">{svc.version}</span>
                    </span>
                  )}
                  {svc.latency && (
                    <span className="text-xs text-on-surface-variant">
                      {at.dashboardLatency}: <span className="font-medium text-on-surface">{svc.latency}</span>
                    </span>
                  )}
                  {svc.ok === false && (
                    <span className="text-xs font-medium text-error">{at.dashboardCheckConfig}</span>
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
                <StatusBadge ok={true} at={at} />
              </div>
              <div className="flex gap-4">
                <span className="text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">v{appVersion}</span>
                </span>
              </div>
            </div>
            {/* Backup card */}
            <button
              type="button"
              onClick={() => router.push('/admin/backup')}
              className={`bg-surface-container-lowest rounded-xl border p-4 text-left hover:shadow-sm transition-shadow cursor-pointer ${
                backupOk ? 'border-[rgba(39,174,96,0.2)]' : 'border-error/25'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-[1.2rem] leading-none"
                  style={{ color: backupOk ? '#27ae60' : '#9f403d' }}
                  aria-hidden="true"
                >
                  cloud_done
                </span>
                <span className="font-headline font-bold text-sm text-on-surface flex-1">{at.dashboardBackupTitle}</span>
                <StatusBadge ok={backupOk} at={at} />
              </div>
              <div className="flex gap-4">
                <span className="text-xs text-on-surface-variant">
                  {lastBackupAt
                    ? <><span className="font-medium text-on-surface">{timeAgo(lastBackupAt, at)}</span></>
                    : at.dashboardBackupNever
                  }
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
            {at.dashboardStats}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statItems.map(s => (
              <div
                key={s.label}
                className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[1.1rem] leading-none text-primary" aria-hidden="true">{s.icon}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-headline font-bold text-lg text-on-surface leading-tight">{s.value}</div>
                  <div className="text-[12px] text-on-surface-variant truncate">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity trend + breakdown by feature */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
              {at.dashboardActivityTitle}
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
              <div className="font-headline font-bold text-2xl text-on-surface mb-4">
                {trend.reduce((sum, p) => sum + p.count, 0)}
              </div>
              <ActivityChart trend={trend} locale={locale} />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
              {at.dashboardByFeatureTitle}
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
              <FeatureBreakdown counts={featureCounts} t={t} />
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">
            {at.dashboardRecentActivity}
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
                    {timeAgo(entry.created_at, at)}
                  </div>
                </div>
              ))
            )}
            <div className="px-5 py-2.5 border-t border-outline-variant/10">
              <Link
                href="/admin/audit"
                className="text-[12.5px] font-semibold text-primary flex items-center gap-1 hover:underline"
              >
                {at.dashboardViewAuditLog}
                <span className="material-symbols-outlined text-[0.9rem] leading-none" aria-hidden="true">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
