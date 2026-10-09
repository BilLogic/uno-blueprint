import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { recordFinding, updateFinding } from '@/lib/findingMutations'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'

/**
 * What the findings write path promises, exercised rather than read.
 *
 * The rest of the write path is pinned by reading source — `revertCoverage`
 * text-matches `executeRevert`'s cases, `writeBoundaryContract` walks `src/`
 * — because those are facts about which names exist. These are facts about
 * *values*: which columns the captured inverse holds, and whether a write that
 * matched no rows is allowed to look like a success. Neither is visible in the
 * source, and both are what the three raw writes in `agent/tools/registry.ts`
 * got wrong for as long as nothing looked.
 *
 * The fake below answers the four query shapes this module builds and nothing
 * else. It is deliberately not a Supabase emulator: an unknown shape should
 * fail the test rather than be quietly served.
 */
type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

type Call = { table: string; verb: string; patch?: Row; filters: Row }

function fakeClient(rows: Row[]) {
  const calls: Call[] = []

  function builder(table: string, verb: string, patch?: Row) {
    const filters: Row = {}
    const call: Call = { table, verb, patch, filters }
    let selected = false

    const matches = () =>
      rows.filter((row) =>
        Object.entries(filters).every((entry) => row[entry[0]] === entry[1]),
      )

    const resolve = (): Result => {
      if (verb === 'select') return { data: matches(), error: null }
      if (verb === 'insert') {
        const inserted = { id: `f-new`, ...(patch as Row) }
        rows.push(inserted)
        calls.push(call)
        return { data: [inserted], error: null }
      }
      const hit = matches()
      for (const row of hit) Object.assign(row, patch)
      calls.push(call)
      // `.select()` is what makes a zero-row write visible; without it the
      // caller sees `data: null` and cannot tell. Mirrored faithfully.
      return { data: selected ? hit : null, error: null }
    }

    const api = {
      select(_columns?: string) {
        selected = true
        return api
      },
      eq(column: string, value: unknown) {
        filters[column] = value
        return api
      },
      order() {
        return api
      },
      maybeSingle(): Promise<Result> {
        const found = matches()
        return Promise.resolve({ data: found[0] ?? null, error: null })
      },
      single(): Promise<Result> {
        const result = resolve()
        const list = result.data as Row[]
        return Promise.resolve({ data: list[0] ?? null, error: result.error })
      },
      then(onFulfilled: (value: Result) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled)
      },
    }
    return api
  }

  const client = {
    from(table: string) {
      return {
        select: (columns?: string) => builder(table, 'select').select(columns),
        insert: (patch: Row) => builder(table, 'insert', patch),
        update: (patch: Row) => builder(table, 'update', patch),
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, calls, rows }
}

const DRAFT = {
  serviceId: 'svc-1',
  runId: 'run-1',
  source: 'audit' as const,
  checkKey: 'orphan-cell',
  severity: 'warn' as const,
  impact: 'high' as const,
  effort: 'low' as const,
  cellIds: ['cell-1'],
  cellKeys: ['cell-1'],
  summary: 'This cell is cited by nothing.',
  fingerprint: 'orphan-cell:abc',
}

beforeEach(() => clearSession())

describe('recordFinding', () => {
  it('records the insert in the ledger, with no revert control', async () => {
    const { client, calls } = fakeClient([])
    const outcome = await recordFinding(client, DRAFT)

    // Both ratings land beside severity, on the row and in the ledger entry.
    expect(calls[0].patch).toMatchObject({ severity: 'warn', impact: 'high', effort: 'low' })

    expect(outcome).toEqual({ kind: 'created', findingId: 'f-new', reopened: false })
    const [entry, ...rest] = sessionSnapshot()
    expect(rest).toEqual([])
    expect(entry.fn).toBe('create_finding')
    expect(entry.args).toMatchObject({ severity: 'warn', impact: 'high', effort: 'low' })
    // DELETE on audit_findings is revoked from every client role, and the two states
    // that would silence a finding are human triage decisions. There is no
    // inverse to capture, and offering a control that dismissed the check
    // instead would be worse than offering none.
    expect(entry.revert).toBeUndefined()
  })

  it('reports a reopen when a resolved twin shares the fingerprint', async () => {
    const { client } = fakeClient([
      { id: 'f-old', service_id: 'svc-1', fingerprint: 'orphan-cell:abc', status: 'resolved' },
    ])
    const outcome = await recordFinding(client, DRAFT)
    expect(outcome).toEqual({ kind: 'created', findingId: 'f-new', reopened: true })
  })

  it('writes nothing at all when a human dismissed the fingerprint', async () => {
    const { client, calls } = fakeClient([
      { id: 'f-old', service_id: 'svc-1', fingerprint: 'orphan-cell:abc', status: 'dismissed' },
    ])
    const outcome = await recordFinding(client, DRAFT)

    expect(outcome).toEqual({ kind: 'suppressed' })
    expect(calls).toEqual([])
    // Not an entry without a revert — no entry. The ledger's claim is that it
    // lists writes that landed, and this one did not happen.
    expect(sessionSnapshot()).toEqual([])
  })

  it('dedupes onto the open twin and captures what it overwrote', async () => {
    const { client, calls } = fakeClient([
      {
        id: 'f-open',
        service_id: 'svc-1',
        fingerprint: 'orphan-cell:abc',
        status: 'open',
        check_key: 'orphan-cell',
        severity: 'info',
        // Recorded before the ratings existed: unrated, and put back unrated.
        impact: null,
        effort: null,
        summary: 'An earlier run said this.',
        run_id: 'run-0',
        cell_ids: ['cell-9'],
        cell_keys: ['cell-9'],
        source: 'audit',
      },
    ])
    const outcome = await recordFinding(client, DRAFT)

    expect(outcome).toEqual({ kind: 'deduped', findingId: 'f-open' })
    // A re-run whose only news is a rating moves the rating on the open row
    // rather than raising a twin.
    expect(calls[0].patch).toMatchObject({ impact: 'high', effort: 'low' })
    const [entry] = sessionSnapshot()
    expect(entry.fn).toBe('update_finding')
    // Identity-keyed on the finding, not on the fingerprint: reopening a
    // resolved twin mints a second row that shares the fingerprint.
    expect(entry.revert).toEqual({
      fn: 'update_finding',
      args: {
        finding_id: 'f-open',
        update: {
          severity: 'info',
          impact: null,
          effort: null,
          summary: 'An earlier run said this.',
          runId: 'run-0',
          cellIds: ['cell-9'],
          cellKeys: ['cell-9'],
          source: 'audit',
        },
      },
    })
  })
})

describe('updateFinding', () => {
  const open = () => [
    {
      id: 'f-1',
      check_key: 'orphan-cell',
      severity: 'warn',
      summary: 'n',
      run_id: 'run-1',
      cell_ids: [],
      cell_keys: [],
      source: 'audit',
      status: 'open',
    },
  ]

  it('captures only the columns it wrote', async () => {
    const { client } = fakeClient(open())
    await updateFinding(client, 'f-1', { status: 'resolved' })

    const [entry] = sessionSnapshot()
    // An inverse that wrote all seven granted columns back would undo a
    // severity rewrite that happened between the flip and the undo — a
    // different change, belonging to a different person.
    expect(entry.revert).toEqual({
      fn: 'update_finding',
      args: { finding_id: 'f-1', update: { status: 'open' } },
    })
    expect(entry.args.status).toBe('resolved')
  })

  it('leaves the ledger alone when the revert path calls it', async () => {
    const { client } = fakeClient(open())
    await updateFinding(client, 'f-1', { status: 'open' }, { record: false })
    // Undoing an edit must not append an edit to the list the row was just
    // removed from.
    expect(sessionSnapshot()).toEqual([])
  })

  it('refuses a finding that is gone rather than reporting a write', async () => {
    const { client } = fakeClient([])
    await expect(
      updateFinding(client, 'f-missing', { status: 'resolved' }),
    ).rejects.toThrow('No finding with id f-missing.')
    expect(sessionSnapshot()).toEqual([])
  })

  it('refuses an empty update instead of writing nothing successfully', async () => {
    const { client } = fakeClient(open())
    await expect(updateFinding(client, 'f-1', {})).rejects.toThrow(
      'An empty finding update writes nothing',
    )
  })
})
