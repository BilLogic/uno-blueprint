import { Info } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'

/**
 * The no-database trial's one piece of chrome. One line — what the agent is
 * reading and what it cannot do — with the rest behind the ⓘ. No alarm
 * colour: nothing is wrong here; this is the template working without a backend.
 *
 * Inline rather than a flex row: the panel narrows to a few hundred pixels,
 * and a sentence that reflows is still one line of copy, where a truncated
 * one is a line that no longer says anything.
 */
export function AgentTrialBanner() {
  return (
    <div
      data-agent-trial-banner
      className="shrink-0 border-b border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-medium text-foreground">Sample data, read-only.</span>{' '}
      Connect a database to author.{' '}
      <IconTooltip
        label="No database is configured, so the agent reads the template's bundled sample blueprint and is registered with read tools only."
        side="bottom"
      >
        <button
          type="button"
          aria-label="Why the agent is read-only here"
          className="inline-flex translate-y-[0.15em] rounded-md text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Info className="size-3" aria-hidden />
        </button>
      </IconTooltip>
    </div>
  )
}
