import { z } from 'zod'
import { DOCUMENT_MAX_CHARS, IMAGE_MAX_BYTES, RATE_LIMIT_PER_MIN, TEXT_MAX_CHARS } from '@/lib/validators'

// Schémas des réglages du site (site_settings), utilisés à l'enregistrement ET à l'import d'une configuration.
// Ces valeurs finissent dans du CSS (<style>, url('…')), dans des attributs href ou dans des prompts :
// on n'accepte que le format attendu. Les clés inconnues sont retirées (comportement par défaut de zod).

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid color')
const optionalColor = z.union([hexColor, z.literal('')])

// Seules les images envoyées par l'admin sont admises comme URL de logo / fond
const assetUrl = z.string().regex(/^\/api\/site-assets\/[A-Za-z0-9._-]+(\?v=\d+)?$/, 'Invalid asset URL')

export const BrandingSchema = z.object({
  siteName:        z.string().max(80),
  primaryColor:    hexColor,
  secondaryColor:  hexColor.optional(),
  backgroundColor: optionalColor.optional(),
  logoUrl:         assetUrl.optional(),
  backgroundImage: assetUrl.optional(),
  headerLogoSize:  z.string().regex(/^\d{1,3}$/).optional(),
})

const cssLength = z.string().regex(/^\d{1,4}(\.\d{1,3})?(px|rem|em|%)?$/, 'Invalid length')

// Lien du footer : http(s), mailto ou chemin du site — jamais javascript: ni data:
const footerUrl = z.string().max(500).refine(
  u => u === '' || /^(https?:\/\/|mailto:|\/)/i.test(u),
  'Invalid link',
)

export const DesignSchema = z.object({
  buttonRadius:    cssLength.optional(),
  footerText:      z.string().max(300).optional(),
  footerTextColor: optionalColor.optional(),
  footerLinks:     z.array(z.object({ label: z.string().max(60), url: footerUrl })).max(10).optional(),
  headerLogoSize:  z.string().regex(/^\d{1,3}$/).optional(), // ancien emplacement, lu en repli
})

/** Conservation des journaux, en jours (0 = indéfiniment) : appliquée automatiquement par lib/retention.ts */
export const RETENTION_DEFAULTS = { usageRetentionDays: 365, auditRetentionDays: 730 } as const
export const RETENTION_MAX_DAYS = 3650

export const GeneralSchema = z.object({
  contactEmail:       z.string().max(254),
  globalBanner:       z.string().max(500),
  maintenanceMode:    z.boolean(),
  maintenanceMessage: z.string().max(1000),
  usageRetentionDays: z.number().int().min(0).max(RETENTION_MAX_DAYS),
  auditRetentionDays: z.number().int().min(0).max(RETENTION_MAX_DAYS),
}).partial()

const langCode = z.string().regex(/^(auto|[A-Za-z0-9-]{1,20})$/, 'Invalid language code')

export const FeaturesSchema = z.object({
  tabs: z.object({
    text: z.boolean().optional(), document: z.boolean().optional(),
    image: z.boolean().optional(), rewrite: z.boolean().optional(),
  }).optional(),
  defaults: z.object({
    sourceLang: langCode.optional(),
    targetLang: langCode.optional(),
    formality:  z.enum(['Formal', 'Informal']).optional(),
  }).optional(),
  limits: z.object({
    maxTextChars:    z.number().int().min(100).max(200_000).optional(),
    maxDocChars:     z.number().int().min(100).max(500_000).optional(),
    maxImageMB:      z.number().int().min(1).max(50).optional(),
    rateLimitPerMin: z.number().int().min(0).max(10_000).optional(),
  }).optional(),
})

export const ToneSchema = z.object({
  id:          z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid tone id'),
  labels:      z.object({
    en: z.string().min(1).max(60),
    fr: z.string().max(60).optional(),
    de: z.string().max(60).optional(),
    it: z.string().max(60).optional(),
  }),
  instruction: z.string().min(1).max(500),
  enabled:     z.boolean().optional(),
})

/** ai_config importé : ni clé API ni autorisation « serveur externe » (ceux de cette instance sont conservés). */
export const AiConfigImportSchema = z.object({
  provider:         z.enum(['ollama', 'openai']),
  baseUrl:          z.string().url().refine(u => /^https?:\/\//i.test(u), 'Invalid URL'),
  translationModel: z.string().max(200),
  ocrModel:         z.string().max(200),
  rewriteModel:     z.string().max(200),
  sameModelForAll:  z.boolean().optional(),
  numCtx:           z.number().int().min(2048).max(262144).optional(),
})

export const TonesSchema = z.array(ToneSchema).min(1).max(6)

/**
 * Valeurs par défaut de chaque réglage (« Reset to defaults »). Les limites viennent des constantes de validators.ts,
 * seules valeurs de repli quand la base est injoignable : une seule source. `rewrite_tones` est dans lib/tones.ts
 * (DEFAULT_TONES, réservé au serveur).
 */
export const SETTING_DEFAULTS = {
  branding: { siteName: 'Leksis', primaryColor: '#565e74', secondaryColor: '#506076', headerLogoSize: '32' },
  design:   { buttonRadius: '0.75rem', footerText: '© Leksis', footerLinks: [] },
  general:  { contactEmail: '', globalBanner: '', maintenanceMode: false, maintenanceMessage: '', ...RETENTION_DEFAULTS },
  features: {
    tabs:     { text: true, document: true, image: true, rewrite: true },
    defaults: { sourceLang: 'auto', targetLang: 'en', formality: 'Informal' },
    limits:   {
      maxTextChars:    TEXT_MAX_CHARS,
      maxDocChars:     DOCUMENT_MAX_CHARS,
      maxImageMB:      IMAGE_MAX_BYTES / (1024 * 1024),
      rateLimitPerMin: RATE_LIMIT_PER_MIN,
    },
  },
} as const

/** Schéma de chaque clé modifiable depuis l'admin (PATCH) ou importable. */
export const SETTING_SCHEMAS = {
  branding:      BrandingSchema,
  design:        DesignSchema,
  general:       GeneralSchema,
  features:      FeaturesSchema,
  rewrite_tones: TonesSchema,
} as const

export type ValidatedSettingKey = keyof typeof SETTING_SCHEMAS

export function isValidatedSettingKey(k: string): k is ValidatedSettingKey {
  return k in SETTING_SCHEMAS
}

/** Valide `value` pour `key` : renvoie la valeur nettoyée (clés inconnues retirées) ou l'erreur. */
export function parseSetting(
  key: ValidatedSettingKey,
  value: unknown,
): { ok: true; value: object } | { ok: false; error: z.ZodError } {
  const parsed = SETTING_SCHEMAS[key].safeParse(value)
  return parsed.success ? { ok: true, value: parsed.data as object } : { ok: false, error: parsed.error }
}
