import type {
  BlueprintCellDependency,
  BlueprintData,
  BlueprintPath,
  BlueprintRemoteCell,
} from '@/types/blueprint'

/**
 * Links that leave a path, as one board sees them.
 *
 * A dependency may join any two cells of one service. An edge with both ends
 * on this board is drawn as an arrow; an edge whose other end is on another
 * path never is, because one path's grid has nowhere to land it. What the
 * board draws for it instead is a marker on the cell at THIS end, naming the
 * other end and going there — and this module is where "which edges are
 * which" is decided, once, for both the arrows and the markers.
 */

/** Which end of the link this board's cell is. */
export type CrossPathDirection = 'out' | 'in'

export type CrossPathLink = {
  dependencyId: string
  direction: CrossPathDirection
  /** The cell on this board. */
  cellId: string
  /** The far end, on another path. */
  other: BlueprintRemoteCell
  /**
   * Where the far end is, said as briefly as tells it apart: the path's name
   * when it is another path of this board's own scenario, else the scenario's.
   */
  placeName: string
  /** "Continues in …" or "Comes from …". */
  label: string
  /** Where the far end is, as one line ({@link placeDetail}). */
  placeDetail: string
}

/**
 * True when both ends of an edge are cells of this board — the only edges an
 * arrow may be drawn for.
 */
export function isInPathDependency(
  blueprint: Pick<BlueprintData, 'cells'>,
  dependency: Pick<BlueprintCellDependency, 'source_cell_id' | 'target_cell_id'>,
  cellIds: ReadonlySet<string> = new Set(blueprint.cells.map((cell) => cell.id)),
): boolean {
  return (
    cellIds.has(dependency.source_cell_id) &&
    cellIds.has(dependency.target_cell_id)
  )
}

/** The edges an arrow may be drawn for: both ends on this board. */
export function inPathDependencies(
  blueprint: Pick<BlueprintData, 'cells' | 'dependencies'>,
): BlueprintCellDependency[] {
  const cellIds = new Set(blueprint.cells.map((cell) => cell.id))
  return blueprint.dependencies.filter((dependency) =>
    isInPathDependency(blueprint, dependency, cellIds),
  )
}

/**
 * Whether a far end is in the same scenario as the board looking at it —
 * decided by id, never by name: a scenario and a path may share one.
 * A board that does not know its scenario answers false.
 */
export function isSameScenario(
  from: Pick<BlueprintPath, 'scenarioId'>,
  scenarioId: string | undefined,
): boolean {
  return from.scenarioId !== undefined && from.scenarioId === scenarioId
}

/**
 * The name a marker uses for the far end: the path when the far end is on
 * another path of this board's scenario, the scenario otherwise. A scenario's
 * paths share its name, so naming the scenario there would name the place the
 * reader already is.
 */
export function crossPathPlaceName(
  blueprint: Pick<BlueprintData, 'path'>,
  other: Pick<BlueprintRemoteCell, 'pathName' | 'scenarioId' | 'scenarioName'>,
): string {
  return isSameScenario(blueprint.path, other.scenarioId)
    ? other.pathName
    : other.scenarioName
}

/**
 * Where another path is, said from this board, for a list that names cells on
 * many paths: the path alone when it is this scenario's, else the scenario
 * and the path — "Main route" is on every scenario.
 */
export function crossPathPlaceLabel(
  from: Pick<BlueprintPath, 'scenarioId'>,
  where: Pick<BlueprintRemoteCell, 'pathName' | 'scenarioId' | 'scenarioName'>,
): string {
  return isSameScenario(from, where.scenarioId)
    ? where.pathName
    : `${where.scenarioName} › ${where.pathName}`
}

/**
 * Where a far end is, as one line, said from the board looking at it:
 * `Path › Scenario · Phase`, dropping what that board already is. Another
 * path of this scenario is its path alone; another scenario in this phase
 * drops the phase. A board that does not know its own scenario or phase
 * keeps them, since it cannot tell they are the same.
 */
export function placeDetail(
  from: Pick<BlueprintPath, 'scenarioId' | 'phaseName'>,
  where: Pick<BlueprintRemoteCell, 'pathName' | 'scenarioId' | 'scenarioName' | 'phaseName'>,
): string {
  if (isSameScenario(from, where.scenarioId)) return where.pathName
  const scenario = `${where.pathName} › ${where.scenarioName}`
  const samePhase =
    from.phaseName !== undefined &&
    from.phaseName !== null &&
    from.phaseName === where.phaseName
  return where.phaseName && !samePhase
    ? `${scenario} · ${where.phaseName}`
    : scenario
}

export function crossPathLabel(
  direction: CrossPathDirection,
  placeName: string,
): string {
  return direction === 'out'
    ? `Continues in ${placeName}`
    : `Comes from ${placeName}`
}

const EMPTY: ReadonlyMap<string, readonly CrossPathLink[]> = new Map()
const cache = new WeakMap<
  BlueprintData,
  ReadonlyMap<string, readonly CrossPathLink[]>
>()

/**
 * Every cross-path `leads_to` on this board, grouped by the board's own cell.
 *
 * `leads_to` only: it is the drawn kind, and the marker is where its arrow
 * would have been. An `enables` edge is never drawn in-path either, so it is
 * not drawn across paths; the panel lists it.
 *
 * Cached per board object, because every cell of a band asks and the board is
 * immutable once read.
 */
export function crossPathLinksByCell(
  blueprint: BlueprintData,
): ReadonlyMap<string, readonly CrossPathLink[]> {
  const cached = cache.get(blueprint)
  if (cached) return cached
  const remotes = blueprint.remoteCells ?? []
  if (remotes.length === 0) {
    cache.set(blueprint, EMPTY)
    return EMPTY
  }

  const cellIds = new Set(blueprint.cells.map((cell) => cell.id))
  const remoteById = new Map(remotes.map((remote) => [remote.id, remote]))
  const byCell = new Map<string, CrossPathLink[]>()

  for (const dependency of blueprint.dependencies) {
    if ((dependency.kind ?? 'leads_to') !== 'leads_to') continue
    const outgoing =
      cellIds.has(dependency.source_cell_id) &&
      remoteById.get(dependency.target_cell_id)
    const incoming =
      cellIds.has(dependency.target_cell_id) &&
      remoteById.get(dependency.source_cell_id)
    const other = outgoing || incoming
    if (!other) continue
    const direction: CrossPathDirection = outgoing ? 'out' : 'in'
    const cellId = outgoing
      ? dependency.source_cell_id
      : dependency.target_cell_id
    const placeName = crossPathPlaceName(blueprint, other)
    const link: CrossPathLink = {
      dependencyId: dependency.id,
      direction,
      cellId,
      other,
      placeName,
      label: crossPathLabel(direction, placeName),
      placeDetail: placeDetail(blueprint.path, other),
    }
    const list = byCell.get(cellId)
    if (list) list.push(link)
    else byCell.set(cellId, [link])
  }

  // Arrivals before departures, the order the cell is read in.
  for (const list of byCell.values()) {
    list.sort((a, b) =>
      a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1,
    )
  }
  cache.set(blueprint, byCell)
  return byCell
}

const NO_LINKS: readonly CrossPathLink[] = Object.freeze([])

/**
 * The cross-path links on one cell, or on every cell of a slot. The same
 * array every time for a single cell, and a shared empty one for a cell with
 * none, so a cell face handed it re-renders only when its links change.
 */
export function crossPathLinksFor(
  blueprint: BlueprintData,
  cellIds: readonly (string | undefined)[],
): readonly CrossPathLink[] {
  const byCell = crossPathLinksByCell(blueprint)
  if (byCell.size === 0) return NO_LINKS
  if (cellIds.length === 1) {
    const only = cellIds[0]
    return (only && byCell.get(only)) || NO_LINKS
  }
  const links = cellIds.flatMap((cellId) =>
    cellId ? (byCell.get(cellId) ?? []) : [],
  )
  return links.length > 0 ? links : NO_LINKS
}
