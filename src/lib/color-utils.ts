/**
 * Utilitaires de manipulation de couleurs hex pour générer
 * les variantes Material Design 3 à partir d'une couleur de base.
 * Pas de dépendance externe — pure arithmétique RGB.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
}

/** Mélange la couleur avec du blanc (t=0 → original, t=1 → blanc) */
function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t)
}

/** Mélange la couleur avec du noir (t=0 → original, t=1 → noir) */
function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r * (1 - t), g * (1 - t), b * (1 - t))
}

/** Luminance relative — pour décider si on-primary doit être blanc ou noir */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function onColor(hex: string): string {
  return luminance(hex) > 0.179 ? '#1a1c1e' : '#f7f7ff'
}

/**
 * Génère l'ensemble des CSS custom properties à injecter dans :root
 * à partir des couleurs primaire et secondaire choisies dans l'admin.
 */
export function buildColorVars(primary: string, secondary: string): Record<string, string> {
  const primaryDim       = darken(primary, 0.12)
  const primaryContainer = lighten(primary, 0.75)
  const onPrimary        = onColor(primary)
  const onPrimaryContainer = darken(primary, 0.25)

  const secondaryDim       = darken(secondary, 0.12)
  const secondaryContainer = lighten(secondary, 0.75)
  const onSecondary        = onColor(secondary)
  const onSecondaryContainer = darken(secondary, 0.25)

  return {
    // Tailwind @theme vars
    '--color-primary':                  primary,
    '--color-primary-dim':              primaryDim,
    '--color-primary-fixed':            lighten(primary, 0.72),
    '--color-primary-fixed-dim':        lighten(primary, 0.60),
    '--color-primary-container':        primaryContainer,
    '--color-on-primary':               onPrimary,
    '--color-on-primary-fixed':         darken(primary, 0.30),
    '--color-on-primary-fixed-variant': darken(primary, 0.18),
    '--color-on-primary-container':     onPrimaryContainer,
    '--color-inverse-primary':          lighten(primary, 0.72),
    '--color-surface-tint':             primary,

    '--color-secondary':                secondary,
    '--color-secondary-dim':            secondaryDim,
    '--color-secondary-fixed':          lighten(secondary, 0.72),
    '--color-secondary-fixed-dim':      lighten(secondary, 0.60),
    '--color-secondary-container':      secondaryContainer,
    '--color-on-secondary':             onSecondary,
    '--color-on-secondary-fixed':       darken(secondary, 0.30),
    '--color-on-secondary-fixed-variant': darken(secondary, 0.18),
    '--color-on-secondary-container':   onSecondaryContainer,

    // CSS custom properties (utilisées dans globals.css)
    '--c-primary':               primary,
    '--c-primary-dim':           primaryDim,
    '--c-primary-hover':         lighten(primary, 0.12),
    '--c-on-primary':            onPrimary,
  }
}
