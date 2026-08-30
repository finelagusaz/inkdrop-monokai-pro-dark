/*
 * The Monokai Pro palette this theme is built from.
 *
 * Shared rather than private to the generator: audit-palette grades the rendered
 * theme against these same hues, and used to carry its own hand-copied numbers.
 * Moving one anchor here now moves the audit with it.
 */

// --- Monokai Pro (default filter) -------------------------------------------
// Source: the published `monokai-dark-syntax` package's colors.less, which
// matches Monokai Pro's official default filter.
export const MONOKAI = {
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
export const NEUTRAL = {
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
export const ACCENTS = {
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

// The other neutral families are aliased onto Monokai's greys rather than left
// at Tailwind's. They are each tinted towards a different hue upstream - gray
// and slate lean blue, stone leans warm - and Inkdrop reaches for them in
// places the neutral ramp does not cover: --dark-white / --mid-white /
// --white-down come from the gray ramp, and the `black` tag colors come from
// gray-950, which is a very dark navy. Aliasing costs nothing here and stops
// two grey systems from coexisting.
//
// fuchsia is left alone: nothing in Inkdrop's UI or syntax defaults resolves
// through it, and Monokai has no magenta to anchor it on.
export const NEUTRAL_ALIASES = ['gray', 'zinc', 'slate', 'stone']

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
