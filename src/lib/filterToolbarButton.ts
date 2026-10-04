import { cn } from '@/lib/utils'

/**
 * Shared hover/active styling for view and path filter toolbar buttons.
 *
 * Both states take `border-muted`, the named rung. They used to be
 * `border-border/60` and `border-border/50` — two hand-tuned alphas, 4.88% and
 * 4.06%, standing 0.8 of a percentage point apart and carrying the whole
 * checked/unchecked distinction between them. `--border-muted` is tuned in
 * `semantic.css` to land on the `/60` alpha exactly, so the checked edge is
 * pixel-identical and the unchecked one moves by less than a percent of
 * opacity. The state is legible from the plate, the shadow and the ring, none
 * of which is a rounding error.
 *
 * This file is why the raw-value guard now reads the whole of `src` rather
 * than `src/components/`: it carried the exact patterns that guard forbids, in
 * a directory the guard did not look at.
 */
export function filterToolbarButtonClass(checked: boolean, className?: string) {
  return cn(
    'inline-flex h-8 items-center gap-2 rounded-lg border border-muted px-3 text-sm font-medium transition-all ease-arrive motion-reduce:transition-none duration-(--motion-fade)',
    checked
      ? 'bg-card text-foreground shadow-sm ring-1 ring-black/[0.04]'
      : 'bg-muted/40 text-foreground hover:bg-muted/80',
    className,
  )
}
