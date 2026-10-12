import { describe, expect, it } from 'vitest'
import type { TranscriptEvent } from '@/lib/agent/loop'
import { REPEAT_READ_SUPPRESSED } from '@/lib/agent/tools/refusals'
import { blockTranscript } from '@/components/editor/agent/transcriptBlocks'

/*
 * A run of folded steps says it holds an error when a call in it failed, and
 * a suppressed repeat is not a failure — the loop answered it instead of
 * running it — however the row was persisted.
 */

const step = (event: Partial<Extract<TranscriptEvent, { kind: 'tool' }>>): TranscriptEvent => ({
  kind: 'tool',
  name: 'get_blueprint',
  summary: '3 paths',
  isError: false,
  ...event,
})

describe('a run of steps counts its failures', () => {
  it('holds an error when a call in it failed', () => {
    expect(blockTranscript([step({}), step({ isError: true, summary: 'No cell' }), step({})])).toEqual([
      { kind: 'steps', start: 0, end: 2, hasError: true },
    ])
  })

  it('holds none for a suppressed repeat, flagged or persisted before the flag', () => {
    const events = [
      step({}),
      step({ summary: REPEAT_READ_SUPPRESSED, suppressed: true }),
      step({ summary: REPEAT_READ_SUPPRESSED, isError: true }),
    ]
    expect(blockTranscript(events)).toEqual([{ kind: 'steps', start: 0, end: 2, hasError: false }])
  })
})
