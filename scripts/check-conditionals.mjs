#!/usr/bin/env node
/*
 * Catches the one failure mode the other checks cannot see.
 *
 *   node scripts/check-conditionals.mjs
 *
 * Inkdrop's built-in stylesheets sit in the *.base sublayers; a theme writes to
 * the parent layers, which outrank them - and layer order is decided before
 * selector specificity. So a plain `:root { --x: ... }` here beats a built-in
 * `:root:has(body.acrylic-window)` there, silently disabling the conditional
 * behaviour that branch existed to provide.
 *
 * That is how acrylic support gets switched off: upstream sets
 * --page-background and --editor-background-color to transparent under
 * `:root:has(body.acrylic-window)`, and an unconditional override wins over both.
 *
 * check-variables only reads names. audit-palette only ever sees one render
 * state - the non-acrylic one. Neither can find this. This can.
 *
 * The rule: if upstream declares a variable inside a conditional block, and we
 * declare it unconditionally, we must also declare it under a matching
 * condition - or explicitly say we meant to flatten it.
 */
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { declarations, readCss } from './lib/css.mjs'
import { styleSheetFiles } from './lib/theme.mjs'

// Located through Node rather than by joining `node_modules/` by hand, which
// only works while the install stays flat. The package ships no directory entry
// point, so resolve a file inside it and take its directory.
let upstreamDir
try {
  upstreamDir = dirname(fileURLToPath(import.meta.resolve('@inkdropapp/css/variables.json')))
} catch {
  upstreamDir = null
}

if (!upstreamDir || !existsSync(upstreamDir)) {
  console.error('@inkdropapp/css not found - run `npm install` first.')
  process.exit(1)
}

/** A selector or at-rule that makes the block it introduces conditional. */
const isConditional = header =>
  /:has\(|@media|@supports|@container/.test(header) && !/^@layer\b/.test(header)

const conditionOf = stack => stack.filter(isConditional).join(' >> ')

// The distinguishing token of a condition, so a broader selector than upstream's
// still counts as handled. Add a trigger word here rather than nesting a branch.
const TRIGGERS = ['acrylic-window', 'platform-win32']
const triggerOf = cond => TRIGGERS.find(t => cond.includes(t)) ?? cond

// --- upstream ---------------------------------------------------------------

const upstream = new Map() // name -> Map(condition -> file)
let upstreamFiles = 0
for (const file of readdirSync(upstreamDir)) {
  if (!file.endsWith('.css')) continue
  upstreamFiles++
  for (const { name, stack } of declarations(readCss(join(upstreamDir, file)))) {
    const cond = conditionOf(stack)
    if (!cond) continue
    if (!upstream.has(name)) upstream.set(name, new Map())
    if (!upstream.get(name).has(cond)) upstream.get(name).set(cond, file)
  }
}

// --- ours -------------------------------------------------------------------

const ours = new Map() // name -> { conditions: Set, files: Set }
for (const { file, path } of styleSheetFiles) {
  if (!existsSync(path)) continue
  for (const { name, stack } of declarations(readCss(path))) {
    if (!ours.has(name)) ours.set(name, { conditions: new Set(), files: new Set() })
    const entry = ours.get(name)
    entry.conditions.add(conditionOf(stack))
    entry.files.add(file)
  }
}

// --- compare ----------------------------------------------------------------

const problems = []
for (const [name, entry] of ours) {
  if (!entry.conditions.has('')) continue // we only set it conditionally too - fine
  const upstreamConds = upstream.get(name)
  if (!upstreamConds) continue

  for (const [cond, file] of upstreamConds) {
    const trigger = triggerOf(cond)
    const handled = [...entry.conditions].some(c => c && c.includes(trigger))
    if (!handled) problems.push({ name, cond, file, ours: [...entry.files].join(', ') })
  }
}

console.log(
  `scanned ${upstreamFiles} upstream stylesheet(s); ` +
    `${upstream.size} variable(s) are declared conditionally upstream`,
)
console.log(`this theme declares ${ours.size} variable(s)`)

if (!problems.length) {
  console.log('\nno unconditional override shadows a conditional built-in')
  process.exit(0)
}

console.error(`\n${problems.length} unconditional override(s) shadow a conditional built-in:\n`)
for (const p of problems) {
  console.error(`  ${p.name}`)
  console.error(`    set unconditionally in styles/${p.ours}`)
  console.error(`    but ${p.file} sets it under  ${p.cond}`)
  console.error(`    -> restate it under that condition, or the branch stops working`)
}
process.exit(1)
