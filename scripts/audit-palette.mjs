#!/usr/bin/env node
/*
 * Audits palette.json for colors that are NOT part of the Monokai palette.
 *
 *   npm run palette && node scripts/audit-palette.mjs
 *
 * palette.json is generate-palette's snapshot of every theme variable as the
 * browser actually resolves it, with the theme loaded. That makes it the one
 * place where "did anything stay Tailwind?" is answerable without running
 * Inkdrop: any saturated color whose hue is far from every Monokai anchor is a
 * variable the ramps did not reach.
 *
 * Near-grey colors are ignored - at low saturation hue is meaningless, and the
 * neutral ramp is grey by design.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'palette.json')

if (!existsSync(path)) {
  console.error('palette.json not found - run `npm run palette` first.')
  process.exit(1)
}

// Monokai Pro hue anchors, in degrees. Derived from the same six colors
// scripts/gen-tokens.mjs anchors the ramps on, plus the sibling families it
// spreads around them.
const ANCHORS = [
  { name: 'red', h: 345.2, spread: 20 },
  { name: 'orange', h: 19.7, spread: 22 },
  { name: 'yellow', h: 44.7, spread: 14 },
  { name: 'green', h: 90.0, spread: 24 },
  { name: 'cyan', h: 186.4, spread: 30 },
  { name: 'violet', h: 249.9, spread: 22 },
]

// Below this chroma a color is grey enough that its hue carries no meaning.
// Chroma, not saturation: HSL saturation is misleading at the extremes of
// lightness, where a 2/255 channel difference reports as 25% saturated. Monokai's
// own foreground #FCFCFA is exactly that case, and judging it by saturation
// files it as an off-hue yellow.
const GREY_CHROMA = 6
const chromaOf = ({ s, l }) => s * (1 - Math.abs((2 * l) / 100 - 1))

const angularDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/** Parse the shapes generate-palette emits: hsl(...), #hex, rgb(...), or a keyword. */
function parseColor(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()

  let m = /^hsla?\(\s*([\d.]+)deg\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+)%?\s*)?\)$/i.exec(v)
  if (m) return { h: +m[1], s: +m[2], l: +m[3] }

  m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v)
  if (m) {
    let hex = m[1]
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('')
    return rgbToHsl(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    )
  }

  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(v)
  if (m) return rgbToHsl(+m[1], +m[2], +m[3])

  return null
}

function rgbToHsl(r, g, b) {
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

const palette = JSON.parse(readFileSync(path, 'utf8'))

const offPalette = []
let colors = 0
let greys = 0
const hits = Object.fromEntries(ANCHORS.map(a => [a.name, 0]))

for (const [name, value] of Object.entries(palette)) {
  const c = parseColor(value)
  if (!c) continue
  colors++
  if (chromaOf(c) < GREY_CHROMA) {
    greys++
    continue
  }
  let best = null
  for (const a of ANCHORS) {
    const d = angularDistance(c.h, a.h)
    if (!best || d < best.d) best = { ...a, d }
  }
  if (best.d <= best.spread) hits[best.name]++
  else offPalette.push({ name, value, h: Math.round(c.h), c: Math.round(chromaOf(c)), nearest: best })
}

console.log(`palette.json: ${Object.keys(palette).length} variables, ${colors} parsed as colors`)
console.log(`  greys (chroma < ${GREY_CHROMA}%): ${greys}`)
for (const [n, count] of Object.entries(hits)) console.log(`  ${n.padEnd(7)}: ${count}`)

if (!offPalette.length) {
  console.log('\nno off-palette colors')
  process.exit(0)
}

offPalette.sort((a, b) => b.nearest.d - a.nearest.d)
console.log(`\n${offPalette.length} variable(s) resolve outside the Monokai palette:\n`)
for (const o of offPalette) {
  console.log(
    `  ${o.name.padEnd(46)} ${o.value.padEnd(30)} hue ${String(o.h).padStart(3)}deg ` +
      `chroma ${String(o.c).padStart(3)}%  (${Math.round(o.nearest.d)}deg from ${o.nearest.name})`,
  )
}
console.log('\nEach of these is either a variable worth overriding, or a deliberate')
console.log('exception. Nothing here fails the build - it is a list to review.')
