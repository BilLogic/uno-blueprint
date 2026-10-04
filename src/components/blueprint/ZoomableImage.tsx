import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useImageZoom } from '@/hooks/useImageZoom'
import { servedUrl } from '@/lib/basePath'
import type { ImageZoomCursor } from '@/lib/imageZoomReducer'
import { cn } from '@/lib/utils'

/**
 * The cursor, spelled out one class at a time.
 *
 * `cursor-${cursor}` would read better and generate nothing: Tailwind scans
 * source text for whole class names, so a class assembled at runtime is a
 * class that exists in no stylesheet. The map is what puts all four literals
 * in front of the scanner.
 */
const CURSOR_CLASS: Record<ImageZoomCursor, string> = {
  'zoom-in': 'cursor-zoom-in',
  'zoom-out': 'cursor-zoom-out',
  grab: 'cursor-grab',
  grabbing: 'cursor-grabbing',
}

/**
 * The frame's shape — on the picture AND on the box that clips it.
 *
 * At or below fit the picture is smaller than the box, so the corners the
 * reader sees are the picture's own. Past fit the picture overflows and what
 * the reader sees is the CUT, which takes the shape of whatever does the
 * cutting — so a radius on the picture alone is a radius that disappears the
 * moment the reader zooms in, which is the one moment the viewer exists for.
 * Stated once and spent twice: the window reads the same at every scale, and
 * a retune moves both halves together.
 *
 * The shadow does NOT follow it. A shadow is drawn outside the box it belongs
 * to, so on the clipping box it would fall in the margin — a dark rectangle
 * ringing the letterbox, at every scale, around nothing the reader can see.
 * It stays on the picture, where it frames the picture at fit and is clipped
 * away past fit along with everything else outside the window.
 */
const FRAME_SHAPE_CLASS = 'rounded-xl'

/**
 * The chrome the viewer draws over the picture — the close button, the two
 * step buttons, the counter. One spelling, so they read as one set.
 *
 * `bg-foreground/70 text-background` rather than a literal: the ground under
 * this chrome is whatever the reader opened, so it needs ink that inverts
 * with the theme the way the page's own does.
 */
const VIEWER_CHROME_CLASS =
  'z-10 rounded-full bg-foreground/70 text-background backdrop-blur-sm'
const STEP_BUTTON_CLASS =
  'absolute top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors ease-arrive motion-reduce:transition-none duration-(--motion-micro) hover:bg-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

/**
 * One member of a sibling group: an image the viewer can step to.
 *
 * Passed IN by the site that renders the row, never discovered by scanning a
 * container. The order carries meaning — a step panel's frames are ordered
 * by lane, so stepping is "the same moment, the next actor" — and a DOM
 * scan would preserve that only by accident, until the day a wrapper element
 * or a CSS reorder quietly broke it.
 */
export type ZoomableImageSibling = {
  src: string
  alt: string
  naturalWidth?: number
  naturalHeight?: number
}

/**
 * An image that opens, and once open behaves like an image viewer.
 *
 * The trigger, the popup and every gesture live here, so an adopter renders
 * this in place of a bare image and gets the whole interaction rather than
 * six near-identical re-implementations of it. The arithmetic is one layer
 * further down again, in `imageZoomReducer`, which this component reaches
 * only through `useImageZoom`.
 *
 * Three exits, all available at every scale: a click on the surrounding
 * margin, Escape, and the corner button. The image itself is the one thing
 * that does NOT close, because the image is what the reader is operating —
 * a click on it zooms. That is the reversal this component embodies: the
 * opened figure used to be inert, and every click on it closed the popup.
 *
 * The corner button matters most exactly where the margin stops being
 * reachable, which is why it sits outside the clipping box and above the
 * image rather than inside the frame with it.
 *
 * Siblings, where the adopter has them. A row of lane frames is one moment
 * seen by three actors and exists to be compared, so the viewer steps
 * between them — arrow keys, the two on-screen buttons, a horizontal swipe —
 * with a counter saying which of how many. Each step returns to fit, so
 * every sibling opens the same way and the reader is never handed the next
 * picture already scrolled to a corner of the last one.
 *
 * Stepping WRAPS at both ends. That is the same rule the zoom follows at its
 * ceiling: no gesture in this viewer is a dead end, and a next button that
 * greys out on the last frame is a control that stops answering. A row of
 * three actors is something a reader cycles rather than traverses.
 */
export function ZoomableImage({
  src,
  alt,
  naturalWidth,
  naturalHeight,
  triggerLabel,
  triggerClassName,
  siblings,
  siblingIndex = 0,
  children,
}: {
  src: string
  alt: string
  /**
   * The image's authored size, where the adopter knows it. Worth passing:
   * an SVG with a `viewBox` and no root `width`/`height` has no intrinsic
   * size, and the browser's answer is its own default box rather than the
   * diagram's. See `useImageZoom`.
   */
  naturalWidth?: number
  naturalHeight?: number
  /** The trigger is a button and therefore needs a name of its own. */
  triggerLabel: string
  triggerClassName?: string
  /**
   * The whole ordered group this image belongs to, and below it the position
   * this trigger occupies in it. An adopter renders one `ZoomableImage` per
   * member and hands each the same array — so which one was clicked is the
   * index, and the row's order is the array's.
   *
   * A group of one is no group: the chrome only appears past two, because a
   * counter reading "1 of 1" states nothing and two dead buttons are worse
   * than none.
   */
  siblings?: readonly ZoomableImageSibling[]
  siblingIndex?: number
  /** The closed-state rendering — the thumbnail and any hint over it. */
  children: ReactNode
}) {
  const group = siblings && siblings.length > 1 ? siblings : null
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(siblingIndex)
  const shown = group?.[current] ?? { src, alt, naturalWidth, naturalHeight }

  const step = useCallback(
    (delta: 1 | -1) => {
      if (!group) return
      setCurrent((index) => (index + delta + group.length) % group.length)
    },
    [group],
  )

  const {
    popupRef,
    viewportRef,
    imageRef,
    measure,
    reset,
    cursor,
    animated,
    imageStyle,
    imageHandlers,
  } = useImageZoom({
    naturalWidth: shown.naturalWidth,
    naturalHeight: shown.naturalHeight,
    onSwipeStep: group ? step : undefined,
  })

  /**
   * Back to fit on a step, and only on a step.
   *
   * Guarded by the index it last ran for rather than left to the dependency
   * array: `reset` changes identity whenever a node attaches or the authored
   * size changes, and a bare effect would then throw away a reader's zoom at
   * moments that have nothing to do with stepping.
   */
  const shownIndexRef = useRef(current)
  useLayoutEffect(() => {
    if (shownIndexRef.current === current) return
    shownIndexRef.current = current
    reset()
  }, [current, reset])

  /**
   * Arrow keys step; Escape is left alone, because the dialog already closes
   * on it and the reader means the same thing by it here as everywhere else.
   */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!group) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      step(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      step(1)
    }
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          // Every opening starts at the image that was clicked, not at
          // wherever the last visit through this trigger wandered to.
          setCurrent(siblingIndex)
          shownIndexRef.current = siblingIndex
        }
      }}
    >
      <DialogPrimitive.Trigger
        type="button"
        aria-label={triggerLabel}
        className={triggerClassName}
      >
        {children}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        {/*
          `forceRender` because Base UI suppresses a NESTED dialog's backdrop,
          and whether this viewer is nested is decided by whatever opened it:
          from the cover page it is the only dialog on the stack, from a cell
          detail panel it is the second, and the component cannot see the
          difference. Suppression is the right default for a stack of dialogs
          that each darken the last — this is not that. The scrim is what says
          the picture is now the thing being operated, so it is wanted most in
          the nested case, over a panel that would otherwise stay fully lit.
        */}
        <DialogPrimitive.Backdrop
          forceRender
          data-image-zoom-scrim
          className="fixed inset-0 z-50 bg-black/70 transition-opacity ease-arrive motion-reduce:transition-none duration-(--motion-fade) data-ending-style:ease-leave data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        {/*
          Full-bleed rather than inset, so the wheel reaches every pixel a
          reader might have their pointer over. The visual margin is the
          viewport box below, which is inset instead.
        */}
        <DialogPrimitive.Popup
          ref={popupRef}
          aria-label={shown.alt}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 outline-none transition-opacity ease-arrive motion-reduce:transition-none duration-(--motion-fade) data-ending-style:ease-leave data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          {/*
            Fills the popup behind everything else, and closes on a click.
            The image sits above it and takes its own clicks now, so this
            catches the margin and nothing more. Presentational: it is a
            second, unfocusable spelling of the corner button beside it, and
            announcing "Close" twice helps nobody.
          */}
          <DialogPrimitive.Close
            aria-hidden
            data-image-zoom-margin
            className="absolute inset-0 cursor-pointer"
            render={<button type="button" tabIndex={-1} />}
          />
          {/*
            The box the image is fitted to and clipped by. Inert to the
            pointer so that a click on the letterbox beside a wide image
            still reaches the close catcher beneath.
          */}
          <div
            ref={viewportRef}
            data-image-zoom-viewport
            className={cn(
              'pointer-events-none absolute inset-4 overflow-hidden sm:inset-10',
              FRAME_SHAPE_CLASS,
            )}
          >
            {/* The one place this component's picture meets the base path:
                callers and siblings hand in the stored path as written. */}
            <img
              ref={imageRef}
              src={servedUrl(shown.src)}
              alt={shown.alt}
              onLoad={measure}
              draggable={false}
              style={imageStyle}
              {...imageHandlers}
              className={cn(
                'pointer-events-auto absolute top-1/2 left-1/2 max-w-none shadow-lg select-none',
                FRAME_SHAPE_CLASS,
                // `origin-top-left` is load-bearing, not styling. The
                // transform in `imageStyle` does its own centring, and the
                // default `50% 50%` origin would centre it a second time —
                // at the unscaled half-size, so the image lands off-centre by
                // a distance that grows with the scale.
                'origin-top-left',
                // `touch-none` is what makes a one-finger drag pan instead of
                // scrolling, and what leaves a pinch to the gesture handler.
                'touch-none',
                CURSOR_CLASS[cursor],
                animated &&
                  'transition-transform motion-reduce:transition-none duration-(--motion-micro) ease-move',
              )}
            />
          </div>
          {/*
            The stepping chrome, outside the clipping box for the same reason
            the close button is: it is wanted most when the reader is deep in
            one sibling, which is exactly when a box that clips would have
            taken it away.
          */}
          {group ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={() => step(-1)}
                className={cn(VIEWER_CHROME_CLASS, STEP_BUTTON_CLASS, 'left-4')}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={() => step(1)}
                className={cn(
                  VIEWER_CHROME_CLASS,
                  STEP_BUTTON_CLASS,
                  'right-4',
                )}
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
              {/*
                Live, because on a step the picture changes and nothing else
                a screen reader is looking at does — the popup's own label
                follows the image, but a label is announced on open, not on
                every change to it.
              */}
              <p
                aria-live="polite"
                data-image-zoom-counter
                className={cn(
                  VIEWER_CHROME_CLASS,
                  'absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-sm font-medium tabular-nums',
                )}
              >
                {current + 1} of {group.length}
              </p>
            </>
          ) : null}
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              VIEWER_CHROME_CLASS,
              'absolute top-4 right-4 flex size-9 cursor-pointer items-center justify-center transition-colors ease-arrive motion-reduce:transition-none duration-(--motion-micro) hover:bg-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
            render={<button type="button" />}
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
