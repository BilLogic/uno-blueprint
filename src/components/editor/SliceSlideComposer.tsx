import { useEffect, useRef, useState } from 'react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import { createPortal } from 'react-dom'
import { GripVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { describeCell } from '@/lib/canvasCellQuery'
import { cn } from '@/lib/utils'
import type { DraftSlide } from '@/lib/sliceValidation'

/**
 * Ordering *and* grouping, in one list.
 *
 * Presets were the wrong idea: grouping is something people shape cell by
 * cell, and since they are already dragging to reorder, both belong in one
 * gesture space. Cells between two dividers are one slide, so reordering and
 * re-bucketing are the same drag.
 *
 * The drag is **pointer events, not HTML5 drag-and-drop**. That API failed
 * here twice — first silently refusing to start without a `dataTransfer`
 * payload, then fighting the popover for the pointer — and its failures all
 * present the same way: the row snaps back and the user is told, in effect,
 * that they imagined the gesture. Pointer capture has one owner and no such
 * moods: down on the grip, move updates the slot under the pointer, up drops.
 *
 * "Slide" is the only word for this here, and that is the point: the row in
 * `slides`, the card in this list and the screen the reader sees in
 * presentation are one thing. It used to be a "frame" in the schema and a
 * "screen" on this surface, while "frame" also meant one image on one cell.
 */

/** Where a dragged cell would land: before cell `index` of slide `slide`. */
type DropSlot = { slide: number; index: number }

const sameSlot = (left: DropSlot | null, right: DropSlot | null) =>
  left?.slide === right?.slide && left?.index === right?.index

/** Read the slot back off the element under the pointer. */
function slotAt(x: number, y: number): DropSlot | null {
  const hit = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('[data-drop-slot]')
  if (!hit) return null
  const [slide, index] = (hit.dataset.dropSlot ?? '').split(':').map(Number)
  if (Number.isNaN(slide) || Number.isNaN(index)) return null
  return { slide, index }
}

export function SliceSlideComposer({
  slides,
  onChange,
}: {
  slides: DraftSlide[]
  onChange: (slides: DraftSlide[]) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [slot, setSlot] = useState<DropSlot | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Latest values for the window listeners, which are bound once per drag.
  // Written during render, not in an effect: an effect lands one commit late,
  // and a pointerup in that gap would apply the drop against the previous
  // list — silently discarding whatever changed it.
  const slotRef = useRef(slot)
  const slidesRef = useRef(slides)
  // eslint-disable-next-line react-hooks/refs -- latest-value mirror; an effect is one commit late
  slotRef.current = slot
  // eslint-disable-next-line react-hooks/refs -- same: a pointerup in the effect gap would drop against a stale list
  slidesRef.current = slides

  /**
   * Move a cell to an explicit position rather than "into a slide".
   *
   * Remove first, then re-derive the index — pulling the cell out shifts
   * everything after it, and inserting at the pre-removal index is how a drag
   * one place down silently becomes a no-op.
   */
  const moveTo = (cell: string, target: DropSlot) => {
    const current = slidesRef.current
    let insertIndex = target.index
    const withoutCell = current.map((slide, index) => {
      const position = slide.cells.indexOf(cell)
      if (position === -1) return slide
      if (index === target.slide && position < target.index) insertIndex -= 1
      return { ...slide, cells: slide.cells.filter((id) => id !== cell) }
    })

    // A drop past the last slide mints a new one — with Split gone, this
    // drop zone is how a slide boundary comes into being.
    const next =
      target.slide >= withoutCell.length
        ? [...withoutCell, { cells: [cell], title: '', caption: '' }]
        : withoutCell.map((slide, index) =>
            index === target.slide
              ? {
                  ...slide,
                  cells: [
                    ...slide.cells.slice(0, insertIndex),
                    cell,
                    ...slide.cells.slice(insertIndex),
                  ],
                }
              : slide,
          )

    // A slide emptied by the move disappears — an empty slide is not a
    // renderable state, and leaving one behind only fails validation later.
    onChange(next.filter((slide) => slide.cells.length > 0))
  }

  /** The whole drag lives on window: the pointer is captured, not trusted. */
  useEffect(() => {
    if (dragging === null) return

    let pointerNow = { x: 0, y: 0 }
    let raf = 0

    const updateSlot = (x: number, y: number) => {
      const next = slotAt(x, y)
      // Written straight to the ref as well: a pointerup in the same frame
      // as the last move must not read a slot from one render ago.
      slotRef.current = next
      setSlot((current) => (sameSlot(current, next) ? current : next))
    }

    /*
      Edge scrolling runs on its own frame loop, not on pointermove. Coupled
      to move events, a pointer held *still* in the edge band scrolled
      nothing — the user waits at the edge like at a bus stop with no bus —
      and when it did scroll, the slot under the pointer changed without the
      pointer moving, so the drawn line and the actual drop target drifted
      apart. The loop scrolls and re-derives the slot every frame.
    */
    const tick = () => {
      // The composer no longer scrolls; the sheet's scroll surface does.
      const element =
        scroller.current?.closest<HTMLElement>('[data-slice-sheet-scroll]') ??
        scroller.current
      if (element) {
        const box = element.getBoundingClientRect()
        let scrolled = false
        if (pointerNow.y < box.top + 28 && element.scrollTop > 0) {
          element.scrollTop -= 6
          scrolled = true
        } else if (pointerNow.y > box.bottom - 28) {
          element.scrollTop += 6
          scrolled = true
        }
        if (scrolled) updateSlot(pointerNow.x, pointerNow.y)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onMove = (event: PointerEvent) => {
      event.preventDefault()
      pointerNow = { x: event.clientX, y: event.clientY }
      setPointer(pointerNow)
      updateSlot(event.clientX, event.clientY)
    }

    const onUp = () => {
      const target = slotRef.current
      if (target) moveTo(dragging, target)
      setDragging(null)
      setSlot(null)
      setPointer(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moveTo reads refs
  }, [dragging])

  const removeCell = (slideIndex: number, cell: string) => {
    onChange(
      slides
        .map((slide, index) =>
          index === slideIndex
            ? { ...slide, cells: slide.cells.filter((id) => id !== cell) }
            : slide,
        )
        .filter((slide) => slide.cells.length > 0),
    )
  }

  // Running cell number across slides, derived from the slides above each
  // one rather than a counter mutated during render.
  const offsets = slides.map((_, index) =>
    slides.slice(0, index).reduce((total, slide) => total + slide.cells.length, 0),
  )

  /**
   * The insertion line, and the drop target: while dragging, each slot is a
   * generous hit band, and the one under the pointer draws the line the drop
   * will honour. The line is a promise, not a decoration — both are computed
   * from the same slot.
   */
  const DropLine = ({ target }: { target: DropSlot }) => {
    const active = dragging !== null && sameSlot(slot, target)
    return (
      <div
        data-drop-slot={`${target.slide}:${target.index}`}
        className={cn(
          'relative transition-[height] duration-(--motion-micro) ease-move motion-reduce:transition-none',
          dragging === null ? 'h-1' : 'h-4',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full',
            active ? 'bg-primary' : 'bg-transparent',
          )}
        />
      </div>
    )
  }

  const draggedLabel = dragging ? describeCell(dragging).label : null

  return (
    <div
      ref={scroller}
      // No scroll of its own. The composer used to cap at max-h-80 and
      // scroll internally, which put a scrollbar *inside* the sheet's
      // scrollbar — two nested scroll regions for one column of content.
      // The sheet owns the one scroll surface; this just grows.
      className={cn('flex flex-col gap-2', dragging !== null && 'select-none')}
    >
      {slides.map((slide, slideIndex) => {
        const holdsDrag = dragging !== null && slot?.slide === slideIndex
        return (
          <div
            key={slideIndex}
            className={cn(
              'rounded-lg border bg-card p-2 transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
              holdsDrag ? 'border-primary bg-primary/[0.03]' : 'border-border',
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <Eyebrow className="shrink-0">
                Slide {slideIndex + 1}
              </Eyebrow>
              {/*
                No title field here any more, and the space it took is now
                the slide's own. Captions are prose about a slide, and prose
                cannot be written before the slide exists — asking for it
                mid-grouping interrupts the one job this step has with a blank
                box per slide, five of which is five blank boxes. They are
                written in the slice itself, against the cells they describe.
                `title` stays on the draft and saves as empty.
              */}
              {/*
                No "Merge up" button: dragging a cell across the boundary IS
                the merge, and the split line is its opposite. Two gestures,
                zero buttons — a per-slide action row was noise that said
                less than the drag it duplicated.
              */}
            </div>

            <ul className="flex flex-col">
              {slide.cells.map((cell, cellIndex) => {
                const described = describeCell(cell)
                const running = offsets[slideIndex] + cellIndex + 1
                const isDragging = dragging === cell
                return (
                  <li key={cell}>
                    <DropLine target={{ slide: slideIndex, index: cellIndex }} />

                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-md px-1 py-1 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-muted/60',
                        isDragging && 'opacity-40',
                      )}
                    >
                      {/*
                        Only the grip starts a drag. The row also holds a
                        title field and a remove button, and a drag that can
                        start anywhere turns every misjudged click into a
                        move.
                      */}
                      <IconTooltip label="Drag to reorder">
                        <button
                          type="button"
                          aria-label={`Drag to move ${described.label}`}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            setDragging(cell)
                            setPointer({ x: event.clientX, y: event.clientY })
                          }}
                          className="shrink-0 cursor-grab touch-none text-tertiary-foreground hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-3" aria-hidden />
                        </button>
                      </IconTooltip>
                      {/*
                        A ruler column, not a filled square. A 16px circle at 9px
                        already clipped two digits; the running count
                        (`offsets[slide] + cell + 1`) has to show a slice
                        of a hundred cells. Mono + tabular-nums is register 2
                        of the mono model — same treatment as the canvas
                        sequence badge and the phase-menubar count badge.
                      */}
                      <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {running}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">
                          {described.label}
                        </span>
                        {described.lane ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {described.lane}
                          </span>
                        ) : null}
                      </span>
                      <IconTooltip
                        label={`Take ${described.label} out of this slide`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${described.label}`}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => removeCell(slideIndex, cell)}
                        >
                          <X className="size-3" />
                        </Button>
                      </IconTooltip>
                    </div>

                    {/* The end of the slide needs its own slot, or the last
                        position in every slide is unreachable. */}
                    {cellIndex === slide.cells.length - 1 ? (
                      <DropLine
                        target={{ slide: slideIndex, index: slide.cells.length }}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {/* Dropping past the last slide creates one — the boundary-minting
          gesture now that Split is gone. Visible only mid-drag. */}
      {dragging !== null ? (
        <div
          data-drop-slot={`${slides.length}:0`}
          className={cn(
            'flex h-9 items-center justify-center rounded-lg border border-dashed text-xs transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
            slot?.slide === slides.length
              ? 'border-primary text-text-primary'
              : 'border-border text-muted-foreground',
          )}
        >
          Drop here for a new slide
        </div>
      ) : null}

      {/*
        The dragged row's ghost, under the pointer. Portalled to the body:
        the composer lives inside a popover whose popup carries a transform,
        and a transformed ancestor becomes the containing block for
        position:fixed — the ghost would render offset by the popover's
        translation, confidently not under the finger.
      */}
      {dragging !== null && pointer !== null
        ? createPortal(
            <div
              aria-hidden
              className="pointer-events-none fixed z-50 max-w-56 truncate rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
              style={{ left: pointer.x + 10, top: pointer.y + 6 }}
            >
              {draggedLabel}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
