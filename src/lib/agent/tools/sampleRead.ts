import { SAMPLE_NAV } from '@/data/sampleNav'
import {
  getBlueprintFallback,
  getFallbackPathsForScenario,
  type OfflineBoard,
} from '@/data/blueprintFallbacks'
import { FALLBACK_SLICES, FALLBACK_SLICE_ITEMS } from '@/data/sliceFallbacks'
import {
  formatBlueprintList,
  formatBlueprints,
  formatCellDependencies,
  formatCompareDiff,
  formatFields,
  formatLaneVocabulary,
  formatOwnerTags,
  formatResources,
  formatSliceDetail,
  formatSliceList,
  listBlueprintRequest,
  type BlueprintListOptions,
  type JourneyTree,
} from '@/lib/agent/tools/format'
import { cellResources } from '@/lib/cellResources'
import type { BlueprintData } from '@/types/blueprint'

/**
 * Read tools answered from the BUNDLED SAMPLE, with no database anywhere.
 *
 * Two consumers, one implementation:
 *
 * 1. The no-database agent trial — a developer who cloned the template, has no
 *    Supabase project, and pastes a provider key. The canvas already renders
 *    the sample blueprint from these same fallback modules; the agent now
 *    reads the same content instead of being unavailable.
 * 2. The eval harness (`scripts/agent-harness`), which runs keyless against
 *    the fixture and used to carry its own hand-copied formatters.
 *
 * Read-only by construction: there is nothing here that writes, so the trial
 * cannot pretend to author. The trial's roster is the definitions whose
 * availability says `sample`, so a write tool is absent rather than refused.
 */

function sampleBlueprintsFor(
  board: OfflineBoard,
  scenarioId: string,
): BlueprintData[] {
  const paths = getFallbackPathsForScenario(board, scenarioId)
  if (paths.length > 0) {
    return paths
      .map((path) =>
        getBlueprintFallback(board, scenarioId, path.id, path.kind),
      )
      .filter((blueprint): blueprint is BlueprintData => Boolean(blueprint))
  }
  const single = getBlueprintFallback(board, scenarioId)
  return single ? [single] : []
}

/** Every sample blueprint, in nav order — the trial's whole universe. */
function allSampleBlueprints(board: OfflineBoard): BlueprintData[] {
  return SAMPLE_NAV.filter((item) => item.parentId).flatMap((scenario) =>
    sampleBlueprintsFor(board, scenario.id),
  )
}

type Rows<K extends keyof JourneyTree> = Array<JourneyTree[K][number]>

/**
 * The bundled sample as a journey tree — the shape `list_blueprint`'s database
 * read builds from its tables, built here from the fallbacks the canvas
 * renders. A step is merged by id across its scenario's paths, because it is
 * one column of the scenario that each path places at its own position.
 */
function sampleJourneyTree(board: OfflineBoard): JourneyTree {
  const phases: Rows<'phases'> = []
  const scenarios: Rows<'scenarios'> = []
  const paths: Rows<'paths'> = []
  const steps = new Map<
    string,
    { id: string; scenarioId: string; name: string; summary?: string | null; placements: Array<{ pathId: string; position: number }> }
  >()
  const lanes: Rows<'lanes'> = []
  const cells: Rows<'cells'> = []
  for (const item of SAMPLE_NAV) {
    if (!item.parentId) {
      phases.push({ id: item.id, name: item.label, summary: item.summary, position: item.index })
      continue
    }
    scenarios.push({
      id: item.id,
      phaseId: item.parentId,
      name: item.label,
      summary: item.summary,
      position: item.index,
    })
    for (const blueprint of sampleBlueprintsFor(board, item.id)) {
      const { path } = blueprint
      paths.push({ id: path.id, scenarioId: item.id, name: path.name, summary: path.summary, kind: path.kind })
      for (const step of blueprint.steps) {
        const placed = steps.get(step.id) ?? {
          id: step.id,
          scenarioId: item.id,
          name: step.name,
          summary: step.summary,
          placements: [],
        }
        placed.placements.push({ pathId: path.id, position: step.position })
        steps.set(step.id, placed)
      }
      for (const lane of blueprint.lanes)
        lanes.push({ id: lane.id, pathId: path.id, name: lane.name, role: lane.role ?? null, position: lane.position })
      for (const cell of blueprint.cells)
        cells.push({
          id: cell.id,
          laneId: cell.lane_id,
          stepId: cell.step_id,
          content: cell.content,
          summary: cell.summary,
          position: cell.position,
        })
    }
  }
  return { phases, scenarios, paths, steps: [...steps.values()], lanes, cells }
}

/**
 * `list_blueprint` with no database: the same check, the same walk and the
 * same text as the live read, over the bundled sample. The sample is one
 * service, so there is no scope to apply — exactly as a single-service
 * deployment ignores the argument.
 */
export function sampleListBlueprint(
  board: OfflineBoard,
  options: BlueprintListOptions,
): string {
  return formatBlueprintList(
    sampleJourneyTree(board),
    listBlueprintRequest(options),
  )
}

export function sampleGetBlueprint(
  board: OfflineBoard,
  scenarioId: string,
): string {
  const blueprints = sampleBlueprintsFor(board, scenarioId)
  if (blueprints.length === 0) return 'No paths in this scenario.'
  return formatBlueprints(blueprints)
}

export function sampleGetCompareDiff(
  board: OfflineBoard,
  scenarioId: string,
  pathIds?: string[],
): string {
  return formatCompareDiff(sampleBlueprintsFor(board, scenarioId), pathIds)
}

/**
 * The same field roster `read.ts` selects from `cells` — the sample content
 * carries the cell spec (owner, perceived owner, function, form, value
 * props) and the cell's resources, so the keyless answer is the DB answer
 * minus the database.
 */
export function sampleGetCell(board: OfflineBoard, cellId: string): string {
  for (const blueprint of allSampleBlueprints(board)) {
    const cell = blueprint.cells.find((entry) => entry.id === cellId)
    if (!cell) continue
    return formatFields([
      ['content', cell.content],
      ['summary', cell.summary],
      ['owner', cell.owner],
      ['perceived_owner', cell.perceived_owner],
      ['function', cell.function],
      ['form', cell.form],
      ['value_props', cell.value_props?.length ? JSON.stringify(cell.value_props) : null],
      ['resources', formatResources(cellResources(cell))],
      ['lane_id', cell.lane_id],
      ['step_id', cell.step_id],
      ['position', cell.position],
    ])
  }
  return `No cell with id ${cellId}.`
}

export function sampleListSlices(): string {
  return formatSliceList(FALLBACK_SLICES)
}

export function sampleGetSlice(sliceId: string): string {
  const slice = FALLBACK_SLICES.find((entry) => entry.id === sliceId)
  if (!slice) throw new Error(`No slice with id ${sliceId}.`)
  return formatSliceDetail(slice, FALLBACK_SLICE_ITEMS[sliceId] ?? [])
}

/**
 * The lane vocabulary the sample board uses, counted the way `listLanes`
 * counts it from the database: every lane on every sample path, grouped by
 * (label, role). A sample lane appears once per path it is on, exactly as a
 * row does.
 */
export function sampleListLanes(board: OfflineBoard): string {
  return formatLaneVocabulary(
    allSampleBlueprints(board).flatMap((blueprint) =>
      blueprint.lanes.map((lane) => ({
        name: lane.name,
        lane_role: lane.role ?? null,
      })),
    ),
  )
}

/**
 * The sample board's arrows. Same text as the live read, and the same
 * source-first direction — these are the edges the sample canvas draws.
 */
export function sampleListCellDependencies(
  board: OfflineBoard,
  cellId?: string,
): string {
  const edges = allSampleBlueprints(board).flatMap(
    (blueprint) => blueprint.dependencies,
  )
  const scoped = cellId
    ? edges.filter(
        (edge) =>
          edge.source_cell_id === cellId || edge.target_cell_id === cellId,
      )
    : edges
  return formatCellDependencies(scoped, cellId)
}

/**
 * The tag vocabulary the sample content actually uses, gathered the way
 * `listOwnerTags` gathers it from the database: every cell's `owner` and
 * `perceived_owner`, deduped and sorted. A sample with no tags produces the
 * same sentence a live-but-untagged database produces.
 */
export function sampleListOwnerTags(board: OfflineBoard): string {
  return formatOwnerTags(
    allSampleBlueprints(board).flatMap((blueprint) => blueprint.cells),
  )
}
