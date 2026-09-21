'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useOllamaPull } from '@/hooks/useOllamaPull'
import { formatBytes } from './OllamaMetrics'

export interface ModelSuggestion { name: string; hint?: string }
export interface InstalledModel  { name: string; size: number }

const OTHER = '__other__'

// "qwen2.5" and "qwen2.5:latest" are the same model for Ollama
function sameModel(a: string, b: string): boolean {
  const norm = (n: string) => (n.includes(':') ? n : `${n}:latest`)
  return norm(a.trim()) === norm(b.trim())
}

interface Props {
  label:       string
  value:       string
  onChange:    (value: string) => void
  /** Models installed on the server — null when the server could not be queried. */
  installed:   InstalledModel[] | null
  suggestions: ModelSuggestion[]
  inputCls:    string
  /** false = le serveur ne sait pas télécharger (API OpenAI-compatible) : simple avertissement */
  canPull:     boolean
  /** Called once a model has been downloaded from this control (use it → save). */
  onPulled:    (model: string) => void
  /** Called after a download so the installed list can be reloaded. */
  onRefresh:   () => void
}

/**
 * Model picker: installed models, suggestions still to download, or a free name.
 * Choosing a model that is not installed offers "Download and use".
 */
export function OllamaModelSelect({ label, value, onChange, installed, suggestions, inputCls, canPull, onPulled, onRefresh }: Props) {
  const { t } = useI18n()
  const of = t.ollamaForm
  const id = useId()
  const { pull, pulling, progress, status } = useOllamaPull()
  const [custom, setCustom] = useState(false)
  const [done,   setDone]   = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // A download can outlive the render that started it: always call the latest callbacks
  const latest = useRef({ onPulled, onRefresh })
  useEffect(() => { latest.current = { onPulled, onRefresh } })

  const name = value.trim()

  function change(next: string) {
    setError(null)
    setDone(false)
    onChange(next)
  }

  // Server unknown (unreachable / still loading): plain input, suggestions as a datalist
  if (installed === null) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm text-on-surface mb-1.5">{label}</label>
        <input
          id={id}
          type="text"
          list={`${id}-suggestions`}
          value={value}
          onChange={e => change(e.target.value)}
          className={inputCls}
          placeholder={suggestions[0]?.name}
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.map(s => <option key={s.name} value={s.name} />)}
        </datalist>
      </div>
    )
  }

  const installedMatch = installed.find(m => sameModel(m.name, name))
  const suggestionMatch = suggestions.find(s => sameModel(s.name, name))
  const notInstalledSuggestions = suggestions.filter(s => !installed.some(m => sameModel(m.name, s.name)))
  const showCurrent = name !== '' && !installedMatch && !suggestionMatch && !custom
  const selectValue = custom ? OTHER : (installedMatch?.name ?? suggestionMatch?.name ?? name)
  const needsPull = name !== '' && !installedMatch && !done

  async function handlePull() {
    setError(null)
    const result = await pull(name)
    if (result.ok) {
      setDone(true)
      latest.current.onRefresh()
      latest.current.onPulled(name)
    } else {
      setError(result.error ? `${of.pullError}: ${result.error}` : of.pullError)
    }
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm text-on-surface mb-1.5">{label}</label>
      <select
        id={id}
        value={selectValue}
        disabled={pulling}
        onChange={e => {
          if (e.target.value === OTHER) { setCustom(true); setError(null); setDone(false) }
          else { setCustom(false); change(e.target.value) }
        }}
        className={`${inputCls} disabled:opacity-50`}
      >
        {name === '' && !custom && <option value="" disabled>—</option>}
        {showCurrent && (
          <optgroup label={of.modelGroupCurrent}>
            <option value={name}>{name}</option>
          </optgroup>
        )}
        {installed.length > 0 && (
          <optgroup label={of.modelGroupInstalled}>
            {installed.map(m => (
              <option key={m.name} value={m.name}>{m.size > 0 ? `${m.name} · ${formatBytes(m.size)}` : m.name}</option>
            ))}
          </optgroup>
        )}
        {notInstalledSuggestions.length > 0 && (
          <optgroup label={of.modelGroupSuggested}>
            {notInstalledSuggestions.map(s => (
              <option key={s.name} value={s.name}>{s.name}{s.hint ? ` (${s.hint})` : ''}</option>
            ))}
          </optgroup>
        )}
        <option value={OTHER}>{of.modelOther}</option>
      </select>

      {custom && (
        <input
          type="text"
          value={value}
          onChange={e => change(e.target.value)}
          disabled={pulling}
          autoFocus
          placeholder={of.modelCustomPlaceholder}
          className={`${inputCls} mt-2 disabled:opacity-50`}
        />
      )}

      {needsPull && (
        <div className="mt-2 flex flex-col gap-2">
          {pulling ? (
            <div className="flex flex-col gap-1.5">
              <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                {progress !== null ? (
                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                ) : (
                  <div className="h-full bg-primary/40 rounded-full animate-pulse w-full" />
                )}
              </div>
              <p className="text-xs text-on-surface-variant truncate">
                {of.modelPullingUse}{progress !== null ? ` ${progress}%` : ''}{status ? ` — ${status}` : ''}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-on-surface-variant flex items-center gap-1 min-w-0">
                <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">
                  {canPull ? 'cloud_download' : 'info'}
                </span>
                <span className="truncate">{canPull ? of.modelNotInstalled : of.modelNotListed}</span>
              </span>
              {canPull && (
                <button type="button" onClick={handlePull} className="text-button text-xs shrink-0">
                  {of.modelPullAndUse}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && !pulling && (
        <p className="mt-2 text-xs text-error flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}
    </div>
  )
}
