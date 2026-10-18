/**
 * The pilot profile seed refuses a people file it cannot seed from, naming
 * what is missing. What it writes, and that it writes it once, is proved over
 * a real database by `npm run test:profiles:postgrest`.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { assertTestTarget, pilotProfilesSql } from '../seed-pilot-profiles.mjs'

const example = JSON.parse(readFileSync('supabase/pilot/profiles.example.json', 'utf8'))

test('the seed requires both an exact linked test target and explicit opt-in', () => {
  assert.throws(() => assertTestTarget({}, 'test-ref', true), /Refusing pilot seed/)
  assert.throws(() => assertTestTarget({ SUPABASE_PROJECT_REF: 'other' }, 'test-ref', true), /Refusing pilot seed/)
  assert.throws(() => assertTestTarget({ SUPABASE_PROJECT_REF: 'test-ref' }, 'test-ref', false), /Refusing pilot seed/)
  assert.doesNotThrow(() => assertTestTarget({ SUPABASE_PROJECT_REF: 'test-ref' }, 'test-ref\n', true))
})

test('the committed example is a people file the seed accepts', () => {
  assert.match(pilotProfilesSql(example), /^begin;[\s\S]*commit;\n$/)
})

test('a people file missing a role is refused, naming the role', () => {
  const { expert: _expert, ...rest } = example
  assert.throws(() => pilotProfilesSql(rest), /no name for the expert/)
})

test('a people file naming a role the pilot does not have is refused', () => {
  assert.throws(() => pilotProfilesSql({ ...example, customer: example.owner }), /unknown role "customer"/)
})

test('a name with a quote in it is written as one literal', () => {
  const sql = pilotProfilesSql({ ...example, owner: { name: "O'Hara", email: 'owner@example.test' } })
  assert.match(sql, /'O''Hara'/)
})
