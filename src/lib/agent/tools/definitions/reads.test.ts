import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SAMPLE_BLUEPRINTS_BY_SCENARIO, SAMPLE_DEMO_SLICES } from '@/data/sampleBlueprint'
import { runTool, toolSpec, type ToolDefinition } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import {
  compareBlueprintTool,
  getBlueprintTool,
  listLanesTool,
  listOwnerTagsTool,
  measureDeletionImpactTool,
  searchBlueprintTool,
} from '@/lib/agent/tools/definitions/blueprint'
import { listCellDependenciesTool } from '@/lib/agent/tools/definitions/cells'
import { getEvidenceTool, listEvidenceTool } from '@/lib/agent/tools/definitions/evidence'
import { getReferenceTool, listReferencesTool } from '@/lib/agent/tools/definitions/references'
import { getBusinessModelTool } from '@/lib/agent/tools/definitions/service'
import {
  getChangeHistoryTool,
  getSessionTool,
  listSessionsTool,
} from '@/lib/agent/tools/definitions/sessions'
import { getSliceTool, listSlicesTool } from '@/lib/agent/tools/definitions/slices'
import { listStakeholdersTool } from '@/lib/agent/tools/definitions/stakeholders'
import { getUiStateTool, listUiCommandsTool } from '@/lib/agent/tools/definitions/ui'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { getSession, listSessions, getChanges } from '@/lib/agent/tools/browserHistory'

/*
 * Every read tool, through its own interface: `run(args, ctx)` with a
 * context built by hand. A read with a sample answer is run against the
 * bundled sample with no client; a read that needs the database is run
 * against a client that records what it was asked, and refused without
 * one. `list_blueprint`, `list_findings` and `get_cell` have their own
 * files; the rest are here so that no read is tested only through the
 * dispatcher.
 */

type Call = { table: string; ops: Array<[string, ...unknown[]]> }

/**
 * A client that records every chained call and settles with whatever the
 * test says a table holds. A Proxy rather than a hand-listed builder, so a
 * read that adds one PostgREST verb does not break every fake that never
 * meant to assert on it.
 */
function recordingClient(answer: (table: string) => unknown = () => []): {
  client: SupabaseClient<Database>
  calls: Call[]
} {
  const calls: Call[] = []
  const builder = (table: string) => {
    const call: Call = { table, ops: [] }
    calls.push(call)
    const settle = () => Promise.resolve({ data: answer(table), error: null })
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
  return {
    client: { from: builder } as unknown as SupabaseClient<Database>,
    calls,
  }
}

const sample = fakeToolContext({ history: { getSession, listSessions, getChanges } })
const scenarioId = Object.keys(SAMPLE_BLUEPRINTS_BY_SCENARIO)[0]!
const sampleEdge = Object.values(SAMPLE_BLUEPRINTS_BY_SCENARIO)
  .flat()
  .flatMap((blueprint) => blueprint.dependencies)[0]!

describe('every read definition derives a plain object schema', () => {
  for (const tool of TOOL_DEFINITIONS.filter((entry) => entry.surface === 'read')) {
    it(`${tool.name}`, () => {
      const spec = toolSpec(tool)
      expect(spec.parameters.type).toBe('object')
      expect(spec.parameters).not.toHaveProperty('$schema')
      expect(spec.parameters).not.toHaveProperty('additionalProperties')
      expect(spec.description.length).toBeGreaterThan(20)
    })
  }
})

describe('reads with a sample answer give it when the context has no client', () => {
  it('get_reference serves a bundled reference, and names the rest for an unknown one', async () => {
    expect(await runTool(getReferenceTool, { name: 'lane-roles' }, sample)).toMatch(/lane/i)
    expect(await runTool(getReferenceTool, { name: 'nope' }, sample)).toMatch(
      /Unknown reference "nope"\. Available: /,
    )
  })

  it('list_references names every reference', async () => {
    expect(await runTool(listReferencesTool, {}, sample)).toContain('- lane-roles')
  })

  it('get_blueprint renders a sample scenario, and says so for an unknown one', async () => {
    expect(await runTool(getBlueprintTool, { scenario_id: scenarioId }, sample)).toContain(
      'Lane "',
    )
    expect(await runTool(getBlueprintTool, { scenario_id: 'nope' }, sample)).toBe(
      'No paths in this scenario.',
    )
  })

  it('compare_blueprint compares a sample scenario', async () => {
    expect(
      typeof (await runTool(compareBlueprintTool, { scenario_id: scenarioId }, sample)),
    ).toBe('string')
  })

  it('list_slices and get_slice read the demo slices', async () => {
    const slice = SAMPLE_DEMO_SLICES[0]!
    expect(await runTool(listSlicesTool, {}, sample)).toContain(slice.id)
    expect(await runTool(getSliceTool, { slice_id: slice.id }, sample)).toContain(
      `slice "${slice.title}"`,
    )
  })

  it('list_owner_tags and list_lanes read the vocabularies in use', async () => {
    expect(await runTool(listOwnerTagsTool, {}, sample)).not.toBe('No owner tags in use yet.')
    expect(await runTool(listLanesTool, {}, sample)).not.toBe('No lanes defined yet.')
  })

  it('list_cell_dependencies reads the arrows, whole and scoped', async () => {
    expect(await runTool(listCellDependenciesTool, {}, sample)).toContain(sampleEdge.id)
    expect(
      await runTool(listCellDependenciesTool, { cell_id: sampleEdge.source_cell_id }, sample),
    ).toContain(sampleEdge.target_cell_id)
    // A blank optional reads as absent — the whole graph, not a cell called "".
    expect(await runTool(listCellDependenciesTool, { cell_id: '  ' }, sample)).toContain(
      sampleEdge.id,
    )
  })

  it('list_sessions and get_session answer from the session store, which is empty here', async () => {
    expect(await runTool(listSessionsTool, {}, sample)).toBe('No past sessions.')
    expect(typeof (await runTool(getSessionTool, { session_id: 'nope' }, sample))).toBe('string')
  })

  it('get_ui_state relays what the context reports, and says when nothing is', async () => {
    expect(await runTool(getUiStateTool, {}, sample)).toBe(
      'No UI state is being reported right now.',
    )
    const reporting = fakeToolContext({ ui: { ...sample.ui, uiState: () => 'view: phases' } })
    expect(await runTool(getUiStateTool, {}, reporting)).toBe('view: phases')
  })
})

describe('reads that need the database ask it, and are refused without it', () => {
  const needsClient: Array<[ToolDefinition, Record<string, unknown>]> = [
    [searchBlueprintTool, { query: 'quote' }],
    [listStakeholdersTool, {}],
    [listEvidenceTool, {}],
    [getEvidenceTool, { evidence_ids: ['e-1'] }],
    [getBusinessModelTool, {}],
    [measureDeletionImpactTool, { kind: 'path', target_id: 'p-1' }],
    [listUiCommandsTool, {}],
  ]
  for (const [tool] of needsClient) {
    it(`${tool.name} is not offered to the trial`, () => {
      expect(tool.availability.sample).toBe(false)
    })
  }
  for (const [tool, args] of needsClient.filter(([t]) => t.name !== 'list_ui_commands')) {
    it(`${tool.name} refuses to run with no client`, async () => {
      await expect(runTool(tool, args, sample)).rejects.toThrow(/No database in this session/)
    })
  }

  it('list_stakeholders reads the cast, resolving scope first', async () => {
    const { client, calls } = recordingClient(() => [])
    const text = await runTool(listStakeholdersTool, {}, fakeToolContext({ client }))
    expect(calls.map((call) => call.table)).toEqual(['services', 'stakeholders'])
    expect(text).toBe('No stakeholders registered yet.')
  })

  it('list_evidence reads the newest rows, narrowed to a cell when asked', async () => {
    const { client, calls } = recordingClient(() => [])
    await runTool(listEvidenceTool, { cell_id: 'c-1' }, fakeToolContext({ client }))
    expect(calls[0]!.table).toBe('evidence')
    expect(calls[0]!.ops).toContainEqual(['eq', 'cell_id', 'c-1'])
  })

  it('get_evidence reads the ids it is given, and asks for one when given none', async () => {
    const { client, calls } = recordingClient(() => [])
    await runTool(getEvidenceTool, { evidence_ids: ['e-1', 'e-2'] }, fakeToolContext({ client }))
    expect(calls[0]!.ops).toContainEqual(['in', 'id', ['e-1', 'e-2']])
    expect(
      await runTool(getEvidenceTool, { evidence_ids: [] }, fakeToolContext({ client })),
    ).toBe('Pass at least one evidence id.')
  })

  it('get_business_model reads the one row', async () => {
    const { client, calls } = recordingClient(() => null)
    const text = await runTool(getBusinessModelTool, {}, fakeToolContext({ client }))
    expect(calls.length).toBeGreaterThan(0)
    expect(typeof text).toBe('string')
  })

  it('measure_deletion_impact refuses a kind outside the five, and a step with no path', async () => {
    const { client, calls } = recordingClient(() => [])
    await expect(
      runTool(measureDeletionImpactTool, { kind: 'cell', target_id: 'x' }, fakeToolContext({ client })),
    ).rejects.toThrow(/kind/)
    await expect(
      runTool(measureDeletionImpactTool, { kind: 'step', target_id: 's-1' }, fakeToolContext({ client })),
    ).rejects.toThrow(/scope_id = the path id/)
    expect(calls).toEqual([])
  })

  it('get_change_history answers from the ledger, empty in a fresh session', async () => {
    const { client } = recordingClient()
    expect(await runTool(getChangeHistoryTool, {}, fakeToolContext({ client }))).toBe(
      'No changes recorded in this browser session yet.',
    )
  })

  it('list_ui_commands lists what is registered, which is nothing here', async () => {
    const { client } = recordingClient()
    expect(typeof (await runTool(listUiCommandsTool, {}, fakeToolContext({ client })))).toBe(
      'string',
    )
  })
})
