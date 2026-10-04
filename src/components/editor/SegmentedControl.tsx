import type { ComponentProps } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/**
 * The track-and-raised-square segmented control — one control with N
 * positions, exactly one of them on. The inset track and shared gutter are
 * what say "these are one control", and the active segment is a raised
 * white square (background + shadow) whose accent lives in its content,
 * not a filled brand button.
 *
 * A literal tint rather than `bg-muted` for the track: these controls sit
 * on `bg-card` surfaces, which resolves to the same near-white, so the
 * token left the track invisible and the segments looked like loose
 * buttons.
 *
 * Composes `ui/toggle-group` (base-ui), which brings role="group",
 * `aria-pressed` on each segment, and arrow-key roving focus for free.
 * Single-select is enforced here: base-ui's single mode allows
 * deselect-to-empty, but a mode switch always has a mode, so an empty
 * change is ignored.
 */
export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  className,
  ...props
}: Omit<
  ComponentProps<typeof ToggleGroup>,
  'value' | 'defaultValue' | 'onValueChange' | 'multiple'
> & {
  value: V
  onValueChange: (value: V) => void
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const nextValue = next[0] as V | undefined
        if (nextValue !== undefined && nextValue !== value) {
          onValueChange(nextValue)
        }
      }}
      className={cn(
        'shrink-0 gap-1 rounded-lg bg-accent p-1',
        className,
      )}
      {...props}
    />
  )
}

/**
 * One segment. Resting segments are quiet text on the track; the pressed
 * one is the raised square. Sizing (`h-6`/`px-2`/`text-xs`) is the
 * shared vocabulary — call sites only override geometry (icon-only
 * squares, tighter padding), never the on/off treatment.
 */
export function SegmentedControlItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupItem>) {
  return (
    <ToggleGroupItem
      className={cn(
        'h-6 min-w-0 gap-2 rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors',
        'hover:bg-transparent hover:text-foreground',
        'aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm aria-pressed:hover:bg-background aria-pressed:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
