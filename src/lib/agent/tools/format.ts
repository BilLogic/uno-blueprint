import {
  countCompareDifferences,
  deriveCompareStepGroups,
  deriveCompareZones,
  getDetailOnlyCompareSlots,
  isDetailOnlyCompareSlot,
} from '@/lib/compareLedger'
import {
  buildCompareModel,
  type CompareBlueprints,
  type CompareSlot,
} from '@/lib/compareSlots'
import type { BlueprintData, CellResource } from '@/types/blueprint'
import { rankFindings, ratingLabel } from '@/lib/findingPriority'
import { CANONICAL_LANE_ROLES } from '@/lib/laneRoles'
import { PATH_KINDS } from '@/lib/versionValidation'

/**
 * The read tools' TEXT SHAPE, with no data source attached.
 *
 * Read tools answer from PostgREST when a database is configured and from
 * the bundled sample fixture when one is not (the no-database agent trial,
 * and the eval harness running keyless). Those are two sources for one
 * answer — so the rendering lives here, once, and both callers pass their
 * rows through it. Before this module the harness kept a hand-copied set of
 * fixture formatters that drifted from `read.ts` line by line.
 *
 * Compact text, not JSON dumps: the model reads a grid the way a person
 * skims one, with ids in parentheses so every later write names its target
 * precisely.
 */

/**
 * The rungs of the journey walk, top down — the levels `list_blueprint` can
 * enumerate. A step is a column of its scenario that each of its paths places;
 * a lane and a cell belong to one path.
 */
export const GRANULARITY_LEVELS = [
  'phase',
  'scenario',
  'path',
  'step',
  'lane',
  'cell',
] as const

export type GranularityLevel = (typeof GRANULARITY_LEVELS)[number]

/** Rows a list returns when the caller names no limit, and the most it may name. */
const DEFAULT_LIST_LIMIT = 200
const MAX_LIST_LIMIT = 500

/**
 * The journey as either source holds it: one array per rung, each row naming
 * its parent by id. Order inside an array does not matter — the walk sorts —
 * so the PostgREST read and the bundled sample hand over what they have.
 */
export type JourneyTree = {
  phases: ReadonlyArray<{
    id: string
    name: string
    summary?: string | null
    position: number
    serviceId?: string | null
  }>
  scenarios: ReadonlyArray<{
    id: string
    phaseId: string
    name: string
    summary?: string | null
    position: number
  }>
  paths: ReadonlyArray<{
    id: string
    scenarioId: string
    name: string
    summary?: string | null
    kind: string
  }>
  steps: ReadonlyArray<{
    id: string
    scenarioId: string
    name: string
    placements: ReadonlyArray<{ pathId: string; position: number }>
  }>
  lanes: ReadonlyArray<{
    id: string
    pathId: string
    name: string
    role?: string | null
    position: number
  }>
  cells: ReadonlyArray<{
    id: string
    laneId: string
    stepId: string
    content: string
    summary?: string | null
    position?: number | null
  }>
}

/** A `list_blueprint` call, in the words its tool arguments carry. */
export type BlueprintListOptions = {
  granularity: readonly string[]
  phase?: string
  scenario?: string
  pathKind?: string
  laneRole?: string
  limit?: number
}

/** The same call, checked against its vocabularies, with the limit settled. */
export type BlueprintListRequest = {
  levels: ReadonlySet<GranularityLevel>
  phase?: string
  scenario?: string
  pathKind?: string
  laneRole?: string
  limit: number
}

const isOneOf = (vocabulary: readonly string[], word: string) =>
  vocabulary.includes(word)

/**
 * Check a `list_blueprint` call before anything is read.
 *
 * Every word it takes that is not a name has a closed vocabulary — six rungs,
 * three path kinds, eight lane roles — so a word outside one is refused with
 * the list rather than read as a filter that matches nothing. An empty answer
 * to a misspelled filter looks exactly like an empty blueprint, and "there are
 * none" is the one sentence a `list_` read may not get wrong.
 */
export function listBlueprintRequest(
  options: BlueprintListOptions,
): BlueprintListRequest {
  const levels = GRANULARITY_LEVELS.join(', ')
  if (options.granularity.length === 0)
    throw new Error(`granularity is required — one or more of ${levels}.`)
  const unknown = options.granularity.filter(
    (level) => !isOneOf(GRANULARITY_LEVELS, level),
  )
  if (unknown.length > 0)
    throw new Error(
      `Unknown granularity: ${unknown.join(', ')}. Use one or more of ${levels}.`,
    )
  const pathKind = options.pathKind?.trim() || undefined
  if (pathKind && !isOneOf(PATH_KINDS, pathKind))
    throw new Error(`Unknown kind "${pathKind}". Use one of ${PATH_KINDS.join(', ')}.`)
  const laneRole = options.laneRole?.trim() || undefined
  if (laneRole && !isOneOf(CANONICAL_LANE_ROLES, laneRole))
    throw new Error(
      `Unknown lane_role "${laneRole}". Use one of ${CANONICAL_LANE_ROLES.join(', ')}.`,
    )
  const asked =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : DEFAULT_LIST_LIMIT
  return {
    levels: new Set(options.granularity as GranularityLevel[]),
    phase: options.phase?.trim().toLowerCase() || undefined,
    scenario: options.scenario?.trim().toLowerCase() || undefined,
    pathKind,
    laneRole,
    limit: Math.min(Math.max(asked, 1), MAX_LIST_LIMIT),
  }
}

/**
 * One row of the list: a thing at one rung, and the rungs above it. `detail`
 * is the text after the dash — a summary for most rungs, a lane's role — and
 * is no column's name, so it is not spelled like one.
 */
type ListRow = {
  kind: GranularityLevel
  id: string
  name: string
  detail?: string | null
  phase: string
  scenario?: string
  path?: string
  step?: string
  lane?: string
}

function groupBy<T>(rows: ReadonlyArray<T>, key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row))
    if (group) group.push(row)
    else groups.set(key(row), [row])
  }
  return groups
}

const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

const byPosition = (
  a: { position: number; name: string; id: string },
  b: { position: number; name: string; id: string },
) => a.position - b.position || byName(a, b)

/**
 * A scenario's steps, each listed ONCE under the first path that places it.
 *
 * A step is a column of its scenario, and the paths that share it each place
 * it at their own position — so the walk goes path by path, in path order, and
 * a step already listed is not listed again. A step no path places is still a
 * column of the scenario and comes last, unless a kind filter asked for the
 * steps of paths of that kind, which it is on none of.
 */
function stepRows(
  steps: JourneyTree['steps'],
  paths: JourneyTree['paths'],
  above: { phase: string; scenario: string },
  kindFiltered: boolean,
): ListRow[] {
  const rows: ListRow[] = []
  const listed = new Set<string>()
  for (const path of paths) {
    const placed = steps
      .flatMap((step) =>
        step.placements
          .filter((placement) => placement.pathId === path.id)
          .map((placement) => ({ step, position: placement.position })),
      )
      .sort((a, b) => a.position - b.position || byName(a.step, b.step))
    for (const { step } of placed) {
      if (listed.has(step.id)) continue
      listed.add(step.id)
      rows.push({ kind: 'step', id: step.id, name: step.name, ...above, path: path.name, step: step.name })
    }
  }
  if (!kindFiltered) {
    for (const step of steps.filter((entry) => !listed.has(entry.id)).sort(byName))
      rows.push({ kind: 'step', id: step.id, name: step.name, ...above, step: step.name })
  }
  return rows
}

/**
 * The walk: phases in journey order, each one's scenarios, each scenario's
 * steps and then its paths by name, each path's lanes top to bottom, and each
 * lane's cells in step order — the order a person reads the board in.
 *
 * A filter narrows its own rung and everything below it. A filter set BELOW a
 * rung drops that rung's rows: a scenario filter drops phases, a kind filter
 * drops phases and scenarios, and a lane-role filter keeps only lanes and
 * cells. A phase row cannot say which of its paths is an exception, so listing
 * it under that filter would claim something the row does not show.
 */
function walkJourney(tree: JourneyTree, request: BlueprintListRequest): ListRow[] {
  const { levels, pathKind, laneRole } = request
  const scenariosOf = groupBy(tree.scenarios, (scenario) => scenario.phaseId)
  const pathsOf = groupBy(tree.paths, (path) => path.scenarioId)
  const stepsOf = groupBy(tree.steps, (step) => step.scenarioId)
  const lanesOf = groupBy(tree.lanes, (lane) => lane.pathId)
  const cellsOf = groupBy(tree.cells, (cell) => cell.laneId)
  const stepNames = new Map(tree.steps.map((step) => [step.id, step.name]))

  const rows: ListRow[] = []
  const phases = [...tree.phases].sort(
    (a, b) => (a.serviceId ?? '').localeCompare(b.serviceId ?? '') || byPosition(a, b),
  )
  for (const phase of phases) {
    if (request.phase && phase.name.toLowerCase() !== request.phase) continue
    if (levels.has('phase') && !request.scenario && !pathKind && !laneRole)
      rows.push({ kind: 'phase', id: phase.id, name: phase.name, detail: phase.summary, phase: phase.name })

    for (const scenario of [...(scenariosOf.get(phase.id) ?? [])].sort(byPosition)) {
      if (request.scenario && scenario.name.toLowerCase() !== request.scenario) continue
      const above = { phase: phase.name, scenario: scenario.name }
      if (levels.has('scenario') && !pathKind && !laneRole)
        rows.push({ kind: 'scenario', id: scenario.id, name: scenario.name, detail: scenario.summary, ...above })

      const paths = (pathsOf.get(scenario.id) ?? [])
        .filter((path) => !pathKind || path.kind === pathKind)
        .sort(byName)
      const steps = stepsOf.get(scenario.id) ?? []
      if (levels.has('step') && !laneRole)
        rows.push(...stepRows(steps, paths, above, Boolean(pathKind)))

      for (const path of paths) {
        const onPath = { ...above, path: path.name }
        if (levels.has('path') && !laneRole)
          rows.push({ kind: 'path', id: path.id, name: path.name, detail: path.summary, ...onPath })
        if (!levels.has('lane') && !levels.has('cell')) continue

        const columns = new Map<string, number>()
        for (const step of steps)
          for (const placement of step.placements)
            if (placement.pathId === path.id) columns.set(step.id, placement.position)
        const column = (stepId: string) => columns.get(stepId) ?? Number.MAX_SAFE_INTEGER

        for (const lane of [...(lanesOf.get(path.id) ?? [])].sort(byPosition)) {
          if (laneRole && lane.role !== laneRole) continue
          if (levels.has('lane'))
            rows.push({ kind: 'lane', id: lane.id, name: lane.name, detail: lane.role, ...onPath, lane: lane.name })
          if (!levels.has('cell')) continue
          const cells = [...(cellsOf.get(lane.id) ?? [])].sort(
            (a, b) =>
              column(a.stepId) - column(b.stepId) ||
              (a.position ?? 0) - (b.position ?? 0) ||
              a.id.localeCompare(b.id),
          )
          for (const cell of cells)
            rows.push({
              kind: 'cell',
              id: cell.id,
              name: cell.content,
              detail: cell.summary,
              ...onPath,
              step: stepNames.get(cell.stepId),
              lane: lane.name,
            })
        }
      }
    }
  }
  return rows
}

/**
 * One row as a line. The rungs above it ride along as a breadcrumb, so a row
 * says where it is without a second read; a cell is named by the first line of
 * its text, and the id closes the line for the write that follows.
 */
function listLine(row: ListRow): string {
  const where = [row.phase, row.scenario, row.path, row.step, row.lane]
    .filter(Boolean)
    .join(' › ')
  const name = row.kind === 'cell' ? row.name.split('\n')[0] : row.name
  const detail = row.detail ? ` — ${row.detail}` : ''
  return `[${row.kind}] "${name}" · ${where}${detail} (${row.id})`
}

/**
 * `list_blueprint`'s answer: the walk, clipped at the caller's limit, under a
 * header that carries the TRUE total — the number that lets a model say "all
 * N" honestly, and that says so when the list it is holding is not all of it.
 */
export function formatBlueprintList(
  tree: JourneyTree,
  request: BlueprintListRequest,
): string {
  const rows = walkJourney(tree, request)
  if (rows.length === 0) return 'Nothing at that granularity within those filters.'
  const shown = rows.slice(0, request.limit)
  const header =
    shown.length < rows.length
      ? `${shown.length} of ${rows.length} (clipped — raise limit or narrow the filters):`
      : `${rows.length} of ${rows.length}:`
  return [header, ...shown.map(listLine)].join('\n')
}

type DependencyEdge = {
  id: string
  source_cell_id: string
  target_cell_id: string
  kind?: string | null
  name?: string | null
}

/**
 * One dependency edge, source-first — the direction both kinds read in
 * (`A leads_to B`, `A enables B`), so the arrow in the text points the way
 * the arrow on the canvas does. The grid read and the edge list print an edge
 * the same way, so an id read in one is found in the other.
 */
function dependencyLine(edge: DependencyEdge): string {
  const name = edge.name ? ` "${edge.name}"` : ''
  return `${edge.source_cell_id} --${edge.kind ?? 'leads_to'}--> ${edge.target_cell_id}${name} (${edge.id})`
}

/**
 * One section per path: header, step row, lane-by-lane cell lines, then the
 * path's dependency edges.
 *
 * The edges are part of the grid because the board query already joins them
 * and the canvas already draws them. Leaving them out made the grid read the
 * one place an agent could not see an arrow it had just written.
 */
export function formatBlueprints(blueprints: readonly BlueprintData[]): string {
  const sections: string[] = []
  for (const { path, steps, lanes, cells, dependencies } of blueprints) {
    const lines: string[] = [
      `Path "${path.name}" (${path.id}, type ${path.kind})`,
      `Steps: ${steps
        .map((step) => `${step.position}. "${step.name}" (${step.id})`)
        .join(' | ')}`,
    ]
    for (const lane of lanes) {
      lines.push(
        `Lane "${lane.name}" (${lane.id}${lane.role ? `, role ${lane.role}` : ''}):`,
      )
      const byStep = new Map<string, typeof cells>()
      for (const cell of cells) {
        if (cell.lane_id !== lane.id) continue
        const list = byStep.get(cell.step_id) ?? []
        list.push(cell)
        byStep.set(cell.step_id, list)
      }
      for (const step of steps) {
        for (const cell of byStep.get(step.id) ?? []) {
          lines.push(
            `  [step ${step.position}] "${cell.content}" (${cell.id})`,
          )
        }
      }
    }
    if (dependencies.length > 0) {
      lines.push(`Edges (${dependencies.length}):`)
      for (const edge of dependencies) lines.push(`  ${dependencyLine(edge)}`)
    }
    sections.push(lines.join('\n'))
  }
  return sections.join('\n\n')
}

/**
 * The business model as the agent reads it: the filled fields, or the reason
 * there are none. Here rather than beside the query because the eval harness
 * reads the same row over REST and must answer in these words — a second copy
 * of "no business model recorded" is a sentence the app can reword while the
 * harness goes on saying the old one.
 */
export function formatBusinessModel(
  row: {
    pricing?: string | null
    funding?: string | null
    partners?: string | null
    revenue_model?: string | null
    delivery_cost?: string | null
  } | null,
): string {
  if (!row) return 'No business model recorded for this service yet.'
  const filled = formatFields([
    ['pricing', row.pricing],
    ['revenue_model', row.revenue_model],
    ['funding', row.funding],
    ['partners', row.partners],
    ['delivery_cost', row.delivery_cost],
  ])
  return filled || 'The business model row exists but is empty.'
}

/**
 * One audit finding as a line — id, severity and ratings, check, provenance,
 * cell count. A finding recorded before impact and effort existed says
 * `unrated` where the ratings go, rather than leaving a reader to guess.
 */
function findingLine(row: FindingRow): string {
  const summary = row.summary ? ` — ${row.summary}` : ''
  return `${row.id} [${row.severity} · ${ratingLabel(row)}] ${row.check_key} (${row.source}, ${row.status}, ${row.created_at.slice(0, 10)}) cells:${(row.cell_ids ?? []).length}${summary}`
}

export type FindingRow = {
  id: string
  source: string
  check_key: string
  severity: string
  impact?: string | null
  effort?: string | null
  summary?: string | null
  status: string
  cell_ids?: string[] | null
  created_at: string
}

/**
 * The findings list, and the three ways it can be empty — for the whole
 * board, for one status, and for one cell. Shared with the harness's REST
 * read for the reason `formatBusinessModel` is.
 *
 * Grouped in the audit report's priority order — Do first, Plan, Quick wins,
 * Later — so the order a team should fix things in is the order it reads
 * them in. A group with nothing in it is left out rather than printed empty.
 */
export function formatFindingsList(
  rows: ReadonlyArray<FindingRow>,
  { filter, forCell }: { filter: string; forCell?: string },
): string {
  if (rows.length === 0) {
    if (forCell) return `No ${filter === 'all' ? '' : `${filter} `}findings touch cell ${forCell}.`
    return filter === 'all' ? 'No findings recorded yet.' : `No ${filter} findings.`
  }
  return rankFindings(rows)
    .filter(({ findings }) => findings.length > 0)
    .map(({ group, findings }) => [`${group}:`, ...findings.map(findingLine)].join('\n'))
    .join('\n')
}

/** `key: value` lines, empty fields dropped. */
export function formatFields(fields: Array<[string, unknown]>): string {
  return fields
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n')
}

/**
 * A cell's resources as one field value: each one's name then its url, in the
 * order the author put them. Null when there are none, so `formatFields` drops
 * the line rather than printing an empty one.
 */
export function formatResources(
  resources: readonly CellResource[],
): string | null {
  if (resources.length === 0) return null
  return resources
    .map((resource) => `${resource.name} ${resource.url ?? ''}`.trim())
    .join('; ')
}

export function formatSliceList(
  slices: ReadonlyArray<{ id: string; title: string; kind: string }>,
): string {
  if (slices.length === 0) return 'No slices yet.'
  return slices
    .map((slice) => `"${slice.title}" (${slice.id}, type ${slice.kind})`)
    .join('\n')
}

export function formatSliceDetail(
  slice: {
    id: string
    title: string
    kind: string
    actor?: string | null
  },
  items: ReadonlyArray<{
    position: number
    title?: string | null
    caption?: string | null
    cell_ids?: string[] | null
  }>,
): string {
  const frames = [...items]
    .sort((a, b) => a.position - b.position)
    .map(
      (frame, index) =>
        `frame ${index + 1}: cells [${(frame.cell_ids ?? []).join(', ')}]${frame.title ? ` title "${frame.title}"` : ''}${frame.caption ? ` caption "${frame.caption}"` : ''}`,
    )
  return `slice "${slice.title}" (${slice.id}) type=${slice.kind}${slice.actor ? ` actor=${slice.actor}` : ''}\n${frames.join('\n') || '(no frames)'}`
}

/**
 * The lane vocabulary in use, commonest first — one line per distinct
 * (label, role) pair with how many lanes carry it.
 */
export function formatLaneVocabulary(
  rows: ReadonlyArray<{ name: string; lane_role?: string | null }>,
): string {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = JSON.stringify([row.name, row.lane_role ?? null])
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return 'No lanes defined yet.'
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [name, role] = JSON.parse(key) as [string, string | null]
      return `${name}${role ? ` (role ${role})` : ''} — ${count} lane${count === 1 ? '' : 's'}`
    })
    .join('\n')
}

/** The cast, one line each, with the other spellings the name has had. */
export function formatStakeholderList(
  rows: ReadonlyArray<{
    id: string
    name: string
    kind: string
    summary?: string | null
    aliases?: string[] | null
  }>,
): string {
  if (rows.length === 0) return 'No stakeholders registered yet.'
  return rows
    .map((row) => {
      const aliases = (row.aliases ?? []).length
        ? ` — also written ${(row.aliases ?? []).join(', ')}`
        : ''
      return `${row.name} (${row.kind}) [${row.id}]${aliases}${row.summary ? ` — ${row.summary}` : ''}`
    })
    .join('\n')
}

/** The dependency edges on their own, one `dependencyLine` each. */
export function formatCellDependencies(
  rows: ReadonlyArray<DependencyEdge>,
  cellId?: string,
): string {
  if (rows.length === 0) {
    return cellId ? `No links on cell ${cellId}.` : 'No links recorded yet.'
  }
  const header = cellId
    ? `${rows.length} link(s) touching ${cellId}:`
    : `${rows.length} link(s)${rows.length === 200 ? ' (capped at 200)' : ''}:`
  return [header, ...rows.map(dependencyLine)].join('\n')
}

export type EvidenceLineRow = {
  id: string
  cell_id?: string | null
  kind: string
  title: string
  note?: string | null
  observed_at?: string | null
}

/** One evidence row as a line — the shape both evidence readers render. */
function evidenceLine(row: EvidenceLineRow): string {
  const seen = row.observed_at ? ` observed=${row.observed_at.slice(0, 10)}` : ''
  const cell = row.cell_id ? ` cell=${row.cell_id}` : ''
  return `[${row.kind}] "${row.title}"${seen}${cell} (${row.id})`
}

export function formatEvidenceList(
  rows: ReadonlyArray<EvidenceLineRow>,
  cellId?: string,
): string {
  if (rows.length === 0) {
    return cellId
      ? `No evidence attached to cell ${cellId}.`
      : 'No evidence recorded yet.'
  }
  return [
    `${rows.length} evidence row(s)${rows.length === 100 ? ' (capped at 100)' : ''}:`,
    ...rows.map(evidenceLine),
  ].join('\n')
}

/**
 * Named rows in full. Ids that matched nothing are reported rather than
 * dropped — a silently short answer reads as "that source does not exist".
 */
export function formatEvidenceDetail(
  rows: ReadonlyArray<EvidenceLineRow>,
  requestedIds: readonly string[],
): string {
  if (rows.length === 0) return 'No evidence with those ids.'
  const sections = rows.map((row) => {
    const lines = [evidenceLine(row)]
    if (row.note) lines.push(`  note: ${row.note}`)
    return lines.join('\n')
  })
  const missing = requestedIds.filter((id) => !rows.some((row) => row.id === id))
  if (missing.length > 0) {
    sections.push(`(no evidence with id: ${missing.join(', ')})`)
  }
  return sections.join('\n')
}

export function formatOwnerTags(
  rows: ReadonlyArray<{
    owner?: string | null
    perceived_owner?: string | null
  }>,
): string {
  const tags = new Set<string>()
  for (const row of rows) {
    if (row.owner) tags.add(row.owner)
    if (row.perceived_owner) tags.add(row.perceived_owner)
  }
  if (tags.size === 0) return 'No owner tags in use yet.'
  return [...tags].sort().join(', ')
}

function compareSlotLine(
  slot: CompareSlot,
  blueprints: readonly BlueprintData[],
): string {
  const fields =
    slot.differingFields.length > 0
      ? ` (fields: ${slot.differingFields.join(', ')})`
      : ''
  const perPath = blueprints
    .map((blueprint) => {
      const entry = slot.perPath[blueprint.path.id]
      if (!entry?.present) return `${blueprint.path.name}: —`
      const quoted = entry.contents.map((content) => `"${content}"`).join(' + ')
      return `${blueprint.path.name}: ${quoted} (${entry.cellIds.join(', ')})`
    })
    .join(' | ')
  return `  [${slot.verdict}] lane "${slot.laneLabel}" @ step "${slot.columnLabel}"${fields}: ${perPath}`
}

/**
 * Headless compare: runs `buildCompareModel` over the scenario's paths and
 * serializes slots / step groups / columns as compact text. This grounds
 * every other compare argument the agent can pass — step numbers for
 * jump_divergence, lane and step names for differences_filter, cell ids for
 * focus/annotate.
 */
export function formatCompareDiff(
  all: readonly BlueprintData[],
  pathIds?: string[],
): string {
  if (all.length === 0) return 'No paths in this scenario.'
  let blueprints = [...all]
  if (pathIds && pathIds.length > 0) {
    const wanted = blueprints.filter((blueprint) =>
      pathIds.includes(blueprint.path.id),
    )
    // Keep the caller's order — column insertion follows the first path.
    blueprints = pathIds
      .map((id) => wanted.find((blueprint) => blueprint.path.id === id))
      .filter((blueprint): blueprint is BlueprintData => Boolean(blueprint))
  }
  if (blueprints.length < 2)
    return `Comparison needs at least two paths; this scenario ${
      pathIds && pathIds.length > 0 ? 'selection' : ''
    } resolves to ${blueprints.length}. Path ids here: ${all
      .map((blueprint) => blueprint.path.id)
      .join(', ')}.`

  const model = buildCompareModel(blueprints as CompareBlueprints)
  const zones = deriveCompareZones(model)
  const stepGroups = deriveCompareStepGroups(model)
  const detailOnly = getDetailOnlyCompareSlots(model)

  const lines: string[] = [
    `Comparing ${blueprints
      .map((blueprint) => `"${blueprint.path.name}" (${blueprint.path.id})`)
      .join(' vs ')}`,
    `Canonical columns: ${model.columns
      .map((column, index) => `${index + 1}."${column.label}" ${column.verdict}`)
      .join(' | ')}`,
    `${countCompareDifferences(model)} differences · ${zones.length} zones · ${detailOnly.length} detail-only`,
  ]
  // Grouped by STEP — the ledger's grain and jump_divergence's argument;
  // each group names the divergence zone (run) it sits in, which is the
  // grain the strip draws.
  for (const group of stepGroups) {
    lines.push(
      `${group.headerLabel} (zone ${group.zoneIndex}, ${group.slots.length} difference${
        group.slots.length === 1 ? '' : 's'
      }):`,
    )
    for (const slot of group.slots) lines.push(compareSlotLine(slot, blueprints))
  }
  if (detailOnly.length > 0) {
    lines.push(`Detail-only differences (${detailOnly.length}) — no canvas step:`)
    for (const slot of detailOnly) lines.push(compareSlotLine(slot, blueprints))
  }
  const shared = model.slots.filter(
    (slot) => slot.verdict === 'shared' && !isDetailOnlyCompareSlot(slot),
  ).length
  lines.push(
    `${shared} shared slots. Note: dependency edges (leads_to, enables) are not compared.`,
  )
  return lines.join('\n')
}

/**
 * A row of ranked blueprint search, as the deployment's `search_blueprint`
 * function returns one.
 *
 * Deliberately loose about the columns this rendering does not read: the
 * function is a DEPLOYMENT's, so a deployment may return more (scores,
 * timestamps) and this must keep working when it does.
 */
export type BlueprintSearchRow = {
  kind: string
  id: string
  snippet?: string | null
  description?: string | null
  lane?: string | null
  step?: string | null
  scenario?: string | null
  phase?: string | null
  path?: string | null
  matched_by?: string | null
  total_matched?: number | null
}

/** Which arms of the search ran, and what the scope did to the rows. */
export type BlueprintSearchArms = {
  /** Did the question get embedded and a meaning arm run? */
  meaning: boolean
  /**
   * The function's own corpus-wide total, which is what the header promises.
   * Passed in rather than read off row zero because a scope filter can empty
   * the rows while leaving that number true and load-bearing.
   */
  total: number
  /**
   * Present when the read was confined to one service, and every number here
   * is about the ROWS THE FUNCTION RETURNED — its clipped top-k — not the
   * corpus. That distinction is the whole reason these are separate fields:
   * a service can hold hundreds of matches and appear in none of the returned
   * rows simply by losing the ranking, so nothing here may be phrased as a
   * fact about the service.
   */
  scope?: {
    name: string
    /** How many rows the function returned before any of this filtering. */
    returned: number
    /** Rows placed in a different service. */
    otherService: number
    /** Rows no service could claim: more than one owns that phase name. */
    ambiguous: number
    /** Rows carrying no phase breadcrumb, which the contract requires. */
    unplaceable: number
  }
}

/**
 * Ranked matches, and — this is the load-bearing part — an honest account of
 * WHICH ARMS RAN.
 *
 * A zero-row answer is where a search tool does its worst damage. "Nothing
 * matches" invites the model to report that the blueprint has no such moment,
 * and on a keyword-only run that inference is simply wrong: the moment can be
 * mapped in different words. So the empty text names the arms that ran and
 * says what their silence does and does not prove, and it says something
 * DIFFERENT when meaning matching ran, because then a near-miss in other
 * words would have been found.
 *
 * The header carries the corpus-wide total for the same reason `list_` says
 * when it clipped: a top-k answer must not read as the whole set.
 */
export function formatBlueprintSearch(
  rows: readonly BlueprintSearchRow[],
  query: string,
  arms: BlueprintSearchArms,
): string {
  const how = arms.meaning ? 'words and meaning' : 'words only'
  const unplaced = arms.scope
    ? [
        arms.scope.ambiguous > 0
          ? `${arms.scope.ambiguous} in a phase name more than one service uses`
          : '',
        arms.scope.unplaceable > 0
          ? `${arms.scope.unplaceable} carrying no phase at all`
          : '',
      ].filter(Boolean)
    : []
  const couldNotPlace =
    unplaced.length > 0
      ? ` Some rows could not be placed in any service: ${unplaced.join(', ')} — narrow with phase or scenario, or pass service:"all".`
      : ''
  if (rows.length === 0) {
    // A scope that emptied the rows is NOT an empty result — and it is also
    // not proof the service has no match. The function RANKED AND CLIPPED
    // first, so all this knows is that the top-k landed elsewhere. Saying
    // "none of them are in <service>" would be a claim about the corpus made
    // from the top of a list, and it would send the caller to service:"all",
    // the one remedy that cannot surface the in-scope rows.
    //
    // "Outside <service>" is said only of rows that were actually PLACED
    // somewhere else. A row dropped as ambiguous (a phase name two services
    // share) or unplaceable (no phase breadcrumb at all) was placed NOWHERE,
    // and may well belong to the scope — so the same sentence would state as
    // fact the one thing this cannot know, and then contradict itself a clause
    // later by admitting the rows could not be placed.
    if (arms.scope && arms.scope.otherService > 0)
      return `The top ${arms.scope.returned} of ${arms.total} rows matching "${query}" (${how}) came back in other services, none in ${arms.scope.name}. That is a fact about the TOP of the ranking, not about ${arms.scope.name} — it may hold matches that lost to rows elsewhere. To find them: add phase or scenario from ${arms.scope.name}, or raise limit. Pass service:"all" to see the rows that did come back. Never report this as the blueprint not covering it.${couldNotPlace}`
    if (arms.scope && arms.scope.returned > 0)
      return `The top ${arms.scope.returned} of ${arms.total} rows matching "${query}" (${how}) could not be placed in any service, so none could be shown for ${arms.scope.name} — they are not known to be outside it.${couldNotPlace} Pass service:"all" to see them as they came back.`
    return arms.meaning
      ? `Nothing matches "${query}" by words or by meaning. Both arms ran, so a moment described in OTHER words would have been found — but say "nothing in the blueprint matched this search", not "the blueprint does not cover this". list_blueprint shows what exists.`
      : `Nothing matches the words "${query}". This search matched WORDS ONLY — no meaning matching ran — so that means no row USES those words, and NOT that the blueprint has no such moment. Try the board's own vocabulary, or list_blueprint to see what exists.`
  }
  const total = arms.total
  const header = arms.scope
    ? `${rows.length} shown, in ${arms.scope.name}, from the top ${arms.scope.returned} of ${total} matching across the deployment (${how}):${couldNotPlace}`
    : `${rows.length} shown of ${total} matching (${how}):`
  const lines = rows.map((row) => {
    const where = [row.phase, row.scenario, row.path, row.step, row.lane]
      .filter(Boolean)
      .join(' › ')
    // A structural row IS its breadcrumb, so its name is not repeated; a cell
    // is identified by its content, first line only.
    const body =
      row.kind === 'cell'
        ? `"${(row.snippet ?? '').split('\n')[0]}"`
        : `"${row.snippet ?? ''}"`
    const detail = row.description ? ` — ${row.description}` : ''
    const matched = row.matched_by ? `  [${row.matched_by}]` : ''
    return `[${row.kind}] ${body} · ${where}${detail} (${row.id})${matched}`
  })
  return [header, ...lines].join('\n')
}
