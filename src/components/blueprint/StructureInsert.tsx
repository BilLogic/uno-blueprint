import { Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** The same short gap target on both axes; its hit area never spans the grid. */
export function StructureInsert({
  orientation,
  label,
  style,
  onClick,
}: {
  orientation: 'horizontal' | 'vertical'
  label: string
  style?: CSSProperties
  onClick: (opener: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      style={style}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event.currentTarget)
      }}
      className={cn(
        'group/structure-insert pointer-events-auto absolute flex items-center justify-center rounded-md text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        orientation === 'horizontal'
          ? 'h-6 w-16 -translate-x-1/2 -translate-y-1/2'
          : 'h-16 w-6 -translate-x-1/2 -translate-y-1/2',
      )}
    >
      <span
        aria-hidden
        className="flex size-full items-center justify-center opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/structure-insert:opacity-100 group-focus-visible/structure-insert:opacity-100 [@media(hover:none)]:opacity-40"
      >
        <span
          className={cn(
            'absolute bg-primary/60',
            orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
          )}
        />
        <span className="relative grid size-4 place-items-center rounded-full bg-background ring-1 ring-primary/60">
          <Plus className="size-3" />
        </span>
      </span>
    </button>
  )
}

export function StructurePlaceholder({
  kind,
  style,
}: {
  kind: 'lane' | 'step'
  style: CSSProperties
}) {
  return (
    <div
      role="status"
      aria-label={`New ${kind} position`}
      style={style}
      className="pointer-events-none absolute rounded-md border border-dashed border-primary bg-primary/5 px-2 py-1 text-xs text-text-primary"
    >
      New {kind}
    </div>
  )
}
