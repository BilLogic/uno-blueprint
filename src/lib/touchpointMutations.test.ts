import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import {
  changedPlacementFields,
  normalizePlacementDetail,
  placementSurvivesContent,
  restoreTouchpointPlacement,
  updateTouchpointPlacement,
  type PlacementDetailDraft,
} from '@/lib/touchpointMutations'
import type { Database } from '@/types/database'

/**
 * What the placement write path promises, exercised rather than read.
 *
 * Three of these are the assertions that would have caught the defects this
 * module was written against. That an emptied field CLEARS the column rather
 * than storing a blank, because the read path checks for null and an empty
 * string renders an empty frame. That a matched-nothing update is a failure
 * rather than a silent success, because PostgREST answers it with a 200 and
 * an empty array. And that the captured inverse holds the columns as the
 * database had them — nulls included — rather than the strings the form held,
 * because a revert that re-validates cannot restore imported data the
 * validator would refuse.
 *
 * The fake answers the one query shape this module builds. An unknown shape
 * should fail the test rather than be quietly served, so nothing else is
 * implemented.
 */
type Row = Record<string, unknown>

function fakeClient(rows: Row[]) {
  const updates: Array<{ table: string; patch: Row; filters: Row }> = []

  const client = {
    from(table: string) {
      return {
        update(patch: Row) {
          const filters: Row = {}
          let selected = false
          const api = {
            eq(column: string, value: unknown) {
              filters[column] = value
              return api
            },
            select(_columns?: string) {
              selected = true
              return api
            },
            then(onFulfilled: (value: unknown) => unknown) {
              const hit = rows.filter((row) =>
                Object.entries(filters).every(
                  (entry) => row[entry[0]] === entry[1],
                ),
              )
              for (const row of hit) Object.assign(row, patch)
              updates.push({ table, patch, filters })
              return Promise.resolve(
                // Mirrors PostgREST: without `.select()` there are no rows to
                // count, which is what makes a zero-row write invisible.
                { data: selected ? hit : null, error: null },
              ).then(onFulfilled)
            },
          }
          return api
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, updates, rows }
}

const placement = () => [
  {
    id: 'ct-1',
    cell_id: 'cell-1',
    summary: 'The tutor fills in the reflection here.',
    role: null,
  },
]

const draft = (over: Partial<PlacementDetailDraft> = {}): PlacementDetailDraft => ({
  summary: '',
  role: null,
  ...over,
})

beforeEach(() => clearSession())

describe('normalizePlacementDetail', () => {
  it('stores an emptied field as null, not as a blank string', () => {
    const result = normalizePlacementDetail(draft({ summary: '  ' }))
    expect(result).toEqual({
      ok: true,
      columns: { summary: null, role: null },
    })
  })

  it('leaves an unmarked role unmarked', () => {
    // The failure this exists for is a `?? 'peripheral'` somewhere in the
    // chain: most placements are unmarked, and defaulting them would put a
    // judgement nobody made on 300 rows at once.
    const result = normalizePlacementDetail(draft({ role: null }))
    expect(result.ok && result.columns.role).toBeNull()
  })

  it('keeps both marks it is given', () => {
    for (const mark of ['core', 'peripheral'] as const) {
      const result = normalizePlacementDetail(draft({ role: mark }))
      expect(result.ok && result.columns.role).toBe(mark)
    }
  })

  it('refuses a role outside the two the constraint admits', () => {
    const result = normalizePlacementDetail(
      // The shape an untyped edge could hand it — a seed, a persisted form.
      draft({ role: 'important' as never }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('changedPlacementFields', () => {
  const draft = (over: Partial<PlacementDetailDraft> = {}): PlacementDetailDraft => ({
    summary: 'Where a report is filed.',
    role: null,
    ...over,
  })

  it('names nothing when the two drafts would write the same columns', () => {
    // Whitespace the write trims away is not a change: Save would write an
    // identical row and log a change with nothing to take back.
    expect(
      changedPlacementFields(draft({ summary: '  Where a report is filed.  ' }), draft()),
    ).toEqual([])
    expect(changedPlacementFields(draft({ summary: '   ' }), draft({ summary: '' }))).toEqual([])
  })

  it('names each column the write would change', () => {
    expect(
      changedPlacementFields(draft({ summary: 'The screen.', role: 'core' }), draft()),
    ).toEqual(['summary', 'role'])
    expect(changedPlacementFields(draft({ role: 'peripheral' }), draft())).toEqual(['role'])
  })
})

describe('placementSurvivesContent', () => {
  it('is true while the cell text still names the touchpoint', () => {
    expect(placementSurvivesContent('Booking form, Zoom', 'Zoom')).toBe(true)
  })

  it('is false once the name is gone, so the detail write is skipped', () => {
    // Removing the touchpoint is what makes `sync_cell_touchpoints` delete the
    // placement. Writing its detail afterwards would fail on zero rows — on a
    // save that did exactly what the author asked.
    expect(placementSurvivesContent('Booking form', 'Zoom')).toBe(false)
  })

  it('reads the text the way the sync is handed its names', () => {
    expect(placementSurvivesContent('Booking form\n  Zoom  ', 'Zoom')).toBe(true)
  })
})

describe('updateTouchpointPlacement', () => {
  it('writes only the two detail columns', async () => {
    const { client, updates } = fakeClient(placement())
    await updateTouchpointPlacement(
      client,
      { id: 'ct-1', cellId: 'cell-1', name: 'Booking form' },
      draft({ summary: 'Fill-In tab.', role: 'core' }),
    )

    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('cell_touchpoints')
    // Not `cell_id`, not `touchpoint_id`, not `position`. Those are where a
    // placement IS, and moving one is how an editor would route around the
    // touchpoint-bearing gate in `sync_cell_touchpoints`.
    // And nothing about what the placement POINTS AT: that is a resource
    // carrying the placement's id, never a column on the placement.
    expect(Object.keys(updates[0].patch).sort()).toEqual(['role', 'summary'])
    // Identity-keyed, so a rename or a reorder cannot move the write.
    expect(updates[0].filters).toEqual({ id: 'ct-1' })
  })

  it('records the change with an inverse holding the prior columns', async () => {
    const { client } = fakeClient(placement())
    await updateTouchpointPlacement(
      client,
      { id: 'ct-1', cellId: 'cell-1', name: 'Booking form' },
      draft({ summary: 'New words.', role: 'peripheral' }),
      { summary: 'The tutor fills in the reflection here.', role: null },
    )

    const [entry, ...rest] = sessionSnapshot()
    expect(rest).toEqual([])
    expect(entry.fn).toBe('update_touchpoint_placement')
    expect(entry.args).toEqual({
      placement_id: 'ct-1',
      cell_id: 'cell-1',
      name: 'Booking form',
    })
    expect(entry.revert).toEqual({
      fn: 'restore_touchpoint_placement',
      args: {
        placement_id: 'ct-1',
        columns: { summary: 'The tutor fills in the reflection here.', role: null },
      },
    })
  })

  it('offers no revert control when nothing was captured', async () => {
    const { client } = fakeClient(placement())
    await updateTouchpointPlacement(client, { id: 'ct-1' }, draft())
    expect(sessionSnapshot()[0].revert).toBeUndefined()
  })

  it('treats a write that matched no placement as a failure', async () => {
    const { client } = fakeClient([])
    await expect(
      updateTouchpointPlacement(client, { id: 'gone' }, draft({ summary: 'x' })),
    ).rejects.toThrow(/no longer exists/)
    // And nothing is recorded, because nothing happened. A ledger row for a
    // write that landed nowhere is worse than no row: its revert would report
    // "taken back" having written nothing.
    expect(sessionSnapshot()).toEqual([])
  })

  it('refuses the write before it starts when the draft is invalid', async () => {
    const { client, updates } = fakeClient(placement())
    await expect(
      updateTouchpointPlacement(client, { id: 'ct-1' }, draft({ role: 'important' as never })),
    ).rejects.toThrow(/core, peripheral/)
    expect(updates).toEqual([])
  })

  it('stays out of the ledger when told to', async () => {
    const { client } = fakeClient(placement())
    await updateTouchpointPlacement(
      client,
      { id: 'ct-1' },
      draft({ summary: 'x' }),
      undefined,
      { record: false },
    )
    expect(sessionSnapshot()).toEqual([])
  })
})

describe('restoreTouchpointPlacement', () => {
  it('writes the captured columns back verbatim, without re-validating', async () => {
    const { client, rows } = fakeClient(placement())
    // An imported placement can carry prose this module's own input
    // validator would refuse. Undo has to be able to reach data that was
    // already there — the same rule `update_cell_resources` restores under.
    await restoreTouchpointPlacement(client, 'ct-1', {
      summary: '  Imported words, spaces and all.  ',
      role: 'core',
    })

    expect(rows[0]).toMatchObject({
      summary: '  Imported words, spaces and all.  ',
      role: 'core',
    })
  })

  it('records nothing — undoing an edit is not an edit', async () => {
    const { client } = fakeClient(placement())
    await restoreTouchpointPlacement(client, 'ct-1', { summary: null, role: null })
    expect(sessionSnapshot()).toEqual([])
  })

  it('fails rather than reporting a restore onto a placement that is gone', async () => {
    const { client } = fakeClient([])
    await expect(
      restoreTouchpointPlacement(client, 'gone', { summary: null, role: null }),
    ).rejects.toThrow(/no longer exists/)
  })
})
