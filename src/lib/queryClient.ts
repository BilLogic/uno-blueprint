import { QueryClient } from '@tanstack/react-query'
import { SupabaseTimeoutError } from '@/lib/supabaseFetchTimeout'
import { STRUCTURE_KEYS, queryKeys } from '@/lib/queryKeys'

/**
 * How long an unused response is kept before it is collected. Long enough
 * that the tabs and panels people move between stay warm, short enough that
 * a day-long session does not accumulate every cell's evidence, every slice
 * and every per-scenario payload it ever opened.
 */
const CACHE_RETENTION_MS = 30 * 60 * 1000

/**
 * The read policy, named so a test can build a throwaway client that behaves
 * exactly like the app's rather than restating these values and drifting.
 */
export const QUERY_DEFAULTS = {
  /*
   * Blueprint data is edited through explicit mutations, never by another
   * client, so there is nothing to poll for: a tab switch should reuse the
   * cached response rather than refetch. Revalidation is explicit — either
   * the key changes (reload tokens baked into keys, e.g. `useEvidence`) or
   * a mutation calls `invalidateQueries`.
   */
  staleTime: Infinity,
  /*
   * Staleness and collection are separate decisions, and only the first
   * one the header above argues for. `gcTime: Infinity` meant nothing was
   * ever released: a long session held every response it had ever made,
   * mounted or not. Collection costs nothing while a query is mounted —
   * the clock only starts once the last observer unmounts — and a
   * refetch after half an hour away is not a refetch anyone waits on.
   */
  gcTime: CACHE_RETENTION_MS,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  /*
   * One retry, and only for a deadline.
   *
   * `withSupabaseTimeout` bounds each attempt and aborts the request it
   * bounded, so a timeout means this attempt was too slow — not that the
   * database refused. Left unretried, that verdict stuck: stale time is
   * infinite and errors win over stale data, so the view showed a timeout
   * and the bundled fixture until a mutation invalidated it or the page
   * was reloaded. Everything else (a constraint, a policy, a missing row)
   * answers the same way however often it is asked, so it is not retried
   * and the fallback is not delayed.
   */
  retry: (failureCount: number, error: Error) =>
    failureCount < 1 && error instanceof SupabaseTimeoutError,
}

/**
 * Module-level client so `invalidateQueries` can stay a plain function call at
 * mutation sites rather than a hook — the app has exactly one client and no
 * SSR, which is the case where a module singleton is safe.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: QUERY_DEFAULTS },
})

/**
 * Drop every cached query whose key starts with `prefix` and refetch the
 * mounted ones. Mounted hooks keep serving their last value while the
 * refetch is in flight. Prefixes come from `queryKeys` — a family's `prefix`
 * or one member's key — and the writer that changed the rows is the caller:
 * a mutation module, never the panel or the tool that asked it to.
 *
 * Keys are single-element string arrays, so this is a prefix match on element
 * zero rather than TanStack's usual structural key matching.
 */
export function invalidateQueries(prefix: string): void {
  void queryClient.invalidateQueries({
    predicate: (query) => String(query.queryKey[0] ?? '').startsWith(prefix),
  })
}

/** How long `invalidateStructure` waits for the burst it belongs to to end. */
export const STRUCTURE_DEBOUNCE_MS = 250

let structureTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Every cache a structural write can change — see `STRUCTURE_KEYS`.
 *
 * Trailing-debounced: an agent turn of N writes would otherwise refetch
 * every open scenario N times, each invalidation cancelling the last one's
 * refetch mid-flight. A burst sweeps once, a quarter second after its last
 * write. Nothing reads the cache imperatively after a write, so the delay
 * only postpones what the mounted views show.
 */
export function invalidateStructure(): void {
  clearTimeout(structureTimer)
  structureTimer = setTimeout(() => {
    structureTimer = undefined
    for (const prefix of STRUCTURE_KEYS) invalidateQueries(prefix)
  }, STRUCTURE_DEBOUNCE_MS)
}

/** The rows one canvas query caches: paths with their cells. */
type CachedCanvasRows = Array<{ id: string; cells?: Array<{ id: string }> }> | undefined

function invalidateCanvasWhere(matches: (key: string, rows: CachedCanvasRows) => boolean): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = String(query.queryKey[0] ?? '')
      return (
        key.startsWith(queryKeys.canvasBlueprints.prefix) &&
        matches(key, query.state.data as CachedCanvasRows)
      )
    },
  })
}

/**
 * Invalidate exactly the scenario a write touched — one refetch, not a
 * board-wide storm, which is what the per-scenario canvas keys buy.
 * Membership changes (create/delete/duplicate scenario) go through
 * `invalidateStructure()`, whose bare canvas prefix matches every scenario.
 */
export function invalidateCanvasBlueprintsForScenario(scenarioId: string): void {
  // Exact, not the prefix match every other invalidation makes: scenario
  // `s1`'s key is a prefix of `s10`'s.
  const key = queryKeys.canvasBlueprints.of(scenarioId)
  invalidateCanvasWhere((candidate) => candidate === key)
}

/**
 * The one scenario query whose cached rows hold this path. A query with no
 * cached data yet counts as matching — stale to be safe.
 */
export function invalidateCanvasBlueprintsForPath(pathId: string): void {
  invalidateCanvasWhere((_key, rows) => rows === undefined || rows.some((row) => row.id === pathId))
}

/**
 * The one scenario query whose cached rows hold this cell, for the writers
 * that know a cell and not its path. Same rule for an empty cache.
 */
export function invalidateCanvasBlueprintsForCell(cellId: string): void {
  invalidateCanvasWhere(
    (_key, rows) =>
      rows === undefined ||
      rows.some((row) => (row.cells ?? []).some((cell) => cell.id === cellId)),
  )
}

/**
 * What every cell-level write changes on screen: the grid, and the board
 * holding the cell — or every board, when the writer knows no cell. One
 * function because six writers (text, spec, placements, their links and
 * resources, the restored text of a revert) had each spelled the pair.
 */
export function invalidateCellBoard(cellId: string | null | undefined): void {
  invalidateQueries(queryKeys.servicePhases.prefix)
  if (cellId) invalidateCanvasBlueprintsForCell(cellId)
  else invalidateQueries(queryKeys.canvasBlueprints.prefix)
}
