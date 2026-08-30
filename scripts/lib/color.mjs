/*
 * Color conversion shared by the generator and the checkers.
 *
 * These lived in three copies - gen-tokens' hexToHsl, audit-palette's rgbToHsl
 * and check-tokens' hslToHex were the same arithmetic written out again - which
 * is how the palette and the audit that grades it drifted apart in the first
 * place. One implementation, imported everywhere.
 */

export const round = n => Math.round(n * 10) / 10
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
export const wrapHue = h => ((h % 360) + 360) % 360

export function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hslToHex(h, s, l) {
  h /= 360
  s /= 100
  l /= 100
  const f = n => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))))
  }
  return rgbToHex([f(0), f(8), f(4)]).toUpperCase()
}

/** Accepts #rgb, #rrggbb and #rrggbbaa. Throws on anything else - the palette
 *  constants are hand-edited, and a malformed one must not reach the output. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex).trim())
  if (!m) throw new Error(`not a hex color: ${hex}`)
  let s = m[1]
  if (s.length === 3) s = [...s].map(c => c + c).join('')
  const n = parseInt(s.slice(0, 6), 16)
  const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

export const hexToHsl = hex => {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHsl(r, g, b)
}

export const rgbToHex = rgb =>
  '#' + rgb.slice(0, 3).map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')

/** Format as the bare `H deg S% L%` triplet Inkdrop expects - never wrapped in hsl(). */
export const triplet = ({ h, s, l }) =>
  `${round(wrapHue(h))}deg ${round(clamp(s, 0, 100))}% ${round(clamp(l, 0, 100))}%`

/**
 * Parse the shapes a browser or generate-palette emits: hsl(...), #hex, rgb(...).
 * Returns { h, s, l, a } with alpha normalised to 0..1, or null if unrecognised.
 */
export function parseColor(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (v === 'transparent') return { h: 0, s: 0, l: 0, a: 0 }

  let m = /^hsla?\(\s*([\d.]+)deg\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i.exec(v)
  if (m) return { h: +m[1], s: +m[2], l: +m[3], a: alphaOf(m[4], m[5]) }

  m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v)
  if (m) {
    const [r, g, b, a] = hexToRgb(m[0])
    return { ...rgbToHsl(r, g, b), a }
  }

  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(v)
  if (m) return { ...rgbToHsl(+m[1], +m[2], +m[3]), a: alphaOf(m[4], m[5]) }

  return null
}

const alphaOf = (n, pct) => (n === undefined ? 1 : pct ? +n / 100 : +n)

/**
 * Below this chroma a color is grey enough that its hue carries no meaning.
 * Chroma, not saturation: HSL saturation is misleading at the extremes of
 * lightness, where a 2/255 channel difference reports as 25% saturated. Monokai's
 * own foreground #FCFCFA is exactly that case, and judging it by saturation
 * files it as an off-hue yellow.
 */
export const chromaOf = ({ s, l }) => s * (1 - Math.abs((2 * l) / 100 - 1))

export const angularDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
