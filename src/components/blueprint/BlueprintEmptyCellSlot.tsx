import { getCellShellInsetY } from '@/lib/blueprintLayout'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import { Plus } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useAtScenarioLevel } from '@/contexts/EditorContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { cn } from '@/lib/utils'

/**
 * An empty square, in Edit mode, as somewhere a cell can go.
 *
 * The `+` is revealed on hover rather than drawn permanently, and that is the
 * whole design of this component. A blueprint is a few hundred squares and most
 * of them are empty; a grid of plus signs would be unreadable, and a square
 * that writes a row on any stray click would fire constantly while panning and
 * picking.
 *
 * The click opens the detail panel on a **draft** — the same form every cell
 * is edited with, pre-addressed to this slot. Nothing is written until Save;
 * a cancelled draft never touches the database. (An earlier version created
 * the row first and asked for text later, which wrote invisible empty cells.)
 */
export function BlueprintEmptyCellSlot({
  pathId,
  laneId,
  stepId,
  laneName,
  laneRole,
  stepName,
  stepIndex,
  scenarioName,
  phaseName,
  width,
  minHeight,
  selfStretch = false,
  compact = false,
}: {
  pathId: string
  laneId: string
  stepId: string
  laneName: string
  /** Carried onto the draft, so the new cell is measured by the lane's role. */
  laneRole: string | null
  stepName: string
  stepIndex: number
  scenarioName?: string
  phaseName?: string
  width: number
  /** Single-path grid sizes rows explicitly; the compare grid stretches. */
  minHeight?: number
  selfStretch?: boolean
  compact?: boolean
}) {
  const mode = useCanvasModeValue()
  const { client, canWrite } = useSupabase()
  const atScenarioLevel = useAtScenarioLevel()
  const detail = useBlueprintCellDetailOptional()

  const style = {
    width,
    minWidth: width,
    maxWidth: width,
    ...(minHeight === undefined ? {} : { minHeight }),
  }
  const stretch = selfStretch ? 'self-stretch' : ''

  if (stepId === STRUCTURE_PLACEHOLDER_ID || laneId === STRUCTURE_PLACEHOLDER_ID) return <div data-structure-placeholder="" data-step-index={stepIndex} className={cn('shrink-0 rounded-md',stretch)} style={style} />

  if (
    mode !== 'design' ||
    !canWrite ||
    !client ||
    !atScenarioLevel ||
    !detail
  ) {
    return <div aria-hidden className={cn('shrink-0', stretch)} style={style} />
  }

  return (
    <IconTooltip label="Add a cell here">
      <button
        type="button"
        aria-label="Add a cell here"
        onClick={(event) => {
          event.stopPropagation()
          detail.openDraftCell({
            pathId,
            laneId,
            stepId,
            laneName,
            laneRole,
            stepName,
            stepIndex,
            scenarioName,
            phaseName,
          })
        }}
        data-blueprint-empty-slot=""
        data-step-index={stepIndex}
        className={cn(
          'group/slot relative shrink-0 appearance-none rounded-md border-0 bg-transparent p-0',
          stretch,
          'grid place-items-center transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
          'focus-visible:outline-none',
        )}
        style={style}
      >
        <span
          aria-hidden
          data-blueprint-empty-preview=""
          style={{inset:getCellShellInsetY(compact)}}
          className="pointer-events-none absolute grid place-items-center rounded-md bg-wash-primary opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/slot:opacity-100 group-focus-visible/slot:opacity-100"
        >
          <Plus className="size-4 text-text-primary" />
        </span>
      </button>
    </IconTooltip>
  )
}
