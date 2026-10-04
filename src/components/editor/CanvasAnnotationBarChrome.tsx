import type { ReactElement, ReactNode } from 'react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { chromeAnchorStyle } from '@/components/editor/canvasAnnotationGeometry'

/**
 * The chrome the floating style bar is built on: the plate it floats on, the
 * rule between its groups, and the tooltip repainted for its own dark plane.
 *
 * The plate was written out three times, once per bar, and the three copies
 * had to agree on the attributes the layer's own click-outside rule looks for
 * (`data-annotation-editable`, `data-annotation-chrome`) as well as on the
 * anchor arithmetic. It is said once here, and a bar is now the controls it
 * holds — which is what let the three bars become one.
 */
export function AnnotationStyleBarFrame({
  x,
  y,
  width,
  zoom,
  children,
}: {
  x: number
  y: number
  width: number
  zoom: number
  children: ReactNode
}) {
  return (
    <div
      data-annotation-editable=""
      data-annotation-chrome=""
      className="pointer-events-auto absolute z-50 flex h-10 items-center gap-1 rounded-lg bg-annotation-chrome px-2 shadow-floating"
      style={chromeAnchorStyle(x, y, width, zoom)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}

export function AnnotationBarDivider() {
  return (
    <div
      className="mx-1 h-4 w-px shrink-0 bg-(--border-annotation-chrome-divider)"
      aria-hidden
    />
  )
}

/**
 * `IconTooltip` on this file's own dark plane. These bars float over the
 * canvas on the frozen `annotation-chrome` surface, so the popup and its
 * arrow (`**:` selectors) are
 * repainted to match — the one place in the app that overrides the tooltip
 * surface, and the reason `IconTooltip` takes a className at all.
 */
export function AnnotationBarTooltip({
  label,
  children,
}: {
  label: string
  children: ReactElement
}) {
  return (
    <IconTooltip
      label={label}
      side="top"
      sideOffset={8}
      className="rounded-md bg-annotation-chrome px-2 py-2 font-medium text-(--foreground-annotation-chrome) shadow-floating **:!bg-annotation-chrome **:!fill-annotation-chrome"
    >
      {children}
    </IconTooltip>
  )
}
