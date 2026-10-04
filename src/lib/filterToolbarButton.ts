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
 * opacity.
 *
 * The checked state is carried by the plate and the hot edge step
 * (`border-stronger`); hover lifts an unchecked button to the hover step. It
 * used to lean on a `shadow-sm` and a `ring-black/[0.04]`, but a button sits
 * in its toolbar rather than floating over it, and a shadow is for what
 * floats.
 *
 * This file is why the raw-value guard now reads the whole of `src` rather
 * than `src/components/`: it carried the exact patterns that guard forbids, in
 * a directory the guard did not look at.
 */
export function filterToolbarButtonClass(checked: boolean, className?: string) {
  return cn(
    'inline-flex h-8 items-center gap-2 rounded-lg border border-muted px-3 text-sm font-medium transition-all duration-200',
    checked
      ? 'border-stronger bg-card text-foreground'
      : 'bg-muted/40 text-foreground hover:border-strong hover:bg-muted/80',
    className,
  )
}
