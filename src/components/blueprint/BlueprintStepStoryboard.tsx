import { BlueprintCellButton } from '@/components/blueprint/BlueprintCellButton'
import { servedUrl } from '@/lib/basePath'
import { getStoryboardCellButtonMaxHeight } from '@/lib/blueprintLayout'
import type { BlueprintLaneRole } from '@/lib/blueprintCellStyle'
import { hasEmbeddedStoryboardFrame } from '@/lib/storyboardWalkthrough'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

/** One image on the storyboard strip. Lane names belong to the walkthrough, not here. */
export type BlueprintStepStoryboardPicture = {
  frame: string
}

type BlueprintStepStoryboardProps = {
  compact?: boolean
  className?: string
  fill?: BlueprintLaneRole
  selection?: BlueprintCellSelection
  cellId?: string
  stepIndex?: number
  opacity?: number
  frames?: readonly string[] | readonly BlueprintStepStoryboardPicture[]
  'aria-describedby'?: string
}

function normalizePictures(
  frames: readonly string[] | readonly BlueprintStepStoryboardPicture[],
): BlueprintStepStoryboardPicture[] {
  return frames.map((entry) =>
    typeof entry === 'string' ? { frame: entry } : entry,
  )
}

/**
 * The frames for one step, filling the cell face.
 *
 * There is no per-frame caption. The 8px lane-name under each thumbnail
 * existed only because the face was split to leave a strip for type; the
 * walkthrough still names lanes (`STORYBOARD_LANE_SHORT_LABELS`).
 *
 * @param {{ frames: readonly BlueprintStepStoryboardPicture[], className?: string }} props
 */
function StoryboardPictureStrip({
  frames,
  className,
}: {
  frames: readonly BlueprintStepStoryboardPicture[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 max-h-full w-full items-stretch justify-center gap-1 overflow-hidden',
        className,
      )}
    >
      {frames.map((entry, index) => (
        <div
          key={`${entry.frame}-${index}`}
          className="flex h-full min-h-0 max-h-full min-w-0 flex-1 items-center justify-center overflow-hidden"
        >
          <img
            src={servedUrl(entry.frame)}
            alt=""
            loading="lazy"
            decoding="async"
            /*
              The CONCENTRIC radius, not a token picked by eye. A rounded box
              inset inside another looks wrong unless its radius is the outer
              radius minus the inset. A rung picked by eye lands proud of that
              here — invisible while the cell face is near-transparent, and
              obvious the moment selection paints an opaque fill behind the
              frame, because the gap pinches at the corners. That is why hover looked right and selection did not.

              Spelled from the cell's own radius, the way the other inset
              radii in this tree are: `--radius-lg` is what the cell's
              `rounded-lg` resolves to, and the 5px is the inset — 4px of the
              cell's `p-1` and the 1px border in the button's own class. The
              padding is a literal here rather than `var(--spacing)`, which
              Tailwind emits but no stylesheet in this tree declares; the
              storyboard strip test holds the cell to `rounded-lg` and `p-1`,
              so changing either fails there rather than pinching here.

              The radius lands on the artwork because the box IS the artwork:
              no width is set, so `max-h-full max-w-full` scales the frame to
              its own aspect rather than stretching the box and letterboxing
              the picture inside it, which would round empty space instead.
            */
            className={cn(
              'max-h-full max-w-full rounded-[calc(var(--radius-lg)-5px)] object-contain object-center',
              hasEmbeddedStoryboardFrame(entry.frame) && 'scale-[1.08]',
            )}
          />
        </div>
      ))}
    </div>
  )
}

/** Storyboard-lane cell: the screenshots for a step, laid out inside a cell face. */
export function BlueprintStepStoryboard({
  compact = false,
  className,
  fill = 'storyboard',
  selection,
  cellId,
  stepIndex,
  opacity,
  frames,
  'aria-describedby': ariaDescribedBy,
}: BlueprintStepStoryboardProps) {
  const displayPictures = normalizePictures(frames ?? [])
  const hasRealPictures = displayPictures.length > 0
  // Counts what is actually here — images for one step, not people. The old
  // wording ("Step visuals for 1 users") got both halves wrong, and a screen
  // reader read it out on every storyboard cell on the board.
  //
  // SINGULAR, and the rename is why. One cell is one step's storyboard
  // holding several images; "Step storyboards, 3 images" would have said
  // there are three of them, which is the word replaced without the sentence
  // read.
  const ariaLabel = hasRealPictures
    ? displayPictures.length === 1
      ? 'Step storyboard'
      : `Step storyboard, ${displayPictures.length} images`
    : 'Empty step storyboard'
  const inlineMaxHeight = getStoryboardCellButtonMaxHeight(compact)

  if (!hasRealPictures) {
    return null
  }

  return (
    <BlueprintCellButton
      fill={fill}
      compact={compact}
      variant="storyboard"
      className={cn(
        'h-full min-h-0 max-h-full w-full overflow-hidden',
        'items-stretch justify-stretch p-1',
        className,
      )}
      style={{
        maxHeight: inlineMaxHeight,
        '--background-blueprint-cell-panel': 'transparent',
      } as CSSProperties}
      selection={selection}
      cellId={cellId}
      stepIndex={stepIndex}
      opacity={opacity}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      <StoryboardPictureStrip frames={displayPictures} />
    </BlueprintCellButton>
  )
}
