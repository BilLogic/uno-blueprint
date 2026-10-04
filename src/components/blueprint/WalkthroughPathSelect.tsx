import { ChevronDown } from 'lucide-react'
import { PathSummaryTooltip } from '@/components/blueprint/PathSummaryTooltip'
import { PathLabelBadge } from '@/components/blueprint/PathLabelBadge'
import { PathKindColorKey } from '@/components/blueprint/PathKindColorKey'
import { formatPathPickerLabel } from '@/components/blueprint/PathMultiSelect'
import { StatusBadge } from '@/components/blueprint/StatusBadge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getPathBadgeStyle } from '@/lib/pathColorTheme'
import { cn } from '@/lib/utils'
import type { BlueprintData } from '@/types/blueprint'

type WalkthroughPathSelectProps = {
  blueprints: BlueprintData[]
  value: string
  onChange: (pathId: string) => void
  className?: string
}

/** Path picker inside the walkthrough, showing each path's badge colour. */
export function WalkthroughPathSelect({
  blueprints,
  value,
  onChange,
  className,
}: WalkthroughPathSelectProps) {
  const selected = blueprints.find((blueprint) => blueprint.path.id === value)

  if (!selected) return null

  if (blueprints.length <= 1) {
    return (
      <PathLabelBadge
        name={selected.path.name}
        summary={selected.path.summary}
        pathKind={selected.path.kind}
        compact
        className={className}
      />
    )
  }

  const selectedLabel = formatPathPickerLabel(selected.path.name)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-blueprint-fill
        className={cn(
          'inline-flex h-auto max-w-full cursor-pointer items-center gap-2 rounded-full border-0 px-2 py-1 text-xs font-medium outline-none transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50',
          className,
        )}
        style={getPathBadgeStyle({
          kind: selected.path.kind,
          name: selected.path.name,
        })}
        aria-label={`Path: ${selectedLabel}. Choose a different path.`}
      >
        <PathKindColorKey
          type={selected.path.kind}
          name={selected.path.name}
        />
        {/* geometry: packs the name into the trigger's fixed height. */}
        <span className="truncate leading-none tracking-tight">{selectedLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (nextValue) onChange(nextValue)
          }}
        >
          {blueprints.map((blueprint) => {
            const label = formatPathPickerLabel(blueprint.path.name)
            return (
              <DropdownMenuRadioItem
                key={blueprint.path.id}
                value={blueprint.path.id}
              >
                <PathKindColorKey
                  type={blueprint.path.kind}
                  name={blueprint.path.name}
                />
                <PathSummaryTooltip
                  summary={blueprint.path.summary}
                  pathName={blueprint.path.name}
                  side="right"
                >
                  <span className="truncate">{label}</span>
                </PathSummaryTooltip>
                <StatusBadge
                  status={blueprint.path.status}
                  definition={false}
                />
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
