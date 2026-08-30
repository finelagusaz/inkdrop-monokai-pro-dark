/*
 * Where this theme's files are.
 *
 * package.json's `styleSheets` is the list Inkdrop actually loads, so it is the
 * list every checker must walk. It used to be restated as a literal array in
 * check-variables and check-conditionals, which meant adding a stylesheet
 * silently dropped it from both - they would keep passing while checking less.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Stylesheet file names, in load order, straight from package.json. */
export const styleSheets = pkg.styleSheets

/** [{ file, path }] for each stylesheet, in load order. */
export const styleSheetFiles = styleSheets.map(file => ({ file, path: join(root, 'styles', file) }))
