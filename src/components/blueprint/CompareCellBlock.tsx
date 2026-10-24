import { BlueprintCellButton } from '@/components/blueprint/BlueprintCellButton'
import { BlueprintStepStoryboard } from '@/components/blueprint/BlueprintStepStoryboard'
import { BlueprintTouchpointCell } from '@/components/blueprint/BlueprintTouchpointCell'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  STEP_COLUMN_WIDTH,
  getCellShellInsetY,
  getCellShellPaddingY,
  NARRATIVE_CELL_HEIGHT,
  NARRATIVE_CELL_HEIGHT_COMPACT,
  getStoryboardCellButtonMaxHeight,
  type BlueprintCellVariant,
} from '@/lib/blueprintLayout'
import {
  buildBlueprintCellSelection,
  getTouchpointNames,
  type BlueprintCellSelectionContext,
} from '@/lib/blueprintCellSelection'
import {
  BLUEPRINT_SLOT_INSET,
  BLUEPRINT_SLOT_INSET_COMPACT,
} from '@/lib/canvasHeaderStyle'
import type { BlueprintLaneStyle } from '@/lib/blueprintTheme'
import { cn } from '@/lib/utils'
import type { BlueprintCell } from '@/types/blueprint'
import { cellResources } from '@/lib/cellResources'
import {
  cellTouchpoints,
  isNameOnlyPlacement,
  touchpointNamed,
} from '@/lib/cellTouchpoints'
import { useId, useState, type CSSProperties } from 'react'

/**
 * One cell of a compare grid — the same face in every arrangement (stacked
 * bands, overview columns, merged slots), down to its `data-blueprint-cell`
 * anchor, so selection, focus/pulse and arrow geometry behave identically
 * wherever it is drawn.
 */

/**
 * One segment of the merged view's path-membership outline. The outline sits
 * on the cell edge without repainting its lane fill; exact membership is
 * disclosed with full path names on hover and keyboard focus.
 */
export type CompareCellPathMembership = {
  color: string
  /** Full path name shown in the membership tooltip. */
  pathName: string
}

function membershipOutlineBackground(
  memberships: readonly CompareCellPathMembership[],
): string {
  if (memberships.length === 1) return memberships[0].color

  const slice = 100 / memberships.length
  const stops = memberships.flatMap((membership, index) => {
    const start = (slice * index).toFixed(3)
    const end = (slice * (index + 1)).toFixed(3)
    return [`${membership.color} ${start}%`, `${membership.color} ${end}%`]
  })
  return `conic-gradient(from -45deg, ${stops.join(', ')})`
}

export function CompareCellBlock({
  cellId,
  stepIndex,
  content,
  laneStyle,
  variant,
  compact,
  selectionContext,
  storyboardPictures,
  slotCells,
  status,
  pathMembership,
}: {
  cellId?: string
  stepIndex: number
  content?: string
  laneStyle: BlueprintLaneStyle
  variant: BlueprintCellVariant
  compact?: boolean
  selectionContext?: BlueprintCellSelectionContext
  storyboardPictures?: Array<{ frame: string; label: string }>
  /** Every cell in a tech slot — one per touchpoint since the split. */
  slotCells?: BlueprintCell[]
  /** Unbuilt cells wear a dashed, drained face — see BlueprintCellButton. */
  status?: BlueprintCell['status']
  /** Member paths of this rendered cell — one outline segment each. */
  pathMembership?: readonly CompareCellPathMembership[]
}) {
  const membershipDescriptionId = useId()
  const [membershipTooltipOpen, setMembershipTooltipOpen] = useState(false)
  const hasMembershipOutline = Boolean(
    pathMembership && pathMembership.length > 0,
  )
  const ariaDescribedBy = hasMembershipOutline
    ? membershipDescriptionId
    : undefined
  const shellPadding = compact
    ? BLUEPRINT_SLOT_INSET_COMPACT
    : BLUEPRINT_SLOT_INSET
  // The vertical inset is a layout number the row heights are summed from,
  // so it arrives as a style from where layout numbers live rather than as
  // a padding class that would have to agree with it.
  const insetY = getCellShellInsetY(compact)
  const shellVerticalPad = getCellShellPaddingY(compact)
  const width = STEP_COLUMN_WIDTH
  const isStoryboard = variant === 'storyboard'
  const narrativeHeight = compact
    ? NARRATIVE_CELL_HEIGHT_COMPACT
    : NARRATIVE_CELL_HEIGHT
  const shellStyle = {
    width,
    minWidth: width,
    maxWidth: width,
    paddingTop: insetY,
    paddingBottom: insetY,
    ...(hasMembershipOutline
      ? {
          '--background-compare-membership-outline':
            membershipOutlineBackground(pathMembership!),
        }
      : undefined),
    ...(isStoryboard
      ? {
          maxHeight:
            getStoryboardCellButtonMaxHeight(compact) + shellVerticalPad,
        }
      : undefined),
  } as CSSProperties
  const shellClassName = cn(
    'relative z-1 flex shrink-0 items-stretch',
    shellPadding,
    isStoryboard && 'min-h-0 overflow-hidden',
  )
  const innerContent =
    variant === 'storyboard' ? (
      <div className="relative flex h-full min-h-0 max-h-full w-full flex-1 overflow-hidden">
        <BlueprintStepStoryboard
          compact={compact}
          fill={laneStyle.lane}
          frames={storyboardPictures}
          selection={
            selectionContext
              ? buildBlueprintCellSelection(selectionContext)
              : undefined
          }
          cellId={cellId}
          stepIndex={stepIndex}
          className={cn(
            'flex-1',
            hasMembershipOutline && 'compare-membership-outline',
          )}
          aria-describedby={ariaDescribedBy}
        />
      </div>
    ) : variant === 'touchpoints' ? (
      <div
        {...(cellId ? { 'data-blueprint-cell': cellId } : {})}
        data-step-index={stepIndex}
        className={cn(
          'flex w-full flex-1 flex-col items-stretch',
          compact ? 'gap-2' : 'gap-2',
        )}
      >
        {(slotCells && slotCells.length > 0
          ? slotCells.flatMap((slotCell) =>
              getTouchpointNames(slotCell).map((item) => ({
                item,
                slotCell,
              })),
            )
          : getTouchpointNames({ content }).map((item) => ({
              item,
              slotCell: undefined,
            }))
        ).map(({ item, slotCell }, index, all) => {
          // A touchpoint whose placement the registry lacks is drawn dashed.
          // Read from the cell the touchpoint belongs to — its own slot in a
          // merged view, the block's cell otherwise.
          const placement = touchpointNamed(
            slotCell
              ? cellTouchpoints(slotCell)
              : selectionContext?.cellTouchpoints ?? [],
            item,
          )
          const nameOnly = placement ? isNameOnlyPlacement(placement) : false
          return selectionContext ? (
            <BlueprintTouchpointCell
              key={`${slotCell?.id ?? 'anon'}-${item}-${index}`}
              item={item}
              nameOnly={nameOnly}
              className={
                hasMembershipOutline ? 'compare-membership-outline' : undefined
              }
              aria-describedby={ariaDescribedBy}
              // Identity is the split's point: each touchpoint carries its own
              // cell in the selection it hands to the panel and the picker.
              selectionContext={
                slotCell
                  ? {
                      ...selectionContext,
                      cellId: slotCell.id,
                      cellContent: slotCell.content ?? '',
                      cellFrame: slotCell.frame ?? null,
                      cellSummary: slotCell.summary ?? null,
                      cellTouchpoints: cellTouchpoints(slotCell),
                      cellResources: cellResources(slotCell),
                    }
                  : selectionContext
              }
              stepIndex={stepIndex}
              compact={compact}
              sliceSequenceBadge={
                index === 0 || slotCell?.id !== all[index - 1]?.slotCell?.id
              }
              status={slotCell?.status ?? status}
            />
          ) : (
            // The wrapper, not `TouchpointCellFace` directly: it is what
            // carries `data-blueprint-touchpoint`, and
            // `scrollBlueprintTouchpointCellIntoView` finds a named
            // touchpoint by exactly that attribute. Drawn without it, a face
            // in this grid is one nothing can scroll to.
            <BlueprintTouchpointCell
              key={`${item}-${index}`}
              item={item}
              compact={compact}
              nameOnly={nameOnly}
              className={cn(
                'shrink-0',
                hasMembershipOutline && 'compare-membership-outline',
              )}
              aria-describedby={ariaDescribedBy}
            />
          )
        })}
      </div>
    ) : (
      <BlueprintCellButton
        fill={laneStyle.lane}
        compact={compact}
        selection={
          selectionContext
            ? buildBlueprintCellSelection(selectionContext)
            : undefined
        }
        cellId={cellId}
        stepIndex={stepIndex}
        status={status}
        className={cn(
          'flex-none overflow-hidden',
          hasMembershipOutline && 'compare-membership-outline',
        )}
        style={{
          height: narrativeHeight,
          minHeight: narrativeHeight,
          maxHeight: narrativeHeight,
        }}
        aria-describedby={ariaDescribedBy}
      >
        <p className="line-clamp-4 w-full whitespace-pre-wrap">{content}</p>
      </BlueprintCellButton>
    )

  const shell = (
    <div
      data-structure-column=""
      data-step-index={stepIndex}
      data-blueprint-cell-shell=""
      className={shellClassName}
      style={shellStyle}
      onFocusCapture={
        hasMembershipOutline ? () => setMembershipTooltipOpen(true) : undefined
      }
      onBlurCapture={
        hasMembershipOutline
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setMembershipTooltipOpen(false)
              }
            }
          : undefined
      }
    >
      {hasMembershipOutline ? (
        <span id={membershipDescriptionId} className="sr-only">
          {`Used in paths: ${pathMembership!
            .map((membership) => membership.pathName)
            .join(', ')}`}
        </span>
      ) : null}
      {innerContent}
    </div>
  )

  if (!hasMembershipOutline) return shell

  return (
    <Tooltip
      open={membershipTooltipOpen}
      onOpenChange={setMembershipTooltipOpen}
    >
      <TooltipTrigger render={shell} tabIndex={-1} />
      <TooltipContent
        side="top"
        sideOffset={6}
        className="flex max-w-72 flex-col items-start gap-2 text-left"
      >
        {/* Caption ink: the tooltip is page-coloured now, so contrast ink
            would be the page colour on the page. */}
        <span className="text-muted-foreground">Used in</span>
        {pathMembership!.map((membership) => (
          <span key={membership.pathName} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full ring-1 ring-border"
              style={{ backgroundColor: membership.color }}
            />
            <span>{membership.pathName}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
