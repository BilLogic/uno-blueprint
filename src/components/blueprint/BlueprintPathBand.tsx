import { Fragment, useMemo, useRef, type RefObject } from 'react'
import { BlueprintColumnHandles } from '@/components/blueprint/BlueprintColumnHandles'
import { BlueprintLaneHandles } from '@/components/blueprint/BlueprintLaneHandles'
import { BlueprintEmptyCellSlot } from '@/components/blueprint/BlueprintEmptyCellSlot'
import { CompareLaneRowShell } from '@/components/blueprint/CompareLaneRowShell'
import { CompareCellBlock } from '@/components/blueprint/CompareCellBlock'
import {
  BlueprintDividerRow,
  BlueprintLabelRow,
  BlueprintStickyLabelBackdrop,
  BlueprintSwimLaneDivider,
} from '@/components/blueprint/BlueprintLabelRail'
import { ComparePathSectionFrame } from '@/components/blueprint/ComparePathSectionFrame'
import { IntegratedDependencyArrows } from '@/components/blueprint/IntegratedDependencyArrows'
import { BlueprintStoryboardPlayButton } from '@/components/blueprint/BlueprintStoryboardPlayButton'
import {
  BLUEPRINT_LANE_ROW_GAP,
  STEP_COLUMN_GAP,
  STORYBOARD_PLAY_GUTTER,
  STEP_COLUMN_WIDTH,
  hasBlueprintCellContent,
  lanePrecedesBlueprintDivider,
  shouldUseTouchpointCellContent,
  shouldUseStoryboardContent,
} from '@/lib/blueprintLayout'
import { cellResources } from '@/lib/cellResources'
import { cellTouchpoints } from '@/lib/cellTouchpoints'
import {
  buildCellLookup,
  getCellAt,
  getCellsAt,
} from '@/lib/normalizeBlueprint'
import {
  getBlueprintLaneStyle,
  getBlueprintLaneZone,
} from '@/lib/blueprintTheme'
import type { CompareGridTrack } from '@/lib/compareGridTracks'
import {
  type BlueprintLabelRowSpec,
  getComparePathArrowData,
} from '@/lib/sideBySideCompareLayout'
import { resolveBlueprintLane } from '@/lib/laneCorridor'
import { cn } from '@/lib/utils'
import { resolveStoryboardStripEntries } from '@/lib/storyboardWalkthrough'
import { isBlueprintStoryboardWalkthroughEnabled } from '@/lib/blueprintDisplayFlags'
import { buildStoryboardWalkthroughSession } from '@/lib/storyboardWalkthrough'
import type { BlueprintData, BlueprintStep } from '@/types/blueprint'

/**
 * How one band is placed inside its parent grid.
 *
 * - `column`: the horizontal (overview) arrangement — the band is one grid
 *   COLUMN whose row tracks come from the parent via `gridTemplateRows:
 *   subgrid`, so lane rows stay aligned across paths.
 * - `row`: the stacked (focused scenario) arrangement — the band is one grid
 *   ROW whose column tracks come from the parent via `gridTemplateColumns:
 *   subgrid` (one canonical step axis shared by every band), and the band
 *   owns its lane-row tracks.
 */
export type PathBandArrangement =
  | { kind: 'column'; columnIndex: number; withLaneHandles: boolean }
  | {
      kind: 'row'
      gridRow: number
      tracks: readonly CompareGridTrack[]
      rowTrackCss: string
      marginTop?: number
      onToggleLane?: (laneId: string) => void
    }

type BlueprintPathBandProps = {
  blueprint: BlueprintData
  lanes: BlueprintData['lanes']
  rows: BlueprintLabelRowSpec[]
  arrangement: PathBandArrangement
  compact?: boolean
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  scenarioName?: string
  phaseName?: string
  showPathKindBadge?: boolean
}

/**
 * One path's full lane-row band — section frame, dependency arrows, design-mode
 * handles and the cells themselves. Both compare arrangements compose this
 * component; only the placement (`arrangement`) differs. The rendering of a
 * cell is identical in both, down to its `data-blueprint-cell` anchors.
 */
export function BlueprintPathBand({
  blueprint,
  lanes,
  rows,
  arrangement,
  compact,
  scrollContainerRef,
  scenarioName,
  phaseName,
  showPathKindBadge = false,
}: BlueprintPathBandProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const fallbackScrollRef = useRef<HTMLDivElement>(null)
  const resolvedScrollRef = scrollContainerRef ?? fallbackScrollRef
  const arrowData = useMemo(
    () => getComparePathArrowData(blueprint),
    [blueprint],
  )
  // A fresh array literal here re-runs the overlay's whole observer setup on
  // every render, and `observe()` fires immediately — which renders again.
  const arrowPaths = useMemo(() => [blueprint.path], [blueprint.path])
  const showPlay =
    isBlueprintStoryboardWalkthroughEnabled() &&
    buildStoryboardWalkthroughSession(blueprint).steps.length > 0
  // The stacked arrangement cannot shift cells right for the play control —
  // cells must stay on the canonical column tracks — so the control hangs in
  // the rail gap instead (see CompareLaneRow).
  const playGutter =
    showPlay && arrangement.kind === 'column' ? STORYBOARD_PLAY_GUTTER : 0

  const placementStyle =
    arrangement.kind === 'column'
      ? {
          gridColumn: arrangement.columnIndex,
          gridRow: `1 / ${rows.length + 1}`,
          gridTemplateRows: 'subgrid',
        }
      : {
          gridRow: arrangement.gridRow,
          gridColumn: '1 / -1',
          gridTemplateColumns: 'subgrid',
          gridTemplateRows: arrangement.rowTrackCss,
          // Do NOT rely on gap inheritance into the subgrid — explicit here.
          columnGap: STEP_COLUMN_GAP,
          rowGap: BLUEPRINT_LANE_ROW_GAP,
          marginTop: arrangement.marginTop,
        }

  return (
    <div
      ref={bandRef}
      data-structure-path={blueprint.path.id}
      className="relative z-0 grid overflow-visible"
      style={placementStyle}
    >
      <BlueprintColumnHandles
        steps={blueprint.steps}
        bodyRef={bandRef}
        pathId={blueprint.path.id}
      />
      {/* Lanes are scenario-wide, so the horizontal arrangement carries one
          set of handles on its first band; stacked bands are vertically
          disjoint, so each carries its own. */}
      {arrangement.kind === 'column' ? (
        arrangement.withLaneHandles ? (
          <BlueprintLaneHandles bodyRef={bandRef} pathId={blueprint.path.id} />
        ) : null
      ) : (
        <BlueprintLaneHandles bodyRef={bandRef} pathId={blueprint.path.id} />
      )}
      <ComparePathSectionFrame
        blueprint={blueprint}
        compact={compact}
        showPathKindBadge={showPathKindBadge}
        excludeLabelRail={arrangement.kind === 'row'}
      />
      {arrangement.kind === 'row' ? (
        <>
          {/* The label rail re-emits per band: every band names its own
              lanes, in DOM order matching the path order. */}
          {/* No bleed. The bleeds existed to fill the frame's own insets in
              this column, back when the outline ran UNDER the rail; the frame
              now starts after the label track, so grey pushed past the row
              tracks lands outside the outline instead of inside it. */}
          <BlueprintStickyLabelBackdrop rowCount={rows.length} />
          {rows.map((row, rowIndex) =>
            row.kind === 'interaction' ||
            row.kind === 'visibility' ||
            row.kind === 'internalInteraction' ? (
              <BlueprintDividerRow
                key={`rail-${row.key}`}
                rowIndex={rowIndex}
                label={row.label}
                lineStyle={
                  row.kind === 'interaction'
                    ? 'dashed'
                    : row.kind === 'internalInteraction'
                    ? 'dotted'
                    : 'solid'
                }
              />
            ) : (
              <Fragment key={`rail-${row.key}`}>
                <BlueprintLabelRow
                  row={row}
                  lanes={lanes}
                  compact={compact}
                  onToggleLane={arrangement.onToggleLane}
                  style={{
                    gridColumn: 1,
                    gridRow: rowIndex + 1,
                    alignSelf: 'start',
                    height: '100%',
                  }}
                />
                {row.showDividerBelow ? (
                  <BlueprintSwimLaneDivider rowIndex={rowIndex} />
                ) : null}
              </Fragment>
            ),
          )}
        </>
      ) : null}
      <IntegratedDependencyArrows
        layer="forward"
        dependencies={arrowData.dependencies}
        cells={arrowData.cells}
        steps={arrowData.steps}
        paths={arrowPaths}
        contentRef={bandRef}
        scrollContainerRef={resolvedScrollRef}
      />
      {rows.map((row, rowIndex) => (
        <CompareCardRow
          key={row.key}
          row={row}
          rowIndex={rowIndex}
          blueprint={blueprint}
          lanes={lanes}
          compact={compact}
          scenarioName={scenarioName}
          phaseName={phaseName}
          playGutter={playGutter}
          showPlay={showPlay}
          stackedTracks={
            arrangement.kind === 'row' ? arrangement.tracks : undefined
          }
        />
      ))}
      <IntegratedDependencyArrows
        layer="wrap"
        dependencies={arrowData.dependencies}
        cells={arrowData.cells}
        steps={arrowData.steps}
        paths={arrowPaths}
        contentRef={bandRef}
        scrollContainerRef={resolvedScrollRef}
      />
    </div>
  )
}

function CompareCardRow({
  row,
  rowIndex,
  blueprint,
  lanes,
  compact,
  scenarioName,
  phaseName,
  playGutter = 0,
  showPlay = false,
  stackedTracks,
}: {
  row: BlueprintLabelRowSpec
  rowIndex: number
  blueprint: BlueprintData
  lanes: BlueprintData['lanes']
  compact?: boolean
  scenarioName?: string
  phaseName?: string
  playGutter?: number
  showPlay?: boolean
  stackedTracks?: readonly CompareGridTrack[]
}) {
  return (
    <CompareLaneRowShell
      row={row}
      rowIndex={rowIndex}
      cellTracksOnly={stackedTracks !== undefined}
    >
      {row.lane ? (
        <CompareLaneRow
          blueprint={blueprint}
          lane={row.lane}
          lanes={lanes}
          compact={compact}
          scenarioName={scenarioName}
          phaseName={phaseName}
          playGutter={playGutter}
          showPlay={showPlay}
          stackedTracks={stackedTracks}
        />
      ) : null}
    </CompareLaneRowShell>
  )
}

function CompareLaneRow({
  blueprint,
  lane,
  lanes,
  compact,
  scenarioName,
  phaseName,
  playGutter = 0,
  showPlay = false,
  stackedTracks,
}: {
  blueprint: BlueprintData
  lane: BlueprintData['lanes'][number]
  lanes: BlueprintData['lanes']
  compact?: boolean
  scenarioName?: string
  phaseName?: string
  playGutter?: number
  showPlay?: boolean
  stackedTracks?: readonly CompareGridTrack[]
}) {
  const blueprintLane = useMemo(
    () => resolveBlueprintLane(lane, blueprint),
    [blueprint, lane],
  )
  const cellLookup = useMemo(
    () => buildCellLookup(blueprint.cells),
    [blueprint.cells],
  )
  const stepIndexById = useMemo(
    () => new Map(blueprint.steps.map((step, index) => [step.id, index])),
    [blueprint.steps],
  )
  const isTouchpointLane = shouldUseTouchpointCellContent(lane)
  const laneStyle = getBlueprintLaneStyle(
    lane.name,
    getBlueprintLaneZone(lane, lanes),
    lane.role,
  )
  const flushBottom = lanePrecedesBlueprintDivider(lane, lanes)
  const isStoryboardLane = shouldUseStoryboardContent(lane)
  const renderPlay =
    showPlay &&
    isStoryboardLane &&
    (playGutter > 0 || stackedTracks !== undefined)

  const renderStepCell = (step: BlueprintStep, stepIndex: number) => {
    const cell = getCellAt(cellLookup, blueprintLane.id, step.id)
    // Tech slots hold one cell per touchpoint since the split.
    const slotCells = isTouchpointLane
      ? getCellsAt(cellLookup, blueprintLane.id, step.id)
      : undefined
    const variant = isStoryboardLane
      ? 'storyboard'
      : isTouchpointLane
      ? 'touchpoints'
      : 'default'
    const storyboardPictures = isStoryboardLane
      ? resolveStoryboardStripEntries(blueprint, step.id)
      : undefined
    const showCell = isStoryboardLane
      ? (storyboardPictures?.length ?? 0) > 0
      : isTouchpointLane
      ? (slotCells ?? []).some((entry) =>
          hasBlueprintCellContent(entry.content, variant),
        )
      : hasBlueprintCellContent(cell?.content, variant)

    if (!showCell) {
      // Empty in Edit mode is not nothing: it is where a cell can go.
      // Outside Edit it stays the inert spacer it has always been.
      return (
        <BlueprintEmptyCellSlot
          pathId={blueprint.path.id}
          laneId={blueprintLane.id}
          stepId={step.id}
          laneName={lane.name}
          // The path's own lane, the one the cell will live in — the same
          // lane an existing cell's budget is read from.
          laneRole={blueprintLane.role ?? null}
          stepName={step.name}
          stepIndex={stepIndex}
          scenarioName={scenarioName}
          phaseName={phaseName}
          width={step.seamSize ?? STEP_COLUMN_WIDTH}
          selfStretch
        />
      )
    }

    return (
      <CompareCellBlock
        cellId={
          cell?.id ?? (isStoryboardLane ? `storyboard-${step.id}` : undefined)
        }
        stepIndex={stepIndex}
        content={cell?.content}
        status={cell?.status}
        laneStyle={laneStyle}
        variant={variant}
        compact={compact}
        flushBottom={flushBottom}
        storyboardPictures={storyboardPictures}
        slotCells={slotCells}
        selectionContext={
          scenarioName && (cell?.id || isStoryboardLane)
            ? {
                scenarioName,
                phaseName,
                laneName: lane.name,
                stepId: step.id,
                stepName: step.name,
                stepIndex,
                cellId: cell?.id ?? `storyboard-${step.id}`,
                cellContent: cell?.content ?? '',
                cellFrame: cell?.frame ?? null,
                cellSummary: cell?.summary ?? null,
                cellTouchpoints: cellTouchpoints(cell ?? {}),
                cellResources: cellResources(cell ?? {}),
                pathId: blueprint.path.id,
                pathName: blueprint.path.name,
                pathSummary: blueprint.path.summary,
                pathKind: blueprint.path.kind,
              }
            : undefined
        }
      />
    )
  }

  const playButton = renderPlay ? (
    <div
      className="pointer-events-auto absolute z-50"
      style={{
        // Stacked bands keep cells on the canonical tracks, so the play
        // control hangs in the rail gap to their left instead of a gutter.
        left: stackedTracks ? -(STEP_COLUMN_GAP + 2) : 6,
        top: compact ? 10 : 14,
      }}
    >
      <BlueprintStoryboardPlayButton
        blueprint={blueprint}
        scenarioName={scenarioName}
        phaseName={phaseName}
      />
    </div>
  ) : null

  if (stackedTracks) {
    // Stacked arrangement: same fixed cell widths and gaps as the canonical
    // column tracks, so a flex row lines up with the parent grid exactly.
    // Columns this path lacks hold inert spacers (not `BlueprintEmptyCellSlot`
    // — that is an edit-mode drop target for steps the path actually has).
    const pathId = blueprint.path.id
    const stepById = new Map(blueprint.steps.map((step) => [step.id, step]))

    return (
      <div
        className={cn('relative flex items-stretch rounded-md shrink-0')}
        style={{ backgroundColor: 'transparent' }}
      >
        {playButton}
        {stackedTracks.map((track, trackIndex) => {
          const gapSpacer = (stepIndex?: number) =>
            trackIndex < stackedTracks.length - 1 ? (
              <div
                aria-hidden
                className="shrink-0"
                style={{ width: STEP_COLUMN_GAP, minWidth: STEP_COLUMN_GAP }}
                {...(stepIndex !== undefined &&
                stepIndex < blueprint.steps.length - 1
                  ? { 'data-step-gap': stepIndex }
                  : {})}
              />
            ) : null

          const stepId = track.stepIdByPath[pathId]
          const step = stepId !== undefined ? stepById.get(stepId) : undefined
          const stepIndex =
            stepId !== undefined ? stepIndexById.get(stepId) : undefined

          return (
            <Fragment key={track.key}>
              {track.seamSize !== undefined ? (
                <div
                  aria-hidden
                  data-structure-seam-track="step"
                  data-step-index={trackIndex}
                  className="shrink-0"
                  style={{ width: track.seamSize, minWidth: track.seamSize }}
                />
              ) : step !== undefined && stepIndex !== undefined ? (
                renderStepCell(step, stepIndex)
              ) : (
                <div
                  aria-hidden
                  data-compare-column-spacer=""
                  className="shrink-0"
                  style={{
                    width: STEP_COLUMN_WIDTH,
                    minWidth: STEP_COLUMN_WIDTH,
                  }}
                />
              )}
              {gapSpacer(stepIndex)}
            </Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={cn('relative flex items-stretch rounded-md shrink-0')}
      style={{
        backgroundColor: 'transparent',
        paddingLeft: playGutter || undefined,
      }}
    >
      {playButton}
      {blueprint.steps.map((step, stepIndex) => (
        <Fragment key={`${lane.id}-${step.id}`}>
          {renderStepCell(step, stepIndex)}
          {stepIndex < blueprint.steps.length - 1 && (
            <div
              aria-hidden
              className="shrink-0"
              style={{ width: STEP_COLUMN_GAP, minWidth: STEP_COLUMN_GAP }}
              data-step-gap={stepIndex}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}
