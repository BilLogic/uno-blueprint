import { parseCellContentItems } from '@/lib/parseCellContent'
import {
  BACKSTAGE_ACTIONS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  getLaneRole,
  isTouchpointLaneRole,
  STORYBOARD_ROLE,
  SUPPORT_ACTIONS_ROLE,
} from '@/lib/laneRoles'
import {
  BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN,
  BLUEPRINT_WRAP_CORRIDOR_MARGIN,
  laneHasInLaneLoopCorridor,
  laneHasOverheadArrowCorridor,
  rowTrackHeight,
} from '@/lib/laneCorridor'
import type { BlueprintData, BlueprintLane } from '@/types/blueprint'

/**
 * The corridor rule lives in `laneCorridor`; its margins are re-exported
 * here because the rails, the arrow geometry and the compare shell read
 * every layout number from this module.
 */
export {
  BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN,
  BLUEPRINT_WRAP_CORRIDOR_MARGIN,
}

/** Minimal lane shape for role-driven layout checks. */
type LaneRoleSource = { name: string; role?: string | null }

/** Roles rendered as storyboard frame rows instead of text cells. */
export const STORYBOARD_LANE_ROLES = [STORYBOARD_ROLE] as const

/** 192px inner face at 4:3 plus the service/compare shell's vertical padding. */
export const STORYBOARD_ROW_MIN_HEIGHT = 176
export const STORYBOARD_ROW_MIN_HEIGHT_COMPACT = 168

/**
 * The cell shell's vertical inset — the padding above and below a cell's
 * face in the service and compare grids. One number, pushed into the shell
 * as a style and summed here; the compare layout and the single board used
 * to each write `compact ? 24 : 32` for the pair.
 */
export function getCellShellInsetY(compact = false): number {
  return compact ? 12 : 16
}

/** Both insets: what the shell adds to a face's height. */
export function getCellShellPaddingY(compact = false): number {
  return getCellShellInsetY(compact) * 2
}

/** Max height for the storyboard cell button inside a swimlane row (excludes shell padding). */
export function getStoryboardCellButtonMaxHeight(compact = false): number {
  const rowHeight = compact
    ? STORYBOARD_ROW_MIN_HEIGHT_COMPACT
    : STORYBOARD_ROW_MIN_HEIGHT
  return rowHeight - getCellShellPaddingY(compact)
}

/**
 * Whether a lane's cells list one touchpoint per line rather than prose.
 *
 * The roles are `laneRoles`' — which rows hold touchpoints is what a row
 * MEANS, not how this module draws it — so this is the drawing question
 * asked of the one predicate. The walkthrough's roster asks the same
 * predicate a different question about the same rows.
 */
export function shouldUseTouchpointCellContent(lane: LaneRoleSource): boolean {
  return isTouchpointLaneRole(getLaneRole(lane))
}

/** Which face a lane's cells wear — touchpoint stack, storyboard, or plain cell. */
export type BlueprintCellVariant = 'default' | 'touchpoints' | 'storyboard'

/**
 * Whether a cell has anything to draw for its lane's variant. A storyboard
 * cell is decided by its frames upstream, a touchpoint cell by having at least
 * one parsable item, a plain cell by non-blank content.
 */
export function hasBlueprintCellContent(
  content: string | undefined,
  variant: BlueprintCellVariant,
): boolean {
  if (variant === 'storyboard') return true
  if (!content?.trim()) return false
  if (variant === 'touchpoints') {
    return parseCellContentItems(content).length > 0
  }
  return true
}

export function shouldUseStoryboardContent(lane: LaneRoleSource): boolean {
  const role = getLaneRole(lane)
  return (
    role !== null && (STORYBOARD_LANE_ROLES as readonly string[]).includes(role)
  )
}

/**
 * The interaction line closes the customer side, and the customer side is a
 * BAND rather than a single row.
 *
 * The rule used to be `getLaneRole(lane) === CUSTOMER_ACTIONS_ROLE` and
 * nothing else, which was right for exactly as long as every board had one
 * customer-side lane. Give a board a second one — a second actor row on the
 * customer's own side of the service — and that rule draws a line of
 * interaction after each of them. No service blueprint means two: the line is
 * the boundary between the people the service is for and the machinery that
 * serves them, and a boundary drawn twice is not a boundary.
 *
 * So the line follows the LAST customer-side lane. Adding a customer-side
 * lane extends the band; it does not divide the board again, and no row has
 * to move to make that true.
 *
 * Without `lanes` there is no band for a lane to be last in, so a
 * customer-side lane is its own band and answers as it always did. That is
 * the same shape `shouldShowVisibilityLineAfter` has, for the same reason.
 */
export function shouldShowInteractionLineAfter(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  if (getLaneRole(lane) !== CUSTOMER_ACTIONS_ROLE) return false
  if (!lanes) return true

  let last: BlueprintLane | undefined
  for (const entry of lanes) {
    if (getLaneRole(entry) === CUSTOMER_ACTIONS_ROLE) last = entry
  }
  return last === undefined || last.id === lane.id
}

/** The visibility line is drawn after frontstage lanes (above backstage lanes). */
export function shouldShowVisibilityLineAfter(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  const role = getLaneRole(lane)
  if (role !== FRONTSTAGE_ACTIONS_ROLE && role !== FRONTSTAGE_TOUCHPOINTS_ROLE) {
    return false
  }

  // A frontstage-touchpoints lane can sit above frontstage actions — the
  // visibility line follows the actions lane, not the touchpoints lane.
  if (role === FRONTSTAGE_TOUCHPOINTS_ROLE && lanes) {
    const index = lanes.findIndex((entry) => entry.id === lane.id)
    const next = lanes[index + 1]
    if (next && getLaneRole(next) === FRONTSTAGE_ACTIONS_ROLE) {
      return false
    }
  }

  return true
}

/**
 * Support handoff lanes, which sit below backstage actions.
 *
 * This used to compare `lane.name` against two English strings, as a fallback
 * for lanes carrying no role. `lanes.name` is free-form in any language, so
 * renaming or translating one deleted a divider from the board with nothing
 * reporting it — and a template cannot key its layout off the label one
 * deployment happens to use.
 *
 * The role is the whole test now. A board whose rows predate `lane_role`
 * still resolves through `LEGACY_NAME_TO_ROLE`, which every lane in the
 * hand-written fallback blueprints already goes through, so a name can still
 * stand in for a missing role — in exactly one declared place, rather than in
 * a comparison local to this file that no other divider had.
 */
function isSupportHandoffLane(lane: LaneRoleSource): boolean {
  return getLaneRole(lane) === SUPPORT_ACTIONS_ROLE
}

/**
 * The internal interaction line marks the hand-off from backstage actions to
 * support systems / support actions, so it draws after a backstage-actions
 * lane only when a support handoff lane follows.
 */
export function shouldShowInternalInteractionLineAfter(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  if (getLaneRole(lane) !== BACKSTAGE_ACTIONS_ROLE) return false
  if (!lanes) return false
  const index = lanes.findIndex((entry) => entry.id === lane.id)
  const next = lanes[index + 1]
  return next !== undefined && isSupportHandoffLane(next)
}

/** Light rule between swim lanes; omitted before interaction/visibility dividers. */
export function shouldShowLaneDividerAfter(
  lane: BlueprintLane,
  laneIndex: number,
  lanes: BlueprintLane[],
): boolean {
  if (laneIndex >= lanes.length - 1) return false
  if (shouldShowInteractionLineAfter(lane, lanes)) return false
  if (shouldShowVisibilityLineAfter(lane, lanes)) return false
  if (shouldShowInternalInteractionLineAfter(lane, lanes)) return false
  return true
}

/** Lane row is immediately followed by a blueprint divider band. */
export function lanePrecedesBlueprintDivider(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  return (
    shouldShowInteractionLineAfter(lane, lanes) ||
    shouldShowVisibilityLineAfter(lane, lanes) ||
    shouldShowInternalInteractionLineAfter(lane, lanes)
  )
}

// Service-blueprint canon: the dividers are the "line of …" boundaries.
// Sentence case in the string itself: no label is capitalised by CSS.
export const INTERACTION_LINE_LABEL = 'Line of interaction'
export const VISIBILITY_LINE_LABEL = 'Line of visibility'
export const INTERNAL_INTERACTION_LINE_LABEL = 'Line of internal interaction'

export const BLUEPRINT_DIVIDER_ROW_HEIGHT = 28
/** Right inset so interaction / visibility lines stop before the board edge. */
export const BLUEPRINT_DIVIDER_LINE_END_INSET = 16
/**
 * Does a corridor open UNDER this lane row? Only the row the line of
 * interaction is drawn after has one: the standard blueprint already leaves a
 * band between that row and the line, and backward loops on it are routed
 * through the band rather than over the cells.
 *
 * That is why `lanes` matters here rather than being a convenience. The
 * corridor's reason for existing is the gap under the line, so it belongs to
 * the lane the line follows — the LAST customer-side lane — and not to every
 * lane on the customer side. Ask without the board and a customer-side lane
 * in the middle of the band is told it has a corridor under it, which opens
 * BLUEPRINT_WRAP_CORRIDOR_MARGIN of space beneath a row that has no line
 * beneath it.
 */
export function laneHasWrapCorridorBelow(
  lane: BlueprintLane,
  lanes?: BlueprintLane[],
): boolean {
  return shouldShowInteractionLineAfter(lane, lanes)
}

export function countBlueprintDividerRows(lanes: BlueprintLane[]): number {
  return lanes.filter(
    (lane) =>
      shouldShowInteractionLineAfter(lane, lanes) ||
      shouldShowVisibilityLineAfter(lane, lanes) ||
      shouldShowInternalInteractionLineAfter(lane, lanes),
  ).length
}

/**
 * The divider count above is read as HEIGHT — multiplied by
 * BLUEPRINT_DIVIDER_ROW_HEIGHT — so a count that disagrees with what the
 * renderer draws is a grid taller than its own contents by exactly the rows
 * it over-counted. It therefore has to ask the question the renderer asks,
 * board and all. The wrap corridor is priced per lane through the corridor
 * rule's row track now; the count below is kept for the tests that hold the
 * band's floor to one corridor.
 */
export function countBlueprintWrapCorridorMargins(
  lanes: BlueprintLane[],
): number {
  return lanes.filter((lane) => laneHasWrapCorridorBelow(lane, lanes)).length
}

export const LANE_COLUMN_WIDTH = 220
export const STEP_COLUMN_WIDTH = 220
/** Visible space between step columns where dependency arrows are drawn. */
export const STEP_COLUMN_GAP = 24
/** Left gutter on the white board so the play control clears storyboard cells. */
export const STORYBOARD_PLAY_GUTTER = 28

export function getStepColumnLeft(stepIndex: number): number {
  return LANE_COLUMN_WIDTH + stepIndex * (STEP_COLUMN_WIDTH + STEP_COLUMN_GAP)
}

export function getStepColumnRight(stepIndex: number): number {
  return getStepColumnLeft(stepIndex) + STEP_COLUMN_WIDTH
}

export function getStepColumnsWidth(stepCount: number): number {
  if (stepCount <= 0) return 0
  const gaps = Math.max(0, stepCount - 1)
  return stepCount * STEP_COLUMN_WIDTH + gaps * STEP_COLUMN_GAP
}

export const BLUEPRINT_ROW_MIN_HEIGHT = 96
/** Used only when fitVertically compresses rows into a fixed artboard. */
export const BLUEPRINT_ROW_MIN_HEIGHT_COMPACT = 60
export const BLUEPRINT_PADDING = 24
export const BLUEPRINT_HEADER_HEIGHT = 48
export const BLUEPRINT_HEADER_HEIGHT_COMPACT = 32
/** Gap between swim lanes and dividers (0 — lane borders handle separation). */
export const BLUEPRINT_LANE_ROW_GAP = 0
/** Padding around the grid body for arrow overlay bleed (matches ARROW_VIEWPORT_PAD). */
export const BLUEPRINT_GRID_VIEWPORT_PAD = 13
/** Artboard inner wrapper (p-2; formerly CanvasBlueprintArtboard). */
export const BLUEPRINT_CANVAS_INNER_PADDING = 16
/** mb-2 below the compact path header row. */
export const BLUEPRINT_COMPACT_HEADER_GAP = 8
/** Scroll container border (1px each side). */
export const BLUEPRINT_CANVAS_SCROLL_BORDER = 2
/** Safety margin for wrapped cell text on canvas artboards. */
export const BLUEPRINT_ARTBOARD_HEIGHT_BUFFER = 32
/** Safety margin for horizontal grid bleed on canvas artboards. */
export const BLUEPRINT_ARTBOARD_WIDTH_BUFFER = 32

/**
 * Half the hit target for an insert affordance, on BOTH axes.
 *
 * The line drawn is 1px; the target is 16. That gap is the whole difference
 * between an affordance people use and one they fight, and it is what Figma's
 * row/column inserts do — the visible mark is a hairline, the thing you have
 * to hit is a finger's width.
 *
 * Declared here because it was declared separately in BlueprintColumnHandles
 * and BlueprintLaneHandles, same name and same value in two files — so a
 * column insert 8px wide beside a lane insert 10px tall was a bug nothing
 * would have caught.
 */
export const BLUEPRINT_INSERT_HIT_HALF = 8

/** Outer gutter around each cell (Tailwind p-3 ≈ 12px per side). */
export const BLUEPRINT_CELL_GUTTER = 12
/** Default cell inner content padding (px-4 py-3). */
export const BLUEPRINT_CELL_INNER_X = 16
export const BLUEPRINT_CELL_INNER_Y = 12

/**
 * Tailwind spacing class for a pixel measure on the 4px grid.
 *
 * @param prefix - Axis of the utility (`px` or `py`)
 * @param px - Pixel value owned by the layout engine
 * @returns The matching spacing utility
 */
function spacingClass(prefix: 'px' | 'py', px: number): string {
  return `${prefix}-${px / 4}`
}

/** Painted inner padding — derived from the layout constants so paint and geometry cannot disagree. */
export const BLUEPRINT_CELL_INNER_X_CLASS = spacingClass(
  'px',
  BLUEPRINT_CELL_INNER_X,
)
export const BLUEPRINT_CELL_INNER_Y_CLASS = spacingClass(
  'py',
  BLUEPRINT_CELL_INNER_Y,
)

/** Stable canvas face for narrative cells; complete prose lives in detail. */
export const NARRATIVE_CELL_HEIGHT = 128
export const NARRATIVE_CELL_HEIGHT_COMPACT = 96
/** Stable technology face; two label lines fit without changing row geometry. */
export const TOUCHPOINT_ITEM_HEIGHT = 52
export const TOUCHPOINT_ITEM_HEIGHT_COMPACT = 42
const TOUCHPOINT_STACK_GAP = 10
const TOUCHPOINT_CELL_PADDING = BLUEPRINT_CELL_GUTTER * 2

/** Compare / service grid cell inner width — the box TEXT actually wraps
 * in: column minus the shell's padding AND the cell button's own chrome
 * (its `px-4` + borders). Counting only the shell overstated the text box
 * by ~34px, so the line-count estimate undershot and tall cells overflowed
 * their fixed row tracks. */
export function getBlueprintCellInnerWidth(compact = false): number {
  const shellPadX = compact ? 24 : 28
  const buttonChromeX = compact ? 26 : 34
  return STEP_COLUMN_WIDTH - shellPadX - buttonChromeX
}

/** East-Asian full-width codepoints render ~2× the width of a Latin glyph.
 * Counting them as 1 char makes the line-count estimate undershoot for CJK
 * content, so tall cells overflow their fixed row track and collide with the
 * divider line below. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, Kangxi, CJK punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+
  )
}

/** Display width of a line in half-width units (CJK glyphs count as 2). */
function lineDisplayWidth(line: string): number {
  let width = 0
  for (const ch of line) {
    width += isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1
  }
  return width
}

/** Greedy word-wrap simulation: words move to the next line whole, so a
 * paragraph costs 15-20% more lines than `chars ÷ chars-per-line` claims —
 * the naive division was one of the three undershoots that let tall cells
 * cross their lane band. Words longer than a line fill whole lines,
 * matching the browser's overflow-wrap behaviour. */
function countWrappedLines(line: string, charsPerLine: number): number {
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  let lines = 1
  let used = 0
  for (const word of words) {
    let width = lineDisplayWidth(word)
    const separator = used > 0 ? 1 : 0
    if (used + separator + width <= charsPerLine) {
      used += separator + width
      continue
    }
    lines += 1
    while (width > charsPerLine) {
      width -= charsPerLine
      lines += 1
    }
    used = width
  }
  return lines
}

/** Line count including soft-wrap at the blueprint column width. */
export function getEffectiveLineCount(content: string, compact = false): number {
  const innerWidth = getBlueprintCellInnerWidth(compact)
  // 8px average glyph (space included) for text-sm — deliberately a shade
  // conservative: the estimate is a FLOOR under overflow-visible rows, and
  // an undershoot bleeds into the lane below while an overshoot just airs
  // the row out. Measured against the real 257-char worst case.
  const charWidth = compact ? 6.5 : 8
  const charsPerLine = Math.max(6, Math.floor(innerWidth / charWidth))

  return content.split('\n').reduce((total, line) => {
    if (line.length === 0) return total + 1
    return total + countWrappedLines(line, charsPerLine)
  }, 0)
}

export function getMaxTouchpointCountInLane(
  data: BlueprintData,
  laneId: string,
): number {
  // Summed per *slot*, not maxed per cell: since the split a slot holds one
  // cell per touchpoint, and a row sized to the tallest single cell would be
  // one touchpoint tall over a stack of three.
  //
  // Placements where the cell has them, the text where it does not — the same
  // reading `getTouchpointNames` does, because this count has to agree with
  // the list that gets drawn. A name-only placement is a face the text never
  // names, and a stack sized from the text alone would clip it.
  const perStep = new Map<string, number>()
  for (const cell of data.cells) {
    if (cell.lane_id !== laneId) continue
    const count = cell.touchpoints?.length
      ? cell.touchpoints.length
      : cell.content?.trim()
        ? parseCellContentItems(cell.content).length
        : 0
    if (count > 0) perStep.set(cell.step_id, (perStep.get(cell.step_id) ?? 0) + count)
  }
  let max = 0
  for (const total of perStep.values()) max = Math.max(max, total)
  return max
}

export function getTouchpointStackMinHeight(
  touchpointCount: number,
  compact = false,
): number {
  if (touchpointCount <= 0) return 0
  const itemHeight = compact ? TOUCHPOINT_ITEM_HEIGHT_COMPACT : TOUCHPOINT_ITEM_HEIGHT
  return (
    TOUCHPOINT_CELL_PADDING +
    touchpointCount * itemHeight +
    Math.max(0, touchpointCount - 1) * TOUCHPOINT_STACK_GAP
  )
}

/** Minimum inner content height for a single cell (excludes compare shell padding). */
export function getCellContentMinHeight(
  lane: BlueprintLane,
  content: string | undefined,
  compact = false,
): number {
  if (shouldUseStoryboardContent(lane)) {
    return compact
      ? STORYBOARD_ROW_MIN_HEIGHT_COMPACT
      : STORYBOARD_ROW_MIN_HEIGHT
  }

  if (!content?.trim()) return 0

  if (shouldUseTouchpointCellContent(lane)) {
    return getTouchpointStackMinHeight(
      parseCellContentItems(content).length,
      compact,
    )
  }

  return compact ? NARRATIVE_CELL_HEIGHT_COMPACT : NARRATIVE_CELL_HEIGHT
}

function getDefaultCellMinHeight(
  _lane: BlueprintLane,
  _data: BlueprintData,
  compact = false,
): number {
  const faceHeight = compact
    ? NARRATIVE_CELL_HEIGHT_COMPACT
    : NARRATIVE_CELL_HEIGHT
  return faceHeight + getCellShellPaddingY(compact)
}

export function getLaneRowMinHeight(
  lane: BlueprintLane,
  data: BlueprintData,
  compact = false,
  options?: { fitVertically?: boolean },
): number {
  const fitVertically = options?.fitVertically ?? false
  const base = fitVertically && compact
    ? BLUEPRINT_ROW_MIN_HEIGHT_COMPACT
    : getDefaultCellMinHeight(lane, data, compact)

  if (shouldUseStoryboardContent(lane)) {
    return compact
      ? STORYBOARD_ROW_MIN_HEIGHT_COMPACT
      : STORYBOARD_ROW_MIN_HEIGHT
  }

  if (!shouldUseTouchpointCellContent(lane)) return base

  const touchpointCount = getMaxTouchpointCountInLane(data, lane.id)
  return Math.max(base, getTouchpointStackMinHeight(touchpointCount, compact))
}

export function getBlueprintGridMinHeight(
  data: BlueprintData,
  options?: { compact?: boolean; includeHeader?: boolean },
): number {
  const { compact = false, includeHeader = true } = options ?? {}
  const header = compact ? BLUEPRINT_HEADER_HEIGHT_COMPACT : BLUEPRINT_HEADER_HEIGHT
  const dividers =
    countBlueprintDividerRows(data.lanes) * BLUEPRINT_DIVIDER_ROW_HEIGHT
  // Each lane's row track — its height plus the corridors it reserves —
  // priced by the one rule the compare layout prices its rows with.
  const laneRows = data.lanes.reduce(
    (sum, lane) =>
      sum +
      rowTrackHeight(getLaneRowMinHeight(lane, data, compact), {
        overheadRailAbove: laneHasOverheadArrowCorridor(lane, data),
        inLaneLoopAbove: laneHasInLaneLoopCorridor(lane, data),
        wrapBelow: laneHasWrapCorridorBelow(lane, data.lanes),
      }),
    0,
  )
  const rowCount =
    data.lanes.length + countBlueprintDividerRows(data.lanes)
  const rowGaps = Math.max(0, rowCount - 1) * BLUEPRINT_LANE_ROW_GAP
  return (includeHeader ? header : 0) + laneRows + dividers + rowGaps
}

/** Gap between side-by-side blueprint grids on canvas. */
export const BLUEPRINT_CANVAS_COMPARE_GAP = 24
/** @deprecated Use BLUEPRINT_CANVAS_COMPARE_GAP */
export const BLUEPRINT_CANVAS_STACK_GAP = BLUEPRINT_CANVAS_COMPARE_GAP
/** PathMultiSelect fieldset + legend on canvas artboards. */
export const BLUEPRINT_PATH_FILTER_HEIGHT = 72
/** Scenario slide header in stack view (title, summary, controls). */
export const BLUEPRINT_SCENARIO_HEADER_HEIGHT = 220
/** Compact scenario header on canvas artboards. */
export const BLUEPRINT_SCENARIO_HEADER_HEIGHT_COMPACT = 200

export type ArtboardSize = { width: number; height: number }

export function getBlueprintGridMinWidth(stepCount: number): number {
  return LANE_COLUMN_WIDTH + getStepColumnsWidth(stepCount)
}

/** Pixel width of a compact blueprint grid (excluding artboard wrapper padding). */
export function getBlueprintCompactGridWidth(stepCount: number): number {
  return (
    getBlueprintGridMinWidth(stepCount) +
    BLUEPRINT_GRID_VIEWPORT_PAD * 2 +
    BLUEPRINT_CANVAS_SCROLL_BORDER
  )
}

/** Pixel height of a compact blueprint grid (excluding artboard wrapper padding). */
export function getBlueprintCompactGridHeight(data: BlueprintData): number {
  const header = BLUEPRINT_HEADER_HEIGHT_COMPACT + BLUEPRINT_COMPACT_HEADER_GAP
  const gridBody = getBlueprintGridMinHeight(data, {
    compact: true,
    includeHeader: false,
  })
  const scrollArea =
    gridBody + BLUEPRINT_GRID_VIEWPORT_PAD * 2 + BLUEPRINT_CANVAS_SCROLL_BORDER

  return header + scrollArea
}

/** Canvas artboard size sized to fit the full compact blueprint grid. */
export function getBlueprintArtboardSize(data: BlueprintData): ArtboardSize {
  const width =
    getBlueprintCompactGridWidth(data.steps.length) +
    BLUEPRINT_CANVAS_INNER_PADDING * 2 +
    BLUEPRINT_ARTBOARD_WIDTH_BUFFER
  const height = Math.max(
    480,
    getBlueprintCompactGridHeight(data) +
      BLUEPRINT_CANVAS_INNER_PADDING * 2 +
      BLUEPRINT_ARTBOARD_HEIGHT_BUFFER,
  )
  return { width, height }
}

/** Canvas artboard size for multiple side-by-side compact grids (a path compare). */
export function getStackedCanvasArtboardSize(
  blueprints: BlueprintData[],
  options?: {
    includeScenarioHeader?: boolean
    compact?: boolean
  },
): ArtboardSize {
  if (blueprints.length === 0) {
    return { width: 960, height: 540 }
  }

  const includeScenarioHeader = options?.includeScenarioHeader ?? false
  const compact = options?.compact ?? false
  const headerHeight = includeScenarioHeader
    ? compact
      ? BLUEPRINT_SCENARIO_HEADER_HEIGHT_COMPACT
      : BLUEPRINT_SCENARIO_HEADER_HEIGHT
    : 0
  const gridWidths = blueprints.map(
    (data) =>
      getBlueprintCompactGridWidth(data.steps.length) +
      BLUEPRINT_CANVAS_INNER_PADDING,
  )
  const gridHeights = blueprints.map(
    (data) =>
      getBlueprintCompactGridHeight(data) + BLUEPRINT_CANVAS_INNER_PADDING,
  )

  const width = Math.max(
    ...blueprints.map(
      (data) =>
        getBlueprintCompactGridWidth(data.steps.length) +
        BLUEPRINT_CANVAS_INNER_PADDING +
        BLUEPRINT_ARTBOARD_WIDTH_BUFFER,
    ),
    compact && includeScenarioHeader ? 420 : 0,
  )

  const compareGapTotal =
    Math.max(0, blueprints.length - 1) * BLUEPRINT_CANVAS_COMPARE_GAP
  const stackedGridWidth =
    gridWidths.reduce((sum, gridWidth) => sum + gridWidth, 0) + compareGapTotal

  const totalWidth =
    Math.max(width, stackedGridWidth) +
    BLUEPRINT_CANVAS_INNER_PADDING +
    BLUEPRINT_ARTBOARD_WIDTH_BUFFER

  const filterHeight = headerHeight
  const height = Math.max(
    480,
    filterHeight +
      Math.max(...gridHeights) +
      BLUEPRINT_CANVAS_INNER_PADDING * 2 +
      BLUEPRINT_ARTBOARD_HEIGHT_BUFFER,
  )

  return { width: totalWidth, height }
}
