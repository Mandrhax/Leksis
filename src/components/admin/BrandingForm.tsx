'use client'

import { useState, useCallback, useRef } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface BrandingData {
  siteName:          string
  primaryColor:      string
  backgroundColor:   string
  darkMode:          boolean
  logoUrl?:          string
  backgroundImage?:  string
}

interface Props {
  initial: BrandingData
  onToast: (t: ToastState) => void
}

export function BrandingForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<BrandingData>({
    ...initial,
    backgroundColor: initial.backgroundColor ?? '#f7f9fb',
  })
  const [saving, setSaving] = useState(false)

  // Logo
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoRemoving,  setLogoRemoving]  = useState(false)
  const [logoPreview,   setLogoPreview]   = useState<string | null>(initial.logoUrl ?? null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Background image
  const [bgUploading, setBgUploading] = useState(false)
  const [bgRemoving,  setBgRemoving]  = useState(false)
  const [bgPreview,   setBgPreview]   = useState<string | null>(initial.backgroundImage ?? null)
  const bgInputRef = useRef<HTMLInputElement>(null)

  const set = useCallback(<K extends keyof BrandingData>(k: K, v: BrandingData[K]) => {
    setData(prev => ({ ...prev, [k]: v }))
  }, [])

  // ── Logo ──────────────────────────────────────────────────────────────────────
  async function handleLogoUpload(file: File) {
    setLogoUploading(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      const res  = await fetch('/api/admin/logo', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t.brandingForm.toastUploadError)
      setLogoPreview(`${json.logoUrl}?v=${Date.now()}`)
      set('logoUrl', json.logoUrl)
      onToast({ message: t.brandingForm.toastLogoUpdated, type: 'success' })
    } catch (e: unknown) {
      onToast({ message: e instanceof Error ? e.message : t.brandingForm.toastUploadError, type: 'error' })
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleLogoRemove() {
    setLogoRemoving(true)
    try {
      const res = await fetch('/api/admin/logo', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setLogoPreview(null)
      set('logoUrl', undefined)
      onToast({ message: t.brandingForm.toastLogoDeleted, type: 'success' })
    } catch {
      onToast({ message: t.brandingForm.toastDeleteError, type: 'error' })
    } finally {
      setLogoRemoving(false)
    }
  }

  // ── Background image ──────────────────────────────────────────────────────────
  async function handleBgUpload(file: File) {
    setBgUploading(true)
    try {
      const form = new FormData()
      form.append('background', file)
      const res  = await fetch('/api/admin/background', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t.brandingForm.toastUploadError)
      setBgPreview(`${json.backgroundImage}?v=${Date.now()}`)
      set('backgroundImage', json.backgroundImage)
      onToast({ message: t.brandingForm.toastBgUpdated, type: 'success' })
    } catch (e: unknown) {
      onToast({ message: e instanceof Error ? e.message : t.brandingForm.toastUploadError, type: 'error' })
    } finally {
      setBgUploading(false)
      if (bgInputRef.current) bgInputRef.current.value = ''
    }
  }

  async function handleBgRemove() {
    setBgRemoving(true)
    try {
      const res = await fetch('/api/admin/background', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setBgPreview(null)
      set('backgroundImage', undefined)
      onToast({ message: t.brandingForm.toastBgDeleted, type: 'success' })
    } catch {
      onToast({ message: t.brandingForm.toastDeleteError, type: 'error' })
    } finally {
      setBgRemoving(false)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'branding', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: t.brandingForm.toastSaved, type: 'success' })
    } catch {
      onToast({ message: t.brandingForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

      {/* Nom du site */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.brandingForm.sectionIdentity}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.brandingForm.siteNameLabel}</label>
          <input
            type="text"
            value={data.siteName}
            onChange={e => set('siteName', e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Logo */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.brandingForm.sectionLogo}</h3>
        <p className="text-xs text-on-surface-variant">{t.brandingForm.logoDesc}</p>
        {logoPreview ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPreview}
              alt="Logo"
              className="h-16 w-auto max-w-[200px] object-cover rounded border border-outline-variant/20 bg-surface-container"
            />
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading} className="text-button text-xs">
                <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">upload</span>
                {t.brandingForm.logoReplace}
              </button>
              <button type="button" onClick={handleLogoRemove} disabled={logoRemoving} className="text-button text-xs text-error">
                {logoRemoving
                  ? <span className="material-symbols-outlined animate-spin text-sm leading-none" aria-hidden="true">progress_activity</span>
                  : <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">delete</span>
                }
                {t.brandingForm.logoDelete}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoUploading}
            className="flex flex-col items-center justify-center w-full border-2 border-dashed border-outline-variant/30 rounded-xl py-8 gap-2 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors"
          >
            {logoUploading
              ? <span className="material-symbols-outlined animate-spin text-2xl" aria-hidden="true">progress_activity</span>
              : <span className="material-symbols-outlined text-2xl" aria-hidden="true">add_photo_alternate</span>
            }
            <span className="text-sm">{logoUploading ? t.brandingForm.logoUploading : t.brandingForm.logoClickToChoose}</span>
            <span className="text-xs text-on-surface-variant/60">{t.brandingForm.logoFormats}</span>
          </button>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
        />
      </div>

      {/* Fond */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.brandingForm.sectionBackground}</h3>
        <p className="text-xs text-on-surface-variant">{t.brandingForm.bgDesc}</p>

        {/* Couleur de fond */}
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.brandingForm.bgColorLabel}</label>
          <div className="flex items-center gap-3">
            <input type="color" value={data.backgroundColor} onChange={e => set('backgroundColor', e.target.value)}
              className="w-10 h-10 rounded-lg border border-outline-variant/20 cursor-pointer bg-transparent p-0.5" />
            <input type="text" value={data.backgroundColor} onChange={e => set('backgroundColor', e.target.value)}
              className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface font-mono focus:outline-none focus:border-primary/50"
              placeholder="#f7f9fb" />
          </div>
        </div>

        {/* Image de fond */}
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.brandingForm.bgImageLabel}</label>
          <p className="text-xs text-on-surface-variant mb-3">{t.brandingForm.bgImageDesc}</p>
          {bgPreview ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgPreview}
                alt="Background"
                className="h-16 w-auto max-w-[200px] object-cover rounded border border-outline-variant/20 bg-surface-container"
              />
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => bgInputRef.current?.click()} disabled={bgUploading} className="text-button text-xs">
                  <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">upload</span>
                  {t.brandingForm.logoReplace}
                </button>
                <button type="button" onClick={handleBgRemove} disabled={bgRemoving} className="text-button text-xs text-error">
                  {bgRemoving
                    ? <span className="material-symbols-outlined animate-spin text-sm leading-none" aria-hidden="true">progress_activity</span>
                    : <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">delete</span>
                  }
                  {t.brandingForm.logoDelete}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              disabled={bgUploading}
              className="flex flex-col items-center justify-center w-full border-2 border-dashed border-outline-variant/30 rounded-xl py-8 gap-2 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors"
            >
              {bgUploading
                ? <span className="material-symbols-outlined animate-spin text-2xl" aria-hidden="true">progress_activity</span>
                : <span className="material-symbols-outlined text-2xl" aria-hidden="true">add_photo_alternate</span>
              }
              <span className="text-sm">{bgUploading ? t.brandingForm.logoUploading : t.brandingForm.logoClickToChoose}</span>
              <span className="text-xs text-on-surface-variant/60">{t.brandingForm.bgImageFormats}</span>
            </button>
          )}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleBgUpload(f) }}
          />
        </div>
      </div>

      {/* Couleur primaire */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.brandingForm.sectionColors}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.brandingForm.primaryColorLabel}</label>
          <div className="flex items-center gap-3">
            <input type="color" value={data.primaryColor} onChange={e => set('primaryColor', e.target.value)}
              className="w-10 h-10 rounded-lg border border-outline-variant/20 cursor-pointer bg-transparent p-0.5" />
            <input type="text" value={data.primaryColor} onChange={e => set('primaryColor', e.target.value)}
              className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface font-mono focus:outline-none focus:border-primary/50"
              placeholder="#565e74" />
          </div>
        </div>
      </div>

      {/* Mode sombre */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">{t.brandingForm.darkModeTitle}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{t.brandingForm.darkModeDesc}</p>
          </div>
          <button
            type="button" role="switch" aria-checked={data.darkMode}
            onClick={() => set('darkMode', !data.darkMode)}
            className={`w-11 h-6 rounded-full transition-colors ${data.darkMode ? 'bg-primary' : 'bg-outline-variant/40'}`}
          >
            <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-1 ${data.darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Aperçu */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">{t.brandingForm.sectionPreview}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" style={{ backgroundColor: data.primaryColor }}
            className="px-4 py-2 rounded-full text-white text-sm font-medium shadow">
            {t.brandingForm.primaryButton}
          </button>
          <span style={{ color: data.primaryColor }} className="text-sm font-semibold">
            {data.siteName || 'Leksis'}
          </span>
        </div>
      </div>

      </div>{/* end grid */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving
            ? <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
            : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          }
          {t.brandingForm.save}
        </button>
      </div>
    </div>
  )
}
