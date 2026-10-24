import { StructureDragGrip } from './StructureDragGrip'
import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'
import { highlightStructure } from './structureHighlight'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import { useStructureRename } from './useStructureRename'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  BlueprintDividerRailLabel,
  BlueprintDividerRule,
} from '@/components/blueprint/BlueprintDividerBadge'
import { LaneCollapseToggle } from '@/components/blueprint/LaneCollapseToggle'
import {
  BLUEPRINT_DIVIDER_ROW_HEIGHT,
  BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN,
  BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  BLUEPRINT_WRAP_CORRIDOR_MARGIN,
} from '@/lib/blueprintLayout'
import { BLUEPRINT_LANE_COLLAPSE_ENABLED } from '@/lib/blueprintLaneCollapse'
import {
  COMPARE_LABEL_WIDTH,
  COMPARE_PATH_SECTION_H_INSET,
  type BlueprintLabelRowSpec,
} from '@/lib/sideBySideCompareLayout'
import { SERVICE_PATH_SECTION_INSET } from '@/components/blueprint/ComparePathSectionFrame'
import {
  BLUEPRINT_THEME,
  blueprintPanelLabelRailColor,
  getBlueprintLabelSection,
  getBlueprintLabelTextColor,
} from '@/lib/blueprintTheme'
import {
  BLUEPRINT_SLOT_INSET,
  BLUEPRINT_SLOT_INSET_COMPACT,
  CANVAS_HEADER_TEXT,
  CANVAS_HEADER_STATE,
} from '@/lib/canvasHeaderStyle'
import { cn } from '@/lib/utils'
import type { BlueprintLane } from '@/types/blueprint'
import type { CSSProperties } from 'react'

export type { BlueprintLabelRowSpec }

/** Opaque rail behind sticky labels so scrolled content cannot show through row gaps. */
export function BlueprintStickyLabelBackdrop({
  rowCount,
  rowStart = 1,
  bleedTop = 0,
  bleedBottom = 0,
  bleedLeft = 0,
}: {
  rowCount: number
  rowStart?: number
  /**
   * Extend the rail past the row tracks (px) so it meets the section
   * frame's INNER edges (stop short of the border — the rail must never
   * paint over it) instead of leaving white L-gaps inside the frame — the
   * band's rows do not include the frame insets.
   */
  bleedTop?: number
  bleedBottom?: number
  bleedLeft?: number
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none sticky z-35"
      style={{
        gridColumn: 1,
        gridRow: `${rowStart} / ${rowCount + rowStart}`,
        width: COMPARE_LABEL_WIDTH + bleedLeft,
        alignSelf: 'stretch',
        left: bleedLeft > 0 ? -bleedLeft : 0,
        marginLeft: bleedLeft > 0 ? -bleedLeft : undefined,
        marginTop: bleedTop > 0 ? -bleedTop : undefined,
        marginBottom: bleedBottom > 0 ? -bleedBottom : undefined,
        // The frame's inner corner is rounded; a square gray corner poking
        // into it reads as a layering bug.
        borderBottomLeftRadius:
          bleedLeft > 0 && bleedBottom > 0 ? 9 : undefined,
        backgroundColor: blueprintPanelLabelRailColor(),
      }}
    />
  )
}

/** Full-width 1px rule at the bottom of a swim-lane grid row.
 * Starts at column 2 so it stays inside path boards and does not leak
 * across the label rail / card-gap gutter outside the section frame.
 */
export function BlueprintSwimLaneDivider({ rowIndex }: { rowIndex: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-5 justify-self-stretch"
      style={{
        gridColumn: '2 / -1',
        gridRow: rowIndex + 1,
        alignSelf: 'end',
        height: 1,
        backgroundColor: BLUEPRINT_THEME.laneDivider,
      }}
    />
  )
}

/**
 * How far a divider rule runs PAST the path outline it crosses.
 *
 * A line of interaction is a property of the whole blueprint, not of one
 * path's box: it starts at its caption in the rail, crosses the outline, and
 * carries on out the other side. Stopping it inside the frame made three
 * lines that each looked like a stray dash floating in a card.
 */
const DIVIDER_RULE_BLEED = 12
export const COMPARE_DIVIDER_RULE_OVERHANG =
  COMPARE_PATH_SECTION_H_INSET + DIVIDER_RULE_BLEED
/**
 * The same formula, not the same number. It was written out as `20` — the
 * addition already done by hand — so changing SERVICE_PATH_SECTION_INSET moved
 * the compare rule and silently left the service one behind.
 */
export const SERVICE_DIVIDER_RULE_OVERHANG =
  SERVICE_PATH_SECTION_INSET + DIVIDER_RULE_BLEED

/** Interaction / visibility row — caption in the rail, rule straight across. */
export function BlueprintDividerRow({
  rowIndex,
  label,
  lineStyle,
  labelWidth = COMPARE_LABEL_WIDTH,
  ruleOverhang = COMPARE_DIVIDER_RULE_OVERHANG,
  labelRailBg,
  className,
  style,
}: {
  rowIndex?: number
  label: string
  lineStyle: 'dashed' | 'dotted' | 'solid'
  /** Painted width of the rail — the grey the caption sits on. */
  labelWidth?: number
  /** How far past the row's right edge the rule runs, clearing the outline. */
  ruleOverhang?: number
  /**
   * Rail fill, for the arrangements that have no backdrop behind this row.
   *
   * Undefined by default, and that is the point. In the compare grids
   * `BlueprintStickyLabelBackdrop` already paints this column across every
   * row — divider rows included — so a second coat of the identical colour
   * here does the same thing it did on the lane rows: the patch lands on
   * fractional coordinates under the canvas transform and the browser
   * antialiases a one-pixel seam in the exact shape of the divider row. The
   * service grid is a flex column with no backdrop, so it passes its own.
   */
  labelRailBg?: string
  className?: string
  style?: CSSProperties
}) {
  const gridPlacement: CSSProperties =
    rowIndex != null ? { gridColumn: '1 / -1', gridRow: rowIndex + 1 } : {}

  const dividerKind =
    lineStyle === 'dashed'
      ? 'interaction'
      : lineStyle === 'dotted'
      ? 'internal-interaction'
      : 'visibility'

  return (
    <div
      role="separator"
      aria-label={label}
      data-blueprint-divider={dividerKind}
      className={cn('relative z-45 min-w-0', className)}
      style={{
        ...gridPlacement,
        ...style,
        height: BLUEPRINT_DIVIDER_ROW_HEIGHT,
      }}
    >
      {labelRailBg ? (
        <div
          aria-hidden
          className="sticky left-0 top-0 z-0"
          style={{
            width: labelWidth,
            height: BLUEPRINT_DIVIDER_ROW_HEIGHT,
            backgroundColor: labelRailBg,
          }}
        />
      ) : null}
      {/* Caption and rule in ONE row, so the line begins where the words end
          — the two are one object and had drifted into two.

          NO left inset, deliberately, and it is the one row in this column
          that gets none. A lane label is a label IN the rail, so it sits
          inside the rail's padding. A line of interaction is not: it names a
          boundary of the whole blueprint, starts at the far edge, and runs
          out past the path outline. Insetting it bought nothing and spent
          14px of the room its longest caption needs before the board. */}
      <div
        className="absolute inset-y-0 left-0 z-10 flex items-center"
        style={{ right: -ruleOverhang }}
      >
        <BlueprintDividerRailLabel label={label} />
        <BlueprintDividerRule
          lineStyle={lineStyle}
          className="ml-2 min-w-0 flex-1"
        />
      </div>
    </div>
  )
}

import { EntityPropertiesButton } from '@/components/blueprint/EntityPropertiesButton'
import { LaneHeaderAffordance } from '@/components/blueprint/LaneHeaderAffordance'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { cellsInLane } from '@/lib/canvasCellQuery'

/** One row of the left label column — a lane name plus its collapse toggle. */
export function BlueprintLabelRow({
  row,
  lanes,
  style,
  compact,
  onToggleLane,
}: {
  row: BlueprintLabelRowSpec
  lanes: BlueprintLane[]
  style?: CSSProperties
  compact?: boolean
  onToggleLane?: (laneId: string) => void
}) {
  // Hooks first: this component returns early for divider rows, and a hook
  // after that return would run in a different order between row kinds.
  //
  // In Design mode the lane label becomes a selection handle — clicking takes
  // the whole lane, shift-clicking adds it to what is already picked. Inert in
  // View, so reading the blueprint is untouched.
  const selection = useEntityDetailOptional()?.selection
  const canvasMode = useCanvasModeValue()
  const pick = useCellPick()
  const laneId = row.kind === 'lane' ? row.lane?.id ?? null : null
  const cameraScale = useCanvasScale()
  const laneSelectable =
    canvasMode === 'design' &&
    pick !== null &&
    laneId !== null &&
    laneId !== STRUCTURE_PLACEHOLDER_ID
  const selectLane = (event: ReactMouseEvent<HTMLElement>) => {
    if (!laneSelectable || laneId === null) return
    const cells = cellsInLane(laneId)
    if (cells.length === 0) return
    event.stopPropagation()
    // Add, not toggle: a lane that is already half-picked should end up wholly
    // picked. Shift takes the lane back out.
    pick.pickMany(cells, event.shiftKey ? 'toggle' : 'add')
  }

  const isDivider =
    row.kind === 'interaction' ||
    row.kind === 'visibility' ||
    row.kind === 'internalInteraction'
  if (isDivider) return null
  if (row.lane?.seamSize !== undefined) return <div aria-hidden style={style} />

  const corridorAbove = row.wrapCorridorAbove
    ? BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN
    : 0
  const corridorBelow = row.wrapCorridorBelow
    ? BLUEPRINT_WRAP_CORRIDOR_MARGIN
    : 0
  const inLaneLoopCorridorAbove = row.inLaneLoopCorridorAbove
    ? BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN
    : 0

  const labelColor =
    row.lane != null
      ? getBlueprintLabelTextColor(getBlueprintLabelSection(row.lane, lanes))
      : BLUEPRINT_THEME.headerText

  return (
    <div
      data-structure-lane-label={laneId ?? undefined}
      role={laneId === STRUCTURE_PLACEHOLDER_ID ? 'status' : undefined}
      aria-label={
        laneId === STRUCTURE_PLACEHOLDER_ID ? 'New lane position' : undefined
      }
      data-structure-placeholder={
        laneId === STRUCTURE_PLACEHOLDER_ID ? '' : undefined
      }
      className={cn(
        'pointer-events-none [&_button]:pointer-events-auto sticky left-0 isolate flex h-full min-h-0 flex-col overflow-hidden',
        // No right border. The rail already reads as its own column through
        // its fill, and the hairline landed a few pixels from the path
        // section's own outline — two vertical lines describing one edge.
        'z-40',
      )}
      /*
        NO BACKGROUND HERE.

        `BlueprintStickyLabelBackdrop` already paints this column, edge to
        edge, for every row at once — and it is rendered by the same branch
        that renders these rows, so it is never absent when they are present.
        A second coat of the identical colour is not invisible: the row's box
        lands on fractional coordinates under the canvas transform (353.31,
        413.51), so the browser antialiases its edge against the surface
        behind it and paints a one-pixel seam in the exact shape of the row.
        Three coats of one colour, and the only thing the extra two produce is
        a hairline rectangle around every lane.
      */
      style={{
        ...style,
        width: COMPARE_LABEL_WIDTH,
      }}
    >
      {corridorAbove > 0 && (
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: corridorAbove }}
        />
      )}
      {inLaneLoopCorridorAbove > 0 && (
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: inLaneLoopCorridorAbove }}
        />
      )}
      <div
        data-open={selection?.kind === 'lane' && selection.id === laneId ? '' : undefined}
        onPointerEnter={(event) => {
          if (laneSelectable)
            highlightStructure(event.currentTarget, 'lane', row.label, true)
        }}
        onPointerLeave={(event) => {
          if (laneSelectable)
            highlightStructure(event.currentTarget, 'lane', row.label, false)
        }}
        onFocusCapture={(event) => {
          if (laneSelectable)
            highlightStructure(event.currentTarget, 'lane', row.label, true)
        }}
        onBlurCapture={(event) => {
          if (
            laneSelectable &&
            !event.currentTarget.contains(event.relatedTarget as Node)
          )
            highlightStructure(event.currentTarget, 'lane', row.label, false)
        }}
        className={cn(
          // The label's inset is the cell slot's inset — same token, both
          // edges. Asymmetric padding here (`pl-5 pr-3`) put the lane's name
          // on a different rhythm from the cells it names, and the two
          // numbers lived in different files with nothing holding them
          // together.
          'group/lane-header relative flex min-h-0 flex-1 items-start gap-2',
          compact ? BLUEPRINT_SLOT_INSET_COMPACT : BLUEPRINT_SLOT_INSET,
          // Bottom padding to match the top: the block stretches to fill this
          // container, so without it the selected wash ran flush into the
          // row's edge and read as clipped even when it was not.
          compact ? 'pt-3 pb-3' : 'pt-4 pb-4',
        )}
      >
        {laneSelectable ? <span aria-hidden className="pointer-events-auto absolute inset-x-0" style={{top:`min(${22 / cameraScale}px, 25%)`,bottom:`min(${22 / cameraScale}px, 25%)`}} /> : null}
        {laneSelectable ? (
          <LaneSelectionName
            id={row.lane!.id}
            name={row.label}
            type="button"
            onClick={selectLane}
            data-structure-header-title=""
            data-open={selection?.kind === 'lane' && selection.id === laneId ? '' : undefined}
            data-structure-reorder="lane"
            data-structure-id={row.lane!.id}
            data-blueprint-row-header=""
            className={cn(
              CANVAS_HEADER_TEXT,
  CANVAS_HEADER_STATE,
              'group/lane relative min-w-0 flex-1 cursor-pointer rounded-md text-left whitespace-normal break-words',
            )}
            style={{ color: labelColor }}
          >
            {row.label}
          </LaneSelectionName>
        ) : row.kind === 'lane' && row.lane ? (
          // View mode: the label is inert prose, so the whole block becomes
          // the way into the lane's properties.
          <LaneHeaderAffordance
            laneId={row.lane.id}
            laneName={row.label}
            color={labelColor}
          />
        ) : (
          <span
            data-blueprint-row-header=""
            className={cn(
              CANVAS_HEADER_TEXT,
  CANVAS_HEADER_STATE,
              'relative min-w-0 flex-1 text-left whitespace-normal break-words',
            )}
            style={{ color: labelColor }}
          >
            {row.label}
          </span>
        )}
        {/* Design mode only, and beside the selection handle rather than
            inside it: there the label already means "select every cell in
            this lane", and the two readings have to stay visibly separate.
            In View mode the block itself opens the panel, so a second control
            would be a duplicate. */}
        {laneSelectable && row.lane ? (
          <EntityPropertiesButton
            kind="lane"
            id={row.lane.id}
            name={row.label}
          />
        ) : null}
        {BLUEPRINT_LANE_COLLAPSE_ENABLED &&
          row.kind === 'lane' &&
          row.lane &&
          onToggleLane && (
            <LaneCollapseToggle
              laneName={row.label}
              collapsed={row.collapsed ?? false}
              onToggle={() => onToggleLane(row.lane!.id)}
              className="size-6 shrink-0"
            />
          )}
      </div>
      {corridorBelow > 0 && (
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: corridorBelow }}
        />
      )}
    </div>
  )
}

function LaneSelectionName({
  id,
  name,
  children,
  ...props
}: React.ComponentProps<'button'> & { id: string; name: string }) {
  const rename = useStructureRename('lane', id, name)
  return rename.editing ? (
    rename.editor
  ) : (
    <button
      draggable={false}
      {...props}
      onClick={(event) => rename.click(event, () => props.onClick?.(event))}
      onDoubleClick={rename.begin}
    >
      <StructureDragGrip />
      {children}
    </button>
  )
}
