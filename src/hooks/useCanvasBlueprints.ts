import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  filterPathsForScenarioUi,
  getBlueprintFallback,
  getFallbackPathsForScenario,
  type OfflineBoard,
} from '@/data/blueprintFallbacks'
import { useOfflineBoard } from '@/contexts/DeploymentConfigContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { queryKeys } from '@/lib/queryKeys'
import { withSupabaseTimeout } from '@/lib/supabaseFetchTimeout'
import { resolveBlueprintForScenario } from '@/lib/resolveBlueprint'
import type { RawPath } from '@/lib/normalizeBlueprint'
import { asEntityStatus, DEFAULT_ENTITY_STATUS } from '@/lib/entityStatus'
import type { PathListItem } from '@/lib/pathSelection'
import { pickPreferredPath } from '@/lib/pathSelection'
import {
  fetchRemoteCells,
  remoteCellsFromBoards,
  unnamedFarEnds,
  withRemoteCells,
} from '@/lib/remoteCells'
import { PATH_BLUEPRINT_SELECT } from '@/lib/workflowQueries'
import type { BlueprintData } from '@/types/blueprint'

type CanvasRawPath = RawPath & {
  scenario_id: string
}

type CanvasBlueprintMaps = {
  blueprintsByScenario: Map<string, BlueprintData>
  pathsByScenario: Map<string, PathListItem[]>
  blueprintsByPathId: Map<string, BlueprintData>
  usingFallback: boolean
}

const EMPTY_MAPS: CanvasBlueprintMaps = {
  blueprintsByScenario: new Map(),
  pathsByScenario: new Map(),
  blueprintsByPathId: new Map(),
  usingFallback: false,
}

function pickPathForScenario(paths: CanvasRawPath[]): CanvasRawPath | null {
  if (paths.length === 0) return null
  return pickPreferredPath(paths) ?? null
}

function buildFallbackMaps(
  board: OfflineBoard,
  scenarioIds: string[],
): CanvasBlueprintMaps {
  const blueprintsByScenario = new Map<string, BlueprintData>()
  const pathsByScenario = new Map<string, PathListItem[]>()
  const blueprintsByPathId = new Map<string, BlueprintData>()

  for (const scenarioId of scenarioIds) {
    const paths: PathListItem[] = []
    for (const path of getFallbackPathsForScenario(board, scenarioId)) {
      const blueprint = getBlueprintFallback(board, scenarioId, path.id)
      if (blueprint) {
        blueprintsByPathId.set(path.id, blueprint)
      }
      // The sample's status lives on its blueprint; the generated path list
      // does not repeat it.
      paths.push({
        ...path,
        status: blueprint?.path.status ?? DEFAULT_ENTITY_STATUS,
      })
    }
    if (paths.length > 0) {
      pathsByScenario.set(scenarioId, paths)
    }

    const defaultBlueprint = getBlueprintFallback(board, scenarioId)
    if (defaultBlueprint) {
      blueprintsByScenario.set(scenarioId, defaultBlueprint)
    }
  }

  return {
    blueprintsByScenario,
    pathsByScenario,
    blueprintsByPathId,
    usingFallback: blueprintsByScenario.size > 0,
  }
}

/**
 * Group fetched path rows into the per-scenario / per-path blueprint maps.
 *
 * Reached only when a database is configured, which is why nothing here
 * reaches for the bundled sample: a scenario the database has no paths for is
 * a scenario with no paths, and it draws its empty state rather than this
 * template's fixture wearing the deployment's name. The only registry call left is
 * `filterPathsForScenarioUi`, which hides ids rather than supplying content.
 */
function deriveFromRows(
  board: OfflineBoard,
  rows: CanvasRawPath[],
  orderedScenarioIds: string[],
): CanvasBlueprintMaps {
  const grouped = new Map<string, CanvasRawPath[]>()
  const byPathId = new Map<string, BlueprintData>()

  for (const row of rows) {
    const list = grouped.get(row.scenario_id) ?? []
    list.push(row)
    grouped.set(row.scenario_id, list)

    const resolved = resolveBlueprintForScenario(board, row.scenario_id, row)
    if (resolved.blueprint) {
      byPathId.set(row.id, resolved.blueprint)
    }
  }

  const byScenario = new Map<string, BlueprintData>()
  const pathsMap = new Map<string, PathListItem[]>()

  for (const scenarioId of orderedScenarioIds) {
    const scenarioPaths = grouped.get(scenarioId) ?? []
    if (scenarioPaths.length > 0) {
      pathsMap.set(
        scenarioId,
        filterPathsForScenarioUi(
          board,
          scenarioId,
          scenarioPaths.map((path) => ({
            id: path.id,
            name: path.name,
            summary: path.summary ?? null,
            note: path.note ?? null,
            kind: path.kind,
            // The query selects it; left off here, every picker's status
            // badge silently had nothing to show.
            status: asEntityStatus(path.status) ?? DEFAULT_ENTITY_STATUS,
          })),
        ),
      )
    }

    const chosen = pickPathForScenario(scenarioPaths)
    const resolved = resolveBlueprintForScenario(board, scenarioId, chosen)
    if (resolved.blueprint) {
      byScenario.set(scenarioId, resolved.blueprint)
    }
  }

  return {
    blueprintsByScenario: byScenario,
    pathsByScenario: pathsMap,
    blueprintsByPathId: byPathId,
    usingFallback: false,
  }
}

/**
 * Blueprints for a set of scenarios, fetched ONE QUERY PER SCENARIO so
 * loading progress is measurable (each settle is one real tick), cache
 * keys are stable under membership changes (adding a scenario adds one
 * key; the rest stay warm), and a lost request degrades only its own
 * scenario to the static fallback instead of the whole board. Keys are
 * `queryKeys.canvasBlueprints`; the writes that change a board invalidate
 * them by scenario, path or cell through `queryClient.ts`.
 */
export function useCanvasBlueprints(scenarioIds: string[]) {
  const idsKey = scenarioIds.slice().sort().join(',')
  const orderedScenarioIds = useMemo(
    () => (idsKey ? idsKey.split(',') : []),
    [idsKey],
  )
  const board = useOfflineBoard()
  const staticFallbacks = useMemo(
    () => buildFallbackMaps(board, orderedScenarioIds),
    [board, orderedScenarioIds],
  )

  const { client, configured } = useSupabase()
  const noDb = !configured || !client

  const results = useQueries({
    queries: orderedScenarioIds.map((scenarioId) => ({
      queryKey: [queryKeys.canvasBlueprints.of(scenarioId)],
      enabled: !noDb,
      queryFn: ({ signal }): Promise<CanvasRawPath[]> =>
        withSupabaseTimeout(signal, async (deadline) => {
          const { data, error } = await client!
            .from('paths')
            .select(PATH_BLUEPRINT_SELECT)
            .eq('scenario_id', scenarioId)
            .abortSignal(deadline)
          if (error) throw new Error(error.message)
          // The select is built from the cell field list, so its type is
          // `string` rather than a literal supabase-js can parse a row shape
          // from; the row type is asserted, as the agent's reads of the same
          // select already do. The normalizer is the typed side.
          return (data ?? []) as unknown as CanvasRawPath[]
        }),
    })),
  })

  const loadedCount = results.filter(
    (result) => result.data !== undefined || result.error !== null,
  ).length
  const anyError = results.some((result) => result.error !== null)
  const allSettled = noDb || loadedCount === results.length
  const loading = orderedScenarioIds.length > 0 && !allSettled

  // dataUpdatedAt alone misses optimistic setQueryData that lands in the
  // same millisecond as the prior fetch; lane/step identity order must
  // bust the memo too or a drop keeps painting the pre-drop seats.
  const rowsKey = results
    .map((result) => {
      if (result.error) return 'e'
      const rows = result.data
      if (!Array.isArray(rows)) return String(result.dataUpdatedAt ?? 0)
      const order = rows
        .map((row) => {
          const lanes = (row.lanes ?? []).map((lane) => lane.id).join(',')
          const steps = row.path_steps
            ? row.path_steps.map((pathStep) => pathStep.steps?.id ?? '').join(',')
            : (row.steps ?? []).map((step) => step.id).join(',')
          return `${row.id}:${lanes}:${steps}`
        })
        .join(';')
      return `${result.dataUpdatedAt ?? 0}:${order}`
    })
    .join('|')
  const derived = useMemo<CanvasBlueprintMaps>(() => {
    if (orderedScenarioIds.length === 0) return EMPTY_MAPS
    if (noDb || !allSettled) {
      // Still on the wire → empty (the skeleton owns the canvas); no DB at
      // all → the static local fallbacks, same as before the split.
      return noDb ? staticFallbacks : EMPTY_MAPS
    }
    // Per-scenario degradation: a failed scenario contributes no rows and
    // therefore no board — the other scenarios keep their fetched data. It
    // does NOT contribute the bundled fixture: a read that failed against a
    // real database is an outage, and the sample is not what an outage looks
    // like.
    const rows = results.flatMap((result) => result.data ?? [])
    return deriveFromRows(board, rows, orderedScenarioIds)
    // rowsKey stands in for the results array's per-render identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, orderedScenarioIds, noDb, allSettled, rowsKey, staticFallbacks])

  /*
    The far ends of links that leave a path. Named from the boards just read
    wherever they can be — another path of a scenario on the canvas — and the
    rest in ONE follow-up read. Keyed under the boards' own prefix, so a write
    that refreshes the boards refreshes this with them; and with nothing to
    name, it never runs.
  */
  const loadedNames = useMemo(
    () => remoteCellsFromBoards(derived.blueprintsByPathId.values()),
    [derived],
  )
  const unnamed = useMemo(
    () => unnamedFarEnds(derived.blueprintsByPathId.values(), loadedNames),
    [derived, loadedNames],
  )
  const farEnds = useQuery({
    queryKey: [`${queryKeys.canvasBlueprints.prefix}far-ends:${unnamed.join(',')}`],
    enabled: !noDb && allSettled && unnamed.length > 0,
    queryFn: ({ signal }) =>
      withSupabaseTimeout(signal, (deadline) =>
        fetchRemoteCells(client!, unnamed, deadline),
      ),
  })
  const named = useMemo<CanvasBlueprintMaps>(() => {
    const all = new Map(loadedNames)
    for (const remote of farEnds.data ?? []) all.set(remote.id, remote)
    const attach = (boards: Map<string, BlueprintData>) =>
      new Map(
        [...boards].map(([key, board]) => [key, withRemoteCells(board, all)]),
      )
    return {
      ...derived,
      blueprintsByScenario: attach(derived.blueprintsByScenario),
      blueprintsByPathId: attach(derived.blueprintsByPathId),
    }
  }, [derived, loadedNames, farEnds.data])

  const firstError = results.find((result) => result.error)?.error
  const error = anyError
    ? firstError instanceof Error
      ? firstError.message
      : String(firstError)
    : null

  return {
    blueprintsByScenario: named.blueprintsByScenario,
    pathsByScenario: named.pathsByScenario,
    blueprintsByPathId: named.blueprintsByPathId,
    loading,
    error,
    /** The board on screen IS the bundled sample — only ever true with no
     *  database configured. A failed read against a real database is an
     *  outage, not a fallback, and `error` is what reports it. */
    usingFallback: named.usingFallback,
    /** Real network progress: settled chunks over total chunks. A no-DB
     *  session has nothing on the wire — it reports complete, so the bar
     *  never parks below full while nothing is loading. */
    progress: noDb
      ? { loaded: results.length, total: results.length }
      : { loaded: loadedCount, total: results.length },
  }
}
