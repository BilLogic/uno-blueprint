/**
 * The guard that keeps the vendored shadcn stylesheet a copy and not a fork.
 *
 * `src/styles/shadcn-tailwind.css` is `shadcn/tailwind.css`, copied in so the
 * app's stylesheet resolves without the shadcn CLI installed beside it. A copy
 * nobody compares is a fork by the next release, so the copy names the version
 * it came from and `scripts/check-vendored-css.mjs` holds it to the installed
 * one. This file holds the guard honest: the tree as committed passes, and a
 * stale version, an edited body and a missing header each go red.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'

import { drift, judge, readVendored, vendor } from '../check-vendored-css.mjs'

const UPSTREAM = '@custom-variant data-open {\n  &:where([data-state="open"]) {\n    @slot;\n  }\n}\n'

/* ------------------------------------------------------------ the tree */

test('the committed copy is the installed upstream file, at the version it names', () => {
  const verdict = judge()
  assert.equal(verdict.unverified, undefined, 'shadcn is a devDependency here, so it is installed')
  assert.deepEqual(verdict.findings, [])
  assert.equal(verdict.count, 1)
})

/* ------------------------------------------------------------- round trip */

test('what the vendoring writes, the check reads back as the same version and body', () => {
  const written = vendor(UPSTREAM, '9.9.9')
  assert.deepEqual(readVendored(written), { version: '9.9.9', body: UPSTREAM })
  assert.deepEqual(drift({ vendored: written, upstream: UPSTREAM, installed: '9.9.9' }), [])
})

/* ------------------------------------------------------------- planted */

test('a copy taken from another version is red, naming both', () => {
  const found = drift({ vendored: vendor(UPSTREAM, '4.13.0'), upstream: UPSTREAM, installed: '4.18.0' })
  assert.equal(found.length, 1)
  assert.match(found[0], /shadcn@4\.13\.0/)
  assert.match(found[0], /4\.18\.0/)
})

test('an edited body is red, naming the first line that differs', () => {
  const edited = vendor(UPSTREAM.replace('@slot;', '@slot; color: red;'), '9.9.9')
  const found = drift({ vendored: edited, upstream: UPSTREAM, installed: '9.9.9' })
  assert.equal(found.length, 1)
  // The edit is on the body's third line, counted from the end of the header.
  const headerLines = vendor('', '9.9.9').split('\n').length - 1
  assert.match(found[0], new RegExp(`:${headerLines + 3}\\b`))
})

test('a copy with no header naming its version is red rather than trusted', () => {
  const found = drift({ vendored: UPSTREAM, upstream: UPSTREAM, installed: '9.9.9' })
  assert.equal(found.length, 1)
  assert.match(found[0], /names no upstream version/)
})
