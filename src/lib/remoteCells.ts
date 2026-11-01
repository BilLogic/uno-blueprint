import type { SupabaseClient } from '@supabase/supabase-js'
import { one, type ToOne } from '@/lib/normalizeBlueprint'
import { REMOTE_CELL_SELECT } from '@/lib/workflowQueries'
import type { Database } from '@/types/database'
import type { BlueprintData, BlueprintRemoteCell } from '@/types/blueprint'

/**
 * The far ends of links that leave a path, named.
 *
 * A board is read one path at a time and its edges arrive as ids. An end that
 * is not one of the board's own cells is a far end, and the board needs it
 * named — for the cell's marker and the panel's row. Most far ends are cells
 * of another board the canvas has ALREADY loaded (another path of the
 * scenario, another scenario on the canvas), so they are named from those
 * boards for free; only what is left is read, in one query for all of them.
 * A canvas with no link off any path asks for nothing.
 *
 * Kept out of the board query on purpose: embedding the far end under every
 * edge fetched every in-path edge's two ends again, four joins deep, on every
 * board read.
 */

/** A cell row as {@link REMOTE_CELL_SELECT} returns it. */
export type RawRemoteCell = {
  id: string
  content?: string | null
  lanes?: ToOne<{ name: string | null }>
  steps?: ToOne<{ name: string | null }>
  paths?: ToOne<{
    id: string
    name: string
    scenarios?: ToOne<{
      id: string
      name: string
      phases?: ToOne<{ name: string }>
    }>
  }>
}

/**
 * One cell row, named — or null when the row does not say which path and
 * scenario it is in. A far end that cannot say where it is would put a marker
 * on the board that cannot say where it goes.
 */
export function remoteCellFromRow(raw: RawRemoteCell): BlueprintRemoteCell | null {
  const path = one(raw.paths)
  const scenario = one(path?.scenarios)
  if (!path || !scenario) return null
  return {
    id: raw.id,
    content: raw.content ?? '',
    laneName: one(raw.lanes)?.name ?? null,
    stepName: one(raw.steps)?.name ?? null,
    pathId: path.id,
    pathName: path.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    phaseName: one(scenario.phases)?.name ?? null,
  }
}

/** Where a board's scenario is, when the board itself does not say. */
export type ScenarioNames = (
  scenarioId: string,
) => { scenarioName: string; phaseName: string | null } | null

/**
 * Every cell of every loaded board, named as a far end would be. A board that
 * cannot say which scenario it is in contributes nothing.
 *
 * @param scenarioNames - Names for a board whose read carried none (the
 *   bundled sample's boards carry ids only).
 */
export function remoteCellsFromBoards(
  boards: Iterable<BlueprintData>,
  scenarioNames?: ScenarioNames,
): Map<string, BlueprintRemoteCell> {
  const named = new Map<string, BlueprintRemoteCell>()
  for (const board of boards) {
    const scenarioId = board.path.scenarioId
    if (!scenarioId) continue
    const names = board.path.scenarioName
      ? {
          scenarioName: board.path.scenarioName,
          phaseName: board.path.phaseName ?? null,
        }
      : (scenarioNames?.(scenarioId) ?? null)
    if (!names) continue
    const laneNames = new Map(board.lanes.map((lane) => [lane.id, lane.name]))
    const stepNames = new Map(board.steps.map((step) => [step.id, step.name]))
    for (const cell of board.cells) {
      if (named.has(cell.id)) continue
      named.set(cell.id, {
        id: cell.id,
        content: cell.content,
        laneName: laneNames.get(cell.lane_id) ?? null,
        stepName: stepNames.get(cell.step_id) ?? null,
        pathId: board.path.id,
        pathName: board.path.name,
        scenarioId,
        scenarioName: names.scenarioName,
        phaseName: names.phaseName,
      })
    }
  }
  return named
}

/** The ends of a board's edges that are not its own cells. */
function farEndIdsOf(board: BlueprintData): string[] {
  const own = new Set(board.cells.map((cell) => cell.id))
  const far: string[] = []
  for (const edge of board.dependencies) {
    if (!own.has(edge.source_cell_id)) far.push(edge.source_cell_id)
    if (!own.has(edge.target_cell_id)) far.push(edge.target_cell_id)
  }
  return far
}

/**
 * The far ends no loaded board names, sorted and each once — what the one
 * follow-up query asks for. Empty when every link stays on its path, or lands
 * on a board already loaded.
 */
export function unnamedFarEnds(
  boards: Iterable<BlueprintData>,
  named: ReadonlyMap<string, BlueprintRemoteCell>,
): string[] {
  const missing = new Set<string>()
  for (const board of boards) {
    for (const id of farEndIdsOf(board)) {
      if (!named.has(id)) missing.add(id)
    }
  }
  return [...missing].sort()
}

/**
 * Name these far ends in ONE read of `cells`. No ids, no request.
 */
export async function fetchRemoteCells(
  client: Pick<SupabaseClient<Database>, 'from'>,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<BlueprintRemoteCell[]> {
  if (ids.length === 0) return []
  let query = client.from('cells').select(REMOTE_CELL_SELECT).in('id', [...ids])
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  // The select is a template string, so its row type is asserted, as the
  // board read's is.
  return ((data ?? []) as unknown as RawRemoteCell[]).flatMap((row) => {
    const named = remoteCellFromRow(row)
    return named ? [named] : []
  })
}

/**
 * The board, carrying the named far ends of its own edges. The same object
 * when it has none, so a board with no link off its path keeps its identity
 * (every cell's marker lookup is cached on it).
 */
export function withRemoteCells(
  board: BlueprintData,
  named: ReadonlyMap<string, BlueprintRemoteCell>,
): BlueprintData {
  const ids = farEndIdsOf(board)
  if (ids.length === 0) return board
  const remoteCells: BlueprintRemoteCell[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const remote = named.get(id)
    if (!remote || seen.has(id) || remote.pathId === board.path.id) continue
    seen.add(id)
    remoteCells.push(remote)
  }
  return remoteCells.length > 0 ? { ...board, remoteCells } : board
}
