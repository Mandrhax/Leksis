import 'server-only'
import { cookies, headers } from 'next/headers'
import { messages as en, type Messages } from '@/locales/en'
import { messages as de } from '@/locales/de'
import { messages as fr } from '@/locales/fr'
import { messages as it } from '@/locales/it'
import { LOCALE_COOKIE, resolveUILocale, type UILocale } from '@/lib/ui-locale'

const MESSAGES: Record<UILocale, Messages> = { en, de, fr, it }

/** Langue du premier rendu (cookie de l'utilisateur, sinon Accept-Language) et ses textes — rien d'autre n'est envoyé. */
export async function getRequestLocale(): Promise<{ locale: UILocale; messages: Messages }> {
  const [c, h] = await Promise.all([cookies(), headers()])
  const locale = resolveUILocale(c.get(LOCALE_COOKIE)?.value, h.get('accept-language'))
  return { locale, messages: MESSAGES[locale] }
}
