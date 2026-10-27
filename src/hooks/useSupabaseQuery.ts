import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { withSupabaseTimeout } from '@/lib/supabaseFetchTimeout'
import { errorMessage } from '@/lib/utils'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/** A read's answer, keyed by its query status — `loading`, `ready` or `error`: a fact about the data, never about the screen. */
export type QueryResult<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; source: 'database' | 'fallback' }
  | { status: 'error'; message: string; fallback: T | null }

type SettledQueryResult<T> = Exclude<QueryResult<T>, { status: 'loading' }>

const LOADING_RESULT = { status: 'loading' } as const

const NOT_CONFIGURED_MESSAGE = 'No database connected'


/**
 * One shared query state machine for read hooks (thin hooks like `useSlices`
 * wrap it). `key` identifies the request: results are cached by key and shared
 * across mounts, the fetcher re-runs when the key changes, and stale responses
 * are dropped. Pass `key: null` to gate the query — nothing runs and the result
 * stays `loading` (e.g. while a parent query resolves). `fetcher` is read
 * through a ref, so inline closures are fine — it is re-evaluated per key, not
 * per identity. `fallback` must be referentially stable (wrap it in
 * `useCallback`): the no-DB and error results are memoized on its identity.
 *
 * No-DB mode (client null) resolves synchronously from `fallback()`:
 * `ready`/`'fallback'` when it returns data, `error` when it returns null.
 * Database errors and timeouts surface as `error` with `fallback` populated.
 *
 * `fetcher` is handed the query's abort signal alongside the client and must
 * pass it to the request (`.abortSignal(signal)`): that is what makes leaving
 * a view, or changing its key, stop the read it started.
 *
 * The caching, dedupe and invalidation underneath are TanStack Query's; this
 * wrapper exists so callers keep a single discriminated union to switch on
 * instead of the `isPending`/`isError`/`data` triple, and so the no-DB branch —
 * which has no request to make and must not enter the cache at all — stays
 * outside the query.
 */
export function useSupabaseQuery<T>(
  key: string | null,
  fetcher: (
    client: SupabaseClient<Database>,
    signal: AbortSignal,
  ) => PromiseLike<T>,
  fallback: () => T | null,
): QueryResult<T> {
  const { client, configured } = useSupabase()
  const fetcherRef = useRef(fetcher)
  // Committed in an effect, not the render body: a discarded concurrent
  // render must not leave its fetcher in the ref. `queryFn` only reads the
  // ref at fetch time, which is always post-commit.
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const noDb = !configured || !client

  const query = useQuery<T>({
    queryKey: [key],
    enabled: key !== null && !noDb,
    queryFn: ({ signal }) =>
      withSupabaseTimeout(signal, (deadline) =>
        // The async wrapper turns a synchronous fetcher throw into a rejection
        // (surfaced as the error state) instead of an unhandled exception.
        (async () =>
          fetcherRef.current(client as SupabaseClient<Database>, deadline))(),
      ),
  })

  // No-DB mode resolves synchronously; memoized so callers get a stable
  // result object as long as their fallback is stable.
  const noDbResult = useMemo<SettledQueryResult<T> | null>(() => {
    if (!noDb || key === null) return null
    const data = fallback()
    return data !== null
      ? { status: 'ready', data, source: 'fallback' }
      : { status: 'error', message: NOT_CONFIGURED_MESSAGE, fallback: null }
  }, [noDb, key, fallback])

  // Error wins over a stale `data` so a failed refetch surfaces rather than
  // silently continuing to show the previous response. Memoized for the same
  // reason the no-DB branch above is: while a query stays errored this branch
  // runs on EVERY render of every consumer, and rebuilding the result
  // re-invoked `fallback()` — which for most callers rebuilds a whole seed
  // structure — and handed the consumer a fresh object to re-render on.
  const error = query.error
  const errorResult = useMemo<SettledQueryResult<T> | null>(
    () =>
      error
        ? {
            status: 'error',
            message: errorMessage(error),
            fallback: fallback(),
          }
        : null,
    [error, fallback],
  )

  if (key === null) return LOADING_RESULT
  if (noDbResult) return noDbResult
  if (errorResult) return errorResult
  if (query.data !== undefined) {
    return { status: 'ready', data: query.data, source: 'database' }
  }
  return LOADING_RESULT
}
