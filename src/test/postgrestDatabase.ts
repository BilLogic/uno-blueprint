import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * A real database behind the same calls — standalone PostgREST over the CI
 * Postgres, reached through `supabase-js` the way the browser reaches a
 * project, as the role a signed-in author is.
 *
 * `scripts/run-slice-over-postgrest.mjs` builds the stack, starts PostgREST
 * with a secret it generates, mints the service claim with that secret and
 * runs a slice with these two variables set. A slice that finds them uses
 * this instead of the in-memory table; a slice that does not runs its fast
 * form. Nothing else reads them.
 *
 * The bearer token is the whole of the identity: PostgREST verifies it with
 * the secret it was started with and switches to the `role` claim inside it,
 * and the recipe's restrictive policies read `app_metadata.role` off it
 * through `auth.jwt()`. The `apikey` header supabase-js insists on is set to
 * the same token; PostgREST ignores it.
 */
export const POSTGREST_URL = process.env.SLICE_POSTGREST_URL ?? ''
export const POSTGREST_JWT = process.env.SLICE_POSTGREST_JWT ?? ''

/** Whether this run is over PostgREST: both variables set. */
export const overPostgrest = POSTGREST_URL !== '' && POSTGREST_JWT !== ''

/** Adapt the project REST prefix to a standalone PostgREST endpoint. */
export function postgrestFetch(url: string): typeof fetch {
  const rest = `${url}/rest/v1`
  return (input, init) => fetch(String(input).replace(rest, url), init)
}

export function postgrestClient(): SupabaseClient<Database> {
  if (!overPostgrest) {
    throw new Error('SLICE_POSTGREST_URL and SLICE_POSTGREST_JWT are both needed to reach PostgREST')
  }
  // supabase-js addresses a project's PostgREST at `/rest/v1`; a standalone
  // PostgREST serves at its root. The one place the two differ is the path,
  // so the client's fetch is the platform's with that prefix taken off.
  return createClient<Database>(POSTGREST_URL, POSTGREST_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${POSTGREST_JWT}` }, fetch: postgrestFetch(POSTGREST_URL) },
  })
}

/**
 * A client carrying one named caller's claim, for a live test that needs more
 * than one person: the runner mints each token with this run's secret.
 */
export function postgrestClientAs(jwt: string): SupabaseClient<Database> {
  if (POSTGREST_URL === '' || jwt === '') {
    throw new Error('SLICE_POSTGREST_URL and a minted token are both needed to reach PostgREST')
  }
  return createClient<Database>(POSTGREST_URL, jwt, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: postgrestFetch(POSTGREST_URL) },
  })
}
