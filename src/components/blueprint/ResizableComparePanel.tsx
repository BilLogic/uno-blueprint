import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type KeyboardEvent,
} from 'react'
import { ScenarioTitleBadge } from '@/components/blueprint/ScenarioTitleBadge'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { ARROW_VIEWPORT_PAD } from '@/lib/blueprintArrowGeometry'
import { releasePointerCapture } from '@/lib/pointerGestures'
import {
  COMPARE_MIN_PANEL_HEIGHT,
  COMPARE_MIN_PANEL_WIDTH,
  COMPARE_PANEL_PADDING,
  COMPARE_PANEL_PADDING_RIGHT,
  COMPARE_RESIZE_HANDLE_SIZE,
  getComparePanelScrollInsetY,
  getComparePanelScrollPaddingY,
} from '@/lib/sideBySideCompareLayout'
import { FOCUS_DIM_LIFT_CLASS, FOCUS_DIM_REST_CLASS, FOCUS_DIM_STYLE } from '@/lib/canvasFocusDim'
import { cn } from '@/lib/utils'

type ResizableComparePanelProps = {
  children: ReactNode
  minWidth?: number
  minHeight?: number
  defaultWidth?: number
  defaultHeight?: number
  /** When this changes, manual resize is cleared and content is re-measured. */
  fitContentKey?: string
  /** When true, panel height stays at defaultHeight (no content-driven growth). */
  lockHeight?: boolean
  /** When set, clicking the panel navigates (phase overview). */
  onNavigate?: () => void
  navigateLabel?: string
  /** Scenario title on the gray panel top edge (service overview). */
  panelTitleLabel?: string
  panelTitleSummary?: string | null
  /** Optional info note shown inside the panel title badge. */
  panelTitleInfoTooltip?: string | null
  /** Anchor id for canvas camera focus framing. */
  focusSlideId?: string
  /** When true, this panel is visually de-emphasized (canvas focus mode). */
  dimmed?: boolean
  /** When true, this panel is the camera focus target — no hover chrome. */
  focusActive?: boolean
  /**
   * Keeps this panel's measurement OUT of its phase row's shared height.
   *
   * Set only for a focused scenario whose path selection is expanded past
   * its default — the one case the exclusion exists for, where a comparison
   * opened inside a focused panel would otherwise reach every dimmed
   * neighbour through the row's `Math.max`. Focus ALONE must not set it:
   * excluding a panel changes the row height, and a row height that moves
   * on focus is a geometry change the camera pays for.
   *
   * A distinct attribute rather than a reading of `data-canvas-focus-active`,
   * because that attribute is also set on the phase SECTION — a `closest()`
   * for it matches every panel in a focused row, not the focused one.
   */
  excludeFromRowHeight?: boolean
  className?: string
  scrollContainerRef?: RefObject<HTMLDivElement | null>
}

/**
 * Scenario panel on the overview canvas, resizable from its corner by pointer
 * or keyboard. Grows to fit measured content unless the user overrides the
 * size or `lockHeight` pins it.
 */
export function ResizableComparePanel({
  children,
  minWidth,
  minHeight,
  defaultWidth,
  defaultHeight,
  fitContentKey,
  lockHeight = false,
  onNavigate,
  navigateLabel,
  panelTitleLabel,
  panelTitleSummary,
  panelTitleInfoTooltip,
  focusSlideId,
  dimmed = false,
  focusActive = false,
  excludeFromRowHeight = false,
  className,
  scrollContainerRef,
}: ResizableComparePanelProps) {
  const resolvedMinWidth = minWidth ?? COMPARE_MIN_PANEL_WIDTH
  const resolvedMinHeight = minHeight ?? COMPARE_MIN_PANEL_HEIGHT
  const contentMeasureRef = useRef<HTMLDivElement>(null)
  const [measuredContent, setMeasuredContent] = useState({
    width: 0,
    height: 0,
  })
  const measuredContentHeight = measuredContent.height
  const [userSize, setUserSize] = useState({ width: 0, height: 0 })

  /** Teardown for an in-flight corner drag, so unmount can end it. */
  const releaseDragRef = useRef<(() => void) | null>(null)
  useEffect(() => () => releaseDragRef.current?.(), [])

  useEffect(() => {
    if (lockHeight) return
    // A fresh object never bails React's `Object.is` check, so this used to
    // re-render every unlocked panel on the board on every content-key
    // change — one paint after the layout effect below had already measured,
    // landing inside the camera's settle window N times over.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate reset of the user's drag-resize when the fit key or defaults change; part of the panel's measurement flow
    setUserSize((current) =>
      current.width === 0 && current.height === 0
        ? current
        : { width: 0, height: 0 },
    )
  }, [fitContentKey, defaultWidth, defaultHeight, lockHeight])

  /*
    The first measurement after a content change runs BEFORE paint.

    `targetHeight` below is a `Math.max` of the estimate and the last
    measurement, so the panel answers growth in the commit that causes it
    (the estimate rises immediately) but could only answer SHRINKAGE once a
    new measurement arrived — until then the stale, larger measurement kept
    winning the max. As a passive effect that measurement landed a paint
    late, which is why the two directions did not behave alike: adding a
    path resized the panel at once, removing one left it at the old size for
    a frame and then snapped. The camera fit, which waits for this size to
    settle, inherited the asymmetry exactly.

    A layout effect measures and re-renders inside the same frame as the
    commit, so both directions are one visual step. The ResizeObserver stays
    asynchronous — it is for growth that happens later (images, fonts), not
    for the change we already know about.
  */
  useLayoutEffect(() => {
    const element = contentMeasureRef.current
    if (!element) return

    const measure = () => {
      // Layout size only. `scrollHeight` also counts arrow overlays and path
      // frames that bleed past the board, which would pad the panel with gray.
      setMeasuredContent((current) => {
        const width = element.offsetWidth
        const height = element.offsetHeight
        // Bail on an unchanged measurement: this runs on every content key
        // change and a needless state write would re-render the whole board.
        return current.width === width && current.height === height
          ? current
          : { width, height }
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fitContentKey])

  const scrollChrome = { lockHeight }
  const scrollPaddingY = getComparePanelScrollPaddingY(scrollChrome)
  const measuredPanelHeight =
    measuredContentHeight > 0
      ? measuredContentHeight + scrollPaddingY
      : null
  // Horizontal chrome around the content — must match the padding applied to
  // the content container below.
  const contentPaddingX =
    ARROW_VIEWPORT_PAD * 2 +
    (COMPARE_PANEL_PADDING_RIGHT - COMPARE_PANEL_PADDING)
  const measuredPanelWidth =
    measuredContent.width > 0 ? measuredContent.width + contentPaddingX : null

  /*
    The panel never scrolls internally. It lives on a zoomable, pannable
    canvas — that camera *is* the scrolling — so a second scrollbar inside
    the panel meant two nested viewports fighting over the same wheel. The
    estimate functions size the panel up front; when the rendered content
    turns out larger than the estimate, the panel grows to fit instead of
    growing a scrollbar. `lockHeight` still sets the shared floor across a
    phase row, but it is a floor, not a ceiling.
  */
  // The default is a pre-measure placeholder, not a floor: once the content
  // has been measured, the measurement replaces it. Keeping the estimate as
  // a floor left compare panels wider than their columns.
  const targetWidth = Math.max(
    resolvedMinWidth,
    measuredPanelWidth ?? defaultWidth ?? resolvedMinWidth,
  )
  /*
    The estimate floors a LOCKED panel and only a locked panel. Locked means
    this panel belongs to an aligned phase row, where the height it is handed
    is the row's shared contract — measured, and a real floor. Unlocked, that
    same argument is nothing but the pre-measure estimate, and keeping it as
    a floor is exactly the mistake the width axis above already documents:
    the compare-grid height estimate runs hot, so the floor showed up as dead
    gray under the board rather than as a panel that hugs its content.
  */
  const targetHeight = Math.max(
    lockHeight ? resolvedMinHeight : COMPARE_MIN_PANEL_HEIGHT,
    measuredPanelHeight ?? defaultHeight ?? resolvedMinHeight,
  )
  const size = {
    width: Math.max(targetWidth, userSize.width),
    height: lockHeight ? targetHeight : Math.max(targetHeight, userSize.height),
  }
  /*
    Boards TOP-ALIGN inside their panel, always — never centred. Centring
    each board independently inside its own container is what breaks a phase
    row: shorter boards drift down and their headers stop lining up with
    their neighbours'. The condition that used to sit here —
    `contentFitsWithPadding && !lockHeight`, where the flag was itself
    defined as `lockHeight && …` — could never fire. Dead, and a trap for
    anyone who "fixes" it by making it reachable.
  */
  const resizeStart = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
      }

      /*
        The drag is bound to ONE pointer id, and its teardown is idempotent
        and reachable from three directions.

        Every listener here used to be unfiltered, so any pointerup from any
        pointer ran the teardown — and `releasePointerCapture` THROWS
        `NotFoundError` for an id this button never captured, which skipped
        both `removeEventListener` calls that followed it. Put a second
        finger on the board mid-drag (the viewport turns it into a pinch and
        captures it), lift that finger first, and `onMove` stays on `window`
        for the rest of the session holding a stale `resizeStart`: the panel
        then resizes itself on any later mouse move, with no button held.
        `pointercancel` (an OS edge swipe, the notification shade) and an
        unmount mid-drag stranded it the same way, by never firing a
        pointerup at all.
      */
      const pointerId = e.pointerId
      const target = e.currentTarget

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        setUserSize({
          width: Math.max(
            resolvedMinWidth,
            resizeStart.current.width +
              (moveEvent.clientX - resizeStart.current.x),
          ),
          height: Math.max(
            resolvedMinHeight,
            resizeStart.current.height +
              (moveEvent.clientY - resizeStart.current.y),
          ),
        })
      }

      const endDrag = () => {
        releasePointerCapture(target, pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onPointerEnd)
        window.removeEventListener('pointercancel', onPointerEnd)
        releaseDragRef.current = null
      }

      const onPointerEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return
        endDrag()
      }

      // Unmount mid-drag never fires a pointer event; the effect below calls
      // this instead.
      releaseDragRef.current?.()
      releaseDragRef.current = endDrag

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
    },
    [resolvedMinHeight, resolvedMinWidth, size.height, size.width],
  )

  /**
   * Keyboard equivalent of the drag (SC 2.1.1, and SC 2.5.7 dragging movements).
   * Arrows nudge, Shift jumps, Home returns to the measured default by clearing
   * the user override rather than guessing a size.
   */
  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 64 : 16
      const nudge = (dx: number, dy: number) => {
        event.preventDefault()
        setUserSize({
          width: Math.max(resolvedMinWidth, size.width + dx),
          height: Math.max(resolvedMinHeight, size.height + dy),
        })
      }

      switch (event.key) {
        case 'ArrowRight':
          return nudge(step, 0)
        case 'ArrowLeft':
          return nudge(-step, 0)
        case 'ArrowDown':
          return nudge(0, step)
        case 'ArrowUp':
          return nudge(0, -step)
        case 'Home':
          // Zeroing the override falls back to the measured target size, which
          // is what `size` maxes against — see the `Math.max` pair above.
          event.preventDefault()
          return setUserSize({ width: 0, height: 0 })
        default:
          return
      }
    },
    [resolvedMinHeight, resolvedMinWidth, size.height, size.width],
  )

  const scrollInsetY = getComparePanelScrollInsetY(scrollChrome)
  const panelRef = useRef<HTMLDivElement>(null)
  const interactive = Boolean(onNavigate)
  const navigable = interactive && !focusActive

  const handleNavigateKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!onNavigate || focusActive) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onNavigate()
      }
    },
    [focusActive, onNavigate],
  )

  return (
    <div
      className={cn(
        'relative shrink-0 transition-opacity duration-(--motion-camera) ease-camera',
        dimmed && FOCUS_DIM_REST_CLASS,
        dimmed && navigable && FOCUS_DIM_LIFT_CLASS,
        className,
      )}
      style={dimmed ? FOCUS_DIM_STYLE : undefined}
      data-focus-slide-id={focusSlideId}
      data-canvas-focus-dimmed={dimmed ? '' : undefined}
    >
      {panelTitleLabel ? (
        <ScenarioTitleBadge
          name={panelTitleLabel}
          summary={panelTitleSummary}
          note={panelTitleInfoTooltip}
          tone="panel"
          className={cn(
            'pointer-events-auto absolute z-30 max-w-[min(calc(100%-3rem),28rem)]',
            // The focused scenario's label steps up a size. On a board of
            // twenty-two panels the one you are IN should say so at a glance,
            // and the badge is the only chrome each panel carries.
            focusActive && 'px-2 py-1 text-sm',
          )}
          style={{
            top: 0,
            left: COMPARE_PANEL_PADDING,
            transform: 'translateY(-50%)',
          }}
        />
      ) : null}
      <div
        ref={panelRef}
        className={cn(
          'relative flex shrink-0 flex-col overflow-hidden rounded-xl border',
          navigable &&
            'cursor-pointer transition-[border-color] duration-(--motion-micro) ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
        )}
        /*
          Fill and border come from `[data-phase-scenario-panel]` below,
          never from here. The inline fallback that used to sit on these two
          properties was reachable only by a panel without that attribute,
          and now that the attribute names the surface rather than the
          affordance there is no such panel — an inline value would simply
          outrank the stylesheet on the mobile canvas.
        */
        style={{ width: size.width, height: size.height }}
        data-compare-panel
        data-blueprint-artboard
        /*
          Names the SURFACE, not the affordance. The panel's fill, its border
          and its beat in the canvas reveal all key off this attribute, so a
          panel that merely does not navigate — the mobile canvas, where the
          drawer owns every move — must still carry it or it renders unfilled
          and skips its entrance. It was gated on `onNavigate` only because
          every caller happened to pass one.
        */
        data-phase-scenario-panel=""
        {...(focusActive ? { 'data-canvas-focus-active': '' } : {})}
        {...(excludeFromRowHeight ? { 'data-row-height-excluded': '' } : {})}
        role={navigable ? 'button' : undefined}
        tabIndex={navigable ? 0 : undefined}
        aria-label={navigable ? navigateLabel : undefined}
        onClick={
          navigable
            ? (event) => {
                event.stopPropagation()
                onNavigate?.()
              }
            : undefined
        }
        onKeyDown={navigable ? handleNavigateKeyDown : undefined}
        onMouseLeave={
          navigable
            ? () => {
                if (
                  panelRef.current?.contains(document.activeElement) &&
                  document.activeElement instanceof HTMLElement
                ) {
                  document.activeElement.blur()
                }
              }
            : undefined
        }
        // Pointer events flow through to the canvas: a drag that starts on
        // board space PANS (the viewport's tracker is slop-gated, so plain
        // clicks still land on cells/buttons). Mouse used to be stopped
        // here — which made every drag inside a path board a dead drag.
        // Interactive chrome opts out via the viewport's panIgnoreSelector.
      >
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-hidden"
        style={{
          paddingTop: ARROW_VIEWPORT_PAD + scrollInsetY,
          paddingLeft: ARROW_VIEWPORT_PAD,
          paddingRight:
            ARROW_VIEWPORT_PAD + (COMPARE_PANEL_PADDING_RIGHT - COMPARE_PANEL_PADDING),
          paddingBottom: ARROW_VIEWPORT_PAD + scrollInsetY,
        }}
      >
        <div
          ref={contentMeasureRef}
          data-blueprint-panel-content
          className="w-max shrink-0"
        >
          {children}
        </div>
      </div>
      {!lockHeight ? (
        <IconTooltip label="Arrow keys resize this too">
          <button
            type="button"
            aria-label="Resize comparison panel"
            className="absolute bottom-1 right-1 z-20 flex cursor-se-resize items-end justify-end rounded-md p-1 text-tertiary-foreground hover:bg-muted/70 hover:text-foreground"
            style={{
              width: COMPARE_RESIZE_HANDLE_SIZE + 8,
              height: COMPARE_RESIZE_HANDLE_SIZE + 8,
            }}
            onPointerDown={handleResizePointerDown}
            onKeyDown={handleResizeKeyDown}
          >
            <svg
              viewBox="0 0 12 12"
              className="size-3"
              aria-hidden
              fill="currentColor"
            >
              <path d="M12 12H8V10H10V8H12V12ZM12 8H10V6H8V4H10V6H12V8ZM8 8H6V6H8V8Z" />
            </svg>
          </button>
        </IconTooltip>
      ) : null}
      </div>
    </div>
  )
}
