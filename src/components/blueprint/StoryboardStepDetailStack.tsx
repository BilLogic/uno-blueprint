import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import {
  hasEmbeddedStoryboardFrame,
  type StoryboardFrameEntry,
} from '@/lib/storyboardWalkthrough'
import { servedUrl } from '@/lib/basePath'
import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

const PICTURE_FRAME_CLASS =
  'relative aspect-[4/3] w-full max-w-full shrink-0 overflow-hidden rounded-lg bg-muted/20'
const PICTURE_CLASS =
  'absolute inset-0 h-full w-full object-contain object-center'

type StoryboardStepDetailStackProps = {
  entries: StoryboardFrameEntry[]
  /** Side panel stacks vertically; presentation view lays cards out in a row. */
  orientation?: 'vertical' | 'horizontal'
  /** The full picture group when an editor renders one row at a time. */
  galleryEntries?: StoryboardFrameEntry[]
  className?: string
}

/** The screenshots for one step, stacked for the side panel or laid out in a row for presentation. */
export function StoryboardStepDetailStack({
  entries,
  orientation = 'vertical',
  galleryEntries = entries,
  className,
}: StoryboardStepDetailStackProps) {
  if (entries.length === 0) {
    return null
  }

  if (orientation === 'horizontal') {
    /*
      The horizontal layout's frames deliberately do NOT open.

      This orientation is only ever drawn inside `StoryboardWalkthroughModal`,
      which is a deck: it binds ArrowLeft, ArrowRight and Escape on the WINDOW
      to move between steps and to close itself. An image viewer opened inside
      it would want all three keys for stepping siblings and closing, and the
      window listener would answer first — so one press would step the deck
      and the picture at once, and Escape would close both.

      That is the same reason the slice presentation's stage media is left
      alone, and it applies here for the same mechanical cause rather than by
      analogy. The vertical stack below carries no deck around it and does
      open; these frames are reachable there, so nothing becomes unviewable.
    */
    // Shared rows keep image tops, titles, and summaries aligned across users.
    const gridStyle = {
      gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))`,
      gridTemplateRows: 'minmax(0, 1fr) auto auto',
    } as CSSProperties

    return (
      <div
        className={cn('grid h-full min-h-0 gap-x-4 gap-y-2', className)}
        style={gridStyle}
      >
        {entries.map((entry, index) => (
          <div
            key={`frame-${entry.laneName}`}
            className="relative min-h-0 w-full overflow-hidden rounded-lg bg-muted/20"
            style={{ gridColumn: index + 1, gridRow: 1 }}
          >
            <img
              src={servedUrl(entry.frame)}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                PICTURE_CLASS,
                hasEmbeddedStoryboardFrame(entry.frame) && 'scale-[1.08]',
              )}
            />
          </div>
        ))}

        {entries.map((entry, index) => (
          <p
            key={`label-${entry.laneName}`}
            className="self-start text-xs font-medium text-foreground"
            style={{ gridColumn: index + 1, gridRow: 2 }}
          >
            {entry.label}
          </p>
        ))}

        {entries.map((entry, index) => (
          <p
            key={`summary-${entry.laneName}`}
            className="line-clamp-3 self-start overflow-hidden text-sm whitespace-pre-wrap text-foreground"
            style={{ gridColumn: index + 1, gridRow: 3 }}
          >
            {entry.summary || (
              <span className="text-muted-foreground">No summary</span>
            )}
          </p>
        ))}
      </div>
    )
  }

  /*
    The stack's frames open, and step to one another.

    One group, in the order the entries arrive in — which is lane order, the
    same moment as each actor saw it, and the whole reason the row is worth
    comparing. Passed in rather than discovered: a scan of the container
    would reproduce that order today and only by accident.

    Each frame's name is its lane's label, which is already printed under it.
  */
  const siblings = galleryEntries.map((entry) => ({
    src: entry.frame,
    alt: entry.label,
  }))

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {entries.map((entry) => (
        <div key={entry.laneName} className="flex flex-col gap-2">
          <div className={PICTURE_FRAME_CLASS}>
            <ZoomableImage
              src={entry.frame}
              alt={entry.label}
              triggerLabel={`Expand: ${entry.label}`}
              siblings={siblings}
              siblingIndex={galleryEntries.findIndex((picture) => picture.laneName === entry.laneName)}
              triggerClassName="absolute inset-0 block cursor-pointer"
            >
              <img
                src={servedUrl(entry.frame)}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn(
                  PICTURE_CLASS,
                  hasEmbeddedStoryboardFrame(entry.frame) && 'scale-[1.08]',
                )}
              />
            </ZoomableImage>
          </div>
          <p className="text-xs font-medium text-foreground">
            {entry.label}
          </p>
          {entry.summary ? <p className="text-sm whitespace-pre-wrap text-foreground">{entry.summary}</p> : null}
        </div>
      ))}
    </div>
  )
}
