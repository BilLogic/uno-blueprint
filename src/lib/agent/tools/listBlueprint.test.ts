import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { listBlueprint } from '@/lib/agent/tools/read'
import { sampleListBlueprint } from '@/lib/agent/tools/sampleRead'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import { GRANULARITY_LEVELS } from '@/lib/agent/tools/format'
import { runTool } from '@/lib/agent/tools/definition'
import {
  LANE_ROLE_FILTER_DESCRIPTION,
  listBlueprintTool,
} from '@/lib/agent/tools/definitions/blueprint'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { TOOL_SPECS } from '@/lib/agent/tools/specs'
import type { ServiceScope } from '@/lib/agent/tools/serviceScope'
import {
  SAMPLE_BLUEPRINTS_BY_SCENARIO,
  SAMPLE_PHASES,
  SAMPLE_SCENARIOS,
  SAMPLE_SERVICE_ID,
} from '@/data/sampleBlueprint'

/*
 * `list_blueprint` — the complete set at one or more rungs of the journey walk.
 *
 * `list_` is a promise about the answer: every row at the level asked for, in
 * walk order, clipped only at the caller's own limit, under a header that
 * carries the true total. These pin that promise from both sources the agent
 * reads — the database through PostgREST, and the bundled sample with no
 * database at all — and pin that the two give the same text for the same board.
 */

type Row = Record<string, unknown>
type Rec = {
  table: string
  count?: string
  eq: Array<[string, unknown]>
  range?: [number, number]
}

/**
 * A PostgREST stand-in that behaves like the real one where this read depends
 * on it: `eq` filters, `range` pages, `count: 'exact'` reports the whole match,
 * and no single response carries more than `maxRows` rows. That last one is the
 * server's own cap, which a read that does not page mistakes for the end.
 */
function fakeDb(tables: Record<string, Row[]>, maxRows = 1000) {
  const log: Rec[] = []
  function builder(table: string) {
    const rec: Rec = { table, eq: [] }
    const b = {
      select(_columns: string, options?: { count?: string }) {
        rec.count = options?.count
        return b
      },
      eq(column: string, value: unknown) {
        rec.eq.push([column, value])
        return b
      },
      order() {
        return b
      },
      range(from: number, to: number) {
        rec.range = [from, to]
        return b
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        log.push(rec)
        const matched = (tables[table] ?? []).filter((row) =>
          rec.eq.every(([column, value]) => row[column] === value),
        )
        const [from, to] = rec.range ?? [0, matched.length - 1]
        const data = matched.slice(from, Math.min(to + 1, from + maxRows))
        const count = rec.count === 'exact' ? matched.length : null
        return Promise.resolve({ data, error: null, count }).then(onF, onR)
      },
    }
    return b
  }
  const client = {
    from: (table: string) => builder(table),
  } as unknown as SupabaseClient<Database>
  return { client, log }
}

/*
 * Two services, three phases, four paths. The rows are deliberately out of
 * order in every table: the order an answer comes back in is the walk's job,
 * not the database's.
 */
const BOARD: Record<string, Row[]> = {
  services: [
    { id: 'svc-a', name: 'Support Desk', slug: 'support-desk', created_at: '2026-01-01' },
    { id: 'svc-b', name: 'Sales Pipeline', slug: 'sales-pipeline', created_at: '2026-02-01' },
  ],
  phases: [
    { id: 'ph-2', name: 'Resolve', summary: null, position: 2, service_id: 'svc-a' },
    { id: 'ph-3', name: 'Prospecting', summary: null, position: 1, service_id: 'svc-b' },
    { id: 'ph-1', name: 'Intake', summary: 'Arrive', position: 1, service_id: 'svc-a' },
  ],
  scenarios: [
    { id: 'sc-2', phase_id: 'ph-2', name: 'Close the ticket', summary: null, position: 1 },
    { id: 'sc-1', phase_id: 'ph-1', name: 'Report a fault', summary: 'The caller reports', position: 1 },
    { id: 'sc-3', phase_id: 'ph-3', name: 'Book a demo', summary: null, position: 1 },
  ],
  paths: [
    { id: 'pa-1', scenario_id: 'sc-1', name: 'Phone', summary: 'By phone', kind: 'happy' },
    { id: 'pa-2', scenario_id: 'sc-1', name: 'After hours', summary: null, kind: 'exception' },
    { id: 'pa-3', scenario_id: 'sc-2', name: 'Standard', summary: null, kind: 'happy' },
    { id: 'pa-4', scenario_id: 'sc-3', name: 'Demo', summary: null, kind: 'happy' },
  ],
  steps: [
    { id: 'st-2', scenario_id: 'sc-1', name: 'Triage', path_steps: [{ path_id: 'pa-1', position: 2 }] },
    {
      id: 'st-1',
      scenario_id: 'sc-1',
      name: 'Call in',
      path_steps: [
        { path_id: 'pa-1', position: 1 },
        { path_id: 'pa-2', position: 1 },
      ],
    },
    { id: 'st-3', scenario_id: 'sc-1', name: 'Voicemail', path_steps: [{ path_id: 'pa-2', position: 2 }] },
    { id: 'st-4', scenario_id: 'sc-2', name: 'Close', path_steps: [{ path_id: 'pa-3', position: 1 }] },
    { id: 'st-5', scenario_id: 'sc-3', name: 'Pitch', path_steps: [{ path_id: 'pa-4', position: 1 }] },
  ],
  lanes: [
    { id: 'la-2', path_id: 'pa-1', name: 'Agent', lane_role: 'frontstage_actions', position: 1 },
    { id: 'la-1', path_id: 'pa-1', name: 'Caller', lane_role: 'customer_actions', position: 0 },
    { id: 'la-3', path_id: 'pa-2', name: 'Caller', lane_role: 'customer_actions', position: 0 },
    { id: 'la-4', path_id: 'pa-3', name: 'Agent', lane_role: 'frontstage_actions', position: 0 },
    { id: 'la-5', path_id: 'pa-4', name: 'Rep', lane_role: 'frontstage_actions', position: 0 },
  ],
  cells: [
    {
      id: 'ce-2',
      path_id: 'pa-1',
      lane_id: 'la-2',
      step_id: 'st-2',
      content: 'Logs the fault\nand reads it back',
      summary: 'Ticket opened',
      position: 0,
    },
    { id: 'ce-3', path_id: 'pa-1', lane_id: 'la-1', step_id: 'st-2', content: 'Describes the fault', summary: null, position: 0 },
    { id: 'ce-1', path_id: 'pa-1', lane_id: 'la-1', step_id: 'st-1', content: 'Dials the support line', summary: null, position: 0 },
    { id: 'ce-4', path_id: 'pa-2', lane_id: 'la-3', step_id: 'st-3', content: 'Leaves a voicemail', summary: null, position: 0 },
    { id: 'ce-5', path_id: 'pa-3', lane_id: 'la-4', step_id: 'st-4', content: 'Closes the ticket', summary: null, position: 0 },
    { id: 'ce-6', path_id: 'pa-4', lane_id: 'la-5', step_id: 'st-5', content: 'Runs the demo', summary: null, position: 0 },
  ],
}

const SALES: ServiceScope = {
  kind: 'service',
  serviceId: 'svc-b',
  serviceName: 'Sales Pipeline',
}

const list = (options: Parameters<typeof listBlueprint>[1]) =>
  listBlueprint(fakeDb(BOARD).client, options)

const lines = (...rows: string[]) => rows.join('\n')

describe('list_blueprint answers at every rung', () => {
  it('phase — each service together, in journey order', async () => {
    expect(await list({ granularity: ['phase'] })).toBe(
      lines(
        '3 of 3:',
        '[phase] "Intake" · Intake — Arrive (ph-1)',
        '[phase] "Resolve" · Resolve (ph-2)',
        '[phase] "Prospecting" · Prospecting (ph-3)',
      ),
    )
  })

  it('scenario — under its phase', async () => {
    expect(await list({ granularity: ['scenario'] })).toBe(
      lines(
        '3 of 3:',
        '[scenario] "Report a fault" · Intake › Report a fault — The caller reports (sc-1)',
        '[scenario] "Close the ticket" · Resolve › Close the ticket (sc-2)',
        '[scenario] "Book a demo" · Prospecting › Book a demo (sc-3)',
      ),
    )
  })

  it('path — every path of every scenario, by name within one', async () => {
    expect(await list({ granularity: ['path'] })).toBe(
      lines(
        '4 of 4:',
        '[path] "After hours" · Intake › Report a fault › After hours (pa-2)',
        '[path] "Phone" · Intake › Report a fault › Phone — By phone (pa-1)',
        '[path] "Standard" · Resolve › Close the ticket › Standard (pa-3)',
        '[path] "Demo" · Prospecting › Book a demo › Demo (pa-4)',
      ),
    )
  })

  it('step — once each, under the first path that carries it', async () => {
    // `Call in` is on both paths of the scenario and is listed once.
    expect(await list({ granularity: ['step'] })).toBe(
      lines(
        '5 of 5:',
        '[step] "Call in" · Intake › Report a fault › After hours › Call in (st-1)',
        '[step] "Voicemail" · Intake › Report a fault › After hours › Voicemail (st-3)',
        '[step] "Triage" · Intake › Report a fault › Phone › Triage (st-2)',
        '[step] "Close" · Resolve › Close the ticket › Standard › Close (st-4)',
        '[step] "Pitch" · Prospecting › Book a demo › Demo › Pitch (st-5)',
      ),
    )
  })

  it('lane — one per path, with its role', async () => {
    expect(await list({ granularity: ['lane'] })).toBe(
      lines(
        '5 of 5:',
        '[lane] "Caller" · Intake › Report a fault › After hours › Caller — customer_actions (la-3)',
        '[lane] "Caller" · Intake › Report a fault › Phone › Caller — customer_actions (la-1)',
        '[lane] "Agent" · Intake › Report a fault › Phone › Agent — frontstage_actions (la-2)',
        '[lane] "Agent" · Resolve › Close the ticket › Standard › Agent — frontstage_actions (la-4)',
        '[lane] "Rep" · Prospecting › Book a demo › Demo › Rep — frontstage_actions (la-5)',
      ),
    )
  })

  it('cell — lane by lane in step order, named by its first line', async () => {
    expect(await list({ granularity: ['cell'] })).toBe(
      lines(
        '6 of 6:',
        '[cell] "Leaves a voicemail" · Intake › Report a fault › After hours › Voicemail › Caller (ce-4)',
        '[cell] "Dials the support line" · Intake › Report a fault › Phone › Call in › Caller (ce-1)',
        '[cell] "Describes the fault" · Intake › Report a fault › Phone › Triage › Caller (ce-3)',
        '[cell] "Logs the fault" · Intake › Report a fault › Phone › Triage › Agent — Ticket opened (ce-2)',
        '[cell] "Closes the ticket" · Resolve › Close the ticket › Standard › Close › Agent (ce-5)',
        '[cell] "Runs the demo" · Prospecting › Book a demo › Demo › Pitch › Rep (ce-6)',
      ),
    )
  })

  it('several rungs at once read as one walk — the orientation read', async () => {
    expect(await list({ granularity: ['scenario', 'phase'] })).toBe(
      lines(
        '6 of 6:',
        '[phase] "Intake" · Intake — Arrive (ph-1)',
        '[scenario] "Report a fault" · Intake › Report a fault — The caller reports (sc-1)',
        '[phase] "Resolve" · Resolve (ph-2)',
        '[scenario] "Close the ticket" · Resolve › Close the ticket (sc-2)',
        '[phase] "Prospecting" · Prospecting (ph-3)',
        '[scenario] "Book a demo" · Prospecting › Book a demo (sc-3)',
      ),
    )
    const mixed = (await list({ granularity: ['lane', 'cell'] })).split('\n')
    const at = (id: string) => mixed.findIndex((line) => line.endsWith(`(${id})`))
    expect(at('la-1')).toBeLessThan(at('ce-1'))
    expect(at('ce-3')).toBeLessThan(at('la-2'))
    expect(at('la-2')).toBeLessThan(at('ce-2'))
  })

  it('reads only the tables the rung needs', async () => {
    const { client, log } = fakeDb(BOARD)
    await listBlueprint(client, { granularity: ['phase'] })
    expect([...new Set(log.map((rec) => rec.table))]).toEqual(['phases'])
  })
})

describe('list_blueprint filters', () => {
  it('phase — by name, whatever its case', async () => {
    expect(await list({ granularity: ['scenario'], phase: 'INTAKE' })).toBe(
      lines(
        '1 of 1:',
        '[scenario] "Report a fault" · Intake › Report a fault — The caller reports (sc-1)',
      ),
    )
  })

  it('scenario — narrows, and drops the rung above it', async () => {
    expect(
      await list({ granularity: ['phase', 'scenario', 'path'], scenario: 'report a fault' }),
    ).toBe(
      lines(
        '3 of 3:',
        '[scenario] "Report a fault" · Intake › Report a fault — The caller reports (sc-1)',
        '[path] "After hours" · Intake › Report a fault › After hours (pa-2)',
        '[path] "Phone" · Intake › Report a fault › Phone — By phone (pa-1)',
      ),
    )
  })

  it('kind — keeps the paths of that kind and what hangs off them', async () => {
    expect(
      await list({ granularity: ['scenario', 'path', 'cell'], pathKind: 'exception' }),
    ).toBe(
      lines(
        '2 of 2:',
        '[path] "After hours" · Intake › Report a fault › After hours (pa-2)',
        '[cell] "Leaves a voicemail" · Intake › Report a fault › After hours › Voicemail › Caller (ce-4)',
      ),
    )
  })

  it('lane_role — keeps only lanes and cells in that role', async () => {
    expect(
      await list({ granularity: ['path', 'lane', 'cell'], laneRole: 'frontstage_actions' }),
    ).toBe(
      lines(
        '6 of 6:',
        '[lane] "Agent" · Intake › Report a fault › Phone › Agent — frontstage_actions (la-2)',
        '[cell] "Logs the fault" · Intake › Report a fault › Phone › Triage › Agent — Ticket opened (ce-2)',
        '[lane] "Agent" · Resolve › Close the ticket › Standard › Agent — frontstage_actions (la-4)',
        '[cell] "Closes the ticket" · Resolve › Close the ticket › Standard › Close › Agent (ce-5)',
        '[lane] "Rep" · Prospecting › Book a demo › Demo › Rep — frontstage_actions (la-5)',
        '[cell] "Runs the demo" · Prospecting › Book a demo › Demo › Pitch › Rep (ce-6)',
      ),
    )
  })

  it('says so when nothing is left', async () => {
    expect(await list({ granularity: ['scenario'], phase: 'Nowhere' })).toBe(
      'Nothing at that granularity within those filters.',
    )
  })

  it('refuses a word outside its vocabulary before reading anything', async () => {
    const { client, log } = fakeDb(BOARD)
    await expect(listBlueprint(client, { granularity: [] })).rejects.toThrow(
      /granularity is required/,
    )
    await expect(listBlueprint(client, { granularity: ['phases'] })).rejects.toThrow(
      /Unknown granularity: phases/,
    )
    await expect(
      listBlueprint(client, { granularity: ['path'], pathKind: 'sad' }),
    ).rejects.toThrow(/happy, variant, exception/)
    await expect(
      listBlueprint(client, { granularity: ['lane'], laneRole: 'support_systems' }),
    ).rejects.toThrow(/customer_actions/)
    expect(log).toEqual([])
  })
})

/** One phase, one path, one lane — and as many cells as asked for. */
function bigBoard(cells: number): Record<string, Row[]> {
  return {
    phases: [{ id: 'ph', name: 'Only', summary: null, position: 1, service_id: 'svc' }],
    scenarios: [{ id: 'sc', phase_id: 'ph', name: 'One', summary: null, position: 1 }],
    paths: [{ id: 'pa', scenario_id: 'sc', name: 'Main', summary: null, kind: 'happy' }],
    steps: [{ id: 'st', scenario_id: 'sc', name: 'Step', path_steps: [{ path_id: 'pa', position: 1 }] }],
    lanes: [{ id: 'la', path_id: 'pa', name: 'Lane', lane_role: null, position: 0 }],
    cells: Array.from({ length: cells }, (_, index) => ({
      id: `ce-${String(index).padStart(4, '0')}`,
      path_id: 'pa',
      lane_id: 'la',
      step_id: 'st',
      content: `Cell ${index}`,
      summary: null,
      position: index,
    })),
  }
}

describe('list_blueprint limit and total', () => {
  it('clips at the caller’s limit and says it clipped', async () => {
    const out = await list({ granularity: ['cell'], limit: 2 })
    const [header, ...rows] = out.split('\n')
    expect(header).toBe('2 of 6 (clipped — raise limit or narrow the filters):')
    expect(rows).toHaveLength(2)
  })

  it('reads a limit below one as one', async () => {
    expect((await list({ granularity: ['cell'], limit: 0 })).split('\n')[0]).toBe(
      '1 of 6 (clipped — raise limit or narrow the filters):',
    )
  })

  it('defaults to 200 rows and caps at 500', async () => {
    const { client } = fakeDb(bigBoard(600))
    const byDefault = await listBlueprint(client, { granularity: ['cell'] })
    expect(byDefault.split('\n')[0]).toBe('200 of 600 (clipped — raise limit or narrow the filters):')
    expect(byDefault.split('\n')).toHaveLength(201)
    const capped = await listBlueprint(client, { granularity: ['cell'], limit: 10_000 })
    expect(capped.split('\n')[0]).toBe('500 of 600 (clipped — raise limit or narrow the filters):')
  })

  it('counts past the server’s row cap, a page at a time', async () => {
    // PostgREST answers at most max_rows per request. A read that took the
    // first answer as the whole table would report 1000 as the total.
    const { client, log } = fakeDb(bigBoard(1200), 1000)
    const out = await listBlueprint(client, { granularity: ['cell'], limit: 500 })
    expect(out.split('\n')[0]).toBe('500 of 1200 (clipped — raise limit or narrow the filters):')
    expect(log.filter((rec) => rec.table === 'cells')).toHaveLength(2)
  })
})

describe('list_blueprint service scope', () => {
  it('scoped to a service lists only its journey, and totals within it', async () => {
    const { client, log } = fakeDb(BOARD)
    const out = await listBlueprint(client, {
      granularity: ['phase', 'scenario', 'cell'],
      scope: SALES,
    })
    expect(out).toBe(
      lines(
        '3 of 3:',
        '[phase] "Prospecting" · Prospecting (ph-3)',
        '[scenario] "Book a demo" · Prospecting › Book a demo (sc-3)',
        '[cell] "Runs the demo" · Prospecting › Book a demo › Demo › Pitch › Rep (ce-6)',
      ),
    )
    // The journey is the hard per-service boundary: one column on phases.
    for (const rec of log.filter((entry) => entry.table === 'phases'))
      expect(rec.eq).toEqual([['service_id', 'svc-b']])
  })

  it('unscoped reads every service, unfiltered', async () => {
    const { client, log } = fakeDb(BOARD)
    const out = await listBlueprint(client, { granularity: ['phase'], scope: { kind: 'all' } })
    expect(out.split('\n')[0]).toBe('3 of 3:')
    expect(log.every((rec) => rec.eq.length === 0)).toBe(true)
  })

  it("the tool call reads the session's service without an argument, another by name, and all on request", async () => {
    const { client } = fakeDb(BOARD)
    // No argument: the scope the session was handed — the board's service.
    expect(
      await runTool(listBlueprintTool, { granularity: ['phase'] }, fakeToolContext({ client, scope: SALES })),
    ).toBe(lines('1 of 1:', '[phase] "Prospecting" · Prospecting (ph-3)'))
    // Named: the argument moves the read off the session's service.
    expect(
      await runTool(
        listBlueprintTool,
        { granularity: ['phase'], service: 'Sales Pipeline' },
        fakeToolContext({ client, scope: { kind: 'all' } }),
      ),
    ).toBe(lines('1 of 1:', '[phase] "Prospecting" · Prospecting (ph-3)'))
    // "all": the deployment, past the session's service.
    const everywhere = await runTool(
      listBlueprintTool,
      { granularity: ['phase'], service: 'all' },
      fakeToolContext({ client, scope: SALES }),
    )
    expect(everywhere.split('\n')[0]).toBe('3 of 3:')
  })

  it('passes every argument the spec offers through to the read', async () => {
    const { client } = fakeDb(BOARD)
    expect(
      await runTool(
        listBlueprintTool,
        {
          granularity: ['cell'],
          phase: 'intake',
          scenario: 'Report a fault',
          kind: 'happy',
          lane_role: 'customer_actions',
          limit: 1,
          service: 'Support Desk',
        },
        fakeToolContext({ client }),
      ),
    ).toBe(
      lines(
        '1 of 2 (clipped — raise limit or narrow the filters):',
        '[cell] "Dials the support line" · Intake › Report a fault › Phone › Call in › Caller (ce-1)',
      ),
    )
  })
})

/** The bundled sample as database rows, so the two sources can be compared. */
function sampleBoard(): Record<string, Row[]> {
  const steps = new Map<string, Row & { path_steps: Row[] }>()
  const paths: Row[] = []
  const lanes: Row[] = []
  const cells: Row[] = []
  for (const [scenarioId, blueprints] of Object.entries(SAMPLE_BLUEPRINTS_BY_SCENARIO)) {
    for (const blueprint of blueprints) {
      const { path } = blueprint
      paths.push({
        id: path.id,
        scenario_id: scenarioId,
        name: path.name,
        summary: path.summary,
        kind: path.kind,
      })
      for (const step of blueprint.steps) {
        const row = steps.get(step.id) ?? {
          id: step.id,
          scenario_id: scenarioId,
          name: step.name,
          path_steps: [],
        }
        row.path_steps.push({ path_id: path.id, position: step.position })
        steps.set(step.id, row)
      }
      for (const lane of blueprint.lanes)
        lanes.push({
          id: lane.id,
          path_id: path.id,
          name: lane.name,
          lane_role: lane.role ?? null,
          position: lane.position,
        })
      for (const cell of blueprint.cells)
        cells.push({
          id: cell.id,
          path_id: path.id,
          lane_id: cell.lane_id,
          step_id: cell.step_id,
          content: cell.content,
          summary: cell.summary,
          position: cell.position ?? 0,
        })
    }
  }
  return {
    phases: SAMPLE_PHASES.map((phase) => ({
      id: phase.id,
      name: phase.name,
      summary: phase.summary,
      position: phase.position,
      service_id: SAMPLE_SERVICE_ID,
    })),
    scenarios: SAMPLE_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      phase_id: scenario.phase_id,
      name: scenario.name,
      summary: scenario.summary,
      position: scenario.position,
    })),
    paths,
    steps: [...steps.values()],
    lanes,
    cells,
  }
}

describe('the no-database twin', () => {
  const sampleCells = Object.values(SAMPLE_BLUEPRINTS_BY_SCENARIO)
    .flat()
    .flatMap((blueprint) => blueprint.cells)

  it('lists every sample phase and scenario with ids', () => {
    const out = sampleListBlueprint(PACKAGE_OFFLINE_BOARD, {
      granularity: ['phase', 'scenario'],
    })
    expect(out.split('\n')[0]).toBe(
      `${SAMPLE_PHASES.length + SAMPLE_SCENARIOS.length} of ${SAMPLE_PHASES.length + SAMPLE_SCENARIOS.length}:`,
    )
    for (const { id } of [...SAMPLE_PHASES, ...SAMPLE_SCENARIOS]) expect(out).toContain(`(${id})`)
  })

  it('counts every sample cell, and clips at the default limit like the live read', () => {
    const header = sampleListBlueprint(PACKAGE_OFFLINE_BOARD, {
      granularity: ['cell'],
    }).split('\n')[0]
    const shown = Math.min(sampleCells.length, 200)
    expect(header).toMatch(new RegExp(`^${shown} of ${sampleCells.length}`))
  })

  it.each([
    ...GRANULARITY_LEVELS.map((level) => ({ granularity: [level] })),
    { granularity: ['phase', 'scenario'] },
    { granularity: [...GRANULARITY_LEVELS], limit: 500 },
    { granularity: ['lane', 'cell'], laneRole: 'storyboard' },
    { granularity: ['path', 'step'], pathKind: 'happy' },
    { granularity: ['scenario', 'path'], phase: SAMPLE_PHASES[1]!.name },
    { granularity: ['cell'], scenario: SAMPLE_SCENARIOS[1]!.name, limit: 5 },
  ])('answers $granularity the way the database read does', async (options) => {
    const { client } = fakeDb(sampleBoard())
    expect(sampleListBlueprint(PACKAGE_OFFLINE_BOARD, options)).toBe(
      await listBlueprint(client, options),
    )
  })

  it('serves the trial through the same run, with the same refusals', async () => {
    expect(
      await runTool(listBlueprintTool, { granularity: ['path'] }, fakeToolContext()),
    ).toBe(
      sampleListBlueprint(PACKAGE_OFFLINE_BOARD, { granularity: ['path'] }),
    )
    await expect(
      runTool(listBlueprintTool, { granularity: ['nope'] }, fakeToolContext()),
    ).rejects.toThrow(/Unknown granularity: nope/)
  })
})

describe('the list_blueprint spec', () => {
  it('offers the shared lane-role filter and the shared service filter', () => {
    const properties = TOOL_SPECS.find((entry) => entry.name === 'list_blueprint')!
      .parameters.properties as Record<string, unknown>
    expect(properties.lane_role).toEqual({ type: 'string', description: LANE_ROLE_FILTER_DESCRIPTION })
    // The spec writes the rungs out rather than importing them; hold it to them.
    const granularity = properties.granularity as { description: string }
    for (const level of GRANULARITY_LEVELS) expect(granularity.description).toContain(level)
    expect(Object.keys(properties).sort()).toEqual(
      ['granularity', 'kind', 'lane_role', 'limit', 'phase', 'scenario', 'service'],
    )
  })
})

it('step readback includes the explanation beside its label', async () => {
  const board = structuredClone(BOARD)
  board.steps[0].summary = 'The person chooses how to receive support.'
  const text = await runTool(listBlueprintTool, { granularity: ['step'], service: 'all' }, fakeToolContext({ client: fakeDb(board).client }))
  expect(text).toContain('Triage')
  expect(text).toContain('The person chooses how to receive support.')
})
