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

import { pilotProfilesSql } from '../seed-pilot-profiles.mjs'

const example = JSON.parse(readFileSync('supabase/pilot/profiles.example.json', 'utf8'))

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
