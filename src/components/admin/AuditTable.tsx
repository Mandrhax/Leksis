'use client'

import { useState, useEffect, useCallback } from 'react'
import { PurgeButton } from './PurgeButton'
import { useI18n } from '@/lib/i18n'

interface AuditEntry {
  id: string
  user_email: string
  action: string
  resource: string
  detail: unknown
  created_at: string
}

const ACTION_ICONS: Record<string, string> = {
  UPDATE_SETTINGS: 'edit',
  UPDATE_ROLE:     'manage_accounts',
  TEST_SERVICE:    'network_check',
}

export function AuditTable() {
  const { t } = useI18n()

  const ACTION_LABELS: Record<string, string> = {
    UPDATE_SETTINGS: t.auditTable.actionUpdateSettings,
    UPDATE_ROLE:     t.auditTable.actionUpdateRole,
    TEST_SERVICE:    t.auditTable.actionTestService,
  }

  const [rows, setRows]       = useState<AuditEntry[]>([])
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/audit?page=${p}`)
      const json = await res.json()
      setRows(json.rows)
      setTotal(json.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PurgeButton
          endpoint="/api/admin/audit/purge"
          label={t.auditTable.purgeLabel}
          onSuccess={() => load(1)}
        />
      </div>
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-2xl text-on-surface-variant/40" aria-hidden="true">
              progress_activity
            </span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-on-surface-variant gap-2">
            <span className="material-symbols-outlined text-3xl" aria-hidden="true">manage_history</span>
            <p className="text-sm">{t.auditTable.noEntries}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10">
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.auditTable.colAction}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider hidden md:table-cell">{t.auditTable.colResource}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider hidden sm:table-cell">{t.auditTable.colBy}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.auditTable.colDate}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-surface-container/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base leading-none text-on-surface-variant" aria-hidden="true">
                        {ACTION_ICONS[row.action] ?? 'history'}
                      </span>
                      <span className="text-on-surface text-xs font-medium">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant hidden md:table-cell">
                    {row.resource}
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant hidden sm:table-cell truncate max-w-[160px]">
                    {row.user_email}
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-on-surface-variant">{t.auditTable.totalEntries.replace('{0}', String(total))}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className="icon-btn disabled:opacity-40"
              aria-label={t.auditTable.prevPage}
            >
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">chevron_left</span>
            </button>
            <span className="text-xs text-on-surface-variant">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= totalPages || loading}
              className="icon-btn disabled:opacity-40"
              aria-label={t.auditTable.nextPage}
            >
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
