// @vitest-environment jsdom
/**
 * A SKILL NAMED AND NOT RUN LEAVES A ROW.
 *
 * The notice in the composer closed half of the grievance it was built for:
 * a reader who typed `/audit` and chose to send their sentence as prose was
 * told on screen that nothing ran, and the model was told in the prompt — but
 * the transcript kept no record. Scrolled back an hour later, or read by an
 * agent walking the session, the decision was gone: the only trace of it was
 * a token in a sentence, which is exactly the thing that reads as an
 * invocation.
 *
 * So the cases here are about the RECORD rather than the notice. What a send
 * leaves behind when the offer is declined, what it leaves behind when the
 * offer is taken (nothing — the invocation is its own evidence), and whether
 * what it left behind is still there after the tab has forgotten everything
 * it knew.
 *
 * The reload case is the one that needs care, and it is the reason this file
 * takes a client at all. Asserting on `useAgentRun` after a send proves the
 * row is in module memory and nothing else — the same pass a row written
 * nowhere would give. This one writes through a fake `agent_messages`,
 * forgets the run and its hydrate mark (`forgetAgentRun`, which is the seam
 * that exists for this), and reads the row back out of the table. If the
 * write never happened the table is empty and the transcript comes back
 * empty with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'

/** The scripted provider: one round, one sentence, no network. */
const provider = vi.hoisted(() => ({ rounds: 0 }))
vi.mock('@/lib/agent/providers/anthropic', () => ({
  anthropicAdapter: {
    id: 'anthropic',
    chat: async () => {
      provider.rounds += 1
      return { parts: [{ type: 'text', text: 'Noted.' }], stopReason: 'end' }
    },
  },
}))

// jsdom has no matchMedia; the shell under test is the desktop one.
vi.mock('@/hooks/useMobileShell', () => ({ isMobileViewport: () => false }))

import {
  forgetAgentRun,
  hydrateAgentTranscript,
  sendToAgent,
  useAgentRun,
  type TranscriptEvent,
} from '@/lib/agent/loop'
import { AGENT_SKILL_COMMANDS } from '@/lib/agent/skills'
import { attachAgentPersistence } from '@/lib/agent/persistenceReadiness'
import { getSession } from '@/lib/agent/tools/browserHistory'
import { TranscriptRow } from '@/components/editor/agent/TranscriptRow'
import { blockTranscript } from '@/components/editor/agent/transcriptBlocks'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import type { AgentSettings } from '@/lib/agent/settings'

const SETTINGS: AgentSettings = {
  provider: 'anthropic',
  models: {},
  keys: { anthropic: 'test-key' },
}

type MessageRow = { session_id: string; seq: number; payload: unknown }

/**
 * `agent_messages` as a table in this process: what was upserted into it, and
 * a read that answers one session's rows in seq order — the two halves of
 * the round trip a reload makes, and nothing else. `agent_sessions` accepts
 * writes and answers nothing, which is all the auto-rename on the way past
 * needs.
 */
function fakeMessagesTable() {
  const rows: MessageRow[] = []
  const messages = {
    upsert: (row: MessageRow) => {
      rows.push(row)
      return Promise.resolve({ data: null, error: null })
    },
    select: () => ({
      eq: (_column: string, sessionId: string) => ({
        order: () =>
          Promise.resolve({
            data: rows
              .filter((row) => row.session_id === sessionId)
              .sort((a, b) => a.seq - b.seq)
              .map((row) => ({ payload: row.payload })),
            error: null,
          }),
      }),
    }),
  }
  const sessions = {
    upsert: () => Promise.resolve({ data: null, error: null }),
  }
  const client = {
    from: (table: string) => (table === 'agent_messages' ? messages : sessions),
  }
  return {
    rows,
    client: client as unknown as Parameters<typeof attachAgentPersistence>[0],
  }
}

let sessions = 0
/** One send on a session of its own, then the transcript the panel reads. */
const send = async (
  input: Omit<
    Parameters<typeof sendToAgent>[0],
    'sessionId' | 'offlineBoard' | 'settings' | 'contextNote' | 'client'
  > & { client?: Parameters<typeof sendToAgent>[0]['client'] },
) => {
  const sessionId = `declined-test-${(sessions += 1)}`
  await sendToAgent({
    client: null,
    ...input,
    sessionId,
    offlineBoard: PACKAGE_OFFLINE_BOARD,
    settings: SETTINGS,
    contextNote: '',
  })
  return {
    sessionId,
    events: renderHook(() => useAgentRun(sessionId)).result.current.events,
  }
}

const declined = (events: readonly TranscriptEvent[]) =>
  events.filter(
    (event): event is Extract<TranscriptEvent, { kind: 'declined' }> =>
      event.kind === 'declined',
  )

beforeEach(() => {
  provider.rounds = 0
  attachAgentPersistence(null)
})

afterEach(() => {
  attachAgentPersistence(null)
})

it('records the skill that was named and did not run', async () => {
  const { events } = await send({
    text: 'then /audit the intake',
    declaredMisses: [{ token: 'audit', label: '/ub:audit' }],
  })

  // Under the message it is about, not floating somewhere in the run.
  expect(events.map((event) => event.kind)).toEqual([
    'user',
    'declined',
    'assistant',
  ])
  expect(declined(events)[0]!.misses).toEqual([
    { token: 'audit', label: '/ub:audit' },
  ])
})

it('records every skill the message named and did not run, not the first', async () => {
  const { events } = await send({
    text: 'check /audit then /map this',
    declaredMisses: [
      { token: 'audit', label: '/ub:audit' },
      { token: 'map', label: '/ub:map' },
    ],
  })

  // One row carrying both, because one message declined both in one answer.
  expect(declined(events)).toHaveLength(1)
  expect(declined(events)[0]!.misses).toEqual([
    { token: 'audit', label: '/ub:audit' },
    { token: 'map', label: '/ub:map' },
  ])
})

it('records nothing when the skill RAN — the invocation is its own evidence', async () => {
  const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
  const { events } = await send({
    text: '/ub:audit the intake',
    skills: [audit],
  })

  expect(declined(events)).toEqual([])
  // And the evidence that IS there: the invocation on the turn itself.
  expect(events[0]).toMatchObject({ kind: 'user', skills: ['ub:audit'] })
})

it('leaves a message that names no skill alone', async () => {
  const { events } = await send({ text: 'what does the intake phase cover?' })

  expect(events.map((event) => event.kind)).toEqual(['user', 'assistant'])
})

it('brings the row back from the database after the tab forgets the session', async () => {
  const table = fakeMessagesTable()
  attachAgentPersistence(table.client)

  const { sessionId } = await send({
    text: 'then /audit the intake',
    declaredMisses: [{ token: 'audit', label: '/ub:audit' }],
  })
  // The write is best-effort and fire-and-forget, so wait for the rows
  // rather than for a guessed number of ticks.
  await waitFor(() => expect(table.rows).toHaveLength(3))

  // Another browser opening this session: nothing in memory, nothing marked
  // read, everything in `agent_messages`.
  forgetAgentRun(sessionId)
  const { result } = renderHook(() => useAgentRun(sessionId))
  expect(result.current.events).toEqual([])

  hydrateAgentTranscript(sessionId)
  await waitFor(() => expect(result.current.events).toHaveLength(3))

  expect(result.current.events.map((event) => event.kind)).toEqual([
    'user',
    'declined',
    'assistant',
  ])
  expect(declined(result.current.events)[0]!.misses).toEqual([
    { token: 'audit', label: '/ub:audit' },
  ])
})

it('spells the decline out for an agent reading the session back', async () => {
  // The other half of the grievance. A model asked to catch up on a past
  // session reads `get_session`, and a row that came back as a bare kind
  // told it nothing — so it was left inferring from the prose that "/audit"
  // in a sentence had run, which is the belief the whole notice exists to
  // prevent.
  const table = fakeMessagesTable()
  attachAgentPersistence(table.client)

  const { sessionId } = await send({
    text: 'then /audit the intake',
    declaredMisses: [{ token: 'audit', label: '/ub:audit' }],
  })
  await waitFor(() => expect(table.rows).toHaveLength(3))

  const read = await getSession(sessionId)
  expect(read).toContain('declined: "/audit" (nearly /ub:audit)')
  expect(read).toContain('sent as text, so no skill ran')
})


/**
 * HOW THE ROW READS. The wording is the acceptance criterion the row is most
 * likely to drift away from: a notice about a skill that did not run is one
 * careless adjective from reading as a failure, and a reader who chose to
 * send prose did not fail at anything.
 */
describe('the row on screen', () => {
  afterEach(cleanup)

  it('states the token, the skill and the past tense — and nothing else', () => {
    render(
      <TranscriptRow
        event={{ kind: 'declined', misses: [{ token: 'audit', label: '/ub:audit' }] }}
      />,
    )
    expect(
      screen.getByText('“/audit” was sent as text — /ub:audit did not run.'),
    ).toBeTruthy()
  })

  it('names every skill when the message declined several', () => {
    render(
      <TranscriptRow
        event={{
          kind: 'declined',
          misses: [
            { token: 'audit', label: '/ub:audit' },
            { token: 'map', label: '/ub:map' },
          ],
        }}
      />,
    )
    expect(
      screen.getByText(
        '“/audit” and “/map” were sent as text — /ub:audit and /ub:map did not run.',
      ),
    ).toBeTruthy()
  })

  it('wears the transcript’s quiet voice, not the destructive one a failure wears', () => {
    const { container } = render(
      <TranscriptRow
        event={{ kind: 'declined', misses: [{ token: 'audit', label: '/ub:audit' }] }}
      />,
    )
    const marker = container.querySelector('[data-slot="marker"]')!
    expect(marker.className).toContain('text-muted-foreground')
    expect(marker.className).not.toContain('destructive')
    // And nothing in it is announced as an alert: a decision the reader made
    // themselves does not interrupt them a second time.
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('never folds into a run of steps', () => {
    // The "N steps" accordion is where tool calls and status lines go, and a
    // run that contains an error opens itself. Filing this row there would
    // put the reader's own decision behind a disclosure triangle and, worse,
    // in the company of failures.
    const events: TranscriptEvent[] = [
      { kind: 'user', text: 'then /audit the intake' },
      { kind: 'declined', misses: [{ token: 'audit', label: '/ub:audit' }] },
      { kind: 'status', text: 'one' },
      { kind: 'status', text: 'two' },
      { kind: 'status', text: 'three' },
    ]
    expect(blockTranscript(events)).toEqual([
      { kind: 'event', index: 0 },
      { kind: 'event', index: 1 },
      { kind: 'steps', start: 2, end: 4, hasError: false },
    ])
  })
})
