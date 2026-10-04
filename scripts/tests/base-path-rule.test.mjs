/**
 * The build and the hosting check read `BASE_PATH` by one rule.
 *
 * `vite.config.ts` builds with the value, and `scripts/check-hosting-rules.mjs`
 * judges the host's rules under it. Neither can import the other: the config
 * is bundled in isolation, and it is held byte-identical in a deployment that
 * has no `scripts/`. So the rule is written in each, and this is what makes
 * the two copies one fact. A value the build refuses and the check accepts
 * would be a check that stays green on a setting no build can make.
 *
 * The application's copy, `normalizeBasePath` in `src/lib/basePath.ts`, is
 * pinned to the same table by `src/lib/basePath.test.ts`. The render walk's
 * copy reads `process.env` while its config evaluates, carries the same
 * refusal, and is tested by running it.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'

import { normalizeBasePath as checkRule } from '../check-hosting-rules.mjs'
import { basePath as buildRule } from '../../vite.config.ts'

const RULES = { build: buildRule, check: checkRule }

const ACCEPTED = {
  '': '/',
  '   ': '/',
  '/': '/',
  demo: '/demo/',
  '/demo': '/demo/',
  'demo/': '/demo/',
  '//demo//': '/demo/',
  '/a/b': '/a/b/',
}

const REFUSED = [
  'https://example.com/demo/',
  './demo',
  '../demo',
  '/demo?x=1',
  '/demo#top',
  // A `.` or `..` anywhere: the build clears the root of `dist/` down to the
  // prefix, and a segment that climbs would clear outside it.
  '/../x/',
  '/a/../b/',
  '/./x/',
  '/a/..',
]

test('the build and the check normalise a path to the same answer', () => {
  for (const [value, expected] of Object.entries(ACCEPTED)) {
    for (const [name, rule] of Object.entries(RULES)) {
      assert.equal(rule(value), expected, `${name} rule on ${JSON.stringify(value)}`)
    }
  }
  for (const rule of Object.values(RULES)) assert.equal(rule(undefined), '/')
})

test('the build and the check refuse what is not a path', () => {
  for (const value of REFUSED) {
    for (const [name, rule] of Object.entries(RULES)) {
      assert.throws(() => rule(value), /path/, `${name} rule accepted ${JSON.stringify(value)}`)
    }
  }
})
