import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { ChevronLeft, ChevronRight, CornerUpLeft } from 'lucide-react'
import {
  ZoomableImage,
  type ZoomableImageSibling,
} from '@/components/blueprint/ZoomableImage'
import { CanvasLoadProgress } from '@/components/editor/CanvasLoadProgress'
import { SlicePresentationLoadingSkeleton } from '@/components/editor/EditorLoadingSkeletons'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { SliceHeaderBand } from '@/components/editor/SliceHeaderBand'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { useViewState } from '@/contexts/viewStateStore'
import { useSliceBlueprint } from '@/hooks/useSliceBlueprint'
import { servedUrl } from '@/lib/basePath'
import { requestSliceCellFocus } from '@/lib/canvasFocusCells'
import { buildCellLookup, getCellAt } from '@/lib/normalizeBlueprint'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { imagesThisSlideShows } from '@/lib/slideImages'
import { cn } from '@/lib/utils'
import type { BlueprintCell, BlueprintData } from '@/types/blueprint'
import type { Slide } from '@/types/database'

const CELL_SNIPPET_MAX_LENGTH = 60

function cellSnippet(cell: BlueprintCell | undefined): string {
  if (!cell) return 'Removed cell'
  const firstLine = cell.content.split('\n')[0]?.trim() ?? ''
  if (firstLine.length === 0) return 'Untitled cell'
  return firstLine.length > CELL_SNIPPET_MAX_LENGTH
    ? `${firstLine.slice(0, CELL_SNIPPET_MAX_LENGTH - 1)}…`
    : firstLine
}

/**
 * The width the stage column and the filmstrip share, so both start on one
 * left edge.
 */
const STAGE_COLUMN_WIDTH = 'max-w-5xl'

/**
 * Columns for a slide's frames, by image count alone.
 *
 * One image takes two-thirds of the column; two, three and four share a row
 * evenly; past four the frames stay quarters and wrap, the short row starting
 * at the left edge. Each `max-w-[…]` caps the grid at the width whose frames
 * are 40vh tall (a 4:3 frame is 4/3 as wide as it is tall, plus the gaps), so
 * on a short window the frames shrink before the title and caption are pushed
 * off the stage. The strings are whole literals so the Tailwind scanner sees
 * them.
 *
 * @param count - how many images the slide shows
 */
function frameGridClass(count: number): string {
  if (count === 1) return 'w-2/3 grid-cols-1 max-w-[calc(160vh/3)]'
  if (count === 2) return 'w-full grid-cols-2 max-w-[calc(320vh/3_+_1rem)]'
  if (count === 3) return 'w-full grid-cols-3 max-w-[calc(160vh_+_2rem)]'
  return 'w-full grid-cols-4 max-w-[calc(640vh/3_+_3rem)]'
}

type SlicePresentationProps = {
  sliceId: string
  /**
   * Exit request. The shell owns it because leaving is a shell-wide move:
   * the sidebar re-expands in step with the stage fading out, and the tab
   * only switches once that has played (tabs unmount on switch, so the
   * outgoing animation has to happen while this tab is still mounted).
   */
  onReturn: () => void
  /** True while the shell is playing the exit animation. */
  leaving?: boolean
}

/**
 * Presentation tab: a dark full-bleed stage (the root carries the `.dark`
 * token class regardless of app theme) with one left-aligned column —
 * counter, title, caption, even image frames, and the slide's cells behind
 * one button — a dim mini-map locator bottom-right, and a filmstrip of
 * cells bracketed per slide. Slides render synchronously from the cached useSlice data —
 * navigation never refetches. Keyboard is scoped to the container (tabIndex
 * + onKeyDown, no window listeners); the slide mirrors to the URL via the
 * debounced ViewStateContext mechanism.
 *
 * The slice header band rides at the top of the stage in dark tokens, with
 * Return where the focus tab shows Present — presentation is a mode of the
 * slice, not a separate screen.
 */
export function SlicePresentation({
  sliceId,
  onReturn,
  leaving = false,
}: SlicePresentationProps) {
  const { openTab, reportPresentSlide, restoredSlide, consumeRestoredSlide } =
    useViewState()

  const {
    result,
    detail,
    items,
    cellIds,
    blueprint,
    scenarioResult,
    blueprintsLoading,
  } = useSliceBlueprint(sliceId)
  const cellById = useMemo(
    () =>
      new Map((blueprint?.cells ?? []).map((cell) => [cell.id, cell])),
    [blueprint],
  )
  const memberCellIds = useMemo(
    () => new Set(cellIds.map(resolveBlueprintCellId)),
    [cellIds],
  )

  const [slide, setSlide] = useState(() =>
    restoredSlide && restoredSlide.sliceId === sliceId
      ? restoredSlide.slide
      : 0,
  )

  // The deep-link slide is one-shot: consume it after the initial read so
  // reopening this present tab later starts at slide 0.
  useEffect(() => {
    if (restoredSlide) consumeRestoredSlide()
  }, [restoredSlide, consumeRestoredSlide])
  const slideCount = items.length
  const clampedSlide =
    slideCount === 0 ? 0 : Math.min(Math.max(0, slide), slideCount - 1)
  const item = items[clampedSlide]

  useEffect(() => {
    reportPresentSlide(clampedSlide)
  }, [clampedSlide, reportPresentSlide])

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Only the active tab mounts, so mount focus covers tab activation.
    containerRef.current?.focus()
  }, [])

  const goToSlide = useCallback(
    (next: number) => {
      if (slideCount === 0) return
      setSlide(Math.min(Math.max(0, next), slideCount - 1))
    },
    [slideCount],
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        goToSlide(clampedSlide - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        goToSlide(clampedSlide + 1)
        break
      case 'Home':
        event.preventDefault()
        goToSlide(0)
        break
      case 'End':
        event.preventDefault()
        goToSlide(slideCount - 1)
        break
    }
  }

  /**
   * Open the slice tab on this cell, with its detail panel. The tab
   * descriptor carries no cell, so the focus is left pending for the
   * viewport to consume when it registers — including when the tab was not
   * already open.
   *
   * @param cellId - The cited cell this row names.
   */
  const openSliceCell = useCallback(
    (cellId: string) => {
      requestSliceCellFocus(sliceId, [cellId], { openDetail: true })
      openTab({ kind: 'slice', sliceId })
    },
    [openTab, sliceId],
  )

  const returnAction = {
    label: 'Return',
    icon: CornerUpLeft,
    onClick: onReturn,
  }

  // All-or-nothing: the stage waits for the blueprint too, otherwise every
  // cells-list row paints "Removed cell" for a beat before the cells land.
  if (
    result.status === 'loading' ||
    scenarioResult.status === 'loading' ||
    blueprintsLoading
  ) {
    return (
      <DeferredSkeleton
        loading
        holdKey={`present-tab:${sliceId}`}
        skeleton={
          <div className="relative h-full min-h-0">
            <SlicePresentationLoadingSkeleton />
            {/* Same stage bar the slice tab shows: every canvas-loading
                surface carries the one progress vocabulary, presentation
                included. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <CanvasLoadProgress
                stages={[
                  { label: 'Loading slice…', done: result.status !== 'loading' },
                  { label: 'Loading blueprints…', done: false },
                ]}
              />
            </div>
          </div>
        }
        className="h-full min-h-0"
      >
        {null}
      </DeferredSkeleton>
    )
  }

  if (!detail) {
    return (
      <PresentationMessage>
        {result.status === 'error'
          ? `This slice could not be loaded: ${result.message}`
          : 'This slice could not be loaded.'}
      </PresentationMessage>
    )
  }

  if (slideCount === 0 || !item) {
    return (
      <div
        className="dark flex h-full min-h-0 flex-col bg-background text-foreground"
        data-presentation-root=""
        data-leaving={leaving ? '' : undefined}
      >
        <SliceHeaderBand detail={detail} primaryAction={returnAction} />
        <div
          className="flex min-h-0 flex-1 items-center justify-center p-8"
          data-presentation-stage=""
        >
          <div className="max-w-sm text-center">
            <h2 className="text-2xl font-semibold">
              <span aria-hidden>▶ </span>
              {detail.slice.title}
            </h2>
            <p className="mt-3 text-sm text-foreground">
              This slice has no slides yet.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Stage media: whatever `imagesThisSlideShows` resolves — every cited
  // frame on an untouched slide, or exactly the authored rows. Never
  // truncated. No media → title-slide layout.
  const shownImages = imagesThisSlideShows(blueprint, item)
  const stageMedia = shownImages.map((image) => image.src)
  const stageSiblings = shownImages.map((image) => ({ src: image.src, alt: '' }))
  const slideCellIds = new Set(item.cell_ids.map(resolveBlueprintCellId))
  const title = item.title ?? detail.slice.title

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      aria-label={`${detail.slice.title} presentation`}
      className="dark relative flex h-full min-h-0 flex-col bg-background text-foreground outline-none"
      data-presentation-root=""
      data-leaving={leaving ? '' : undefined}
    >
      {/* Persists across slice ⇄ presentation — the band is the one constant,
          so the switch reads as a mode change on one object. */}
      <SliceHeaderBand detail={detail} primaryAction={returnAction} />

      {/* Stage — mini-map anchors bottom-right of this box, above the filmstrip. */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        data-presentation-stage=""
      >
        <div className="flex min-h-0 flex-1 items-stretch gap-2 px-4 pt-5">
          <SlideNavButton
            direction="prev"
            disabled={clampedSlide === 0}
            onClick={() => goToSlide(clampedSlide - 1)}
          />

          <div className="min-w-0 flex-1 overflow-y-auto px-2">
            {/* One column, centred on the stage; everything in it starts at
                its left edge, in reading order. */}
            <div
              className={cn(
                'mx-auto flex min-h-full w-full flex-col items-start justify-center gap-4 py-4 text-left',
                STAGE_COLUMN_WIDTH,
              )}
              data-presentation-column=""
            >
              <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                Slide {clampedSlide + 1} of {slideCount}
              </p>
              <h2 className="max-w-3xl text-2xl font-semibold text-balance">
                {title}
              </h2>
              {item.caption && (
                <p className="max-w-2xl text-sm text-foreground">
                  {item.caption}
                </p>
              )}
              {stageMedia.length > 0 && (
                <div
                  className={cn('grid gap-4', frameGridClass(stageMedia.length))}
                  data-presentation-frames=""
                >
                  {stageMedia.map((src, index) => (
                    <StageFrame
                      key={`${src}-${index}`}
                      src={servedUrl(src)}
                      siblings={stageSiblings}
                      siblingIndex={index}
                    />
                  ))}
                </div>
              )}
              {item.cell_ids.length > 0 && (
                <SlideCellsList
                  cellIds={item.cell_ids}
                  cellById={cellById}
                  onOpenCell={openSliceCell}
                />
              )}
            </div>
          </div>

          <SlideNavButton
            direction="next"
            disabled={clampedSlide === slideCount - 1}
            onClick={() => goToSlide(clampedSlide + 1)}
          />
        </div>

        {blueprint && (
          <PresentationMiniMap
            blueprint={blueprint}
            memberCellIds={memberCellIds}
            slideCellIds={slideCellIds}
          />
        )}
      </div>

      {slideCount > 1 && (
        <PresentationFilmstrip
          items={items}
          activeSlide={clampedSlide}
          cellById={cellById}
          onSelect={goToSlide}
        />
      )}
    </div>
  )
}

/**
 * One image frame: a 4:3 box the picture is fitted inside, so a picture can
 * never change its frame's size. The cap goes on the image rather than the
 * frame — frames stay even — and holds a picture to twice its natural size.
 */
function StageFrame({
  src,
  siblings,
  siblingIndex,
}: {
  src: string
  siblings: readonly ZoomableImageSibling[]
  siblingIndex: number
}) {
  const [natural, setNatural] = useState<{
    width: number
    height: number
  } | null>(null)
  return (
    <ZoomableImage
      src={src}
      alt=""
      triggerLabel="Enlarge image"
      siblings={siblings}
      siblingIndex={siblingIndex}
      triggerClassName="flex aspect-[4/3] w-full min-w-0 items-center justify-center overflow-hidden rounded-lg bg-card/40"
    >
      <img
        src={servedUrl(src)}
        alt=""
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget
          if (naturalWidth > 0 && naturalHeight > 0) {
            setNatural({ width: naturalWidth, height: naturalHeight })
          }
        }}
        className="h-full w-full object-contain"
        style={
          natural
            ? {
                maxWidth: `${natural.width * 2}px`,
                maxHeight: `${natural.height * 2}px`,
              }
            : undefined
        }
      />
    </ZoomableImage>
  )
}

/** Keys the stage root turns into slide moves. */
const SLIDE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * The slide's cited cells, behind one `N cells` button. Each row opens its
 * own cell in the slice, cells without a picture included. Choosing a row
 * closes the list first: the stage stays mounted behind the slice tab, so
 * nothing else would.
 */
function SlideCellsList({
  cellIds,
  cellById,
  onOpenCell,
}: {
  cellIds: readonly string[]
  cellById: ReadonlyMap<string, BlueprintCell>
  onOpenCell: (cellId: string) => void
}) {
  const count = cellIds.length
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent">
        {count === 1 ? '1 cell' : `${count} cells`}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="dark w-80 gap-0 p-1"
        // The list portals out of the stage but its React events still
        // bubble to it; a key pressed in the list must not change slides.
        onKeyDown={(event) => {
          if (SLIDE_KEYS.has(event.key)) event.stopPropagation()
        }}
      >
        <ul className="flex flex-col">
          {cellIds.map((cellId) => {
            const snippet = cellSnippet(
              cellById.get(resolveBlueprintCellId(cellId)),
            )
            return (
              <li key={cellId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpenCell(cellId)
                  }}
                  aria-label={`Open ${snippet} in the slice`}
                  title="Open in slice focus view"
                  className="w-full rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent"
                >
                  {snippet}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function SlideNavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  const label = direction === 'prev' ? 'Previous slide' : 'Next slide'
  return (
    <IconTooltip label={label} side={direction === 'prev' ? 'right' : 'left'}>
      {/* Ghost Button with the bespoke rail geometry kept verbatim (w-10 +
          py-6 is the hit area presenters aim at from across the room). */}
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="h-auto w-10 shrink-0 self-center rounded-md border-border bg-card px-0 py-6 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground disabled:opacity-30 dark:hover:bg-accent"
      >
        <Icon className="size-5" />
      </Button>
    </IconTooltip>
  )
}

function PresentationFilmstrip({
  items,
  activeSlide,
  cellById,
  onSelect,
}: {
  items: readonly Slide[]
  activeSlide: number
  cellById: ReadonlyMap<string, BlueprintCell>
  onSelect: (slide: number) => void
}) {
  // Cumulative cell-order offsets so squares number continuously across slides.
  const orderOffsets: number[] = []
  let runningTotal = 0
  for (const item of items) {
    orderOffsets.push(runningTotal)
    runningTotal += item.cell_ids.length
  }

  return (
    <div
      className="shrink-0 overflow-x-auto border-t border-border px-6 py-4"
      data-presentation-filmstrip=""
    >
      {/* Starts on the stage column's left edge; slides past its width
          overflow to the right and the strip scrolls. */}
      <div className={cn('mx-auto flex items-start gap-6', STAGE_COLUMN_WIDTH)}>
        {items.map((item, index) => {
          const active = index === activeSlide
          return (
            <div
              key={item.id}
              className={cn(
                'flex shrink-0 flex-col gap-2 border-t-2 pt-2',
                active ? 'border-foreground' : 'border-border',
              )}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelect(index)}
                className={cn(
                  // h-auto/p-0 keeps the raw button's exact text hit area.
                  'h-auto max-w-48 justify-start rounded-md border-0 p-0 text-sm font-medium hover:bg-transparent dark:hover:bg-transparent',
                  active
                    ? 'text-foreground'
                    : 'text-foreground',
                )}
              >
                <span className="min-w-0 truncate">
                  {item.title ?? `Slide ${index + 1}`}
                </span>
              </Button>
              <div className="flex gap-2">
                {item.cell_ids.map((cellId, cellIndex) => {
                  const order = (orderOffsets[index] ?? 0) + cellIndex + 1
                  const cell = cellById.get(resolveBlueprintCellId(cellId))
                  return (
                    <IconTooltip
                      key={`${cellId}-${order}`}
                      label={cellSnippet(cell)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onSelect(index)}
                        aria-label={cellSnippet(cell)}
                        className={cn(
                          // size-10 squares, exactly the raw buttons' hit area.
                          'size-10 shrink-0 rounded-md border font-mono text-sm font-medium tabular-nums',
                          active
                            ? 'border-foreground bg-foreground text-contrast hover:bg-foreground hover:text-contrast dark:hover:bg-foreground'
                            : 'border-border bg-muted text-foreground hover:bg-accent dark:hover:bg-accent',
                          !cell && 'border-dashed opacity-60',
                        )}
                      >
                        {order}
                      </Button>
                    </IconTooltip>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PresentationMiniMap({
  blueprint,
  memberCellIds,
  slideCellIds,
}: {
  blueprint: BlueprintData
  memberCellIds: ReadonlySet<string>
  slideCellIds: ReadonlySet<string>
}) {
  const lanes = useMemo(
    () => [...blueprint.lanes].sort((a, b) => a.position - b.position),
    [blueprint.lanes],
  )
  const cellLookup = useMemo(
    () => buildCellLookup(blueprint.cells),
    [blueprint.cells],
  )

  return (
    <div
      aria-hidden
      className="absolute right-3 bottom-2 z-10 rounded-md border border-border bg-card/80 p-2 opacity-40 transition-opacity ease-arrive motion-reduce:transition-none duration-(--motion-micro) hover:opacity-100"
    >
      <div className="flex flex-col gap-px">
        {lanes.map((lane) => (
          <div key={lane.id} className="flex gap-px">
            {blueprint.steps.map((step) => {
              const cell = getCellAt(cellLookup, lane.id, step.id)
              const isMember = cell !== undefined && memberCellIds.has(cell.id)
              const isCurrent = cell !== undefined && slideCellIds.has(cell.id)
              return (
                <div
                  key={step.id}
                  className={cn(
                    'h-1 w-2 rounded-[1px]',
                    isCurrent
                      ? 'bg-foreground'
                      : isMember
                        ? 'bg-foreground/40'
                        : cell
                          ? 'bg-border'
                          : 'bg-transparent',
                  )}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function PresentationMessage({ children }: { children: string }) {
  return (
    <div className="dark flex h-full items-center justify-center bg-background p-8">
      <p className="text-sm text-foreground">{children}</p>
    </div>
  )
}
