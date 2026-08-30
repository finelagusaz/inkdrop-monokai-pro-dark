#!/usr/bin/env node
/*
 * Verifies the acrylic branches actually take effect.
 *
 *   node scripts/check-acrylic.mjs
 *
 * Why this exists: generate-palette only ever renders one state - the ordinary,
 * opaque one - so palette.json says nothing about what happens under an acrylic
 * window. That is also the state this theme is most likely to break, because
 * theme.ui outranks theme.ui.base and an unconditional override silently wins
 * over the built-in `:root:has(body.acrylic-window)` branch it was supposed to
 * leave alone. check-conditionals.mjs catches that statically, by name. This
 * catches it dynamically, by resolved value.
 *
 * It renders the same stylesheet stack generate-palette uses, in the same order,
 * with the acrylic body classes added, and asserts the surfaces come back
 * translucent.
 *
 * Needs Chrome. If Puppeteer has not downloaded its own:
 *   PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" \
 *     node scripts/check-acrylic.mjs
 */
import puppeteer from 'puppeteer'
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Written next to the stylesheets so the page loads from a file:// origin.
const tmp = join(root, '.acrylic-check.html')

// Same list, same order as @inkdropapp/theme-dev-helpers' generate-palette.
// Kept verbatim so this renders what the app renders, not an approximation.
const BASE_STYLESHEETS = [
  '@inkdropapp/css/reset.css',
  '@inkdropapp/css/tokens.css',
  '@inkdropapp/css/ui.css',
  '@inkdropapp/css/tags.css',
  '@inkdropapp/css/status.css',
  '@inkdropapp/css/task-progress.css',
  '@inkdropapp/css/syntax.css',
  '@inkdropapp/css/markdown.css',
  '@inkdropapp/css/mermaid.css',
  '@inkdropapp/base-ui-theme/styles/theme.css',
]

// Absolute file:// URLs rather than relative hrefs: setContent leaves the
// document at about:blank, where a relative href resolves to nothing and every
// stylesheet silently fails to load. A run where nothing loaded looks exactly
// like a run where everything is unset, so resolve up front and fail loudly.
const href = p => {
  const abs = join(root, p)
  if (!existsSync(abs)) {
    console.error(`missing stylesheet: ${p}\n(run \`npm install\` first)`)
    process.exit(1)
  }
  return pathToFileURL(abs).href
}

const sheets = [
  ...BASE_STYLESHEETS.map(h => href(join('node_modules', h))),
  ...pkg.styleSheets.map(f => href(join('styles', f))),
]

const page = bodyClass => `<!doctype html>
<html>
  <head>
    ${sheets.map(h => `<link rel="stylesheet" href="${h}" />`).join('\n')}
  </head>
  <body class="${bodyClass}">
    <div class="cm-editor"></div>
    <div class="mde-preview"></div>
  </body>
</html>`

/** The variables whose behaviour under acrylic is the whole point. */
const WATCHED = [
  '--page-background',
  '--sidebar-background',
  '--note-list-bar-background',
  '--editor-background',
  '--editor-background-color', // CodeMirror's own surface, set in syntax.css
  '--editor-drawer-background',
  '--preferences-sidebar-background',
  '--preferences-view-background',
  '--inline-dropdown-menu-background',
  '--vertical-menu-background',
]

/** True when a color lets anything through: transparent, or alpha below 100%. */
function isTranslucent(value) {
  const v = String(value).trim()
  if (v === 'transparent' || v === 'rgba(0, 0, 0, 0)') return true
  let m = /^rgba?\([^)]*?[,/]\s*(0?\.\d+|0|1)\s*\)$/i.exec(v)
  if (m) return parseFloat(m[1]) < 1
  m = /\/\s*([\d.]+)%\s*\)/.exec(v) // hsl(... / 60%)
  if (m) return parseFloat(m[1]) < 100
  return false
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  headless: true,
})

try {
  const tab = await browser.newPage()

  const read = async bodyClass => {
    // Navigate to a real file:// page rather than using setContent. setContent
    // leaves the document on an opaque about:blank origin, from which Chrome
    // refuses to load file:// stylesheets - they appear in document.styleSheets
    // with zero rules, which reads identically to "the theme set nothing".
    writeFileSync(tmp, page(bodyClass))
    await tab.goto(pathToFileURL(tmp).href + `?c=${encodeURIComponent(bodyClass)}`, {
      waitUntil: 'load',
    })
    // A stylesheet that fails to load still fires `load`, and every variable
    // then reads as empty - indistinguishable from "the theme set nothing".
    // Counting cssRules does NOT settle it: Chrome gives each file:// document
    // an opaque origin, so enumerating a file:// sheet's rules throws even when
    // the sheet is applied. Probe sentinel values instead: one from Inkdrop's
    // base stylesheets, one this theme defines.
    const sentinels = await tab.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return {
        base: cs.getPropertyValue('--font-name').trim(), // @inkdropapp/css ui.css
        theme: cs.getPropertyValue('--hsl-neutral-800').trim(), // our tokens.css
        sheets: document.styleSheets.length,
      }
    })
    if (!sentinels.base || !sentinels.theme) {
      console.error(
        `stylesheets did not apply (${sentinels.sheets} link elements; ` +
          `--font-name=${JSON.stringify(sentinels.base)}, ` +
          `--hsl-neutral-800=${JSON.stringify(sentinels.theme)}) - cannot judge anything`,
      )
      process.exit(1)
    }
    return tab.evaluate(names => {
      const cs = getComputedStyle(document.documentElement)
      const out = {}
      for (const n of names) out[n] = cs.getPropertyValue(n).trim()
      out['@body'] = document.body.className
      return out
    }, WATCHED)
  }

  const base = `${pkg.name} dark-mode`
  const states = {
    'plain (no acrylic)': await read(base),
    acrylic: await read(`${base} acrylic-window`),
    'acrylic + win32': await read(`${base} acrylic-window platform-win32`),
  }

  const width = Math.max(...WATCHED.map(n => n.length))
  for (const [label, values] of Object.entries(states)) {
    console.log(`\n${label}`)
    for (const n of WATCHED) {
      const v = values[n] || '(unset)'
      const mark = isTranslucent(v) ? 'see-through' : ''
      console.log(`  ${n.padEnd(width)}  ${v.padEnd(42)} ${mark}`)
    }
  }

  const problems = []

  // The page must stop painting so the composited blur behind it is visible.
  if (states.acrylic['--page-background'] !== 'transparent') {
    problems.push(
      `--page-background is "${states.acrylic['--page-background']}" under acrylic, expected transparent. ` +
        `An unconditional override in ui.css is shadowing the built-in branch.`,
    )
  }

  // Every surface that sits on the blur has to let it through.
  for (const n of [
    '--sidebar-background',
    '--note-list-bar-background',
    '--editor-background',
    '--editor-background-color',
  ]) {
    const v = states.acrylic[n]
    if (!isTranslucent(v)) {
      problems.push(`${n} is opaque under acrylic ("${v}") - the blur cannot show through it.`)
    }
  }

  // Windows composites its own layer behind the window, so the page needs a
  // scrim there rather than the full transparency it gets elsewhere.
  const win32Page = states['acrylic + win32']['--page-background']
  if (win32Page === states.acrylic['--page-background']) {
    problems.push(
      `--page-background did not change for platform-win32 (still "${win32Page}"). ` +
        `Without a scrim the desktop reads straight through the window.`,
    )
  }

  // These must differ from the plain state, or the acrylic block never applied.
  const unchanged = WATCHED.filter(
    n => states.acrylic[n] === states['plain (no acrylic)'][n] && !isTranslucent(states.acrylic[n]),
  )
  if (unchanged.length === WATCHED.length) {
    problems.push('nothing changed between the plain and acrylic states - the branch never matched.')
  }

  console.log()
  if (problems.length) {
    console.error(`FAILED: ${problems.length} problem(s) in the acrylic path:\n`)
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('acrylic path resolves correctly in all three states')
} finally {
  await browser.close()
  rmSync(tmp, { force: true })
}
