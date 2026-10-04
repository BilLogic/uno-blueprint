import { useEffect, useState, useSyncExternalStore, type DragEvent } from 'react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import {
  getSlideSheetHeight,
  persistSlideSheetHeight,
  setSlideSheetHeight,
  subscribeSlideSheetHeight,
} from '@/lib/slideSheetHeight'
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { SlideImagesField } from '@/components/editor/SlideImagesField'
import { cn } from '@/lib/utils'
import { describeCell } from '@/lib/canvasCellQuery'
import type { DraftSlide, ValidationProblem } from '@/lib/sliceValidation'
import type { Slide } from '@/types/database'

/**
 * The slide editor, docked under the canvas while a slice is being edited.
 *
 * Drag lives *here*, never on the artboard: the canvas is a pan/zoom surface,
 * and a drag that starts on a cell is already the camera's gesture. So the
 * two halves of editing split by what they are good at — the canvas adds and
 * removes cells by clicking, this strip decides grouping and order.
 *
 * Two drag targets, deliberately distinct:
 * - a **cell badge** moves between slides (the "which slide is this in"
 *   question);
 * - a **slide header** reorders slides (the "what order do they play in"
 *   question).
 */
/**
 * The sheet's top edge, dragged.
 *
 * Same shape as `AgentDockDivider`, and deliberately so: one gesture idiom
 * for "make this region taller" rather than a second one that behaves
 * almost the same. Listeners live on `window` because a pointer that leaves
 * the 4px strip mid-drag must not end the drag.
 */
function SlideSheetDivider() {
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    if (!resizing) return
    const move = (event: PointerEvent) => {
      // The sheet grows UPWARD, so the height is the distance from the
      // pointer to the bottom of the window.
      setSlideSheetHeight(window.innerHeight - event.clientY)
    }
    const up = () => {
      setResizing(false)
      persistSlideSheetHeight()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [resizing])

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the slides"
      onPointerDown={(event) => {
        event.preventDefault()
        setResizing(true)
      }}
      className={cn(
        'h-1 shrink-0 cursor-row-resize touch-none transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        resizing ? 'bg-border' : 'hover:bg-border/80',
      )}
    />
  )
}

/**
 * Whether anything between `from` and `stop` can still scroll the way a
 * vertical wheel of `deltaY` points — a card, or a caption's textarea.
 */
function scrollsVertically(
  from: Element | null,
  stop: Element,
  deltaY: number,
): boolean {
  for (let node = from; node && node !== stop; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue
    if (node.scrollHeight <= node.clientHeight) continue
    const room =
      deltaY > 0
        ? node.scrollHeight - node.clientHeight - node.scrollTop
        : node.scrollTop
    if (room > 1) return true
  }
  return false
}

export function SliceSlideEditor({
  slides,
  activeSlide,
  problems,
  sliceId,
  savedSlideFor,
  onActivate,
  onChange,
  onRemoveCells,
}: {
  slides: DraftSlide[]
  activeSlide: number
  problems: ValidationProblem[]
  sliceId: string
  /**
   * The saved illustration for a slide's row, read from the slice rather than
   * carried in the draft: the image is written straight to `slides` on
   * upload, so the draft would go stale the moment one lands.
   */
  savedSlideFor: (itemId: string) => Slide | null
  onActivate: (index: number) => void
  /** Titles, captions, a new slide, a new order: taken as given. */
  onChange: (slides: DraftSlide[]) => void
  /**
   * Cells taken out of slides, by a drag or the ✕. Every slide keeps its
   * position and an emptied one is still there, so the receiver can see
   * which slides the change emptied and settle them.
   */
  onRemoveCells: (slides: DraftSlide[]) => void
}) {
  const sheetHeight = useSyncExternalStore(
    subscribeSlideSheetHeight,
    getSlideSheetHeight,
    // The server has no window, and a sheet that renders at a
    // remembered height on the client and a different one in markup
    // is a hydration mismatch on the surface that owns the slides.
    () => 224,
  )
  // What is currently being dragged. Kept in state rather than read from the
  // dataTransfer during dragover, because the payload is not readable there
  // in every browser — only on drop.
  const [dragging, setDragging] = useState<
    | { kind: 'cell'; slide: number; cell: string }
    | { kind: 'slide'; slide: number }
    | null
  >(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  // Where a dragged cell would land inside a slide — one drag reorders,
  // whether the destination is the same slide or another.
  const [cellDrop, setCellDrop] = useState<{
    slide: number
    index: number
  } | null>(null)
  // The strip folds like an accordion: the slides are working material,
  // and while the canvas is the subject the strip collapses to one bar.
  const [collapsed, setCollapsed] = useState(false)

  const endDrag = () => {
    setDragging(null)
    setDropTarget(null)
    setCellDrop(null)
  }

  const update = (next: DraftSlide[]) => {
    onChange(next)
    endDrag()
  }

  // Cells leaving slides take the other door: a slide the change empties is
  // the session's to settle, and it asks first when there is content to lose.
  const takeCells = (next: DraftSlide[]) => {
    onRemoveCells(next)
    endDrag()
  }

  const moveCell = (cell: string, to: number, at?: number) => {
    // Remove first, then re-derive the insert index: pulling the cell out
    // shifts everything after it, and inserting at the pre-removal index is
    // how a drag one place down silently becomes a no-op.
    let insertAt = at
    const withoutCell = slides.map((slide, index) => {
      const position = slide.cells.indexOf(cell)
      if (position === -1) return slide
      if (
        index === to &&
        insertAt !== undefined &&
        position < insertAt
      ) {
        insertAt -= 1
      }
      return { ...slide, cells: slide.cells.filter((id) => id !== cell) }
    })

    const next = withoutCell.map((slide, index) => {
      if (index !== to) return slide
      const position = insertAt ?? slide.cells.length
      return {
        ...slide,
        cells: [
          ...slide.cells.slice(0, position),
          cell,
          ...slide.cells.slice(position),
        ],
      }
    })
    // A slide the move empties is left in place for the session to settle.
    takeCells(next)
  }

  const moveSlide = (from: number, to: number) => {
    if (from === to) return
    const next = [...slides]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update(next)
  }

  const removeCell = (slideIndex: number, cell: string) => {
    takeCells(
      slides.map((slide, index) =>
        index === slideIndex
          ? { ...slide, cells: slide.cells.filter((id) => id !== cell) }
          : slide,
      ),
    )
  }

  // Running cell number across slides — the same sequence the saved slice
  // shows on the canvas, so the editor and the artboard agree. Derived from
  // the slides above it rather than a running counter, which keeps it a pure
  // function of the render's input.
  const sequenceBySlide = slides.map((slide, slideIndex) => {
    const before = slides
      .slice(0, slideIndex)
      .reduce((total, earlier) => total + earlier.cells.length, 0)
    return slide.cells.map((_, cellIndex) => before + cellIndex + 1)
  })

  return (
    <div className="flex shrink-0 flex-col border-t border-border bg-sidebar">
      {/*
        Above the header, not below it: the grab target is the sheet's top
        EDGE, which is the line a reader is already looking at when they want
        it taller. Hidden while collapsed, where there is no height to drag.
      */}
      {collapsed ? null : <SlideSheetDivider />}
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform duration-(--motion-micro) ease-move motion-reduce:transition-none',
            collapsed && '-rotate-90',
          )}
          aria-hidden
        />
        {/*
          "Slides", not "Storyboard": the storyboard is a lane of the board,
          and what this sheet holds is slides — its own buttons say "Add
          slide", "Remove slide 2" and "Keep slide".
        */}
        Slides
      </button>
      {collapsed ? null : (
    <div
      // `height`, not `maxHeight`: the divider sets the sheet's size the way
      // the sidebar's edge sets the sidebar's. A maximum let the strip stop
      // at its tallest card, so a drag past that moved nothing.
      //
      // No sideways scroll bar: a trackpad swipes across natively, and a
      // mouse wheel is turned sideways below.
      className="blueprint-scroll flex shrink-0 gap-2 overflow-x-auto overflow-y-hidden px-2 pb-2"
      style={{ height: sheetHeight }}
      onWheel={(event) => {
        // A wheel that is mostly sideways is already scrolling the strip.
        if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
        // A card with somewhere left to go keeps the wheel; at its end the
        // turn passes to the strip, the way nested page scrolling hands off.
        if (
          scrollsVertically(
            event.target as Element,
            event.currentTarget,
            event.deltaY,
          )
        ) {
          return
        }
        event.currentTarget.scrollLeft += event.deltaY
      }}
    >
      {slides.map((slide, index) => {
        const slideProblems = problems.filter(
          (problem) => problem.slide === index,
        )
        const isActive = index === activeSlide

        return (
          <div
            key={index}
            data-slide-card=""
            className={cn(
              // min-h-0 + overflow-y-auto: a card taller than the sheet
              // scrolls inside itself. Clipping it hid the images and the
              // caption with no way to reach them.
              'group/slide flex min-h-0 w-56 shrink-0 flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-lg border bg-card p-2 transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
              isActive ? 'border-primary' : 'border-border',
              dropTarget === index && 'ring-2 ring-primary/40',
            )}
            onClick={() => onActivate(index)}
            onDragOver={(event: DragEvent) => {
              event.preventDefault()
              setDropTarget(index)
            }}
            onDragLeave={() => setDropTarget((current) => (current === index ? null : current))}
            onDrop={(event: DragEvent) => {
              event.preventDefault()
              if (!dragging) return
              if (dragging.kind === 'cell') {
                moveCell(
                  dragging.cell,
                  index,
                  cellDrop?.slide === index ? cellDrop.index : undefined,
                )
              } else {
                moveSlide(dragging.slide, index)
              }
            }}
          >
            <div
              draggable
              onDragStart={() => setDragging({ kind: 'slide', slide: index })}
              onDragEnd={() => setDragging(null)}
              className="flex cursor-grab items-center gap-2 active:cursor-grabbing"
            >
              {/* The grip names the gesture — a row that merely *is*
                  draggable looks exactly like one that is not. */}
              <GripVertical
                className="size-3 shrink-0 text-tertiary-foreground"
                aria-hidden
              />
              {/*
                Content-sized badge: `h-5 min-w-5` keeps one digit a circle,
                `px-1` grows it for two or more. The old `size-5` + 10px
                digit clipped at two.
              */}
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-foreground px-1 text-xs font-medium text-contrast">
                {index + 1}
              </span>
              <Input
                value={slide.title}
                // A placeholder is not a label: it disappears the moment
                // somebody types, so a FILLED card is two unnamed boxes, and
                // a screen reader gets a hint rather than a name. The visible
                // name lives on the field below, where there is room for one;
                // here the number and the strip already say which slide this
                // is, so the name is the accessible one.
                aria-label={`Slide ${index + 1} title`}
                placeholder="Slide title"
                className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onChange(
                    slides.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </div>

            {/* No scroll box of its own: the card scrolls, and a capped list
                inside it was a second box answering the same wheel. */}
            <ul className="flex min-h-8 shrink-0 flex-col gap-1">
              {slide.cells.map((cell, cellIndex) => (
                <li
                  key={cell}
                  draggable
                  onDragStart={() =>
                    setDragging({ kind: 'cell', slide: index, cell })
                  }
                  onDragEnd={() => {
                    setDragging(null)
                    setCellDrop(null)
                  }}
                  onDragOver={(event: DragEvent) => {
                    if (dragging?.kind !== 'cell') return
                    event.preventDefault()
                    // Top half inserts before this badge, bottom half after —
                    // one drag is the whole reordering grammar.
                    const box = event.currentTarget.getBoundingClientRect()
                    const before = event.clientY < box.top + box.height / 2
                    setCellDrop({
                      slide: index,
                      index: before ? cellIndex : cellIndex + 1,
                    })
                  }}
                  className={cn(
                    'group/cell flex cursor-grab items-center gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs active:cursor-grabbing',
                    cellDrop?.slide === index &&
                      cellDrop.index === cellIndex &&
                      'shadow-[0_-2px_0_0_var(--primary)]',
                    cellDrop?.slide === index &&
                      cellDrop.index === cellIndex + 1 &&
                      'shadow-[0_2px_0_0_var(--primary)]',
                  )}
                >
                  <GripVertical
                    className="size-3 shrink-0 text-tertiary-foreground"
                    aria-hidden
                  />
                  <span className="shrink-0 text-muted-foreground">
                    {sequenceBySlide[index][cellIndex]}
                  </span>
                  {/* The cell's words, not the tail of its key. `070110` is
                      an address; nobody recognises their content by address. */}
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {describeCell(cell).label}
                  </span>
                  <IconTooltip label="Take this cell out of the slide">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove cell from slice"
                      // Revealed on badge hover — a permanent ✕ per row is the
                      // loudest thing on a card that is mostly read.
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/cell:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeCell(index, cell)
                      }}
                    >
                      <X className="size-2.5" />
                    </Button>
                  </IconTooltip>
                </li>
              ))}
            </ul>

            {/*
              Caption is the sentence a reader meets
              under the title on the stage — and it is the one field on this
              card whose name is not implied by anything around it. It gets a
              visible one, in the schema's word.
            */}
            <label className="flex shrink-0 grow flex-col gap-1">
              <Eyebrow>
                Caption
              </Eyebrow>
            <textarea
              value={slide.caption}
              rows={2}
              // grow: the caption takes whatever height the card has left,
              // so a taller sheet is a roomier caption. min-h-14 holds two
              // rows when the card is full and the card scrolls instead.
              placeholder="What a reader meets under the title"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onChange(
                  slides.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, caption: event.target.value }
                      : item,
                  ),
                )
              }
              className="min-h-14 w-full grow resize-none rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring"
            />
            </label>

            <SlideImagesField
              sliceId={sliceId}
              itemId={slide.id}
              saved={slide.id ? savedSlideFor(slide.id) : null}
            />

            {slideProblems.length > 0 ? (
              <p className="text-xs text-destructive">
                {slideProblems[0].message}
              </p>
            ) : null}

            {/* No delete button. Split and Merge went because dragging a
                cell between slides is both; delete went because taking a
                slide's last cell out is it. */}
          </div>
        )
      })}

      {/* An empty trailing slide is where the next clicked cell lands. */}
      <button
        type="button"
        className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:border-primary hover:text-foreground"
        onClick={() => {
          onChange([...slides, { cells: [], title: '', caption: '' }])
          onActivate(slides.length)
        }}
      >
        <Plus className="size-4" />
        Add slide
      </button>
    </div>
      )}
    </div>
  )
}
