#!/usr/bin/env node
/*
 * Verifies that every CSS variable this theme SETS actually exists in Inkdrop.
 *
 *   node scripts/check-variables.mjs
 *
 * Why: there are 1638 theme variables across ui / syntax / markdown / mermaid /
 * status / tags / task-progress. A name written from memory - `--sidebar-bg`,
 * `--syntax-function-color` - is not an error anywhere. It parses, it cascades,
 * and it does nothing. This is the only thing that catches it.
 *
 * The manifest is @inkdropapp/css's own variables.json, which is also what the
 * dev-server's Variables tab renders from. Read from node_modules when the
 * install is present so it always matches the installed version; otherwise fall
 * back to the vendored copy next to this script.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const INSTALLED = join(root, 'node_modules', '@inkdropapp', 'css', 'variables.json')
const VENDORED = join(here, 'inkdrop-variables.json')

const source = existsSync(INSTALLED) ? INSTALLED : VENDORED
const manifest = JSON.parse(readFileSync(source, 'utf8'))
const known = new Set(Object.values(manifest).flat())

// Design tokens are not in variables.json (they are primitives, not theme
// hooks), but overriding the ramps is exactly how a theme is meant to work.
const isToken = name =>
  /^--(hsl|color)-[a-z]+-(50|100|200|300|400|500|600|700|800|900|950)$/.test(name) ||
  /^--(hsl|color)-(black|white|current|transparent)$/.test(name)

// Locally-scoped aliases a stylesheet defines for its own use.
const isLocalAlias = name => name.startsWith('--monokai-')

const FILES = ['tokens.css', 'ui.css', 'syntax.css', 'preview.css']

/** Comments mention variable names in prose (`hsl(var(--hsl-*))`); strip them first. */
const readCss = path => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

let unknown = 0
let checked = 0
const usedByFile = {}

for (const file of FILES) {
  const path = join(root, 'styles', file)
  if (!existsSync(path)) {
    console.error(`missing: styles/${file}`)
    process.exitCode = 1
    continue
  }
  const css = readCss(path)

  // Declarations only (`--x: value`), not references (`var(--x)`).
  const declared = new Set()
  for (const m of css.matchAll(/(^|[;{]|\*\/)\s*(--[a-z0-9-]+)\s*:/gim)) declared.add(m[2])
  usedByFile[file] = declared.size

  const bad = []
  for (const name of declared) {
    checked++
    if (!known.has(name) && !isToken(name) && !isLocalAlias(name)) bad.push(name)
  }
  if (bad.length) {
    unknown += bad.length
    console.error(`\nstyles/${file}: ${bad.length} unknown variable(s)`)
    for (const n of bad.sort()) console.error('  - ' + n)
  }
}

// Also flag references to variables that are neither known nor defined by us,
// which catches a typo inside a var() as opposed to on the left-hand side.
const allDeclared = new Set()
const allReferenced = new Set()
for (const file of FILES) {
  const path = join(root, 'styles', file)
  if (!existsSync(path)) continue
  const css = readCss(path)
  for (const m of css.matchAll(/(^|[;{]|\*\/)\s*(--[a-z0-9-]+)\s*:/gim)) allDeclared.add(m[2])
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) allReferenced.add(m[1])
}
const danglingRefs = [...allReferenced].filter(
  n => !known.has(n) && !isToken(n) && !allDeclared.has(n),
)
if (danglingRefs.length) {
  unknown += danglingRefs.length
  console.error(`\nreferences to unknown variables:`)
  for (const n of danglingRefs.sort()) console.error('  - ' + n)
}

console.log()
console.log(`manifest: ${source.includes('node_modules') ? 'node_modules' : 'vendored'} (${known.size} names)`)
for (const [file, n] of Object.entries(usedByFile)) console.log(`  styles/${file}: ${n} declarations`)
console.log(`checked ${checked} declarations`)

if (unknown) {
  console.error(`\nFAILED: ${unknown} name(s) do not exist in Inkdrop.`)
  process.exit(1)
}
console.log('all variable names exist in Inkdrop')
