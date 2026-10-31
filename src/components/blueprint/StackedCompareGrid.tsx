import { Fragment, type RefObject } from 'react'
import { BlueprintPathBand } from '@/components/blueprint/BlueprintPathBand'
import { CompareStepHeaderRow } from '@/components/blueprint/CompareTrackDecorations'
import { useCompareGridAxis } from '@/hooks/useCompareGridAxis'
import { STEP_COLUMN_GAP } from '@/lib/blueprintLayout'
import {
  COMPARE_STACKED_BAND_GAP,
  COMPARE_STACKED_HEADER_GAP,
  COMPARE_STEP_HEADER_HEIGHT,
  getCompareBoardWrapperPadding,
  getCompareRowTrackCss,
} from '@/lib/sideBySideCompareLayout'
import { cn } from '@/lib/utils'
import type { CompareModel } from '@/lib/compareSlots'
import type { BlueprintData } from '@/types/blueprint'

type StackedCompareGridProps = {
  blueprints: BlueprintData[]
  /**
   * The compare model owned by `ScenarioBlueprintPanel` (one `useMemo`,
   * gated on every selected blueprint being loaded). Null with a single
   * path — the band still stacks, there is just nothing to compare.
   */
  model: CompareModel | null
  className?: string
  compact?: boolean
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  scenarioName?: string
  phaseName?: string
  /** When set, scenario title sits on the gray panel edge; path frames show path type. */
  sectionTitleLabel?: string
}

/**
 * The stacked ARRANGEMENT of `BlueprintPathBand` (focused scenario view):
 * every compared path renders as a full-width band, one below the other, on
 * ONE canonical step-column axis owned by this parent grid. Bands pick their
 * column tracks up via `gridTemplateColumns: subgrid`; columns a path lacks
 * hold inert spacers inside its band. Divergent columns (column verdict !==
 * 'shared') carry a light tint — the v3 diff signal is column-level, never
 * per-cell paint.
 *
 * No `position: sticky` in here: the grid lives inside the zoom-transformed
 * canvas, where sticky both misbehaves and has nothing to stick to.
 */
export function StackedCompareGrid({
  blueprints,
  model,
  className,
  compact = false,
  scrollContainerRef,
  scenarioName,
  phaseName,
  sectionTitleLabel,
}: StackedCompareGridProps) {
  const { lanes, rows, toggleLane, tracks, gridTemplateColumns } =
    useCompareGridAxis(model, blueprints, compact)

  const showPathKindBadge = Boolean(sectionTitleLabel)

  if (blueprints.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Select at least one path to compare.
      </p>
    )
  }

  return (
    <div
      data-structure-board=""
      data-structure-density={compact ? "compact" : undefined}
      className={cn('w-max shrink-0', className)}
      style={getCompareBoardWrapperPadding()}
    >
      <div
        className="relative grid w-max"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `${COMPARE_STEP_HEADER_HEIGHT}px repeat(${blueprints.length}, auto)`,
          columnGap: STEP_COLUMN_GAP,
        }}
      >
        <CompareStepHeaderRow tracks={tracks} pathId={blueprints[0].path.id} />
        {blueprints.map((blueprint, bandIndex) => {
          const bandRows = rows.filter(
            (row) =>
              !row.lane ||
              !['structure-seam', 'structure-placeholder'].includes(
                row.lane.id,
              ) ||
              blueprint.lanes.some((lane) => lane.id === row.lane!.id),
          )
          return (
            <Fragment key={blueprint.path.id}>
              <BlueprintPathBand
                blueprint={blueprint}
                lanes={lanes}
                rows={bandRows}
                arrangement={{
                  kind: 'row',
                  singlePath: blueprints.length === 1,
                  gridRow: bandIndex + 2,
                  tracks,
                  rowTrackCss: bandRows
                    .map((row) => getCompareRowTrackCss(row))
                    .join(' '),
                  marginTop:
                    bandIndex === 0
                      ? COMPARE_STACKED_HEADER_GAP
                      : COMPARE_STACKED_BAND_GAP,
                  onToggleLane: toggleLane,
                }}
                compact={compact}
                scrollContainerRef={scrollContainerRef}
                scenarioName={scenarioName}
                phaseName={phaseName}
                showPathKindBadge={showPathKindBadge}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
