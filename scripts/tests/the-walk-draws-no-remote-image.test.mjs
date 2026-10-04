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
} from '../../render-walk/remote-images.ts'

const WALK = new URL('../../render-walk/', import.meta.url).pathname
const SERVED = 'http://localhost:4173/demo/'

test('an image on another origin is answered with the placeholder', () => {
  assert.equal(
    answerFor('https://abc.supabase.co/storage/v1/object/public/a/b.png', 'image', SERVED),
    'placeholder',
  )
  // Another port on the same host is another origin.
  assert.equal(answerFor('http://localhost:9999/x.png', 'image', SERVED), 'placeholder')
})

test('an image on the served origin goes through, inside the path or not', () => {
  assert.equal(answerFor('http://localhost:4173/demo/favicon.png', 'image', SERVED), 'continue')
  assert.equal(answerFor('http://localhost:4173/elsewhere.png', 'image', SERVED), 'continue')
})

test('anything other than an image goes through, wherever it is bound', () => {
  for (const type of ['fetch', 'xhr', 'script', 'stylesheet', 'font', 'document', 'media']) {
    assert.equal(answerFor('https://api.example.com/x', type, SERVED), 'continue', type)
  }
})

test('an address that reaches no server is left alone', () => {
  assert.equal(answerFor('data:image/png;base64,AAAA', 'image', SERVED), 'continue')
  assert.equal(answerFor('blob:http://localhost:4173/uuid', 'image', SERVED), 'continue')
  assert.equal(answerFor('not a url', 'image', SERVED), 'continue')
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

test('every walk spec takes its test from remote-images.ts', () => {
  const specs = readdirSync(WALK).filter((name) => name.endsWith('.spec.ts'))
  assert.ok(specs.length > 0)
  for (const name of specs) {
    const source = readFileSync(join(WALK, name), 'utf8')
    assert.match(source, /import \{[^}]*\btest\b[^}]*\} from '\.\/remote-images'/, name)
    assert.doesNotMatch(
      source,
      /import \{[^}]*(?<!type )\btest\b[^}]*\} from '@playwright\/test'/,
      `${name} imports Playwright's own test, which walks with no route installed`,
    )
  }
})
