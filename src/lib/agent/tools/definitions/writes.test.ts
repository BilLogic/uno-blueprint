import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { runTool, toolSpec, type ToolDefinition } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import {
  createCellDependencyTool,
  updateCellTool,
  upsertCellTool,
} from '@/lib/agent/tools/definitions/cells'
import { createEvidenceTool, updateEvidenceTool } from '@/lib/agent/tools/definitions/evidence'
import { createFindingTool, updateFindingTool } from '@/lib/agent/tools/definitions/findings'
import {
  createLaneTool,
  createPathTool,
  createPhaseTool,
  createScenarioTool,
  createStepTool,
  duplicatePathTool,
  duplicateScenarioTool,
  updatePathTool,
} from '@/lib/agent/tools/definitions/journey'
import {
  createSliceTool,
  replaceSlidesTool,
  updateSliceTool,
} from '@/lib/agent/tools/definitions/slices'
import {
  createStakeholderTool,
  updateStakeholderTool,
} from '@/lib/agent/tools/definitions/stakeholders'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { dispatchTool } from '@/lib/agent/tools/registry'

/*
 * Every write tool, through its own interface: `run(args, ctx)` with a
 * context built by hand, against a client that records what it was asked
 * and answers with what the test says. The mutation modules are real — the
 * point is that a write reaches the database through them and lands on the
 * session ledger — and the session records whether the work ran attributed.
 */

type Call = { table: string; ops: Array<[string, ...unknown[]]> }
type Rpc = { fn: string; args: Record<string, unknown> }

/** What a table answers with: a row, rows or nothing — or a function of the ops chained so far. */
type Scripted = Record<string, unknown> | unknown[] | null
type Answer = Scripted | ((ops: Call['ops']) => Scripted)

/**
 * A client whose tables answer from a script and whose RPCs record. A Proxy
 * rather than a hand-listed builder, so a write that adds one PostgREST verb
 * does not break every fake that never meant to assert on it.
 */
function recordingClient(
  answers: Record<string, Answer> = {},
  rpcAnswer: (fn: string, args: Record<string, unknown>) => unknown = () => 'new-id',
) {
  const calls: Call[] = []
  const rpcs: Rpc[] = []
  const builder = (table: string) => {
    const call: Call = { table, ops: [] }
    calls.push(call)
    const settle = () => {
      const answer = answers[table]
      const data = typeof answer === 'function' ? answer(call.ops) : answer
      return Promise.resolve({ data: data === undefined ? [] : data, error: null })
    }
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then')
            return (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
              settle().then(onF, onR)
          if (prop === 'maybeSingle' || prop === 'single') return settle
          return (...args: unknown[]) => {
            call.ops.push([String(prop), ...args])
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const client = {
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return Promise.resolve({ data: rpcAnswer(fn, args), error: null })
    },
  } as unknown as SupabaseClient<Database>
  return { client, calls, rpcs }
}

function recordingSession() {
  const attributed: string[] = []
  return {
    attributed,
    session: {
      id: 'session-1',
      attributed: async <T,>(work: () => Promise<T>) => {
        attributed.push('begin')
        try {
          return await work()
        } finally {
          attributed.push('end')
        }
      },
    },
  }
}

/** Run one write with a recording client and session; hand back everything recorded. */
async function write(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  answers: Record<string, Answer> = {},
  rpcAnswer?: (fn: string, args: Record<string, unknown>) => unknown,
) {
  const { client, calls, rpcs } = recordingClient(answers, rpcAnswer)
  const { session, attributed } = recordingSession()
  const text = await runTool(tool, args, fakeToolContext({ client, session }))
  // Every write that ran, ran attributed — begin before the work, end after.
  expect(attributed).toEqual(['begin', 'end'])
  return { text, calls, rpcs, attributed, ledger: sessionSnapshot().map((entry) => entry.fn) }
}

afterEach(() => {
  clearSession()
})

const WRITES = TOOL_DEFINITIONS.filter((tool) => tool.surface === 'write')

describe('every write is a definition on the write surface, off the trial and off mobile', () => {
  it('the twenty writes are on the write surface', () => {
    expect(WRITES.map((tool) => tool.name)).toEqual([
      'create_stakeholder', 'update_stakeholder', 'create_phase', 'create_scenario', 'create_path',
      'duplicate_path', 'duplicate_scenario', 'create_slice', 'update_slice', 'replace_slides',
      'create_step', 'create_lane', 'upsert_cell', 'update_cell', 'create_cell_dependency',
      'update_path', 'create_evidence', 'update_evidence', 'create_finding', 'update_finding',
    ])
  })

  for (const tool of WRITES) {
    it(`${tool.name} derives a plain object schema and is kept off the trial and mobile`, () => {
      expect(tool.availability).toEqual({ sample: false, mobile: false })
      const spec = toolSpec(tool)
      expect(spec.parameters.type).toBe('object')
      expect(spec.parameters).not.toHaveProperty('$schema')
      expect(spec.parameters).not.toHaveProperty('additionalProperties')
    })
  }

  it('a write with no client is refused as a roster mistake, not run', async () => {
    const { session, attributed } = recordingSession()
    await expect(
      runTool(updatePathTool, { path_id: 'p-1', name: 'x' }, fakeToolContext({ session })),
    ).rejects.toThrow(/No database in this session/)
    // The refusal happens inside the attribution, which closes cleanly.
    expect(attributed).toEqual(['begin', 'end'])
  })

  it('a malformed call is refused before any attribution or write', async () => {
    const { client, rpcs } = recordingClient()
    const { session, attributed } = recordingSession()
    await expect(
      runTool(createStepTool, { path_id: '', name: 'Intake' }, fakeToolContext({ client, session })),
    ).rejects.toThrow(/create_step: invalid arguments — path_id/)
    expect(attributed).toEqual([])
    expect(rpcs).toEqual([])
  })
})

describe('the structure writes call their RPC attributed, and the ledger records them', () => {
  it('create_phase lands on the active service', async () => {
    const { text, rpcs, attributed, ledger } = await write(createPhaseTool, { name: 'Onboard' })
    expect(rpcs).toEqual([{ fn: 'create_phase', args: { service_id: 'svc-1', name: 'Onboard', summary: null } }])
    expect(text).toBe('Created phase (new-id).')
    expect(attributed).toEqual(['begin', 'end'])
    expect(ledger).toEqual(['create_phase'])
  })

  it('create_scenario passes the lane source and step count through', async () => {
    const { text, rpcs, ledger } = await write(
      createScenarioTool,
      { phase_id: 'ph-1', name: 'Intake', step_count: 3, lane_source_path_id: 'p-0' },
      {},
      () => ({ scenario_id: 'sc-1', path_id: 'p-1' }),
    )
    expect(rpcs[0]!.fn).toBe('create_scenario')
    expect(rpcs[0]!.args).toMatchObject({ phase_id: 'ph-1', name: 'Intake', step_count: 3, lane_source_path_id: 'p-0' })
    expect(text).toContain('"scenario_id":"sc-1"')
    expect(ledger).toEqual(['create_scenario'])
  })

  it('create_path defaults the kind to variant and refuses one outside the three', async () => {
    const { rpcs, ledger } = await write(createPathTool, { scenario_id: 'sc-1', name: 'Late' })
    expect(rpcs[0]!.args).toMatchObject({ kind: 'variant', lane_source_path_id: null })
    expect(ledger).toEqual(['create_path'])
    await expect(
      write(createPathTool, { scenario_id: 'sc-1', name: 'Late', kind: 'sad' }),
    ).rejects.toThrow(/kind/)
  })

  it('duplicate_path copies cells unless told not to', async () => {
    const { rpcs, text, ledger } = await write(duplicatePathTool, { source_path_id: 'p-1', name: 'Copy' })
    expect(rpcs[0]!.args).toMatchObject({ copy_cells: true })
    expect(text).toBe('Duplicated path (new-id).')
    expect(ledger).toEqual(['duplicate_path'])
    const { rpcs: bare } = await write(duplicatePathTool, { source_path_id: 'p-1', name: 'Copy', copy_cells: false })
    expect(bare[0]!.args).toMatchObject({ copy_cells: false })
  })

  it('duplicate_scenario tells the model the copy has its own ids', async () => {
    const { rpcs, text, ledger } = await write(duplicateScenarioTool, { source_scenario_id: 'sc-1', name: 'Intake (copy)' })
    expect(rpcs).toEqual([{ fn: 'duplicate_scenario', args: { source_scenario_id: 'sc-1', name: 'Intake (copy)' } }])
    expect(text).toMatch(/none of them are the source's/)
    expect(ledger).toEqual(['duplicate_scenario'])
  })

  it('create_step appends when no position is given', async () => {
    const { rpcs, text, ledger } = await write(createStepTool, { path_id: 'p-1', name: 'Verify' })
    expect(rpcs).toEqual([{ fn: 'add_step', args: { path_id: 'p-1', name: 'Verify', at_position: null } }])
    expect(text).toBe('Added step (new-id).')
    expect(ledger).toEqual(['add_step'])
  })

  it('create_lane adds to every path and asks for a re-read', async () => {
    const { rpcs, text, ledger } = await write(createLaneTool, { scenario_id: 'sc-1', name: 'Backstage', lane_role: 'backstage_actions' }, {}, () => ['l-1', 'l-2'])
    expect(rpcs[0]).toEqual({ fn: 'add_lane', args: { scenario_id: 'sc-1', name: 'Backstage', lane_role: 'backstage_actions', at_position: null } })
    expect(text).toMatch(/Re-read the blueprint/)
    expect(ledger).toEqual(['add_lane'])
  })

  it('update_path renames', async () => {
    const { rpcs, text, ledger } = await write(updatePathTool, { path_id: 'p-1', name: 'Main' })
    expect(rpcs).toEqual([{ fn: 'rename_path', args: { path_id: 'p-1', new_name: 'Main' } }])
    expect(text).toBe('Path renamed.')
    expect(ledger).toEqual(['rename_path'])
  })
})

describe('the cell writes', () => {
  it('upsert_cell reads the slot, refuses an occupied one, and creates an empty one', async () => {
    await expect(
      write(upsertCellTool, { path_id: 'p', lane_id: 'l', step_id: 's', content: 'Caller books' }, { cells: [{ id: 'c-old' }] }),
    ).rejects.toThrow(/A cell already exists at that slot \(c-old\)/)
    const { text, calls, rpcs, ledger } = await write(
      upsertCellTool,
      { path_id: 'p', lane_id: 'l', step_id: 's', content: 'Caller books' },
      { cells: [], lanes: null },
      () => ({ id: 'c-1', inserted: true }),
    )
    expect(calls.map((call) => call.table)).toEqual(['cells', 'lanes'])
    expect(rpcs).toEqual([{ fn: 'upsert_cell', args: { path_id: 'p', lane_id: 'l', step_id: 's', content: 'Caller books' } }])
    expect(text).toBe('Created cell (c-1).')
    expect(ledger).toEqual(['upsert_cell'])
  })

  it('upsert_cell says so when the race the guard cannot close was lost', async () => {
    const { text } = await write(
      upsertCellTool,
      { path_id: 'p', lane_id: 'l', step_id: 's', content: 'Caller books' },
      { cells: [] },
      () => ({ id: 'c-1', inserted: false }),
    )
    expect(text).toMatch(/already filled; the existing cell \(c-1\) was updated in place/)
  })

  const cellRow = {
    content: 'Before',
    summary: 'tl;dr',
    owner: 'ops',
    perceived_owner: null,
    status: 'proposed',
    function: 'Books',
    form: 'Form',
    value_props: [{ for: 'caller', value: 'speed' }],
    lane_id: 'l-1',
  }

  it('update_cell refuses a call that names no field, before reading', async () => {
    const { calls } = recordingClient()
    await expect(write(updateCellTool, { cell_id: 'c-1' })).rejects.toThrow(/Name at least one field/)
    expect(calls).toEqual([])
  })

  it('update_cell writes the text half, keeping the fields it did not name and the status', async () => {
    const { calls, text, ledger } = await write(updateCellTool, { cell_id: 'c-1', summary: 'New tl;dr' }, { cells: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'c-1' }] : cellRow) })
    const update = calls.find((call) => call.ops.some(([op]) => op === 'update'))!
    expect(update.ops.find(([op]) => op === 'update')![1]).toEqual({
      content: 'Before',
      summary: 'New tl;dr',
      owner: 'ops',
      perceived_owner: null,
      status: 'proposed',
    })
    expect(text).toBe('Cell text updated.')
    expect(ledger).toEqual(['update_cell_content'])
  })

  it('update_cell writes both halves when both are named, and the reply counts two entries', async () => {
    const { text, ledger } = await write(updateCellTool, { cell_id: 'c-1', content: 'After', function: 'Confirms' }, { cells: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'c-1' }] : cellRow) })
    expect(text).toBe('Cell updated (text and spec — two entries in the change list).')
    expect(ledger).toEqual(['update_cell_content', 'update_cell_spec'])
  })

  it('update_cell reads a blank as keep, not as clear', async () => {
    const { calls } = await write(updateCellTool, { cell_id: 'c-1', owner: '  ', form: 'Screen' }, { cells: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'c-1' }] : cellRow) })
    const updates = calls.filter((call) => call.ops.some(([op]) => op === 'update'))
    expect(updates).toHaveLength(1)
    expect(updates[0]!.ops.find(([op]) => op === 'update')![1]).toMatchObject({ form: 'Screen', function: 'Books' })
  })

  it('create_cell_dependency writes the label as the note and defaults the kind', async () => {
    const { rpcs, text, ledger } = await write(
      createCellDependencyTool,
      { source_cell_id: 'c-1', target_cell_id: 'c-2', label: 'Only once the account exists' },
      {},
      () => ({ id: 'd-1', inserted: true }),
    )
    expect(rpcs[0]).toEqual({
      fn: 'set_cell_dependency',
      args: { source_cell_id: 'c-1', target_cell_id: 'c-2', kind: 'leads_to', name: null, note: 'Only once the account exists' },
    })
    expect(text).toBe('Dependency created (d-1).')
    expect(ledger).toEqual(['set_cell_dependency'])
    await expect(
      write(createCellDependencyTool, { source_cell_id: 'c-1', target_cell_id: 'c-2', kind: 'causes' }),
    ).rejects.toThrow(/kind/)
  })
})

describe('the cast writes', () => {
  it('create_stakeholder inserts an actor and refuses a team', async () => {
    const { calls, text, ledger } = await write(createStakeholderTool, { name: 'Dispatcher', kind: 'staff', aliases: ['dispatch'] }, { stakeholders: { id: 'st-1' } })
    expect(calls[0]!.ops[0]).toEqual(['insert', { name: 'Dispatcher', kind: 'staff', summary: null, aliases: ['dispatch'] }])
    expect(text).toBe('Added stakeholder (st-1).')
    expect(ledger).toEqual(['create_stakeholder'])
    await expect(write(createStakeholderTool, { name: 'Ops', kind: 'team' })).rejects.toThrow(/kind/)
  })

  it('update_stakeholder patches the fields named and carries the rest, kind included', async () => {
    const row = { name: 'Ops', kind: 'team', summary: null, aliases: ['operations'] }
    const { calls, text, ledger } = await write(updateStakeholderTool, { stakeholder_id: 'st-1', summary: 'Runs the floor' }, { stakeholders: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'st-1' }] : row) })
    const update = calls.find((call) => call.ops.some(([op]) => op === 'update'))!
    expect(update.ops.find(([op]) => op === 'update')![1]).toEqual({ name: 'Ops', kind: 'team', summary: 'Runs the floor', aliases: ['operations'] })
    expect(text).toBe('Stakeholder updated.')
    expect(ledger).toEqual(['update_stakeholder'])
  })
})

describe('the slice writes', () => {
  const sliceRow = { id: 'sl-1', title: 'Caller view', summary: null, kind: 'journey', actor: null, authorship: 'human', updated_at: '2026-01-01T00:00:00Z' }

  it('create_slice refuses no cells, and reads description as summary for a model taught the old wire', async () => {
    await expect(write(createSliceTool, { title: 'Caller view', kind: 'journey', cell_ids: [] })).rejects.toThrow(/non-empty array/)
    expect(toolSpec(createSliceTool).parameters.properties).not.toHaveProperty('description')
    const { calls, text, ledger } = await write(
      createSliceTool,
      { title: 'Caller view', kind: 'journey', cell_ids: ['c-1', 'c-2'], description: 'What the caller sees' },
      { slices: sliceRow, slides: [] },
    )
    expect(calls[0]!.ops[0]).toEqual(['insert', { service_id: 'svc-1', title: 'Caller view', summary: 'What the caller sees', kind: 'journey', actor: null, authorship: 'human' }])
    expect(text).toBe('Created slice "Caller view" (sl-1) with one slide per cell — replace_slides regroups them.')
    expect(ledger).toEqual(['create_slice'])
  })

  it('update_slice patches under the concurrency token and words a conflict', async () => {
    const { calls, text, ledger } = await write(updateSliceTool, { slice_id: 'sl-1', title: 'Renamed' }, { slices: (ops) => (ops.some(([op]) => op === 'update') ? [{ ...sliceRow, title: 'Renamed' }] : sliceRow) })
    const update = calls.find((call) => call.ops.some(([op]) => op === 'update'))!
    expect(update.ops).toContainEqual(['eq', 'updated_at', sliceRow.updated_at])
    expect(update.ops.find(([op]) => op === 'update')![1]).toMatchObject({ title: 'Renamed', kind: 'journey' })
    expect(text).toBe('Slice updated.')
    expect(ledger).toEqual(['update_slice_meta'])
    await expect(
      write(updateSliceTool, { slice_id: 'sl-1', title: 'Again' }, { slices: (ops) => (ops.some(([op]) => op === 'update') ? [] : sliceRow) }),
    ).rejects.toThrow(/changed since you read it/)
  })

  it('replace_slides refuses an empty list and replaces the slides wholesale', async () => {
    await expect(write(replaceSlidesTool, { slice_id: 'sl-1', slides: [] })).rejects.toThrow(/non-empty array/)
    const { text, calls, ledger } = await write(replaceSlidesTool, { slice_id: 'sl-1', slides: [{ cells: ['c-1', 'c-2'], title: 'Arrive' }, { cells: ['c-3'] }] }, { slides: [] })
    const inserted = calls.find((call) => call.table === 'slides' && call.ops.some(([op]) => op === 'insert'))!
    expect(inserted.ops.find(([op]) => op === 'insert')![1]).toMatchObject([
      { slice_id: 'sl-1', position: 0, cell_ids: ['c-1', 'c-2'], title: 'Arrive' },
      { slice_id: 'sl-1', position: 1, cell_ids: ['c-3'], title: null },
    ])
    expect(text).toBe("Replaced the slice's slides (2).")
    expect(ledger).toEqual(['replace_slides'])
  })
})

describe('the provenance writes', () => {
  it('create_evidence inserts under the active service with the cell as its own key, and refuses a kind outside the CHECK', async () => {
    const { calls, text, ledger } = await write(createEvidenceTool, { cell_id: 'c-1', kind: 'interview', title: 'Onboarding interview #4' }, { evidence: { id: 'e-1' } })
    expect(calls[0]!.ops[0]).toEqual(['insert', expect.objectContaining({ service_id: 'svc-1', cell_id: 'c-1', cell_key: 'c-1', kind: 'interview', title: 'Onboarding interview #4', note: null })])
    expect(text).toBe('Evidence added (e-1).')
    expect(ledger).toEqual(['add_evidence'])
    await expect(write(createEvidenceTool, { cell_id: 'c-1', kind: 'rumour', title: 'x' })).rejects.toThrow(/kind/)
  })

  it('update_evidence patches only what it is given', async () => {
    const before = { id: 'e-1', kind: 'doc', title: 'Spec', note: 'v1' }
    const { calls, text, ledger } = await write(updateEvidenceTool, { evidence_id: 'e-1', note: 'v2' }, { evidence: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'e-1' }] : before) })
    const update = calls.find((call) => call.ops.some(([op]) => op === 'update'))!
    expect(update.ops.find(([op]) => op === 'update')![1]).toEqual({ kind: 'doc', title: 'Spec', note: 'v2' })
    expect(text).toBe('Evidence updated.')
    expect(ledger).toEqual(['update_evidence'])
  })
})

describe('the finding writes', () => {
  it('create_finding refuses a zero-cell finding with no scope, before touching the database', async () => {
    const { calls } = recordingClient()
    await expect(
      write(createFindingTool, { source: 'audit', check_key: 'gap-sweep', severity: 'warn', impact: 'high', effort: 'low', summary: 'A gap' }),
    ).rejects.toThrow(/needs a scope/)
    expect(calls).toEqual([])
  })

  it('create_finding refuses a finding missing either rating, as it refuses one missing a severity', async () => {
    const { calls } = recordingClient()
    const finding = { source: 'audit', check_key: 'gap-sweep', severity: 'warn', impact: 'high', effort: 'low', summary: 'A gap', cell_ids: ['c-1'] }
    for (const missing of ['impact', 'effort', 'severity'] as const) {
      const { [missing]: _dropped, ...args } = finding
      await expect(write(createFindingTool, args)).rejects.toThrow(new RegExp(missing))
    }
    await expect(write(createFindingTool, { ...finding, effort: 'huge' })).rejects.toThrow(/effort/)
    expect(calls).toEqual([])
  })

  it('create_finding records a new finding and hands back a run id to reuse', async () => {
    const { calls, text, ledger } = await write(
      createFindingTool,
      { source: 'audit', check_key: 'gap-sweep', severity: 'warn', impact: 'high', effort: 'low', summary: 'A gap', cell_ids: ['c-1'], run_id: 'run-9' },
      { audit_findings: (ops) => (ops.some(([op]) => op === 'insert') ? { id: 'f-1' } : []) },
    )
    const insert = calls.find((call) => call.ops.some(([op]) => op === 'insert'))!
    expect(insert.ops.find(([op]) => op === 'insert')![1]).toMatchObject({ service_id: 'svc-1', run_id: 'run-9', source: 'audit', check_key: 'gap-sweep', severity: 'warn', impact: 'high', effort: 'low', cell_ids: ['c-1'] })
    expect(text).toBe('Recorded warn finding (impact high, effort low) for gap-sweep. run_id run-9; reuse it for the rest of this run.')
    expect(ledger).toEqual(['create_finding'])
  })

  it('create_finding reports a dismissed twin and writes nothing', async () => {
    const { text, ledger } = await write(
      createFindingTool,
      { source: 'whatif', check_key: 'gap-sweep', severity: 'info', impact: 'low', effort: 'low', summary: 'A gap', scope: 'scenario:Intake:orphan' },
      { audit_findings: [{ id: 'f-0', status: 'dismissed' }] },
    )
    expect(text).toMatch(/dismissed stays dismissed\. Nothing recorded\./)
    expect(ledger).toEqual([])
  })

  it('update_finding moves the status and refuses one outside the three', async () => {
    const before = { id: 'f-1', check_key: 'gap-sweep', severity: 'warn', summary: 'A gap', run_id: 'run-9', cell_ids: [], cell_keys: [], source: 'audit', status: 'open' }
    const { text, calls, ledger } = await write(updateFindingTool, { finding_id: 'f-1', status: 'resolved' }, { audit_findings: (ops) => (ops.some(([op]) => op === 'update') ? [{ id: 'f-1' }] : before) })
    const update = calls.find((call) => call.ops.some(([op]) => op === 'update'))!
    expect(update.ops.find(([op]) => op === 'update')![1]).toEqual({ status: 'resolved' })
    expect(text).toBe('Finding is now resolved.')
    expect(ledger).toEqual(['update_finding'])
    await expect(write(updateFindingTool, { finding_id: 'f-1', status: 'closed' })).rejects.toThrow(/status/)
  })
})

describe('through the dispatcher', () => {
  it('a write called in the no-database trial lands on the trial refusal', async () => {
    const text = await dispatchTool(null, 'session', 'create_step', { path_id: 'p', name: 'x' })
    expect(text).toMatch(/"create_step" does not exist here/)
  })

  it('a name that is no tool is refused as off the allow-list', async () => {
    const { client } = recordingClient()
    expect(await dispatchTool(client, 'session', 'delete_cell', { cell_id: 'c' })).toMatch(/not on the allow-list/)
  })
})
