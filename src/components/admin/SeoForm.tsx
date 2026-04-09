'use client'

import { useState } from 'react'
import type { ToastState } from './AdminToast'

interface SeoData {
  title: string
  description: string
}

interface Props {
  initial: SeoData
  onToast: (t: ToastState) => void
}

export function SeoForm({ initial, onToast }: Props) {
  const [data, setData] = useState<SeoData>({
    title: initial.title ?? '',
    description: initial.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seo', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: 'Réglages SEO sauvegardés', type: 'success' })
    } catch {
      onToast({ message: 'Erreur lors de la sauvegarde', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">SEO basique</h3>

        <div>
          <label className="block text-sm text-on-surface mb-1.5">
            Titre de la page <span className="text-xs text-on-surface-variant">(balise &lt;title&gt;)</span>
          </label>
          <input
            type="text"
            value={data.title}
            onChange={e => setData(prev => ({ ...prev, title: e.target.value }))}
            maxLength={70}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
            placeholder="Leksis — Traduction et réécriture IA"
          />
          <p className="text-xs text-on-surface-variant mt-1">{data.title.length}/70 caractères</p>
        </div>

        <div>
          <label className="block text-sm text-on-surface mb-1.5">
            Description <span className="text-xs text-on-surface-variant">(balise meta description)</span>
          </label>
          <textarea
            value={data.description}
            onChange={e => setData(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            maxLength={160}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 resize-none"
            placeholder="Solution de traduction et réécriture assistée par IA, on-premise et sécurisée."
          />
          <p className="text-xs text-on-surface-variant mt-1">{data.description.length}/160 caractères</p>
        </div>

        {/* Aperçu Google */}
        {(data.title || data.description) && (
          <div className="mt-2 p-3 bg-surface-container rounded-lg border border-outline-variant/10">
            <p className="text-xs text-on-surface-variant mb-1.5">Aperçu dans les résultats Google :</p>
            <p className="text-sm text-blue-600 font-medium truncate">{data.title || 'Titre de la page'}</p>
            <p className="text-xs text-on-surface-variant truncate">https://votre-domaine.com</p>
            <p className="text-xs text-on-surface mt-0.5 line-clamp-2">{data.description || 'Description de la page...'}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          Sauvegarder
        </button>
      </div>
    </div>
  )
}
