import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { Check, Play } from 'lucide-react'
import { StoryboardWalkthroughShell } from '@/components/blueprint/StoryboardWalkthroughShell'
import { CanvasLoadProgress } from '@/components/editor/CanvasLoadProgress'
import {
  SliceHeaderBandSkeleton,
  SliceTabLoadingSkeleton,
} from '@/components/editor/EditorLoadingSkeletons'
import { NavbarZoomIndicator } from '@/components/editor/EditorZoomIndicator'
import { ServiceOverviewView } from '@/components/editor/ServiceOverviewView'
import { useMobileShell } from '@/hooks/useMobileShell'
import { SliceEditSession } from '@/components/editor/SliceEditSession'
import { SliceHeaderBand } from '@/components/editor/SliceHeaderBand'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { EditorDetailScope } from '@/contexts/EditorContext'
import { CanvasModeProvider } from '@/components/editor/CanvasModeProvider'
import { useCanvasMode } from '@/contexts/canvasModeContext'
import { SliceMembershipContext } from '@/contexts/sliceMembershipContext'
import { useViewState } from '@/contexts/viewStateStore'
import { useSliceBlueprint } from '@/hooks/useSliceBlueprint'
import { sliceFocusCellsKey } from '@/lib/canvasFocusCells'
import { resolveSliceCells } from '@/lib/sliceCells'
import { cn } from '@/lib/utils'

/**
 * Chrome that must neither re-focus nor de-focus the slice when clicked:
 * the cell detail panel, navbar, canvas nav, zoom chrome, and any open
 * walkthrough modal.
 */
/**
 * The slice waterfall's two stages, in ONE vocabulary for the whole chain.
 *
 * The bar is handed from these phases to the embedded canvas's own copy,
 * and the canvas used to relabel the first stage "Loading structure…" mid-
 * load — same surface, same skeleton session, two names for the same work.
 * `ServiceOverviewView` takes the first label as a prop so a slice keeps
 * saying "slice" all the way through.
 */
const SLICE_FIRST_STAGE_LABEL = 'Loading slice…'
const SLICE_LOAD_STAGES_INITIAL = [
  { label: SLICE_FIRST_STAGE_LABEL, done: false },
  { label: 'Loading blueprints…', done: false },
]
const SLICE_LOAD_STAGES_SCENARIO = [
  { label: SLICE_FIRST_STAGE_LABEL, done: true },
  { label: 'Loading blueprints…', done: false },
]

const FOCUS_CLICK_IGNORE =
  '[data-cell-detail-panel], [data-editor-navbar], [data-canvas-nav], [data-zoom-indicator], [data-annotation-toolbar], [data-storyboard-walkthrough-modal]'

type SliceViewProps = {
  sliceId: string
  /**
   * Where "Present" goes. Desktop's default opens a presentation tab; the
   * mobile shell has no tab strip, so it presents full-bleed instead.
   */
  onPresent?: (sliceId: string) => void
}

/**
 * Slice focus tab — the normal blueprint detail view (same zoom/pan canvas,
 * same cell panel) opened on the slice's scenario, with slice membership
 * applied on top: non-member cells dim via the `data-slice-focus` container
 * attribute + CSS, member cells carry outlines and sequence badges
 * (BlueprintCellButton reads SliceMembershipContext).
 */
export function SliceView({ sliceId, onPresent }: SliceViewProps) {
  // The provider sits above the surface, not inside the viewport, because the
  // slice tab itself has to know the mode: in Design mode the tab *is* the
  // editor, so the frame strip and the picker mount here rather than behind a
  // separate Edit button.
  return (
    <CanvasModeProvider>
      <SliceSurface sliceId={sliceId} onPresent={onPresent} />
    </CanvasModeProvider>
  )
}

function SliceSurface({ sliceId, onPresent }: SliceViewProps) {
  const { openTab } = useViewState()
  const mobileShell = useMobileShell()
  const {
    result,
    detail,
    items,
    scenarioResult,
    scenarioId,
    blueprint,
  } = useSliceBlueprint(sliceId)
  // One skeleton session for the whole slice → scenario → blueprints
  // waterfall: the stage that resolves the scenario and the canvas that
  // loads the blueprints hand the same skeleton back and forth.
  const skeletonHoldKey = `slice-tab:${sliceId}`

  const resolution = useMemo(
    () => resolveSliceCells(blueprint, items),
    [blueprint, items],
  )
  const membership = useMemo(
    () => ({
      memberCellIds: resolution.memberCellIds,
      sequenceByCellId: resolution.sequenceByCellId,
    }),
    [resolution],
  )

  const [focused, setFocused] = useState(true)
  const canvasMode = useCanvasMode()
  // Design mode is edit mode. Two overlapping "clicks mean something else"
  // states was one too many.
  const editing = canvasMode?.mode === 'design'
  const setMode = canvasMode?.setMode

  // Click vs drag discrimination: a drag-pan also fires a click on pointer
  // up, which must not toggle the focus dim. Track the pointer-down origin
  // (capture phase, before the viewport handles it) and treat anything that
  // moved more than a few pixels as a drag.
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null)
  const handleFocusPointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      pointerOrigin.current = { x: event.clientX, y: event.clientY }
    },
    [],
  )

  // Clicking a member cell (re-)focuses; clicking elsewhere on the canvas
  // lifts the dim. Capture phase, because interactive cells stop click
  // propagation before it would bubble here.
  const handleFocusClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const origin = pointerOrigin.current
      pointerOrigin.current = null
      if (
        origin &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5
      ) {
        // Drag-pan, not a click — leave the focus state alone.
        return
      }

      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target) return
      if (target.closest('[data-slice-member]')) {
        setFocused(true)
        return
      }
      if (target.closest(FOCUS_CLICK_IGNORE)) return
      setFocused(false)
    },
    [],
  )

  // Stage 0 — even the slice detail is still in flight, so the header band
  // has nothing to paint. The tab-shaped skeleton (band + canvas rectangle)
  // shares the surface's hold key, so stages 1–2 below inherit it unbroken.
  if (result.status === 'loading') {
    return (
      <DeferredSkeleton
        loading
        holdKey={skeletonHoldKey}
        skeleton={
          <div className="h-full" role="status" aria-label="Loading slice">
            {/* The slice waterfall's stages, over the same skeleton session
                the whole chain shares — and inside the CANVAS rectangle,
                which is where it stays for every phase below and for the
                embedded canvas after them. */}
            <SliceTabLoadingSkeleton>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <CanvasLoadProgress
                  progressKey={skeletonHoldKey}
                  stages={SLICE_LOAD_STAGES_INITIAL}
                />
              </div>
            </SliceTabLoadingSkeleton>
          </div>
        }
        className="h-full min-h-0"
      >
        {null}
      </DeferredSkeleton>
    )
  }

  if (!detail) {
    // The slice may have been deleted (possibly by another session) — close
    // any tabs pointing at it is left to the tab menu; show the message.
    return (
      <SliceViewMessage>
        {result.status === 'error'
          ? `This slice could not be loaded: ${result.message}`
          : 'This slice could not be loaded.'}
      </SliceViewMessage>
    )
  }

  if (!scenarioId && scenarioResult.status !== 'loading') {
    return (
      <SliceViewMessage>
        The cells in this slice could not be found in any blueprint.
      </SliceViewMessage>
    )
  }

  const header = (
    <SliceHeaderBand
      detail={detail}
      // Every cell reads as missing until the blueprint lands — the notice
      // stays out of the band rather than flashing a false count.
      missingCellCount={blueprint ? resolution.missingCellIds.length : 0}
      primaryAction={
        editing
          ? {
              label: 'Done',
              icon: Check,
              onClick: () => setMode?.('view'),
            }
          : {
              label: 'Present',
              icon: Play,
              onClick: () =>
                onPresent
                  ? onPresent(sliceId)
                  : openTab({ kind: 'present', sliceId }),
            }
      }
    />
  )

  /*
    Stage 2 — the owning scenario is still resolving, so the canvas cannot
    mount yet.

    The band stays a SKELETON here. It used to paint for real at this phase
    (the slice row is already cached from the sidebar, so it could), which
    made it the one piece of chrome that arrived before the canvas it
    belongs to — a finished banner over a rectangle still showing a loading
    bar. The band is canvas furniture like the toolbar: it waits, and both
    arrive on the beat the board opens its first layer.
  */
  if (!scenarioId) {
    return (
      <DeferredSkeleton
        loading
        holdKey={skeletonHoldKey}
        className="h-full min-h-0"
        skeleton={
          <SliceTabLoadingSkeleton>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <CanvasLoadProgress
                progressKey={skeletonHoldKey}
                stages={SLICE_LOAD_STAGES_SCENARIO}
              />
            </div>
          </SliceTabLoadingSkeleton>
        }
      >
        {null}
      </DeferredSkeleton>
    )
  }

  const canvas = (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col"
      // Editing lifts the dim: you cannot pick a cell you cannot see, and
      // the slice's own members are already marked by their badges.
      data-slice-focus={focused && !editing ? 'focused' : 'idle'}
      onPointerDownCapture={handleFocusPointerDownCapture}
      onClickCapture={editing ? undefined : handleFocusClickCapture}
    >
      <EditorDetailScope slideId={scenarioId}>
        <StoryboardWalkthroughShell>
          <div
            className="absolute inset-0 flex min-h-0 flex-col"
            data-editor-view
          >
            <ServiceOverviewView
              skeletonHoldKey={skeletonHoldKey}
              cameraStateKey={`${mobileShell ? 'mobile' : 'desktop'}:slice:${sliceId}`}
              focusCellsKey={sliceFocusCellsKey(sliceId)}
              soloScenarioId={scenarioId}
              renderHeader={() => header}
              renderHeaderSkeleton={() => <SliceHeaderBandSkeleton />}
              firstStageLabel={SLICE_FIRST_STAGE_LABEL}
              // Reset View is mobile-only (no wheel, easy to lose the
              // canvas); desktop slice tabs carry no float at all.
              floatingChrome={
                mobileShell ? (
                  <div className="rounded-full border border-border bg-card px-1">
                    <NavbarZoomIndicator />
                  </div>
                ) : undefined
              }
            />
          </div>
        </StoryboardWalkthroughShell>
      </EditorDetailScope>
      {!focused && !editing && (
        <SliceRefocusButton onRefocus={() => setFocused(true)} />
      )}
    </div>
  )

  return (
    <SliceMembershipContext.Provider value={membership}>
      {editing ? (
        <SliceEditSession detail={detail} onClose={() => setMode?.('view')}>
          {canvas}
        </SliceEditSession>
      ) : (
        canvas
      )}
    </SliceMembershipContext.Provider>
  )
}

/**
 * Floating refocus affordance at the bottom-center of the canvas, visible
 * only while de-focused. Carries `data-canvas-nav` so the outside-click
 * capture treats it as chrome (clicking it must not re-run de-focus logic).
 */
function SliceRefocusButton({ onRefocus }: { onRefocus: () => void }) {
  return (
    // bottom-16 clears the annotation toolbar docked at the bottom center.
    <div
      className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center"
      data-canvas-nav=""
    >
      <button
        type="button"
        onClick={onRefocus}
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2',
          'text-xs font-medium text-muted-foreground shadow-md transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <span aria-hidden>○</span>
        Showing all
        <span aria-hidden className="text-tertiary-foreground">
          ·
        </span>
        <span aria-hidden>⤺</span>
        Back to slice
      </button>
    </div>
  )
}

function SliceViewMessage({ children }: { children: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
