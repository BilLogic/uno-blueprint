import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { listBlueprint, listStakeholders, listEvidence, getEvidence } from '@/lib/agent/tools/read'
import type { ServiceScope } from '@/lib/agent/tools/serviceScope'

/*
 * The read tools APPLYING a scope. `serviceScope.test.ts` pins how a scope is
 * resolved and how the join is walked; this pins that a scoped read returns
 * ONLY the active service's rows, that `all` returns everything, and that the
 * catalog read narrows by the implicit-membership join rather than by a column
 * the shared catalog does not have.
 *
 * `list_blueprint` is the journey read, and it scopes straight off
 * `phases.service_id` with plain PostgREST reads — no ranked search, and no
 * database function this template does not ship.
 */

type Rec = { table: string; select?: string; filters: string[] }

function fakeClient(handlers: {
  from?: (rec: Rec) => { data: unknown; error: unknown }
}): SupabaseClient<Database> {
  const log: Rec[] = []
  function builder(table: string) {
    const rec: Rec = { table, filters: [] }
    log.push(rec)
    const b = {
      select(sel: string) {
        rec.select = sel
        return b
      },
      eq(column: string) {
        rec.filters.push(column)
        return b
      },
      in() {
        return b
      },
      not() {
        return b
      },
      order() {
        return b
      },
      range() {
        return b
      },
      limit() { return b },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(
          handlers.from ? handlers.from(rec) : { data: [], error: null },
        ).then(onF, onR)
      },
    }
    return b
  }
  const client = {
    from: (t: string) => builder(t),
  } as unknown as SupabaseClient<Database>
  return Object.assign(client, { __log: log }) as SupabaseClient<Database>
}

const readLog = (client: SupabaseClient<Database>) =>
  (client as unknown as { __log: Rec[] }).__log

const SALES: ServiceScope = {
  kind: 'service',
  serviceId: 'svc-sales',
  serviceName: 'Sales Pipeline',
}

describe('listBlueprint scope', () => {
  const JOURNEY: Record<string, unknown[]> = {
    phases: [
      { id: 'ph-sales', name: 'Prospecting', summary: null, position: 1, service_id: 'svc-sales' },
    ],
    scenarios: [
      { id: 'sc-demo', phase_id: 'ph-sales', name: 'Book a demo', summary: null, position: 1 },
    ],
  }
  const journeyClient = () =>
    fakeClient({ from: (rec) => ({ data: JOURNEY[rec.table] ?? [], error: null }) })
  const ORIENTATION = ['phase', 'scenario']

  it('scoped to a service filters the journey by service_id', async () => {
    const client = journeyClient()
    const out = await listBlueprint(client, { granularity: ORIENTATION, scope: SALES })
    expect(out).toContain('Prospecting')
    expect(out).toContain('Book a demo')
    // The journey is the hard per-service boundary, so the scope is one
    // column filter on phases and no join.
    expect(readLog(client)[0]!.table).toBe('phases')
    expect(readLog(client)[0]!.filters).toEqual(['service_id'])
  })

  it('widened to all reads every phase, unfiltered', async () => {
    const client = journeyClient()
    const out = await listBlueprint(client, { granularity: ORIENTATION, scope: { kind: 'all' } })
    expect(out).toContain('Prospecting')
    expect(readLog(client)[0]!.filters).toEqual([])
  })

  it('defaults to all when no scope is passed', async () => {
    const client = journeyClient()
    await listBlueprint(client, { granularity: ORIENTATION })
    expect(readLog(client)[0]!.filters).toEqual([])
  })
})

describe('listStakeholders scope', () => {
  const CAST = [
    { id: 'stk-a', name: 'Student', kind: 'recipient', summary: null, aliases: [] },
    { id: 'stk-b', name: 'Tutor', kind: 'staff', summary: null, aliases: [] },
    { id: 'stk-c', name: 'Vendor', kind: 'partner', summary: null, aliases: [] },
  ]

  it('scoped to a service shows only the cast its journey references (the join)', async () => {
    const client = fakeClient({
      from: (rec) => {
        switch (rec.table) {
          case 'stakeholders':
            return { data: CAST, error: null }
          case 'phases':
            return { data: [{ id: 'ph1' }], error: null }
          case 'scenarios':
            return { data: [{ id: 'sc1' }], error: null }
          case 'paths':
            return { data: [{ id: 'pa1' }], error: null }
          case 'lanes':
            // Sales' lanes pick the student and the tutor, not the vendor.
            return {
              data: [{ stakeholder_id: 'stk-a' }, { stakeholder_id: 'stk-b' }],
              error: null,
            }
          default:
            return { data: [], error: null }
        }
      },
    })
    const out = await listStakeholders(client, SALES)
    expect(out).toContain('Student')
    expect(out).toContain('Tutor')
    expect(out).not.toContain('Vendor')
  })

  it('unscoped (all) shows the whole deployment catalog', async () => {
    const client = fakeClient({
      from: (rec) =>
        rec.table === 'stakeholders'
          ? { data: CAST, error: null }
          : { data: [], error: null },
    })
    const out = await listStakeholders(client, { kind: 'all' })
    expect(out).toContain('Student')
    expect(out).toContain('Tutor')
    expect(out).toContain('Vendor')
  })

  it('says so, and how to widen, when a service references nobody', async () => {
    const client = fakeClient({
      from: (rec) =>
        rec.table === 'stakeholders'
          ? { data: CAST, error: null }
          : { data: [], error: null },
    })
    const out = await listStakeholders(client, SALES)
    expect(out).toContain('Sales Pipeline')
    expect(out).toContain('service:"all"')
  })
})

it('reads preserved evidence without joining a detached cell', async () => {
  const row = { id: 'source', cell_id: 'detached-cell', kind: 'observation', title: 'Retained source', note: 'Original claim', observed_at: null, created_at: '2026-10-27' }
  const client = fakeClient({ from: (request) => {
    if (request.table !== 'evidence') throw new Error('There is no live cell')
    return { data: [row], error: null }
  } })
  // The real readers and formatters must tolerate a provenance id whose
  // cell is temporarily absent; Undo restores that same identity in SQL.
  expect(await listEvidence(client, 'detached-cell')).toContain('Retained source')
  expect(await getEvidence(client, ['source'])).toContain('Original claim')
  expect(readLog(client).every((request) => request.table === 'evidence' && !request.select?.includes('cells('))).toBe(true)
})
