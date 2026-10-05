import { useMemo, useState } from 'react'
import { describeLaneRole, getLaneRole } from '@/lib/laneRoles'
import { featuredPresentation } from '@/lib/resourcePresentation'
import {
  getBlueprintCellConnections,
  getBlueprintForPath,
  getLinkedTechFromConnections,
  getSelectedCellLaneRowPosition,
  type BlueprintCellConnection,
  type BlueprintCellConnections,
} from '@/lib/blueprintCellConnections'
import { getBlueprintStepTechItems } from '@/lib/blueprintStepTech'
import {
  getBlueprintLaneStyle,
  getBlueprintLaneZone,
} from '@/lib/blueprintTheme'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { cellResources } from '@/lib/cellResources'
import {
  cellTouchpoints,
  findCellPlacement,
  resolveTouchpointDetail,
  type TouchpointDetail,
} from '@/lib/cellTouchpoints'
import { resolveStoryboardStripEntries } from '@/lib/storyboardWalkthrough'
import type { ExistingDependency } from '@/components/blueprint/CellDependencyEditor'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import type { DependencyEndpoint } from '@/lib/dependencyValidation'
import type { FeaturedPresentation } from '@/lib/resourcePresentation'
import type {
  BlueprintCell,
  BlueprintData,
  CellResource,
  CellTouchpoint,
} from '@/types/blueprint'
import type {
  BlueprintCellPathEntry,
  BlueprintCellSelection,
} from '@/types/blueprintCellDetail'
import type { StoryboardFrameEntry } from '@/lib/storyboardWalkthrough'

/**
 * Where a cell sits, said so that two cells never say the same thing.
 *
 * Step names are not unique — a blueprint may run several columns all called
 * "Discovers the service" — so the column number leads. Without it the picker
 * offers three identical rows and choosing between them is a coin flip.
 */
function cellPositionLabel(
  stepIndex: number,
  stepName: string,
  laneName: string,
): string {
  const column = stepIndex >= 0 ? `${stepIndex + 1}. ` : ''
  return `${column}${stepName} · ${laneName}`
}

/**
 * The cell as this panel needs it, from either source.
 *
 * `touchpoints` and `resources` are resolved once at the top rather than
 * threaded as the raw link array they used to be: the database has two
 * relations where it had one column, and only `cellTouchpoints.ts` /
 * `cellResources.ts` know which source a board came from.
 */
type PanelCell = Pick<BlueprintCell, 'content' | 'summary' | 'frame'> & {
  touchpoints: CellTouchpoint[]
  resources: CellResource[]
}

/**
 * The lane a cell sits in, as the panel reads it: the row record, or the
 * name-only stand-in the resolution below falls back to.
 *
 * The stand-in spells `role: null` rather than omitting the key, so that both
 * arms answer the question "what role is this lane?". A reader of `lane.role`
 * gets the honest answer — none recorded — where an absent key would be a type
 * error at every call site that asks.
 */
type SelectedLane = { name: string; role: string | null }

/** The lane, as the panel's badge needs it: the row, its tint and its meaning. */
type SelectedLaneResolution = {
  laneName: string
  lane: SelectedLane
  style: ReturnType<typeof getBlueprintLaneStyle>
  description: string
}

/**
 * ONE resolution of the selected cell, for every reading below.
 *
 * The panel's three readers used to be handed one object of sixteen
 * derivations, twelve of which exactly one of them read, and the path's board
 * was looked up again in seven of those derivations. This is the one place the
 * board is found, the cell is picked out of it and the lane is identified;
 * every reading below is a function of this and nothing else, so a fact has
 * one origin rather than a quorum.
 *
 * `connections` belongs here for the same reason the board does: the tab row
 * shows the dependencies and the panel's editable ones are cut from the same
 * walk, and walking that list twice is two chances to disagree about it.
 *
 * The three fields the readings need from the selection are resolved here too
 * — the clicked touchpoint, the column, and where the cell sits said the way
 * the dependency picker says it — so a reading takes this and nothing else.
 * A reading handed the whole selection could reach the clicked placement
 * through `paths[0].touchpoints`, which is the interface widening back by a
 * second door.
 *
 * Nothing here is state, and nothing here writes.
 */
type SelectedCell = {
  pathEntry: BlueprintCellPathEntry | undefined
  /** The cell's id with any path suffix resolved away, or null for a draft. */
  cellId: string | null
  /** The board the selected path belongs to — found once, read from. */
  blueprint: BlueprintData | null
  cell: PanelCell | null
  lane: SelectedLaneResolution | null
  connections: BlueprintCellConnections
  /** The touchpoint the reader clicked, where one was clicked. */
  techItem: string | undefined
  /** The column the cell sits in. */
  stepId: string | undefined
  /**
   * Where this cell sits, said the way the dependency picker says it — and
   * null for a draft, which sits nowhere until it is saved. Doubles as the
   * answer to "is something selected?", which is the only thing the readings
   * asked the selection itself.
   */
  positionLabel: string | null
}

/**
 * Shared, and frozen: an empty walk is read from many places and written by
 * none. The identity is the point — a fresh `[]` per render is a new prop for
 * every list that receives it — and freezing is what keeps one shared object
 * from being one stray `push` away from a cross-panel defect.
 */
const NO_CONNECTIONS: BlueprintCellConnections = Object.freeze({
  incoming: Object.freeze([]) as unknown as BlueprintCellConnection[],
  outgoing: Object.freeze([]) as unknown as BlueprintCellConnection[],
})

/**
 * Resolve the selected cell — the path's board, the cell, the lane, the
 * dependencies that reach it — once per selection.
 *
 * Reads the DRAFT's lane when there is no selection: a cell being created sits
 * in a real row, and the badge above the new-cell form is the same badge the
 * panel shows once it is saved.
 */
export function useSelectedCell({
  blueprints,
  selection,
  draft,
}: {
  blueprints: BlueprintData[]
  selection: BlueprintCellSelection | null
  draft: DraftCellTarget | null
}): SelectedCell {
  const pathEntry = selection?.paths[0]
  const cellId = pathEntry?.cellId
    ? resolveBlueprintCellId(pathEntry.cellId)
    : null

  const blueprint = useMemo(() => {
    const pathId = pathEntry?.pathId ?? draft?.pathId
    if (!pathId) return null
    return getBlueprintForPath(blueprints, pathId) ?? null
  }, [blueprints, draft?.pathId, pathEntry?.pathId])

  const connections = useMemo(() => {
    const rawCellId = pathEntry?.cellId
    if (!rawCellId || !blueprint) return NO_CONNECTIONS
    return getBlueprintCellConnections(blueprint, rawCellId)
  }, [blueprint, pathEntry?.cellId])

  const cell = useMemo((): PanelCell | null => {
    const fromEntry = (): PanelCell | null => {
      if (!pathEntry) return null
      return {
        content: pathEntry.content,
        summary: pathEntry.summary ?? null,
        frame: pathEntry.frame ?? null,
        touchpoints: pathEntry.touchpoints ?? [],
        resources: pathEntry.resources ?? [],
      }
    }

    if (!cellId || !pathEntry?.pathId) return fromEntry()

    const record = blueprint?.cells.find((entry) => entry.id === cellId) ?? null
    if (record) {
      return {
        content: record.content,
        summary: record.summary,
        frame: record.frame,
        touchpoints: cellTouchpoints(record),
        resources: cellResources(record),
      }
    }

    return (
      fromEntry() ?? {
        content: '',
        summary: null,
        frame: null,
        touchpoints: [],
        resources: [],
      }
    )
  }, [blueprint, cellId, pathEntry])

  /*
    The lane a cell sits in answers three questions — which row record it is
    (storyboard/touchpoint content rules), what colour the badge wears, and
    what the row MEANS on hover — and each used to walk `blueprint.lanes` for
    itself. Three lookups of one fact is three chances to disagree.
  */
  const lane = useMemo((): SelectedLaneResolution | null => {
    const laneName = selection?.laneName ?? draft?.laneName
    if (!laneName) return null

    const laneRecord =
      blueprint?.lanes.find((entry) => entry.name === laneName) ?? null
    const zone =
      laneRecord && blueprint
        ? getBlueprintLaneZone(laneRecord, blueprint.lanes)
        : 'frontstage'
    return {
      laneName,
      lane: laneRecord
        ? { name: laneRecord.name, role: laneRecord.role ?? null }
        : { name: laneName, role: null },
      // Keyed by lane_role — the name argument is only the legacy fallback.
      style: getBlueprintLaneStyle(laneName, zone, laneRecord?.role),
      /* What the badge MEANS, for its hover. Resolved the way the canvas
         resolves it: the explicit role if the row carries one, else the
         legacy name map. */
      description: describeLaneRole(
        getLaneRole({ name: laneName, role: laneRecord?.role ?? null }),
      ),
    }
  }, [blueprint, draft?.laneName, selection?.laneName])

  const positionLabel = selection
    ? cellPositionLabel(
        selection.stepIndex,
        selection.stepName,
        selection.laneName,
      )
    : null

  return {
    pathEntry,
    cellId,
    blueprint,
    cell,
    lane,
    connections,
    techItem: selection?.techItem,
    stepId: selection?.stepId,
    positionLabel,
  }
}

/**
 * What the DRAWER reads: where the cell sits, which row it is in, the board it
 * routes a click through, and the dependency endpoints and storyboard frames
 * only the panel itself hands on.
 *
 * The drawer is the one reader that composes — it mints the lane badge, routes
 * a clicked dependency row to the cell at the other end and decides whether
 * this is a storyboard row — which is why the board is named here rather than
 * read off the resolution behind this interface's back. It carries no
 * placement, no featured link and no tab content.
 */
type CellPanelFacts = {
  pathEntry: BlueprintCellPathEntry | undefined
  cellId: string | null
  blueprint: BlueprintData | null
  lane: SelectedLaneResolution | null
  /** Every other cell in this version, as somewhere a dependency could point. */
  dependencyCandidates: DependencyEndpoint[]
  existingDependencies: ExistingDependency[]
  dependencySource: DependencyEndpoint | null
  storyboardStepEntries: StoryboardFrameEntry[]
}

export function useCellPanelFacts({
  pathEntry,
  cellId,
  blueprint,
  lane,
  connections,
  stepId,
  positionLabel,
}: SelectedCell): CellPanelFacts {
  /**
   * Scoped to the version on purpose — the RPC refuses a cross-version
   * dependency, and offering one here would only be a way to reach that
   * refusal. Versions are alternatives, not stages.
   *
   * Labels lead with the column number because step *names* repeat: Discovery
   * holds several columns all named the same thing, so name-and-lane alone
   * names three different cells and the picker becomes a guess. The column
   * number is the only part of a cell's position that is always unique, and
   * ordering by it puts the list in the reading order of the grid.
   */
  const dependencyCandidates = useMemo<DependencyEndpoint[]>(() => {
    const pathId = pathEntry?.pathId
    if (!cellId || !pathId || !blueprint) return []

    const laneNames = new Map(
      blueprint.lanes.map((entry) => [entry.id, entry.name]),
    )
    const stepOrder = new Map(
      blueprint.steps.map((step, index) => [step.id, { index, name: step.name }]),
    )

    return blueprint.cells
      .filter((cell) => cell.id !== cellId)
      .map((cell) => {
        const step = stepOrder.get(cell.step_id)
        return {
          cellId: cell.id,
          pathId,
          stepIndex: step?.index ?? Number.MAX_SAFE_INTEGER,
          label: cellPositionLabel(
            step?.index ?? -1,
            step?.name ?? 'Unknown step',
            laneNames.get(cell.lane_id) ?? 'Unknown lane',
          ),
        }
      })
      .sort(
        (a, b) =>
          a.stepIndex - b.stepIndex || a.label.localeCompare(b.label),
      )
      .map(({ cellId: id, pathId: path, label }) => ({
        cellId: id,
        pathId: path,
        label,
      }))
  }, [blueprint, cellId, pathEntry?.pathId])

  // Only outgoing dependencies: this cell owns the ones it is the source of,
  // and those are the ones it may change or remove. An incoming one belongs to
  // the cell at the other end, and is edited from there.
  const existingDependencies = useMemo<ExistingDependency[]>(
    () =>
      connections.outgoing.map((connection) => ({
        id: connection.dependencyId,
        targetCellId: connection.cellId,
        targetLabel: cellPositionLabel(
          connection.stepIndex,
          connection.stepName,
          connection.laneName,
        ),
        kind: connection.linkKind,
        note: connection.linkNote,
      })),
    [connections.outgoing],
  )

  const dependencySource = useMemo<DependencyEndpoint | null>(() => {
    const pathId = pathEntry?.pathId
    if (!cellId || !pathId || !positionLabel) return null
    return { cellId, pathId, label: positionLabel }
  }, [cellId, pathEntry?.pathId, positionLabel])

  const storyboardStepEntries = useMemo(() => {
    if (!stepId || !pathEntry?.pathId || !blueprint) return []
    return resolveStoryboardStripEntries(blueprint, stepId)
  }, [blueprint, pathEntry?.pathId, stepId])

  return {
    pathEntry,
    cellId,
    blueprint,
    lane,
    dependencyCandidates,
    existingDependencies,
    dependencySource,
    storyboardStepEntries,
  }
}

/**
 * What the OVERVIEW reads: the cell's own sentence and picture, the placement
 * the reader clicked, and the buttons that placement brings with it.
 *
 * The lane arrives as the row record alone — the overview asks what KIND of
 * row this is, never what colour the badge wears — so the tint and the hover
 * text stay with the drawer that draws the badge.
 */
export type CellOverviewFacts = {
  cellId: string | null
  /** The cell's featured image, as stored. */
  frame: string | null
  touchpoints: CellTouchpoint[]
  resources: CellResource[]
  lane: SelectedLane | null
  /** The placement row this panel is about, or null when none is placed. */
  placement: CellTouchpoint | null
  touchpointDetail: TouchpointDetail | null
  featured: FeaturedPresentation
}

export function useCellOverviewFacts({
  cellId,
  cell,
  lane,
  techItem,
}: SelectedCell): CellOverviewFacts {
  const touchpoints = useMemo(
    (): CellTouchpoint[] => cell?.touchpoints ?? [],
    [cell?.touchpoints],
  )

  const resources = useMemo(
    (): CellResource[] => cell?.resources ?? [],
    [cell?.resources],
  )

  /*
    The placement row this panel is about.

    One resolution, by `findCellPlacement`, where the panel used to run three
    name matches of its own — one for the featured preview, one for the role
    badge, one for the pictures — each with its own idea of trimming and
    case. The row is what the summary, the role, the icon and the featured
    attachment all belong to, so it is resolved once and read from.
  */
  const named = useMemo(
    () =>
      cell ? findCellPlacement({ touchpoints: cell.touchpoints }, techItem) : null,
    [cell, techItem],
  )

  /*
    …and held by its ROW once found, because the selection names it by the
    name it showed when it was clicked, and a name can change under an open
    panel. A rename from the panel's own touchpoint editor refetches the board
    with the new name while the selection still says the old one; matched by
    name alone, the placement would vanish, and with it the editor's form and
    every unsaved edit in it. So the row found for this cell and this name is
    remembered by id, and found again by id when the name stops matching. A
    placement that is really gone — its name taken out of the cell's text —
    has no row to find, and resolves to nothing as before.
  */
  const [held, setHeld] = useState<{
    cellId: string | null
    techItem: string | undefined
    placementId: string
  } | null>(null)
  if (
    named?.id &&
    (held?.placementId !== named.id || held.cellId !== cellId || held.techItem !== techItem)
  ) {
    setHeld({ cellId, techItem, placementId: named.id })
  }
  const heldId =
    held && held.cellId === cellId && held.techItem === techItem ? held.placementId : null
  const placement = useMemo(
    () =>
      named ??
      (heldId ? (cell?.touchpoints.find((entry) => entry.id === heldId) ?? null) : null),
    [named, heldId, cell],
  )

  /*
    The READING of that row, which is a different thing from the row.

    `resolveTouchpointDetail` falls back to the cell's summary where the
    placement has none, which is right for a reader and wrong for a form:
    seeding an editor with the fallback is how a cell's sentence ends up
    written onto a placement that never said it. The editor takes the row.
  */
  const touchpointDetail = useMemo(
    () =>
      cell
        ? resolveTouchpointDetail(
            { summary: cell.summary, touchpoints: cell.touchpoints },
            // The resolved row's own name, so a placement held by id across
            // a rename is read under the name it now has.
            placement?.name ?? techItem,
          )
        : null,
    [cell, placement, techItem],
  )

  /*
    The cell's buttons: every featured link — the selected placement's, then
    the cell's own — named by its host.
  */
  const featured = useMemo(
    () =>
      cell
        ? featuredPresentation({
            placementId: placement?.id ?? null,
            resources,
          })
        : { buttons: [] },
    [cell, placement, resources],
  )

  return {
    cellId,
    frame: cell?.frame ?? null,
    touchpoints,
    resources,
    lane: lane?.lane ?? null,
    placement,
    touchpointDetail,
    featured,
  }
}

/** One tech item shown on a dependency row, wherever it was reached from. */
type OtherTechEntry = {
  id: string
  cellId: string
  item: string
  laneName?: string
  stepIndex?: number
}

/**
 * What the TAB ROW reads: the dependencies, the tech reached through them, where
 * this cell sits among its lane's rows, and the two lists the Resources tab
 * renders.
 *
 * It asks nothing about the placement the reader clicked and nothing about the
 * lane — those are the overview's question and the drawer's.
 */
export type CellTabsFacts = {
  cellId: string | null
  connections: BlueprintCellConnections
  otherTech: OtherTechEntry[]
  /** Lane row position of the selected cell — orients up/down glyphs. */
  selectedLaneRowPosition: number
  frame: string | null
  touchpoints: CellTouchpoint[]
  resources: CellResource[]
}

export function useCellTabsFacts({
  cellId,
  blueprint,
  cell,
  connections,
  techItem,
  stepId,
}: SelectedCell): CellTabsFacts {
  const stepTechItems = useMemo(() => {
    if (!cellId || !techItem || !stepId || !blueprint) return []

    return getBlueprintStepTechItems(blueprint, stepId, {
      cellId,
      item: techItem,
    })
  }, [blueprint, cellId, stepId, techItem])

  const linkedTechItems = useMemo(
    () => getLinkedTechFromConnections(connections),
    [connections],
  )

  const otherTech = useMemo((): OtherTechEntry[] => {
    const laneNameByCellId = new Map<string, string>()
    const stepIndexByCellId = new Map<string, number>()
    for (const entry of [...connections.incoming, ...connections.outgoing]) {
      laneNameByCellId.set(entry.cellId, entry.laneName)
      stepIndexByCellId.set(entry.cellId, entry.stepIndex)
    }

    const seen = new Set<string>()
    const entries: OtherTechEntry[] = []

    const add = (entry: OtherTechEntry) => {
      if (seen.has(entry.id)) return
      seen.add(entry.id)
      entries.push(entry)
    }

    for (const entry of linkedTechItems) {
      add({
        id: entry.id,
        cellId: entry.cellId,
        item: entry.item,
        laneName: laneNameByCellId.get(entry.cellId),
        stepIndex: stepIndexByCellId.get(entry.cellId),
      })
    }
    for (const entry of stepTechItems) {
      add({
        id: entry.id,
        cellId: entry.cellId,
        item: entry.item,
        laneName: entry.laneName,
        stepIndex: entry.stepIndex,
      })
    }

    return entries
  }, [connections.incoming, connections.outgoing, linkedTechItems, stepTechItems])

  const selectedLaneRowPosition = useMemo(() => {
    if (!cellId || !blueprint) return -1
    return getSelectedCellLaneRowPosition(blueprint, cellId)
  }, [blueprint, cellId])

  // Memoized for the same reason the overview's are: an empty list minted
  // afresh each render is a new prop identity for the tab that renders it.
  const touchpoints = useMemo(
    (): CellTouchpoint[] => cell?.touchpoints ?? [],
    [cell?.touchpoints],
  )
  const resources = useMemo(
    (): CellResource[] => cell?.resources ?? [],
    [cell?.resources],
  )

  return {
    cellId,
    connections,
    otherTech,
    selectedLaneRowPosition,
    frame: cell?.frame ?? null,
    touchpoints,
    resources,
  }
}
