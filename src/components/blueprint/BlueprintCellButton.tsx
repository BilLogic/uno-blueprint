import { Button } from '@/components/ui/button'
import {
  useBlueprintCellDetailOptional,
  useBlueprintCellPreviewHover,
} from '@/contexts/BlueprintCellDetailContext'
import { useCanvasAnnotationToolOptional } from '@/contexts/canvasAnnotationContext'
import { useCellPick } from '@/contexts/cellPickContext'
import {
  clickOpensDetail,
  clickPicks,
  detailClickCloses,
  pickModeForClick,
} from '@/lib/cellPickGrammar'
import { useSliceMembership } from '@/contexts/sliceMembershipContext'
import {
  blueprintCellButtonClassName,
  blueprintLaneAttrs,
  blueprintToneAttrs,
  type TouchpointTone,
  type BlueprintLaneRole,
} from '@/lib/blueprintCellStyle'
import { isSameBlueprintCellSelection } from '@/lib/blueprintCellSelection'
import { isUnbuilt, type EntityStatus } from '@/lib/entityStatus'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
import { cn } from '@/lib/utils'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'

type BlueprintCellButtonProps = {
  /** What this lane is; blueprint.css turns the role into its steps. */
  fill: BlueprintLaneRole
  /**
   * A touchpoint's chosen tone. Takes the place of the lane role when set —
   * the two sets share no family, so a touchpoint never reads as its lane.
   */
  tone?: TouchpointTone
  compact?: boolean
  className?: string
  style?: CSSProperties
  selection?: BlueprintCellSelection
  cellId?: string
  stepIndex?: number
  variant?: 'cell' | 'touchpoint' | 'storyboard'
  opacity?: number
  /**
   * Whether this button may carry the slice sequence badge. Touchpoints share
   * their cell's id, so touchpoint call sites pass `index === 0` to badge the
   * first touchpoint only; plain cell faces leave the default (true).
   */
  sliceSequenceBadge?: boolean
  /**
   * Unbuilt cells have to LOOK unbuilt.
   *
   * A status that lives in a column and nothing renders is strictly worse than
   * the `Planned — ` prefix it replaced, which at least said it on every cell
   * that carried it: design explorations then read as shipped surfaces, which
   * is the single most expensive thing a blueprint can get wrong. A dashed
   * edge and a drained fill carry it instead.
   */
  status?: EntityStatus | null
  children: ReactNode
  'aria-label'?: string
  'aria-describedby'?: string
  'data-blueprint-touchpoint'?: string
  /** A name-only placement: the registry lacks this touchpoint. */
  nameOnly?: boolean
}

/**
 * A single blueprint cell face — the app's most-used control.
 *
 * Interaction tones (hover, pressed, both focus rings) are resolved from the
 * cell's own family rather than from `--ring`, so it reads against whichever
 * lane the cell sits in. See `CELL_STEP` for which step each state uses and why.
 */
export function BlueprintCellButton({
  fill,
  tone,
  compact = false,
  className,
  style,
  selection,
  cellId,
  stepIndex = -1,
  variant = 'cell',
  opacity,
  sliceSequenceBadge = true,
  status,
  children,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'data-blueprint-touchpoint': touchpointLabel,
  nameOnly = false,
}: BlueprintCellButtonProps) {
  const detail = useBlueprintCellDetailOptional()
  const isInteractive = Boolean(detail?.enabled && selection && detail)
  const isActive =
    isInteractive &&
    isSameBlueprintCellSelection(detail!.selection, selection!)
  const resolvedCellId = cellId ? resolveBlueprintCellId(cellId) : null
  const isSelectedCell = Boolean(
    detail?.selection &&
      cellId &&
      (detail.selectedCellIds.has(cellId) ||
        (resolvedCellId && detail.selectedCellIds.has(resolvedCellId))),
  )
  const isDirectlyConnected = Boolean(
    detail?.selection &&
      cellId &&
      (detail.directlyConnectedCellIds.has(cellId) ||
        (resolvedCellId &&
          detail.directlyConnectedCellIds.has(resolvedCellId))),
  )
  const sliceMembership = useSliceMembership()
  const isSliceMember = Boolean(
    sliceMembership &&
      cellId &&
      (sliceMembership.memberCellIds.has(cellId) ||
        (resolvedCellId && sliceMembership.memberCellIds.has(resolvedCellId))),
  )
  // Checking `sliceMembership && cellId` directly (not via isSliceMember)
  // lets TypeScript narrow both — no non-null assertions.
  const sliceSequence =
    sliceMembership && cellId && isSliceMember && sliceSequenceBadge
      ? (sliceMembership.sequenceByCellId.get(cellId) ??
        (resolvedCellId
          ? sliceMembership.sequenceByCellId.get(resolvedCellId)
          : undefined))
      : undefined
  // Slice membership and picking both key on the canonical cell id, so
  // integrated-view overlay ids resolve to the same cell as the base grid.
  const pick = useCellPick()
  // Optional, not asserted: this button also renders inside the portalled
  // detail drawer, which is outside CanvasAnnotationProvider. The throwing
  // hook there was an app-wide white screen (see canvasAnnotationContext).
  const annotationTool = useCanvasAnnotationToolOptional()?.tool ?? null
  const pickCellId = resolvedCellId ?? cellId ?? null
  const pickOrder = pick && pickCellId ? pick.orderOf(pickCellId) : undefined
  const isPicked = Boolean(pick && pickCellId && pick.isPicked(pickCellId))
  // While a selection is being built (slice edit, Make slice), the picked
  // cells are the subject — everything else recedes. No dim while nothing
  // is picked yet: an empty selection should not gray the whole canvas.
  const dimUnpicked = Boolean(
    pick && pick.picked.length > 0 && pickCellId && !isPicked,
  )
  const preview = useBlueprintCellPreviewHover()
  const previewCellId = preview?.cellId
    ? resolveBlueprintCellId(preview.cellId)
    : null
  const matchesPreviewCell = Boolean(
    preview &&
      cellId &&
      (preview.cellId === cellId ||
        previewCellId === cellId ||
        (resolvedCellId != null &&
          (preview.cellId === resolvedCellId ||
            previewCellId === resolvedCellId))),
  )
  const isPreviewHover = Boolean(
    matchesPreviewCell &&
      (touchpointLabel
        ? preview?.techItem === touchpointLabel
        : !preview?.techItem),
  )
  /*
    While gathering (Edit's canvas), the detail selection paints nothing.

    The emphasis system is View's vocabulary: opening a cell rings it, rings
    its dependency chain, and dims everything else. In a service blueprint
    dependencies run vertically within a step, so ⌘-clicking one cell ringed
    a column of them — on a canvas where rings mean *picked*, that read as
    "⌘-click selected the whole column". Two ring vocabularies cannot share
    one canvas; in Edit, picking owns it and the panel is just a panel.
  */
  const emphasis =
    pick?.gathers || !detail?.selection
      ? undefined
      : isActive
        ? 'active'
        : isSelectedCell || isDirectlyConnected
          ? 'connected'
          : 'unrelated'

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!isInteractive) return
    // Focus mode: ignore cells in dimmed (inactive) phases/scenarios.
    if (event.currentTarget.closest('[data-canvas-focus-dimmed]')) return
    event.stopPropagation()
    // Picking a cell for a slice takes precedence over opening the panel:
    // in edit mode every click picks, elsewhere only cmd/shift-click does,
    // so ordinary reading of the blueprint is unaffected.
    // Hand means the canvas is being moved, not read: a click that lands at
    // the end of a pan must not also change the selection.
    if (annotationTool === 'hand') return
    /*
      The grammar lives in one place — `cellPickGrammar` — and the branch
      order here is the whole of it: ⌘/ctrl reads, everything else picks
      (when there is a picker), and a bare click on a canvas with no picker
      opens the panel — or closes it, when the panel is already showing this
      exact cell.

      Double-click deliberately does nothing special. In a toggle grammar,
      click-in click-out *is* a fast double-click — the two are
      indistinguishable by construction, and every attempt to give the pair
      its own meaning turned reading a cell into flipping its membership. A
      held modifier cannot be produced by clicking fast; that is why the
      open gesture is a modifier, with right-click → "View cell detail" as
      the discoverable route to the same place.
    */
    if (clickOpensDetail(event)) {
      detail!.selectCell(selection!)
      return
    }

    if (pickCellId && pick && clickPicks(event, pick.plainClick)) {
      pick.pick(pickCellId, pickModeForClick(event, pick.gathers ?? false))
      return
    }
    /*
      A bare click on the cell the panel is already showing closes it. The
      close goes through `closePanel` — the SAME single owner the ✕ and
      Escape use — rather than a second "is it open" fact living out here;
      `panelState` stays the one thing that knows. All four non-toggling
      cases (⌘-click, synthetic clicks, the Differences surface, an open
      draft) are decided inside `detailClickCloses`, next to the rest of the
      click grammar, so this branch is just which verb to call.
    */
    if (
      detailClickCloses({
        event: {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          // The native flag, not React's mirror of it: this is the one field
          // separating a person's click from the agent's dispatched one.
          isTrusted: event.nativeEvent.isTrusted,
        },
        openSurface: detail!.panelState?.surface ?? null,
        current: detail!.selection,
        next: selection!,
      })
    ) {
      detail!.closePanel()
      return
    }
    detail!.selectCell(selection!)
  }


  const surfaceStyle = {
    ...(opacity != null && opacity < 1 ? { opacity } : undefined),
    ...style,
  } as CSSProperties

  return (
    <Button
      type="button"
      variant="blueprint"
      data-blueprint-cell-anchor=""
      {...(tone ? blueprintToneAttrs(tone) : blueprintLaneAttrs(fill))}
      {...(cellId ? { 'data-blueprint-cell': cellId } : {})}
      data-step-index={stepIndex}
      {...(touchpointLabel ? { 'data-blueprint-touchpoint': touchpointLabel } : {})}
      {...(nameOnly ? { 'data-name-only': '' } : {})}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-pressed={isInteractive ? isActive : undefined}
      data-blueprint-cell-emphasis={emphasis}
      {...(status ? { 'data-blueprint-cell-status': status } : {})}
      {...(isSliceMember ? { 'data-slice-member': '' } : {})}
      {...(isPicked ? { 'data-slice-picked': '' } : {})}
      {...(isPreviewHover ? { 'data-blueprint-cell-preview-hover': '' } : {})}
      {...(isInteractive ? { 'data-blueprint-cell-interactive': '' } : {})}
      onClick={isInteractive ? handleClick : undefined}
      tabIndex={isInteractive ? 0 : -1}
      className={cn(
        blueprintCellButtonClassName({ compact, variant, className }),
        variant === 'cell' && 'min-h-[80px]',
        variant === 'storyboard' &&
          'min-h-0 h-full max-h-full overflow-hidden',
        !isInteractive && 'pointer-events-none cursor-default',
        (sliceSequence !== undefined || isPicked) && 'relative overflow-visible',
        // Opacity only — `filter` was transitioned here too, which puts a
      // per-frame filtered re-raster on all ~660 unpicked cells for the whole
      // 200 ms of a slice pick. Same rule blueprint.css states for the slice
      // dim and CanvasPhaseSection now follows; saturation lands on frame one.
      dimUnpicked && 'opacity-60 saturate-[.6] transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
      // Dashed, drained and slightly transparent: three cheap signals that
      // agree, so the cell still reads as unbuilt at the zoom where a canvas
      // is usually seen and the dashes have collapsed into a grey line.
      isUnbuilt(status) && 'border-dashed saturate-[.55] opacity-90',
      // Deprecated is not unbuilt — it exists, it works, it is going away. A
      // dashed edge would say the opposite, so it keeps its solid face and
      // fades instead.
      status === 'deprecated' && 'saturate-[.35] opacity-75',
      // At risk gets NOTHING here. It is a working surface people rely on;
      // dimming it would tell a reader not to, which is the wrong advice. The
      // panel names it, and a check can find it.
      )}
      style={surfaceStyle}
    >
      {/* Pick order wins the badge slot while picking: during selection the
          number the user cares about is the one they are building, not the
          one the saved slice already has. */}
      {isPicked && pickOrder !== undefined && sliceSequenceBadge ? (
        <span
          aria-hidden
          data-slice-pick-badge=""
          className="absolute -top-2 -left-2 z-10 grid size-5 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground shadow-sm"
        >
          {pickOrder}
        </span>
      ) : sliceSequence !== undefined ? (
        <span
          aria-hidden
          data-slice-sequence-badge=""
          className="absolute -top-2 -left-2 z-10 grid size-5 place-items-center rounded-full bg-foreground font-mono text-xs font-medium text-contrast tabular-nums shadow-sm"
        >
          {sliceSequence}
        </span>
      ) : null}
      {children}
    </Button>
  )
}
