'use client'

import { useEffect, useRef, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { useOllamaMetrics } from './OllamaMetrics'
import { OllamaModelSelect, type ModelSuggestion, type InstalledModel } from './OllamaModelSelect'
import { aiModeOf, DEFAULT_NUM_CTX, isValidNumCtx, LOCAL_OLLAMA_URL, type AiMode, type AiPublicConfig, type AiProviderId } from '@/lib/llm/types'

// Approximate download sizes, shown next to Ollama models that are not installed yet
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

interface ModelsData {
  translationModel: string
  ocrModel:         string
  rewriteModel:     string
  sameModelForAll:  boolean
}

interface TestResult {
  ok:          boolean
  latencyMs?:  number
  models?:     string[]
  modelFound?: boolean | null
  message?:    string
  code?:       string
}

interface Props {
  initial: AiPublicConfig
  onToast: (t: ToastState) => void
  activeTab: 'config' | 'models' | 'monitoring'
}

const trimSlash = (u: string) => u.replace(/\/+$/, '')

export function AiServiceForm({ initial, onToast, activeTab }: Props) {
  const { t } = useI18n()
  const of = t.ollamaForm
  const { data: metrics, load: reloadMetrics } = useOllamaMetrics()

  const [provider,      setProvider]      = useState<AiProviderId>(initial.provider)
  const [baseUrl,       setBaseUrl]       = useState(initial.baseUrl)
  // Ce que l'admin a choisi : « local » et « distant » ont le même fournisseur (Ollama), seule l'adresse les distingue
  const [mode,          setMode]          = useState<AiMode>(aiModeOf(initial.provider, initial.baseUrl))
  // Le conteneur Ollama de ce serveur répond-il ? (null = pas encore su)
  const [localUp,       setLocalUp]       = useState<boolean | null>(null)
  const [apiKey,       setApiKey]        = useState('')
  const [hasApiKey,     setHasApiKey]     = useState(initial.hasApiKey)
  const [clearApiKey,   setClearApiKey]   = useState(false)
  const [allowExternal, setAllowExternal] = useState(initial.allowExternal)
  const [numCtx,        setNumCtx]        = useState(String(initial.numCtx ?? DEFAULT_NUM_CTX))
  const [data, setData] = useState<ModelsData>({
    translationModel: initial.translationModel,
    ocrModel:         initial.ocrModel,
    rewriteModel:     initial.rewriteModel,
    sameModelForAll:  initial.sameModelForAll,
  })
  const [savedKey, setSavedKey] = useState(`${initial.provider}|${trimSlash(initial.baseUrl)}`)
  const [tested,   setTested]   = useState<{ key: string; models: string[] } | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [warming,  setWarming]  = useState(false)
  const [result,   setResult]   = useState<TestResult | null>(null)

  const currentKey = `${provider}|${trimSlash(baseUrl)}`
  const numCtxValid = isValidNumCtx(numCtx)

  // Modèles du serveur : métriques du serveur enregistré, ou résultat du dernier test pour ce serveur
  let installed: InstalledModel[] | null = null
  if (metrics && metrics.provider === provider && currentKey === savedKey) {
    installed = metrics.models.map(m => ({ name: m.name, size: m.size }))
  } else if (tested && tested.key === currentKey) {
    installed = tested.models.map(name => ({ name, size: 0 }))
  }
  const canPull = provider === 'ollama' && metrics?.provider === 'ollama' && currentKey === savedKey

  // Aucun modèle configuré et le serveur en propose : préremplir avec le premier disponible
  // plutôt que de laisser un champ vide ou un nom deviné au hasard. Une seule fois — ne doit
  // jamais écraser un choix que l'utilisateur est en train de faire.
  const autoFilled = useRef(false)
  useEffect(() => {
    if (autoFilled.current || !installed || installed.length === 0) return
    autoFilled.current = true
    const first = installed[0].name
    setData(prev => (
      prev.translationModel && prev.ocrModel && prev.rewriteModel
        ? prev
        : {
            ...prev,
            translationModel: prev.translationModel || first,
            ocrModel:         prev.ocrModel || first,
            rewriteModel:     prev.rewriteModel || first,
          }
    ))
  }, [installed])

  function setField<K extends keyof ModelsData>(k: K, v: ModelsData[K]) {
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/services/ai/local', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: { available?: boolean }) => { if (!cancelled) setLocalUp(j.available === true) })
      .catch(() => { if (!cancelled) setLocalUp(false) })
    return () => { cancelled = true }
  }, [])

  function changeMode(next: AiMode) {
    if (next === mode) return
    setMode(next)
    setResult(null)
    if (next === 'ollama-local') {
      setProvider('ollama')
      setBaseUrl(LOCAL_OLLAMA_URL)
      return
    }
    setProvider(next === 'openai' ? 'openai' : 'ollama')
    // Une adresse de l'autre mode n'a pas de sens ici : on la vide
    if (mode === 'ollama-local') setBaseUrl('')
    else if (next === 'openai' && /:11434\/?$/.test(baseUrl)) setBaseUrl('')
    else if (next === 'ollama-remote' && /\/v1\/?$/.test(baseUrl)) setBaseUrl('')
  }

  async function handleSave(successMessage?: string) {
    setSaving(true)
    try {
      const payload = {
        service: 'ai',
        provider,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        ...(clearApiKey ? { clearApiKey: true } : {}),
        translationModel: data.translationModel,
        ocrModel:         data.ocrModel,
        rewriteModel:     data.sameModelForAll ? data.translationModel : data.rewriteModel,
        sameModelForAll:  data.sameModelForAll,
        allowExternal,
        // Contexte Ollama : ignoré (et non envoyé) avec une API OpenAI-compatible ; valeur invalide → défaut serveur
        ...(provider === 'ollama' && numCtxValid ? { numCtx: Number(numCtx) } : {}),
      }
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: unknown }
        onToast({
          message: json.error === 'external_blocked' ? of.externalBlocked : of.toastError,
          type: 'error',
        })
        return
      }
      // Même règle que le serveur : la clé ne suit pas un changement de serveur
      setHasApiKey(clearApiKey ? false : apiKey ? true : currentKey === savedKey ? hasApiKey : false)
      setSavedKey(currentKey)
      setApiKey('')
      setClearApiKey(false)
      onToast({ message: successMessage ?? of.toastSaved, type: 'success' })
      reloadMetrics()
    } catch {
      onToast({ message: of.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // "Download and use" finishes long after the render that started it: save with the latest form state
  const saveRef = useRef(handleSave)
  useEffect(() => { saveRef.current = handleSave })
  function savePulled(model: string) {
    void saveRef.current(of.toastPulledUsed.replace('{0}', model))
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
        onToast({ message: of.toastWarmupError, type: 'error' })
      } else {
        onToast({ message: of.toastWarmupDone.replace('{0}', String(json.loaded.length)), type: 'success' })
      }
    } catch {
      onToast({ message: of.toastWarmupError, type: 'error' })
    } finally {
      setWarming(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/services/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          ...(apiKey ? { apiKey } : {}),
          allowExternal,
          translationModel: data.translationModel,
        }),
      })
      const json = await res.json() as TestResult
      if (!res.ok) {
        setResult({ ok: false, message: of.networkError })
      } else {
        setResult(json)
        if (json.ok && json.models) setTested({ key: currentKey, models: json.models })
      }
    } catch {
      setResult({ ok: false, message: of.networkError })
    } finally {
      setTesting(false)
    }
  }

  function testMessage(r: TestResult): string {
    if (r.code === 'external_blocked') return of.externalBlocked
    if (!r.ok) return of.testFailed.replace('{0}', r.message ?? '')
    const model = data.translationModel.trim()
    if (!model || r.modelFound === null || r.modelFound === undefined) {
      return of.testOk.replace('{0}', String(r.models?.length ?? 0))
    }
    return (r.modelFound ? of.testOkModel : of.testModelMissing).replace('{0}', model)
  }

  if (activeTab === 'monitoring') return null

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'

  const selectProps = {
    installed,
    inputCls,
    canPull,
    onPulled: savePulled,
    onRefresh: reloadMetrics,
  }
  const suggestions = provider === 'ollama'
  const spinner = <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">
          {activeTab === 'config' ? 'settings_ethernet' : 'smart_toy'}
        </span>
        <h3 className="font-headline font-semibold text-base text-on-surface">
          {activeTab === 'config' ? of.tabConfig : of.tabModels}
        </h3>
      </div>

      {activeTab === 'config' && (
        <>
          {/* Fournisseur */}
          <div>
            <span className="block text-sm text-on-surface mb-1.5">{of.providerLabel}</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label={of.providerLabel}>
              {([
                { id: 'ollama-local',  icon: 'dns',   title: of.providerOllamaLocal,  desc: of.providerOllamaLocalDesc },
                { id: 'ollama-remote', icon: 'lan',   title: of.providerOllamaRemote, desc: of.providerOllamaRemoteDesc },
                { id: 'openai',        icon: 'cloud', title: of.providerOpenai,       desc: of.providerOpenaiDesc },
              ] as const).map(card => {
                // Le conteneur local ne se crée pas depuis l'admin : sans lui, la carte n'est pas choisissable
                const unavailable = card.id === 'ollama-local' && localUp === false && mode !== 'ollama-local'
                return (
                  <button
                    key={card.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === card.id}
                    disabled={unavailable}
                    onClick={() => changeMode(card.id)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      mode === card.id
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/30 hover:border-outline-variant'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      <span className="material-symbols-outlined text-[1.1rem] leading-none text-on-surface-variant" aria-hidden="true">{card.icon}</span>
                      {card.title}
                    </span>
                    <span className="block text-xs text-on-surface-variant mt-1">
                      {unavailable ? of.localUnavailable : card.desc}
                    </span>
                  </button>
                )
              })}
            </div>
            {mode === 'ollama-local' && localUp === false && (
              <p className="mt-2 text-xs text-error">{of.localDown}</p>
            )}
          </div>

          {/* URL : imposée pour le conteneur local, à saisir pour les autres */}
          {mode === 'ollama-local' ? (
            <p className="text-xs text-on-surface-variant">
              {of.localUrlNote.replace('{0}', LOCAL_OLLAMA_URL)}
            </p>
          ) : (
            <div>
              <label htmlFor="ai-base-url" className="block text-sm text-on-surface mb-1.5">{of.serverUrlLabel}</label>
              <input
                id="ai-base-url"
                type="url"
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); setResult(null) }}
                className={inputCls}
                placeholder={provider === 'ollama' ? 'http://192.168.1.39:11434' : 'http://192.168.1.50:8000/v1'}
              />
              <p className="mt-1 text-xs text-on-surface-variant">
                {provider === 'ollama' ? of.urlHintOllama : of.urlHintOpenai}
              </p>
            </div>
          )}

          {/* Clé API (API OpenAI-compatible) */}
          {provider === 'openai' && (
            <div>
              <label htmlFor="ai-api-key" className="block text-sm text-on-surface mb-1.5">
                {of.apiKeyLabel} <span className="text-on-surface-variant">{of.apiKeyOptional}</span>
              </label>
              <input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setClearApiKey(false) }}
                className={inputCls}
                placeholder={hasApiKey && !clearApiKey ? '••••••••' : 'sk-…'}
              />
              {hasApiKey && !clearApiKey && (
                <p className="mt-1 text-xs text-on-surface-variant flex items-center gap-2">
                  <span>{of.apiKeySaved}</span>
                  <button type="button" onClick={() => { setClearApiKey(true); setApiKey('') }} className="text-button text-xs">
                    {of.apiKeyRemove}
                  </button>
                </p>
              )}
              {clearApiKey && (
                <p className="mt-1 text-xs text-on-surface-variant">{of.apiKeyWillRemove}</p>
              )}
            </div>
          )}

          {/* Serveurs hors réseau privé (le conteneur local est toujours sur le réseau privé) */}
          {mode !== 'ollama-local' && <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-[rgba(230,126,34,0.3)] bg-[rgba(230,126,34,0.06)] p-3">
            <input
              type="checkbox"
              checked={allowExternal}
              onChange={e => setAllowExternal(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary"
            />
            <span>
              <span className="block text-sm text-on-surface">{of.externalLabel}</span>
              <span className="block text-xs text-on-surface-variant mt-0.5">{of.externalDesc}</span>
            </span>
          </label>}

          {/* Résultat du test */}
          {result && (
            <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
              result.ok ? 'bg-primary/5 border border-primary/20 text-on-surface' : 'bg-error/5 border border-error/20 text-error'
            }`}>
              <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
                {result.ok ? 'check_circle' : 'error'}
              </span>
              <div className="space-y-1 min-w-0">
                <p className="break-words">{testMessage(result)}</p>
                {result.ok && result.latencyMs !== undefined && (
                  <p className="text-xs text-on-surface-variant">{result.latencyMs}ms</p>
                )}
                {result.models && result.models.length > 0 && (
                  <details className="text-xs text-on-surface-variant">
                    <summary className="cursor-pointer hover:text-on-surface">{result.models.length} {of.modelsAvailable}</summary>
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
        </>
      )}

      {activeTab === 'models' && (
        <>
          {/* Checkbox même modèle partout */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={data.sameModelForAll}
              onChange={e => toggleSameModel(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary"
            />
            <span className="text-sm text-on-surface">{of.sameModelLabel}</span>
          </label>

          {data.sameModelForAll ? (
            <OllamaModelSelect
              label={of.modelAllLabel}
              value={data.translationModel}
              onChange={v => setField('translationModel', v)}
              suggestions={suggestions ? TRANSLATION_SUGGESTIONS : []}
              {...selectProps}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <OllamaModelSelect
                label={of.modelTranslation}
                value={data.translationModel}
                onChange={v => setField('translationModel', v)}
                suggestions={suggestions ? TRANSLATION_SUGGESTIONS : []}
                {...selectProps}
              />
              <OllamaModelSelect
                label={of.modelRewrite}
                value={data.rewriteModel}
                onChange={v => setField('rewriteModel', v)}
                suggestions={suggestions ? REWRITE_SUGGESTIONS : []}
                {...selectProps}
              />
              <OllamaModelSelect
                label={of.modelOcr}
                value={data.ocrModel}
                onChange={v => setField('ocrModel', v)}
                suggestions={suggestions ? OCR_SUGGESTIONS : []}
                {...selectProps}
              />
            </div>
          )}

          {/* Contexte Ollama */}
          {provider === 'ollama' && (
            <div>
              <label htmlFor="ai-num-ctx" className="block text-sm text-on-surface mb-1.5">{of.numCtxLabel}</label>
              <input
                id="ai-num-ctx"
                type="number"
                min={2048}
                max={262144}
                step={1024}
                value={numCtx}
                onChange={e => setNumCtx(e.target.value)}
                className={`${inputCls} sm:w-1/3 ${numCtxValid ? '' : 'border-error/60'}`}
              />
              <p className="mt-1 text-xs text-on-surface-variant">{of.numCtxHint.replace('{0}', String(DEFAULT_NUM_CTX))}</p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-outline-variant/10">
        {activeTab === 'config' && (
          <button
            onClick={handleTest}
            disabled={testing || warming || !baseUrl}
            className="text-button disabled:opacity-40"
          >
            {testing ? spinner : (
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">network_check</span>
            )}
            {of.testConnection}
          </button>
        )}
        {activeTab === 'models' && canPull && (
          <button
            onClick={handleWarmup}
            disabled={warming || testing || !baseUrl}
            className="text-button disabled:opacity-40"
          >
            {warming ? spinner : (
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">memory</span>
            )}
            {warming ? of.warmupLoading : of.warmup}
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => handleSave()} disabled={saving || !baseUrl || (provider === 'ollama' && !numCtxValid)} className="action-btn disabled:opacity-40">
          {saving ? spinner : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {of.save}
        </button>
      </div>
    </div>
  )
}
