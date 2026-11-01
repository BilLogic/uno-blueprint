import {
  asEntityStatus,
  DEFAULT_ENTITY_STATUS,
} from '@/lib/entityStatus'
import type {
  BlueprintCell,
  BlueprintCellDependency,
  BlueprintData,
  BlueprintLane,
  BlueprintStep,
} from '@/types/blueprint'
import type { PathKind } from '@/types/database'
import { cellFieldsFromRow, type RawCellColumns } from '@/lib/cellFields'
import { cellResourcesFromRows, type RawCellResource } from '@/lib/cellResources'
import {
  cellTouchpointsFromRows,
  type RawCellTouchpoint,
} from '@/lib/cellTouchpoints'

/**
 * A to-one embed: PostgREST answers with an object, a hand-built row may hand
 * a one-row array; both read the same.
 */
export type ToOne<T> = T | T[] | null

export function one<T>(value: ToOne<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

type RawOutgoingDependency = {
  id: string
  target_cell_id: string
  /** Fallback data omits these — default kind 'leads_to', name/note null. */
  kind?: string | null
  name?: string | null
  note?: string | null
}

/** An edge arriving at a cell of this path, embedded under its target. */
type RawIncomingDependency = {
  id: string
  source_cell_id: string
  kind?: string | null
  name?: string | null
  note?: string | null
}

/** Normalize a raw kind column value; anything unknown is a plain dependency. */
function normalizeDependencyKind(kind: string | null | undefined): 'leads_to' | 'enables' {
  return kind === 'enables' ? 'enables' : 'leads_to'
}

/**
 * A cell as the board query returns it: the columns the cell field list
 * names, plus the relations the query embeds under it.
 */
export type RawCell = RawCellColumns & {
  /** `resources` rows embedded by the board query. */
  resources?: RawCellResource[] | null
  /** `cell_touchpoints` rows embedded by the board query. */
  cell_touchpoints?: RawCellTouchpoint[] | null
  outgoing?: RawOutgoingDependency[] | null
  incoming?: RawIncomingDependency[] | null
}

type RawPathStep = {
  position: number
  steps: { id: string; name: string; summary?: string | null } | null
}

export type RawLane = {
  id: string
  name: string
  position: number
  /** Semantic role column as selected from the DB. */
  lane_role?: string | null
  /** Normalized shape (fallback data passes BlueprintLane directly). */
  role?: string | null
}

export type RawPath = {
  id: string
  name: string
  summary?: string | null
  note?: string | null
  kind: PathKind
  /** The `entity_status` column, as text; anything unknown reads as `live`. */
  status?: string | null
  scenario_id?: string | null
  /** The path's scenario and its phase, embedded by the board query. */
  scenarios?: ToOne<{ name: string; phases?: ToOne<{ name: string }> }>
  lanes?: RawLane[] | null
  /** @deprecated Legacy shape; use path_steps */
  steps?: BlueprintStep[] | null
  path_steps?: RawPathStep[] | null
  cells?: RawCell[] | null
  cell_dependencies?: BlueprintCellDependency[] | null
}

/** Flatten path_steps junction rows into blueprint steps sorted by column. */
export function flattenPathSteps(raw: RawPathStep[]): BlueprintStep[] {
  return [...raw]
    .sort((a, b) => a.position - b.position)
    .flatMap((row) => {
      if (!row.steps) return []
      return [
        {
          id: row.steps.id,
          name: row.steps.name,
          summary: row.steps.summary ?? null,
          position: row.position,
        },
      ]
    })
}

function resolveSteps(raw: RawPath): BlueprintStep[] {
  if (raw.path_steps && raw.path_steps.length > 0) {
    return flattenPathSteps(raw.path_steps)
  }
  return [...(raw.steps ?? [])].sort(
    (a, b) => a.position - b.position,
  )
}

/**
 * The one mapping from a raw dependency row to an edge on the board.
 *
 * A board arrives with its edges either gathered into a top-level
 * `cell_dependencies` array or nested under each cell as `outgoing`, and the
 * two doors used to hold two copies of this mapping. They drifted: the
 * top-level copy spread the row, so every column the select happened to carry
 * rode along onto the edge, and its `note` was there only because the spread
 * put it there. One mapping, listing its six fields, so there is nothing left
 * to drift.
 *
 * `sourceCellId` is a parameter because only the nested door knows it from
 * context: the row under a cell does not name its own source.
 */
function toBlueprintDependency(
  raw: RawOutgoingDependency,
  sourceCellId: string,
): BlueprintCellDependency {
  return {
    id: raw.id,
    source_cell_id: sourceCellId,
    target_cell_id: raw.target_cell_id,
    kind: normalizeDependencyKind(raw.kind),
    name: raw.name ?? null,
    note: raw.note ?? null,
  }
}

/**
 * Every edge touching this path's cells, each once.
 *
 * Outgoing first, because an edge between two of this path's cells arrives
 * twice — under its source and under its target — and the outgoing copy is
 * the one the board has always read. An incoming copy adds an edge only when
 * its source is on another path.
 */
function flattenDependenciesFromCells(
  cells: RawCell[],
): BlueprintCellDependency[] {
  const dependencies: BlueprintCellDependency[] = []
  const seen = new Set<string>()

  for (const cell of cells) {
    for (const outgoing of cell.outgoing ?? []) {
      if (seen.has(outgoing.id)) continue
      seen.add(outgoing.id)
      dependencies.push(toBlueprintDependency(outgoing, cell.id))
    }
  }
  for (const cell of cells) {
    for (const incoming of cell.incoming ?? []) {
      if (seen.has(incoming.id)) continue
      seen.add(incoming.id)
      dependencies.push(
        toBlueprintDependency(
          { ...incoming, target_cell_id: cell.id },
          incoming.source_cell_id,
        ),
      )
    }
  }
  return dependencies
}

/** Collapse duplicate swim lanes that share a name (e.g. legacy + fallback lane IDs). */
export function deduplicateBlueprintLanes(data: BlueprintData): BlueprintData {
  const lanesByName = new Map<string, BlueprintLane[]>()
  for (const lane of data.lanes) {
    const group = lanesByName.get(lane.name) ?? []
    group.push(lane)
    lanesByName.set(lane.name, group)
  }

  const duplicateGroups = [...lanesByName.values()].filter(
    (group) => group.length > 1,
  )
  if (duplicateGroups.length === 0) {
    return data
  }

  const cellCountByLaneId = new Map<string, number>()
  for (const cell of data.cells) {
    cellCountByLaneId.set(
      cell.lane_id,
      (cellCountByLaneId.get(cell.lane_id) ?? 0) + 1,
    )
  }

  const laneIdRemap = new Map<string, string>()
  const keptLanes: BlueprintLane[] = []

  for (const group of lanesByName.values()) {
    if (group.length === 1) {
      keptLanes.push(group[0])
      continue
    }

    const canonical = [...group].sort((a, b) => {
      const cellDiff =
        (cellCountByLaneId.get(b.id) ?? 0) -
        (cellCountByLaneId.get(a.id) ?? 0)
      if (cellDiff !== 0) return cellDiff
      return a.position - b.position
    })[0]

    keptLanes.push({
      ...canonical,
      position: Math.min(...group.map((lane) => lane.position)),
    })

    for (const lane of group) {
      if (lane.id !== canonical.id) {
        laneIdRemap.set(lane.id, canonical.id)
      }
    }
  }

  // Keyed on the SLOT — lane, step and position — not on (lane, step).
  //
  // A slot holds a list, not a cell: the tech-cell split made every touchpoint
  // in a tech lane its own row at position 0..n, and `BlueprintCell.position`
  // says so in its own docstring. Collapsing on `${laneId}:${stepId}` kept one
  // cell per (lane, step) and dropped every sibling — and it did that board
  // wide, over `data.cells` entire, not only over the lanes that were actually
  // merged. One duplicated lane name anywhere silently emptied every
  // multi-cell slot on the board.
  //
  // What this loop is FOR is narrower than that: when two lanes merge into
  // one, the same slot can arrive twice, and the copy with content wins over
  // the empty one. That question is per-position, which is what the key now
  // says.
  const cellBySlot = new Map<string, BlueprintCell>()
  for (const cell of data.cells) {
    const laneId = laneIdRemap.get(cell.lane_id) ?? cell.lane_id
    const key = `${laneId}:${cell.step_id}:${cell.position}`
    const existing = cellBySlot.get(key)
    const nextCell = { ...cell, lane_id: laneId }

    if (!existing) {
      cellBySlot.set(key, nextCell)
      continue
    }

    if (!existing.content.trim() && nextCell.content.trim()) {
      cellBySlot.set(key, nextCell)
    }
  }

  const cells = [...cellBySlot.values()]
  const cellIds = new Set(cells.map((cell) => cell.id))
  // Drop the edges that touched a cell this collapse dropped — and only
  // those. An edge whose other end was never on this board (a link to
  // another path) has nothing to do with the collapse and stays.
  const droppedIds = new Set(
    data.cells.map((cell) => cell.id).filter((id) => !cellIds.has(id)),
  )
  const dependencies = data.dependencies.filter(
    (dependency) =>
      !droppedIds.has(dependency.source_cell_id) &&
      !droppedIds.has(dependency.target_cell_id),
  )

  keptLanes.sort((a, b) => a.position - b.position)

  return { ...data, lanes: keptLanes, cells, dependencies }
}

export function sortBlueprintLanes(data: BlueprintData): BlueprintData {
  const lanes = [...data.lanes].sort(
    (a, b) => a.position - b.position,
  )
  const unchanged = lanes.every(
    (lane, index) => lane.id === data.lanes[index]?.id,
  )
  return unchanged ? data : { ...data, lanes }
}

export function normalizeBlueprint(raw: RawPath): BlueprintData {
  const lanes: BlueprintLane[] = [...(raw.lanes ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((lane) => ({
      id: lane.id,
      name: lane.name,
      role: lane.lane_role ?? lane.role ?? null,
      position: lane.position,
    }))
  const steps = resolveSteps(raw)
  const rawCells = raw.cells ?? []
  // The columns come through the cell field list — the same list the board
  // select was built from, so a column the query asks for is a column the
  // cell receives. The embedded relations have mappers of their own.
  const cells: BlueprintCell[] = rawCells.map((cell) => ({
    ...cellFieldsFromRow(cell),
    resources: cellResourcesFromRows(cell.resources),
    touchpoints: cellTouchpointsFromRows(cell.cell_touchpoints),
  }))
  const dependencies =
    raw.cell_dependencies && raw.cell_dependencies.length > 0
      ? raw.cell_dependencies.map((dependency) =>
          toBlueprintDependency(dependency, dependency.source_cell_id),
        )
      : flattenDependenciesFromCells(rawCells)

  const scenario = one(raw.scenarios)

  return sortBlueprintLanes({
    path: {
      id: raw.id,
      name: raw.name,
      summary: raw.summary ?? null,
      note: raw.note ?? null,
      kind: raw.kind,
      status: asEntityStatus(raw.status) ?? DEFAULT_ENTITY_STATUS,
      ...(raw.scenario_id ? { scenarioId: raw.scenario_id } : {}),
      ...(scenario
        ? {
            scenarioName: scenario.name,
            phaseName: one(scenario.phases)?.name ?? null,
          }
        : {}),
    },
    lanes,
    steps,
    cells,
    dependencies,
  })
}

/**
 * Cells by slot. A slot — one lane, one step — holds a *list*: tech lanes
 * carry one cell per touchpoint (`position` orders them), and the old
 * single-cell map silently dropped every sibling but the last, which is the
 * kind of data loss that never throws. Non-tech lanes still hold one.
 */
export function buildCellLookup(
  cells: BlueprintCell[],
): Map<string, BlueprintCell[]> {
  const map = new Map<string, BlueprintCell[]>()
  for (const cell of cells) {
    const key = `${cell.lane_id}:${cell.step_id}`
    const slot = map.get(key)
    if (slot) slot.push(cell)
    else map.set(key, [cell])
  }
  for (const slot of map.values()) {
    slot.sort(
      (left, right) => (left.position ?? 0) - (right.position ?? 0),
    )
  }
  return map
}

/** Every cell in the slot, in `position` order. */
export function getCellsAt(
  lookup: Map<string, BlueprintCell[]>,
  laneId: string,
  stepId: string,
): BlueprintCell[] {
  return lookup.get(`${laneId}:${stepId}`) ?? []
}

/**
 * The slot's first cell — the right question for non-tech lanes, which hold
 * at most one, and for anything that needs "the" cell of a slot (arrows,
 * upserts, walkthroughs target slot position 0).
 */
export function getCellAt(
  lookup: Map<string, BlueprintCell[]>,
  laneId: string,
  stepId: string,
): BlueprintCell | undefined {
  return lookup.get(`${laneId}:${stepId}`)?.[0]
}
