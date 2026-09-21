'use client'

import { useEffect, useRef, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { useOllamaMetrics } from './OllamaMetrics'
import { OllamaModelSelect, type ModelSuggestion } from './OllamaModelSelect'

// Approximate download sizes, shown next to models that are not installed yet
const TRANSLATION_SUGGESTIONS: ModelSuggestion[] = [
  { name: 'translategemma:27b', hint: '~17 GB' },
  { name: 'translategemma:12b', hint: '~8 GB' },
  { name: 'translategemma:4b',  hint: '~3 GB' },
]
const REWRITE_SUGGESTIONS: ModelSuggestion[] = [
  { name: 'qwen2.5:14b', hint: '~9 GB' },
  { name: 'qwen2.5:7b',  hint: '~5 GB' },
  { name: 'qwen2.5:3b',  hint: '~2 GB' },
  ...TRANSLATION_SUGGESTIONS,
]
const OCR_SUGGESTIONS: ModelSuggestion[] = [
  { name: 'maternion/LightOnOCR-2:latest' },
]

interface OllamaData {
  baseUrl:          string
  translationModel: string
  ocrModel:         string
  rewriteModel:     string
  sameModelForAll:  boolean
}

interface TestResult { ok: boolean; latencyMs?: number; message: string; models?: string[]; modelFound?: boolean }

interface Props {
  initial: Partial<OllamaData> & { model?: string } // backward-compat: old "model" field
  onToast: (t: ToastState) => void
}

export function OllamaServiceForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const { data: metrics, load: reloadMetrics } = useOllamaMetrics()
  const installed = metrics ? metrics.models.map(m => ({ name: m.name, size: m.size })) : null
  const legacyModel = initial.model ?? ''
  const [data, setData] = useState<OllamaData>({
    baseUrl:          initial.baseUrl          ?? '',
    translationModel: initial.translationModel ?? legacyModel,
    ocrModel:         initial.ocrModel         ?? 'maternion/LightOnOCR-2:latest',
    rewriteModel:     initial.rewriteModel     ?? legacyModel,
    sameModelForAll:  initial.sameModelForAll  ?? false,
  })
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [warming,  setWarming]  = useState(false)
  const [result,   setResult]   = useState<TestResult | null>(null)

  function setField<K extends keyof OllamaData>(k: K, v: OllamaData[K]) {
    setData(prev => {
      const next = { ...prev, [k]: v }
      if (next.sameModelForAll && k === 'translationModel') {
        next.rewriteModel = v as string
      }
      return next
    })
  }

  function toggleSameModel(checked: boolean) {
    setData(prev => ({
      ...prev,
      sameModelForAll: checked,
      ...(checked ? { rewriteModel: prev.translationModel } : {}),
    }))
  }

  async function handleSave(successMessage?: string) {
    setSaving(true)
    try {
      const payload = {
        service: 'ollama',
        baseUrl:          data.baseUrl,
        translationModel: data.translationModel,
        ocrModel:         data.ocrModel,
        rewriteModel:     data.sameModelForAll ? data.translationModel : data.rewriteModel,
        sameModelForAll:  data.sameModelForAll,
      }
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      onToast({ message: successMessage ?? t.ollamaForm.toastSaved, type: 'success' })
      reloadMetrics()
    } catch {
      onToast({ message: t.ollamaForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // "Download and use" finishes long after the render that started it: save with the latest form state
  const saveRef = useRef(handleSave)
  useEffect(() => { saveRef.current = handleSave })
  function savePulled(model: string) {
    void saveRef.current(t.ollamaForm.toastPulledUsed.replace('{0}', model))
  }

  async function handleWarmup() {
    const models = [...new Set([
      data.translationModel,
      data.sameModelForAll ? data.translationModel : data.rewriteModel,
      data.ocrModel,
    ].filter(Boolean))]
    setWarming(true)
    try {
      const res = await fetch('/api/admin/services/ollama/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models }),
      })
      const json = await res.json()
      if (!res.ok || json.errors?.length) {
        onToast({ message: t.ollamaForm.toastWarmupError, type: 'error' })
      } else {
        onToast({ message: t.ollamaForm.toastWarmupDone.replace('{0}', String(json.loaded.length)), type: 'success' })
      }
    } catch {
      onToast({ message: t.ollamaForm.toastWarmupError, type: 'error' })
    } finally {
      setWarming(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/services/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      setResult(json)
    } catch {
      setResult({ ok: false, message: t.ollamaForm.networkError })
    } finally {
      setTesting(false)
    }
  }

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">smart_toy</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">Ollama</h3>
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm text-on-surface mb-1.5">{t.ollamaForm.serverUrlLabel}</label>
        <input
          type="url"
          value={data.baseUrl}
          onChange={e => setField('baseUrl', e.target.value)}
          className={inputCls}
          placeholder="http://192.168.1.39:11434"
        />
      </div>

      {/* Checkbox même modèle partout */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={data.sameModelForAll}
          onChange={e => toggleSameModel(e.target.checked)}
          className="h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary"
        />
        <span className="text-sm text-on-surface">{t.ollamaForm.sameModelLabel}</span>
      </label>

      {data.sameModelForAll ? (
        <OllamaModelSelect
          label={t.ollamaForm.modelAllLabel}
          value={data.translationModel}
          onChange={v => setField('translationModel', v)}
          installed={installed}
          suggestions={TRANSLATION_SUGGESTIONS}
          inputCls={inputCls}
          onPulled={savePulled}
          onRefresh={reloadMetrics}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <OllamaModelSelect
            label={t.ollamaForm.modelTranslation}
            value={data.translationModel}
            onChange={v => setField('translationModel', v)}
            installed={installed}
            suggestions={TRANSLATION_SUGGESTIONS}
            inputCls={inputCls}
            onPulled={savePulled}
            onRefresh={reloadMetrics}
          />
          <OllamaModelSelect
            label={t.ollamaForm.modelRewrite}
            value={data.rewriteModel}
            onChange={v => setField('rewriteModel', v)}
            installed={installed}
            suggestions={REWRITE_SUGGESTIONS}
            inputCls={inputCls}
            onPulled={savePulled}
            onRefresh={reloadMetrics}
          />
          <OllamaModelSelect
            label={t.ollamaForm.modelOcr}
            value={data.ocrModel}
            onChange={v => setField('ocrModel', v)}
            installed={installed}
            suggestions={OCR_SUGGESTIONS}
            inputCls={inputCls}
            onPulled={savePulled}
            onRefresh={reloadMetrics}
          />
        </div>
      )}

      {/* Résultat du test */}
      {result && (
        <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
          result.ok ? 'bg-primary/5 border border-primary/20 text-on-surface' : 'bg-error/5 border border-error/20 text-error'
        }`}>
          <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
            {result.ok ? 'check_circle' : 'error'}
          </span>
          <div className="space-y-1">
            <p>{result.message}</p>
            {result.ok && result.latencyMs !== undefined && (
              <p className="text-xs text-on-surface-variant">{result.latencyMs}ms</p>
            )}
            {result.models && result.models.length > 0 && (
              <details className="text-xs text-on-surface-variant">
                <summary className="cursor-pointer hover:text-on-surface">{result.models.length} {t.ollamaForm.modelsAvailable}</summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {result.models.map(m => (
                    <li key={m} className={m === data.translationModel ? 'text-primary font-medium' : ''}>{m}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleTest}
          disabled={testing || warming || !data.baseUrl}
          className="text-button disabled:opacity-40"
        >
          {testing ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">network_check</span>
          )}
          {t.ollamaForm.testConnection}
        </button>
        <button
          onClick={handleWarmup}
          disabled={warming || testing || !data.baseUrl}
          className="text-button disabled:opacity-40"
        >
          {warming ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">memory</span>
          )}
          {warming ? t.ollamaForm.warmupLoading : t.ollamaForm.warmup}
        </button>
        <div className="flex-1" />
        <button onClick={() => handleSave()} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.ollamaForm.save}
        </button>
      </div>
    </div>
  )
}
