#!/usr/bin/env node
/**
 * A signed JWT that PostgREST reads as a service account.
 *
 * The recipe's write policies are `to authenticated`, ANDed with a restrictive
 * half that asks `public.is_service_account()` — true when the request's JWT
 * carries `app_metadata.role = 'service'`. Behind Supabase, GoTrue mints that
 * token and stamps the claim from `auth.users.raw_app_meta_data`; behind a
 * standalone PostgREST over the CI Postgres there is no GoTrue, so the claim
 * is minted here, with the secret PostgREST was started with. That is the
 * whole of it: HS256 over a header and a payload, the way PostgREST verifies
 * it, and nothing this repository would ever run against a real project.
 *
 *   PGRST_JWT_SECRET=<32+ chars> node scripts/mint-service-claim.mjs
 *
 * prints the token. The secret is read from the environment and never from a
 * flag, so it does not land in a process listing or a CI log line.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/**
 * The token, given the secret. `sub` is a random account id unless the caller
 * names one; `expiresInSeconds` keeps a leaked token from outliving the run.
 *
 * @param {{ secret: string, sub?: string, expiresInSeconds?: number, now?: number }} options
 */
export function mintServiceClaim(options) {
  return mintClaim(options, { role: 'service' })
}

/** A signed-in person without the service-account claim. Test harness only. */
export function mintPersonClaim(options) {
  return mintClaim(options, {})
}

function mintClaim({ secret, sub = randomUUID(), expiresInSeconds = 3600, now = Date.now() }, appMetadata) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('the JWT secret has to be at least 32 characters: PostgREST refuses a shorter one')
  }
  const issued = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      role: 'authenticated',
      sub,
      app_metadata: appMetadata,
      iat: issued,
      exp: issued + expiresInSeconds,
    }),
  )
  const signature = base64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${signature}`
}

/** The claims a token carries, read back without verifying — for a test to see what was minted. */
export function claimsOf(token) {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const secret = process.env.PGRST_JWT_SECRET
  if (!secret) {
    console.error('set PGRST_JWT_SECRET to the secret PostgREST was started with')
    process.exit(2)
  }
  process.stdout.write(`${mintServiceClaim({ secret })}\n`)
}
