import type { BlueprintLane } from '@/types/blueprint'

/**
 * The Lane corridor rule, once.
 *
 * A lane reserves headroom for its own dependencies in two shapes: a strip
 * ABOVE the row for a forward arrow that clears at least one column (the
 * overhead rail — the cells it skips are in the way, so it climbs, runs, and
 * drops back in), and a thinner strip above the row for a backward arrow
 * (the in-lane loop — it turns back over the row it started on). Both are
 * decided the same way: restrict to the lane, resolve each cell's step to
 * its column, and compare the two ends. A third corridor, BELOW the row the
 * line of interaction draws under, is the divider's business and stays with
 * the lane roles in `blueprintLayout`; this module only prices it.
 *
 * The single board and the side-by-side compare used to each own a copy of
 * the predicate, under names that clashed, and the compare's copy resolved
 * a canonical lane into each compared blueprint while the board's matched
 * by id alone — so the two could disagree on row height. There is one
 * predicate now, and it resolves the lane every time: for a single board
 * the id matches first and nothing changes; for a compare, every source is
 * asked about the lane it calls by that name.
 *
 * Every rule reads the data — which lane a cell sits in, which column its
 * step occupies — never a lane's name. A name is not an input.
 */

/** Space reserved above a row for the overhead rail's horizontal leg. */
export const BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN = 36
/** Space reserved above a row for an in-lane loop's horizontal leg. */
export const BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN = 32
/** Space reserved below the row the line of interaction draws under. */
export const BLUEPRINT_WRAP_CORRIDOR_MARGIN = 36

/**
 * What a corridor decision reads: a blueprint's lanes, steps, cells and
 * dependencies, by their structure and nothing else, so a single path's
 * blueprint and a compared variant both qualify.
 */
export type CorridorSource = {
  lanes: readonly BlueprintLane[]
  steps: ReadonlyArray<{ id: string; position: number }>
  cells: ReadonlyArray<{ id: string; lane_id: string; step_id: string }>
  dependencies: ReadonlyArray<{ source_cell_id: string; target_cell_id: string }>
}

/**
 * The lane a blueprint calls by the canonical row's name.
 *
 * Compared paths describe the same lane under different ids, so a canonical
 * row is matched into each blueprint by id, then by name, then by position;
 * a lane matched by identity alone would report "no corridor" for every
 * variant but the one whose ids the row carries. The single board resolves
 * to itself on the first step.
 */
export function resolveBlueprintLane(
  canonicalLane: BlueprintLane,
  blueprint: Pick<CorridorSource, 'lanes'>,
): BlueprintLane {
  return (
    blueprint.lanes.find((lane) => lane.id === canonicalLane.id) ??
    blueprint.lanes.find((lane) => lane.name === canonicalLane.name) ??
    canonicalLane
  )
}

/** Step column of each cell in one lane, keyed by cell id. */
function laneCellColumns(source: CorridorSource, laneId: string): Map<string, number> {
  const columnByStepId = new Map(source.steps.map((step) => [step.id, step.position]))
  const columnByCellId = new Map<string, number>()
  for (const cell of source.cells) {
    if (cell.lane_id !== laneId) continue
    const column = columnByStepId.get(cell.step_id)
    if (column !== undefined) columnByCellId.set(cell.id, column)
  }
  return columnByCellId
}

/**
 * Does any source hold a dependency that stays inside the lane and whose two
 * step columns satisfy `matches`? A dependency that leaves the lane at either
 * end is routed between rows, not around one, and is not the lane's to price.
 */
function anySourceHasInLaneDependency(
  lane: BlueprintLane,
  sources: readonly CorridorSource[],
  matches: (sourceColumn: number, targetColumn: number) => boolean,
): boolean {
  return sources.some((source) => {
    const columnByCellId = laneCellColumns(source, resolveBlueprintLane(lane, source).id)
    if (columnByCellId.size === 0) return false
    return source.dependencies.some((dependency) => {
      const sourceColumn = columnByCellId.get(dependency.source_cell_id)
      const targetColumn = columnByCellId.get(dependency.target_cell_id)
      return sourceColumn !== undefined && targetColumn !== undefined && matches(sourceColumn, targetColumn)
    })
  })
}

function toSources(data: CorridorSource | readonly CorridorSource[] | undefined): readonly CorridorSource[] {
  if (data === undefined) return []
  return 'lanes' in data ? [data] : data
}

/**
 * A lane needs the overhead rail when one of its own dependencies runs
 * FORWARD and clears at least one column (target >= source + 2). The arrow
 * engine asks the same question of the rendered grid when it picks a detour;
 * the two must agree or the rail is drawn where no space was reserved.
 */
export function laneHasOverheadArrowCorridor(
  lane: BlueprintLane,
  data?: CorridorSource | readonly CorridorSource[],
): boolean {
  return anySourceHasInLaneDependency(lane, toSources(data), (from, to) => to >= from + 2)
}

/**
 * A lane needs the in-lane loop corridor when one of its own dependencies
 * runs BACKWARD — its target in an earlier column than its source.
 */
export function laneHasInLaneLoopCorridor(
  lane: BlueprintLane,
  data?: CorridorSource | readonly CorridorSource[],
): boolean {
  return anySourceHasInLaneDependency(lane, toSources(data), (from, to) => to < from)
}

/** Which corridors one row reserves. */
export type LaneCorridors = {
  overheadRailAbove: boolean
  inLaneLoopAbove: boolean
  wrapBelow: boolean
}

/** The height the corridors add to a row. */
export function laneCorridorMargins(corridors: Partial<LaneCorridors>): number {
  return (
    (corridors.overheadRailAbove ? BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN : 0) +
    (corridors.inLaneLoopAbove ? BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN : 0) +
    (corridors.wrapBelow ? BLUEPRINT_WRAP_CORRIDOR_MARGIN : 0)
  )
}

/**
 * A row's track: its own height plus every corridor it reserves. Both
 * layouts sum this — the single board over its lanes, the compare over its
 * row specs — so the two cannot disagree on how tall a corridor is.
 */
export function rowTrackHeight(height: number, corridors: Partial<LaneCorridors>): number {
  return height + laneCorridorMargins(corridors)
}
