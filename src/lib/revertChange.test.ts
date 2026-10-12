import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearSession,
  recordChange,
  sessionSnapshot,
  type ChangeEntry,
  type SessionEntry,
} from '@/lib/authoringSession'
import { executeRevert } from '@/lib/revertChange'
import { inMemoryDatabase, type Row } from '@/test/inMemoryDatabase'

/**
 * The first undo of a first summary.
 *
 * Every one-column prose field starts null, so the FIRST save of one captures
 * `''` as its previous value — which makes "restore the empty" the commonest
 * revert in the ledger, not an edge case. `stringArg` refuses `''` on purpose
 * (an id never legitimately is one), and `update_service_summary` read its
 * value through it while the scenario and step cases did not. Reverting the
 * first service summary anyone wrote therefore threw "This change's revert is
 * missing its “summary” value" and left the field as typed.
 *
 * All three now read through `optionalStringArg`, so this asserts the same
 * thing three times rather than once: the empty string is the value, and the
 * write that clears the column actually runs.
 */
/** The one in-memory fake, keyed by the table each case writes. */
function fakeClient(table: string, rows: Row[]) {
  const { client, updates, rpcs } = inMemoryDatabase({ [table]: rows })
  return { client, updates, calls: rpcs }
}

/**
 * Built through `recordChange` rather than as an object literal.
 *
 * `executeRevert` takes a `SessionEntry`, which only the session stack mints,
 * so an entry assembled here by hand would need a cast — and a test that cast
 * its way past the boundary would be exercising a path the app cannot reach.
 * Going through the stack costs one line and keeps the fixture honest.
 */
const entry = (fn: string, args: Record<string, unknown>): SessionEntry => {
  recordChange(fn as ChangeEntry['fn'], {}, { fn, args })
  return sessionSnapshot().at(-1)!
}

beforeEach(() => clearSession())

describe('executeRevert restores an empty summary', () => {
  it('clears a service summary back to nothing', async () => {
    const { client, updates } = fakeClient('services', [
      { id: 'svc-1', summary: 'A sentence nobody asked for' },
    ])

    await executeRevert(
      client,
      entry('update_service_summary', { service_id: 'svc-1', summary: '' }),
    )

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      table: 'services',
      patch: { summary: null },
      filters: { id: 'svc-1' },
    })
  })

  it('clears a scenario summary back to nothing', async () => {
    const { client, updates } = fakeClient('scenarios', [
      { id: 'scn-1', summary: 'Typed once, regretted immediately' },
    ])

    await executeRevert(
      client,
      entry('update_scenario_spec', { scenario_id: 'scn-1', summary: '' }),
    )

    expect(updates[0]?.patch).toEqual({ summary: null })
  })

  it('clears a step summary back to nothing', async () => {
    const { client, updates } = fakeClient('steps', [
      { id: 'step-1', summary: 'What this moment is' },
    ])

    await executeRevert(
      client,
      entry('update_step_spec', { step_id: 'step-1', summary: '' }),
    )

    expect(updates[0]?.patch).toEqual({ summary: null })
  })

  it('still refuses a summary that is missing rather than empty', async () => {
    const { client } = fakeClient('services', [{ id: 'svc-1', summary: 'x' }])

    await expect(
      executeRevert(client, entry('update_service_summary', { service_id: 'svc-1' })),
    ).rejects.toThrow(/missing its .summary. value/)
  })
})

/**
 * A ledger entry outlives the schema it was recorded under.
 *
 * "Edited a touchpoint at this cell" once captured four placement columns;
 * two of them — the screenshot list and the URL — are not columns any more,
 * because what a placement points at became a resource of its own. Reverting
 * an entry captured before that must still restore the two that are, and must
 * not send the two that are not: PostgREST answers an unknown column with a
 * 400, which would make every such entry unrevertable.
 */
describe('reverting a placement edit captured under the older columns', () => {
  it('restores summary and role, and sends nothing for the retired columns', async () => {
    const { client, updates } = fakeClient('cell_touchpoints', [
      { id: 'ct-1', summary: 'New words.', role: 'peripheral' },
    ])
    recordChange(
      'update_touchpoint_placement',
      { placement_id: 'ct-1' },
      {
        fn: 'restore_touchpoint_placement',
        args: {
          placement_id: 'ct-1',
          // As an entry from before the retirement captured it: four columns.
          columns: {
            summary: 'The words before.',
            screenshots: ['/images/checkout-form.png'],
            url: 'https://example.com/designs/checkout',
            role: null,
          },
        },
      },
    )

    await executeRevert(client, sessionSnapshot().at(-1)!)

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      table: 'cell_touchpoints',
      filters: { id: 'ct-1' },
    })
    expect(updates[0]?.patch).toEqual({ summary: 'The words before.', role: null })
  })
})

/**
 * THE OTHER SHAPE AN OLD ENTRY COMES IN.
 *
 * `removed_placements` is the writing a save destroyed — the per-moment
 * summary and role on each placement the text stopped naming, plus the
 * resources those placements carried. It has been captured under more than one
 * shape: `position` was added to the captured row after entries were already
 * being recorded without it, and the key itself was written unconditionally
 * before it was omitted when the list is empty.
 *
 * Both older shapes have to keep reverting, and that is a claim about the
 * WHOLE chain rather than about this module: nothing here reads `position`,
 * and neither does `restore_cell_touchpoints`, whose row type names `name`,
 * `summary`, `role` and `resources` and nothing else. A placement's position
 * is captured because the sync hands it back, not because the restore needs
 * it. What these pin is that it stays that way — the day something starts
 * reading it, an entry recorded before it existed would revert onto a null.
 *
 * The resources nested inside are the one place a position IS read, and the
 * function already coalesces a missing one to the row's ordinal, which is the
 * same tolerance stated one level down.
 */
describe('reverting a cell edit whose captured placements predate a field', () => {
  it('passes a row with no position through to the restore verbatim', async () => {
    const { client, calls } = fakeClient('cells', [
      { id: 'cell-1', content: 'What it says now' },
    ])
    await executeRevert(
      client,
      entry('update_cell_content', {
        cell_id: 'cell-1',
        update: {
          content: 'What it said before',
          summary: '',
          owner: '',
          perceivedOwner: '',
          status: 'built',
        },
        // As an entry recorded before the captured row carried a position.
        removed_placements: [
          {
            name: 'Checkout form',
            summary: 'The moment the card details are asked for.',
            role: 'primary',
            resources: [
              {
                kind: 'link',
                name: 'The design',
                url: 'https://example.com/designs/checkout',
                featured: true,
                origin: 'app',
              },
            ],
          },
        ],
      }),
    )

    const restore = calls.find((call) => call.fn === 'restore_cell_touchpoints')
    expect(restore, 'the restore never ran').toBeDefined()
    expect(restore?.args.p_cell_id).toBe('cell-1')
    // Verbatim: nothing invented to stand in for the absent position, and
    // nothing dropped for being absent either.
    expect(restore?.args.p_rows).toEqual([
      {
        name: 'Checkout form',
        summary: 'The moment the card details are asked for.',
        role: 'primary',
        resources: [
          {
            kind: 'link',
            name: 'The design',
            url: 'https://example.com/designs/checkout',
            featured: true,
            origin: 'app',
          },
        ],
      },
    ])
  })

  it('restores the text before it restores the writing on the placements', async () => {
    // Ordering, not decoration. Restoring the text is what re-creates the
    // placement rows the original save removed; a restore that ran first would
    // find nothing to write onto and report success.
    const { client, calls, updates } = fakeClient('cells', [
      { id: 'cell-1', content: 'What it says now' },
    ])
    await executeRevert(
      client,
      entry('update_cell_content', {
        cell_id: 'cell-1',
        update: {
          content: 'Checkout form',
          summary: '',
          owner: '',
          perceivedOwner: '',
          status: 'built',
        },
        removed_placements: [
          { name: 'Checkout form', summary: 'Before.', role: null },
        ],
      }),
    )

    expect(updates.map((one) => one.table)).toEqual(['cells'])
    expect(calls.map((call) => call.fn)).toEqual([
      'sync_cell_touchpoints',
      'restore_cell_touchpoints',
    ])
  })

  it('runs no restore for an entry that wrote the key empty', async () => {
    // The shape before the key was omitted when nothing was removed. An empty
    // list is not a list of one empty thing: sending it would be a write that
    // matches no row, and a write that matches no row is a failure in this
    // tree rather than a no-op.
    const { client, calls } = fakeClient('cells', [
      { id: 'cell-1', content: 'What it says now' },
    ])
    await executeRevert(
      client,
      entry('update_cell_content', {
        cell_id: 'cell-1',
        update: {
          content: 'What it said before',
          summary: '',
          owner: '',
          perceivedOwner: '',
          status: 'built',
        },
        removed_placements: [],
      }),
    )

    expect(calls.map((call) => call.fn)).toEqual(['sync_cell_touchpoints'])
  })

  it('runs no restore for an entry that carries no key at all', async () => {
    // And the shape after. Both reach the same place, which is the point.
    const { client, calls } = fakeClient('cells', [
      { id: 'cell-1', content: 'What it says now' },
    ])
    await executeRevert(
      client,
      entry('update_cell_content', {
        cell_id: 'cell-1',
        update: {
          content: 'What it said before',
          summary: '',
          owner: '',
          perceivedOwner: '',
          status: 'built',
        },
      }),
    )

    expect(calls.map((call) => call.fn)).toEqual(['sync_cell_touchpoints'])
  })
})

/**
 * Undoing a slice replace is one call: `restore_slides` puts the captured
 * slides back in a single transaction, so a refusal partway leaves the slice
 * as the replace left it rather than emptied. What this side still owns is
 * the payload, the refusal it translates, and sweeping the upload folders of
 * the slides the database says it dropped — after the commit, never before.
 */
describe('executeRevert restores a replaced slice’s slides', () => {
  const captured = {
    id: 'slide-1',
    slice_id: 'sl-1',
    position: 0,
    cell_ids: ['c-1'],
    cell_keys: ['c-1'],
    title: 'Arrive',
    caption: null,
    shows_all_images: false,
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    updated_at: '2026-01-01T00:00:00Z',
    slide_images: [{ id: 'img-1', slide_id: 'slide-1', position: 0, cell_id: null, image_url: 'https://x/a.png' }],
  }

  function slideClient(answer: { data: unknown; error: unknown }) {
    const rpcs: Array<{ fn: string; args: unknown }> = []
    const tableWrites: string[] = []
    const listed: string[] = []
    const client = {
      from: (table: string) => {
        tableWrites.push(table)
        throw new Error(`restore_slides touched ${table} directly`)
      },
      rpc: (fn: string, args: unknown) => {
        rpcs.push({ fn, args })
        return Promise.resolve(answer)
      },
      storage: {
        from: () => ({
          list: (folder: string) => {
            listed.push(folder)
            return Promise.resolve({ data: [], error: null })
          },
          remove: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    } as unknown as Parameters<typeof executeRevert>[0]
    return { client, rpcs, tableWrites, listed }
  }

  it('is one RPC carrying the captured rows verbatim, then sweeps only the dropped slides', async () => {
    const { client, rpcs, tableWrites, listed } = slideClient({
      data: { slice_id: 'sl-1', slide_count: 1, dropped: ['slide-new'] },
      error: null,
    })

    await executeRevert(client, entry('restore_slides', { slice_id: 'sl-1', rows: [captured] }))

    expect(tableWrites).toEqual([])
    expect(rpcs).toEqual([{ fn: 'restore_slides', args: { p_slice_id: 'sl-1', p_rows: [captured] } }])
    expect(listed).toHaveLength(1)
    expect(listed[0]).toContain('slide-new')
    expect(listed[0]).not.toContain('slide-1')
  })

  it('translates a refusal and sweeps nothing', async () => {
    const { client, listed } = slideClient({
      data: null,
      error: { message: 'Captured slide 1 has no id — nothing was written.', code: 'P0001', details: '', hint: '' },
    })

    const undo = executeRevert(client, entry('restore_slides', { slice_id: 'sl-1', rows: [captured] }))

    await expect(undo).rejects.toThrow(/Captured slide 1 has no id/)
    expect(listed).toEqual([])
  })

  it('refuses a capture that is not a list before calling anything', async () => {
    const { client, rpcs } = slideClient({ data: null, error: null })

    await expect(
      executeRevert(client, entry('restore_slides', { slice_id: 'sl-1', rows: 'nope' })),
    ).rejects.toThrow(/captured slides are malformed/)
    expect(rpcs).toEqual([])
  })
})
