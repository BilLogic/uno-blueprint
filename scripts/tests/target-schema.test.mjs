#!/usr/bin/env node
/**
 * The four answers "did the migration run" can have.
 *
 * These branches are decisions about somebody else's broken deployment, which
 * is exactly the code nobody exercises by hand — a target that has never been
 * migrated and a target that is one version stale need different sentences,
 * and only one of them is discoverable by looking at a healthy container.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { interpret, parseEnvFile, supportedVersions } from '../check-target-schema.mjs'

// The schema's own enum, newest first — the last test in this file is the
// guard that it stays the same list.
const SUPPORTED = ['2026.09.12', '2026.09.11', '2026.09.10', '2026.09.09', '2026.09.08', '2026.09.07', '2026.09.06', '2026.09.05', '2026.09.04', '2026.09.03', '2026.09.02', '2026.09.01', '2026.08.31', '2026.08.27', '2026.08.26', '2026.08.25', '2026.07.16']

test('a compatible target passes and says which version it carries', () => {
  const result = interpret({ status: 200, body: [{ version: '2026.08.25' }] }, SUPPORTED)
  assert.equal(result.ok, true)
  assert.equal(result.found, '2026.08.25')
})

test('a target that ran every migration in order is compatible (#197)', () => {
  // The version the last migration to touch the schema actually stamps. It sat
  // in no version list for two releases, so this check — written to catch a
  // target that is BEHIND — was failing the one that was exactly right. A
  // freshly replayed database answers 2026.09.08 and nothing else does, which
  // is why the literal is spelled out here rather than read from the list.
  const result = interpret({ status: 200, body: [{ version: '2026.09.08' }] }, supportedVersions())
  assert.equal(result.ok, true)
  assert.equal(result.found, '2026.09.08')
})

test('a target that was never migrated says so, rather than "incompatible"', () => {
  // PostgREST answers 404 for a relation it cannot see. That is a different
  // problem from a stale schema, and it gets a different instruction.
  const result = interpret({ status: 404, body: { message: 'relation does not exist' } }, SUPPORTED)
  assert.equal(result.code, 'not-migrated')
  assert.match(result.message, /never been migrated/)
  assert.match(result.message, /supabase db push/)
})

test('an unknown version names both sides', () => {
  const result = interpret({ status: 200, body: [{ version: '2025.01.01' }] }, SUPPORTED)
  assert.equal(result.code, 'incompatible')
  assert.match(result.message, /2025\.01\.01/)
  assert.match(result.message, /2026\.08\.25/)
})

test('an empty table is neither missing nor stale', () => {
  const result = interpret({ status: 200, body: [] }, SUPPORTED)
  assert.equal(result.code, 'empty')
  assert.match(result.message, /21000101000000/)
})

test('an unreachable target is not reported as a schema problem', () => {
  const result = interpret({ status: 503, body: null }, SUPPORTED)
  assert.equal(result.code, 'unreachable')
})

test('the supported list comes from the schema, not from a second copy', () => {
  assert.deepEqual(supportedVersions(), SUPPORTED)
})

test('dotenv values survive quotes, spacing, and comments', () => {
  const values = parseEnvFile(
    ['# a comment', 'VITE_SUPABASE_URL = "https://example.supabase.co"', "VITE_SUPABASE_ANON_KEY='abc123'", ''].join('\n'),
  )
  assert.equal(values.VITE_SUPABASE_URL, 'https://example.supabase.co')
  assert.equal(values.VITE_SUPABASE_ANON_KEY, 'abc123')
})
