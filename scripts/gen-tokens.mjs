#!/usr/bin/env node
/*
 * Generates styles/tokens.css - the Monokai Pro design-token ramps for Inkdrop v6.
 *
 *   npm run tokens
 *
 * Why a generator: tokens.css is ~380 declarations. Hand-editing it makes a wrong
 * step invisible. Change the palette here and regenerate instead.
 *
 * How it works: Inkdrop's built-in tokens.css defines every ramp twice -
 *   --hsl-<family>-<step>:   <H>deg <S>% <L>%      (bare triplet, for hsl(... / alpha))
 *   --color-<family>-<step>: hsl(var(--hsl-...))   (resolved color)
 * We redefine both in @layer theme, which sits above @layer tokens, so every one
 * of the ~890 semantic UI variables that resolves through a ramp picks up Monokai
 * without being named here. See https://github.com/inkdropapp/css
 *
 * Each accent family holds the anchor's hue and saturation and interpolates
 * lightness across the 11 steps, anchored so step 500 IS the Monokai color.
 * The sibling families (rose/pink, amber, lime/emerald, teal/sky, indigo/purple)
 * are the anchor nudged in hue, so components that reach for a neighbouring
 * family stay inside the Monokai range instead of falling back to Tailwind.
 */

// --- Monokai Pro (default filter) -------------------------------------------
// Source: the published `monokai-dark-syntax` package's colors.less, which
// matches Monokai Pro's official default filter.
const MONOKAI = {
  red: '#FF6188',
  orange: '#FC9867',
  yellow: '#FFD866',
  green: '#A9DC76',
  cyan: '#78DCE8',
  purple: '#AB9DF2',
}

// Neutral ramp anchors - every one of these is an actual Monokai Pro grey.
// Steps 100/200/300 are absent from the official palette and are INTERPOLATED
// in HSL between 50 and 400 below. Do not fill them in with hand-picked hex:
// eyeballed greys break the hue/saturation continuity of the ramp, and
// --border-color and friends blend through these with alpha.
const NEUTRAL = {
  50: '#FCFCFA', // Monokai Pro foreground (a warm off-white)
  400: '#939293', // Monokai Pro grey2
  500: '#727072', // Monokai Pro grey3 (comments)
  600: '#5B595C', // Monokai Pro grey4 (borders)
  700: '#403E41', // Monokai Pro grey5 (selection)
  800: '#2D2A2E', // Monokai Pro background - the editor surface
  900: '#221F22', // Monokai Pro darker background
  950: '#19181A', // Monokai Pro darkest background
}

// Accent families: [anchor color, hue shift in degrees].
// The shift spreads siblings across the gap between two Monokai hues so that
// e.g. a `rose` badge and a `red` badge stay distinguishable but both Monokai.
const ACCENTS = {
  red: [MONOKAI.red, 0],
  rose: [MONOKAI.red, -6],
  pink: [MONOKAI.red, -16],
  orange: [MONOKAI.orange, 0],
  amber: [MONOKAI.orange, +16],
  yellow: [MONOKAI.yellow, 0],
  lime: [MONOKAI.green, -12],
  green: [MONOKAI.green, 0],
  emerald: [MONOKAI.green, +18],
  teal: [MONOKAI.cyan, -22],
  cyan: [MONOKAI.cyan, 0],
  sky: [MONOKAI.cyan, +8],
  // Inkdrop resolves --primary-color and --link-color through the blue ramp, so
  // blue must BE Monokai's cyan or every accent in the app reads as Tailwind blue.
  blue: [MONOKAI.cyan, 0],
  indigo: [MONOKAI.purple, -14],
  violet: [MONOKAI.purple, 0],
  purple: [MONOKAI.purple, +14],
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Lightness is interpolated as a FRACTION of the distance from the anchor
// (step 500) to a ceiling/floor - not as a fixed offset. Fixed offsets collapse
// at the ends: Monokai's purple already sits at L 78%, so +28/+25/+19 all clamp
// to the ceiling and steps 50/100/200 come out identical. Fractions keep the
// ramp monotonic whatever the anchor's lightness.
const L_CEILING = 97
const L_FLOOR = 12
// Toward the ceiling. 400 is deliberately close to the anchor: Inkdrop's
// dark-mode defaults reach for -400 as often as -500, and both should read as
// the Monokai color rather than a washed-out tint of it.
const L_UP = { 400: 0.17, 300: 0.42, 200: 0.66, 100: 0.85, 50: 0.96 }
// Toward the floor.
const L_DOWN = { 600: 0.18, 700: 0.35, 800: 0.52, 900: 0.66, 950: 0.86 }

// --- color conversion --------------------------------------------------------

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`)
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255

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

const round = (n, digits = 1) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const wrapHue = h => ((h % 360) + 360) % 360

/** Format as the bare `H deg S% L%` triplet Inkdrop expects - never wrapped in hsl(). */
const triplet = ({ h, s, l }) =>
  `${round(wrapHue(h))}deg ${round(clamp(s, 0, 100))}% ${round(clamp(l, 0, 100))}%`

// --- ramp construction -------------------------------------------------------

// Saturation multiplier per step. Monokai's accents sit at 70-100% saturation,
// which stays pleasant around the anchor but turns lurid once lightness drops:
// 100% saturation at L 19% is a signal-flare red, not a Monokai red. Taper it
// at both ends the way Tailwind's ramps do.
const S_SCALE = {
  50: 0.9,
  100: 0.92,
  200: 0.95,
  300: 0.98,
  400: 1,
  500: 1,
  600: 0.97,
  700: 0.9,
  800: 0.82,
  900: 0.74,
  950: 0.62,
}

function accentRamp(anchorHex, hueShift) {
  const anchor = hexToHsl(anchorHex)
  const out = {}
  for (const step of STEPS) {
    let l = anchor.l
    if (step in L_UP) l = anchor.l + (L_CEILING - anchor.l) * L_UP[step]
    else if (step in L_DOWN) l = anchor.l - (anchor.l - L_FLOOR) * L_DOWN[step]
    out[step] = triplet({
      h: anchor.h + hueShift,
      s: anchor.s * S_SCALE[step],
      l,
    })
  }
  return out
}

const hexToRgb = hex => {
  const n = parseInt(/^#?([0-9a-f]{6})$/i.exec(hex.trim())[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = rgb =>
  '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')

function neutralRamp() {
  const filled = { ...NEUTRAL }
  // Fill 100/200/300 by interpolating in RGB, NOT HSL. #FCFCFA reports 25%
  // saturation at 60deg, but that is a 2/255 rounding artefact, not a real
  // warmth; carrying it down an HSL ramp turns the light greys visibly pink.
  // Averaging two near-greys in RGB cannot invent a hue.
  const lo = hexToRgb(NEUTRAL[50])
  const hi = hexToRgb(NEUTRAL[400])
  const FILL = { 100: 0.22, 200: 0.48, 300: 0.73 }
  for (const [step, t] of Object.entries(FILL)) {
    filled[step] = rgbToHex(lo.map((c, i) => c + (hi[i] - c) * t))
  }
  const out = {}
  for (const step of STEPS) out[step] = triplet(hexToHsl(filled[step]))
  return out
}

// --- emit --------------------------------------------------------------------

const families = { neutral: neutralRamp() }
for (const [name, [hex, shift]] of Object.entries(ACCENTS)) {
  families[name] = accentRamp(hex, shift)
}

// The other neutral families are aliased onto Monokai's greys rather than left
// at Tailwind's. They are each tinted towards a different hue upstream - gray
// and slate lean blue, stone leans warm - and Inkdrop reaches for them in
// places the neutral ramp does not cover: --dark-white / --mid-white /
// --white-down come from the gray ramp, and the `black` tag colors come from
// gray-950, which is a very dark navy. Aliasing costs nothing here and stops
// two grey systems from coexisting.
for (const name of ['gray', 'zinc', 'slate', 'stone']) {
  families[name] = { ...families.neutral }
}

// fuchsia is left alone: nothing in Inkdrop's UI or syntax defaults resolves
// through it, and Monokai has no magenta to anchor it on.

const out = []
out.push('@layer theme {')
out.push('  /*')
out.push('   * Monokai Pro Dark - design-token ramps.')
out.push('   *')
out.push('   * GENERATED by scripts/gen-tokens.mjs - do not edit by hand.')
out.push('   * Edit the palette in that script and run `npm run tokens`.')
out.push('   *')
out.push('   * Overrides the built-in --hsl-* / --color-* ramps so every component that')
out.push('   * resolves through a design token picks up Monokai without being named')
out.push('   * individually. Each accent family anchors a Monokai color at step 500.')
out.push('   */')
out.push('  :root {')

let first = true
for (const [name, ramp] of Object.entries(families)) {
  if (!first) out.push('')
  first = false
  out.push(`    /* ${name} */`)
  for (const step of STEPS) out.push(`    --hsl-${name}-${step}: ${ramp[step]};`)
}

out.push('')
out.push('    /* Resolved colors. Redundant in principle - --color-* is defined as')
out.push('       hsl(var(--hsl-*)) upstream and would follow the overrides above - but')
out.push('       the official themes restate them, and generate-palette snapshots')
out.push('       resolved values, so keep the pair explicit. */')
for (const name of Object.keys(families)) {
  out.push('')
  for (const step of STEPS) {
    out.push(`    --color-${name}-${step}: hsl(var(--hsl-${name}-${step}));`)
  }
}

out.push('  }')
out.push('}')

process.stdout.write(out.join('\n') + '\n')
