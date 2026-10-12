// @vitest-environment jsdom
/**
 * The loop, from a fake provider through a tool to its result and back.
 *
 * Provider → tool → result → provider is the iteration the product is, and
 * it had no test: the tools were tested through `run`, the roster through
 * its derivation, the providers not at all, and the loop that threads them
 * only by hand. This drives `sendToAgent` with a scripted provider adapter
 * — no network, no key beyond the string that unlocks the send — and
 * asserts what a person and the model each see: the transcript's rows, and
 * the `tool_result` parts fed back on the next round.
 *
 * Four calls, the ones the loop has to get right: a read that runs (the
 * sample's `list_blueprint`), a write that runs (`create_phase`, on the
 * service the session was handed), and two writes the session cannot run —
 * one the no-database trial has no tool for, one the deployment's allowlist
 * disabled — each refused in the loop's words, not dispatched, and the
 * model told what it can do instead.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatInput, ChatResult } from '@/lib/agent/providers/provider'
import type { Database } from '@/types/database'

/**
 * The scripted provider: answers each round from the queue, and keeps what
 * it was sent. A queued Error is thrown instead of answered — that is how
 * the dropped-connection cases below reach the loop — and a queued function
 * runs first, so a case can abort the run from inside the provider call.
 */
const provider = vi.hoisted(() => ({
  turns: [] as Array<ChatResult | Error | DOMException | (() => ChatResult)>,
  inputs: [] as ChatInput[],
}))

vi.mock('@/lib/agent/providers/anthropic', () => ({
  anthropicAdapter: {
    id: 'anthropic',
    chat: async (input: ChatInput): Promise<ChatResult> => {
      provider.inputs.push(input)
      const turn = provider.turns.shift()
      if (typeof turn === 'function') return turn()
      if (turn instanceof Error || turn instanceof DOMException) throw turn
      return turn ?? { parts: [], stopReason: 'end' }
    },
  },
}))

// jsdom has no matchMedia; the shell under test is the desktop one.
vi.mock('@/hooks/useMobileShell', () => ({ isMobileViewport: () => false }))

/**
 * The database-backed board read, counted. The sample trial's read answers
 * from the bundled fixture and needs nothing; these cases need a read that
 * says which time it ran, so "the guard let this one through" is a fact
 * about dispatch rather than an inference from the text.
 */
// Both mocks below are file-global though only the two cases that pass a
// `client` reach them: a later test that takes one gets this stubbed board
// and this fixed scope rather than the real modules.
const board = vi.hoisted(() => ({ reads: 0 }))
vi.mock('@/lib/agent/tools/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/tools/read')>()),
  listBlueprint: async () => `board read ${(board.reads += 1)}`,
}))
// The scope a database read resolves first, which would otherwise be the
// call that reaches the client this file never builds.
vi.mock('@/lib/agent/tools/definitions/scope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/tools/definitions/scope')>()),
  readScope: async () => ({ kind: 'service', serviceId: 'svc-1', serviceName: 'Rooftop Retrofit' }),
}))

/**
 * The write, captured at the RPC wrapper: which service, and the id handed
 * back. A case that sets `phaseFailure` makes the wrapper throw it instead,
 * the way a refused write reaches the loop.
 */
const phasesCreated: { serviceId: string; name: string }[] = []
const phaseFailure = vi.hoisted(() => ({ error: null as Error | null }))
vi.mock('@/lib/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authoringRpc')>()),
  createPhase: async (_client: unknown, input: { serviceId: string; name: string }) => {
    if (phaseFailure.error) throw phaseFailure.error
    phasesCreated.push(input)
    return 'phase-new'
  },
}))

import { setActiveService } from '@/contexts/activeService'
import { AuthoringError } from '@/lib/authoringErrors'
import { sendToAgent, stopAgent, useAgentRun } from '@/lib/agent/loop'
import { AGENT_SKILL_COMMANDS } from '@/lib/agent/skills'
import { ProviderError, wholeSystem } from '@/lib/agent/providers/provider'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import type { AgentSettings } from '@/lib/agent/settings'
import {
  BATCH_LIMIT_REFUSAL,
  BATCH_PAUSED_STATUS,
  REPEAT_READ_SUPPRESSED,
  SAMPLE_TRIAL_REFUSAL,
  WRITE_BATCH_LIMIT,
  noSuchToolRefusal,
  repeatReadRefusal,
} from '@/lib/agent/tools/refusals'
import { configureAgentTools } from '@/lib/agent/tools/roster'
import { NO_UI_STATE } from '@/lib/agent/tools/definitions/ui'

/** The live UI note, and the block the prompt carries it in. */
const CONTEXT_NOTE = 'Phase 2 is open; the Await lane is selected.'
const CONTEXT_BLOCK = '\n\n--- current context ---\n'

const SETTINGS: AgentSettings = { provider: 'anthropic', models: {}, keys: { anthropic: 'test-key' } }

/** Nothing here reads the database; the write is captured before it would. */
const client = {} as unknown as SupabaseClient<Database>

/**
 * One send, then the transcript as the panel reads it. Each send gets a
 * fresh session id because the loop keeps run state per session in module
 * scope and a shared id would carry one case's rows into the next; the
 * events come back through `useAgentRun` rather than a store peek because
 * that hook is the only reader the app has. A case that has to reach into
 * its own run mid-flight — stop, below — names the session itself.
 */
let sessions = 0
const send = (
  input: Omit<
    Parameters<typeof sendToAgent>[0],
    'sessionId' | 'offlineBoard' | 'settings' | 'contextNote'
  > & {
    /** Pass one to send TWICE on the same session — the only case that needs it. */
    sessionId?: string
    /** The live UI note; empty unless a case is about where it lands. */
    contextNote?: string
  },
) => {
  const sessionId = input.sessionId ?? `loop-test-${(sessions += 1)}`
  return sendToAgent({
    ...input,
    sessionId,
    offlineBoard: PACKAGE_OFFLINE_BOARD,
    settings: SETTINGS,
    contextNote: input.contextNote ?? '',
  }).then(
    () => renderHook(() => useAgentRun(sessionId)).result.current.events,
  )
}

/** What the model was handed on a round: the tool results of the previous one. */
const resultsFedBack = (round: number) =>
  provider.inputs[round]!.messages
    .filter((message) => message.role === 'tool')
    .flatMap((message) => message.parts)

/**
 * The answer the model was handed for one call, found by its id. The loop
 * hands the provider its LIVE message array, so every recorded input ends
 * the run holding every round's results — a round index cannot pick a call
 * out, and the id can.
 */
const answerTo = (id: string) =>
  resultsFedBack(provider.inputs.length - 1).find(
    (part) => part.type === 'tool_result' && part.toolCallId === id,
  )!

const call = (id: string, name: string, args: Record<string, unknown>) =>
  ({ type: 'tool_call', id, name, args }) as const

beforeEach(() => {
  provider.turns = []
  provider.inputs = []
  phasesCreated.length = 0
  phaseFailure.error = null
  board.reads = 0
})

afterEach(() => {
  setActiveService(null)
  configureAgentTools(undefined)
  vi.useRealTimers()
})

describe('the loop, provider → tool → result → provider', () => {
  it('runs a read, feeds its result back, and lands the final answer in the transcript', async () => {
    provider.turns = [
      {
        parts: [
          { type: 'text', text: 'Let me look.' },
          call('c1', 'list_blueprint', { granularity: ['phase'] }),
        ],
        stopReason: 'tool_use',
      },
      { parts: [{ type: 'text', text: 'Four phases, Discover to Maintain.' }], stopReason: 'end' },
    ]

    const events = await send({ client: null, text: 'What phases are there?' })

    // Round two was handed round one's result, as a tool_result on c1.
    const [fedBack] = resultsFedBack(1)
    expect(fedBack).toMatchObject({ type: 'tool_result', toolCallId: 'c1', name: 'list_blueprint' })
    expect(fedBack!.result).toMatch(/^\d+ of \d+:/)
    expect(fedBack!.isError).toBeUndefined()

    // The person sees the same, in order: their message, the narration, the
    // tool row with the result, the answer.
    expect(events.map((event) => event.kind)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(events[2]).toMatchObject({ kind: 'tool', name: 'list_blueprint', isError: false })
    expect(events.at(-1)).toEqual({ kind: 'assistant', text: 'Four phases, Discover to Maintain.' })
    expect(provider.inputs).toHaveLength(2)
  })

  it('runs a write on the service the session was handed, and reads the tool\'s own sentence back', async () => {
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    provider.turns = [
      { parts: [call('w1', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Added the Handover phase.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a Handover phase' })

    expect(phasesCreated).toMatchObject([{ serviceId: 'svc-1', name: 'Handover' }])
    expect(resultsFedBack(1)[0]).toMatchObject({
      type: 'tool_result',
      toolCallId: 'w1',
      result: 'Created phase (phase-new).',
    })
    expect(events.find((event) => event.kind === 'tool')).toMatchObject({
      name: 'create_phase',
      isError: false,
      result: 'Created phase (phase-new).',
    })
    expect(events.at(-1)).toEqual({ kind: 'assistant', text: 'Added the Handover phase.' })
  })

  it('refuses a tool the session does not have, in the loop\'s words, without dispatching it', async () => {
    // The no-database trial: `create_phase` is off the roster, so the model
    // was never offered it — but a model can still emit a name.
    provider.turns = [
      { parts: [call('x1', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'I cannot author here.' }], stopReason: 'end' },
    ]

    const events = await send({ client: null, text: 'Add a Handover phase' })

    expect(phasesCreated).toEqual([])
    expect(provider.inputs[0]!.tools.map((tool) => tool.name)).not.toContain('create_phase')
    expect(resultsFedBack(1)[0]).toEqual({
      type: 'tool_result',
      toolCallId: 'x1',
      name: 'create_phase',
      result: SAMPLE_TRIAL_REFUSAL,
      isError: true,
    })
    // Refused calls are answered to the model, not shown as tool rows.
    expect(events.map((event) => event.kind)).toEqual(['user', 'assistant'])
    expect(events.at(-1)).toEqual({ kind: 'assistant', text: 'I cannot author here.' })
  })

  it('refuses a tool the deployment disabled as one that does not exist, without dispatching it', async () => {
    // A connected service account, but the deployment's allowlist stops at
    // reads: the loop must not run a write the roster never offered, and the
    // refusal says nothing about why the roster is narrow.
    configureAgentTools(['list_blueprint'])
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    provider.turns = [
      { parts: [call('d1', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'That tool is not available here.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a Handover phase' })

    expect(phasesCreated).toEqual([])
    expect(provider.inputs[0]!.tools.map((tool) => tool.name)).toEqual(['list_blueprint'])
    expect(resultsFedBack(1)[0]).toEqual({
      type: 'tool_result',
      toolCallId: 'd1',
      name: 'create_phase',
      result: noSuchToolRefusal('create_phase'),
      isError: true,
    })
    expect(events.map((event) => event.kind)).toEqual(['user', 'assistant'])
  })

  it('tells the model a near-miss token named no skill and ran nothing', async () => {
    provider.turns = [{ parts: [{ type: 'text', text: 'Noted.' }], stopReason: 'end' }]
    await send({
      client,
      text: 'then /audit the intake',
      declaredMisses: [{ token: 'audit', label: '/ub:audit' }],
    })
    const system = wholeSystem(provider.inputs[0]!)
    expect(system).toContain('/ub:audit')
    expect(system).toContain('is NOT a skill name')
    expect(system).toContain('NO skill ran')
    expect(system).toContain('Do not describe /ub:audit as having run')
    // A notice, not an invocation: the skill body stays out of the prompt.
    expect(system).not.toContain('--- active skill')
  })

  it('names every near miss the message carried, not the first of them', async () => {
    // Several skills per message means several near misses, and a paragraph
    // that named one of them was the original silence moved one token right:
    // the model reads "/map" as a map that ran.
    provider.turns = [{ parts: [{ type: 'text', text: 'Noted.' }], stopReason: 'end' }]
    await send({
      client,
      text: 'check /audit then /map this',
      declaredMisses: [
        { token: 'audit', label: '/ub:audit' },
        { token: 'map', label: '/ub:map' },
      ],
    })
    const system = wholeSystem(provider.inputs[0]!)
    expect(system).toContain('are NOT skill names here')
    expect(system).toContain('"/audit" and "/map"')
    expect(system).toContain('the closest skills are /ub:audit and /ub:map')
    expect(system).toContain('Do not describe any of /ub:audit and /ub:map as having run')
    expect(system).not.toContain('--- active skill')
  })

  it('carries several skills: every body in pick order, one translation note, and the cache breakpoint past them all', async () => {
    provider.turns = [{ parts: [{ type: 'text', text: 'On it.' }], stopReason: 'end' }]
    const map = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:map')!
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const events = await send({
      client,
      text: 'build this from my notes, then check it',
      skills: [map, audit],
    })
    const sent = provider.inputs[0]!
    const system = wholeSystem(sent)
    expect(system.indexOf('--- active skill: /ub:map')).toBeLessThan(
      system.indexOf('--- active skill: /ub:audit'),
    )
    expect(system).toContain('in this order: /ub:map → /ub:audit')
    // The sentence that translates a skill for this surface is about all of
    // them, so it is said once rather than per skill.
    expect(system.split('You are the canvas agent, not an IDE agent')).toHaveLength(2)
    // The cache breakpoint sits past EVERY body, not mid-skill: both bodies
    // end inside the stable part, and the volatile part begins after them.
    expect(sent.systemStable).toContain(map.content!.trimEnd().slice(-60))
    expect(sent.systemStable).toContain(audit.content!.trimEnd().slice(-60))
    expect(sent.systemVolatile).not.toContain(map.content!.trimEnd().slice(-60))
    expect(sent.systemVolatile).not.toContain(audit.content!.trimEnd().slice(-60))
    // And the prompt is the two parts joined — nothing of it goes missing at
    // the seam, and nothing is said twice.
    expect(system).toBe(sent.systemStable + sent.systemVolatile)
    // The turn reads back with both, not just the first.
    expect(events[0]).toMatchObject({ kind: 'user', skills: ['ub:map', 'ub:audit'] })
  })

  it('assembles what the single builder used to: every skill body, then the live context, once, one blank line past the last of them', async () => {
    // The claim the whole seam rests on is that splitting the prompt in two
    // did not CHANGE the prompt. The old single builder emitted the context
    // block last — after every skill body, one blank line past it — so that
    // is what the two parts joined have to spell, byte for byte. A
    // separator lost or doubled, a context block said twice, or one that
    // drifts ahead of a skill body is a different prompt to the model and a
    // cache entry that matches nothing on the next round.
    provider.turns = [{ parts: [{ type: 'text', text: 'On it.' }], stopReason: 'end' }]
    const map = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:map')!
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    await send({
      client,
      text: 'build this from my notes, then check it',
      skills: [map, audit],
      contextNote: CONTEXT_NOTE,
    })
    const sent = provider.inputs[0]!
    const system = wholeSystem(sent)

    // Said once. Twice would be two contexts for the model to reconcile.
    expect(system.split(CONTEXT_BLOCK)).toHaveLength(2)
    const seam = system.indexOf(CONTEXT_BLOCK)

    // Past the last BYTE of the last skill body, not merely past its header.
    const lastSkillByte = system.lastIndexOf(audit.content!.trimEnd().slice(-60))
    expect(lastSkillByte).toBeGreaterThan(-1)
    expect(seam).toBeGreaterThan(lastSkillByte)
    expect(seam).toBeGreaterThan(system.lastIndexOf('--- active skill:'))

    // Exactly one blank line at the join. The block brings its own '\n\n'
    // and the part before it ends on a non-newline, so a separator added on
    // either side of the seam shows up here as a third newline.
    expect(system.slice(seam, seam + 4)).toBe('\n\n--')
    expect(system[seam - 1]).not.toBe('\n')

    // The context is the prompt's LAST word — nothing stable trails it.
    expect(system.endsWith(CONTEXT_NOTE)).toBe(true)

    // And the cut falls exactly on that boundary: the stable part ends where
    // the context block begins, so the volatile part is the context block and
    // carries the separator itself. The two parts are joined bare.
    expect(sent.systemVolatile).toBe(CONTEXT_BLOCK + CONTEXT_NOTE)
    expect(sent.systemStable).toHaveLength(seam)
  })

  it('still says nothing ran on the closing call, after the round budget is spent', async () => {
    // Every round asks for a tool, so the loop spends its budget and then
    // makes ONE no-tools closing call — which is the path the session that
    // motivated the notice actually took, and the path that used to drop it.
    provider.turns = Array.from({ length: 12 }, () => ({
      parts: [call('r', 'list_blueprint', { granularity: ['phase'] })],
      stopReason: 'tool_use' as const,
    }))
    await send({
      client,
      text: 'then /audit the intake',
      declaredMisses: [{ token: 'audit', label: '/ub:audit' }],
    })
    // The closing call is the one that was sent no tools.
    const closing = provider.inputs.at(-1)!
    expect(closing.tools).toEqual([])
    expect(wholeSystem(closing)).toContain('is NOT a skill name')
    expect(wholeSystem(closing)).toContain('Do not describe /ub:audit as having run')
  })

  it('still says the session has no database on the closing call', async () => {
    // The same line dropped the tier, trial and mobile paragraphs too — a
    // trial that spent its budget was told mid-run that it had a database.
    provider.turns = Array.from({ length: 12 }, () => ({
      parts: [call('r', 'list_blueprint', { granularity: ['phase'] })],
      stopReason: 'tool_use' as const,
    }))
    await send({ client: null, text: 'walk me through the sample' })
    const closing = provider.inputs.at(-1)!
    expect(closing.tools).toEqual([])
    expect(wholeSystem(closing)).toContain('This app has NO database connected')
  })

  it('still says the session is view-only on the closing call', async () => {
    // The tier paragraph is the other one the closing call used to drop, and
    // it is the one with teeth: a viewer whose turn spends its budget would
    // be asked to answer with no write tools in hand and nothing in the
    // prompt saying so, which is how a model comes to claim an edit it could
    // not have made. A connected client, so this is the tier speaking rather
    // than the trial paragraph that subsumes it.
    provider.turns = Array.from({ length: 12 }, () => ({
      parts: [call('r', 'list_blueprint', { granularity: ['phase'] })],
      stopReason: 'tool_use' as const,
    }))
    await send({ client, text: 'walk me through the intake', allowWrites: false })
    const closing = provider.inputs.at(-1)!
    expect(closing.tools).toEqual([])
    expect(wholeSystem(closing)).toContain('This session is VIEW-ONLY')
    expect(wholeSystem(closing)).toContain('never imply you made it')
  })
})

/**
 * The repeat-read guard. A model that loops re-reads the same thing: the
 * session that motivated this ran one identical `list_blueprint` four times
 * inside a turn, spending a round and re-injecting an identical payload each
 * time. These drive the same shape through the scripted provider and assert
 * what the model is handed back, what the person sees, and — the point of
 * the whole thing — what never reached a tool.
 */
describe('a read the turn already ran', () => {
  it('refuses the repeat with a pointer rather than dispatching it again', async () => {
    provider.turns = [
      // The shape from the session that motivated the guard: a granularity
      // LIST and a number, neither of which a string-only label survives.
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'], limit: 5 })], stopReason: 'tool_use' },
      // Same call, arguments written in the other order: providers do not
      // promise key order between rounds, and neither does the model.
      { parts: [call('r2', 'list_blueprint', { limit: 5, granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Four phases.' }], stopReason: 'end' },
    ]

    const events = await send({ client: null, text: 'What phases are there?' })

    // Round one ran and answered with the board.
    expect(answerTo('r1').result).toMatch(/^\d+ of \d+:/)
    // Round two was refused, error-shaped, and the payload is NOT restated.
    const refused = answerTo('r2')
    expect(refused).toEqual({
      type: 'tool_result',
      toolCallId: 'r2',
      name: 'list_blueprint',
      // The refusal NAMES the arguments — a turn can hold several reads of
      // one tool, and "list_blueprint already ran" would leave the model to
      // guess which earlier result it is being sent back to.
      // The label echoes the call AS SENT — the match is order-independent,
      // the label is not, and the model reads back the words it wrote.
      result: repeatReadRefusal('list_blueprint', 'limit: 5, granularity: phase'),
      isError: true,
    })
    expect(refused.result).not.toMatch(/^\d+ of \d+:/)
    // The round budget is untouched: the turn ran on to its answer.
    expect(events.at(-1)).toEqual({ kind: 'assistant', text: 'Four phases.' })
  })

  it('leaves each suppressed repeat in the transcript, one row apiece', async () => {
    provider.turns = [
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      {
        parts: [
          call('r2', 'list_blueprint', { granularity: ['phase'] }),
          call('r3', 'list_blueprint', { granularity: ['phase'] }),
        ],
        stopReason: 'tool_use',
      },
      { parts: [{ type: 'text', text: 'Four phases.' }], stopReason: 'end' },
    ]

    const events = await send({ client: null, text: 'What phases are there?' })

    const rows = events.filter((event) => event.kind === 'tool')
    expect(rows).toHaveLength(3)
    // The loop in full, not a tidied summary of it: both repeats are rows.
    expect(rows.slice(1)).toEqual([
      {
        kind: 'tool',
        name: 'list_blueprint',
        summary: REPEAT_READ_SUPPRESSED,
        isError: false,
        suppressed: true,
        args: JSON.stringify({ granularity: ['phase'] }, null, 2),
        result: repeatReadRefusal('list_blueprint', 'granularity: phase'),
      },
      {
        kind: 'tool',
        name: 'list_blueprint',
        summary: REPEAT_READ_SUPPRESSED,
        isError: false,
        suppressed: true,
        args: JSON.stringify({ granularity: ['phase'] }, null, 2),
        result: repeatReadRefusal('list_blueprint', 'granularity: phase'),
      },
    ])
  })

  it('dispatches the same read under different arguments', async () => {
    provider.turns = [
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [call('r2', 'list_blueprint', { granularity: ['scenario'] })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Phases and scenarios.' }], stopReason: 'end' },
    ]

    await send({ client: null, text: 'What is on the board?' })

    expect(answerTo('r2').result).toMatch(/^\d+ of \d+:/)
    expect(answerTo('r2').isError).toBeUndefined()
  })

  it('lets an interface call repeat — the camera is the agent\'s hands, not its eyes', async () => {
    provider.turns = [
      { parts: [call('i1', 'focus_cell', { cell_id: 'cell-1' })], stopReason: 'tool_use' },
      { parts: [call('i2', 'focus_cell', { cell_id: 'cell-1' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Centred.' }], stopReason: 'end' },
    ]

    await send({ client: null, text: 'Show me that cell again' })

    expect(answerTo('i2').result).not.toContain('already ran this turn')
    expect(answerTo('i2').result).toBe(answerTo('i1').result)
  })

  it('starts a fresh record on the next send, so the read runs again', async () => {
    const sessionId = `loop-test-repeat-${(sessions += 1)}`
    provider.turns = [
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Four phases.' }], stopReason: 'end' },
    ]
    await send({ sessionId, client: null, text: 'What phases are there?' })

    provider.turns = [
      { parts: [call('r2', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Still four.' }], stopReason: 'end' },
    ]
    await send({ sessionId, client: null, text: 'Check again' })

    expect(answerTo('r2').result).toMatch(/^\d+ of \d+:/)
    expect(answerTo('r2').isError).toBeUndefined()
  })

  it('runs the verification re-read a write asks for, because the write retires the record', async () => {
    // The write tools say so themselves — "re-read the blueprint for the new
    // lane ids". A record that outlived the write would refuse that re-read
    // and point the model at a description of the board BEFORE its own edit.
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    provider.turns = [
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [call('w1', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [call('r2', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Five phases now.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a Handover phase and check it landed' })

    expect(board.reads).toBe(2)
    expect(answerTo('r2')).toMatchObject({ result: 'board read 2' })
    expect(events.filter((event) => event.kind === 'tool')).toHaveLength(3)
    expect(
      events.some((event) => event.kind === 'tool' && event.summary === REPEAT_READ_SUPPRESSED),
    ).toBe(false)
  })

  it('keeps suppressing a board read across a camera move, and re-observes the canvas after one', async () => {
    // The adapter tells the model to `focus_cell` every time it names a
    // cell, so reads and moves interleave constantly. A move that retired
    // the whole record would empty it between every pair of reads — the
    // four identical board reads, each politely separated by a focus.
    provider.turns = [
      { parts: [call('r1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      { parts: [call('u1', 'get_ui_state', {})], stopReason: 'tool_use' },
      { parts: [call('i1', 'focus_cell', { cell_id: 'cell-1' })], stopReason: 'tool_use' },
      {
        parts: [
          call('r2', 'list_blueprint', { granularity: ['phase'] }),
          call('u2', 'get_ui_state', {}),
        ],
        stopReason: 'tool_use',
      },
      { parts: [{ type: 'text', text: 'Here.' }], stopReason: 'end' },
    ]

    await send({ client: null, text: 'Which phase holds that cell?' })

    // The camera moved; the board did not.
    expect(answerTo('r2')).toMatchObject({
      result: repeatReadRefusal('list_blueprint', 'granularity: phase'),
      isError: true,
    })
    expect(answerTo('u2')).toMatchObject({ result: NO_UI_STATE })
    expect(answerTo('u2').isError).toBeUndefined()
  })

  it('observes the canvas again after moving it — a navigation call retires the record too', async () => {
    // `get_ui_state` takes no arguments, so its key never varies: without
    // this rule the SECOND call in a turn is suppressed forever, and a tool
    // documented as what the user is looking at RIGHT NOW would answer only
    // once, before any of the moves worth observing.
    provider.turns = [
      { parts: [call('u1', 'get_ui_state', {})], stopReason: 'tool_use' },
      { parts: [call('u2', 'get_ui_state', {})], stopReason: 'tool_use' },
      { parts: [call('i1', 'focus_cell', { cell_id: 'cell-1' })], stopReason: 'tool_use' },
      { parts: [call('u3', 'get_ui_state', {})], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'Here it is.' }], stopReason: 'end' },
    ]

    await send({ client: null, text: 'Show me that cell' })

    // Nothing moved between the first two, so the repeat is answered.
    expect(answerTo('u2')).toMatchObject({
      result: repeatReadRefusal('get_ui_state', ''),
      isError: true,
    })
    // The move happened, so the observation after it runs.
    expect(answerTo('u3')).toMatchObject({ result: NO_UI_STATE })
    expect(answerTo('u3').isError).toBeUndefined()
  })
})

/**
 * A write the database refused. The person reads the friendly sentence; the
 * model gets the database's own text beside it, because it cannot open the
 * console the sentence points at, and a retry without the cause is a guess.
 */
describe('a write the database refuses', () => {
  it('hands the model the database text and keeps the friendly sentence as the row summary', async () => {
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    phaseFailure.error = new AuthoringError('friendly', 'raw text')
    provider.turns = [
      { parts: [call('f1', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'That failed.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a Handover phase' })

    expect(answerTo('f1')).toMatchObject({
      result: 'Error: friendly (database: raw text)',
      isError: true,
    })
    expect(events.find((event) => event.kind === 'tool')).toMatchObject({
      name: 'create_phase',
      summary: 'friendly',
      isError: true,
      result: 'Error: friendly (database: raw text)',
    })
  })

  it('leaves a failure that is not an authoring error as its message alone', async () => {
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    phaseFailure.error = new Error('plain failure')
    provider.turns = [
      { parts: [call('f2', 'create_phase', { name: 'Handover' })], stopReason: 'tool_use' },
      { parts: [{ type: 'text', text: 'That failed.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a Handover phase' })

    expect(answerTo('f2')).toMatchObject({ result: 'Error: plain failure', isError: true })
    expect(events.find((event) => event.kind === 'tool')).toMatchObject({
      summary: 'plain failure',
      result: 'Error: plain failure',
    })
  })
})

/**
 * The failure a phone produces: a fetch that never completed, which WebKit
 * reports as `TypeError: Load failed`. Nothing rejected the request — the
 * radio blipped — so a turn that dies on it throws away every tool result
 * the round had already gathered for no reason a retry could not fix.
 *
 * The clock is faked throughout: the backoff between tries is real time the
 * suite should not spend waiting.
 */
/*
 * The live half of an admission answer, at the loop rather than at the seam.
 *
 * `admission.test.ts` pins the answer itself — which gate refuses a call and
 * in whose words. These two are about what the loop does AROUND two of those
 * answers, which is the part no seam can hold: a batch pause shows one status
 * row however many calls bounced, and a stop has to end the turn rather than
 * dispatch the rest of the round.
 */
describe('a write batch the send has already spent', () => {
  it('lands the limit, bounces the rest, and says "paused" once for the round', async () => {
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    const overBudget = 3
    provider.turns = [
      {
        parts: Array.from({ length: WRITE_BATCH_LIMIT + overBudget }, (_unused, index) =>
          call(`b${index}`, 'create_phase', { name: `Phase ${index}` }),
        ),
        stopReason: 'tool_use',
      },
      { parts: [{ type: 'text', text: 'Paused after the batch.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add a dozen phases' })

    // Exactly the limit landed; the writes past it changed nothing.
    expect(phasesCreated).toHaveLength(WRITE_BATCH_LIMIT)
    expect(answerTo(`b${WRITE_BATCH_LIMIT - 1}`).isError).toBeUndefined()
    for (let index = WRITE_BATCH_LIMIT; index < WRITE_BATCH_LIMIT + overBudget; index += 1)
      expect(answerTo(`b${index}`)).toMatchObject({
        result: BATCH_LIMIT_REFUSAL,
        isError: true,
      })
    // One row for the pause, not one per bounced call: three identical
    // "Paused" rows read as a stutter rather than a pause.
    expect(events.filter((event) => event.kind === 'status')).toEqual([
      { kind: 'status', text: BATCH_PAUSED_STATUS },
    ])
  })
})

describe('a stop that lands before the round\'s calls dispatch', () => {
  it('runs none of them and ends the turn', async () => {
    setActiveService({ id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' })
    const sessionId = 'loop-stop-mid-batch'
    provider.turns = [
      () => {
        // Pressed while the provider was still answering, so the loop reaches
        // its calls with the signal already up.
        stopAgent(sessionId)
        return {
          parts: [call('s1', 'create_phase', { name: 'One' }), call('s2', 'create_phase', { name: 'Two' })],
          stopReason: 'tool_use',
        }
      },
      { parts: [{ type: 'text', text: 'Should never be asked for.' }], stopReason: 'end' },
    ]

    const events = await send({ client, text: 'Add two phases', sessionId })

    expect(phasesCreated).toEqual([])
    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Stopped. Whatever already landed is in the change sheet, revertible.',
    })
  })
})

describe('a provider call that drops at the network layer', () => {
  // Every case here either waits out a backoff or must be shown not to
  // start one, so the clock is faked for all of them; `afterEach` restores
  // it for the rest of the file.
  beforeEach(() => vi.useFakeTimers())

  /** Past the two backoffs, whichever of them this case reaches. */
  const runOutTheBackoff = () => vi.advanceTimersByTimeAsync(5000)

  const loadFailed = () => new TypeError('Load failed')

  it('retries a dropped connection and finishes the turn the reader asked for', async () => {
    provider.turns = [
      loadFailed(),
      { parts: [{ type: 'text', text: 'Four phases, Discover to Maintain.' }], stopReason: 'end' },
    ]

    const pending = send({ client: null, text: 'What phases are there?' })
    await runOutTheBackoff()
    const events = await pending

    expect(provider.inputs).toHaveLength(2)
    expect(events.map((event) => event.kind)).toEqual(['user', 'assistant'])
    expect(events.at(-1)).toEqual({ kind: 'assistant', text: 'Four phases, Discover to Maintain.' })
  })

  it('keeps the tool results an earlier round gathered when a later round is retried', async () => {
    provider.turns = [
      { parts: [call('c1', 'list_blueprint', { granularity: ['phase'] })], stopReason: 'tool_use' },
      loadFailed(),
      { parts: [{ type: 'text', text: 'Four phases.' }], stopReason: 'end' },
    ]

    const pending = send({ client: null, text: 'What phases are there?' })
    await runOutTheBackoff()
    await pending

    // The third call is the second round sent again: it still carries the
    // result of the call that already ran.
    expect(resultsFedBack(2)[0]).toMatchObject({ type: 'tool_result', toolCallId: 'c1' })
  })

  it('gives up after two retries with a status naming the round and the count', async () => {
    provider.turns = [loadFailed(), loadFailed(), loadFailed()]

    const pending = send({ client: null, text: 'What phases are there?' })
    await runOutTheBackoff()
    const events = await pending

    expect(provider.inputs).toHaveLength(3)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Connection lost on round 1 after 3 tries (Load failed) — everything the turn already gathered is kept; send a message to carry on.',
    })
  })

  it('does not retry a provider refusal, and keeps its status and detail', async () => {
    provider.turns = [new ProviderError('anthropic', 429, 'rate limit exceeded')]

    const events = await send({ client: null, text: 'What phases are there?' })

    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Provider error on round 1: anthropic 429: rate limit exceeded',
    })
  })

  it('does not retry a failure a second try cannot fix, and does not call it a drop', async () => {
    // A truncated 200 whose body will not parse: the same request will
    // produce the same broken body, and the reader is owed the real name.
    provider.turns = [new SyntaxError('Unexpected end of JSON input')]

    const events = await send({ client: null, text: 'What phases are there?' })

    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'The turn failed on round 1: Unexpected end of JSON input',
    })
  })

  it('never retries an abort — a regression guard on the stopped status', async () => {
    provider.turns = [new DOMException('stopped', 'AbortError')]

    const events = await send({ client: null, text: 'What phases are there?' })

    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Stopped. Whatever already landed is in the change sheet, revertible.',
    })
  })

  it('stops between tries when the reader presses stop during the backoff', async () => {
    const sessionId = 'loop-abort-during-backoff'
    provider.turns = [
      () => {
        // Lands while the loop is waiting out the backoff, not before it —
        // the wait itself has to notice, or Stop sits ignored for a second.
        setTimeout(() => stopAgent(sessionId), 50)
        throw loadFailed()
      },
      { parts: [{ type: 'text', text: 'Should never be asked for.' }], stopReason: 'end' },
    ]

    const pending = send({ client: null, text: 'What phases are there?', sessionId })
    await runOutTheBackoff()
    const events = await pending

    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Stopped. Whatever already landed is in the change sheet, revertible.',
    })
  })

  it('stops rather than retrying when stop landed during the provider call itself', async () => {
    const sessionId = 'loop-abort-before-backoff'
    provider.turns = [
      () => {
        stopAgent(sessionId)
        throw loadFailed()
      },
    ]

    const events = await send({ client: null, text: 'What phases are there?', sessionId })

    expect(provider.inputs).toHaveLength(1)
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'Stopped. Whatever already landed is in the change sheet, revertible.',
    })
  })
})
