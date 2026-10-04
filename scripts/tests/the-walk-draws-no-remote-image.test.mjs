/**
 * THE WALK DRAWS NO IMAGE FROM A LIVE BUCKET.
 *
 * `render-walk/remote-images.ts` answers every image request bound for an
 * origin other than the walk's own with a placeholder built in the runner, so
 * a walk over a board exported from a live one spends none of that bucket's
 * egress. Here: the decision itself, the placeholder's bytes, and that every
 * spec in the walk takes its `test` from that file — a spec that imported
 * Playwright's own would walk with no route installed, and nothing else would
 * notice.
 *
 * The route working in a browser is `render-walk/remote-images.spec.ts`.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

import {
  PLACEHOLDER_PNG,
  RemoteRequests,
  answerFor,
  parseRequestUrl,
} from '../../render-walk/remote-images.ts'

const WALK = new URL('../../render-walk/', import.meta.url).pathname
const SERVED_ORIGIN = 'http://localhost:4173'

const answer = (address, type) => answerFor(parseRequestUrl(address), type, SERVED_ORIGIN)

test('an image on another origin is answered with the placeholder', () => {
  assert.equal(
    answer('https://abc.supabase.co/storage/v1/object/public/a/b.png', 'image'),
    'placeholder',
  )
  // Another port on the same host is another origin.
  assert.equal(answer('http://localhost:9999/x.png', 'image'), 'placeholder')
})

test('an image on the served origin goes through, inside the path or not', () => {
  assert.equal(answer('http://localhost:4173/demo/favicon.png', 'image'), 'same-origin')
  assert.equal(answer('http://localhost:4173/elsewhere.png', 'image'), 'same-origin')
})

test('anything other than an image on another origin is let through as remote', () => {
  for (const type of ['fetch', 'xhr', 'script', 'stylesheet', 'font', 'document', 'media']) {
    assert.equal(answer('https://api.example.com/x', type), 'remote', type)
  }
  assert.equal(answer('http://localhost:4173/api', 'fetch'), 'same-origin')
})

test('an address that reaches no server is left alone', () => {
  assert.equal(answer('data:image/png;base64,AAAA', 'image'), 'same-origin')
  assert.equal(answer('blob:http://localhost:4173/uuid', 'image'), 'same-origin')
  assert.equal(parseRequestUrl('not a url'), null)
  assert.equal(answerFor(null, 'image', SERVED_ORIGIN), 'same-origin')
})

test('the placeholder is a whole PNG, one pixel square', () => {
  assert.deepEqual(
    [...PLACEHOLDER_PNG.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  )
  assert.equal(PLACEHOLDER_PNG.toString('latin1', 12, 16), 'IHDR')
  assert.equal(PLACEHOLDER_PNG.readUInt32BE(16), 1)
  assert.equal(PLACEHOLDER_PNG.readUInt32BE(20), 1)
  const idatAt = PLACEHOLDER_PNG.indexOf('IDAT')
  const length = PLACEHOLDER_PNG.readUInt32BE(idatAt - 4)
  assert.doesNotThrow(() => inflateSync(PLACEHOLDER_PNG.subarray(idatAt + 4, idatAt + 4 + length)))
  assert.equal(PLACEHOLDER_PNG.toString('latin1', PLACEHOLDER_PNG.length - 8, PLACEHOLDER_PNG.length - 4), 'IEND')
})

test('the summary names the count and every other host', () => {
  const seen = new RemoteRequests()
  assert.match(seen.summary(), /0 remote image requests answered locally; no other cross-origin hosts/)
  seen.imagesAnswered = 1
  seen.otherHosts.add('fonts.example.com')
  seen.otherHosts.add('api.example.com')
  assert.match(
    seen.summary(),
    /1 remote image request answered locally; other cross-origin hosts: api\.example\.com, fonts\.example\.com/,
  )
})

/**
 * The ways a spec can bring in a `test` other than the walk's: a named import
 * from anywhere but `./remote-images` (renamed or not), or a namespace or
 * default import of Playwright's own, whose `.test` is the unrouted one.
 * Type-only names are not a `test`.
 */
export function foreignTestImports(source) {
  const found = []
  for (const [statement, clause, from] of source.matchAll(
    /^import\s+(?!type\s)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm,
  )) {
    const named = clause.match(/\{([\s\S]*)\}/)?.[1] ?? ''
    const bringsTest = named
      .split(',')
      .map((name) => name.trim())
      .some((name) => /^test(\s+as\s+\w+)?$/.test(name))
    const outsideBraces = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim()
    const wholeModule = from === '@playwright/test' && outsideBraces !== ''
    if ((bringsTest && from !== './remote-images') || wholeModule) found.push(statement)
  }
  return found
}

test('the import rule catches every way of bringing in Playwright\'s own test', () => {
  for (const source of [
    "import { expect, test } from '@playwright/test'",
    "import { test as base } from '@playwright/test'",
    "import * as pw from '@playwright/test'",
    "import pw from '@playwright/test'",
    "import {\n  expect,\n  test,\n} from '@playwright/test'",
    "import { test } from './somewhere-else'",
  ]) {
    assert.equal(foreignTestImports(source).length, 1, source)
  }
  for (const source of [
    "import { expect, type Page } from '@playwright/test'",
    "import type { TestInfo } from '@playwright/test'",
    "import { test } from './remote-images'",
  ]) {
    assert.deepEqual(foreignTestImports(source), [], source)
  }
})

test('every walk spec takes its test from remote-images.ts, and from nowhere else', () => {
  const specs = readdirSync(WALK).filter((name) => name.endsWith('.spec.ts'))
  assert.ok(specs.length > 0)
  for (const name of specs) {
    const source = readFileSync(join(WALK, name), 'utf8')
    assert.match(source, /import \{[^}]*\btest\b[^}]*\} from '\.\/remote-images'/, name)
    assert.deepEqual(
      foreignTestImports(source),
      [],
      `${name} brings in a test other than the walk's, which walks with no route installed`,
    )
  }
})
