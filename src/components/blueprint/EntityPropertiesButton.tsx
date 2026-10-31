import { useCellPick } from '@/contexts/cellPickContext'
import { clickOpensDetail } from '@/lib/cellPickGrammar'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/editor/IconTooltip'
import {
  useEntityDetail,
  type EntityDetailKind,
} from '@/contexts/EntityDetailContext'
import { cn } from '@/lib/utils'

const KIND_LABELS: Record<EntityDetailKind, string> = {
  service: 'Service properties',
  lane: 'Lane properties',
  phase: 'Phase properties',
  scenario: 'Scenario properties',
  step: 'Step properties',
}

/**
 * The ⓘ that opens an entity's properties. One component for every level,
 * so the affordance reads as one family and nobody has to learn it twice.
 *
 * The label identifies which entity opens. In Make slice, Cmd/Ctrl-click
 * opens properties without changing membership; ordinary clicks stay with
 * the active selection tool.
 *
 * ALWAYS VISIBLE, and that is a settled decision rather than a style choice.
 * It carried a `revealOnHover` mode — transparent at rest, drawn on hover —
 * which no caller ever used and which no touch reader could ever have seen. ⓘ
 * means "opens the panel" everywhere in this app now, and a signifier a reader
 * cannot see is not a signifier.
 */
export function EntityPropertiesButton({
  kind,
  id,
  name,
  className,
}: {
  kind: EntityDetailKind
  id: string
  /** Named in the accessible label — several of these can share one screen. */
  name: string
  className?: string
}) {
  const pick = useCellPick()
  const { toggleEntity, openEntity } = useEntityDetail()
  const label = KIND_LABELS[kind]
  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        // The tooltip says what it does; this says which one. "Lane
        // properties" five times over tells a screen-reader user nothing.
        aria-label={`${label}: ${name}`}
        className={cn(
          'size-6 shrink-0 text-tertiary-foreground hover:text-foreground',
          className,
        )}
        onClick={(event) => {
          // The label rail's lane button, the phase section and the canvas all
          // listen above this: opening a panel is not a selection, not a
          // navigation and not a pan.
          event.stopPropagation()
          if (pick?.plainClick && !clickOpensDetail(event)) return
          if (clickOpensDetail(event)) openEntity({ kind, id })
          else toggleEntity({ kind, id })
        }}
      >
        <Info className="size-3.5" />
      </Button>
    </IconTooltip>
  )
}
