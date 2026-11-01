import { buildBlueprintCellSelection, getTouchpointNames } from '@/lib/blueprintCellSelection'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { shouldUseTouchpointCellContent } from '@/lib/blueprintLayout'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
import type {
  BlueprintCell,
  BlueprintCellDependency,
  BlueprintData,
  BlueprintRemoteCell,
} from '@/types/blueprint'
import { cellResources } from '@/lib/cellResources'
import { cellTouchpoints } from '@/lib/cellTouchpoints'
import {
  crossPathPlaceLabel,
  crossPathPlaceName,
  placeDetail,
} from '@/lib/crossPathLinks'

export type BlueprintCellConnectionKind = 'interaction' | 'connection'

export type BlueprintCellConnection = {
  dependencyId: string
  cellId: string
  laneName: string
  laneRowPosition: number
  stepName: string
  stepIndex: number
  kind: BlueprintCellConnectionKind
  /** From the dependency row: `leads_to` (makes the next thing happen) vs
   *  `enables` (must already be true, causes nothing). */
  linkKind: 'leads_to' | 'enables'
  /**
   * Why the edge exists — `cell_dependencies.note`. Shown on the dependency
   * row's tooltip, and the only prose this mapping carries.
   *
   * `cell_dependencies.name` is deliberately absent. It was specified as the
   * word on the arrow — a badge carrying a channel name like "Email" — and
   * was never used that way: what authors put in it were sentences saying why
   * the edge exists, which is what this is. Nothing draws it and the panel's
   * connection editor no longer writes it, so carrying it here would only
   * offer the next reader a second field saying the same thing.
   */
  linkNote: string | null
  isTech: boolean
  techItems: string[]
  contentPreview: string
  /**
   * Set when the other end is on ANOTHER path: where it is, so the row can
   * name it and go there — the same `reached in` the impact tracer reports.
   * Absent for an end on this board. `stepIndex` is -1 for such an end — its
   * column is a fact about a board this one did not read — and `stepName`
   * carries the step instead.
   */
  reachedIn?: ConnectionReachedIn
}

/**
 * Where a connection's other end sits when it is not on this board: the far
 * cell's own place fields, and the three ways the panel says them, each
 * decided once here.
 */
export type ConnectionReachedIn = Pick<
  BlueprintRemoteCell,
  'pathId' | 'pathName' | 'scenarioId' | 'scenarioName' | 'phaseName'
> & {
  /** The path's name when it is this scenario's, else the scenario's. */
  placeName: string
  /** The path alone when it is this scenario's, else "Scenario › Path". */
  placeLabel: string
  /** Path · scenario · phase. */
  placeDetail: string
}

export type BlueprintCellConnections = {
  incoming: BlueprintCellConnection[]
  outgoing: BlueprintCellConnection[]
}

function findCell(blueprint: BlueprintData, cellId: string): BlueprintCell | undefined {
  const resolvedId = resolveBlueprintCellId(cellId)
  return blueprint.cells.find((cell) => cell.id === resolvedId)
}

function resolveLane(blueprint: BlueprintData, laneId: string) {
  return blueprint.lanes.find((lane) => lane.id === laneId)
}

function resolveStepName(blueprint: BlueprintData, stepId: string): string {
  return blueprint.steps.find((step) => step.id === stepId)?.name ?? 'Unknown step'
}

function contentPreview(content: string): string {
  const firstLine = content.trim().split('\n')[0]?.trim() ?? ''
  if (firstLine.length <= 72) return firstLine
  return `${firstLine.slice(0, 69)}…`
}

function resolveStepIndex(blueprint: BlueprintData, stepId: string): number {
  return blueprint.steps.findIndex((step) => step.id === stepId)
}

/**
 * A connection whose other end is on another path, read from the far end the
 * board query embedded. Never an interaction: that word means the same step
 * of the same board.
 */
function toRemoteConnection(
  blueprint: BlueprintData,
  dependency: BlueprintCellDependency,
  remote: BlueprintRemoteCell,
): BlueprintCellConnection {
  return {
    dependencyId: dependency.id,
    cellId: remote.id,
    laneName: remote.laneName ?? 'Unknown lane',
    laneRowPosition: -1,
    stepName: remote.stepName ?? 'Unknown step',
    stepIndex: -1,
    kind: 'connection',
    linkKind: dependency.kind === 'enables' ? 'enables' : 'leads_to',
    linkNote: dependency.note ?? null,
    isTech: false,
    techItems: [],
    contentPreview: contentPreview(remote.content),
    reachedIn: {
      pathId: remote.pathId,
      pathName: remote.pathName,
      scenarioId: remote.scenarioId,
      scenarioName: remote.scenarioName,
      phaseName: remote.phaseName,
      placeName: crossPathPlaceName(blueprint, remote),
      placeLabel: crossPathPlaceLabel(blueprint.path, remote),
      placeDetail: placeDetail(remote),
    },
  }
}

function toConnection(
  blueprint: BlueprintData,
  dependency: BlueprintCellDependency,
  cellId: string,
  selectedStepIndex: number,
): BlueprintCellConnection | null {
  const cell = findCell(blueprint, cellId)
  if (!cell) {
    const remote = blueprint.remoteCells?.find((entry) => entry.id === cellId)
    return remote ? toRemoteConnection(blueprint, dependency, remote) : null
  }

  const stepIndex = resolveStepIndex(blueprint, cell.step_id)
  if (stepIndex < 0) return null

  const lane = resolveLane(blueprint, cell.lane_id)
  const laneName = lane?.name ?? 'Unknown lane'
  const laneRowPosition = lane?.position ?? -1
  const isTech = lane ? shouldUseTouchpointCellContent(lane) : false
  const techItems = isTech ? getTouchpointNames(cell) : []

  return {
    dependencyId: dependency.id,
    cellId,
    laneName,
    laneRowPosition,
    stepName: resolveStepName(blueprint, cell.step_id),
    stepIndex,
    kind: stepIndex === selectedStepIndex ? 'interaction' : 'connection',
    linkKind: dependency.kind === 'enables' ? 'enables' : 'leads_to',
    linkNote: dependency.note ?? null,
    isTech,
    techItems,
    contentPreview: contentPreview(cell.content),
  }
}

export function getBlueprintForPath(
  blueprints: BlueprintData[],
  pathId: string,
): BlueprintData | undefined {
  return blueprints.find((blueprint) => blueprint.path.id === pathId)
}

export function getBlueprintCellConnections(
  blueprint: BlueprintData,
  cellId: string,
): BlueprintCellConnections {
  const resolvedCellId = resolveBlueprintCellId(cellId)
  const selectedCell = findCell(blueprint, resolvedCellId)
  const selectedStepIndex =
    selectedCell !== undefined
      ? resolveStepIndex(blueprint, selectedCell.step_id)
      : -1

  const incoming: BlueprintCellConnection[] = []
  const outgoing: BlueprintCellConnection[] = []

  for (const dependency of blueprint.dependencies) {
    if (dependency.target_cell_id === resolvedCellId) {
      const connection = toConnection(
        blueprint,
        dependency,
        dependency.source_cell_id,
        selectedStepIndex,
      )
      if (connection) incoming.push(connection)
    }
    if (dependency.source_cell_id === resolvedCellId) {
      const connection = toConnection(
        blueprint,
        dependency,
        dependency.target_cell_id,
        selectedStepIndex,
      )
      if (connection) outgoing.push(connection)
    }
  }

  return { incoming, outgoing }
}

export type LinkedTechEntry = {
  id: string
  cellId: string
  item: string
}

export function getLinkedTechFromConnections(
  connections: BlueprintCellConnections,
): LinkedTechEntry[] {
  const entries: LinkedTechEntry[] = []
  const seen = new Set<string>()

  for (const connection of [
    ...connections.incoming,
    ...connections.outgoing,
  ]) {
    if (!connection.isTech) continue

    for (const item of connection.techItems) {
      const id = `${connection.cellId}:${item}`
      if (seen.has(id)) continue
      seen.add(id)
      entries.push({ id, cellId: connection.cellId, item })
    }
  }

  return entries
}

export function getFlowConnections(
  connections: BlueprintCellConnections,
): BlueprintCellConnections {
  return {
    incoming: connections.incoming.filter((connection) => !connection.isTech),
    outgoing: connections.outgoing.filter((connection) => !connection.isTech),
  }
}

export type FlowConnectionDirection = 'prev' | 'next' | 'both'

export type DirectedFlowConnection = BlueprintCellConnection & {
  direction: FlowConnectionDirection
}

function dedupeByCellId(items: BlueprintCellConnection[]): BlueprintCellConnection[] {
  const seen = new Map<string, BlueprintCellConnection>()
  for (const item of items) {
    if (!seen.has(item.cellId)) {
      seen.set(item.cellId, item)
    }
  }
  return [...seen.values()]
}

export function getDirectedConnections(
  incoming: BlueprintCellConnection[],
  outgoing: BlueprintCellConnection[],
): DirectedFlowConnection[] {
  const byCellId = new Map<
    string,
    { connection: BlueprintCellConnection; prev: boolean; next: boolean }
  >()

  for (const item of incoming) {
    if (item.kind !== 'connection') continue
    const existing = byCellId.get(item.cellId)
    if (existing) {
      existing.prev = true
    } else {
      byCellId.set(item.cellId, { connection: item, prev: true, next: false })
    }
  }

  for (const item of outgoing) {
    if (item.kind !== 'connection') continue
    const existing = byCellId.get(item.cellId)
    if (existing) {
      existing.next = true
    } else {
      byCellId.set(item.cellId, { connection: item, prev: false, next: true })
    }
  }

  return [...byCellId.values()].map(({ connection, prev, next }) => ({
    ...connection,
    direction: prev && next ? 'both' : prev ? 'prev' : 'next',
  }))
}

export type FlowInteractionDirection = 'up' | 'down'

export type DirectedFlowInteraction = BlueprintCellConnection & {
  direction: FlowInteractionDirection
}

export function getSelectedCellLaneRowPosition(
  blueprint: BlueprintData,
  cellId: string,
): number {
  const cell = findCell(blueprint, cellId)
  if (!cell) return -1
  return resolveLane(blueprint, cell.lane_id)?.position ?? -1
}

function interactionDirectionFromRows(
  linkedRowPosition: number,
  selectedRowPosition: number,
): 'up' | 'down' {
  if (linkedRowPosition < selectedRowPosition) return 'up'
  return 'down'
}

export function getDirectedInteractions(
  incoming: BlueprintCellConnection[],
  outgoing: BlueprintCellConnection[],
  selectedLaneRowPosition: number,
): DirectedFlowInteraction[] {
  const byCellId = new Map<string, BlueprintCellConnection>()

  for (const item of [...incoming, ...outgoing]) {
    if (item.kind !== 'interaction') continue
    if (!byCellId.has(item.cellId)) {
      byCellId.set(item.cellId, item)
    }
  }

  return [...byCellId.values()].map((connection) => ({
    ...connection,
    direction: interactionDirectionFromRows(
      connection.laneRowPosition,
      selectedLaneRowPosition,
    ),
  }))
}

export function getUniqueInteractions(
  incoming: BlueprintCellConnection[],
  outgoing: BlueprintCellConnection[],
): BlueprintCellConnection[] {
  return dedupeByCellId([
    ...incoming.filter((item) => item.kind === 'interaction'),
    ...outgoing.filter((item) => item.kind === 'interaction'),
  ])
}

export function buildBlueprintCellSelectionForId(
  blueprint: BlueprintData,
  cellId: string,
  scenarioName: string,
  phaseName?: string,
): BlueprintCellSelection | null {
  const cell = findCell(blueprint, cellId)
  if (!cell) return null

  const lane = blueprint.lanes.find((entry) => entry.id === cell.lane_id)
  const stepIndex = blueprint.steps.findIndex((entry) => entry.id === cell.step_id)
  const step = blueprint.steps[stepIndex]
  if (!lane || !step || stepIndex < 0) return null

  return buildBlueprintCellSelection({
    scenarioName,
    phaseName,
    laneName: lane.name,
    stepId: step.id,
    stepName: step.name,
    stepIndex,
    cellId: cell.id,
    cellContent: cell.content,
    cellFrame: cell.frame,
    cellSummary: cell.summary,
    cellTouchpoints: cellTouchpoints(cell),
    cellResources: cellResources(cell),
    pathId: blueprint.path.id,
    pathName: blueprint.path.name,
    pathSummary: blueprint.path.summary,
    pathKind: blueprint.path.kind,
  })
}

export function scrollBlueprintCellIntoView(cellId: string): void {
  const element = document.querySelector<HTMLElement>(
    `[data-blueprint-cell="${CSS.escape(cellId)}"]`,
  )
  if (!element) return
  // Inside the zoom/pan camera, "scroll" is a lie — a finding of the
  // mobile-shell correctness review: the viewport is overflow-hidden and
  // moves by transform, but a programmatic scrollIntoView still sets
  // scrollTop on the hidden-overflow box — which every camera calculation
  // assumes is zero, so the board afterwards zooms toward a point offset
  // from the fingers. Cells on a canvas are brought into view by the camera
  // (the focus-cells pipeline); this helper only scrolls surfaces that
  // genuinely scroll.
  if (element.closest('[data-zoom-pan-viewport]')) return
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}
