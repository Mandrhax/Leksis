// Langue de l'interface — module pur, partagé serveur / client (choix de la langue au premier rendu).

export type UILocale = 'en' | 'de' | 'fr' | 'it'

export const UI_LOCALES: readonly UILocale[] = ['en', 'de', 'fr', 'it']

/** Cookie (lu par le serveur au premier rendu) et clé localStorage (anciennes versions) de la langue choisie. */
export const LOCALE_COOKIE = 'leksisUILocale'

export function isUILocale(v: unknown): v is UILocale {
  return typeof v === 'string' && (UI_LOCALES as readonly string[]).includes(v)
}

/**
 * Langue du premier rendu : celle choisie par l'utilisateur (cookie), sinon la première langue prise en charge
 * de l'en-tête Accept-Language du navigateur (`fr-CH,fr;q=0.9,en;q=0.8` → fr), sinon l'anglais.
 */
export function resolveUILocale(cookie: string | undefined | null, acceptLanguage: string | undefined | null): UILocale {
  if (isUILocale(cookie)) return cookie
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean)
      return { base: tag.split('-')[0].toLowerCase(), q: q === undefined ? 1 : Number(q) }
    })
    .filter(x => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q)
  return wanted.map(x => x.base).find(isUILocale) ?? 'en'
}
