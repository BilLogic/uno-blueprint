import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useId, type MouseEvent } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { useScenarioBoardInScope } from '@/contexts/scenarioBoardScopeContext'
import { cellJumpTarget, useJumpToCell } from '@/hooks/useJumpToCell'
import type { CrossPathLink } from '@/lib/crossPathLinks'
import { cn } from '@/lib/utils'

/** The far cell's first line, short enough for a tooltip row. */
function firstLine(content: string): string {
  const line = content.trim().split('\n')[0]?.trim() ?? ''
  return line.length <= 72 ? line : `${line.slice(0, 69)}…`
}

/**
 * One cross-path link, as a small button on the cell's lower edge: "Continues in …"
 * where the link leaves, "Comes from …" where it arrives. It is where the
 * arrow would have been, had the far end been on this board, and it goes
 * there: a click or Enter selects the far cell and brings the camera to it.
 *
 * A sibling of the cell's own button rather than a child of it — a button
 * inside a button is not a button to a keyboard or a screen reader — so it
 * tabs in its own turn and its click never reaches the cell. Without an
 * editor to navigate with it still names the far end, and does nothing else.
 */
function CrossPathLinkButton({ link }: { link: CrossPathLink }) {
  const jump = useJumpToCell()
  const detailId = useId()
  const Icon = link.direction === 'out' ? ArrowRight : ArrowLeft
  const preview = firstLine(link.other.content)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // The scenario panel behind the board navigates on click; this one is
    // already a navigation.
    event.stopPropagation()
    jump?.(cellJumpTarget(link.other.id, link.other))
  }

  const button = (
    <button
      type="button"
      data-cross-path-link={link.direction}
      data-cross-path-target={link.other.id}
      aria-disabled={jump ? undefined : true}
      // The label says which way and where; the line under it says exactly
      // where — path, scenario and phase — for a reader who cannot hover.
      aria-describedby={detailId}
      className={cn(
        'pointer-events-auto inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm border border-border-primary bg-surface-primary px-2 py-1 text-xs font-medium text-on-surface-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        jump ? 'cursor-pointer hover:underline' : 'cursor-default',
      )}
      onClick={handleClick}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{link.label}</span>
    </button>
  )

  return (
    <>
      <span id={detailId} className="sr-only">
        {link.placeDetail}
      </span>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent
          side="bottom"
          className="flex max-w-72 flex-col items-start gap-1 text-left"
        >
          {preview ? <span>{preview}</span> : null}
          <span className="text-muted-foreground">{link.placeDetail}</span>
        </TooltipContent>
      </Tooltip>
    </>
  )
}

/**
 * Every cross-path link on one cell, straddling its lower edge, right-aligned
 * — the corner an outgoing arrow would leave from. Positioned over the shell's
 * own bottom inset, so it changes no row height and moves no cell.
 *
 * Drawn only where the cell itself is live: on the scenario board the detail
 * view is scoped to. In the overview and the phase rows cells are inert —
 * a click there opens the scenario rather than a cell — and a live button on
 * an inert cell at a sliver of the zoom would be the one control on the board
 * that does something different from everything around it. So there the
 * marker is not drawn at all, the same gate the axis headers use.
 *
 * @param insetY - The shell's vertical inset, which is where the face ends.
 */
export function CrossPathLinkMarkers({
  links,
  insetY,
}: {
  links: readonly CrossPathLink[]
  insetY: number
}) {
  const detail = useBlueprintCellDetailOptional()
  const inScope = useScenarioBoardInScope()
  if (links.length === 0 || !detail?.enabled || !inScope) return null
  return (
    <div
      data-cross-path-links=""
      className="pointer-events-none absolute inset-x-6 z-2 flex translate-y-1/2 justify-end gap-1"
      style={{ bottom: insetY }}
    >
      {links.map((link) => (
        <CrossPathLinkButton key={link.dependencyId} link={link} />
      ))}
    </div>
  )
}
