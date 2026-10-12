import { type TranscriptEvent } from '@/lib/agent/loop'
import { isFailedRow } from '@/lib/agent/tools/refusals'

/**
 * Transcript grouping (2026-08-17): a finished run's tool/status rows fold
 * into one "N steps" accordion — a long build otherwise leaves a wall of
 * upsert_cell rows between the question and the answer. Rules: only runs of
 * ≥3 consecutive step rows fold; the LIVE tail never folds (streaming stays
 * visible); a run containing an error starts open — collapsing a failure
 * would hide the thing that most needs reading.
 */
export type TranscriptBlock =
  | { kind: 'event'; index: number }
  | TranscriptStepsRun

/** A folded run: the half-open span of step rows, and whether one failed. */
export type TranscriptStepsRun = {
  kind: 'steps'
  start: number
  end: number
  hasError: boolean
}

const MIN_FOLDED_STEPS = 3

export function blockTranscript(events: TranscriptEvent[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = []
  let runStart = -1
  let runHasError = false
  const flush = (end: number) => {
    if (runStart === -1) return
    if (end - runStart >= MIN_FOLDED_STEPS) {
      blocks.push({
        kind: 'steps',
        start: runStart,
        end: end - 1,
        hasError: runHasError,
      })
    } else {
      for (let i = runStart; i < end; i += 1)
        blocks.push({ kind: 'event', index: i })
    }
    runStart = -1
    runHasError = false
  }
  events.forEach((event, index) => {
    const isStep = event.kind === 'tool' || event.kind === 'status'
    if (isStep) {
      if (runStart === -1) runStart = index
      if (
        (event.kind === 'tool' && isFailedRow(event)) ||
        (event.kind === 'status' && /error/i.test(event.text))
      )
        runHasError = true
      return
    }
    flush(index)
    blocks.push({ kind: 'event', index })
  })
  flush(events.length)
  return blocks
}
