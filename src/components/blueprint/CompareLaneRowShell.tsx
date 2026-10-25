import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import {
  BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN,
  BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  BLUEPRINT_WRAP_CORRIDOR_MARGIN,
} from '@/lib/blueprintLayout'
import type { BlueprintLabelRowSpec } from '@/lib/sideBySideCompareLayout'
import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

/**
 * One lane row's grid cell: the swimlane data attributes canvas queries rely
 * on (`data-blueprint-swimlane`, `data-lane-id`/`-name`), the arrow
 * corridors, and the divider-row treatment. Row anatomy is a property of the
 * LANE, not of any path, so the stacked bands and the merged grid share this
 * shell and only differ in the cells they put inside it.
 *
 * `children` renders only for an expanded lane row — a collapsed lane or a
 * divider keeps its track height with inert filler.
 */
export function CompareLaneRowShell({
  row,
  rowIndex,
  /** Stacked/merged rows span the rail column too; cells start at track 2. */
  cellTracksOnly = false,
  children,
}: {
  row: BlueprintLabelRowSpec
  rowIndex: number
  cellTracksOnly?: boolean
  children: ReactNode
}) {
  if (row.lane?.seamSize !== undefined)
    return (
      <div
        aria-hidden
        data-structure-seam-track="lane"
        style={{
          gridRow: rowIndex + 1,
          gridColumn: cellTracksOnly ? '2 / -1' : undefined,
        }}
      />
    )
  const isDivider =
    row.kind === 'interaction' ||
    row.kind === 'visibility' ||
    row.kind === 'internalInteraction'
  const isLaneRow = row.kind === 'lane'
  const corridorAbove = row.wrapCorridorAbove
    ? BLUEPRINT_OVERHEAD_RAIL_CORRIDOR_MARGIN
    : 0
  const corridorBelow = row.wrapCorridorBelow
    ? BLUEPRINT_WRAP_CORRIDOR_MARGIN
    : 0
  const inLaneLoopCorridorAbove = row.inLaneLoopCorridorAbove
    ? BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN
    : 0

  return (
    <div
      {...(isLaneRow && row.lane
        ? {
            'data-blueprint-swimlane': '',
            'data-blueprint-row': '',
            'data-structure-placeholder':
              row.lane.id === STRUCTURE_PLACEHOLDER_ID ? '' : undefined,
            'data-lane-id': row.lane.id,
            'data-lane-position': row.lane.position,
            // Lets a picked cell name its lane without the selection
            // carrying the whole blueprint (see lib/canvasCellQuery).
            'data-lane-name': row.lane.name,
          }
        : {})}
      {...(isDivider
        ? {
            'data-blueprint-divider':
              row.kind === 'interaction' ? 'interaction' : 'visibility',
          }
        : {})}
      className={cn(
        'flex h-full min-h-0 flex-col',
        isDivider && 'relative z-1 overflow-hidden bg-transparent',
        isLaneRow && 'overflow-visible',
      )}
      style={{
        gridRow: rowIndex + 1,
        ...(cellTracksOnly ? { gridColumn: '2 / -1' } : {}),
        '--structure-row-inset-top': `${corridorAbove + inLaneLoopCorridorAbove}px`,
        '--structure-row-inset-bottom': `${corridorBelow}px`,
        backgroundColor:
          isDivider || row.lane?.id === STRUCTURE_PLACEHOLDER_ID
            ? undefined
            : 'transparent',
      } as CSSProperties}
      {...(isDivider ? { role: 'separator' as const } : {})}
    >
      {corridorAbove > 0 && (
        <div
          aria-hidden
          data-blueprint-rail-corridor="above"
          className="shrink-0"
          style={{ height: corridorAbove }}
        />
      )}
      <div
        className={cn(
          'min-h-0',
          isDivider
            ? 'flex h-full items-center overflow-hidden'
            : 'flex flex-1 flex-col',
        )}
      >
        {inLaneLoopCorridorAbove > 0 && (
          <div
            aria-hidden
            data-blueprint-loop-corridor="above"
            className="shrink-0"
            style={{ height: inLaneLoopCorridorAbove }}
          />
        )}
        {isLaneRow && row.lane && !row.collapsed ? (
          children
        ) : (
          <div className="h-full" aria-hidden />
        )}
      </div>
      {corridorBelow > 0 && (
        <div
          aria-hidden
          data-blueprint-wrap-corridor="below"
          className="shrink-0"
          style={{ height: corridorBelow }}
        />
      )}
    </div>
  )
}
