import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useJumpToCell } from '@/hooks/useJumpToCell'
import type { CrossPathLink } from '@/lib/crossPathLinks'
import { cn } from '@/lib/utils'

/** The far cell's first line, short enough for a tooltip row. */
function firstLine(content: string): string {
  const line = content.trim().split('\n')[0]?.trim() ?? ''
  return line.length <= 72 ? line : `${line.slice(0, 69)}…`
}

/** Where the far end sits, the way the panel names it. */
function placeDetail(link: CrossPathLink): string {
  const { other } = link
  return [other.pathName, other.scenarioName, other.phaseName]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
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
  const Icon = link.direction === 'out' ? ArrowRight : ArrowLeft
  const preview = firstLine(link.other.content)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // The scenario panel behind the board navigates on click; this one is
    // already a navigation.
    event.stopPropagation()
    jump?.({
      cellId: link.other.id,
      pathId: link.other.pathId,
      scenarioId: link.other.scenarioId,
    })
  }

  const button = (
    <button
      type="button"
      data-cross-path-link={link.direction}
      data-cross-path-target={link.other.id}
      aria-disabled={jump ? undefined : true}
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
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent
        side="bottom"
        className="flex max-w-72 flex-col items-start gap-1 text-left"
      >
        {preview ? <span>{preview}</span> : null}
        <span className="text-muted-foreground">{placeDetail(link)}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Every cross-path link on one cell, straddling its lower edge, right-aligned
 * — the corner an outgoing arrow would leave from. Positioned over the shell's
 * own bottom inset, so it changes no row height and moves no cell.
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
  if (links.length === 0) return null
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
