import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  getCanvasSpaceHeld,
  setCanvasSpaceHeld,
} from '@/lib/canvasKeyboardState'
import { isEditableKeyboardTarget } from '@/lib/keyboardTarget'
import {
  CAMERA_FLIGHT_MAX_MS,
  createCameraFlightPlan,
  transformCameraAroundPoint,
  type CameraTransform,
  type CameraTransitionResult,
  type CameraVelocity,
} from '@/lib/cameraTransition'
import { FOCUS_DIM_OPACITY } from '@/lib/canvasFocusDim'
import { canvasDotGrid } from '@/lib/canvasDotGrid'
import { isCanvasResizeRefitSuppressed } from '@/lib/canvasChromeResize'
import { settleJump, verdictOfFlight } from '@/lib/canvasJump'
import {
  beginCanvasViewState,
  writeCanvasViewState,
  type CanvasViewGeometry,
} from '@/lib/canvasViewState'
import {
  pulseBlueprintCells,
  type FocusCellsResult,
} from '@/lib/canvasFocusCells'
import {
  gestureScaleFactor,
  shouldApplyGestureZoom,
} from '@/lib/canvasGestureZoom'
import {
  computeFocusRevealPan,
  resolveKeyboardPan,
} from '@/lib/canvasKeyboardCamera'
import {
  hasScrollableRegion,
  scrollableAncestorCanConsume,
} from '@/lib/canvasScrollRegions'
import {
  normalizeWheelDelta,
  wheelZoomScaleFactor,
} from '@/lib/canvasWheelDelta'
import { prefersReducedMotion } from '@/lib/motion'
import {
  BLUEPRINT_VIEWPORT_ARTBOARD_MARGIN,
  BLUEPRINT_VIEWPORT_FIT_TOP_INSET,
} from '@/lib/slideLayout'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 4

export const BLUEPRINT_ARTBOARD_SELECTOR = '[data-blueprint-artboard]'
/** Root wrapper for fit-to-view / centering across overview and detail canvases. */
export const CANVAS_FIT_SELECTOR = '[data-canvas-fit]'

export function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

type UseZoomPanViewportOptions = {
  /** When this value changes, the viewport recenters and fits content. */
  resetKey?: string
  /** Ignore pan start on these selectors (e.g. interactive controls). */
  panIgnoreSelector?: string
  /** When false, left-drag never starts a pan (e.g. while drawing). */
  panEnabled?: boolean
  /** Element used to compute fit-to-view bounds. */
  fitSelector?: string
  /** Cap for programmatic fit zoom (overview stays ≤1; focus can zoom in). */
  maxFitZoom?: number
  /**
   * Floor for programmatic fit zoom. A board wider than the viewport fits
   * by zooming out, and past a point that framing is worthless — on a
   * phone the whole-phase fit lands around 0.2, below the semantic tier,
   * so the "default view" arrived as a wall of grey blocks. With a floor
   * the camera stops zooming out at a legible scale and anchors the
   * target's top-left corner instead: the reader starts at the beginning
   * of the journey and pans, rather than at an unreadable everything.
   */
  minFitZoom?: number
  /** Uniform margin around the fit target (px). */
  fitMargin?: number
  /** Extra top inset on top of fitMargin (px). */
  fitTopInset?: number
  /**
   * Extra bottom inset on top of fitMargin (px). Defaults to `fitTopInset`,
   * because an UNEQUAL pair moves the framing off the target's true centre
   * and a caller that named only the top did not ask for that — the old
   * default of 0 against a 56px top centred everything 28px high.
   */
  fitBottomInset?: number
  /** Animate camera moves when resetKey / fitSelector change. */
  animateFit?: boolean
  /** Duration for animated camera moves (ms). */
  fitDurationMs?: number
  /** Re-center whenever the content box resizes (e.g. async blueprint panels). */
  refitOnResize?: boolean
  /** Debounce for refitOnResize (ms). */
  refitDebounceMs?: number
  /** Never react to container/content resizes (viewport owns its own framing). */
  suppressResizeRefit?: boolean
  /**
   * Zoom below which cells drop their text for the blocks tier. Lower it
   * on high-density screens: the phone was hiding every blurb the moment
   * the reader pinched out past 0.25, which reads as a board with nothing
   * on it rather than as a map. See `SEMANTIC_ZOOM_THRESHOLD`.
   */
  semanticZoomThreshold?: number
  /** Session-local identity used to restore this canvas across a tab remount. */
  cameraStateKey?: string
  /** Stable semantic destination used to reject stale restored transforms. */
  cameraDestinationKey?: string
  /**
   * Whether `cameraDestinationKey` names the board that is actually on
   * screen. A surface that boots through a skeleton passes `false` until the
   * real board has replaced it. While this is false the destination means
   * "not ready yet", which is neither a place to fit nor a navigation away
   * from the framing this mount inherited: the inherited framing is HELD,
   * and the ordinary fit runs underneath it as it always has.
   */
  cameraDestinationResolved?: boolean
  /** Called after the current reset destination has a committed fit. */
  onFitReady?: () => void
  /** Semantic selection id used to report an exact navigation outcome. */
  cameraOutcomeKey?: string
  /**
   * When false, skip window ⌘+/−/0. Hidden warm views stay mounted and
   * must not zoom a camera the reader is not looking at.
   */
  enableWindowZoomKeys?: boolean
}

/**
 * Below this zoom the board switches to its SEMANTIC tier: cells stop
 * pretending their text is readable (it is smudge at these scales) and
 * render as flat blocks, while phase title badges counter-scale to hold a
 * constant on-screen size — the overview becomes a table of contents
 * instead of a shrunken page. Stamped as a data attribute + CSS variable
 * straight from the transform writer: a pinch is sixty events a second,
 * and the tier must never cost a React render. Styling lives in
 * blueprint.css under [data-semantic-tier].
 */
// 0.25, down from 0.35 (2026-08-17): the blocks tier was kicking in while
// cell text was still legible enough to skim, which read as content being
// withheld — users saw "skeletons" on a loaded board. Below 0.25 the text
// really is smudge.
//
// A DEFAULT, not a constant: what counts as smudge depends on the screen.
// A phone renders at 3 device pixels per CSS pixel, so 12px type at 0.15
// zoom still lands ~5 device pixels tall — enough to tell a full cell from
// an empty one and to catch a word — where the same scale on a 1x desktop
// display is genuinely nothing. Surfaces pass their own; see
// `semanticZoomThreshold`.
export const SEMANTIC_ZOOM_THRESHOLD = 0.25

/** How far a pending touch may wander before it stops being a tap and
 * becomes a board drag. */
const TOUCH_PAN_SLOP = 10

/**
 * Frame cap on the pre-fit settle loop. Comfortably longer than the two
 * frames a stable board needs and than the commits a navigation takes, and
 * short enough that a target which never goes quiet degrades to "fit against
 * whatever we have" rather than polling forever.
 */
const MAX_SETTLE_POLLS = 20
/** Counter-scale that keeps a phase badge at roughly constant screen size
 * (12px type reads ~11px). Capped so a deep zoom-out cannot grow a badge
 * past its artboard. */
// Cap 10, not 16: the badge grows upward from the frame's top edge, and
// with OVERVIEW_PHASE_ROW_GAP's headroom a 10× badge (~220 content px)
// stays inside its own row's gap — 16× reached into the previous phase's
// panels, which broke the badge's group affiliation exactly when zoomed
// out far enough to need it.
// Floored at 1 so the badge never shrinks below its authored size — above
// zoom 0.95 the boost is inert and the badge scales with the board like
// everything else.
const semanticLabelBoost = (zoom: number) =>
  Math.min(10, Math.max(1, 0.95 / Math.max(zoom, 0.01)))

function applyTransformToElement(
  el: HTMLElement,
  pan: { x: number; y: number },
  zoom: number,
  semanticThreshold: number,
  /**
   * Zoom the TIER decision reads. Live zoom during pinch/pan; a value the
   * camera flight picks during an animated fit. Crossing the threshold on
   * the live zoom mid-ease used to launch every cell's content paint in
   * the busiest stretch of the glide. Zoom-out still stamps the
   * destination (hiding text is cheap, and a shrinking page is the look
   * we do not want). Zoom-in from the blocks tier keeps that tier and
   * reveals only the named destination — flipping the whole board on
   * frame one was the overview → scenario takeoff hitch.
   */
  tierZoom: number = zoom,
) {
  el.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
  const blocks = tierZoom < semanticThreshold
  const wasBlocks = el.dataset.semanticTier === 'blocks'
  if (blocks !== wasBlocks) {
    if (blocks) el.dataset.semanticTier = 'blocks'
    else delete el.dataset.semanticTier
  }
  /*
    Stamped at EVERY zoom, not only inside the blocks tier. When the boost
    existed only past the tier boundary, crossing 0.25 mid-ease snapped the
    badge from board-scale straight to a 3.8x counter-scale in one frame — a
    label lunging at the reader in the middle of the zoom. Continuous, the
    badge tracks the camera: it rides the board down to 95% of its authored
    size, then holds that on-screen size as the zoom drops further, every
    frame of the ease.

    Written ONTO THE BADGES, and only when it changes. It used to be one
    custom property on this element — the board's root — which reads as one
    cheap style write and is not: custom properties inherit, that one is
    read by a rule deep in the subtree, so every write re-resolved computed
    style for thousands of elements. Once per frame of every pinch and every
    navigation ease, on top of the raster the changing scale already costs.
    The rule now reads an inline `scale` on the dozen badges that consume
    it, and the string guard means a pan (constant zoom) writes nothing at
    all.

    The `querySelectorAll` is deliberate rather than cached: it runs only on
    frames where the zoom actually changed, an attribute selector takes the
    engine's fast path, and a cache would need an invalidation signal the
    board does not currently offer. Sub-millisecond against a full-subtree
    style recalc measured in tens.
  */
  const nextBoost = semanticLabelBoost(zoom).toFixed(3)
  if (nextBoost !== el.dataset.semanticLabelBoost) {
    el.dataset.semanticLabelBoost = nextBoost
    const badges = el.querySelectorAll<HTMLElement>('[data-phase-title-badge]')
    for (const badge of badges) badge.style.scale = nextBoost
  }
}

/**
 * Lay the canvas ground's dot grid under the board: tile size and position
 * from the camera, so the dots pan and zoom with it (`canvasDotGrid` has the
 * step-and-tone rule for far zoom).
 *
 * Written ONTO THE VIEWPORT as its own background properties, never as an
 * inherited custom property — the same reason the label boost above is
 * written onto the badges. The one custom property here, the dot alpha, is
 * registered `inherits: false` in blueprint.css, so a write restyles this
 * element alone, and the string guard means it is written only when a zoom
 * changes it. A pan touches `background-position` and nothing else.
 */
function applyGroundToElement(
  el: HTMLElement,
  pan: { x: number; y: number },
  zoom: number,
) {
  const grid = canvasDotGrid(pan, zoom)
  const size = `${grid.pitch}px ${grid.pitch}px`
  if (el.style.backgroundSize !== size) el.style.backgroundSize = size
  el.style.backgroundPosition = `${grid.offsetX}px ${grid.offsetY}px`
  const alpha = grid.alpha.toFixed(3)
  if (el.dataset.canvasDotAlpha !== alpha) {
    el.dataset.canvasDotAlpha = alpha
    el.style.setProperty('--canvas-dot-alpha', alpha)
  }
}

/**
 * Dataset key for `data-camera-flight-reveal`. CSS under the blocks tier
 * skips the density encoding inside this subtree so the destination stays
 * readable while the rest of the board does not leave blocks.
 *
 * @param next - Named fit target to reveal, or `null` to clear.
 * @param previous - Last revealed node, so a retarget can move the mark.
 * @returns The node now carrying the attribute, if any.
 */
function assignCameraFlightReveal(
  next: HTMLElement | null,
  previous: HTMLElement | null,
): HTMLElement | null {
  if (previous === next) return previous
  if (previous) delete previous.dataset.cameraFlightReveal
  if (next) next.dataset.cameraFlightReveal = ''
  return next
}

function measureFitBounds(
  content: HTMLElement,
  fitTarget: HTMLElement,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  if (fitTarget === content) {
    return {
      left: 0,
      top: 0,
      width: content.scrollWidth,
      height: content.scrollHeight,
    }
  }

  const contentRect = content.getBoundingClientRect()
  const targetRect = fitTarget.getBoundingClientRect()
  const safeZoom = zoom || 1

  return {
    left: (targetRect.left - contentRect.left) / safeZoom,
    top: (targetRect.top - contentRect.top) / safeZoom,
    width: targetRect.width / safeZoom,
    height: targetRect.height / safeZoom,
  }
}

/** Sub-pixel camera deltas aren't worth a React commit. */
function isSameTransform(
  a: { pan: { x: number; y: number }; zoom: number },
  b: { pan: { x: number; y: number }; zoom: number },
) {
  return (
    Math.abs(a.pan.x - b.pan.x) < 0.5 &&
    Math.abs(a.pan.y - b.pan.y) < 0.5 &&
    Math.abs(a.zoom - b.zoom) < 0.0001
  )
}

function isSameFitGeometry(
  a: CanvasViewGeometry,
  b: CanvasViewGeometry,
  tolerance = 1,
) {
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  )
}

/**
 * True when the viewport cannot be measured yet. A 0×0 box is not evidence
 * the saved framing is wrong; the restore must wait rather than discard.
 */
function viewportHasNoLayout(container: HTMLElement | null): boolean {
  return (
    container === null ||
    container.clientWidth <= 0 ||
    container.clientHeight <= 0
  )
}

/** Outcome of trying to take a remount's inherited framing. */
type InheritedCameraAttempt = 'adopted' | 'waiting' | 'dropped'

type FocusPaintSnapshot = {
  element: HTMLElement
  opacity: string
  transition: string
}

type CameraFocusTransfer = {
  origin: FocusPaintSnapshot[]
  destination: FocusPaintSnapshot[]
}

function focusPaintElements(target: HTMLElement | null): HTMLElement[] {
  if (!target) return []
  if (target.matches('[data-focus-slide-id]')) return [target]
  if (!target.matches('[data-canvas-phase-section]')) return []
  return [
    ...target.querySelectorAll<HTMLElement>(
      ':scope > [data-phase-frame], :scope > [data-phase-title-badge], [data-focus-slide-id]',
    ),
  ]
}

function captureFocusPaint(elements: readonly HTMLElement[]) {
  return elements.map((element) => ({
    element,
    opacity: element.style.opacity,
    transition: element.style.transition,
  }))
}

function restoreFocusPaint(transfer: CameraFocusTransfer | null) {
  if (!transfer) return
  for (const snapshot of [...transfer.origin, ...transfer.destination]) {
    snapshot.element.style.opacity = snapshot.opacity
    snapshot.element.style.transition = snapshot.transition
  }
}

function applyFocusPaint(transfer: CameraFocusTransfer | null, progress: number) {
  if (!transfer) return
  const originOpacity = 1 - progress * (1 - FOCUS_DIM_OPACITY)
  const destinationOpacity = FOCUS_DIM_OPACITY + progress * (1 - FOCUS_DIM_OPACITY)
  for (const snapshot of transfer.origin) {
    snapshot.element.style.transition = 'none'
    snapshot.element.style.opacity = String(originOpacity)
  }
  for (const snapshot of transfer.destination) {
    snapshot.element.style.transition = 'none'
    snapshot.element.style.opacity = String(destinationOpacity)
  }
}

export function useZoomPanViewport(options: UseZoomPanViewportOptions = {}) {
  const {
    resetKey,
    panIgnoreSelector = 'button, a, input, textarea, select, [role="button"]',
    panEnabled = true,
    fitSelector = CANVAS_FIT_SELECTOR,
    maxFitZoom = 1,
    minFitZoom = MIN_ZOOM,
    fitMargin = BLUEPRINT_VIEWPORT_ARTBOARD_MARGIN,
    fitTopInset = BLUEPRINT_VIEWPORT_FIT_TOP_INSET,
    fitBottomInset = fitTopInset,
    animateFit = false,
    fitDurationMs,
    refitOnResize = true,
    refitDebounceMs = 200,
    suppressResizeRefit = false,
    semanticZoomThreshold = SEMANTIC_ZOOM_THRESHOLD,
    cameraStateKey,
    cameraDestinationKey = resetKey ?? fitSelector,
    cameraDestinationResolved = true,
    onFitReady,
    cameraOutcomeKey,
    enableWindowZoomKeys = true,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  /**
   * The container as a value, not only as a ref — and the reason is a bug
   * class this file has already been bitten by once.
   *
   * An effect that reads `containerRef.current` once attaches nothing if it
   * runs before that node exists, and with stable deps it is never retried:
   * the canvas is then permanently dead to whatever that effect was binding.
   * The wheel and gesture listeners escaped by moving to window-in-capture
   * (see their comments below); the three that must stay scoped to the
   * element — native pointer capture, the touch claim, and the keyboard
   * camera — escape by depending on the node instead of reading it. A
   * container that mounts late, or remounts, re-runs them.
   *
   * `containerRef` is still the truth for handlers, which run at gesture
   * time and want the current node with no render in between. This is only
   * for effects.
   */
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(
    null,
  )
  /** Returned as `containerRef` — a ref callback is still a ref to JSX. */
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setContainerNode(node)
  }, [])
  const contentRef = useRef<HTMLDivElement>(null)
  const [initialCamera] = useState(() => {
    const stored = cameraStateKey
      ? beginCanvasViewState(cameraStateKey)
      : undefined
    const snapshot = stored?.snapshot
    /*
      An unresolved destination is not evidence about anything. A canvas
      returning to a still-open tab boots through a loading destination
      before the real one, and reading that hop as "the reader went
      somewhere else" is what threw the framing away. So the key is compared
      only once it names a real board; until then the framing is inherited
      unconditionally and the decision waits.
    */
    const inherited =
      snapshot !== undefined &&
      (!cameraDestinationResolved ||
        snapshot.destinationKey === cameraDestinationKey)
        ? snapshot
        : undefined
    return {
      lease: stored?.lease,
      snapshot: inherited,
      transform: inherited?.transform ?? { pan: { x: 0, y: 0 }, zoom: 1 },
      restored: inherited !== undefined,
    }
  })
  const [pan, setPan] = useState(initialCamera.transform.pan)
  const [zoom, setZoom] = useState(initialCamera.transform.zoom)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const transformRef = useRef(initialCamera.transform)
  /*
    A viewport that mounts or remounts starts with a bare ground: lay the dot
    grid where the camera already is rather than waiting for its next move.
  */
  useLayoutEffect(() => {
    if (!containerNode) return
    const { pan: p, zoom: z } = transformRef.current
    applyGroundToElement(containerNode, p, z)
  }, [containerNode])
  const restoredSnapshotRef = useRef(initialCamera.snapshot)
  const restoredCameraPendingRef = useRef(initialCamera.restored)
  const lastFitGeometryRef = useRef<CanvasViewGeometry | null>(null)
  const cameraDestinationKeyRef = useRef(cameraDestinationKey)
  const cameraDestinationResolvedRef = useRef(cameraDestinationResolved)
  const onFitReadyRef = useRef(onFitReady)
  const pendingFitRef = useRef(false)
  /**
   * Whether the fit `pendingFitRef` still owes should ANIMATE. The resize
   * observer used to run an owed fit with `animate: false` unconditionally —
   * correct for a first mount (nothing to ease from), wrong for a navigation:
   * a phase→scenario click changes layout in the same commit that schedules
   * the fit, so the observer fired before the two-frame rAF path did and the
   * 420ms ease was silently replaced with a hard cut. That was the "super
   * abrupt" navigation. The intent is captured where the fit is scheduled;
   * every executor honours it.
   */
  const pendingFitAnimateRef = useRef(false)
  const userAdjustedViewRef = useRef(false)
  const fitAnimationRef = useRef<number | null>(null)
  const fitAnimationTargetRef = useRef<{
    pan: { x: number; y: number }
    zoom: number
  } | null>(null)
  const fitAnimationResolveRef = useRef<
    ((result: CameraTransitionResult) => void) | null
  >(null)
  const fitAnimationPromiseRef = useRef<Promise<CameraTransitionResult> | null>(
    null,
  )
  const fitAnimationRetargetRef = useRef<
    ((target: CameraTransform) => void) | null
  >(null)
  const computeLiveFitRef = useRef<(() => CameraTransform | null) | null>(null)
  const activeFlightTracksFitRef = useRef(false)
  const fitAnimationVelocityRef = useRef<CameraVelocity>({
    pan: { x: 0, y: 0 },
    zoomPerMs: 0,
  })
  const carriedFitVelocityRef = useRef<CameraVelocity | undefined>(undefined)
  /**
   * False until this viewport instance has framed content once. The first
   * fit jumps: animating it would swoop in from the unfitted origin
   * (pan 0,0 / zoom 1) that every fresh mount starts at.
   */
  const hasFittedRef = useRef(false)
  /**
   * True while the resetKey effect's settle loop is waiting for the fit
   * target's layout to go quiet. The resize observer's owed-fit branch
   * defers to it — see the loop for why.
   */
  const fitSettlingRef = useRef(false)
  const navigationGenerationRef = useRef(0)
  const pendingSemanticOutcomeKeyRef = useRef<string | null>(null)
  const semanticOutcomeGenerationRef = useRef(0)
  /**
   * Portrait/landscape, for the rotation rule in the resize observer.
   *
   * A ref, not a closure local of that effect: the effect lists `resetKey`
   * in its deps, so every navigation re-created it and reset the detector to
   * `null` — and a flip needs a previous value to compare against. A freshly
   * constructed ResizeObserver also delivers once for each observed element,
   * which consumed the re-seed. The upshot was that the branch existing
   * because "on a phone there is no Reset control to recover with" could not
   * fire on the first delivery after any navigation. Orientation is device
   * state; it does not belong to an effect generation.
   */
  const lastAspectLandscapeRef = useRef<boolean | null>(null)
  /**
   * Latest semantic threshold, read by every transform write so that NOTHING
   * on the camera path depends on the prop.
   *
   * This ref existed for the post-fit badge re-stamp and said, correctly,
   * that `fitToView` must not "depend on (and re-create itself for) a prop
   * that changes nothing about how a fit is computed" — but `commitTransform`
   * still closed over the prop, so the whole chain
   * (`commitTransform → animateTransform → fitToView → runPendingFit →` the
   * resetKey layout effect) was rebuilt whenever the threshold moved. That
   * effect is NOT idempotent: it raises `pendingFitRef` and clears
   * `userAdjustedViewRef`. The threshold is dynamic now, so a reader focused
   * on a phase who toggled a path — a case `fitKey` deliberately ignores —
   * had their pan and zoom thrown away by a fit nobody asked for. Reading it
   * through the ref finishes the job the comment described.
   *
   * Synced in a LAYOUT effect: the fit effect below is one too, and a passive
   * sync would leave the first fit after a threshold change reading a stale
   * value.
   */
  const semanticThresholdRef = useRef(semanticZoomThreshold)
  useLayoutEffect(() => {
    semanticThresholdRef.current = semanticZoomThreshold
  }, [semanticZoomThreshold])
  /**
   * The content's layout size when the camera last framed it.
   *
   * A fit measures whatever has laid out by the time it runs — two frames
   * after the resetKey changes, with a 150 ms backstop — and a six-phase board
   * with images is still growing then. The resize path afterwards only ever
   * re-CENTRED, which preserves the zoom that intermediate size produced, so
   * nothing corrected it: measured 0.1498 against a correct fit of 0.0617,
   * i.e. the board rendering 2.4x too big for the viewport, at a different
   * wrong value on every load. That is the "random landing".
   *
   * Comparing against this tells a *late layout* (refit) apart from a *window
   * drag* (recentre, because the zoom is the reader's). Layout size, not
   * `getBoundingClientRect`, so the camera's own transform cannot feed back.
   */
  const fittedContentSizeRef = useRef<{ width: number; height: number } | null>(
    null,
  )
  /**
   * Latest `animateFit`, kept in a ref so `fitToView` stays identity-stable
   * across renders — otherwise flipping the prop would re-run the fit
   * effect and fire a second camera move. Synced by an effect declared
   * above the fit effect, so it is current by the time that effect reads it.
   */
  const animateFitRef = useRef(animateFit)
  const fitSelectorRef = useRef(fitSelector)
  const flightRevealElRef = useRef<HTMLElement | null>(null)
  const focusTargetRef = useRef<HTMLElement | null>(null)
  const pendingFocusTransferRef = useRef<CameraFocusTransfer | null>(null)
  const activeFocusTransferRef = useRef<CameraFocusTransfer | null>(null)

  useLayoutEffect(() => {
    animateFitRef.current = animateFit
    cameraDestinationKeyRef.current = cameraDestinationKey
    cameraDestinationResolvedRef.current = cameraDestinationResolved
    onFitReadyRef.current = onFitReady
    fitSelectorRef.current = fitSelector
  }, [
    animateFit,
    cameraDestinationKey,
    cameraDestinationResolved,
    onFitReady,
    fitSelector,
  ])

  const cancelFitAnimation = useCallback(
    (kind: 'cancelled' | 'superseded' = 'cancelled') => {
      restoreFocusPaint(activeFocusTransferRef.current)
      activeFocusTransferRef.current = null
      restoreFocusPaint(pendingFocusTransferRef.current)
      if (kind === 'cancelled') pendingFocusTransferRef.current = null
      carriedFitVelocityRef.current =
        kind === 'superseded' ? fitAnimationVelocityRef.current : undefined
      if (fitAnimationRef.current !== null) {
        cancelAnimationFrame(fitAnimationRef.current)
        fitAnimationRef.current = null
        fitAnimationTargetRef.current = null
        fitAnimationRetargetRef.current = null
        activeFlightTracksFitRef.current = false
        fitAnimationResolveRef.current?.({
          kind,
          transform: transformRef.current,
        })
        fitAnimationResolveRef.current = null
        fitAnimationPromiseRef.current = null
      }
      if (kind === 'cancelled') {
        fitAnimationVelocityRef.current = {
          pan: { x: 0, y: 0 },
          zoomPerMs: 0,
        }
      }
    },
    [],
  )

  const resolveSemanticOutcome = useCallback(
    (result: CameraTransitionResult) => {
      const key = pendingSemanticOutcomeKeyRef.current
      if (!key) return
      pendingSemanticOutcomeKeyRef.current = null
      semanticOutcomeGenerationRef.current += 1
      settleJump(key, verdictOfFlight(result.kind))
    },
    [],
  )

  const cancelCameraNavigation = useCallback(() => {
    resolveSemanticOutcome({
      kind: 'cancelled',
      transform: transformRef.current,
    })
    navigationGenerationRef.current += 1
    pendingFitRef.current = false
    fitSettlingRef.current = false
    cancelFitAnimation()
  }, [cancelFitAnimation, resolveSemanticOutcome])

  /**
   * Let go of the flight without answering for it.
   *
   * An unmount is not a verdict. This viewport can vanish mid-flight while
   * the destination the reader asked for is unchanged: the path filter for a
   * freshly opened scenario resolves a beat after the selection, so the board
   * is briefly replaced by its no-paths state and the canvas remounts and
   * refits the SAME semantic target. Publishing `cancelled` from the cleanup
   * answered every waiter against the key the next mount was about to LAND —
   * an agent was told its navigation failed while the camera flew exactly
   * where it asked, and the phone's sheet put its wash back over a canvas
   * still in the air after about a sixth of a second.
   *
   * Dropping the key without publishing leaves those waiters listening, so
   * the remount's own verdict reaches them, and a canvas gone for good is
   * answered by the jump's deadline instead — `unanswered`, which is honest
   * in a way a cancellation this viewport is in no position to claim once it
   * no longer owns the camera is not. This is the only place that chooses
   * silence; the decision record for the handshake carries the rest of the
   * reasoning, so that a correction to it lands once rather than in four
   * copies.
   */
  const relinquishCameraNavigation = useCallback(() => {
    pendingSemanticOutcomeKeyRef.current = null
    semanticOutcomeGenerationRef.current += 1
    navigationGenerationRef.current += 1
    pendingFitRef.current = false
    fitSettlingRef.current = false
    cancelFitAnimation()
  }, [cancelFitAnimation])

  const supersedeCameraNavigation = useCallback(() => {
    resolveSemanticOutcome({
      kind: 'superseded',
      transform: transformRef.current,
    })
    navigationGenerationRef.current += 1
    pendingFitRef.current = false
    fitSettlingRef.current = false
    cancelFitAnimation('superseded')
  }, [cancelFitAnimation, resolveSemanticOutcome])

  const commitTransform = useCallback(
    (
      nextPan: { x: number; y: number },
      nextZoom: number,
      syncReact = false,
      /** See `applyTransformToElement` — animated fits pass `stampFitSemanticTier`. */
      tierZoom?: number,
    ) => {
      transformRef.current = { pan: nextPan, zoom: nextZoom }
      const ground = containerRef.current
      if (ground) applyGroundToElement(ground, nextPan, nextZoom)
      const el = contentRef.current
      if (el) {
        applyTransformToElement(
          el,
          nextPan,
          nextZoom,
          semanticThresholdRef.current,
          tierZoom,
        )
      }
      if (syncReact) {
        setPan(nextPan)
        setZoom(nextZoom)
      }
    },
    // Identity-stable on purpose — see `semanticThresholdRef`. Everything
    // downstream of this callback schedules fits, and a rebuild there is a
    // camera move.
    [],
  )

  /**
   * Pick the zoom the blocks-tier decision reads for a fit, and mark the
   * named destination so its cells can opt out of the density encoding.
   *
   * Overview → scenario lands above `SEMANTIC_ZOOM_THRESHOLD`; stamping
   * that zoom on the whole board painted every cell on takeoff (~500ms
   * hitch). Overview → phase stays below the threshold and did not.
   * While the board is already in blocks and the destination would leave
   * it, keep the density encoding and reveal only the fit target.
   *
   * @param destZoom - Zoom the camera is flying toward.
   * @returns Zoom the tier decision should read.
   */
  const stampFitSemanticTier = useCallback((destZoom: number): number => {
    const content = contentRef.current
    const threshold = semanticThresholdRef.current
    const stayInBlocks =
      content?.dataset.semanticTier === 'blocks' && destZoom >= threshold
    const named =
      content?.querySelector<HTMLElement>(fitSelectorRef.current) ?? null
    flightRevealElRef.current = assignCameraFlightReveal(
      stayInBlocks ? named : null,
      flightRevealElRef.current,
    )
    return stayInBlocks ? threshold - Number.EPSILON : destZoom
  }, [])

  const animateTransform = useCallback(
    (
      nextPan: { x: number; y: number },
      nextZoom: number,
      trackFitTarget = false,
    ): Promise<CameraTransitionResult> => {
      cancelFitAnimation('superseded')
      const from = transformRef.current
      let target = { pan: nextPan, zoom: nextZoom }

      /*
        The viewport is read PER FRAME, not snapshotted.

        Interpolating about the viewport centre made `height` load-bearing —
        the old rectangle-width maths used `width` alone. A snapshot taken
        while the container is still zero-height (a fit scheduled from a
        layout effect, a collapsed panel, a `display` change in the same
        commit) fell back to 1, so every intermediate frame was computed
        about y≈0 instead of the real centre: the camera swung hundreds of
        pixels out and snapped home on the last frame, because the endpoints
        short-circuit and stay exact. Reading live also means a container
        that resizes mid-ease (chrome opening) is followed rather than
        ignored.
      */
      const readViewport = () => {
        const container = containerRef.current
        return {
          width: container?.clientWidth ?? 0,
          height: container?.clientHeight ?? 0,
        }
      }

      // Nothing to interpolate against, and no frame would be honest about
      // it — land on the target rather than animate through a fictional
      // centre.
      const initialViewport = readViewport()
      if (initialViewport.width <= 0 || initialViewport.height <= 0) {
        pendingFocusTransferRef.current = null
        commitTransform(nextPan, nextZoom, true, stampFitSemanticTier(nextZoom))
        return Promise.resolve<CameraTransitionResult>({
          kind: 'completed',
          transform: target,
        })
      }

      fitAnimationTargetRef.current = target
      activeFlightTracksFitRef.current = trackFitTarget
      activeFocusTransferRef.current = pendingFocusTransferRef.current
      pendingFocusTransferRef.current = null
      let plan = createCameraFlightPlan({
        from,
        to: target,
        viewport: initialViewport,
        ...(fitDurationMs === undefined ? {} : { durationMs: fitDurationMs }),
        initialVelocity: carriedFitVelocityRef.current,
      })
      carriedFitVelocityRef.current = undefined

      const flight = new Promise<CameraTransitionResult>((resolve) => {
        fitAnimationResolveRef.current = resolve
        let firstFrameAt: number | null = null
        let lastFrameAt: number | null = null
        let lastRetargetAt = Number.NEGATIVE_INFINITY
        let focusProgress = 0
        let segmentFocusStart = 0
        fitAnimationRetargetRef.current = (nextTarget) => {
          if (isSameTransform(target, nextTarget)) return
          const viewport = readViewport()
          const safeViewport =
            viewport.width > 0 && viewport.height > 0
              ? viewport
              : initialViewport
          target = nextTarget
          fitAnimationTargetRef.current = nextTarget
          plan = createCameraFlightPlan({
            from: transformRef.current,
            to: nextTarget,
            viewport: safeViewport,
            ...(fitDurationMs === undefined
              ? {}
              : { durationMs: fitDurationMs }),
            initialVelocity: fitAnimationVelocityRef.current,
          })
          segmentFocusStart = focusProgress
          firstFrameAt = lastFrameAt
          lastRetargetAt = lastFrameAt ?? lastRetargetAt
        }
        const step = (now: number) => {
          lastFrameAt = now
          if (activeFlightTracksFitRef.current) {
            const liveTarget = computeLiveFitRef.current?.()
            if (
              liveTarget &&
              !isSameTransform(target, liveTarget) &&
              now - lastRetargetAt >= 64
            ) {
              fitAnimationRetargetRef.current?.(liveTarget)
            }
          }
          firstFrameAt ??= now
          const sample = plan.sample(now - firstFrameAt)
          focusProgress = Math.max(
            focusProgress,
            segmentFocusStart + (1 - segmentFocusStart) * sample.progress,
          )
          applyFocusPaint(activeFocusTransferRef.current, focusProgress)
          fitAnimationVelocityRef.current = sample.velocity
          commitTransform(
            sample.transform.pan,
            sample.transform.zoom,
            sample.done,
            stampFitSemanticTier(target.zoom),
          )
          if (!sample.done) {
            fitAnimationRef.current = requestAnimationFrame(step)
            return
          }
          fitAnimationRef.current = null
          fitAnimationTargetRef.current = null
          fitAnimationRetargetRef.current = null
          activeFlightTracksFitRef.current = false
          fitAnimationResolveRef.current = null
          fitAnimationPromiseRef.current = null
          fitAnimationVelocityRef.current = {
            pan: { x: 0, y: 0 },
            zoomPerMs: 0,
          }
          restoreFocusPaint(activeFocusTransferRef.current)
          activeFocusTransferRef.current = null
          resolve({ kind: 'completed', transform: target })
        }
        fitAnimationRef.current = requestAnimationFrame(step)
      })
      fitAnimationPromiseRef.current = flight
      return flight
    },
    [cancelFitAnimation, commitTransform, fitDurationMs, stampFitSemanticTier],
  )

  /**
   * Publish the live transform to React once the gesture goes quiet.
   *
   * Trailing rather than leading: during a pinch nothing reads `zoom` that
   * cannot wait, and the point is to keep React out of the gesture entirely.
   */
  const syncTimer = useRef<number | null>(null)
  const syncZoomToReact = useCallback(() => {
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null
      const { pan: p, zoom: z } = transformRef.current
      setPan(p)
      setZoom(z)
    }, 80)
  }, [])

  useEffect(
    () => () => {
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current)
    },
    [],
  )

  const zoomAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      scaleFactor: number,
      syncReact = true,
    ) => {
      const el = containerRef.current
      if (!el) return

      cancelCameraNavigation()
      userAdjustedViewRef.current = true

      const rect = el.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const current = transformRef.current
      const newZoom = clampZoom(current.zoom * scaleFactor)
      const next = transformCameraAroundPoint(
        current,
        { x: mx, y: my },
        { x: mx, y: my },
        newZoom,
      )

      commitTransform(next.pan, next.zoom, syncReact)
    },
    [cancelCameraNavigation, commitTransform],
  )

  const zoomBetweenPoints = useCallback(
    (
      fromClientX: number,
      fromClientY: number,
      toClientX: number,
      toClientY: number,
      scaleFactor: number,
      syncReact = true,
    ) => {
      const el = containerRef.current
      if (!el) return

      cancelCameraNavigation()
      userAdjustedViewRef.current = true

      const rect = el.getBoundingClientRect()
      const current = transformRef.current
      const next = transformCameraAroundPoint(
        current,
        { x: fromClientX - rect.left, y: fromClientY - rect.top },
        { x: toClientX - rect.left, y: toClientY - rect.top },
        clampZoom(current.zoom * scaleFactor),
      )
      commitTransform(next.pan, next.zoom, syncReact)
    },
    [cancelCameraNavigation, commitTransform],
  )

  /**
   * Camera transform that frames the fit target, or null when the geometry
   * isn't measurable yet (viewport unmounted, content not laid out).
   * `forcedZoom` keeps an existing zoom and solves for pan only.
   */
  const computeFitTransform = useCallback(
    (forcedZoom?: number, selector = fitSelector) => {
      const el = containerRef.current
      const content = contentRef.current
      if (!el || !content) return null

      const margin = fitMargin
      const matchedTarget = content.querySelector<HTMLElement>(selector)
      const fitTarget =
        matchedTarget ?? (selector === fitSelector ? content : null)
      if (!fitTarget) return null
      const { zoom: currentZoom } = transformRef.current
      const bounds = measureFitBounds(content, fitTarget, currentZoom)
      lastFitGeometryRef.current = bounds

      const insets = {
        top: margin + fitTopInset,
        right: margin,
        bottom: margin + fitBottomInset,
        left: margin,
      }
      const fitWidth = Math.max(el.clientWidth - insets.left - insets.right, 1)
      const fitHeight = Math.max(
        el.clientHeight - insets.top - insets.bottom,
        1,
      )
      if (bounds.width <= 0 || bounds.height <= 0) return null

      const trueFit = Math.min(
        fitWidth / bounds.width,
        fitHeight / bounds.height,
        maxFitZoom,
      )
      const nextZoom = forcedZoom ?? clampZoom(Math.max(trueFit, minFitZoom))
      /**
       * The floor won: the target cannot fit at the floor, and the camera
       * is sitting at it. Stated in terms of the floor rather than "does it
       * overflow" so a resize recentring (`forcedZoom`) at the same floored
       * zoom keeps the same framing — while a reader who has zoomed PAST
       * the floor overflows for their own reasons and keeps centring.
       */
      const floored = trueFit < minFitZoom && nextZoom <= minFitZoom + 1e-6

      const targetCenterX = bounds.left + bounds.width / 2
      const targetCenterY = bounds.top + bounds.height / 2
      const viewportCenterX = insets.left + fitWidth / 2
      const viewportCenterY = insets.top + fitHeight / 2

      /*
        Centre what fits; anchor what the FLOOR pushed off screen.

        An axis the target overflows has no meaningful centre — centring it
        drops the camera in the middle of the board with both edges off
        screen. Anchoring that axis to the viewport's inset corner starts
        the reader at the target's beginning instead.

        Only when the floor caused the overflow. A viewport with no floor
        configured (every desktop canvas) never reaches this branch, and
        neither does a reader who has zoomed in past it — that overflow is
        their own doing, and yanking their view to a corner on the next
        resize would be the surprise.

        AND THE ANCHORED AXIS READS THE INSET IT ANCHORS TO, NOTHING ELSE.
        This is the one place that argument is written out; the shell, the
        agent sheet, the fit-inset helper and both test halves state the
        consequence and point here, because it was restated in each of them
        once and the copies drifted.

        The vertical anchor solves for `insets.top`, so a bottom-occluding
        surface — the phone's agent sheet, which owns the lower 60% of that
        screen — does not move it. Deliberate. A board taller than the strip
        such a surface leaves has no framing that keeps both of its edges, and
        the edge worth keeping is the one the board begins at: its lane
        headers and first step, which is what a reader arriving at a
        destination reads. Buying bottom clearance here would pan that
        beginning up out of the frame the fit reserves — past `insets.top`,
        which on the phone's detail canvas is the bottom-navigation clearance
        mirrored to the top to hold the visual centre — to gain room at an
        edge already hundreds of pixels off screen. So the destination is
        above the sheet because it is ANCHORED, and saying the occluded height
        put it there reads a delivered value as a framing.

        The bottom inset earns its keep in the centring branch above: a board
        that fits the strip vertically is centred INSIDE the strip rather than
        in the container, and without the inset that board lands behind the
        surface entirely. It also decides which of the two branches a board
        takes at all, since `overflowsY` is measured against `fitHeight` — so
        "the bottom inset is inert on a floored fit" is too strong a claim;
        it is inert on an axis the floor pushed off the strip, and the floor
        can equally bind by width. Both branches are pinned at the phone's own
        floor in `useZoomPanViewport.cameraFlight.test.tsx`.
      */
      const overflowsX = floored && bounds.width * nextZoom > fitWidth + 0.5
      const overflowsY = floored && bounds.height * nextZoom > fitHeight + 0.5

      return {
        pan: {
          x: overflowsX
            ? insets.left - bounds.left * nextZoom
            : viewportCenterX - targetCenterX * nextZoom,
          y: overflowsY
            ? insets.top - bounds.top * nextZoom
            : viewportCenterY - targetCenterY * nextZoom,
        },
        zoom: nextZoom,
      }
    },
    [
      fitBottomInset,
      fitMargin,
      fitSelector,
      fitTopInset,
      maxFitZoom,
      minFitZoom,
    ],
  )

  useLayoutEffect(() => {
    computeLiveFitRef.current = computeFitTransform
    return () => {
      computeLiveFitRef.current = null
    }
  }, [computeFitTransform])

  /** Frames the fit target. Returns false when geometry wasn't measurable. */
  const fitToView = useCallback(
    (options?: { animate?: boolean }) => {
      const next = computeFitTransform()
      if (!next) return false

      const shouldAnimate =
        (options?.animate ?? animateFitRef.current) &&
        !prefersReducedMotion() &&
        !document.hidden
      let outcome: Promise<CameraTransitionResult>
      if (shouldAnimate) {
        if (isSameTransform(transformRef.current, next)) {
          cancelFitAnimation('superseded')
          pendingFocusTransferRef.current = null
          stampFitSemanticTier(next.zoom)
          outcome = Promise.resolve<CameraTransitionResult>({
            kind: 'completed',
            transform: next,
          })
        } else {
          const activeTarget = fitAnimationTargetRef.current
          if (
            !activeTarget ||
            !isSameTransform(activeTarget, { pan: next.pan, zoom: next.zoom })
          ) {
            if (activeTarget && fitAnimationRetargetRef.current) {
              fitAnimationRetargetRef.current(next)
              outcome = fitAnimationPromiseRef.current!
            } else {
              outcome = animateTransform(next.pan, next.zoom, true)
            }
          } else {
            outcome = fitAnimationPromiseRef.current!
          }
        }
      } else {
        /*
          Cancel first. Every other camera entry point in this file does
          (`zoomAtPoint`, `zoomBetweenPoints`, `beginPan`, `panBy`, the wheel
          pan) — this branch did not, and `commitTransform` only writes the
          ref and the element: a queued `step` still holds its own captured
          `from`/`target` and repaints straight over the correction on the
          next frame.

          It made two escape hatches inert. `refitWhenIdle` gives up waiting
          past its deadline precisely BECAUSE an ease is still running, then
          "corrected" into that ease and lost. And a backgrounded tab stops
          `requestAnimationFrame` mid-flight, so the queued frame is still
          pending when the reader returns — the deadline correction lands
          during the freeze, then the resumed frame slams the camera back to
          the pre-layout framing the instant the tab is looked at.
        */
        cancelFitAnimation()
        pendingFocusTransferRef.current = null
        commitTransform(
          next.pan,
          next.zoom,
          true,
          stampFitSemanticTier(next.zoom),
        )
        outcome = Promise.resolve<CameraTransitionResult>({
          kind: 'completed',
          transform: next,
        })
      }
      const content = contentRef.current
      if (content) {
        fittedContentSizeRef.current = {
          width: content.offsetWidth,
          height: content.offsetHeight,
        }
        /*
          Re-stamp the badges one frame on, unconditionally.

          The boost write is guarded on the VALUE changing — right for a pan,
          wrong across a fit: the badges mount WITH the board, after the write
          that set this zoom's value, so they would keep the scale they were
          born with (1) for as long as the camera then held still. Which is
          the counter-scale silently not happening, and nothing on screen
          says so. One frame later the board has laid out and the forced
          re-stamp finds them.

          Keep the current blocks-tier mark. This used to pass the live zoom
          with no `tierZoom`, so a zoom-in that had just decided to stay in
          blocks (or had stamped destination, then this ran) flipped the
          whole board on the takeoff frame.
        */
        requestAnimationFrame(() => {
          const el = contentRef.current
          if (!el) return
          delete el.dataset.semanticLabelBoost
          const live = transformRef.current
          const threshold = semanticThresholdRef.current
          const tierZoom =
            el.dataset.semanticTier === 'blocks'
              ? threshold - Number.EPSILON
              : live.zoom
          applyTransformToElement(
            el,
            live.pan,
            live.zoom,
            threshold,
            tierZoom,
          )
        })
      }
      return outcome
    },
    [animateTransform, cancelFitAnimation, commitTransform, computeFitTransform, stampFitSemanticTier],
  )

  /**
   * Re-centers the fit target at the current zoom. Resizes use this instead
   * of a fit so a window drag never throws away the zoom the user chose.
   */
  const recenterToView = useCallback(() => {
    const current = transformRef.current
    const next = computeFitTransform(current.zoom)
    if (!next || isSameTransform(current, next)) return
    commitTransform(next.pan, next.zoom, true)
  }, [commitTransform, computeFitTransform])

  /**
   * Runs the fit scheduled by the last `resetKey` change, at most once.
   * Clearing `pendingFitRef` here is what demotes the 150 ms timeout to a
   * true backstop — without it the timeout fires on top of the rAF fit and
   * restarts the ease from its own midpoint.
   */
  const runPendingFit = useCallback(
    (animate: boolean) => {
      if (!pendingFitRef.current) return false
      const outcome = fitToView({ animate: hasFittedRef.current && animate })
      // Geometry wasn't ready — leave the fit pending for the backstop.
      if (!outcome) return false
      pendingFitRef.current = false
      hasFittedRef.current = true
      return outcome
    },
    [fitToView],
  )

  const resetView = useCallback(() => {
    cancelCameraNavigation()
    userAdjustedViewRef.current = false
    commitTransform({ x: 0, y: 0 }, 1, true)
  }, [cancelCameraNavigation, commitTransform])

  useLayoutEffect(() => {
    const { pan: p, zoom: z } = transformRef.current
    commitTransform(p, z, false)
  }, [commitTransform])

  /**
   * Settle the framing this mount inherited from the tab it remounted into,
   * once and only once.
   *
   * Returns `true` when that framing was adopted. `false` is two cases:
   * the viewport still has no layout (pending stays true — wait, do not
   * fit or zero), or the snapshot was dropped (pending is false — caller
   * fits). Callers that must not confuse those use `resolveInheritedCamera`.
   */
  const adoptInheritedCamera = useCallback(
    (focusTarget: HTMLElement | null) => {
      if (!restoredCameraPendingRef.current) return false
      if (!cameraDestinationResolvedRef.current) return false
      const container = containerRef.current
      const content = contentRef.current
      /*
        Wait only when the viewport has no layout yet. A measurable viewport
        with no board cannot name this destination — drop and let the caller
        fit, rather than holding restore forever.
      */
      if (viewportHasNoLayout(container)) return false
      restoredCameraPendingRef.current = false
      if (!content) {
        restoredSnapshotRef.current = undefined
        return false
      }
      const snapshot = restoredSnapshotRef.current
      /*
        The snapshot, NOT the live transform. A mount that waited out a
        loading destination has already been fitted against the skeleton by
        the ordinary machinery, so by the time this runs the live transform
        is that placeholder fit — reading it here would restore the wait
        instead of the framing.
      */
      const inherited = snapshot?.transform ?? transformRef.current
      const target = focusTarget ?? content
      /*
        Measured at the zoom the board is actually PAINTED at, not the one
        being adopted. `measureFitBounds` divides client rectangles back out
        by the live scale to reach content coordinates, so handing it the
        inherited zoom while the placeholder fit is still on screen reports a
        box off by the ratio between them — and every geometry comparison
        below would fail on a board that never moved.
      */
      const geometry =
        content && target
          ? measureFitBounds(content, target, transformRef.current.zoom)
          : null
      const namesThisBoard =
        snapshot !== undefined &&
        geometry !== null &&
        snapshot.destinationKey === cameraDestinationKeyRef.current &&
        isSameFitGeometry(snapshot.geometry, geometry)
      const pointsAtTheCanvas =
        container !== null &&
        content !== null &&
        inherited.zoom >= MIN_ZOOM &&
        inherited.zoom <= MAX_ZOOM &&
        inherited.pan.x + content.scrollWidth * inherited.zoom > 0 &&
        inherited.pan.y + content.scrollHeight * inherited.zoom > 0 &&
        inherited.pan.x < container.clientWidth &&
        inherited.pan.y < container.clientHeight &&
        namesThisBoard
      if (pointsAtTheCanvas && geometry !== null) {
        lastFitGeometryRef.current = geometry
        hasFittedRef.current = true
        userAdjustedViewRef.current = true
        pendingFitRef.current = false
        commitTransform(inherited.pan, inherited.zoom, true)
        resolveSemanticOutcome({ kind: 'completed', transform: inherited })
        onFitReadyRef.current?.()
        return true
      }
      restoredSnapshotRef.current = undefined
      return false
    },
    [commitTransform, resolveSemanticOutcome],
  )

  /**
   * Adopt the inherited framing, wait for a measurable viewport, or drop it.
   * Callers must not zero or fit while this is `waiting`.
   *
   * @param focusTarget - Named fit target on the board, if any
   */
  const resolveInheritedCamera = useCallback(
    (focusTarget: HTMLElement | null): InheritedCameraAttempt => {
      if (adoptInheritedCamera(focusTarget)) return 'adopted'
      return restoredCameraPendingRef.current ? 'waiting' : 'dropped'
    },
    [adoptInheritedCamera],
  )

  useLayoutEffect(() => {
    if (resetKey === undefined) return
    // A newer semantic destination owns the camera immediately. Waiting for
    // its geometry must not leave the previous flight visibly pursuing an
    // intent the reader has already replaced. Supersession carries the live
    // compatible velocity into the flight that starts after settling.
    // Only a DIFFERENT destination supersedes the one being waited on.
    // `resetKey` carries more than the semantic target — a focus nonce, the
    // view, the phase and scenario counts — so re-selecting the row already
    // open re-fires this effect with the same `cameraOutcomeKey`. Publishing
    // `superseded` there resolved the caller's wait against the very key
    // about to be re-armed, and a navigation that lands perfectly reported
    // that its camera was never claimed.
    if ((cameraOutcomeKey ?? null) !== pendingSemanticOutcomeKeyRef.current) {
      resolveSemanticOutcome({
        kind: 'superseded',
        transform: transformRef.current,
      })
    }
    cancelFitAnimation('superseded')
    const navigationGeneration = ++navigationGenerationRef.current
    pendingSemanticOutcomeKeyRef.current = cameraOutcomeKey ?? null
    const semanticOutcomeGeneration = ++semanticOutcomeGenerationRef.current
    const content = contentRef.current
    const nextFocusTarget =
      content?.querySelector<HTMLElement>(fitSelector) ?? null
    const previousFocusTarget = focusTargetRef.current
    const originPaint = focusPaintElements(previousFocusTarget)
    const destinationPaint = focusPaintElements(nextFocusTarget)
    pendingFocusTransferRef.current =
      previousFocusTarget &&
      nextFocusTarget &&
      previousFocusTarget !== nextFocusTarget &&
      originPaint.length > 0 &&
      destinationPaint.length > 0
        ? {
            origin: captureFocusPaint(originPaint),
            destination: captureFocusPaint(destinationPaint),
          }
        : null
    applyFocusPaint(pendingFocusTransferRef.current, 0)
    focusTargetRef.current = nextFocusTarget
    if (restoredCameraPendingRef.current && cameraDestinationResolvedRef.current) {
      pendingFocusTransferRef.current = null
      const attempt = resolveInheritedCamera(nextFocusTarget)
      if (attempt === 'adopted' || attempt === 'waiting') return
      // Dropped: the mount seeded the camera with a framing that turns out
      // to describe another board, so clear it before the fit below rather
      // than easing away from a place the reader was never taken.
      commitTransform({ x: 0, y: 0 }, 1, true)
    }
    pendingFitRef.current = true
    userAdjustedViewRef.current = false

    // Captured now, not read at fit time: a one-shot skip flag may be
    // cleared between scheduling this fit and the frame it runs on.
    const animate = animateFitRef.current
    pendingFitAnimateRef.current = animate

    /*
      Take off once the NAMED target is measurable, not once its box has
      stopped moving.

      Waiting for left/top/width/height AND viewport size to freeze was
      right when a finished ease could not retarget — a comparison panel
      that grew after landing snapped. Flights now replan from live
      geometry, so that wait is dead time. Overview → scenario is the
      case that paid for it: focusing a scenario mounts a sticky header,
      changes fit insets, and can reshuffle row height, so consecutive
      frames rarely agree and the 250 ms backstop becomes the takeoff.
      Overview → phase barely churns, which is why it already felt
      immediate. Two frames of the same named element (not the content
      fallback) is enough to prove the destination exists; live
      retargeting follows the rest.

      `fitSettlingRef` still keeps the resize observer's owed-fit branch
      out while this loop is watching.
    */
    fitSettlingRef.current = true
    let frame = 0
    let polls = 0
    let lastGeometry: {
      left: number
      top: number
      width: number
      height: number
      viewportWidth: number
      viewportHeight: number
    } | null = null
    let lastTarget: HTMLElement | null = null

    const stop = () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }

    /*
      Stand down only once the fit has actually been CONSUMED.

      `runPendingFit` can decline: `computeFitTransform` bails when the
      target measures 0×0, leaving `pendingFitRef` raised. Lowering the guard
      regardless handed the next fit to the ResizeObserver's owed-fit branch
      — which fires on the panel's mid-layout growth, i.e. exactly the
      premature fit this loop exists to prevent, ~200 ms before the backstop
      could have helped.
    */
    const runFit = () => {
      if (navigationGeneration !== navigationGenerationRef.current) {
        restoreFocusPaint(pendingFocusTransferRef.current)
        pendingFocusTransferRef.current = null
        fitSettlingRef.current = false
        stop()
        return false
      }
      const outcome = runPendingFit(animate)
      if (!outcome) return false
      fitSettlingRef.current = false
      stop()
      void outcome.then((result) => {
        if (semanticOutcomeGeneration === semanticOutcomeGenerationRef.current) {
          resolveSemanticOutcome(result)
        }
        if (
          result.kind === 'completed' &&
          navigationGeneration === navigationGenerationRef.current
        ) {
          onFitReadyRef.current?.()
        }
      })
      return true
    }

    const step = () => {
      if (navigationGeneration !== navigationGenerationRef.current) {
        stop()
        return
      }
      const content = contentRef.current
      const matchedTarget =
        content?.querySelector<HTMLElement>(fitSelector) ?? null
      const target = matchedTarget ?? content
      const container = containerRef.current
      const bounds =
        content && target
          ? measureFitBounds(content, target, transformRef.current.zoom)
          : null
      const geometry =
        bounds && container
          ? {
              ...bounds,
              viewportWidth: container.clientWidth,
              viewportHeight: container.clientHeight,
            }
          : null
      /*
        The named target has to exist and have a real size — `0×0` is a
        board that has not begun laying out. Frame one of a navigation
        may still miss `fitSelector` and measure the content fallback;
        taking off then aims at the whole canvas. Two frames of the
        SAME named element are enough. Position and viewport may still
        be moving; the flight follows them.
      */
      const measurable =
        geometry !== null &&
        geometry.width > 0 &&
        geometry.height > 0 &&
        geometry.viewportWidth > 0 &&
        geometry.viewportHeight > 0
      const readyToFly =
        matchedTarget !== null &&
        measurable &&
        lastTarget === matchedTarget &&
        lastGeometry !== null

      if (readyToFly && runFit()) return

      lastGeometry = measurable ? geometry : null
      lastTarget = matchedTarget
      // Bounded, like `refitWhenIdle` below. A target that never goes quiet
      // — an oscillating measurement, a selector that keeps missing — would
      // otherwise poll forever, and each poll is a `querySelector` plus two
      // forced layout reads scheduled right after our own transform writes.
      if (++polls > MAX_SETTLE_POLLS) {
        if (!runFit()) {
          restoreFocusPaint(pendingFocusTransferRef.current)
          pendingFocusTransferRef.current = null
        }
        return
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    // Backstop if the named target never appears. Takeoff is otherwise the
    // two-frame named-target check above; holding the rAF past this timeout
    // was a permanent per-frame layout read for the life of the view.
    const timeout = window.setTimeout(runFit, 250)

    return () => {
      fitSettlingRef.current = false
      stop()
    }
  }, [
    resetKey,
    fitSelector,
    runPendingFit,
    cancelFitAnimation,
    commitTransform,
    cameraOutcomeKey,
    resolveSemanticOutcome,
    resolveInheritedCamera,
  ])

  /*
    The other half of the same decision, for the mount that had to wait.

    A returning canvas boots through a loading destination, so at the commit
    that raises the fit above there is still nothing to compare a saved
    framing against. The board arriving is not a `resetKey` change — the
    destination was already named while the skeleton stood in for it — so
    the framing needs a seam of its own here, on the resolution itself.

    Declared AFTER the fit effect on purpose: on a mount that never waited,
    the effect above has already decided, and this one finds nothing pending.
  */
  useLayoutEffect(() => {
    if (!restoredCameraPendingRef.current) return
    if (!cameraDestinationResolved) return
    const focusTarget =
      contentRef.current?.querySelector<HTMLElement>(fitSelectorRef.current) ??
      null
    cancelFitAnimation()
    const attempt = resolveInheritedCamera(focusTarget)
    if (attempt === 'adopted') {
      focusTargetRef.current = focusTarget
      return
    }
    if (attempt === 'waiting') return
    // No inherited framing survives, and the fit that would have covered
    // this is already spent on the placeholder. Fit the real board now, as
    // a jump: arriving content is not a navigation.
    pendingFitRef.current = true
    userAdjustedViewRef.current = false
    runPendingFit(false)
  }, [
    cameraDestinationResolved,
    cameraDestinationKey,
    resolveInheritedCamera,
    cancelFitAnimation,
    runPendingFit,
  ])

  useEffect(
    () => () => {
      const lease = initialCamera.lease
      if (!lease) return
      /*
        Left before the board arrived. What this mount framed is a
        placeholder, and the destination it would file that framing under
        names the wait rather than a board — so it has nothing of its own to
        save. Hand the inherited framing straight back instead: leaving
        during a load must not cost the reader the aim they had before it.
      */
      if (!cameraDestinationResolvedRef.current) {
        const held = restoredSnapshotRef.current
        if (held && restoredCameraPendingRef.current) {
          writeCanvasViewState(lease, held)
        }
        return
      }
      // The live transform, whatever it is: a tab left mid-flight remembers
      // where the camera actually was, never the destination it was still
      // travelling to.
      if (!lastFitGeometryRef.current) return
      writeCanvasViewState(lease, {
        transform: transformRef.current,
        destinationKey: cameraDestinationKeyRef.current,
        geometry: lastFitGeometryRef.current,
      })
    },
    [initialCamera.lease],
  )

  useEffect(() => {
    return () => relinquishCameraNavigation()
  }, [relinquishCameraNavigation])

  useEffect(() => {
    const content = contentRef.current
    const container = containerRef.current
    if (!content) return

    let debounceTimer = 0

    const onResize = () => {
      if (
        restoredCameraPendingRef.current &&
        cameraDestinationResolvedRef.current
      ) {
        const focusTarget =
          contentRef.current?.querySelector<HTMLElement>(
            fitSelectorRef.current,
          ) ?? null
        if (resolveInheritedCamera(focusTarget) !== 'dropped') return
      }
      // A rotation is not a window drag: flipping the aspect ratio
      // invalidates whatever framing the user had built, and on a phone
      // there is no Reset control to recover with — so an orientation flip
      // refits even when the user has adjusted the view.
      const box = container?.getBoundingClientRect()
      if (box && box.width > 0 && box.height > 0) {
        const landscape = box.width > box.height
        const flipped =
          lastAspectLandscapeRef.current !== null &&
          landscape !== lastAspectLandscapeRef.current
        lastAspectLandscapeRef.current = landscape
        if (flipped) {
          userAdjustedViewRef.current = false
          window.clearTimeout(debounceTimer)
          fitToView({ animate: false })
          return
        }
      }

      if (userAdjustedViewRef.current) return

      // A fit that is still owed takes priority over every policy below: the
      // resetKey fit's settle loop and backstop can all pass before a heavy
      // mount's grid has laid out — after which this observer is the only
      // agent left, and the refit branch never ran it. A viewport that has
      // never framed anything has nothing to preserve; re-centering a camera
      // that does not exist yet is not a policy question. This is how Edit
      // mode ended up permanently at identity zoom over an empty corner.
      //
      // NOT while the settle loop is still watching: these observations are
      // the very mid-layout growth it is waiting out, and fitting from here
      // is exactly the premature fit the loop exists to prevent.
      if (pendingFitRef.current) {
        if (!fitSettlingRef.current) {
          runPendingFit(pendingFitAnimateRef.current)
        }
        return
      }

      if (refitOnResize) {
        // Checked as the resize is observed, not when the debounce fires:
        // the chrome window closes before a 200 ms debounce would elapse.
        if (suppressResizeRefit || isCanvasResizeRefitSuppressed()) return
        // Geometry changed under an active navigation. Recompute its target
        // through the normal fit policy and retarget the same flight/promise;
        // never wait for it to land and then apply a corrective snap.
        if (fitAnimationRef.current !== null) {
          fitToView({ animate: true })
          return
        }
        window.clearTimeout(debounceTimer)
        /*
          The content laid out further than the fit ever saw, on a camera the
          reader has not touched: re-FIT, do not re-centre. Re-centring keeps
          the zoom, and here the zoom is exactly what is wrong.

          Anything else — a window drag, chrome opening — still re-centres: a
          resize is not a navigation, and discarding the zoom the reader chose
          is the bug that branch exists to prevent.
        */
        const content = contentRef.current
        const fitted = fittedContentSizeRef.current
        const grewSinceFit =
          content !== null &&
          fitted !== null &&
          (Math.abs(content.offsetWidth - fitted.width) > 1 ||
            Math.abs(content.offsetHeight - fitted.height) > 1)
        /*
          NEVER while a fit ease is still in flight.

          A scenario focus grows its content mid-navigation, so this
          correction used to land ~200ms into the 420ms navigation ease,
          cancel it, and start a fresh ease from a moving camera — an
          easeInOut restart begins at zero velocity, so the visible result is
          the zoom braking hard partway through and setting off again. That
          is the "abrupt" phase→scenario transition. Waiting for the ease to
          land preserves one clean glide, followed only by the instant layout
          correction documented below.
        */
        /*
          Bounded. The poll waits out a fit ease, and a backgrounded tab
          stops `requestAnimationFrame` — so `fitAnimationRef` never clears
          and an unbounded poll spins at the throttled rate until unmount.
          Past the deadline the correction matters more than the ease it
          would interrupt, so it goes through.
        */
        let refitPolls = 0
        const maxRefitPolls = Math.ceil(
          ((fitDurationMs ?? CAMERA_FLIGHT_MAX_MS) * 2) / 50,
        )
        const refitWhenIdle = () => {
          if (fitAnimationRef.current !== null && refitPolls < maxRefitPolls) {
            refitPolls += 1
            // Never snap mid-ease — wait the glide out on a short poll.
            debounceTimer = window.setTimeout(refitWhenIdle, 50)
            return
          }
          /*
            INSTANT, never animated. An animated correction was the visible
            "zoom out from a focused view" on landing: the swap fit framed a
            board that had not finished laying out, and the correction then
            GLIDED to the true fit in front of the reader — a camera move
            nobody asked for. The landing choreography holds everything but
            the bare frames invisible until layout has been quiet, so this
            snap happens against structure only; and a navigation whose
            content grew corrects in the same frame its ease lands rather
            than starting a second glide.
          */
          fitToView({ animate: false })
        }
        debounceTimer = window.setTimeout(
          grewSinceFit ? refitWhenIdle : recenterToView,
          refitDebounceMs,
        )
        return
      }
    }

    const observer = new ResizeObserver(onResize)

    observer.observe(content)
    if (container) observer.observe(container)

    return () => {
      window.clearTimeout(debounceTimer)
      observer.disconnect()
    }
  }, [
    fitToView,
    fitDurationMs,
    recenterToView,
    resetKey,
    refitOnResize,
    refitDebounceMs,
    runPendingFit,
    suppressResizeRefit,
    resolveInheritedCamera,
  ])

  /**
   * Pinch to zoom, two fingers to pan.
   *
   * Bound on **window, in the capture phase**, and then filtered by hit test —
   * not on the container. Three failures came out of binding it to the
   * container, and they all look identical to the person using it (the canvas
   * simply does not move):
   *
   * 1. The effect reads `containerRef.current` once. If it runs before that
   *    node exists the listener is never attached, and since the deps are all
   *    stable it is never retried — the canvas is permanently unzoomable.
   * 2. Anything between the pointer and the container that handles `wheel`
   *    first wins, and the overlays on this canvas are numerous and change.
   * 3. A pointer over a child that is not a DOM descendant of the container —
   *    a portalled overlay drawn on top of the canvas — never bubbles to it.
   *
   * Capture on window has none of those failure modes: it runs before every
   * other handler, needs no ref at attach time, and asks
   * `elementFromPoint`-style containment rather than trusting the event path.
   *
   * `{ passive: false }` is what makes `preventDefault` legal here, and
   * preventing the default is the whole job on macOS — an unprevented
   * ctrl+wheel is a browser page-zoom, which is why an unzoomable canvas often
   * came with the *page* zooming instead.
   */
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = containerRef.current
      if (!el) return
      /*
        Pixels, once, at the door. Firefox reports LINES for a wheel mouse and
        Chromium reports pixels, and the camera used to consume both raw — the
        same notch moved the board 3px on one browser and 100 on the other.
        Every consumer below this line, including the sign-only scroll test,
        reads the same unit.
      */
      const { deltaX, deltaY } = normalizeWheelDelta(e)
      const target = e.target
      if (!(target instanceof Node) || !el.contains(target)) {
        // Not the canvas — but an unprevented ctrl+wheel is still a browser
        // *page* zoom, and a pinch that strays two pixels onto a popover or
        // the toolbar must not permanently rescale the whole app. Page zoom
        // persists across everything and is exactly what "the zoom keeps
        // shifting" feels like. Swallow the page zoom; apply nothing.
        if (e.ctrlKey) e.preventDefault()
        return
      }

      // macOS sends pinch as ctrl+wheel; ⌘+wheel is the mouse equivalent.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        // Immediate: a second viewport's window listener must not also apply
        // the same tick, squaring the scale factor.
        e.stopImmediatePropagation()
        /*
          The factor is clamped per event, not per gesture. A trackpad pinch
          is dozens of events of a few pixels each and is unaffected; a wheel
          mouse delivers a whole notch in ONE event, which at the trackpad's
          rate was a 2.7x scale change from a single click of the wheel.
        */
        const scaleFactor = wheelZoomScaleFactor(deltaY)
        /*
          `syncReact: false` — and this is the whole bug.

          A pinch is not one event, it is sixty a second. Syncing React on
          each one re-rendered the entire canvas subtree, which on a
          four-hundred-cell blueprint is far more work than a frame has time
          for, so the main thread saturated and the camera appeared not to
          move at all. A single ⌘+wheel tick always worked, which is exactly
          why this looked like "zoom is broken on the trackpad only".

          The pan branch below has always passed `false` for the same reason.
          The transform is written straight to the element either way; React
          state only carries `zoom` for chrome that reads it, and that can
          arrive one frame after the fingers stop.
        */
        zoomAtPoint(e.clientX, e.clientY, scaleFactor, false)
        syncZoomToReact()
        return
      }

      if (deltaX !== 0 || deltaY !== 0) {
        // A scrollable *inside* the canvas that can still consume this delta
        // keeps it — an overflowing grid, a cell body, a text editor.
        // Hijacking those scrolls pans the whole canvas while the text under
        // the pointer sits unread, which is the exact jank this handler
        // exists to fight. The touch path asks the same function.
        if (scrollableAncestorCanConsume(target, el, deltaX, deltaY)) {
          return
        }
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelCameraNavigation()
        userAdjustedViewRef.current = true
        const { pan: p, zoom: z } = transformRef.current
        commitTransform(
          {
            x: p.x - deltaX,
            y: p.y - deltaY,
          },
          z,
          false,
        )
        // Pan must publish too, on the same trailing debounce as zoom —
        // otherwise React's copy of the camera is the camera of ten minutes
        // ago, and the next feature to read it inherits a stale-state bug.
        syncZoomToReact()
      }
    }

    window.addEventListener('wheel', onWheel, {
      passive: false,
      capture: true,
    })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [cancelCameraNavigation, commitTransform, syncZoomToReact, zoomAtPoint])

  /**
   * Touch gestures ride the SAME Pointer Events as mouse pan — no parallel
   * TouchEvent code path. Every touch pointer is tracked in a map; one
   * finger pans (same rules as a mouse drag), and the moment a second
   * finger lands the gesture becomes a pinch: zoom by the ratio of pinch
   * distances through `zoomAtPoint` (centered on the midpoint), pan by the
   * midpoint's drift. The container's `touch-none` is what makes this
   * possible — it keeps the browser from claiming the gesture and
   * cancelling the pointer stream.
   *
   * Refs, not state: a pinch is sixty events a second, and the transform
   * writes straight to the element exactly like the wheel path above.
   */
  const touchPoints = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; x: number; y: number } | null>(null)
  /**
   * The last cumulative scale a WebKit `gesture*` stream reported. Safari
   * counts from 1 per gesture; the camera multiplies, so each event is
   * applied as its ratio against this.
   */
  const gestureScaleRef = useRef(1)
  /**
   * A finger down on a CELL is ambiguous: a tap (open it) or the start of a
   * board drag — phones expect both from anywhere. Neither is committed at
   * pointerdown; the finger goes into "pending" and only crossing the slop
   * distance turns it into a pan (and swallows the trailing click so the
   * drag does not also open the cell). A finger that lifts inside the slop
   * was a tap and is left entirely alone. Mouse keeps the strict rule —
   * cursor affordances make drag-from-background natural there.
   */
  const pendingTouchPan = useRef<{ id: number; x: number; y: number } | null>(
    null,
  )
  const suppressNextClick = useRef(false)
  // Mirror of `isPanning` for the 60Hz move path: `beginPan` from inside a
  // pointermove schedules (not flushes) the state commit, so the moves that
  // arrive before React lands would read the stale closure and be dropped —
  // the first frames of a slop-crossed drag stuttering. The ref is the
  // handler's truth; the state exists only for chrome (cursor).
  const isPanningRef = useRef(false)

  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      cancelCameraNavigation()
      userAdjustedViewRef.current = true
      isPanningRef.current = true
      setIsPanning(true)
      panStart.current = {
        x: clientX,
        y: clientY,
        panX: transformRef.current.pan.x,
        panY: transformRef.current.pan.y,
      }
    },
    [cancelCameraNavigation],
  )

  const endPan = useCallback(() => {
    isPanningRef.current = false
    setIsPanning(false)
  }, [])

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        // A primary touch means the browser sees NO other active touches —
        // anything still in the map is a ghost (a stream that died without
        // its up/cancel: an unmounted target, an OS takeover). Ghosts
        // otherwise pin the gesture in pinch mode forever, a stale pending
        // pan teleports the camera when its pointer id is reused, and a
        // stranded suppress flag eats the next honest tap — so a fresh
        // primary contact resets the whole gesture world.
        if (e.isPrimary) {
          touchPoints.current.clear()
          pinchStart.current = null
          pendingTouchPan.current = null
          suppressNextClick.current = false
        }
        touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touchPoints.current.size >= 2) {
          // Another finger: whatever was happening becomes a pinch — even if
          // a finger sits on a cell, and even mid-pinch (a third contact
          // rebases the pair rather than falling through to the mouse
          // path). Capture all so the stream cannot be stolen mid-gesture.
          pendingTouchPan.current = null
          endPan()
          const [a, b] = [...touchPoints.current.values()]
          pinchStart.current = {
            dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          }
          for (const id of touchPoints.current.keys()) {
            try {
              containerRef.current?.setPointerCapture(id)
            } catch {
              // A pointer that lifted between the map write and here.
            }
          }
          cancelCameraNavigation()
          userAdjustedViewRef.current = true
          return
        }
        /*
          One finger inside a scrolling region scrolls it, and the camera
          stays out of the way — the same answer the wheel path gives the
          same element. Leaving without a pending pan is what makes that
          possible: the board can no longer steal the gesture at the slop
          line, and the tap is untouched (no `preventDefault` here), so a
          cell inside an overflowing grid still opens on a tap.
        */
        const container = containerRef.current
        if (container && hasScrollableRegion(e.target as Node, container)) {
          suppressNextClick.current = false
          return
        }
      }
      // Cleared before ANY early return: a suppress flag stranded by a
      // cancelled gesture (OS edge swipe — no click ever fires to consume
      // it) must not eat the first honest click of a later, unrelated
      // interaction, including ones that arrive while panning is disabled.
      suppressNextClick.current = false
      const temporaryPan =
        e.button === 1 ||
        (e.button === 0 && e.pointerType !== 'touch' && getCanvasSpaceHeld())
      if (!panEnabled && !temporaryPan) return
      if (e.button !== 0 && e.button !== 1) return
      const target = e.target as HTMLElement
      // The mouse on an interactive child is a tap on it, never a pan. A
      // single FINGER there goes pending instead — pan if it travels past
      // the slop, tap if it lifts inside it.
      if (
        !temporaryPan &&
        panIgnoreSelector &&
        target.closest(panIgnoreSelector)
      ) {
        if (e.pointerType === 'touch') {
          pendingTouchPan.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
          }
        }
        return
      }

      if (temporaryPan) e.preventDefault()
      try {
        containerRef.current?.setPointerCapture(e.pointerId)
      } catch {
        // Capture is an assist, not a precondition — a pointer the browser
        // no longer recognizes must not veto the pan itself.
      }
      beginPan(e.clientX, e.clientY)
    },
    [
      beginPan,
      cancelCameraNavigation,
      endPan,
      panEnabled,
      panIgnoreSelector,
    ],
  )

  useEffect(() => {
    const clear = () => {
      setCanvasSpaceHeld(false)
      setIsSpaceHeld(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      if (isEditableKeyboardTarget(event.target)) return
      const el = containerRef.current
      const active = document.activeElement
      if (
        !el ||
        (active instanceof Node &&
          active !== document.body &&
          !el.contains(active))
      )
        return
      setCanvasSpaceHeld(true)
      setIsSpaceHeld(true)
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') clear()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      clear()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [])

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touchPoints.current.has(e.pointerId)) {
        touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pinch = pinchStart.current
        if (pinch && touchPoints.current.size >= 2) {
          const [a, b] = [...touchPoints.current.values()]
          const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
          const midX = (a.x + b.x) / 2
          const midY = (a.y + b.y) / 2
          zoomBetweenPoints(
            pinch.x,
            pinch.y,
            midX,
            midY,
            dist / pinch.dist,
            false,
          )
          pinchStart.current = { dist, x: midX, y: midY }
          syncZoomToReact()
          return
        }
        const pending = pendingTouchPan.current
        if (pending && pending.id === e.pointerId) {
          if (
            Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <
            TOUCH_PAN_SLOP
          )
            return
          // Slop crossed: this was a drag all along. Pan from the DOWN
          // point (no jump), and swallow the click the browser will still
          // synthesize at lift — a pan must not also open the cell.
          pendingTouchPan.current = null
          suppressNextClick.current = true
          try {
            containerRef.current?.setPointerCapture(e.pointerId)
          } catch {
            // Capture is an assist, not a precondition.
          }
          beginPan(pending.x, pending.y)
          commitTransform(
            {
              x: transformRef.current.pan.x + (e.clientX - pending.x),
              y: transformRef.current.pan.y + (e.clientY - pending.y),
            },
            transformRef.current.zoom,
            false,
          )
          return
        }
      }
      // The ref, not the state: a slop-crossed drag begins inside a
      // pointermove, and the moves coalesced before React commits the
      // state would otherwise be dropped — a visible stutter at the exact
      // moment the drag engages.
      if (!isPanningRef.current) return
      commitTransform(
        {
          x: panStart.current.panX + (e.clientX - panStart.current.x),
          y: panStart.current.panY + (e.clientY - panStart.current.y),
        },
        transformRef.current.zoom,
        false,
      )
    },
    [beginPan, commitTransform, syncZoomToReact, zoomBetweenPoints],
  )

  /** Capture-phase click filter: a click synthesized at the end of an
   * engaged touch pan must not reach the cell under the finger. Runs on the
   * container in capture order, so it fires before any cell's own handler. */
  const handleClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!suppressNextClick.current) return
    suppressNextClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      let continuesAsPan = false
      if (e.pointerType === 'touch') {
        touchPoints.current.delete(e.pointerId)
        if (pendingTouchPan.current?.id === e.pointerId)
          pendingTouchPan.current = null
        if (touchPoints.current.size < 2) {
          pinchStart.current = null
        } else if (pinchStart.current) {
          // Three fingers down to two: rebase the pinch on the surviving
          // pair. Leaving the old pair's distance in place would make the
          // next move compute a ratio against a gesture that no longer
          // exists — the board lurching by an arbitrary zoom in one frame.
          const [a, b] = [...touchPoints.current.values()]
          pinchStart.current = {
            dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          }
        }
        if (touchPoints.current.size === 1 && panEnabled) {
          // Pinch released down to one finger: hand the gesture back to a
          // pan from where that finger is, instead of a dead stop — and
          // swallow the click its eventual lift may synthesize, same as a
          // slop-crossed drag. A pinch is never a tap.
          const [rest] = [...touchPoints.current.values()]
          beginPan(rest.x, rest.y)
          suppressNextClick.current = true
          continuesAsPan = true
        }
      }
      if (!continuesAsPan) endPan()
      try {
        containerRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        // Never captured (a plain tap) — nothing to release.
      }
      // The drag committed straight to the element the whole way; publish the
      // final camera to React so its copy is not the one from before the drag.
      syncZoomToReact()
    },
    [beginPan, endPan, panEnabled, syncZoomToReact],
  )

  // Native capture is the bug fix: React bubble pointerdown never runs when
  // a populated lane/container child stops propagation. Observing the stream
  // at the viewport boundary first preserves the pending-touch decision and
  // pointer capture regardless of descendant handlers.
  useEffect(() => {
    const el = containerNode
    if (!el) return
    const captureOptions = { capture: true } as const
    el.addEventListener('pointerdown', handlePointerDown, captureOptions)
    el.addEventListener('pointermove', handlePointerMove, captureOptions)
    el.addEventListener('pointerup', handlePointerUp, captureOptions)
    el.addEventListener('pointercancel', handlePointerUp, captureOptions)
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown, captureOptions)
      el.removeEventListener('pointermove', handlePointerMove, captureOptions)
      el.removeEventListener('pointerup', handlePointerUp, captureOptions)
      el.removeEventListener('pointercancel', handlePointerUp, captureOptions)
    }
  }, [containerNode, handlePointerDown, handlePointerMove, handlePointerUp])

  /**
   * Safari's own pinch — prevented on the page, applied to the camera.
   *
   * WebKit ships non-standard `gesture*` events alongside the pointer
   * stream, and an unprevented `gesturestart` is a *page* zoom — the visual
   * viewport rescaling the whole app while the canvas sits still, which is
   * what "pinch does not work" looks like. `touch-action: none` does not
   * cover them. That half always worked; the other half never did, because
   * these handlers dropped the `scale` the gesture carries on the grounds
   * that the pointer map below already pinches.
   *
   * Which is true on iOS and false on macOS. A trackpad pinch on the desktop
   * produces gesture events and nothing else — no touch pointers, no
   * synthesised ctrl+wheel — so swallowing the gesture was the whole
   * interaction. The gate is the touch-pointer count (`shouldApplyGestureZoom`):
   * zero means nothing else is applying this pinch, and the moment a finger
   * is down the pointer map owns it and scale must not land twice.
   *
   * Bound on the window in capture and filtered by containment, for the
   * same three reasons the wheel listener is (see above) — chiefly that a
   * listener attached from a ref read once may never attach at all.
   *
   * Placed here rather than beside the wheel listener because it reads the
   * touch pointer map that the block above owns.
   */
  useEffect(() => {
    /** WebKit-only; no lib.dom type exists for it. */
    type WebKitGestureEvent = Event & {
      scale?: number
      clientX?: number
      clientY?: number
    }
    const inCanvas = (event: Event) => {
      const el = containerRef.current
      const target = event.target
      return !!el && target instanceof Node && el.contains(target)
        ? el
        : null
    }
    const onGestureStart = (event: Event) => {
      if (!inCanvas(event)) return
      event.preventDefault()
      gestureScaleRef.current = 1
    }
    const onGestureChange = (event: Event) => {
      const el = inCanvas(event)
      if (!el) return
      event.preventDefault()
      const gesture = event as WebKitGestureEvent
      const factor = gestureScaleFactor(
        gestureScaleRef.current,
        gesture.scale ?? gestureScaleRef.current,
      )
      if (Number.isFinite(gesture.scale)) {
        gestureScaleRef.current = gesture.scale as number
      }
      if (!shouldApplyGestureZoom(touchPoints.current.size)) return
      if (factor === 1) return
      const rect = el.getBoundingClientRect()
      // Anchored at the pointer, like the wheel. A gesture event without
      // coordinates (older WebKit) falls back to the viewport centre.
      zoomAtPoint(
        gesture.clientX ?? rect.left + rect.width / 2,
        gesture.clientY ?? rect.top + rect.height / 2,
        factor,
        false,
      )
      syncZoomToReact()
    }
    const onGestureEnd = (event: Event) => {
      if (!inCanvas(event)) return
      event.preventDefault()
      gestureScaleRef.current = 1
      syncZoomToReact()
    }
    const gestureOptions = { passive: false, capture: true } as const
    window.addEventListener('gesturestart', onGestureStart, gestureOptions)
    window.addEventListener('gesturechange', onGestureChange, gestureOptions)
    window.addEventListener('gestureend', onGestureEnd, gestureOptions)
    return () => {
      window.removeEventListener('gesturestart', onGestureStart, {
        capture: true,
      })
      window.removeEventListener('gesturechange', onGestureChange, {
        capture: true,
      })
      window.removeEventListener('gestureend', onGestureEnd, { capture: true })
    }
  }, [syncZoomToReact, zoomAtPoint])

  /**
   * The gesture is claimed OUTRIGHT, not merely declared.
   *
   * `touch-action: none` is a *declaration* the compositor consults before
   * it decides whether a touch belongs to the page or to the browser, and
   * the board is the one place where that consultation is unreliable:
   * `[data-zoom-pan-content]` carries a transform, so it is a composited
   * layer, and WebKit does not dependably resolve the property across that
   * boundary (blueprint.css says the same thing from the CSS side). When it
   * resolves to `auto`, the browser takes the touch and answers with
   * `pointercancel` — a finger on empty canvas pans, the identical finger on
   * a cell does nothing, and two fingers zoom the PAGE instead of the board.
   * That asymmetry is the whole bug report.
   *
   * `preventDefault` is not a declaration; it is the answer to a question
   * already asked, on an event the browser has already delivered, and no
   * layer boundary sits between the two. Belt and braces with the CSS: the
   * declaration keeps the compositor from ever starting the gesture on the
   * fast path, this keeps it from finishing one it started anyway.
   *
   * Both listeners are non-passive — `preventDefault` on a passive listener
   * is a no-op with a console warning — and both are scoped to the viewport
   * element, so nothing outside the canvas loses native scrolling. The cell
   * detail sheet is portalled out of this subtree and is unaffected.
   *
   * `touchstart` is prevented only for the SECOND finger. Preventing the
   * first would suppress the synthesized click that a tap depends on;
   * multi-touch synthesizes no click, and preventing it there is what stops
   * WebKit's page pinch-zoom, which `touch-action` cannot reach at all.
   *
   * And `touchmove` is NOT claimed inside a genuinely scrollable region.
   * The claim used to be unconditional, justified by "the board holds no
   * scrollable region" — but an overflowing board (`BlueprintPathBand`) is one, so a finger
   * could not reach rows a trackpad reached happily. One finger over a
   * scrolling region is that region's; two fingers are always the canvas's
   * pinch, wherever they land. `hasScrollableRegion` is the same
   * determination the wheel path makes, which is what keeps the two from
   * diverging again.
   */
  useEffect(() => {
    const el = containerNode
    if (!el) return
    const claimPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2 && event.cancelable) event.preventDefault()
    }
    const claimMove = (event: TouchEvent) => {
      if (!event.cancelable) return
      const target = event.target
      if (
        event.touches.length < 2 &&
        target instanceof Node &&
        hasScrollableRegion(target, el)
      )
        return
      event.preventDefault()
    }
    // Non-passive is the whole point: `preventDefault` on a passive listener
    // is a no-op with a console warning, and preventing the default IS the
    // claim. `canvasTouchContract.test.ts` dispatches real touch events at
    // this listener and asserts what got prevented, which is the only way to
    // see the difference from outside.
    const touchClaimOptions = { passive: false } as const
    el.addEventListener('touchstart', claimPinch, touchClaimOptions)
    el.addEventListener('touchmove', claimMove, touchClaimOptions)
    return () => {
      el.removeEventListener('touchstart', claimPinch)
      el.removeEventListener('touchmove', claimMove)
    }
  }, [containerNode])

  useEffect(() => {
    if (panEnabled) return
    isPanningRef.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- timing-sensitive pan/zoom state: cancels an in-flight drag the moment panning is disabled
    setIsPanning(false)
  }, [panEnabled])

  /**
   * Monotonic focus generation: each `focusCells` call claims a new token,
   * and any deferred work from an earlier call (the pulse cleanup, future
   * expand-then-fly measures) aborts when it wakes up stale — ▶-spam must
   * never land three animations on top of each other.
   */
  const focusGenerationRef = useRef(0)

  /**
   * The single cell-focus pipeline: fly the camera to the FIRST resolvable
   * target and pulse every matched cell (counterpart emphasis included).
   * Returns `{kind:'miss'}` with the unresolvable ids instead of silently
   * doing nothing — callers (ledger rows, strip, agent commands) report it.
   *
   * Reads the camera from `transformRef.current`, never the React copies —
   * those trail the live transform by up to ~80ms (see syncZoomToReact) and
   * a fly computed from them lands beside the target, not on it.
   */
  const focusCells = useCallback(
    async (
      cellIds: string[],
      opts?: { animate?: boolean },
    ): Promise<FocusCellsResult> => {
      const container = containerRef.current
      const content = contentRef.current
      if (!container || !content) {
        return { kind: 'miss', missing: [...cellIds] }
      }

      const generation = ++focusGenerationRef.current
      const found: HTMLElement[] = []
      const missing: string[] = []
      for (const cellId of cellIds) {
        const el = content.querySelector<HTMLElement>(
          `[data-blueprint-cell="${CSS.escape(cellId)}"]`,
        )
        if (el) found.push(el)
        else missing.push(cellId)
      }
      if (found.length === 0) return { kind: 'miss', missing }

      supersedeCameraNavigation()
      // The debounced recenterToView must not yank the camera back after
      // the fly — same suppression the resize handler honors (~line 441).
      userAdjustedViewRef.current = true

      const { zoom: currentZoom } = transformRef.current
      const safeZoom = currentZoom || 1
      const contentRect = content.getBoundingClientRect()
      const targetRect = found[0].getBoundingClientRect()
      // Content-space center of the first target.
      const worldX =
        (targetRect.left - contentRect.left + targetRect.width / 2) / safeZoom
      const worldY =
        (targetRect.top - contentRect.top + targetRect.height / 2) / safeZoom

      // Readable-zoom clamp: keep the camera the user chose when it can
      // already read a cell; only zoom in from far-out overview scales.
      const nextZoom = safeZoom >= 0.5 ? safeZoom : clampZoom(0.7)
      /*
        Centre in the strip the reader can SEE, not in the container box.

        A fit already frames inside these insets (`computeFitTransform`), and
        for every caller routed through `getCanvasFocusFitInsets` the pair is
        symmetric, so this is the same container centre it has always been —
        as it is for a direct caller, whose bottom inset defaults to its top.
        It stops being the same the
        moment something opaque sits on one edge — the phone's agent sheet
        owns the lower 60% of the screen — and a focus that ignored it flew
        the cell to the middle of the viewport, which is to say behind the
        panel the reader was reading.
      */
      const visibleTop = fitMargin + fitTopInset
      const visibleHeight = Math.max(
        container.clientHeight - visibleTop - (fitMargin + fitBottomInset),
        1,
      )
      const nextPan = {
        x: container.clientWidth / 2 - worldX * nextZoom,
        y: visibleTop + visibleHeight / 2 - worldY * nextZoom,
      }

      const animate = (opts?.animate ?? true) && !prefersReducedMotion()
      let completion: 'completed' | 'cancelled' | 'superseded' = 'completed'
      if (animate) completion = (await animateTransform(nextPan, nextZoom)).kind
      else commitTransform(nextPan, nextZoom, true)

      if (generation !== focusGenerationRef.current) {
        return { kind: 'flown', completion: 'superseded' }
      }
      if (completion === 'completed') pulseBlueprintCells(found)
      return { kind: 'flown', completion }
    },
    [
      animateTransform,
      commitTransform,
      fitBottomInset,
      fitMargin,
      fitTopInset,
      supersedeCameraNavigation,
    ],
  )

  const zoomIn = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2)
  }, [zoomAtPoint])

  const zoomOut = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2)
  }, [zoomAtPoint])

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancelCameraNavigation()
      userAdjustedViewRef.current = true
      const current = transformRef.current
      commitTransform(
        { x: current.pan.x + dx, y: current.pan.y + dy },
        current.zoom,
        true,
      )
    },
    [cancelCameraNavigation, commitTransform],
  )

  const getCameraState = useCallback(
    () => ({
      ...transformRef.current,
      moving: fitAnimationRef.current !== null,
    }),
    [],
  )

  /**
   * Keyboard zoom, because on some setups there is otherwise none.
   *
   * Zoom had exactly two gestures: `cmd`+wheel, and clicking a blueprint in
   * View mode to fit the camera to it. Design mode gives that click to the cell
   * picker, so a mouse without a pinch gesture could not zoom in Design mode
   * **at all**. `zoomIn`/`zoomOut`/`fitToView` already existed here and were
   * bound to nothing; this binds them.
   *
   * Guarded on the event target so it never steals `⌘−` from a text field, and
   * on `⌘` so a bare `-` still types a hyphen.
   *
   * WINDOW, deliberately — unlike the arrow-key pan below, which binds to the
   * container. Zoom is the one camera control with no on-screen affordance in
   * Design mode, so requiring the board to be focused first would leave a
   * mouse-only reader with no way in at all. Hidden warm views pass
   * `enableWindowZoomKeys: false` so a second mounted viewport does not double-fire.
   */
  useEffect(() => {
    if (!enableWindowZoomKeys) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (isEditableKeyboardTarget(event.target)) return
      // `=` is the unshifted key most people press for "+".
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        fitToView({ animate: true })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enableWindowZoomKeys, fitToView, zoomIn, zoomOut])

  /**
   * Keyboard pan, and a camera that follows focus.
   *
   * The board's cells are real buttons in the tab order, and the viewport is
   * transform-based with its overflow hidden — so the browser's own
   * scroll-into-view has nothing to scroll, and focus landed on cells nobody
   * could see. Both halves here reach `panBy`, the pan primitive the pointer
   * and the agent's `canvas_camera` already share; there is no second camera.
   *
   * Bound to the CONTAINER, not the window, which is what scopes it to the
   * viewport the reader is actually in — two mounted viewports would
   * otherwise both answer one arrow press. The container carries
   * `tabIndex={-1}` so clicking the board focuses it without adding a tab
   * stop; tab order is untouched by this.
   */
  useEffect(() => {
    const el = containerNode
    if (!el) return

    /*
      The camera's maths assumes an unscrolled container: every client-space
      conversion in this file reads `getBoundingClientRect` and adds nothing
      back for scroll. An `overflow: hidden` box still HAS scroll offsets,
      and the browser writes to them when focus moves to a descendant that
      is out of view — silently shifting the whole board a few hundred pixels
      out from under the camera's idea of where it is. Zeroing them is the
      cheapest way to keep that assumption true, and the `scroll` listener
      catches the write we did not see coming.
    */
    // Written through the ref rather than through `el`: the node arrives here
    // as state so the effect can depend on it, and state is not a thing to
    // mutate. The ref holds the same node and is the handler's truth anyway.
    const unscroll = () => {
      const node = containerRef.current
      if (!node) return
      if (node.scrollLeft !== 0) node.scrollLeft = 0
      if (node.scrollTop !== 0) node.scrollTop = 0
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableKeyboardTarget(event.target)) return
      const step = resolveKeyboardPan(event)
      if (!step) return
      // Arrows scroll the page by default, and this container is the one
      // place that must never scroll.
      event.preventDefault()
      panBy(step.dx, step.dy)
    }

    const onFocusIn = (event: FocusEvent) => {
      unscroll()
      const content = contentRef.current
      const target = event.target
      if (
        !content ||
        !(target instanceof HTMLElement) ||
        !content.contains(target)
      )
        return
      /*
        Never mid-flight. A fit ease (⌘0, a navigation) has a destination the
        reader asked for, and nudging the camera at a focus event that lands
        during it fights that ease and restarts it from a moving camera —
        the "glide, brake, glide" this file has fixed twice. The fit lands,
        and the next focus move corrects from there.
      */
      if (fitAnimationRef.current !== null) return
      /*
        Keyboard focus only. `:focus-visible` is the browser's own answer to
        "did this focus come from a key press", and a mouse click on a
        partly-visible cell should open it, not also move the board under the
        cursor. Engines that cannot answer get the movement — better a nudge
        than a keyboard user stranded off-screen.
      */
      try {
        if (!target.matches(':focus-visible')) return
      } catch {
        // Selector unsupported (jsdom, very old WebKit) — follow focus.
      }
      const { dx, dy } = computeFocusRevealPan(
        target.getBoundingClientRect(),
        el.getBoundingClientRect(),
      )
      if (dx === 0 && dy === 0) return
      panBy(dx, dy)
    }

    unscroll()
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('scroll', unscroll)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('scroll', unscroll)
    }
  }, [containerNode, panBy])

  return {
    containerRef: attachContainer,
    contentRef,
    pan,
    zoom,
    isPanning,
    isSpaceHeld,
    fitToView,
    focusCells,
    resetView,
    zoomIn,
    zoomOut,
    panBy,
    cancelCamera: cancelFitAnimation,
    getCameraState,
    pointerHandlers: {
      onClickCapture: handleClickCapture,
    },
  }
}
