/**
 * The service claim the PostgREST slice carries is minted here, and it is what
 * PostgREST and the recipe read.
 *
 * Behind Supabase, GoTrue mints the token and stamps `app_metadata.role`;
 * behind the standalone PostgREST the slice runs against, this repository
 * mints it. What is held: the claims are the three the recipe's policies and
 * PostgREST's role switch read, the signature is HS256 over header and payload
 * with the secret PostgREST was started with, and a secret PostgREST would
 * refuse is refused here first, with the reason.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { claimsOf, mintServiceClaim } from '../mint-service-claim.mjs'

const SECRET = 'a-secret-that-is-long-enough-for-postgrest-0'

test('the token carries the authenticated role and the service claim, and expires', () => {
  const token = mintServiceClaim({ secret: SECRET, sub: '00000000-0000-4000-8000-000000000001', now: 1_000_000_000_000 })
  const claims = claimsOf(token)
  assert.equal(claims.role, 'authenticated')
  assert.equal(claims.sub, '00000000-0000-4000-8000-000000000001')
  assert.deepEqual(claims.app_metadata, { role: 'service' })
  assert.equal(claims.exp - claims.iat, 3600)
})

test('the signature is HS256 over header and payload with the secret', () => {
  const token = mintServiceClaim({ secret: SECRET })
  const [header, payload, signature] = token.split('.')
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  assert.equal(signature, expected)
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')), { alg: 'HS256', typ: 'JWT' })
})

test('a secret shorter than PostgREST accepts is refused with the reason', () => {
  assert.throws(() => mintServiceClaim({ secret: 'short' }), /at least 32 characters/)
})

test('a signed-in person who is not a service account carries no service role', () => {
  const claims = claimsOf(mintServiceClaim({ secret: SECRET, sub: 'person', service: false }))
  assert.equal(claims.role, 'authenticated')
  assert.equal(claims.sub, 'person')
  assert.deepEqual(claims.app_metadata, {})
})
