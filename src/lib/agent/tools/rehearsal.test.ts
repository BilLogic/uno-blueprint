import { afterEach, describe, expect, it } from 'vitest'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { updateCellDependency } from '@/lib/authoringRpc'
import { runTool } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { REHEARSAL_SERVICE, rehearsalClient, rehearsalContext } from '@/lib/agent/tools/rehearsal'

/*
 * Every write tool, rehearsed: its own `run` against the rehearsal client,
 * answering in its own words. The harness's dry run is exactly this call, so
 * a write tool whose mutation the rehearsal cannot satisfy fails here rather
 * than in an eval transcript — and a write tool added without a sample call
 * below fails too, by name.
 */

const WRITES = TOOL_DEFINITIONS.filter((tool) => tool.surface === 'write')

/** Cell ids as the database mints them: the slice writes refuse any other shape. */
const CELL_1 = 'a0000000-0000-4000-8000-000000040101'
const CELL_2 = 'a0000000-0000-4000-8000-000000040102'

/** One valid call per write tool — what the harness would be handed by a model. */
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  create_stakeholder: { name: 'Dispatcher', kind: 'staff' },
  update_stakeholder: { stakeholder_id: 'st-1', summary: 'Runs the floor' },
  create_phase: { name: 'Onboard' },
  create_scenario: { phase_id: 'ph-1', name: 'Intake' },
  create_path: { scenario_id: 'sc-1', name: 'Late' },
  duplicate_path: { source_path_id: 'p-1', name: 'Copy' },
  duplicate_scenario: { source_scenario_id: 'sc-1', name: 'Intake (copy)' },
  create_slice: { title: 'Caller view', kind: 'journey', cell_ids: [CELL_1, CELL_2] },
  update_slice: { slice_id: 'sl-1', title: 'Renamed' },
  replace_slides: { slice_id: 'sl-1', slides: [{ cells: [CELL_1], title: 'Arrive' }] },
  create_step: { path_id: 'p-1', name: 'Verify' },
  create_lane: { scenario_id: 'sc-1', name: 'Backstage', lane_role: 'backstage_actions' },
  upsert_cell: { path_id: 'p-1', lane_id: 'l-1', step_id: 's-1', content: 'Caller books a slot' },
  update_cell: { cell_id: 'c-1', summary: 'New tl;dr' },
  create_cell_dependency: { source_cell_id: 'c-1', target_cell_id: 'c-2' },
  update_path: { path_id: 'p-1', name: 'Main' },
  create_evidence: { cell_id: 'c-1', kind: 'interview', title: 'Onboarding interview #4' },
  update_evidence: { evidence_id: 'e-1', note: 'v2' },
  create_finding: {
    source: 'audit',
    check_key: 'gap-sweep',
    severity: 'warn',
    impact: 'high',
    effort: 'low',
    summary: 'A gap',
    cell_ids: ['c-1'],
    run_id: 'run-9',
  },
  update_finding: { finding_id: 'f-1', status: 'resolved' },
  approve_suggested_change: { suggested_change_id: 'b0000000-0000-4000-8000-000000000001' },
  decline_suggested_change: { suggested_change_id: 'b0000000-0000-4000-8000-000000000001' },
}

/** The call as the harness makes it: the tool, its arguments, and a context told both. */
function rehearse(name: string) {
  const tool = WRITES.find((write) => write.name === name)!
  const args = SAMPLE_ARGS[name] ?? {}
  const { ctx, calls, rpcs } = rehearsalContext({ definition: tool, args })
  return { text: runTool(tool, args, ctx), calls, rpcs }
}

afterEach(() => {
  clearSession()
})

describe('every write tool rehearses, and answers in its own words', () => {
  it('the sample calls cover every write tool', () => {
    const missing = WRITES.map((tool) => tool.name).filter((name) => !SAMPLE_ARGS[name])
    expect(missing).toEqual([])
  })

  for (const tool of WRITES) {
    it(`${tool.name} rehearses to a sentence of its own`, async () => {
      expect((await rehearse(tool.name).text).trim().length).toBeGreaterThan(0)
    })
  }
})

describe('the sentence is the tool’s, placeholder ids included', () => {
  it('create_phase reports the phase it would have created', async () => {
    expect(await rehearse('create_phase').text).toBe('Created phase (dry-1).')
  })

  it('create_finding hands back the run id to reuse, in its own sentence', async () => {
    expect(await rehearse('create_finding').text).toBe(
      'Recorded warn finding (impact high, effort low) for gap-sweep. run_id run-9; reuse it for the rest of this run.',
    )
  })
})

/*
 * A sentence alone cannot tell a tool that reached the right write from one
 * that reached nothing and said so — the rehearsal answers every chain, so a
 * write aimed at the wrong table rehearses just as smoothly. The log is what
 * says which write was reached, and these assert it for one tool of each
 * shape: a table insert, a structural RPC, and a write whose mutation module
 * calls an RPC of its own on the way.
 */
describe('the rehearsal records which write was reached', () => {
  it('create_stakeholder reaches one insert on stakeholders', async () => {
    const run = rehearse('create_stakeholder')
    await run.text
    const inserts = run.calls.filter((call) => call.ops.some(([op]) => op === 'insert'))
    expect(inserts.map((call) => call.table)).toEqual(['stakeholders'])
    expect(run.rpcs.map((rpc) => rpc.fn)).not.toContain('create_stakeholder')
  })

  it('create_phase reaches the create_phase RPC on the rehearsal service', async () => {
    const run = rehearse('create_phase')
    await run.text
    expect(run.rpcs).toContainEqual({
      fn: 'create_phase',
      args: { service_id: REHEARSAL_SERVICE.id, name: 'Onboard', summary: null },
    })
  })

  it('update_cell reaches sync_cell_touchpoints, which is where its text lands', async () => {
    const run = rehearse('update_cell')
    await run.text
    expect(run.rpcs.map((rpc) => rpc.fn)).toContain('sync_cell_touchpoints')
  })
})

/*
 * What a rehearsal leaves on the ledger. A write that did not happen has
 * nothing to undo, so a rehearsed edit must not record an inverse built from
 * placeholder fields — and a rehearsed replace must still land, its inverse
 * the slides the rehearsal read: none.
 */
describe('a rehearsal records no inverse it cannot honour', () => {
  it('a rehearsed update_cell_dependency records no inverse', async () => {
    const { client } = rehearsalClient(() => 'dry-1')
    await updateCellDependency(client, { dependencyId: 'dep-1', kind: 'enables', targetCellId: 'c-2', note: null })
    expect(sessionSnapshot().map(({ fn, revert }) => ({ fn, revert }))).toEqual([
      { fn: 'update_cell_dependency', revert: undefined },
    ])
  })

  it('a rehearsed replace_slides lands, with the empty slice it read as the inverse', async () => {
    const run = rehearse('replace_slides')
    expect(await run.text).toBe("Replaced the slice's slides (1).")
    expect(sessionSnapshot().map(({ revert }) => revert)).toEqual([
      { fn: 'restore_slides', args: { slice_id: 'sl-1', rows: [] } },
    ])
  })
})

describe('the rehearsal’s existence answers', () => {
  it('finds the cells an existence check names, and nothing for any other table’s in(id)', async () => {
    const { client } = rehearsalClient(() => 'dry-1')
    const cells = await client.from('cells').select('id').in('id', [CELL_1])
    const slides = await client.from('slides').select('id').in('id', [CELL_1])
    expect(cells.data).toEqual([{ id: CELL_1 }])
    expect(slides.data).toEqual([])
  })
})
