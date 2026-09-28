// Contenu des pages /legal/privacy et /legal/usage. Fonctions pures (aucun accès base) : la configuration réelle
// de l'installation est passée en paramètre (voir lib/legal.ts), ce qui les rend testables.
// Texte disponible en EN/DE/FR/IT (voir legal-content-{en,de,fr,it}.ts) ; les libellés d'interface, eux,
// passent par les fichiers de locales habituels (src/locales/*.ts).

import type { UILocale } from '@/lib/i18n'
import * as en from '@/lib/legal-content-en'
import * as de from '@/lib/legal-content-de'
import * as fr from '@/lib/legal-content-fr'
import * as it from '@/lib/legal-content-it'

/** À changer à chaque modification du texte de référence (une des 4 langues). */
export const LEGAL_TEMPLATE_VERSION = '2026-09-28'

/**
 * Où partent les textes des utilisateurs :
 *  - local    : conteneur Ollama de ce serveur
 *  - private  : serveur IA sur le réseau privé de l'organisation
 *  - external : service hors réseau privé, autorisé par l'admin (allowExternal)
 */
export type AiScope = 'local' | 'private' | 'external'

export interface LegalContext {
  siteName:           string
  /** Organisation responsable (réglage legal.organization) — vide : formulation générique */
  organization:       string
  /** Contact confidentialité (legal.contact, à défaut general.contactEmail) — vide : « your administrator » */
  contact:            string
  privacyNotes:       string
  usageRules:         string
  /** 0 = conservé jusqu'à suppression manuelle */
  usageRetentionDays: number
  auditRetentionDays: number
  aiScope:            AiScope
  features:           { text: boolean; document: boolean; image: boolean; rewrite: boolean }
  limits:             { maxTextChars: number; maxDocChars: number; maxImageMB: number; rateLimitPerMin: number }
}

export interface LegalSection {
  id:          string
  title:       string
  paragraphs?: string[]
  items?:      string[]
  /** Encadré d'avertissement (par ex. moteur IA externe) */
  warning?:    boolean
}

export interface LegalDocument {
  title:    string
  intro:    string
  sections: LegalSection[]
}

/** Texte saisi par l'admin → paragraphes (séparés par une ligne vide). Toujours du texte brut. */
export function textToParagraphs(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n/).map(p => p.replace(/\s*\r?\n\s*/g, ' ').trim()).filter(Boolean)
}

interface LegalContentModule {
  buildPrivacyPolicy(c: LegalContext): LegalDocument
  buildUsagePolicy(c: LegalContext): LegalDocument
}

const MODULES: Record<UILocale, LegalContentModule> = { en, de, fr, it }

export function buildPrivacyPolicy(c: LegalContext, locale: UILocale = 'en'): LegalDocument {
  return MODULES[locale].buildPrivacyPolicy(c)
}

export function buildUsagePolicy(c: LegalContext, locale: UILocale = 'en'): LegalDocument {
  return MODULES[locale].buildUsagePolicy(c)
}
