#!/usr/bin/env node
/*
 * Sanity-checks styles/tokens.css: converts the generated `H deg S% L%` triplets
 * back to hex so the ramps can be eyeballed, and asserts the invariants that a
 * bad edit would silently break.
 *
 *   node scripts/check-tokens.mjs
 */
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

const hslToHex = (h, s, l) => {
  h /= 360
  s /= 100
  l /= 100
  const f = n => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))))
  }
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const ramps = {}
const re = /--hsl-([a-z]+)-(\d+):\s*([\d.]+)deg\s+([\d.]+)%\s+([\d.]+)%;/g
for (const m of css.matchAll(re)) {
  const [, family, step, h, s, l] = m
  ;(ramps[family] ??= {})[step] = { h: +h, s: +s, l: +l, hex: hslToHex(+h, +s, +l) }
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const problems = []

for (const [family, ramp] of Object.entries(ramps)) {
  const row = STEPS.map(s => ramp[s]?.hex ?? '  ??????').join(' ')
  console.log(family.padEnd(9), row)

  for (const step of STEPS) {
    if (!ramp[step]) problems.push(`${family}-${step} missing`)
  }
  // Lightness must decrease monotonically. Inkdrop's semantic variables assume
  // it: a ramp that dips would invert hover/border/disabled relationships all
  // over the UI without any single variable looking wrong.
  for (let i = 1; i < STEPS.length; i++) {
    const prev = ramp[STEPS[i - 1]]
    const cur = ramp[STEPS[i]]
    if (prev && cur && cur.l >= prev.l) {
      problems.push(`${family}: L not decreasing at ${STEPS[i - 1]} -> ${STEPS[i]} (${prev.l}% -> ${cur.l}%)`)
    }
  }
}

// The bare triplet must never be wrapped in hsl(): the built-in CSS composes
// alpha as hsl(var(--hsl-x) / 30%), which silently yields an invalid color if
// the variable already contains a function call.
for (const m of css.matchAll(/--hsl-[a-z]+-\d+:\s*([^;]+);/g)) {
  if (/hsl\(/.test(m[1])) problems.push(`--hsl-* wrapped in hsl(): ${m[0].trim()}`)
}

// Every --hsl-* must have a matching --color-*.
const hslNames = new Set([...css.matchAll(/--hsl-([a-z]+-\d+):/g)].map(m => m[1]))
const colorNames = new Set([...css.matchAll(/--color-([a-z]+-\d+):/g)].map(m => m[1]))
for (const n of hslNames) if (!colorNames.has(n)) problems.push(`--color-${n} missing`)
for (const n of colorNames) if (!hslNames.has(n)) problems.push(`--hsl-${n} missing`)

console.log()
console.log(`families: ${Object.keys(ramps).length}, declarations: ${hslNames.size * 2}`)
if (problems.length) {
  console.error('\nPROBLEMS:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log('all checks passed')
