import type { ReactElement, ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The app's one wrapper for "this button is only an icon, so it has to say
 * what it does".
 *
 * Before this there were five local re-implementations of the identical four
 * lines (`RailButton`, `ToolButton`, `StrokeWeightButton`,
 * `AnnotationBarTooltip`, the sidebar's row action) and roughly fifty icon
 * buttons with no tooltip at all — a dozen of them making do with a native
 * `title`, which arrives after a second, in the browser's font, and cannot be
 * styled or positioned.
 *
 * Two rules, both non-optional:
 *
 * 1. **The child keeps its own `aria-label`.** A tooltip is not an accessible
 *    name, and in `@base-ui/react` 1.7.0 — the version pinned alongside this
 *    file — it is not anything else in the accessibility tree either. Read
 *    from the package rather than assumed: no part of the tooltip sets `role="tooltip"`, no
 *    part wires an `aria-describedby` from the trigger back to the popup, and
 *    the only props the popup contributes of its own are `tabIndex={-1}` and
 *    a data attribute. So the popup is a picture. Whatever is in the DOM is
 *    the whole of what a screen reader is handed, which is why the label
 *    stays on the button — and why prose that only a tooltip carries needs a
 *    visually hidden companion in the DOM beside it.
 *
 *    It DOES open for a keyboard, so nothing has to be built for that.
 *    `TooltipTrigger` wires `useFocus` alongside its hover interaction, gated
 *    on `:focus-visible`, and a reader who tabs to the trigger gets the popup
 *    without hovering anything. What has to be checked instead is that the
 *    trigger is the focusable element: `render` makes the CHILD the trigger,
 *    so a child that cannot take focus has nothing to open the popup from.
 *    The hover half is `mouseOnly` and a touch screen opens nothing at all —
 *    the third reader the companion is for. All of this is a fact about a
 *    dependency rather than about this file, so re-read the trigger and popup
 *    sources before carrying it across an upgrade.
 * 2. **Say what it does, not what it is.** "Start a new session", not
 *    "Plus". The existing copy sets the register: "New scenario in
 *    Post-session" or a control's accessible name — action phrases,
 *    never a restated label.
 *
 * No `TooltipProvider` is needed — one is mounted app-wide in `App.tsx` at a
 * 600 ms delay, without instant reopening between neighbours. Independently
 * mounted rails and toolbars keep the same dwell in their local providers.
 */
export function IconTooltip({
  label,
  side = 'top',
  sideOffset,
  className,
  children,
}: {
  /** What the button does. Also belongs on the child as `aria-label`. */
  label: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  /**
   * Only for surfaces that are not the app surface — the floating annotation
   * bars sit on their own dark plane and repaint the popup AND its arrow to
   * match (`**:` selectors). Everywhere else, leave it: one tooltip look.
   */
  className?: string
  /** Exactly one element — it becomes the trigger, not a wrapper around it. */
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        className={cn('text-xs', className)}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
