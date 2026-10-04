import type { CSSProperties } from 'react'
import { EntityDefinitionPopover } from '@/components/blueprint/EntityDefinitionPopover'
import { Badge } from '@/components/ui/badge'
import { PATH_KIND_COLORS } from '@/lib/pathKindTheme'
import { getBlueprintFillStyle } from '@/lib/pathColorTheme'
import { cn } from '@/lib/utils'
import type { PathKind } from '@/types/database'

type ScenarioTitleBadgeProps = {
  name: string
  summary?: string | null
  className?: string
  style?: CSSProperties
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** When set, badge matches path-type outline color (e.g. happy path on overview). */
  pathKind?: PathKind
  /** Panel chrome badge — darker gray from label rail, not primary/black. */
  tone?: 'default' | 'panel' | 'phase'
  /**
   * A further note about this instance — the parallel-scenario aside.
   *
   * It rides inside the same definition card as the name and the kind, rather
   * than on its own ⓘ: one glyph cannot mean both "opens the panel" and "an
   * aside", and this note is a fact about the same label.
   */
  note?: string | null
}

/**
 * The scenario's — or the phase's — name, and what that kind of thing IS.
 *
 * One badge for two kinds because they are the same object on the board: the
 * label of a container, printed on the container's own edge. `tone="phase"`
 * puts it on a phase frame and the kind follows from that, so the popover says
 * Phase over a phase and Scenario over a scenario, and neither has to be
 * passed twice.
 *
 * The explanation is a POPOVER rather than a tooltip: a tooltip never opens on
 * touch, so on a phone this badge would explain nothing at all. The name
 * carries its definition, its own summary, and — where there is one — the
 * parallel note, on hover, on focus and on tap.
 */
export function ScenarioTitleBadge({
  name,
  summary,
  className,
  style,
  side = 'top',
  pathKind,
  tone = 'default',
  note,
}: ScenarioTitleBadgeProps) {
  const pathAccent = pathKind ? PATH_KIND_COLORS[pathKind] : undefined
  const panelTone = tone === 'panel' && !pathKind
  const phaseTone = tone === 'phase' && !pathKind

  return (
    <EntityDefinitionPopover
      kind={tone === 'phase' ? 'phase' : 'scenario'}
      description={summary}
      name={name}
      showDescription
      note={note}
      side={side}
    >
      <Badge
        data-blueprint-fill={pathAccent ? '' : undefined}
        data-scenario-panel-title-badge={panelTone ? '' : undefined}
        data-phase-title-badge={phaseTone ? '' : undefined}
        // A container's title sits ON the container's edge, so it hugs its
        // text rather than holding the default size's 20px.
        size="fitted"
        className={cn(
          'max-w-full gap-1 overflow-visible border-transparent',
          className,
        )}
        style={{
          ...style,
          ...(pathAccent
            ? {
                ...getBlueprintFillStyle(pathAccent),
                borderColor: pathAccent,
              }
            : undefined),
        }}
      >
        <span
          className={cn(
            // geometry: packs the name into the badge's fixed height.
            'min-w-0 truncate leading-none',
            // The phase tone is a small label, and a small label is set at
            // letter-spacing 0. The scenario name keeps its tight heading set.
            phaseTone ? 'tracking-normal' : 'tracking-tight',
          )}
        >
          {name}
        </span>
      </Badge>
    </EntityDefinitionPopover>
  )
}
