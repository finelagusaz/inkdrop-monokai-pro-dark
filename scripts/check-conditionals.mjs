#!/usr/bin/env node
/*
 * Catches the one failure mode the other checks cannot see.
 *
 *   node scripts/check-conditionals.mjs
 *
 * Inkdrop's built-in stylesheets sit in the *.base sublayers; a theme writes to
 * the parent layers, which outrank them - and layer order is decided before
 * selector specificity. So a plain `:root { --x: ... }` here beats a built-in
 * `:root:has(body.acrylic-window) { --x: ... }` there, silently disabling the
 * conditional behaviour that branch existed to provide.
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
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const upstreamDir = join(root, 'node_modules', '@inkdropapp', 'css')

if (!existsSync(upstreamDir)) {
  console.error('node_modules/@inkdropapp/css not found - run `npm install` first.')
  process.exit(1)
}

/** A selector or at-rule that makes the block it introduces conditional. */
const isConditional = header =>
  /:has\(|@media|@supports|@container/.test(header) && !/^@layer\b/.test(header)

/**
 * Walk a stylesheet and yield every custom-property declaration together with
 * the stack of block headers enclosing it. Good enough for these files: they
 * are generated, well-formed, and contain no strings holding braces.
 */
function* declarations(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack = []
  let buf = ''
  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '))
      buf = ''
    } else if (ch === '}') {
      stack.pop()
      buf = ''
    } else if (ch === ';') {
      const m = /^\s*(--[a-z0-9-]+)\s*:/i.exec(buf)
      if (m) yield { name: m[1], stack: [...stack] }
      buf = ''
    } else {
      buf += ch
    }
  }
}

const conditionOf = stack => stack.filter(isConditional).join(' >> ')

/** name -> Set of conditions it is declared under ('' meaning unconditional) */
function index(css) {
  const map = new Map()
  for (const { name, stack } of declarations(css)) {
    if (!map.has(name)) map.set(name, new Set())
    map.get(name).add(conditionOf(stack))
  }
  return map
}

// --- upstream ---------------------------------------------------------------

const upstream = new Map() // name -> Map(condition -> file)
let upstreamFiles = 0
for (const file of readdirSync(upstreamDir)) {
  if (!file.endsWith('.css')) continue
  upstreamFiles++
  const css = readFileSync(join(upstreamDir, file), 'utf8')
  for (const { name, stack } of declarations(css)) {
    const cond = conditionOf(stack)
    if (!cond) continue
    if (!upstream.has(name)) upstream.set(name, new Map())
    if (!upstream.get(name).has(cond)) upstream.get(name).set(cond, file)
  }
}

// --- ours -------------------------------------------------------------------

const FILES = ['tokens.css', 'ui.css', 'syntax.css', 'preview.css']
const ours = new Map() // name -> { conditions: Set, files: Set }
for (const file of FILES) {
  const path = join(root, 'styles', file)
  if (!existsSync(path)) continue
  for (const [name, conds] of index(readFileSync(path, 'utf8'))) {
    if (!ours.has(name)) ours.set(name, { conditions: new Set(), files: new Set() })
    const entry = ours.get(name)
    for (const c of conds) entry.conditions.add(c)
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
    // Do we restate it under a condition mentioning the same trigger? Compare on
    // the distinguishing token rather than the whole selector, so a broader
    // selector than upstream's still counts as handled.
    const trigger = /acrylic-window/.test(cond)
      ? 'acrylic-window'
      : /platform-win32/.test(cond)
        ? 'platform-win32'
        : cond
    const handled = [...entry.conditions].some(c => c && c.includes(trigger))
    if (!handled) {
      problems.push({ name, cond, file, ours: [...entry.files].join(', ') })
    }
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
