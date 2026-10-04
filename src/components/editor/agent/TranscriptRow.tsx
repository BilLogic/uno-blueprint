/**
 * One transcript row, built from the DS chat primitives: user turns are
 * tinted bubbles on the right, agent prose is a ghost bubble, tool calls
 * and status lines are Markers — the chat vocabulary shadcn ships, not a
 * hand-rolled lookalike.
 */
import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronRight, Pencil, Slash, XCircle } from 'lucide-react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Marker,
  MarkerContent,
  MarkerIcon,
  markerVariants,
} from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import { type TranscriptEvent } from '@/lib/agent/loop'
import { cn } from '@/lib/utils'

/*
 * Lazy: AgentMarkdown is the only importer of react-markdown's unified
 * toolchain, and transcripts only render once the agent surface is open —
 * no reason for the landing page to pay for a markdown parser. The fallback
 * is the raw text, so a slow chunk shows content, not a spinner.
 */
const AgentMarkdownLazy = lazy(() =>
  import('@/components/editor/AgentMarkdown').then((m) => ({
    default: m.AgentMarkdown,
  })),
)

/**
 * The turn as the agent wrote it, unparsed. One element, used twice: it is
 * what a reader sees while the chunk is in flight and what they see if it
 * never lands, and the two must be the same thing or the second would be a
 * second design nobody looks at.
 */
function RawTurn({ text, className }: { text: string; className?: string }) {
  return <p className={cn('whitespace-pre-wrap', className)}>{text}</p>
}

/**
 * A missing chunk costs the markdown, not the transcript.
 *
 * A tab that outlived a deploy asks for a chunk the new build no longer
 * ships and the import REJECTS — which Suspense does not cover: its fallback
 * is for a promise still pending, so the rejection travels up as a render
 * throw. The nearest boundary is the editor-wide `EditorErrorBoundary`, so
 * one missing markdown chunk used to cost the whole editor — and its "Try
 * again" re-renders into the same permanently rejected import. React error
 * boundaries are still class-only.
 */
class MarkdownChunkBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[agent] markdown renderer unavailable:', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function AgentMarkdown(props: { text: string; className?: string }) {
  const raw = <RawTurn {...props} />
  return (
    <MarkdownChunkBoundary fallback={raw}>
      <Suspense fallback={raw}>
        <AgentMarkdownLazy {...props} />
      </Suspense>
    </MarkdownChunkBoundary>
  )
}

type ToolEvent = Extract<TranscriptEvent, { kind: 'tool' }>
type DeclinedEvent = Extract<TranscriptEvent, { kind: 'declined' }>

/**
 * What a declined skill reads as: the token as typed, then the skill that did
 * not run. In that order, because the token is the thing a reader can find
 * again in the message above it, and the skill name is the news.
 *
 * A FACT, NOT A COMPLAINT. Nothing here went wrong — a reader was offered a
 * skill and said no, which is one of the two answers the offer has. So the
 * sentence states what happened, in the past tense, and stops: no "instead",
 * no advice, no second invitation. The composer's notice already made the
 * case for running it and has been answered; making it again down here would
 * be arguing with a decision.
 */
function declinedLine(misses: DeclinedEvent['misses']): string {
  const tokens = misses.map((miss) => `“/${miss.token}”`).join(' and ')
  const labels = misses.map((miss) => miss.label).join(' and ')
  return misses.length === 1
    ? `${tokens} was sent as text — ${labels} did not run.`
    : `${tokens} were sent as text — ${labels} did not run.`
}

/** One labelled payload block inside an opened tool row. */
function ToolDetail({ label, body }: { label: string; body: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow>
        {label}
      </Eyebrow>
      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted px-2 py-2 font-mono text-xs whitespace-pre-wrap text-foreground">
        {body}
      </pre>
    </div>
  )
}

/**
 * A tool call. Collapsed it is the same quiet one-liner it always was; open
 * it shows the arguments the agent sent and what came back — the same
 * disclosure vocabulary as the folded steps block, so a reviewer only has
 * to learn one gesture. Rows rehydrated from a previous browser session carry
 * no payload and stay flat.
 */
function ToolRow({ event }: { event: ToolEvent }) {
  const [open, setOpen] = useState(false)
  const expandable = Boolean(event.args || event.result)
  const face = (
    <>
      <MarkerIcon>
        {event.isError ? (
          <XCircle aria-hidden />
        ) : (
          <CheckCircle2 aria-hidden />
        )}
      </MarkerIcon>
      <MarkerContent className={cn(!open && 'truncate')}>
        <span className="font-mono">{event.name}</span>
        {event.summary ? (
          <span className="ml-2 text-muted-foreground">{event.summary}</span>
        ) : null}
      </MarkerContent>
    </>
  )

  if (!expandable) {
    return (
      <Marker className={cn(event.isError && 'text-destructive')}>
        {face}
      </Marker>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className={cn(
              markerVariants({ variant: 'default' }),
              'cursor-pointer rounded-md transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              event.isError && 'text-destructive',
            )}
          >
            {face}
            <ChevronRight
              className={cn(
                'ml-auto size-3 shrink-0 opacity-60 transition-transform duration-(--motion-micro) ease-move motion-reduce:transition-none',
                open && 'rotate-90',
              )}
              aria-hidden
            />
          </button>
        }
      />
      <CollapsibleContent>
        <div className="mt-1 ml-6 flex flex-col gap-2">
          {event.args ? <ToolDetail label="Arguments" body={event.args} /> : null}
          {event.result ? (
            <ToolDetail label="Result" body={event.result} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function TranscriptRow({
  event,
}: {
  event: TranscriptEvent
}) {
  switch (event.kind) {
    case 'user': {
      // Every skill the message invoked, in the order it invoked them. A row
      // an earlier release persisted named one skill in a field of its own;
      // it arrives here as a list like any other, because the read settles
      // the shape (`loadPersistedEvents`) rather than leaving it to a row.
      const invokedSkills = event.skills ?? []
      return (
        <Message align="end">
          <MessageContent>
            {invokedSkills.length > 0 || event.attachmentLabel ? (
              <div className="mb-1 flex flex-wrap justify-end gap-1">
                {invokedSkills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="font-mono">
                    /{skill}
                  </Badge>
                ))}
                {event.attachmentLabel ? (
                  <Badge variant="outline">
                    <Pencil aria-hidden />
                    {event.attachmentLabel}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <Bubble variant="tinted">
              <BubbleContent className="whitespace-pre-wrap">
                {event.text}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    }
    case 'assistant':
      return (
        <Message>
          <MessageContent>
            <Bubble variant="ghost">
              <BubbleContent className="text-foreground">
                <AgentMarkdown text={event.text} />
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    case 'tool':
      return <ToolRow event={event} />
    case 'status':
      return (
        <Marker variant="separator" className="italic">
          <MarkerContent>{event.text}</MarkerContent>
        </Marker>
      )
    case 'declined':
      // A plain Marker in the muted voice every non-turn row speaks in —
      // NOT the destructive one a failed tool call wears, and no error
      // glyph. The slash is the shape of what happened: a token that looks
      // like an invocation and invoked nothing.
      return (
        <Marker>
          <MarkerIcon>
            <Slash aria-hidden />
          </MarkerIcon>
          <MarkerContent>{declinedLine(event.misses)}</MarkerContent>
        </Marker>
      )
  }
}
