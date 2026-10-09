import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getBlueprint, getCell } from '@/lib/agent/tools/read'
import { runTool } from '@/lib/agent/tools/definition'
import { listFindingsTool } from '@/lib/agent/tools/definitions/findings'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { formatBlueprints } from '@/lib/agent/tools/format'
import { TOOL_SPECS } from '@/lib/agent/tools/specs'

/*
 * What the agent can read back of what it, or the human, wrote.
 *
 * Three reads that each dropped something the board already holds: the grid
 * read joined the dependency arrows and never rendered them, the cell read
 * never selected the cell's resources, and the findings ledger could not be
 * asked about one cell. Each is pinned here against a recording client, so the
 * query the read sends is asserted alongside the text it returns.
 */

type Rec = {
  table: string
  select?: string
  calls: Array<[string, ...unknown[]]>
}

function fakeClient(answer: (rec: Rec) => unknown): {
  client: SupabaseClient<Database>
  log: Rec[]
} {
  const log: Rec[] = []
  function builder(table: string) {
    const rec: Rec = { table, calls: [] }
    log.push(rec)
    const settle = () => Promise.resolve({ data: answer(rec), error: null })
    const b = {
      select(sel: string) {
        rec.select = sel
        return b
      },
      eq(...args: unknown[]) {
        rec.calls.push(['eq', ...args])
        return b
      },
      contains(...args: unknown[]) {
        rec.calls.push(['contains', ...args])
        return b
      },
      order() {
        return b
      },
      limit() {
        return b
      },
      range(...args: unknown[]) {
        rec.calls.push(['range', ...args])
        return b
      },
      maybeSingle: settle,
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return settle().then(onF, onR)
      },
    }
    return b
  }
  return {
    client: { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>,
    log,
  }
}

const RAW_PATH = {
  id: 'p-1',
  name: 'Main path',
  kind: 'happy',
  scenario_id: 'sc-1',
  lanes: [{ id: 'l-1', name: 'Customer', lane_role: 'customer_actions', position: 0 }],
  path_steps: [
    { position: 1, steps: { id: 's-1', name: 'Ask' } },
    { position: 2, steps: { id: 's-2', name: 'Receive' } },
  ],
  cells: [
    {
      id: 'c-1',
      lane_id: 'l-1',
      step_id: 's-1',
      content: 'Customer asks for a quote',
      outgoing: [
        { id: 'd-1', target_cell_id: 'c-2', kind: 'leads_to', name: null, note: null },
      ],
    },
    {
      id: 'c-2',
      lane_id: 'l-1',
      step_id: 's-2',
      content: 'Customer receives the quote',
      outgoing: [],
    },
  ],
}

describe('get_blueprint shows the arrows it already joins', () => {
  it('renders each dependency edge, source-first, with its kind and id', async () => {
    const { client } = fakeClient(() => [RAW_PATH])
    const text = await getBlueprint(client, 'sc-1')
    expect(text).toContain('Edges (1):')
    expect(text).toContain('c-1 --leads_to--> c-2 (d-1)')
  })

  it('adds no edge section to a path that has none', () => {
    const text = formatBlueprints([
      {
        path: { id: 'p-2', name: 'Alone', kind: 'happy' } as never,
        steps: [],
        lanes: [],
        cells: [],
        dependencies: [],
      },
    ])
    expect(text).not.toContain('Edges')
  })

  it('says so in its description', () => {
    const spec = TOOL_SPECS.find((entry) => entry.name === 'get_blueprint')
    expect(spec?.description).toMatch(/dependency arrows/i)
  })
})

describe("get_cell includes the cell's resources", () => {
  it('selects the resource rows and reads each one out', async () => {
    const { client, log } = fakeClient(() => ({
      id: 'c-1',
      content: 'Customer asks for a quote',
      lane_id: 'l-1',
      step_id: 's-1',
      position: 0,
      resources: [
        { id: 'r-2', position: 1, kind: 'link', name: 'Pricing sheet', url: 'https://example.com/pricing' },
        { id: 'r-1', position: 0, kind: 'attachment', name: 'Intake form', url: 'https://example.com/form.pdf' },
      ],
    }))
    const text = await getCell(client, 'c-1')
    expect(log[0]!.select).toContain('resources!resources_cell_id_fkey')
    expect(text).toContain(
      'resources: Intake form https://example.com/form.pdf; Pricing sheet https://example.com/pricing',
    )
  })

  it('says nothing about resources for a cell that has none', async () => {
    const { client } = fakeClient(() => ({
      id: 'c-2',
      content: 'Customer receives the quote',
      lane_id: 'l-1',
      step_id: 's-2',
      position: 0,
      resources: [],
    }))
    expect(await getCell(client, 'c-2')).not.toContain('resources:')
  })
})

describe('list_findings answers for one cell', () => {
  const CELL = '0f5c8a52-1f7e-4d4b-9d7a-0a2f6c1b3e44'

  it('takes a cell_id argument', () => {
    const spec = TOOL_SPECS.find((entry) => entry.name === 'list_findings')
    expect(Object.keys(spec?.parameters.properties ?? {})).toContain('cell_id')
  })

  it('narrows the ledger to findings that cite the cell', async () => {
    const { client, log } = fakeClient(() => [])
    const text = await runTool(listFindingsTool, { cell_id: CELL }, fakeToolContext({ client }))
    const findings = log.find((rec) => rec.table === 'audit_findings')
    expect(findings?.calls).toContainEqual(['contains', 'cell_ids', [CELL]])
    expect(text).toBe(`No open findings touch cell ${CELL}.`)
  })

  it('reads the whole ledger when no cell is named', async () => {
    const { client, log } = fakeClient(() => [])
    const text = await runTool(listFindingsTool, { status: 'all' }, fakeToolContext({ client }))
    const findings = log.find((rec) => rec.table === 'audit_findings')
    expect(findings?.calls.some(([op]) => op === 'contains')).toBe(false)
    expect(text).toBe('No findings recorded yet.')
  })

  it('reads the ratings back, in priority order, with an old row shown as unrated', async () => {
    const row = (id: string, impact: string | null, effort: string | null, severity = 'warn') => ({
      id,
      source: 'audit',
      check_key: 'gap-sweep',
      severity,
      impact,
      effort,
      summary: null,
      status: 'open',
      cell_ids: ['c-1'],
      created_at: '2026-10-09T00:00:00Z',
    })
    // Newest first, as the query returns them — the read regroups them.
    const { client, log } = fakeClient(() => [
      row('f-old', null, null, 'critical'),
      row('f-plan', 'high', 'high'),
      row('f-do', 'high', 'low'),
    ])
    const text = await runTool(listFindingsTool, {}, fakeToolContext({ client }))
    expect(log.find((rec) => rec.table === 'audit_findings')?.select).toMatch(/impact, effort, fingerprint/)
    expect(text).toBe(
      [
        'Do first:',
        'f-do [warn · impact high · effort low] gap-sweep (audit, open, 2026-10-09) cells:1',
        'Plan:',
        'f-plan [warn · impact high · effort high] gap-sweep (audit, open, 2026-10-09) cells:1',
        'Later:',
        'f-old [critical · unrated] gap-sweep (audit, open, 2026-10-09) cells:1',
      ].join('\n'),
    )
  })

  it('ranks every open finding before it caps the list, and says what the cap left out', async () => {
    const row = (id: string, impact: string, effort: string, created_at: string) => ({
      id,
      source: 'audit',
      check_key: 'gap-sweep',
      severity: 'warn',
      impact,
      effort,
      summary: null,
      status: 'open',
      cell_ids: [],
      created_at,
    })
    // 120 newer Later findings, then one old Do-first finding, newest first
    // as the query returns them. A newest-first cut at 100 would lose it.
    const later = Array.from({ length: 120 }, (_, n) =>
      row(`f-later-${n}`, 'low', 'high', '2026-10-09T00:00:00Z'),
    )
    const all = [...later, row('f-do-old', 'high', 'low', '2026-01-01T00:00:00Z')]
    const { client, log } = fakeClient((rec) => {
      const range = rec.calls.find(([op]) => op === 'range') as [string, number, number]
      return all.slice(range[1], range[2] + 1)
    })
    const text = await runTool(listFindingsTool, {}, fakeToolContext({ client }))
    const lines = text.split('\n')
    expect(lines.slice(0, 2)).toEqual([
      'Do first:',
      'f-do-old [warn · impact high · effort low] gap-sweep (audit, open, 2026-01-01) cells:0',
    ])
    expect(lines.filter((line) => line.startsWith('f-'))).toHaveLength(100)
    expect(lines.at(-1)).toBe(
      '21 more lower in priority order not listed (121 in all). Narrow with status or cell_id to see them.',
    )
    // Read by range, never by a limit that would cut before the ranking.
    const read = log.find((rec) => rec.table === 'audit_findings')
    expect(read?.calls).toContainEqual(['range', 0, 499])
  })
})

describe('the dependency tool tells the two kinds apart', () => {
  it('says leads_to and enables are not inverses', () => {
    const spec = TOOL_SPECS.find((entry) => entry.name === 'create_cell_dependency')
    expect(spec?.description).toMatch(/NOT inverses/)
  })
})
