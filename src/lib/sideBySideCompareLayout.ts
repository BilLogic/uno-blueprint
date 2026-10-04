import { ARROW_VIEWPORT_PAD } from '@/lib/blueprintArrowGeometry'
import {
  BLUEPRINT_ARTBOARD_HEIGHT_BUFFER,
  BLUEPRINT_DIVIDER_ROW_HEIGHT,
  BLUEPRINT_HEADER_HEIGHT_COMPACT,
  BLUEPRINT_LANE_ROW_GAP,
  BLUEPRINT_ROW_MIN_HEIGHT,
  BLUEPRINT_ROW_MIN_HEIGHT_COMPACT,
  INTERACTION_LINE_LABEL,
  INTERNAL_INTERACTION_LINE_LABEL,
  VISIBILITY_LINE_LABEL,
  getCellShellPaddingY,
  getLaneRowMinHeight,
  getStepColumnsWidth,
  STEP_COLUMN_GAP,
  laneHasWrapCorridorBelow,
  shouldShowInteractionLineAfter,
  shouldShowInternalInteractionLineAfter,
  shouldShowLaneDividerAfter,
  shouldShowVisibilityLineAfter,
} from '@/lib/blueprintLayout'
import {
  COMPARE_LANE_COLLAPSED_HEIGHT,
  isBlueprintLaneCollapsed,
} from '@/lib/blueprintLaneCollapse'
import {
  laneHasInLaneLoopCorridor,
  laneHasOverheadArrowCorridor,
  resolveBlueprintLane,
  rowTrackHeight,
} from '@/lib/laneCorridor'
import type { PathListItem } from '@/lib/pathSelection'
import { itemsInSelectionOrder } from '@/lib/pathSelection'
import type { BlueprintData, BlueprintLane } from '@/types/blueprint'
import type {
  IntegratedBlueprintCell,
  IntegratedBlueprintStep,
  IntegratedBlueprintDependency,
} from '@/types/integratedBlueprint'
import type { SlideViewType } from '@/types/nav'

export type ComparePathArrowData = {
  dependencies: IntegratedBlueprintDependency[]
  cells: IntegratedBlueprintCell[]
  steps: IntegratedBlueprintStep[]
}

/** One path's arrow inputs (fold's dependency-drop retired 2026-08-17). */
export function getComparePathArrowData(
  blueprint: BlueprintData,
): ComparePathArrowData {
  const { path, cells, dependencies, steps } = blueprint

  return {
    steps: steps.map((step) => ({
      ...step,
      pathStepIds: { [path.id]: step.id },
    })),
    cells: cells.map((cell) => ({
      id: cell.id,
      lane_id: cell.lane_id,
      step_id: cell.step_id,
      path_id: path.id,
      kind: path.kind,
      content: cell.content,
      frame: cell.frame,
      summary: cell.summary,
      opacity: 1,
    })),
    dependencies: dependencies.map((dependency) => ({
        id: dependency.id,
        source_cell_id: dependency.source_cell_id,
        target_cell_id: dependency.target_cell_id,
        path_id: path.id,
        kind: path.kind,
        opacity: 1,
      })),
  }
}

export const COMPARE_CARD_GAP = 20
export const COMPARE_CARD_PADDING_X = 12
/**
 * The painted rail: room for two-word lane names ("Front Stage Actions") and,
 * the binding case, the canonical "Line of …" divider captions.
 *
 * 208 -> 214 on 2026-08-21. "LINE OF INTERNAL INTERACTION" measured ~221px
 * at the caption size then in use, with its tracking, and is `shrink-0` —
 * it neither wraps nor truncates — so at 208 it overflowed the painted rail
 * and the only thing between those words and the path outline was
 * COMPARE_RAIL_GUTTER. That made the gutter carry a constraint it should
 * not have, and forced it wide enough to leave the lane label stranded.
 *
 * 216 is what the caption needs once it shares the lane label's left inset
 * (BLUEPRINT_SLOT_INSET_LEFT, 16px) on the 4px grid. The caption now ends
 * inside the rail, the gutter is free to be small, and both gaps land where
 * they should — see COMPARE_RAIL_GUTTER.
 */
export const COMPARE_LABEL_WIDTH = 216
/**
 * The rail's grid TRACK is wider than the rail it paints.
 *
 * The rail used to be just another column, so the gap between it and the board
 * was the same 24px used between two step columns — and the path outline,
 * insetting itself back into that gap, landed 16px from the rail and 5px from
 * the first cell. It read as an edge belonging to the rail rather than a frame
 * around the board. This track keeps the two apart; the painted rail still
 * stops at COMPARE_LABEL_WIDTH.
 *
 * 8 makes the frame sit evenly between what is outside it and what is inside:
 *
 *   lane label -> outline    BLUEPRINT_SLOT_INSET (16) + GUTTER (8)
 *                            + (STEP_COLUMN_GAP - H_INSET) (8)   = 32
 *   outline -> first cell    COMPARE_PATH_SECTION_H_INSET (16)
 *                            + the cell's own inset (16)          = 32
 *
 * Two earlier values, both wrong for reasons worth keeping:
 *
 *   24 — sized so the long divider caption cleared the outline while it still
 *        overflowed the painted rail. It bought that clearance by stranding
 *        the lane label 46px from the frame.
 *    6 — sized to make the lane label's two sides match. It got the lane row
 *        right and left the caption 2px from the outline, reading as though
 *        the words touched the board.
 *
 * Neither could be right, because the caption was wider than the rail it sat
 * in. Widening COMPARE_LABEL_WIDTH to 216 removed that constraint from this
 * constant, which is why 8 can now serve the geometry instead of the text.
 */
export const COMPARE_RAIL_GUTTER = 8
export const COMPARE_LABEL_TRACK_WIDTH =
  COMPARE_LABEL_WIDTH + COMPARE_RAIL_GUTTER
export const COMPARE_PANEL_PADDING = 24
/** Extra inset on the right edge of the compare blueprint grid. */
export const COMPARE_PANEL_PADDING_RIGHT = 40

/** Gray padding around compare / integrated blueprint boards inside a panel. */
export function getCompareBoardWrapperPadding(): {
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
} {
  return {
    paddingTop: COMPARE_PANEL_PADDING,
    paddingBottom: COMPARE_PANEL_PADDING,
    paddingLeft: COMPARE_PANEL_PADDING,
    paddingRight: COMPARE_PANEL_PADDING_RIGHT,
  }
}
export const COMPARE_PATH_SECTION_TOP_INSET = 20
/**
 * Horizontal breathing room inside a path outline.
 *
 * One constant used to serve both axes at 8px, which after the 3px border
 * left 5px between the outline and the first cell against 17px above it —
 * a visibly squashed rectangle. The two axes are separate now.
 */
export const COMPARE_PATH_SECTION_H_INSET = 16
/** @deprecated Split into COMPARE_PATH_SECTION_H_INSET and the top/bottom pair. */
export const COMPARE_PATH_SECTION_INSET = COMPARE_PATH_SECTION_H_INSET
export const COMPARE_PATH_SECTION_BOTTOM_INSET = COMPARE_PATH_SECTION_TOP_INSET
/** Space reserved above compare body rows for section title badges. */
export const COMPARE_PATH_IDENTITY_HEIGHT = COMPARE_PATH_SECTION_TOP_INSET
/** @deprecated Path info now lives in section frames, not a grid swim lane. */
export const COMPARE_PATH_HEADER_HEIGHT = COMPARE_PATH_SECTION_TOP_INSET
export const COMPARE_STEP_HEADER_HEIGHT = BLUEPRINT_HEADER_HEIGHT_COMPACT + 8
export const COMPARE_MIN_PANEL_WIDTH = 720
export const COMPARE_MIN_PANEL_HEIGHT = 480
export const COMPARE_RESIZE_HANDLE_SIZE = 16
/** Extra scroll space so the resize handle and card shadow do not cover the last row. */
export const COMPARE_PANEL_BOTTOM_INSET = COMPARE_RESIZE_HANDLE_SIZE + 16

export type ComparePanelScrollChromeOptions = {
  /**
   * Locked / overview panels hide the resize handle — skip that inset so the
   * gray scroll shell hugs the blueprint board instead of leaving empty chrome.
   */
  lockHeight?: boolean
}

/** Symmetric vertical inset inside compare scroll shells (resize handle + arrow bleed). */
export function getComparePanelScrollInsetY(
  options?: ComparePanelScrollChromeOptions,
): number {
  const resizeInset = options?.lockHeight ? 0 : COMPARE_PANEL_BOTTOM_INSET / 2
  const artboardInset = options?.lockHeight
    ? 0
    : BLUEPRINT_ARTBOARD_HEIGHT_BUFFER / 2
  return resizeInset + artboardInset
}

/** Vertical padding inside the compare panel scroll shell (top + bottom). */
export function getComparePanelScrollPaddingY(
  options?: ComparePanelScrollChromeOptions,
): number {
  return ARROW_VIEWPORT_PAD * 2 + getComparePanelScrollInsetY(options) * 2
}

export type CompareRowHeightSpec = {
  height: number
  wrapCorridorAbove?: boolean
  wrapCorridorBelow?: boolean
  inLaneLoopCorridorAbove?: boolean
  kind?: 'path' | 'lane' | 'interaction' | 'visibility' | 'internalInteraction'
  collapsed?: boolean
}

export type BlueprintLabelRowSpec = {
  key: string
  label: string
  height: number
  kind: 'path' | 'lane' | 'interaction' | 'visibility' | 'internalInteraction'
  lane?: BlueprintLane
  collapsed?: boolean
  wrapCorridorAbove?: boolean
  wrapCorridorBelow?: boolean
  inLaneLoopCorridorAbove?: boolean
  showDividerBelow?: boolean
}

type SwimlaneRowSpec = Pick<
  CompareRowHeightSpec,
  | 'height'
  | 'kind'
  | 'collapsed'
  | 'wrapCorridorAbove'
  | 'wrapCorridorBelow'
  | 'inLaneLoopCorridorAbove'
>

/** White swimlane board height (section padding + rows + gaps). */
export function getSwimlaneBodyHeightFromRowSpecs(
  rows: SwimlaneRowSpec[],
): number {
  const trackHeights = rows.reduce(
    (sum, row) => sum + getCompareRowTrackHeight(row),
    0,
  )
  const rowGaps = Math.max(0, rows.length - 1) * BLUEPRINT_LANE_ROW_GAP

  return (
    COMPARE_PATH_SECTION_TOP_INSET +
    trackHeights +
    rowGaps +
    COMPARE_PATH_SECTION_BOTTOM_INSET
  )
}

export function getPanelHeightFromSwimlaneBody(
  swimlaneBodyHeight: number,
  options?: ComparePanelScrollChromeOptions,
): number {
  return (
    swimlaneBodyHeight +
    COMPARE_PANEL_PADDING * 2 +
    getComparePanelScrollPaddingY(options)
  )
}

export function buildCompareRowSpecs(
  blueprints: BlueprintData[],
  compact = false,
  collapsedLaneIds: ReadonlySet<string> = new Set(),
): CompareRowHeightSpec[] {
  return buildSideBySideLabelRowSpecs(blueprints, compact, collapsedLaneIds)
}

export type ScenarioSwimlaneLayoutInput = {
  displayViewType: SlideViewType
  paths: PathListItem[]
  selectedPathIds: string[]
  blueprintsByPathId: Map<string, BlueprintData>
  /** The scroll chrome the panel will have; see `getStackedComparePanelHeight`. */
  scrollChrome?: ComparePanelScrollChromeOptions
  compact?: boolean
  collapsedLaneIds?: ReadonlySet<string>
}

export function buildSideBySideLabelRowSpecs(
  blueprints: BlueprintData[],
  compact = false,
  collapsedLaneIds: ReadonlySet<string> = new Set(),
): BlueprintLabelRowSpec[] {
  const lanes = getCanonicalLanes(blueprints)
  const specs: BlueprintLabelRowSpec[] = []

  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    const lane = lanes[laneIndex]
    const collapsed = isBlueprintLaneCollapsed(lane.id, collapsedLaneIds)

    specs.push({
      key: lane.id,
      kind: 'lane',
      lane,
      label: lane.name,
      collapsed,
      height: collapsed
        ? COMPARE_LANE_COLLAPSED_HEIGHT
        : getSharedLaneRowHeight(lane, blueprints, compact),
      // The corridor rule is the single board's, asked of every compared
      // blueprint at once: the canonical row needs a corridor when any
      // variant's lane of that name does.
      wrapCorridorAbove:
        !collapsed && laneHasOverheadArrowCorridor(lane, blueprints),
      wrapCorridorBelow: !collapsed && laneHasWrapCorridorBelow(lane, lanes),
      inLaneLoopCorridorAbove:
        !collapsed && laneHasInLaneLoopCorridor(lane, blueprints),
      showDividerBelow: shouldShowLaneDividerAfter(lane, laneIndex, lanes),
    })

    if (!collapsed && laneHasInteractionLine(lane, lanes)) {
      specs.push({
        key: `${lane.id}-interaction`,
        kind: 'interaction',
        label: INTERACTION_LINE_LABEL,
        height: BLUEPRINT_DIVIDER_ROW_HEIGHT,
      })
    }

    if (!collapsed && laneHasVisibilityLine(lane, lanes)) {
      specs.push({
        key: `${lane.id}-visibility`,
        kind: 'visibility',
        label: VISIBILITY_LINE_LABEL,
        height: BLUEPRINT_DIVIDER_ROW_HEIGHT,
      })
    }

    if (!collapsed && laneHasInternalInteractionLine(lane, lanes)) {
      specs.push({
        key: `${lane.id}-internal-interaction`,
        kind: 'internalInteraction',
        label: INTERNAL_INTERACTION_LINE_LABEL,
        height: BLUEPRINT_DIVIDER_ROW_HEIGHT,
      })
    }
  }

  return specs
}

/** Shared row specs for scenario/phase compare panels. */
export function getScenarioSwimlaneRowSpecs(
  options: ScenarioSwimlaneLayoutInput,
): BlueprintLabelRowSpec[] {
  const {
    displayViewType,
    selectedPathIds,
    blueprintsByPathId,
    compact = false,
    collapsedLaneIds = new Set(),
  } = options

  // 'merged' shares the compare row anatomy — overview rows render it as
  // stacked anyway, and the focused stacked arrangement reuses these specs
  // per band.
  const useCompareLayout =
    (displayViewType === 'stacked' || displayViewType === 'merged') &&
    selectedPathIds.length > 0

  if (useCompareLayout) {
    const visibleBlueprints = itemsInSelectionOrder(selectedPathIds, (id) =>
      blueprintsByPathId.get(id),
    ).filter((blueprint): blueprint is BlueprintData => blueprint !== undefined)

    if (visibleBlueprints.length > 0) {
      return buildSideBySideLabelRowSpecs(
        visibleBlueprints,
        compact,
        collapsedLaneIds,
      )
    }
  }

  return []
}

export function getScenarioSwimlaneBodyHeight(
  options: ScenarioSwimlaneLayoutInput,
): number {
  const rows = getScenarioSwimlaneRowSpecs(options)
  if (rows.length === 0) return 0
  return getSwimlaneBodyHeightFromRowSpecs(rows)
}

export function getScenarioBlueprintPanelHeight(
  options: ScenarioSwimlaneLayoutInput,
): number {
  const visibleBlueprints = itemsInSelectionOrder(
    options.selectedPathIds,
    (id) => options.blueprintsByPathId.get(id),
  ).filter((blueprint): blueprint is BlueprintData => blueprint !== undefined)

  const scrollChrome = options.scrollChrome
  if (visibleBlueprints.length > 0 && options.displayViewType === 'stacked') {
    return getStackedComparePanelHeight(
      visibleBlueprints,
      options.compact,
      scrollChrome,
    )
  }
  if (visibleBlueprints.length > 1 && options.displayViewType === 'merged') {
    return getMergedComparePanelHeight(
      visibleBlueprints,
      options.compact,
      scrollChrome,
    )
  }
  if (visibleBlueprints.length > 0 && options.displayViewType === 'merged') {
    return getStackedComparePanelHeight(
      visibleBlueprints,
      options.compact,
      scrollChrome,
    )
  }

  const swimlaneBodyHeight = getScenarioSwimlaneBodyHeight(options)
  if (swimlaneBodyHeight > 0) {
    return getPanelHeightFromSwimlaneBody(swimlaneBodyHeight, scrollChrome)
  }

  return COMPARE_MIN_PANEL_HEIGHT
}

export function getCanonicalLanes(blueprints: BlueprintData[]): BlueprintLane[] {
  const source = blueprints[0]
  if (!source) return []
  return [...source.lanes].sort((a, b) => a.position - b.position)
}

export function getCompareCellShellMinHeight(
  rowHeight: number,
  compact = false,
): number {
  const shellFloor = compact
    ? BLUEPRINT_ROW_MIN_HEIGHT_COMPACT
    : BLUEPRINT_ROW_MIN_HEIGHT
  return Math.max(rowHeight, shellFloor)
}

/**
 * A compare row's track, priced by the one corridor rule. The spec's flag
 * names predate the rule's: `wrapCorridorAbove` is the overhead rail.
 */
export function getCompareRowTrackHeight(row: {
  height: number
  wrapCorridorAbove?: boolean
  wrapCorridorBelow?: boolean
  inLaneLoopCorridorAbove?: boolean
}): number {
  return rowTrackHeight(row.height, {
    overheadRailAbove: row.wrapCorridorAbove,
    wrapBelow: row.wrapCorridorBelow,
    inLaneLoopAbove: row.inLaneLoopCorridorAbove,
  })
}

export function getSharedLaneRowHeight(
  lane: BlueprintLane,
  blueprints: BlueprintData[],
  compact = false,
): number {
  if (blueprints.length === 0) return 0
  const shellPad = getCellShellPaddingY(compact)
  const contentHeight = Math.max(
    ...blueprints.map((blueprint) =>
      // Each path has its own lane uuids — measure against the path's own
      // lane, or every path but the first is measured as empty and the row
      // ends up shorter than what actually renders.
      getLaneRowMinHeight(
        resolveBlueprintLane(lane, blueprint),
        blueprint,
        compact,
      ),
    ),
  )
  return getCompareCellShellMinHeight(contentHeight + shellPad, compact)
}

/**
 * Lane rows must be able to GROW: the row shells are `overflow-visible`, so an
 * underestimated cell painted OVER the next lane instead of clipping — the
 * merged arrangement had the `minmax` fix (`getMergedCompareRowTrackCss`
 * below) while Stacked, the default view, kept a bare fixed track.
 * `minmax(Npx, auto)` keeps the estimated floor; rows only diverge from it
 * when content genuinely swells past it.
 */
export function getCompareRowTrackCss(row: CompareRowHeightSpec): string {
  return `minmax(${getCompareRowTrackHeight(row)}px, auto)`
}

export function getCompareCardWidth(
  stepCount: number,
  compact = false,
): number {
  const padding = compact ? COMPARE_CARD_PADDING_X * 2 : COMPARE_CARD_PADDING_X * 2 + 4
  return getStepColumnsWidth(stepCount) + padding
}

/** Full visual width of a divider band (label + gaps + path cards). */
export function getCompareDividerBandWidth(
  blueprints: BlueprintData[],
  compact = false,
): number {
  if (blueprints.length === 0) return COMPARE_LABEL_TRACK_WIDTH

  const cardsWidth = blueprints.reduce(
    (sum, blueprint) => sum + getCompareCardWidth(blueprint.steps.length, compact),
    0,
  )

  return (
    COMPARE_LABEL_TRACK_WIDTH +
    cardsWidth +
    blueprints.length * COMPARE_CARD_GAP
  )
}

export function getCompareGridBodyHeight(
  blueprints: BlueprintData[],
  compact = false,
  collapsedLaneIds: ReadonlySet<string> = new Set(),
): number {
  const rows = buildCompareRowSpecs(blueprints, compact, collapsedLaneIds)
  const trackHeights = rows.reduce(
    (sum, row) => sum + getCompareRowTrackHeight(row),
    0,
  )
  const bodyRowGaps = Math.max(0, rows.length - 1) * BLUEPRINT_LANE_ROW_GAP

  return (
    COMPARE_PATH_SECTION_TOP_INSET +
    trackHeights +
    bodyRowGaps +
    COMPARE_PATH_SECTION_BOTTOM_INSET
  )
}

export function getCompareGridWidth(
  blueprints: BlueprintData[],
  compact = false,
): number {
  if (blueprints.length === 0) return COMPARE_MIN_PANEL_WIDTH

  return (
    getCompareDividerBandWidth(blueprints, compact) +
    COMPARE_PANEL_PADDING +
    COMPARE_PANEL_PADDING_RIGHT
  )
}

export function getCompareGridHeight(
  blueprints: BlueprintData[],
  compact = false,
): number {
  if (blueprints.length === 0) return COMPARE_MIN_PANEL_HEIGHT
  return (
    getCompareGridBodyHeight(blueprints, compact) +
    COMPARE_PANEL_PADDING * 2
  )
}

/** Panel size including scroll padding so arrows and grid are not clipped. */
export function getComparePanelWidth(
  blueprints: BlueprintData[],
  compact = false,
): number {
  return (
    getCompareGridWidth(blueprints, compact) +
    ARROW_VIEWPORT_PAD * 2 +
    (COMPARE_PANEL_PADDING_RIGHT - COMPARE_PANEL_PADDING)
  )
}

export function getComparePanelHeight(
  blueprints: BlueprintData[],
  compact = false,
  /** See the note on `getStackedComparePanelHeight`. */
  scrollChrome?: ComparePanelScrollChromeOptions,
): number {
  return (
    getCompareGridHeight(blueprints, compact) +
    getComparePanelScrollPaddingY(scrollChrome)
  )
}

/* ---------------------------------------------------------------------------
 * Stacked arrangement (focused scenario view): one canonical step-column
 * axis, one full band per path stacked top-to-bottom. Estimates only — the
 * panel's measurement overrides once content renders.
 * ------------------------------------------------------------------------ */

/** Vertical gap between stacked path bands — room for both bands' section
 *  frame insets (20 + 20) plus the lower band's title badge overhang. */
export const COMPARE_STACKED_BAND_GAP = 64
/** Gap between the step-header row and the first band's rows. */
export const COMPARE_STACKED_HEADER_GAP = 36

/** One band's box height: its lane-row tracks plus the row gaps between them
 *  (section-frame insets live in the band gaps, not the band box). */
export function getStackedCompareBandBodyHeight(
  rows: SwimlaneRowSpec[],
): number {
  const trackHeights = rows.reduce(
    (sum, row) => sum + getCompareRowTrackHeight(row),
    0,
  )
  return trackHeights + Math.max(0, rows.length - 1) * BLUEPRINT_LANE_ROW_GAP
}

/** Stacked board width for a canonical column count: rail + step columns. */
export function getStackedCompareGridWidth(columnCount: number): number {
  return (
    COMPARE_LABEL_TRACK_WIDTH +
    STEP_COLUMN_GAP +
    getStepColumnsWidth(Math.max(1, columnCount)) +
    COMPARE_PANEL_PADDING +
    COMPARE_PANEL_PADDING_RIGHT
  )
}

export function getStackedCompareGridHeight(
  blueprints: BlueprintData[],
  compact = false,
  collapsedLaneIds: ReadonlySet<string> = new Set(),
): number {
  if (blueprints.length === 0) return COMPARE_MIN_PANEL_HEIGHT
  const rows = buildSideBySideLabelRowSpecs(blueprints, compact, collapsedLaneIds)
  const bandBody = getStackedCompareBandBodyHeight(rows)

  return (
    COMPARE_STEP_HEADER_HEIGHT +
    COMPARE_STACKED_HEADER_GAP +
    blueprints.length * bandBody +
    Math.max(0, blueprints.length - 1) * COMPARE_STACKED_BAND_GAP +
    COMPARE_PATH_SECTION_BOTTOM_INSET +
    COMPARE_PANEL_PADDING * 2
  )
}

export function getStackedComparePanelWidth(columnCount: number): number {
  return (
    getStackedCompareGridWidth(columnCount) +
    ARROW_VIEWPORT_PAD * 2 +
    (COMPARE_PANEL_PADDING_RIGHT - COMPARE_PANEL_PADDING)
  )
}

export function getStackedComparePanelHeight(
  blueprints: BlueprintData[],
  compact = false,
  /*
    The scroll chrome this panel will actually have. Defaulting it (rather
    than taking it) is what put 64px of dead gray under every board in an
    aligned phase row: those panels are height-locked and have no resize
    handle, so `getComparePanelScrollPaddingY()` with no options budgeted
    them a handle inset and an artboard buffer that never render. The
    measuring pass corrects it now either way, but a placeholder that is
    wrong by a constant still costs one bad pre-paint frame.
  */
  scrollChrome?: ComparePanelScrollChromeOptions,
): number {
  return (
    getStackedCompareGridHeight(blueprints, compact) +
    getComparePanelScrollPaddingY(scrollChrome)
  )
}

/* ---------------------------------------------------------------------------
 * Merged arrangement (focused scenario view): ONE band on the same canonical
 * step axis, whose slots swell vertically wherever the paths disagree.
 * ------------------------------------------------------------------------ */

/**
 * Merged lane rows must GROW: a divergent slot stacks one cell per path
 * inside a single row, so a fixed `Npx` track (what the stacked bands use)
 * would clip the swell. `minmax(Npx, auto)` keeps the shared floor — a lane
 * with no divergence measures exactly as it does in Stacked.
 */
export function getMergedCompareRowTrackCss(row: CompareRowHeightSpec): string {
  return `minmax(${getCompareRowTrackHeight(row)}px, auto)`
}

/**
 * Merged is about one band tall. The swell over divergent slots is
 * deliberately NOT estimated: the panel measures rendered content and the
 * measurement replaces this floor, and a hot estimate here would be dead
 * gray space on a board that happens to agree everywhere.
 */
export function getMergedCompareGridHeight(
  blueprints: BlueprintData[],
  compact = false,
  collapsedLaneIds: ReadonlySet<string> = new Set(),
): number {
  if (blueprints.length === 0) return COMPARE_MIN_PANEL_HEIGHT
  const rows = buildSideBySideLabelRowSpecs(blueprints, compact, collapsedLaneIds)

  return (
    COMPARE_STEP_HEADER_HEIGHT +
    COMPARE_STACKED_HEADER_GAP +
    getStackedCompareBandBodyHeight(rows) +
    COMPARE_PATH_SECTION_BOTTOM_INSET +
    COMPARE_PANEL_PADDING * 2
  )
}

export function getMergedComparePanelHeight(
  blueprints: BlueprintData[],
  compact = false,
  /** See the note on `getStackedComparePanelHeight`. */
  scrollChrome?: ComparePanelScrollChromeOptions,
): number {
  return (
    getMergedCompareGridHeight(blueprints, compact) +
    getComparePanelScrollPaddingY(scrollChrome)
  )
}

export function laneHasInteractionLine(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  return shouldShowInteractionLineAfter(lane, lanes)
}

export function laneHasVisibilityLine(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  return shouldShowVisibilityLineAfter(lane, lanes)
}

export function laneHasInternalInteractionLine(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  return shouldShowInternalInteractionLineAfter(lane, lanes)
}
