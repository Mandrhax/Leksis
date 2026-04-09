// Port direct de Leksis_old/assets/js/languages.js
import type { Language } from '@/types/leksis'

export const LANGUAGES: Language[] = [
  { code: 'ar',      name: 'Arabic' },
  { code: 'ca',      name: 'Catalan' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'cs',      name: 'Czech' },
  { code: 'da',      name: 'Danish' },
  { code: 'nl',      name: 'Dutch' },
  { code: 'en',      name: 'English' },
  { code: 'en-GB',   name: 'English (UK)',           baseCode: 'en-GB' },
  { code: 'fi',      name: 'Finnish' },
  { code: 'fr',      name: 'French' },
  { code: 'fr-BE',   name: 'French (Belgium)',       baseCode: 'fr-BE' },
  { code: 'fr-CH',   name: 'French (Switzerland)',   baseCode: 'fr-CH' },
  { code: 'fr-CA',   name: 'French (Canada)',        baseCode: 'fr-CA' },
  { code: 'de',      name: 'German' },
  { code: 'de-AT',   name: 'German (Austria)',       baseCode: 'de-AT' },
  { code: 'de-CH',   name: 'German (Switzerland)',   baseCode: 'de-CH' },
  { code: 'el',      name: 'Greek' },
  { code: 'he',      name: 'Hebrew' },
  { code: 'hi',      name: 'Hindi' },
  { code: 'hu',      name: 'Hungarian' },
  { code: 'id',      name: 'Indonesian' },
  { code: 'it',      name: 'Italian' },
  { code: 'ja',      name: 'Japanese' },
  { code: 'ko',      name: 'Korean' },
  { code: 'nb',      name: 'Norwegian' },
  { code: 'fa',      name: 'Persian' },
  { code: 'pl',      name: 'Polish' },
  { code: 'pt',      name: 'Portuguese' },
  { code: 'pt-BR',   name: 'Portuguese (Brazil)',   baseCode: 'pt' },
  { code: 'ro',      name: 'Romanian' },
  { code: 'ru',      name: 'Russian' },
  { code: 'sk',      name: 'Slovak' },
  { code: 'es',      name: 'Spanish' },
  { code: 'es-MX',   name: 'Spanish (Mexico)',      baseCode: 'es' },
  { code: 'es-AR',   name: 'Spanish (Argentina)',   baseCode: 'es' },
  { code: 'sv',      name: 'Swedish' },
  { code: 'th',      name: 'Thai' },
  { code: 'tr',      name: 'Turkish' },
  { code: 'uk',      name: 'Ukrainian' },
  { code: 'vi',      name: 'Vietnamese' },
]

const ZH_TRADITIONAL_CHARS = /[國語來時們這個們說學會電話歷書實際經濟發現開關機問題對應]/

function classifyZh(text: string): Language {
  const cjkChars = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []
  if (cjkChars.length === 0) return { code: 'zh-Hans', name: 'Chinese (Simplified)' }
  const tradCount = cjkChars.filter(c => ZH_TRADITIONAL_CHARS.test(c)).length
  return tradCount / cjkChars.length > 0.05
    ? { code: 'zh-Hant', name: 'Chinese (Traditional)' }
    : { code: 'zh-Hans', name: 'Chinese (Simplified)' }
}

const STOPWORDS: Record<string, string[]> = {
  en: ['the','is','are','and','of','to','in','that','it','was','for','on','with','he','she','they','this','have','from','at','be','or','an','not','but','we','you','all','can','had','her','his','if','do','will','one','their','what','so','up','out','about','who','get'],
  fr: ['le','la','les','de','du','un','une','est','et','je','vous','nous','ils','que','qui','dans','en','au','aux','par','sur','ou','mais','donc','car','ce','cette','se','on','leur','des','il','elle','très','plus','si','aussi','pas','ne'],
  es: ['el','la','los','las','de','del','un','una','es','en','que','y','se','por','con','para','su','al','lo','como','más','pero','sus','le','ya','fue','este','ha','entre','también','hasta','desde','nos','durante','son'],
  de: ['der','die','das','und','ist','ein','eine','zu','den','dem','ich','sie','wir','nicht','mit','von','auf','als','an','auch','es','hat','war','er','bei','in','nach','für','wenn','dann','aber','wie','noch','so','sind','haben'],
  it: ['il','la','le','di','del','un','una','è','e','in','che','per','con','non','sono','si','da','mi','ha','ma','nel','al','lo','ho','tra','già','ci','tutto','come','più','questo','così','poi','anche','era'],
  pt: ['o','a','os','as','de','da','do','um','uma','é','e','que','em','para','com','não','se','por','mais','foi','ele','ela','nos','ao','aos','mas','como','também','muito','já','até','seu','sua','isso'],
  nl: ['de','het','een','is','en','van','in','dat','op','te','zijn','met','voor','niet','aan','heeft','maar','ook','er','als','ze','hij','dit','we','bij','zo','kan','nog','waren','worden'],
  pl: ['i','w','z','na','do','się','że','to','jest','nie','jak','ale','go','co','tak','po','przez','za','czy','już','być','więc','bo','jego','jej','tam','tu','tego'],
  sv: ['och','i','att','en','är','det','som','på','de','med','för','av','till','om','hade','han','hon','vi','men','när','så','kan','vad','ett','ja','nu','där'],
  da: ['og','i','er','at','en','det','som','til','på','de','med','for','af','den','ikke','han','hun','vi','men','når','så','kan','hvad','et','ja','nu','der'],
  nb: ['og','i','er','at','en','det','som','til','på','de','med','for','av','den','ikke','han','hun','vi','men','når','så','kan','hva','et','ja','nå','der'],
  fi: ['ja','on','ei','se','että','en','hän','oli','kun','niin','myös','jo','mutta','sitten','joka','minä','sinä','olla','tämä','nämä','hänellä'],
  tr: ['bir','bu','ve','da','de','ile','için','ben','ne','var','gibi','olan','daha','o','biz','çok','nasıl','ama'],
  cs: ['a','je','se','v','na','to','že','z','do','jako','pro','ale','jsou','být','s','tento','jeho','jejich','já','ty','on','ona'],
  sk: ['a','je','sa','v','na','to','že','z','do','ako','pre','ale','sú','byť','s','tento','jeho','ich','ja','ty','on','ona'],
  ro: ['și','în','de','la','că','este','nu','se','cu','care','mai','lui','o','al','prin','dar','sau','ca','pe','ce','din','sunt','erau'],
  id: ['dan','di','yang','ini','itu','dengan','untuk','dari','ke','ada','tidak','adalah','saya','kita','mereka','juga','bisa','akan','pada','oleh','jika','bagi'],
  ca: ['i','el','la','els','les','de','del','un','una','és','en','que','per','amb','no','jo','però','com','més','tot','quan','han','ser'],
  vi: ['và','là','của','có','cho','trong','với','được','một','các','này','không','người','như','khi','về','từ','đã','những'],
}

export function detectLanguage(text: string): Language | null {
  if (!text || text.trim().length < 4) return null
  const t = text.trim()

  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(t))    return classifyZh(t)
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(t))     return LANGUAGES.find(l => l.code === 'ja') ?? null
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(t))     return LANGUAGES.find(l => l.code === 'ko') ?? null
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(t)) {
    return /[\u0600-\u06FF]{3}/.test(t) && /[\u067E\u0686\u0698\u06AF]/.test(t)
      ? LANGUAGES.find(l => l.code === 'fa') ?? null
      : LANGUAGES.find(l => l.code === 'ar') ?? null
  }
  if (/[\u0590-\u05FF]/.test(t)) return LANGUAGES.find(l => l.code === 'he') ?? null
  if (/[\u0900-\u097F]/.test(t)) return LANGUAGES.find(l => l.code === 'hi') ?? null
  if (/[\u0E00-\u0E7F]/.test(t)) return LANGUAGES.find(l => l.code === 'th') ?? null
  if (/[\u0370-\u03FF]/.test(t)) return LANGUAGES.find(l => l.code === 'el') ?? null
  if (/[\u0400-\u04FF]/.test(t)) {
    return /[іїєґ]/i.test(t)
      ? LANGUAGES.find(l => l.code === 'uk') ?? null
      : LANGUAGES.find(l => l.code === 'ru') ?? null
  }

  const words = t.toLowerCase().match(/\b[a-záàâãäåæçéèêëíìîïñóòôõöúùûüýÿœß]+\b/g)
  if (!words || words.length < 2) return null

  const wordSet = new Set(words)
  const scores: Record<string, number> = {}
  for (const [lang, sw] of Object.entries(STOPWORDS)) {
    scores[lang] = sw.filter(w => wordSet.has(w)).length
  }

  const [bestCode, bestScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (bestScore === 0) return null

  return LANGUAGES.find(l => l.code === bestCode) ?? null
}
