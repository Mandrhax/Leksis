// Client-safe : seuils de la traduction de texte automatique (Réglages → Features & limits, clé
// `features.textTranslation`). Partagé par le schéma zod, le formulaire admin, la page d'accueil et /api/translate.

export interface TextTranslationConfig {
  /** Pause de frappe avant la traduction automatique (ms) */
  debounceMs:         number
  /** En dessous, rien ne part au modèle (caractères, après trim) */
  minChars:           number
  /** En détection automatique, la frappe ne déclenche rien sous ce nombre de caractères (le bouton, si) */
  autoDetectMinChars: number
  /** Durée de vie d'une traduction en mémoire côté serveur (minutes, 0 = pas de cache) */
  cacheTtlMinutes:    number
  /** Nombre maximal de traductions gardées en mémoire (toutes personnes confondues) */
  cacheMaxEntries:    number
  /** Paragraphe précédent envoyé comme contexte quand un seul paragraphe est retraduit */
  segmentContext:     boolean
}

/** Seuils utiles au navigateur (le cache reste une affaire du serveur) */
export type TextTriggerConfig = Pick<TextTranslationConfig, 'debounceMs' | 'minChars' | 'autoDetectMinChars'>

export function toTextTriggers(cfg: TextTranslationConfig): TextTriggerConfig {
  return { debounceMs: cfg.debounceMs, minChars: cfg.minChars, autoDetectMinChars: cfg.autoDetectMinChars }
}

export const TEXT_TRANSLATION_DEFAULTS: TextTranslationConfig = {
  debounceMs:         1000,
  minChars:           3,
  autoDetectMinChars: 20,
  cacheTtlMinutes:    30,
  cacheMaxEntries:    2000,
  segmentContext:     true,
}

/** Bornes communes au schéma zod et aux champs du formulaire */
export const TEXT_TRANSLATION_BOUNDS = {
  debounceMs:         { min: 200, max: 5000 },
  minChars:           { min: 1,   max: 100 },
  autoDetectMinChars: { min: 0,   max: 200 },
  cacheTtlMinutes:    { min: 0,   max: 1440 },
  cacheMaxEntries:    { min: 0,   max: 50_000 },
} as const

/** Valeur enregistrée (partielle, ou absente sur une ancienne installation) complétée par les défauts */
export function resolveTextTranslationConfig(value: unknown): TextTranslationConfig {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<TextTranslationConfig>
  const num = (k: keyof typeof TEXT_TRANSLATION_BOUNDS) => {
    const n = v[k]
    const { min, max } = TEXT_TRANSLATION_BOUNDS[k]
    return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : TEXT_TRANSLATION_DEFAULTS[k]
  }
  return {
    debounceMs:         num('debounceMs'),
    minChars:           num('minChars'),
    autoDetectMinChars: num('autoDetectMinChars'),
    cacheTtlMinutes:    num('cacheTtlMinutes'),
    cacheMaxEntries:    num('cacheMaxEntries'),
    segmentContext:     typeof v.segmentContext === 'boolean' ? v.segmentContext : TEXT_TRANSLATION_DEFAULTS.segmentContext,
  }
}
