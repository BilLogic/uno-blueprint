import { Minus, Plus } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { cn } from '@/lib/utils'

type LaneCollapseToggleProps = {
  laneName: string
  collapsed: boolean
  onToggle: () => void
  className?: string
}

/** Expand/collapse control for a swim lane, shown in the label rail. */
export function LaneCollapseToggle({
  laneName,
  collapsed,
  onToggle,
  className,
}: LaneCollapseToggleProps) {
  return (
    <IconTooltip
      label={
        collapsed
          ? `Expand the ${laneName} lane`
          : `Collapse the ${laneName} lane`
      }
    >
      <button
        type="button"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-muted/80 hover:text-foreground',
          className,
        )}
        data-print-hide
        aria-expanded={!collapsed}
        aria-label={
          collapsed ? `Expand ${laneName} lane` : `Collapse ${laneName} lane`
        }
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {collapsed ? (
          <Plus className="size-3.5" aria-hidden />
        ) : (
          <Minus className="size-3.5" aria-hidden />
        )}
      </button>
    </IconTooltip>
  )
}
