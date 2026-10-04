import {
  Fragment,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BlueprintCellDetailPanel } from '@/components/blueprint/BlueprintCellDetailPanel'
import { EntityDetailPanel } from '@/components/blueprint/EntityDetailPanel'
import { PhaseScenarioOverview } from '@/components/blueprint/PhaseScenarioOverview'
import { CanvasPhaseSection } from '@/components/editor/CanvasPhaseSection'
import { OverviewPhaseRowDivider } from '@/components/editor/OverviewPhaseRowDivider'
import {
  PhaseOverviewPhaseLoopArrow,
  PHASE_OVERVIEW_LOOP_CHANNEL_OFFSET,
} from '@/components/editor/PhaseOverviewPhaseLoopArrow'
import { CanvasEmptyState } from '@/components/editor/CanvasEmptyState'
import { CanvasLoadProgress } from '@/components/editor/CanvasLoadProgress'
import { ServiceOverviewCanvasSkeleton } from '@/components/editor/EditorLoadingSkeletons'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { NavbarZoomIndicator } from '@/components/editor/EditorZoomIndicator'
import { ServiceOverviewHeader } from '@/components/editor/ServiceOverviewHeader'
import { SlideStickyHeader } from '@/components/editor/SlideStickyHeader'
import { ZoomPanViewport } from '@/components/editor/ZoomPanViewport'
import {
  BlueprintCellDetailProvider,
  useBlueprintCellDetail,
} from '@/contexts/BlueprintCellDetailContext'
import { CanvasZoomChromeProvider } from '@/contexts/CanvasZoomChromeContext'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import {
  CANVAS_REVEAL_ARROWS,
  CANVAS_REVEAL_CELLS,
  CANVAS_REVEAL_DONE,
  CANVAS_REVEAL_LANES,
  CANVAS_REVEAL_PANELS,
} from '@/contexts/canvasRevealContext'
import { useEditor } from '@/contexts/EditorContext'
import { useViewState } from '@/contexts/viewStateStore'
import { usePhaseBlueprintFilters } from '@/hooks/usePhaseBlueprintFilters'
import { useMobileShell } from '@/hooks/useMobileShell'
import { cn } from '@/lib/utils'
import { isBlueprintCellDetailEnabled } from '@/lib/blueprintDisplayFlags'
import {
  getCanvasFocusFitInsets,
  getCanvasFocusMaxZoom,
  getCanvasFocusSelector,
} from '@/lib/canvasFocus'
import {
  OVERVIEW_CANVAS_PADDING_X,
  OVERVIEW_CANVAS_PADDING_Y,
} from '@/lib/overviewLayout'
import { collectOverviewPathOptionsForScenarios } from '@/lib/overviewPathFilters'
import {
  getMainSlides,
  getParentSlide,
  getSlideDisplayLabel,
  getOverviewPostToPreLoopTransition,
  getSubslides,
  isOverviewFlowArrowAnchorPhase,
  shouldShowOverviewPhaseFlowArrow,
  isSubslide,
  type NavItem,
  type SlideViewType,
} from '@/types/nav'
import {
  getBlueprintArtboardSize,
  type ArtboardSize,
} from '@/lib/blueprintLayout'
import type { BlueprintData } from '@/types/blueprint'
import {
  MOTION_CAMERA_MS,
  MOTION_FADE_MS,
  MOTION_STRUCTURAL_MS,
  prefersReducedMotion,
} from '@/lib/motion'
import {
  getFocusedComparisonCameraKey,
  getMinFitZoom,
  getSemanticZoomThreshold,
} from '@/lib/canvasCameraPolicy'
import type { PathListItem } from '@/lib/pathSelection'

/**
 * Which element's `transitionend` is allowed to close each reveal stage.
 *
 * The chain is event-driven and `transitionend` bubbles, so without this the
 * handler on the board root treats any opacity transition in the subtree as
 * its cue — including every hover the board carries. Keyed by the stage
 * being waited out, so stage N only listens to the layer stage N opened.
 */
const REVEAL_ROOT_SOURCE = ':scope'
const REVEAL_STAGE_SOURCE: Record<number, string | undefined> = {
  [CANVAS_REVEAL_LANES]: REVEAL_ROOT_SOURCE,
  [CANVAS_REVEAL_PANELS]: '[data-phase-scenario-panel]',
  [CANVAS_REVEAL_CELLS]: '[data-blueprint-cell-anchor], [data-blueprint-cell]',
  [CANVAS_REVEAL_ARROWS]: '[data-blueprint-arrows]',
}

const OVERVIEW_PAN_IGNORE =
  // Interactive CHROME only — container-wide entries (compare panel, phase
  // section/overview wrappers) used to be here too, which made every drag
  // that started inside a path board a dead drag: empty board space must
  // pan like the rest of the canvas.
  "button, a, input, textarea, select, label, [role='button'], [data-slide-sticky-header], [data-zoom-indicator], [data-annotation-toolbar], [data-canvas-annotation-layer], [data-canvas-phase-interactive], [data-phase-menubar-header], [data-path-summary-trigger], [data-cell-detail-panel], [data-blueprint-cell-interactive], [data-slot='menubar'], [data-slot='menubar-trigger'], [data-canvas-nav]"

function CanvasFocusEscapeHandler() {
  const { view, goHome } = useEditor()
  const { isOpen: cellDetailOpen } = useBlueprintCellDetail()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || view !== 'detail') return
      if (event.defaultPrevented) return
      if (cellDetailOpen) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }

      if (
        document.querySelector(
          '[data-storyboard-walkthrough-modal], [role="dialog"][data-state="open"]',
        )
      ) {
        return
      }

      event.preventDefault()
      goHome()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cellDetailOpen, goHome, view])

  return null
}

type ServicePhaseSectionProps = {
  phase: NavItem
  slides: NavItem[]
  pathsByScenario: Map<string, PathListItem[]>
  blueprintsByPathId: Map<string, BlueprintData>
  getSelectedPathIds: (scenarioId: string, paths: PathListItem[]) => string[]
  displayViewType: SlideViewType
  showFlowArrow?: boolean
  isFlowArrowAnchor?: boolean
  isLoopArrowFrom?: boolean
  isLoopArrowTo?: boolean
  dimmed?: boolean
  focusedScenarioId?: string | null
  focusActive?: boolean
  /** Slice-tab scope: mount only this scenario's artboard within the phase. */
  onlyScenarioId?: string | null
  /** OPTIONAL: mobile passes nothing — the drawer owns navigation there. */
  onOpenPhase?: (phaseId: string) => void
  /** OPTIONAL, and the same gate one level down: opens a scenario. */
  openScenario?: (scenarioId: string) => void
  getScenarioDisplayViewType: (scenario: NavItem) => SlideViewType | undefined
}

function ServicePhaseSection({
  phase,
  slides,
  pathsByScenario,
  blueprintsByPathId,
  getSelectedPathIds,
  displayViewType,
  onOpenPhase,
  openScenario,
  getScenarioDisplayViewType,
  showFlowArrow = false,
  isFlowArrowAnchor = false,
  isLoopArrowFrom = false,
  isLoopArrowTo = false,
  dimmed = false,
  focusedScenarioId = null,
  focusActive = false,
  onlyScenarioId = null,
}: ServicePhaseSectionProps) {
  const label = getSlideDisplayLabel(phase, slides)
  const summary =
    phase.summary ?? 'Scenarios in this phase and how they connect.'

  return (
    <CanvasPhaseSection
      title={label}
      ordinal={phase.index}
      summary={summary}
      phaseId={phase.id}
      variant="overview"
      showFlowArrow={showFlowArrow}
      isFlowArrowAnchor={isFlowArrowAnchor}
      isLoopArrowFrom={isLoopArrowFrom}
      isLoopArrowTo={isLoopArrowTo}
      dimmed={dimmed}
      focusActive={focusActive}
      onNavigate={onOpenPhase ? () => onOpenPhase(phase.id) : undefined}
    >
      <PhaseScenarioOverview
        phase={phase}
        slides={slides}
        variant="overview"
        alignPanelHeights
        pathsByScenario={pathsByScenario}
        blueprintsByPathId={blueprintsByPathId}
        getSelectedPathIds={getSelectedPathIds}
        displayViewType={displayViewType}
        focusedScenarioId={focusedScenarioId}
        onlyScenarioId={onlyScenarioId}
        loading={false}
        openDetail={openScenario}
        getScenarioDisplayViewType={getScenarioDisplayViewType}
      />
    </CanvasPhaseSection>
  )
}

type ServiceOverviewViewProps = {
  /**
   * Shares this view's skeleton session with an embedding surface, so a
   * waterfall that resolves upstream (slice → scenario → blueprints) holds
   * one skeleton across the hand-off instead of restarting it.
   */
  skeletonHoldKey?: string
  /**
   * Slice-tab scope: only this scenario's artboard (inside its own phase
   * frame) mounts — neighboring scenarios/phases, service arrows, and the
   * prev/next sequence nav all stay out of the canvas. Zoom/pan unchanged.
   */
  soloScenarioId?: string
  /**
   * Narrows the board to one phase's scenarios. `soloScenarioId` narrows all
   * the way to a single scenario; this is the step above it, and it is what
   * the mobile Map uses — a phone asks "show me this stretch of the service",
   * never "render all 800 cells".
   */
  soloPhaseId?: string
  /**
   * Embedding tabs (slice focus) replace the built-in docked navbar header
   * with their own band. Rendered inside the canvas zoom chrome provider.
   */
  renderHeader?: () => ReactNode
  /**
   * Placeholder for `renderHeader`, held until the board opens its first
   * layer. An embedding band is canvas furniture like the annotation
   * toolbar: it must not paint finished over a canvas that is still behind
   * a loading bar, which is what a slice tab's band used to do.
   */
  renderHeaderSkeleton?: () => ReactNode
  /**
   * First stage's label on the load bar. The bar is handed from an
   * embedding surface's own phases to this canvas's copy, and a surface
   * that calls the work "slice" must not have it renamed "structure"
   * halfway through one load.
   */
  firstStageLabel?: string
  /** Floating chrome anchored bottom-right inside the canvas (slice tabs' Reset View). */
  floatingChrome?: ReactNode
  /**
   * Report this canvas's reveal stage to whatever must arrive with it —
   * today the shell's sidebar boot layer.
   *
   * Only the shell's BASE canvas passes one: it is the only mount that
   * shares a boot with the sidebar. A slice tab or the phone shell mounting
   * this view is a navigation, not a boot, and reporting from there covered
   * a populated sidebar with its loading skeleton on every tab switch. The
   * callback IS the permission — there is no global to publish into and no
   * flag to get wrong.
   */
  onRevealStage?: (stage: number) => void
  /** Session-local identity for restoring this canvas after a tab remount. */
  cameraStateKey?: string
  /**
   * Override the viewport's `focusCells` registry key. Slice tabs pass a
   * slice-stable key so a presentation badge can leave a pending focus that
   * this viewport consumes when it registers — the tab descriptor carries
   * no cell. Without an override the key is the focused (or solo) scenario.
   */
  focusCellsKey?: string
  /**
   * Height of an opaque surface sitting on this canvas's bottom edge, in px.
   *
   * The phone's agent sheet is the one that passes it: it owns the lower 60%
   * of the screen and stays open across a jump, so a fit that framed the
   * whole viewport put the destination behind it. Desktop's dock is beside
   * the canvas, not over it, and passes nothing.
   */
  occludedBottomPx?: number
  /** Notifies an embedding transition after this destination is fitted. */
  onInitialFitReady?: () => void
}

/**
 * The overview canvas — every phase and scenario on one zoomable board.
 * `renderHeader` and `floatingChrome` let an embedding tab (slice focus) swap
 * the docked header and add its own canvas-anchored controls.
 */
function ServiceOverviewViewImpl({
  skeletonHoldKey,
  soloScenarioId,
  soloPhaseId,
  renderHeader,
  renderHeaderSkeleton,
  firstStageLabel = 'Loading structure…',
  floatingChrome,
  onRevealStage,
  cameraStateKey,
  focusCellsKey: focusCellsKeyOverride,
  occludedBottomPx = 0,
  onInitialFitReady,
}: ServiceOverviewViewProps = {}) {
  const overviewRef = useRef<HTMLDivElement>(null)
  const [overviewEl, setOverviewEl] = useState<HTMLDivElement | null>(null)
  const mobileShell = useMobileShell()
  const {
    slides,
    slidesLoading,
    slidesError,
    openDetail,
    goHome,
    view,
    activeSlide,
    cameraTargetId,
    focusNonce,
    getScenarioDisplayViewType,
    setScenarioDisplayViewType,
    skipCanvasFitAnimation,
    consumeCanvasFitAnimationSkip,
  } = useEditor()

  /*
    A canvas click is a transition.

    Opening a scenario re-renders the phase bodies for the new focus. Marked
    as a transition, that render yields to input instead of holding the frame
    the click landed on. The camera loses nothing by it: its flight starts
    from the first frame drawn after the commit (`createCameraFlightPlan`),
    not from the click.
  */
  const openCanvasDetail = useCallback(
    (slideId: string) => {
      startTransition(() => openDetail(slideId))
    },
    [openDetail],
  )

  /*
    THE CANVAS DOES NOT NAVIGATE ON A PHONE.

    Every move between scenarios and between phases belongs to the drawer
    there. Scoping the mobile canvas to one scenario already removes the
    siblings you could tap, but that is a statement about what is currently
    rendered, and this is a statement about what a tap MEANS — the two want
    to be separate, because it is the second one that survives someone
    widening the scope later. It also covers the phase frame, which is a
    navigation target of its own and is not a scenario at all.

    One gate, at the view that owns the canvas, rather than a second
    `useMobileShell()` inside the phase frame: the frame and the scenario
    panels inside it were answering the same question in two places, and only
    one of the two covered the frame.

    Undefined rather than a no-op: `navigable` in `ResizableComparePanel` and
    `CanvasPhaseSection` is gated on the handler existing, so this makes the
    surfaces genuinely inert — no `role="button"`, no pointer cursor, no
    aria-label promising a destination — instead of buttons that swallow
    taps. Panning and pinching over them are unaffected; the pan handler
    never consulted these.
  */
  const canvasNavigate = mobileShell ? undefined : openCanvasDetail

  const allPhases = useMemo(() => getMainSlides(slides), [slides])
  const soloPhase = useMemo(() => {
    if (soloScenarioId)
      return (
        allPhases.find((phase) =>
          getSubslides(phase.id, slides).some(
            (scenario) => scenario.id === soloScenarioId,
          ),
        ) ?? null
      )
    if (soloPhaseId)
      return allPhases.find((phase) => phase.id === soloPhaseId) ?? null
    return null
  }, [allPhases, slides, soloScenarioId, soloPhaseId])
  const phases = useMemo(
    () => (soloPhase ? [soloPhase] : allPhases),
    [allPhases, soloPhase],
  )
  // A stable scope identity is load-bearing for render isolation: rebuilding
  // this array on every navigation recreates the path-selection callbacks,
  // which defeats the phase bodies' memo and reconciles every one of them
  // before the camera can draw its first frame.
  const scenarioIds = useMemo(
    () =>
      soloScenarioId
        ? [soloScenarioId]
        : soloPhase
          ? getSubslides(soloPhase.id, slides).map((scenario) => scenario.id)
          : slides
              .filter((slide) => isSubslide(slide))
              .map((slide) => slide.id),
    [slides, soloPhase, soloScenarioId],
  )
  const isDetail = view === 'detail'
  /*
    Detail view with no active slide is not a state the reader can navigate
    into — it is a connected workspace whose phases have not arrived yet, or
    which has none, while the selection still names something. Nothing is
    focused there, which is what the overview's own value already is.
  */
  const focusedScenarioId =
    isDetail && activeSlide && isSubslide(activeSlide) ? activeSlide.id : null
  const focusedPhaseId =
    isDetail && activeSlide
      ? isSubslide(activeSlide)
        ? getParentSlide(activeSlide, slides)?.id
        : activeSlide.id
      : null

  const {
    pathsByScenario,
    blueprintsByPathId,
    loading: blueprintsLoading,
    progress: blueprintsProgress,
    layout: overviewViewType,
    resolveDrawnPathIds,
  } = usePhaseBlueprintFilters({
    scenarioIds,
    slides,
    getScenarioDisplayViewType,
    setScenarioDisplayViewType,
    focusedScenarioId,
  })

  /*
    What the canvas draws, gathered — across the whole scope, and for the
    focused scenario alone. A phase row is a survey, one happy path per
    scenario, and the focused scenario draws the reader's selection. That
    rule is `resolveDrawnPathIds`, and everything here reads it rather than
    the selection store, so the panels, the camera and the header can never
    disagree about what is on screen.
  */
  const drawnPathIds = useMemo(() => {
    const ids: string[] = []
    for (const [scenarioId, paths] of pathsByScenario) {
      ids.push(...resolveDrawnPathIds(scenarioId, paths))
    }
    return ids
  }, [pathsByScenario, resolveDrawnPathIds])
  const focusedDrawnPathIds = useMemo(() => {
    if (!focusedScenarioId) return []
    return resolveDrawnPathIds(
      focusedScenarioId,
      pathsByScenario.get(focusedScenarioId) ?? [],
    )
  }, [focusedScenarioId, pathsByScenario, resolveDrawnPathIds])

  const overviewReady = !slidesLoading && !blueprintsLoading
  // Content holds until the bar has visibly REACHED 100%: readiness flips
  // the bar to full, and the reveal follows a beat later — loading ends at
  // a full bar, never mid-bar.
  // Lazy init + the sawLoading ref: a WARM mount (everything cached,
  // ready on first render) settles instantly — the 450 ms full-bar dwell
  // only applies when this mount actually showed a loading pass, else
  // every tab-switch back would flash a skeleton that used to be instant.
  const [overviewSettled, setOverviewSettled] = useState(() => overviewReady)
  const sawLoadingRef = useRef(!overviewReady)
  useEffect(() => {
    if (!overviewReady) sawLoadingRef.current = true
    const timer = window.setTimeout(
      () => setOverviewSettled(overviewReady),
      overviewReady && sawLoadingRef.current ? 450 : 0,
    )
    return () => window.clearTimeout(timer)
  }, [overviewReady])
  // One session for the canvas skeleton AND the progress overlay: they are
  // separate DeferredSkeleton instances (canvas space vs screen space), and
  // only a shared key makes them appear and leave as one surface.
  const canvasHoldKey = skeletonHoldKey ?? 'service-overview-canvas'
  const fitSelector = getCanvasFocusSelector(view, activeSlide)
  const maxFitZoom = getCanvasFocusMaxZoom(view)
  const fitInsets = getCanvasFocusFitInsets(view, occludedBottomPx)
  // The phone's fit floor. A phase board is far wider than a phone, so an
  // unfloored fit lands around 0.2 — under the semantic threshold, which is
  // why the default view arrived as a grid of grey blocks with nothing to
  // read. Floored, the camera frames the board's top-left at a legible
  // scale and the reader pans from there. Desktop keeps the true fit: a
  // laptop can hold a whole phase at a readable size.
  const cameraSurface = {
    mobileShell,
    isDetail,
    // The focused scenario's own count: a phase row draws one path per
    // scenario, and a row of surveys is not a comparison.
    selectedPathCount: focusedDrawnPathIds.length,
  }
  const minFitZoom = getMinFitZoom(cameraSurface)
  const semanticZoomThreshold = getSemanticZoomThreshold(cameraSurface)

  /*
    Skeleton geometry — real phase count and real scenarios per phase from
    nav metadata, plus the REAL panel size for any scenario whose blueprint
    has already landed.

    The camera pre-fits against these frames, so how close they are to the
    finished board is exactly how far the camera has to move afterwards. A
    scenario panel's size is not a guess: `getBlueprintArtboardSize` derives
    it from the blueprint's step count and lane/divider/corridor counts,
    all fixed constants. The estimator used to ignore that and assume a flat
    640 x min-height per scenario, which on a real board was ~2.4x off — and
    that error IS the corrective zoom the reveal was built to hide.

    Nav metadata still carries the shape while blueprints are in flight, so
    the estimate improves as the data arrives rather than waiting for it.
  */
  const skeletonPhases = useMemo(
    () =>
      phases.map((phase) => {
        const scenarios = soloScenarioId
          ? [soloScenarioId]
          : getSubslides(phase.id, slides).map((slide) => slide.id)
        const panels = scenarios
          .map((scenarioId) => {
            const paths = pathsByScenario.get(scenarioId) ?? []
            const blueprint = paths
              .map((path) => blueprintsByPathId.get(path.id))
              .find((entry): entry is BlueprintData => entry !== undefined)
            return blueprint ? getBlueprintArtboardSize(blueprint) : null
          })
          .filter((size): size is ArtboardSize => size !== null)
        return {
          id: phase.id,
          scenarioCount: scenarios.length,
          ...(panels.length === scenarios.length && panels.length > 0
            ? {
                panelWidth: Math.max(...panels.map((size) => size.width)),
                panelHeight: Math.max(...panels.map((size) => size.height)),
              }
            : {}),
        }
      }),
    [blueprintsByPathId, pathsByScenario, phases, slides, soloScenarioId],
  )

  // Camera key. Path selection is stable in overview, where it behaves like a
  // filter. Inside a focused scenario it changes the comparison's geometry,
  // so it becomes an explicit camera-layout event: the viewport eases to the
  // new fitted frame instead of letting ResizeObserver snap there afterward.
  // `focusNonce` bumps on each nav click so re-selecting the current row also
  // recenters after panning away.
  const focusedComparisonCameraKey = getFocusedComparisonCameraKey({
    isFocusedScenario: activeSlide !== null && isSubslide(activeSlide),
    selectedPathIds: focusedDrawnPathIds,
    displayViewType: activeSlide
      ? (getScenarioDisplayViewType(activeSlide) ?? 'stacked')
      : 'stacked',
  })
  const fitKey = overviewReady
    ? `service-canvas:${view}:${cameraTargetId ?? 'none'}:${phases.length}-${scenarioIds.length}:${focusNonce}:${focusedComparisonCameraKey}`
    : `service-canvas:loading:${skeletonPhases.map((phase) => phase.scenarioCount).join('-') || 'unknown'}`
  const cameraDestinationKey = overviewReady
    ? `service-canvas:${view}:${cameraTargetId ?? 'none'}:${phases.length}-${scenarioIds.length}:${focusedComparisonCameraKey}`
    : fitKey

  /*
    The cell-detail panel clears its selection when this changes, so it must
    track NAVIGATION only — never the camera's own bookkeeping. `fitKey` flips
    once when the skeleton swaps to content, which is not a navigation, and
    using it here silently deselected any cell picked in the first moments
    after a load.

    The workspace tab is in it because leaving the board IS a navigation, and
    the loudest one available. The board stays mounted behind a slice or a
    presentation — deliberately, so entering one is smooth — and the drawer
    lives inside it, so an open cell used to float over the slides describing
    a row that was no longer on screen, with closing it the only way out.
    Every other part of this key is a fact about moving around WITHIN a board,
    which is why activating a tab changed none of them.

    That settles the question the panel's placement leaves open: an open cell
    is a fact about the BOARD, not about the workspace. Leaving the board drops
    it, and `openCellStore` follows, so the address bar stops claiming a cell
    is open while nothing is showing.
  */
  const { activeKey } = useViewState()
  const cellDetailResetKey = `service-canvas:${activeKey ?? 'board'}:${view}:${cameraTargetId ?? 'none'}:${focusNonce}`

  /*
    The entity panel clears on the same navigations, from up here.

    Its provider is the shell's now — it has to span the sidebar and the chrome
    — so it can no longer take this key as a prop. The canvas keeps the reset
    anyway: an entity panel describes a lane, phase, scenario or step of the
    board being looked at, and a navigation can leave it describing something
    that is no longer on screen. Guarded against the FIRST run, which the prop
    version never had to be: a panel opened from the sidebar is already open
    when this canvas mounts, and closing it would undo the click that opened it.
  */
  const { closeEntity } = useEntityDetail()
  const closedForKey = useRef(cellDetailResetKey)
  useEffect(() => {
    if (closedForKey.current === cellDetailResetKey) return
    closedForKey.current = cellDetailResetKey
    closeEntity()
  }, [cellDetailResetKey, closeEntity])

  // Every fit up to and including the swap to content is a jump. The
  // skeleton fit frames a fresh mount (animating it would swoop in from
  // pan 0,0 / zoom 1) and the swap fit only corrects the skeleton's
  // approximate geometry under the 200 ms content fade — neither is a
  // navigation, so neither animates. Navigations after that do.
  const [contentSettled, setContentSettled] = useState(false)
  useEffect(() => {
    if (!overviewReady || contentSettled) return
    // Deferred to a microtask so this render does not cascade: the fit for
    // the swap commit was already scheduled (by the viewport's effect,
    // which runs first) with animation off, and the flag only needs to be
    // true by the time the *next* navigation changes the fit key.
    queueMicrotask(() => setContentSettled(true))
  }, [contentSettled, overviewReady])

  /*
   * Progressive reveal — landing only (per mount; navigations never re-run
   * it, a board already on screen must not have its data vanish).
   *
   * The contract, in order:
   *
   *   A  loading    progress bar in screen space; board mounted but
   *                   invisible (stage 0). Queries land.
   *   B  staging     THE BAR IS STILL UP. Layout settles, the camera snaps
   *                   to its final fit — every adjustment happens behind a
   *                   surface that is already there, so none is ever seen.
   *                   Nothing on screen changes; the bar is simply working.
   *   C  handoff     bar dissolves FIRST, over one full beat, board still
   *                   hidden. Only once it has gone do the lanes begin.
   *                   Sequential, not a crossfade: two opacity animations
   *                   over the same pixels read as a flash. And never a
   *                   gap either — the bar is up until the beat it leaves.
   *   ── layout goes quiet ──    nothing below starts until the board has
   *                               stopped resizing, so the camera is FIXED
   *                               before anything detailed exists to see
   *   D  disclosure, each arrival overlapping the next beat:
   *        stage 1  phase frames + lane structure
   *        stage 2  scenario panels rise in
   *        stage 3  cells fade in
   *        stage 4  dependency arrows fade in
   *        stage 5  done — attribute removed, reveal CSS stops matching
   *
   * The stability gate is what was missing in earlier cuts: beats keyed off
   * the content swap alone ran while the board was still growing, so the
   * camera's corrective moves played mid-reveal as a zoom nobody asked for.
   * A ResizeObserver on the board plus one quiet interval (a fade beat)
   * orders them strictly: camera first, then curtain.
   */
  const [revealStage, setRevealStage] = useState(0)
  /**
   * The bar's own dissolve, which STARTS the chain. Everything after it is
   * driven by the previous layer finishing, not by a clock.
   */
  const [barDissolving, setBarDissolving] = useState(false)
  const revealStartedRef = useRef(false)
  /**
   * Highest stage already advanced out of.
   *
   * A PERFORMANCE guard, not a correctness one — worth stating precisely,
   * because it looks like the latter. Hundreds of cells finish their fade in
   * the same frame and each bubbles a `transitionend`, but every handler in
   * that burst closes over the same `revealStage` and so calls `setState`
   * with an identical value, which React bails out of on its own. What this
   * saves is ~600 no-op state calls per layer on a full board; what it does
   * not do is make a late event from an earlier stage harmless, because
   * such an event carries the stage it was captured at and is refused by
   * the same comparison.
   */
  const advancedRef = useRef(-1)
  /*
   * Publish the stage for the surfaces outside this canvas that have to
   * arrive with it — today the sidebar's boot layer.
   *
   * OPT-IN, and only the shell's base canvas opts in. Every mount used to
   * publish, and this component also backs slice tabs and the phone shell:
   * switching between a slice tab and the workspace remounted it, published
   * stage 0, and dropped the sidebar's full boot skeleton over an already
   * populated sidebar for ~450 ms on an ordinary tab switch. Nothing in the
   * sidebar is loading there — only the shell's own boot has a sidebar to
   * wait for.
   *
   * A LAYOUT effect, deliberately: the base canvas mounts in the same commit
   * the reader leaves the cover page, and a stage published after paint
   * would let the sidebar paint one frame of finished rows before flipping
   * to its skeleton. Reset to done on unmount so a sidebar that outlives
   * this canvas is never stranded on a skeleton.
   */
  useLayoutEffect(() => {
    if (!onRevealStage) return
    onRevealStage(revealStage)
    /*
      The reset rides the SAME phase as the write. It used to be a passive
      effect, and React flushes passive destroys for a deleted tree after
      the commit that replaced it — so a canvas handing over to another
      publishing canvas would go: new canvas's layout effect writes 0, paint,
      then the OLD canvas's passive cleanup writes DONE over it. The store
      would claim the boot was finished while the live canvas still had its
      loading bar up, and the new canvas would never republish 0 because its
      deps had not changed. Only one mount publishes today, so this was
      latent rather than live; same-phase writes retire the hazard instead
      of relying on that staying true.
    */
    return () => onRevealStage(CANVAS_REVEAL_DONE)
  }, [onRevealStage, revealStage])

  const advanceReveal = useCallback((from: number) => {
    if (from < CANVAS_REVEAL_LANES || from >= CANVAS_REVEAL_DONE) return
    if (advancedRef.current >= from) return
    advancedRef.current = from
    setRevealStage(from + 1)
  }, [])

  /*
   * EVENT-CHAINED, not timed. Each layer opens because the previous one
   * finished — `transitionend` bubbling from the board root — so the
   * sequence cannot drift when a frame is slow or a stage is heavier than
   * its budget, and no two layers can ever animate at once. Timers survive
   * only as a watchdog: if a layer has nothing to animate (a board with no
   * arrows, a cancelled transition) its event never arrives, and the chain
   * must not stall there.
   */
  useEffect(() => {
    if (revealStage >= CANVAS_REVEAL_DONE) return
    /*
      STAGE 0 IS COVERED TOO, and that is the important part.

      Stage 0 used to have no floor: its only exits were the bar's
      `transitionend` and a handoff timer owned by the gate effect below.
      That effect latches `revealStartedRef` BEFORE its timers resolve and
      clears those timers in its cleanup — so if its deps changed in the
      window between (a background refetch flipping `overviewSettled`, which
      unmounts the board and nulls `overviewEl`), the re-run hit the latch,
      returned early, and rescheduled nothing. `barDissolving` was already
      true, so no property changed and no `transitionend` ever came. The
      board stayed `visibility: hidden` forever, and the shell's boot layer —
      keyed on `revealStage < 1` — stayed opaque over the sidebar with
      `role="status"` announcing "Loading the workspace". A dead app, one
      stray refetch away, recoverable only by reload.

      This watchdog keys on `revealStage`, not on a latch, so it re-arms on
      every re-run and cannot be stranded by one. Stage 0's budget is the
      whole staging window (the gate's own hard cap plus a margin) so it
      only ever fires when the gate has genuinely failed to.
    */
    const watchdog = window.setTimeout(
      () => {
        if (revealStage === 0) {
          setRevealStage((stage) => (stage === 0 ? 1 : stage))
          return
        }
        advanceReveal(revealStage)
      },
      revealStage === 0 ? MOTION_CAMERA_MS * 8 : MOTION_STRUCTURAL_MS * 2,
    )
    return () => window.clearTimeout(watchdog)
  }, [revealStage, advanceReveal])

  useEffect(() => {
    /*
      Keyed on `overviewSettled` + `overviewEl`, NOT on `contentSettled`.
      `contentSettled` flips the moment the data is ready — up to 450ms
      BEFORE DeferredSkeleton mounts the board. Keyed there, this effect ran
      while `overviewRef.current` was null: the observer observed nothing,
      the quiet timer fired unopposed, and the whole choreography played out
      against an unmounted board — which then mounted fully visible at a
      mid-layout framing and was corrected in plain view.
    */
    if (!overviewSettled || !overviewEl || revealStartedRef.current) return
    /*
      A WARM MOUNT STILL WAITS. Tried and reverted.

      A review flagged that keying the bar on the reveal hands warm mounts a
      ceremony they used to be spared, and proposed jumping straight to done
      when `sawLoadingRef` never tripped. That reads correct and is wrong
      here: the stability gate is not covering the DATA wait, it is covering
      the CAMERA. Layout settles and the fit snaps after mount whether or not
      a query was in flight, so skipping the gate on a warm load put the
      board on screen at whatever framing existed at mount — which is the
      "random landing, zoomed into the middle of nowhere" this whole
      choreography was built to remove. Verified by reverting it and watching
      the board come back fitted.

      The honest cost is a beat of ceremony on an instant load. The
      alternative is the bug.
    */
    if (prefersReducedMotion()) {
      revealStartedRef.current = true
      const timer = window.setTimeout(() => {
        setBarDissolving(true)
        advancedRef.current = CANVAS_REVEAL_DONE
        setRevealStage(CANVAS_REVEAL_DONE)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    let stabilityTimer = 0
    let handoffTimer = 0
    let disposed = false
    const begin = () => {
      if (revealStartedRef.current) return
      revealStartedRef.current = true
      observer.disconnect()
      // Only the bar dissolves here. Stage 1 waits for it to finish (the
      // bar's own `onTransitionEnd`), and every stage after that waits for
      // the layer before it.
      setBarDissolving(true)
      // Watchdog for the handoff itself: if the bar never transitions (it
      // was never shown on a warm load, so there is nothing to fade), the
      // chain still has to start.
      handoffTimer = window.setTimeout(() => {
        setRevealStage((stage) => (stage === 0 ? 1 : stage))
      }, MOTION_FADE_MS * 2)
    }
    /*
      One camera beat of quiet, after the fonts have landed. The window can
      be short because the LOADING BAR covers it: the wait is honest progress
      rather than a dead canvas.
    */
    const arm = () => {
      window.clearTimeout(stabilityTimer)
      stabilityTimer = window.setTimeout(begin, MOTION_CAMERA_MS)
    }
    const observer = new ResizeObserver(arm)
    /*
      Optional-chained and caught: fonts are ADVISORY here — they are one
      more reason the board might still reflow, not a precondition for
      showing it. jsdom does not implement `document.fonts` at all, so the
      bare read threw inside an effect (which React escalates to unmounting
      the tree) in any component test that rendered this view.
    */
    const fontsReady = document.fonts?.ready ?? Promise.resolve()
    void fontsReady
      .catch(() => undefined)
      .then(() => {
        if (disposed || revealStartedRef.current) return
        observer.observe(overviewEl)
        arm()
      })
    /*
      Hard cap. The bar is gated on this reveal rather than on the data, so
      a board that never goes quiet would strand it on screen forever.
    */
    const capTimer = window.setTimeout(begin, MOTION_CAMERA_MS * 6)
    return () => {
      disposed = true
      window.clearTimeout(stabilityTimer)
      window.clearTimeout(handoffTimer)
      window.clearTimeout(capTimer)
      observer.disconnect()
    }
  }, [overviewSettled, overviewEl])

  /*
    The reader cleared every path in the scenario they are inside.

    A phase row always draws its happy paths, so this is never "the row is
    empty" — it is the focused scenario drawing nothing. Left to the row, that
    scenario would simply drop out of it while still being the camera's
    target; the empty state names what happened and offers the way back.
    Without a focus, only a scope where nothing draws at all qualifies.
  */
  const focusedPaths = focusedScenarioId
    ? (pathsByScenario.get(focusedScenarioId) ?? [])
    : []
  const noPathsSelected = focusedScenarioId
    ? focusedPaths.length > 0 && focusedDrawnPathIds.length === 0
    : pathsByScenario.size > 0 && drawnPathIds.length === 0

  /*
    A connected workspace with no phases in it.

    Unreachable while an empty read fell back to the template's sample nav:
    the canvas always had somebody's phases to draw — this template's,
    wearing the deployment's name. Since a connected database became the
    whole truth, a configured deployment's board is its rows and nothing
    else, so "there are no rows" is a state the reader can be in, and it
    needs to say so rather than render as blank canvas.

    Gated on `overviewReady`, which is what separates it from the OTHER way
    this array is empty: the first fetch, still in flight. That one is the
    progress bar's, and the two must never be confused on screen — a reader
    told "no phases" during a slow load would go looking for a database
    problem that does not exist.
  */
  const noPhases = overviewReady && phases.length === 0

  const handleInitialFitReady = useCallback(() => {
    // Loading-skeleton fits are not a destination. The callback is still
    // passed from the first render so the content fit cannot finish in the
    // layout-effect window before a passive `contentSettled` flip supplies it.
    if (overviewReady) onInitialFitReady?.()
  }, [onInitialFitReady, overviewReady])

  useLayoutEffect(() => {
    // Neither placeholder mounts a viewport, so neither will ever report a
    // fit of its own — the surface is as ready as it is going to get.
    if (contentSettled && (noPathsSelected || noPhases)) onInitialFitReady?.()
  }, [contentSettled, noPathsSelected, noPhases, onInitialFitReady])

  const postToPreLoop = soloPhase
    ? null
    : getOverviewPostToPreLoopTransition(phases)
  const cellDetailBlueprints = useMemo(
    () => [...blueprintsByPathId.values()],
    [blueprintsByPathId],
  )
  // Cells open the detail panel only when a SCENARIO is the focus — either
  // selected in the base view or scoped by a slice tab (soloScenarioId).
  // Everywhere wider (overview zoom, a phase's row of boards) cells stay
  // inert, so clicks fall through to the scenario/phase panels and navigate.
  // Phase-level detail used to qualify, which reintroduced the "panel opens
  // from the zoomed-out view" bug this gate exists to prevent.
  const cellDetailEnabled =
    isBlueprintCellDetailEnabled() &&
    isDetail &&
    (focusedScenarioId !== null || soloScenarioId != null)
  /*
    WHICH scenario that is. `cellDetailEnabled` is one boolean for the whole
    canvas and every scenario board stays mounted behind the focused one, so
    the flag alone says "live" to all of them — every lane header and step
    header wearing hover and a pointer, and a click on any of them opening a
    panel reading "Nothing recorded for this lane yet." Each board compares
    this id against its own (see `scenarioBoardScopeContext`), so only the
    board the reader chose carries live axis headers.
  */
  const cellDetailScenarioId = focusedScenarioId ?? soloScenarioId ?? null

  const focusedHeader = useMemo(() => {
    // No slide is no header. The band names the scenario or phase the reader
    // is inside, and there is nothing to name.
    if (!isDetail || !activeSlide) return null

    /*
      Paths only when a SCENARIO is focused. A phase header offers none: its
      row draws one happy path per scenario, and there is nothing to choose
      between. The header still renders — title, view type — with no path
      control on it.
    */
    if (!isSubslide(activeSlide)) {
      return { slide: activeSlide, paths: [], selectedPathIds: [] }
    }

    const scopedPaths = collectOverviewPathOptionsForScenarios(
      pathsByScenario,
      [activeSlide.id],
    )
    /*
      An option's `id` is its identity KEY (`kind:name`), while the drawn ids
      are real path ids. `pathIds` carries the row ids an option was built
      from, which is where the two meet.
    */
    const drawn = new Set(focusedDrawnPathIds)

    return {
      slide: activeSlide,
      paths: scopedPaths,
      selectedPathIds: scopedPaths
        .filter((path) => (path.pathIds ?? []).some((id) => drawn.has(id)))
        .map((path) => path.id),
    }
  }, [activeSlide, isDetail, focusedDrawnPathIds, pathsByScenario])

  // The viewport below has already scheduled this fit with animation
  // suppressed (child effects run before parent effects), so release the
  // one-shot now — every later navigation animates.
  useEffect(() => {
    if (!overviewReady || !skipCanvasFitAnimation) return
    consumeCanvasFitAnimationSkip()
  }, [overviewReady, skipCanvasFitAnimation, consumeCanvasFitAnimationSkip])

  return (
    <CanvasZoomChromeProvider>
      <BlueprintCellDetailProvider
        resetKey={cellDetailResetKey}
        enabled={cellDetailEnabled}
        scenarioId={cellDetailScenarioId}
        blueprints={cellDetailBlueprints}
      >
        <CanvasFocusEscapeHandler />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {renderHeader ? (
            /*
              The band arrives WITH the canvas, on the same beat the bottom
              toolbar does — both are furniture of the board, and neither
              should be finished while the board is still staging. Through
              DeferredSkeleton on the canvas's own hold key, so it inherits
              the session the embedding surface's earlier phases opened and
              swaps with one fade rather than popping.
            */
            <DeferredSkeleton
              loading={
                revealStage < CANVAS_REVEAL_LANES &&
                renderHeaderSkeleton !== undefined
              }
              holdKey={canvasHoldKey}
              skeleton={renderHeaderSkeleton?.() ?? null}
            >
              {renderHeader()}
            </DeferredSkeleton>
          ) : focusedHeader ? (
            <SlideStickyHeader
              slide={focusedHeader.slide}
              slides={slides}
              paths={focusedHeader.paths}
              selectedPathIds={focusedHeader.selectedPathIds}
            />
          ) : (
            /*
              Overview: the service's own header.

              This was deliberately empty — "a bar holding only a repeated
              title read as a broken fragment" — and that was right while the
              row had nothing to do. It now opens the service panel, which is
              the second job it was waiting for, and it is the same title +
              summary shape the phase and scenario headers use one level down.
            */
            <ServiceOverviewHeader />
          )}
          <div
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
            data-slide-canvas
            /*
              Canvas chrome (annotation toolbar, zoom control, sequence nav) is
              furniture OF the canvas, and it renders as a sibling of the
              revealed board rather than inside it — so it needs its own
              handle.

              It opens WITH the lanes (stage 1) and finishes as the scenario
              blurbs begin (stage 2) — its fade is one `--motion-fade`, the
              same beat the chain advances on, so it lands exactly on the
              handover. It waited until stage 4 in the first cut, which read
              as the toolbar being an afterthought bolted on at the end;
              starting it with the first layer makes the canvas and its
              controls one arriving surface. What it must never do is float
              over the loading bar, which stage 0 still prevents.
            */
            /*
              Dropped entirely once the reveal is done, exactly as the board
              root drops `data-canvas-reveal`: left on, its transition rule
              keeps matching the toolbar and the zoom control for the life of
              the canvas. Nothing declares a competing opacity transition
              today, which is precisely why it would be found late.
            */
            {...(revealStage < CANVAS_REVEAL_DONE
              ? {
                  'data-canvas-reveal-chrome':
                    revealStage < CANVAS_REVEAL_LANES &&
                    !noPathsSelected &&
                    !noPhases
                      ? 'pending'
                      : 'shown',
                }
              : {})}
          >
            {floatingChrome ? (
              <div
                className={cn(
                  'pointer-events-none absolute bottom-4 z-30 [&>*]:pointer-events-auto',
                  // Bottom-centered on the phone (thumb reach, and the
                  // corner is where the agent FAB lives); bottom-right on
                  // desktop, beside the cursor's natural resting corner.
                  mobileShell ? 'left-1/2 -translate-x-1/2' : 'right-4',
                )}
              >
                {floatingChrome}
              </div>
            ) : null}
            {/* Reset View is a MOBILE affordance (no scroll wheel, easy to
                lose the canvas): bottom-centered under the thumb. Desktop
                has no Reset View at all — double-click/Home reframe. */}
            {mobileShell && !renderHeader ? (
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center [&>*]:pointer-events-auto">
                <NavbarZoomIndicator />
              </div>
            ) : null}
            {noPhases ? (
              <div className="absolute inset-0 flex">
                <CanvasEmptyState
                  /*
                    A read that FAILED is empty too, and it is not the same
                    sentence. "No phases recorded" is a statement about the
                    database, and this surface has no standing to make it
                    when the question never got an answer — the sidebar's
                    alert is carrying the real reason.
                  */
                  title={
                    slidesError
                      ? 'The phases could not be loaded'
                      : 'No phases in this workspace yet'
                  }
                  summary={
                    slidesError
                      ? 'The board is drawn from your database, and this read did not come back. The sidebar has the error.'
                      : 'This board is drawn from your database, and it has no phases recorded. Add one from the sidebar to start the blueprint.'
                  }
                  // Paths are a filter over a board; there is no board.
                  showRestoreAction={false}
                />
              </div>
            ) : noPathsSelected ? (
              <div className="absolute inset-0 flex">
                <CanvasEmptyState />
              </div>
            ) : (
              <ZoomPanViewport
                resetKey={fitKey}
                fitSelector={fitSelector}
                maxFitZoom={maxFitZoom}
                minFitZoom={minFitZoom}
                semanticZoomThreshold={semanticZoomThreshold}
                fitMargin={fitInsets.margin}
                fitTopInset={fitInsets.topInset}
                fitBottomInset={fitInsets.bottomInset}
                animateFit={!skipCanvasFitAnimation && contentSettled}
                // Off. The prev/next phase pair sat at the bottom corners
                // flanking the tool bar, which made three bottom controls
                // that look alike and do unrelated things — and the sidebar
                // already navigates phases, with the whole list visible
                // rather than one neighbour at a time.
                showSequenceNav={false}
                onResetView={isDetail ? goHome : undefined}
                className="absolute inset-0"
                panIgnoreSelector={OVERVIEW_PAN_IGNORE}
                cameraStateKey={
                  cameraStateKey ?? (mobileShell ? undefined : 'desktop:blueprint')
                }
                cameraDestinationKey={cameraDestinationKey}
                // The board, not the wait. Readiness names the real
                // destination one beat before the skeleton actually gives way
                // to it, and a framing carried across a tab remount can only
                // be measured against content that is on screen — so the
                // camera is told the destination has resolved at the swap.
                cameraDestinationResolved={overviewSettled}
                cameraOutcomeKey={cameraTargetId ?? undefined}
                onFitReady={handleInitialFitReady}
                focusCellsKey={
                  focusCellsKeyOverride ??
                  focusedScenarioId ??
                  soloScenarioId ??
                  undefined
                }
              >
                <DeferredSkeleton
                  loading={!overviewSettled}
                  holdKey={canvasHoldKey}
                  // The reveal owns this board's entrance (`data-canvas-reveal`
                  // below). Without this the wrapper ALSO ran a 200ms
                  // `animate-in fade-in` the moment the data resolved — a
                  // second opacity animation over the same pixels, firing
                  // mid-load while the bar was still up, owned by nobody.
                  fadeOnSwap={false}
                  skeleton={
                    /*
                      `invisible`, not removed: the skeleton's geometry still
                      seeds the loading-phase camera fit, but it must never
                      PAINT. A painted skeleton board sits at the estimator's
                      framing and the real board then appears at the true
                      fit — two boards at visibly different framings, which
                      reads as a camera correction no matter how instant the
                      cut. The loading surface is the progress bar alone
                      (screen-space, camera-independent); the first board the
                      reader ever sees is the revealed one, already framed.
                    */
                    <div className="invisible" aria-hidden>
                      <ServiceOverviewCanvasSkeleton
                        phases={skeletonPhases}
                        loopChannelOffset={
                          postToPreLoop
                            ? PHASE_OVERVIEW_LOOP_CHANNEL_OFFSET + 16
                            : 0
                        }
                      />
                    </div>
                  }
                >
                  <div
                    ref={(node) => {
                      overviewRef.current = node
                      setOverviewEl(node)
                    }}
                    data-service-overview
                    data-canvas-fit
                    // `undefined` omits the attribute and a number is
                    // stringified — React already does what the conditional
                    // spread was doing by hand.
                    data-canvas-reveal={
                      revealStage < CANVAS_REVEAL_DONE ? revealStage : undefined
                    }
                    // Each layer's fade completing is what opens the next.
                    // `transitionend` bubbles, so one handler on the root
                    // hears the board, the panels, the cells and the arrows.
                    /*
                      The sender must be the layer we are waiting on.

                      `transitionend` bubbles — that is what makes one
                      handler enough — but it also means this hears EVERY
                      opacity transition anywhere in a 663-cell subtree, and
                      the board is full of them: the scenario title badge's
                      hover, the storyboard play button's, the column and lane
                      handles, the empty-cell slots, the slice sequence
                      badge's threshold fade. A reader whose cursor is
                      resting over the canvas (where they just clicked) and
                      who twitches it once could advance the chain a stage
                      early; a few twitches ran it to 5, where the attribute
                      is removed and every in-flight cell transition is
                      deleted mid-flight — hundreds of cells popping at once.
                      It worked on my machine because my cursor was parked
                      over the sidebar I had just clicked.

                      One `matches()` per event closes it. Anything hovering
                      is on a party line; only the layer this stage opened
                      may advance it.
                    */
                    onTransitionEnd={(event) => {
                      if (event.propertyName !== 'opacity') return
                      const selector = REVEAL_STAGE_SOURCE[revealStage]
                      if (!selector) return
                      const target = event.target
                      if (!(target instanceof Element)) return
                      if (selector === REVEAL_ROOT_SOURCE) {
                        if (target !== event.currentTarget) return
                      } else if (!target.matches(selector)) {
                        return
                      }
                      advanceReveal(revealStage)
                    }}
                    className="relative inline-flex w-max flex-col items-start"
                    style={{
                      paddingTop: OVERVIEW_CANVAS_PADDING_Y,
                      paddingBottom: OVERVIEW_CANVAS_PADDING_Y,
                      paddingRight: OVERVIEW_CANVAS_PADDING_X,
                      paddingLeft:
                        OVERVIEW_CANVAS_PADDING_X +
                        (postToPreLoop
                          ? PHASE_OVERVIEW_LOOP_CHANNEL_OFFSET + 16
                          : 0),
                    }}
                  >
                    {phases.map((phase, index) => {
                      const phaseIsFocused = focusedPhaseId === phase.id
                      const dimPhase = isDetail && !phaseIsFocused

                      return (
                        <Fragment key={phase.id}>
                          {index > 0 &&
                          !shouldShowOverviewPhaseFlowArrow(
                            phases[index - 1],
                            phase,
                          ) ? (
                            <OverviewPhaseRowDivider />
                          ) : null}
                          <ServicePhaseSection
                            phase={phase}
                            slides={slides}
                            pathsByScenario={pathsByScenario}
                            blueprintsByPathId={blueprintsByPathId}
                            // A phase row draws each scenario's happy path;
                            // the focused scenario draws the reader's
                            // selection. One resolver for both.
                            getSelectedPathIds={resolveDrawnPathIds}
                            displayViewType={overviewViewType}
                            onOpenPhase={canvasNavigate}
                            openScenario={canvasNavigate}
                            getScenarioDisplayViewType={
                              getScenarioDisplayViewType
                            }
                            dimmed={dimPhase}
                            focusActive={phaseIsFocused}
                            focusedScenarioId={
                              phaseIsFocused ? focusedScenarioId : null
                            }
                            onlyScenarioId={soloScenarioId ?? null}
                            showFlowArrow={shouldShowOverviewPhaseFlowArrow(
                              phase,
                              phases[index + 1],
                            )}
                            isFlowArrowAnchor={isOverviewFlowArrowAnchorPhase(
                              phase,
                              slides,
                            )}
                            isLoopArrowFrom={
                              phase.id === postToPreLoop?.fromPhaseId
                            }
                            isLoopArrowTo={phase.id === postToPreLoop?.toPhaseId}
                          />
                        </Fragment>
                      )
                    })}
                    {postToPreLoop ? (
                      <PhaseOverviewPhaseLoopArrow
                        overviewRef={overviewRef}
                        overviewEl={overviewEl}
                      />
                    ) : null}
                  </div>
                </DeferredSkeleton>
              </ZoomPanViewport>
            )}
            {/*
                Determinate load progress, in SCREEN space — the shaped
                skeleton lives inside the viewport and scales with the
                camera, but a progress bar must not. Same holdKey, so it
                joins the skeleton's session and fast loads see neither.

                Gated on the REVEAL, not on the data. Keyed on
                `overviewSettled` the bar left the moment the queries
                resolved — while the board was still staging behind it — and
                the reader got a dead empty canvas until stage 1 opened.
                Held to `revealStage`, the bar covers the whole staging
                window (layout settling, camera snapping) and hands over to
                the board directly: it fades out across stage 1 while the
                lanes fade in, then unmounts at stage 2. Never a gap.
            */}
            {!noPathsSelected && !noPhases ? (
              // role=status lives HERE now: the shaped skeleton went
              // visibility-hidden (the bar is the one visible signal), and
              // visibility removes it from the accessibility tree with it.
              <div
                role={revealStage < CANVAS_REVEAL_LANES ? 'status' : undefined}
                aria-label={
                  revealStage < CANVAS_REVEAL_LANES ? 'Loading canvas' : undefined
                }
                className={cn(
                  'pointer-events-none absolute inset-0 z-20 flex items-center justify-center',
                  'transition-opacity motion-reduce:transition-none duration-(--motion-fade) ease-arrive',
                  barDissolving && 'opacity-0',
                )}
                // The bar finishing its dissolve is what opens stage 1 —
                // the handoff is chained, not scheduled, so the lanes can
                // never begin while any of the bar is still on screen.
                onTransitionEnd={(event) => {
                  if (event.propertyName !== 'opacity') return
                  setRevealStage((stage) => (stage === 0 ? 1 : stage))
                }}
              >
                <DeferredSkeleton
                  /*
                    Unmounts a beat AFTER the dissolve finishes, not on the
                    same beat. The fade is one `--motion-fade` and stage 1 is
                    one `--motion-fade` away, so unmounting there was an exact
                    tie — a frame of scheduling jitter either way and the bar
                    vanishes mid-fade instead of completing it. It sits at
                    opacity 0 (and pointer-events-none) for the extra beat,
                    which costs nothing and cannot be seen.
                  */
                  loading={revealStage < CANVAS_REVEAL_PANELS}
                  holdKey={canvasHoldKey}
                  skeleton={
                    <CanvasLoadProgress
                      progressKey={canvasHoldKey}
                      stages={[
                        { label: firstStageLabel, done: !slidesLoading },
                        {
                          label: 'Loading blueprints…',
                          done: !blueprintsLoading,
                        },
                      ]}
                      // Real ticks: the structure query + each settled
                      // blueprint chunk is one unit — no synthetic fill.
                      units={{
                        loaded:
                          (slidesLoading ? 0 : 1) + blueprintsProgress.loaded,
                        total: 1 + blueprintsProgress.total,
                      }}
                    />
                  }
                >
                  {null}
                </DeferredSkeleton>
              </div>
            ) : null}
            {cellDetailEnabled ? <BlueprintCellDetailPanel /> : null}
            <EntityDetailPanel />
          </div>
        </div>
      </BlueprintCellDetailProvider>
    </CanvasZoomChromeProvider>
  )
}

/**
 * Memoised, because the shell re-renders it for reasons that have nothing
 * to do with the board.
 *
 * `DesktopEditorShell` subscribes to the reveal store, so every stage change
 * re-rendered it — and `ActiveTabContent` is a plain function passing fresh
 * props, so each of those re-rendered all ~660 cells. The publication is a
 * layout effect, so that work landed BEFORE the paint of the stage it
 * announced: each beat's first frame was gated on a full board reconcile,
 * inside the window where hundreds of opacity transitions are meant to be
 * running smoothly. The same barrier fixes an older one — dragging the
 * sidebar divider calls `setAsideWidth` per pointermove, which was
 * re-rendering the whole board at 60 Hz.
 */
export const ServiceOverviewView = memo(ServiceOverviewViewImpl)
