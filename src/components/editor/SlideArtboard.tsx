import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { SLIDE_ARTBOARD_WIDTH } from '@/lib/slideLayout'
import { useEditor } from '@/contexts/EditorContext'
import { getSlideDisplayLabel, isSubslide, type NavItem } from '@/types/nav'
import { Badge } from '@/components/ui/badge'

type SlideArtboardProps = {
  slide: NavItem
  isActive?: boolean
  onSelect?: () => void
  className?: string
  style?: CSSProperties
  variant?: 'viewport' | 'canvas'
}

/**
 * A slide rendered as a page thumbnail — used both in the viewport filmstrip
 * and as a canvas node, which is what `variant` selects between.
 */
export function SlideArtboard({
  slide,
  isActive = false,
  onSelect,
  className,
  style,
  variant = 'viewport',
}: SlideArtboardProps) {
  const { slides } = useEditor()
  const displayLabel = getSlideDisplayLabel(slide, slides)

  const sharedClassName = cn(
    'relative flex items-center justify-center rounded-md border bg-card text-left transition-[box-shadow,border-color]',
    variant === 'viewport' && 'aspect-video w-full max-w-5xl',
    variant === 'canvas' && 'shrink-0',
    isActive
      ? 'border-primary ring-2 ring-primary/25'
      : 'border-border',
    onSelect && 'hover:border-strong',
    className,
  )

  const sharedStyle =
    variant === 'canvas'
      ? { width: SLIDE_ARTBOARD_WIDTH, ...style }
      : style

  const content = (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {isSubslide(slide) && (
        <Badge variant="secondary" className="font-normal">
          Scenario
        </Badge>
      )}
      <span className="text-base font-medium text-foreground">{displayLabel}</span>
    </div>
  )

  if (variant === 'canvas' && !onSelect) {
    return (
      <div
        data-canvas-artboard
        data-slide-id={slide.id}
        className={sharedClassName}
        style={sharedStyle}
        aria-label={displayLabel}
        aria-current={isActive ? 'true' : undefined}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      data-canvas-artboard
      data-slide-id={slide.id}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
      className={sharedClassName}
      style={sharedStyle}
      aria-label={displayLabel}
      aria-current={isActive ? 'true' : undefined}
    >
      {content}
    </button>
  )
}
