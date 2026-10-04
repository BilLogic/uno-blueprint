import { cn } from '@/lib/utils'

/**
 * Shared hover/active styling for view and path filter toolbar buttons.
 *
 * Both states rest on `border-muted`, the named soft rung, where the edge
 * once sat on two hand-tuned alphas (`border-border/60` and `/50`). The
 * checked state is carried by the plate and the hot edge step
 * (`border-stronger`); hover lifts an unchecked button to the hover step
 * (`border-strong`). It used to lean on a `shadow-sm` and a
 * `ring-black/[0.04]`, but a button sits in its toolbar rather than floating
 * over it, and a shadow is for what floats.
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
