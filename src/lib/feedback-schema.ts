import { z } from 'zod'

// « Signaler un problème ou suggérer une amélioration » : constantes et schémas partagés par le formulaire
// (client), la route POST /api/feedback et la boîte de réception de l'admin. Client-safe : pas d'I/O.

export const FEEDBACK_CATEGORIES = ['problem', 'improvement', 'translation', 'other'] as const
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]

export const FEEDBACK_STATUSES = ['new', 'in_progress', 'done', 'archived'] as const
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number]

export const FEEDBACK_MAX_CHARS       = 5000
export const FEEDBACK_NOTE_MAX_CHARS  = 2000
export const FEEDBACK_MAX_IMAGES      = 5
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Envois par utilisateur et par heure */
export const FEEDBACK_PER_HOUR        = 10
/** Côté le plus long d'une image après réduction dans le navigateur */
export const FEEDBACK_IMAGE_MAX_SIDE  = 2400

const WORKSPACE_TABS = ['text', 'document', 'image', 'rewrite'] as const

/** Champs texte du formulaire (les images arrivent à part, en multipart). */
export const FeedbackSubmitSchema = z.object({
  category:       z.enum(FEEDBACK_CATEGORIES),
  message:        z.string().trim().min(1).max(FEEDBACK_MAX_CHARS),
  includeContext: z.boolean(),
  tab:            z.enum(WORKSPACE_TABS).optional(),
  uiLocale:       z.enum(['en', 'de', 'fr', 'it']).optional(),
})
export type FeedbackSubmit = z.infer<typeof FeedbackSubmitSchema>

/** Contexte joint quand l'utilisateur l'accepte. La version et le navigateur sont relevés par le serveur. */
export interface FeedbackContext {
  tab?:        string
  uiLocale?:   string
  appVersion?: string
  userAgent?:  string
}

export const FeedbackUpdateSchema = z.object({
  status:    z.enum(FEEDBACK_STATUSES).optional(),
  adminNote: z.string().max(FEEDBACK_NOTE_MAX_CHARS).optional(),
}).refine(v => v.status !== undefined || v.adminNote !== undefined, 'Nothing to update')

/** Événement de fenêtre émis par la boîte de réception : la pastille de la barre latérale se recompte. */
export const FEEDBACK_CHANGED_EVENT = 'leksis:feedback-changed'
