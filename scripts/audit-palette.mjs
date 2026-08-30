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
import { join } from 'node:path'
import { angularDistance, chromaOf, hexToHsl, parseColor } from './lib/color.mjs'
import { MONOKAI } from './lib/palette.mjs'
import { root } from './lib/theme.mjs'

const path = join(root, 'palette.json')

if (!existsSync(path)) {
  console.error('palette.json not found - run `npm run palette` first.')
  process.exit(1)
}

// Monokai Pro hue anchors, taken from the same six colors gen-tokens anchors the
// ramps on rather than transcribed - a hand-copied hue would keep grading the
// theme against a palette it no longer uses. `violet` is what Inkdrop calls the
// family Monokai calls purple.
//
// The spread is how far a sibling family may sit from its anchor, and stays
// hand-tuned: it has to cover the largest hue shift gen-tokens applies to that
// anchor's siblings, plus room for the rounding in a rendered value.
const SPREAD = { red: 20, orange: 22, yellow: 14, green: 24, cyan: 30, violet: 22 }
const ANCHORS = Object.entries(SPREAD).map(([name, spread]) => ({
  name,
  h: hexToHsl(MONOKAI[name === 'violet' ? 'purple' : name]).h,
  spread,
}))

// Below this chroma a color is grey enough that its hue carries no meaning.
const GREY_CHROMA = 6

const palette = JSON.parse(readFileSync(path, 'utf8'))

const offPalette = []
let colors = 0
let greys = 0
const hits = Object.fromEntries(ANCHORS.map(a => [a.name, 0]))

for (const [name, value] of Object.entries(palette)) {
  const c = parseColor(value)
  // A fully transparent value paints nothing, so it cannot be off-palette.
  if (!c || c.a === 0) continue
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
