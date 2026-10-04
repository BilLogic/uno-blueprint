import { Expand } from 'lucide-react'
import type { CoverFigure as CoverFigureModel } from '@/components/cover/coverModel'
import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import { COVER_MEASURE } from '@/components/cover/coverMeasure'
import { servedUrl } from '@/lib/basePath'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * A cover figure.
 *
 * No plate, no border, no padding — deliberately. Every figure is authored
 * with a full-bleed rounded background rect across its whole viewBox
 * (`fill="#fafbfc" rx="14"`), so the artwork already IS its own container.
 * Wrapping it in a second bordered, padded, white box drew a frame around a
 * frame, which is what made the page read as boxes inside boxes.
 *
 * Dark mode is a second file, not a treatment. Fills, text and strokes are
 * literal values inside each SVG, and an `<img>` seals page CSS out of them,
 * so the page's `.dark` class cannot reach in. A figure that has a dark file
 * carries it as `srcDark`, and this component picks the file from the app's
 * resolved theme, so the toggle swaps it live and the opened viewer shows the
 * same one. A figure with no dark file yet keeps its light plate in both
 * themes.
 *
 * Not `dark:invert` — that destroys the lane colours the figures encode.
 * Not an opacity dim either, which drops the smallest labels below AA.
 *
 * Click to expand. These are dense technical diagrams — cell anatomy, the
 * skill architecture — authored at 880px and then shrunk to fit
 * COVER_MEASURE; small labels are legible in the source and not always in
 * the page. The trigger is the whole image, not a small corner button: a
 * diagram this dense benefits from a big hit target. The cursor stays a
 * plain pointer, not a zoom cursor — the corner hint already says "this
 * expands", and having both say it a second way read as two competing
 * signals for one action rather than reinforcement.
 *
 * The opened figure is now a viewer, and this file's earlier decision that
 * there is deliberately no second zoom step is REVERSED. It was the right
 * call while the popup was the end of the interaction: fit-to-viewport was
 * everything the popup had to offer, so the image was inert and every click
 * on it fell through to a close catcher. But fit-to-viewport is exactly the
 * scale at which the labels this figure was opened FOR are still too small,
 * so the popup being the end of the interaction was the defect. Past fit
 * the reader zooms toward the pointer, pans, and closes on the margin, on
 * Escape, or on a corner button that never leaves — and a click on the
 * diagram zooms rather than dismisses, because the diagram is now the thing
 * being operated. The reasoning about the trigger's plain pointer above is
 * untouched by that: it is about the closed state, where the corner hint is
 * still the only signal needed.
 *
 * Everything below the trigger belongs to `ZoomableImage`, which owns the
 * popup and the gestures for every openable image in the app. This is its
 * first adopter; it carries no sibling stepping, because a cover figure has
 * no siblings.
 */
export function CoverFigure({
  figure,
  eager = false,
  className,
}: {
  figure: CoverFigureModel
  /** First figure on the page decodes eagerly; everything below it is lazy. */
  eager?: boolean
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const src =
    resolvedTheme === 'dark' && figure.srcDark ? figure.srcDark : figure.src
  return (
    <ZoomableImage
      src={src}
      alt={figure.alt}
      // The authored size, which the browser cannot be asked for: these
      // figures are `viewBox`-only SVGs with no intrinsic size at all.
      naturalWidth={figure.width}
      naturalHeight={figure.height}
      triggerLabel={`Expand: ${figure.alt}`}
      triggerClassName={cn(
        'group/cover-figure relative block w-full cursor-pointer',
        COVER_MEASURE,
        className,
      )}
    >
      <img
        src={servedUrl(src)}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        data-cover-figure
        // One measure with the prose and the tables — see COVER_MEASURE.
        // This was `max-w-3xl` against the prose's `max-w-2xl`, so every
        // figure overhung the column it belonged to and the page
        // zig-zagged.
        className="h-auto w-full object-contain"
      />
      <span
        aria-hidden
        className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 backdrop-blur-sm transition-opacity duration-(--motion-fade) ease-out group-hover/cover-figure:opacity-100 group-focus-visible/cover-figure:opacity-100 max-sm:opacity-100"
      >
        <Expand className="size-4" aria-hidden />
      </span>
    </ZoomableImage>
  )
}
