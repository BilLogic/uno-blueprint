import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { TranscriptRow } from '@/components/editor/agent/TranscriptRow'
import { type TranscriptStepsRun } from '@/components/editor/agent/transcriptBlocks'
import { type TranscriptEvent } from '@/lib/agent/loop'
import { cn } from '@/lib/utils'

/**
 * The fold itself: a finished run's step rows behind one "N steps" line.
 * The rules it enforces are in `transcriptBlocks`, which decides WHICH rows
 * fold; this decides what the fold looks like and starts open on a failure.
 */
export function TranscriptStepsBlock({
  events,
  run,
}: {
  events: TranscriptEvent[]
  /** The run to fold, as `blockTranscript` decided it — not its three
      fields taken apart and handed over one at a time. */
  run: TranscriptStepsRun
}) {
  const { start, end, hasError } = run
  // Errors start open — the fold must never hide a failure.
  const [open, setOpen] = useState(hasError)
  const count = end - start + 1
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/steps flex w-full items-center gap-2 rounded-md py-1 text-left text-xs text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 transition-transform ease-move duration-(--motion-fade) motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <span>
          {count} steps{hasError ? ' — one failed' : ''}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3 pl-1">
          {events.slice(start, end + 1).map((event, offset) => (
            <TranscriptRow key={start + offset} event={event} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
