import type { TranscriptEvent } from '@/lib/agent/loop'
import { isFailedRow } from '@/lib/agent/tools/refusals'

/**
 * One transcript event as the line an agent reads it on.
 *
 * NO DEFAULT CASE, on purpose. This was an if-chain ending in a line that
 * printed the kind alone, and that ending was not a decision about the kinds
 * it caught — it was whatever nobody had spelled out. `status` fell into it
 * and reached the model as the bare word "status:", its text dropped.
 *
 * Every kind the transcript has carries words, so every kind is spelled out
 * and there is nothing left for a fallback to be right about. Were a kind
 * ever added that genuinely says nothing, its bare-kind line belongs here as
 * a case like the rest — a stated choice rather than a catch-all standing in
 * for one. The declared `string` return is what makes that somebody's problem
 * at compile time rather than a reader's at read time: a sixth member of the
 * union leaves a path returning nothing, and the build says so.
 */
export function renderTranscriptLine(event: TranscriptEvent): string {
  switch (event.kind) {
    case 'user':
      return `user: ${event.text}`
    case 'assistant':
      return `assistant: ${event.text}`
    case 'tool':
      return `tool ${event.name}${isFailedRow(event) ? ' (error)' : ''}: ${event.summary}`
    case 'status':
      return `status: ${event.text}`
    // The row whose whole point is that a later reader — a person scrolling,
    // or this model reading a past session — does not have to infer from
    // prose that a skill was named and ran nothing.
    case 'declined':
      return `declined: ${event.misses
        .map((miss) => `"/${miss.token}" (nearly ${miss.label})`)
        .join(', ')} — sent as text, so no skill ran`
  }
}
