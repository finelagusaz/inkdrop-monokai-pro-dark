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
import { declaredNames, readCss, referencedNames } from './lib/css.mjs'
import { STEPS } from './lib/palette.mjs'
import { styleSheetFiles } from './lib/theme.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// Resolved rather than joined onto `node_modules/` by hand, which only works
// while the install stays flat.
const installed = () => {
  try {
    const path = fileURLToPath(import.meta.resolve('@inkdropapp/css/variables.json'))
    return existsSync(path) ? path : null
  } catch {
    return null
  }
}

const source = installed() ?? join(here, 'inkdrop-variables.json')
const manifest = JSON.parse(readFileSync(source, 'utf8'))
const known = new Set(Object.values(manifest).flat())

// Design tokens are not in variables.json (they are primitives, not theme
// hooks), but overriding the ramps is exactly how a theme is meant to work.
const TOKEN = new RegExp(`^--(hsl|color)-([a-z]+-(${STEPS.join('|')})|black|white|current|transparent)$`)
const isToken = name => TOKEN.test(name)

// Locally-scoped aliases a stylesheet defines for its own use.
const isLocalAlias = name => name.startsWith('--monokai-')

const problems = []
const declaredByFile = {}
const allDeclared = new Set()
const allReferenced = new Set()

for (const { file, path } of styleSheetFiles) {
  if (!existsSync(path)) {
    problems.push(`missing: styles/${file}`)
    declaredByFile[file] = 0
    continue
  }
  const css = readCss(path)
  const declared = declaredNames(css)
  declaredByFile[file] = declared.size

  const bad = []
  for (const name of declared) {
    allDeclared.add(name)
    if (!known.has(name) && !isToken(name) && !isLocalAlias(name)) bad.push(name)
  }
  if (bad.length) {
    problems.push(
      `styles/${file}: ${bad.length} unknown variable(s)\n` + bad.sort().map(n => '  - ' + n).join('\n'),
    )
  }
  for (const name of referencedNames(css)) allReferenced.add(name)
}

// Also flag references to variables that are neither known nor defined by us,
// which catches a typo inside a var() as opposed to on the left-hand side.
const dangling = [...allReferenced].filter(n => !known.has(n) && !isToken(n) && !allDeclared.has(n))
if (dangling.length) {
  problems.push('references to unknown variables:\n' + dangling.sort().map(n => '  - ' + n).join('\n'))
}

console.log()
console.log(`manifest: ${source.includes('node_modules') ? 'node_modules' : 'vendored'} (${known.size} names)`)
for (const [file, n] of Object.entries(declaredByFile)) console.log(`  styles/${file}: ${n} declarations`)
const checked = Object.values(declaredByFile).reduce((a, b) => a + b, 0)
console.log(`checked ${checked} declarations`)

if (problems.length) {
  for (const p of problems) console.error('\n' + p)
  console.error(`\nFAILED: ${problems.length} problem(s).`)
  process.exit(1)
}
console.log('all variable names exist in Inkdrop')
