/*
 * Minimal CSS reading shared by the checkers.
 *
 * Good enough for these files: they are generated or hand-written by us, are
 * well-formed, and contain no strings holding braces. check-variables used to
 * do the same job with a regex written out twice in the same file; this is the
 * one implementation both it and check-conditionals read from.
 */
import { readFileSync } from 'node:fs'

/** Comments mention variable names in prose (`hsl(var(--hsl-*))`); strip them first. */
export const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

const DECLARATION = /^\s*(--[a-z0-9-]+)\s*:/i

/**
 * Walk a stylesheet and yield every custom-property declaration together with
 * the stack of block headers enclosing it.
 */
export function* declarations(css) {
  const src = stripComments(css)
  const stack = []
  let buf = ''
  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '))
      buf = ''
    } else if (ch === '}' || ch === ';') {
      // A block's last declaration may omit its semicolon.
      const m = DECLARATION.exec(buf)
      if (m) yield { name: m[1], stack: [...stack] }
      if (ch === '}') stack.pop()
      buf = ''
    } else {
      buf += ch
    }
  }
}

/** Just the names declared in a stylesheet, deduplicated. */
export const declaredNames = css => new Set([...declarations(css)].map(d => d.name))

/** Every `var(--x)` referenced by a stylesheet. */
export function referencedNames(css) {
  const out = new Set()
  for (const m of stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) out.add(m[1])
  return out
}

export const readCss = path => readFileSync(path, 'utf8')
