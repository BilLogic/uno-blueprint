/**
 * A rename must survive the next content save.
 *
 * The defect this file exists for happens one save LATER than the rename. The
 * registry row moves, the board redraws correctly, and nothing looks wrong —
 * until somebody edits any affected cell. That save re-derives placements from
 * `cells.content`, which still holds the OLD string, so
 * `sync_cell_touchpoints` is handed a name the renamed placement no longer
 * has. The placement is not in the wanted list: its registry link is taken
 * away, a fresh registry entry appears under the old name, and a new empty
 * placement is put in its stead. A test that only checked the rename itself
 * would pass throughout.
 *
 * ── Why there is a model here ──────────────────────────────────────────────
 *
 * Both halves of the fix are SQL — `rename_touchpoint` and
 * `sync_cell_touchpoints` are functions because the work has to be one
 * transaction, and PostgREST gives every statement its own. The SQL proves
 * itself where it lives: the migration that carries a rename into every cell
 * asserts the item match in a `do` block that runs on every apply, including
 * the portable core's replay onto a stock Postgres.
 *
 * What is left for this file is the seam SQL cannot reach: that the CLIENT
 * calls the rename once and records an inverse restoring both halves, and that
 * the ordinary content-save path — the real `updateCellContent`, the real
 * `parseCellContentItems` — leaves the writing alone once the text has moved.
 * The tables below are a port of the two functions, and the first test is a
 * RED one: it drives the model with a registry-only rename, the naive fix, and
 * shows the model stranding the writing on a dashed row while the old name
 * comes back. A model that cannot exhibit the bug would prove nothing about
 * the fix.
 *
 * The model carries a placement's `summary` and `role` and not its resources.
 * The resources ride the same path — the sync hands them back and
 * `restore_cell_touchpoints` re-creates them — and the migration that owns
 * that behaviour proves it against real rows; repeating it here would be a
 * second, weaker copy of a proof that already runs.
 */
import { beforeEach, expect, test } from 'vitest'
import { updateCellContent } from '@/lib/cellContentMutations'
import { renameTouchpoint } from '@/lib/touchpointMutations'
import { executeRevert } from '@/lib/revertChange'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { parseCellContentItems } from '@/lib/parseCellContent'
import { renameContentItem } from '@/test/renameContentItem'

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

type TouchpointRow = { id: string; name: string }
/** A placement names its touchpoint by registry id, or by name alone. */
type PlacementRow = {
  id: string
  cell_id: string
  touchpoint_id: string | null
  name: string | null
  position: number
  summary: string | null
  role: string | null
}
type CellRow = { id: string; lane_role: string; content: string }

type Db = {
  touchpoints: TouchpointRow[]
  placements: PlacementRow[]
  cells: CellRow[]
}

const TOUCHPOINT_LANES = new Set(['frontstage_touchpoints', 'backstage_touchpoints'])

let nextId = 0
const id = (prefix: string) => `${prefix}-${(nextId += 1)}`

/** The name a placement shows: the registry's where it has one, else its own. */
const nameOf = (db: Db, placement: PlacementRow) =>
  placement.touchpoint_id
    ? db.touchpoints.find((row) => row.id === placement.touchpoint_id)!.name
    : placement.name!

/** Whether a placement is carrying an author's writing. */
const carriesWriting = (placement: PlacementRow) =>
  Boolean(placement.summary?.trim()) || placement.role !== null

/** `sync_cell_touchpoints`, ported. */
function syncCellTouchpoints(db: Db, cellId: string, names: string[]) {
  const cell = db.cells.find((row) => row.id === cellId)
  if (!cell) throw new Error(`cell ${cellId} does not exist`)

  const bearing =
    TOUCHPOINT_LANES.has(cell.lane_role) ||
    db.placements.some((row) => row.cell_id === cellId)
  if (!bearing) return { skipped: true, removed: [] }

  // De-duplicated, keeping the first position each name took.
  const wanted = new Map<string, number>()
  names.forEach((name, index) => {
    if (!name.trim()) return
    if (!wanted.has(name)) wanted.set(name, index + 1)
  })

  for (const name of wanted.keys()) {
    if (!db.touchpoints.some((row) => row.name === name)) {
      // Minted by name alone: the registry is the deployment's, not the
      // service's — a service owns its journey and shares the catalog.
      db.touchpoints.push({ id: id('tp'), name })
    }
  }

  const here = () => db.placements.filter((row) => row.cell_id === cellId)

  // A name typed back LINKS the name-only row that was keeping its writing,
  // rather than inserting a second row beside it.
  for (const [name] of wanted) {
    const touchpoint = db.touchpoints.find((row) => row.name === name)!
    if (here().some((row) => row.touchpoint_id === touchpoint.id)) continue
    const nameOnly = here().find(
      (row) =>
        row.touchpoint_id === null &&
        row.name!.toLowerCase() === name.toLowerCase(),
    )
    if (!nameOnly) continue
    nameOnly.touchpoint_id = touchpoint.id
    nameOnly.name = null
  }

  // What leaves the text: LINKED rows whose registry name is not wanted. A
  // name-only row is nobody's business here — it was never in the text.
  const leaving = here().filter(
    (row) => row.touchpoint_id !== null && !wanted.has(nameOf(db, row)),
  )
  const removed = leaving.map((row) => ({
    name: nameOf(db, row),
    position: row.position,
    summary: row.summary,
    role: row.role,
  }))

  for (const row of leaving) {
    const shown = nameOf(db, row)
    const duplicate = here().some(
      (other) =>
        other.touchpoint_id === null &&
        other.name!.toLowerCase() === shown.toLowerCase(),
    )
    if (carriesWriting(row) && !duplicate) {
      // Kept as a name-only row — words and role intact, drawn dashed — so an
      // edit to the text never destroys an author's writing.
      row.touchpoint_id = null
      row.name = shown
    } else {
      db.placements = db.placements.filter((entry) => entry.id !== row.id)
    }
  }

  // Kept names are REPOSITIONED, never deleted and re-added — the whole reason
  // the sync is a diff and not a rebuild.
  for (const row of here()) {
    if (row.touchpoint_id === null) continue
    row.position = wanted.get(nameOf(db, row))!
  }
  for (const [name, position] of wanted) {
    const touchpoint = db.touchpoints.find((row) => row.name === name)!
    if (here().some((row) => row.touchpoint_id === touchpoint.id)) continue
    db.placements.push({
      id: id('ct'),
      cell_id: cellId,
      touchpoint_id: touchpoint.id,
      name: null,
      position,
      summary: null,
      role: null,
    })
  }

  return { skipped: false, removed }
}

/** `rename_touchpoint`, ported — both halves, or an exception. */
function renameTouchpointRpc(db: Db, touchpointId: string, name: string) {
  const wanted = name.trim()
  if (!wanted) throw new Error('a touchpoint needs a name')

  const touchpoint = db.touchpoints.find((row) => row.id === touchpointId)
  if (!touchpoint) throw new Error(`touchpoint ${touchpointId} does not exist`)
  if (
    db.touchpoints.some((row) => row.id !== touchpointId && row.name === wanted)
  ) {
    throw new Error('duplicate key value violates unique constraint')
  }

  const previous = touchpoint.name
  touchpoint.name = wanted

  const cellIds: string[] = []
  if (previous !== wanted) {
    // Identity, not text search: the placements say which cells bear it.
    for (const placement of db.placements.filter(
      (row) => row.touchpoint_id === touchpointId,
    )) {
      const cell = db.cells.find((row) => row.id === placement.cell_id)!
      const next = renameContentItem(cell.content, previous, wanted)
      if (next !== cell.content) {
        cell.content = next
        cellIds.push(cell.id)
      }
    }
    const stale = db.placements.filter(
      (row) =>
        row.touchpoint_id === touchpointId &&
        parseCellContentItems(
          db.cells.find((cell) => cell.id === row.cell_id)!.content,
        ).includes(previous),
    ).length
    if (stale !== 0) {
      throw new Error(`${stale} cells still name "${previous}"`)
    }
  }

  return {
    touchpoint_id: touchpointId,
    name: wanted,
    previous_name: previous,
    cell_ids: cellIds,
  }
}

/** The PostgREST builder chain, over the model. */
function clientFor(db: Db) {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === 'sync_cell_touchpoints') {
          return Promise.resolve({
            data: syncCellTouchpoints(
              db,
              args.p_cell_id as string,
              args.p_names as string[],
            ),
            error: null,
          })
        }
        if (name === 'rename_touchpoint') {
          return Promise.resolve({
            data: renameTouchpointRpc(
              db,
              args.p_touchpoint_id as string,
              args.p_name as string,
            ),
            error: null,
          })
        }
        // An unmodelled call should fail the test rather than be quietly
        // served, so nothing else is implemented.
        throw new Error(`no function ${name}`)
      } catch (thrown) {
        return Promise.resolve({
          data: null,
          error: { message: (thrown as Error).message },
        })
      }
    },
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, value: string) {
              return {
                select() {
                  if (table !== 'cells') return Promise.resolve({ data: [], error: null })
                  const cell = db.cells.find((row) => row.id === value)
                  if (!cell) return Promise.resolve({ data: [], error: null })
                  cell.content = values.content as string
                  return Promise.resolve({ data: [{ id: cell.id }], error: null })
                },
              }
            },
          }
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in, not a SupabaseClient
  } as any
}

/**
 * One cell on a touchpoint lane naming two tools whose names overlap, each
 * carrying its own words about this moment.
 *
 * `Zoom` and `Zoom Recording` are the near miss written out: a substring
 * replace turns the second into `Zoom Meetings Recording` on the way past.
 * They share a cell here so one save can show it.
 */
function fixture() {
  nextId = 0
  const db: Db = {
    touchpoints: [
      { id: 'tp-zoom', name: 'Zoom' },
      { id: 'tp-recording', name: 'Zoom Recording' },
    ],
    placements: [
      {
        id: 'ct-zoom',
        cell_id: 'cell-1',
        touchpoint_id: 'tp-zoom',
        name: null,
        position: 1,
        summary: 'The tutor opens the room from the session card',
        role: 'core',
      },
      {
        id: 'ct-recording',
        cell_id: 'cell-1',
        touchpoint_id: 'tp-recording',
        name: null,
        position: 2,
        summary: 'Reviewed afterwards by the lead',
        role: 'peripheral',
      },
    ],
    cells: [
      {
        id: 'cell-1',
        lane_role: 'frontstage_touchpoints',
        content: 'Zoom, Zoom Recording',
      },
    ],
  }
  return db
}

const cellOf = (db: Db) => db.cells.find((row) => row.id === 'cell-1')!
const placementOf = (db: Db, touchpointId: string) =>
  db.placements.find(
    (row) => row.cell_id === 'cell-1' && row.touchpoint_id === touchpointId,
  )

/** An ordinary content save, exactly as the panel makes it. */
const save = (client: unknown, content: string) =>
  updateCellContent(
    client as never,
    'cell-1',
    { content, summary: '', owner: '', perceivedOwner: '', status: 'live' },
    undefined,
    { record: false },
  )

beforeEach(() => {
  clearSession()
})

// ---------------------------------------------------------------------------
// The red case
// ---------------------------------------------------------------------------

test('a registry-only rename is undone by the next content save', async () => {
  // The naive fix, and the defect stated as a sequence. Nothing here is what
  // the app does — it is what the app would do if the rename stopped at the
  // registry row, and it is in this file so the tests below cannot be passing
  // against a model that could not tell the difference.
  const db = fixture()
  const client = clientFor(db)
  db.touchpoints.find((row) => row.id === 'tp-zoom')!.name = 'Zoom Meetings'

  // The cell still says "Zoom", so this is the text an author saves.
  await save(client, cellOf(db).content)

  // The renamed row is no longer placed at this cell at all.
  expect(placementOf(db, 'tp-zoom')).toBeUndefined()
  // The old name is back in the registry, placed, with nothing written on it —
  // the rename gone, and a duplicate entry standing where it was.
  const resurrected = db.touchpoints.find((row) => row.name === 'Zoom')
  expect(resurrected).toBeDefined()
  expect(placementOf(db, resurrected!.id)!.summary).toBeNull()
  // The writing is not destroyed — the sync keeps it — but it is stranded on a
  // dashed name-only row under a name the text no longer shows, which is a
  // board that disagrees with itself rather than a board that lost anything.
  const stranded = db.placements.find(
    (row) => row.cell_id === 'cell-1' && row.name === 'Zoom Meetings',
  )
  expect(stranded!.touchpoint_id).toBeNull()
  expect(stranded!.summary).toBe('The tutor opens the room from the session card')
})

// ---------------------------------------------------------------------------
// The fix
// ---------------------------------------------------------------------------

test('a rename moves the registry row and the cell text together', async () => {
  const db = fixture()
  const result = await renameTouchpoint(clientFor(db), 'tp-zoom', 'Zoom Meetings')

  expect(db.touchpoints.find((row) => row.id === 'tp-zoom')!.name).toBe('Zoom Meetings')
  expect(cellOf(db).content).toBe('Zoom Meetings, Zoom Recording')
  expect(result.previousName).toBe('Zoom')
  expect(result.cellIds).toEqual(['cell-1'])
})

test('a longer name containing the renamed one is left alone', async () => {
  const db = fixture()
  await renameTouchpoint(clientFor(db), 'tp-zoom', 'Zoom Meetings')

  // The near miss. A substring replace would have made this "Zoom Meetings
  // Recording" and orphaned the second placement on the next save.
  expect(parseCellContentItems(cellOf(db).content)).toEqual([
    'Zoom Meetings',
    'Zoom Recording',
  ])
  expect(db.touchpoints.find((row) => row.id === 'tp-recording')!.name).toBe(
    'Zoom Recording',
  )
})

test('editing an affected cell after a rename keeps its writing and its link', async () => {
  // The load-bearing one, and the exact sequence the defect describes: rename,
  // then an ordinary save of the affected cell through the same path the panel
  // uses.
  const db = fixture()
  const client = clientFor(db)
  await renameTouchpoint(client, 'tp-zoom', 'Zoom Meetings')

  await save(client, cellOf(db).content)

  const placement = placementOf(db, 'tp-zoom')
  expect(placement).toBeDefined()
  // The same ROW, not a replacement that happens to look like it.
  expect(placement!.id).toBe('ct-zoom')
  expect(placement!.summary).toBe('The tutor opens the room from the session card')
  expect(placement!.role).toBe('core')
  // And the neighbour, whose name merely contains the renamed one.
  expect(placementOf(db, 'tp-recording')!.summary).toBe('Reviewed afterwards by the lead')
  // No stray registry entry under the old name, and nothing left dashed.
  expect(db.touchpoints.filter((row) => row.name === 'Zoom')).toEqual([])
  expect(db.placements.filter((row) => row.touchpoint_id === null)).toEqual([])
})

test('a rename survives an author reordering the cell afterwards', async () => {
  // The other half of the same claim: the text is still the author's to edit,
  // and a reorder must keep both placements and their writing.
  const db = fixture()
  const client = clientFor(db)
  await renameTouchpoint(client, 'tp-zoom', 'Zoom Meetings')

  await save(client, 'Zoom Recording, Zoom Meetings')

  expect(placementOf(db, 'tp-recording')!.position).toBe(1)
  expect(placementOf(db, 'tp-zoom')!.position).toBe(2)
  expect(placementOf(db, 'tp-zoom')!.summary).toBe(
    'The tutor opens the room from the session card',
  )
})

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

test('the rename is recorded with an inverse that restores both halves', async () => {
  const db = fixture()
  const client = clientFor(db)
  await renameTouchpoint(client, 'tp-zoom', 'Zoom Meetings')

  const [entry] = sessionSnapshot()
  expect(entry.fn).toBe('rename_touchpoint')
  expect(entry.args.new_name).toBe('Zoom Meetings')
  expect(entry.args.cell_ids).toEqual(['cell-1'])
  // Keyed on the touchpoint's id, never on either name — the house rule that
  // stops an inverse landing on whatever carries that word now.
  expect(entry.revert).toEqual({
    fn: 'rename_touchpoint',
    args: { p_touchpoint_id: 'tp-zoom', p_name: 'Zoom' },
  })

  await executeRevert(client, entry)

  // BOTH halves. Restoring the registry row alone would leave the cells saying
  // "Zoom Meetings" and the next save would strand the placement all over
  // again — the defect, reintroduced by its own undo.
  expect(db.touchpoints.find((row) => row.id === 'tp-zoom')!.name).toBe('Zoom')
  expect(cellOf(db).content).toBe('Zoom, Zoom Recording')
  expect(placementOf(db, 'tp-zoom')!.summary).toBe(
    'The tutor opens the room from the session card',
  )
})

test('a revert records nothing of its own', async () => {
  const db = fixture()
  const client = clientFor(db)
  await renameTouchpoint(client, 'tp-zoom', 'Zoom Meetings')
  const [entry] = sessionSnapshot()

  await executeRevert(client, entry)

  // Undoing "Renamed a touchpoint" must not append a second rename to the very
  // list the first one is in.
  expect(sessionSnapshot()).toHaveLength(1)
})

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('a rename to nothing never reaches the database', async () => {
  const db = fixture()
  await expect(renameTouchpoint(clientFor(db), 'tp-zoom', '   ')).rejects.toThrow(
    /needs a name/,
  )
  expect(db.touchpoints.find((row) => row.id === 'tp-zoom')!.name).toBe('Zoom')
  expect(sessionSnapshot()).toHaveLength(0)
})

test('renaming a touchpoint that is gone throws instead of recording an inverse', async () => {
  const db = fixture()
  await expect(
    renameTouchpoint(clientFor(db), 'tp-vanished', 'Anything'),
  ).rejects.toThrow()
  // A zero-row write is a failure, not a no-op: an entry here would offer an
  // undo for a rename that never happened.
  expect(sessionSnapshot()).toHaveLength(0)
})

test('a rename onto a name the registry already holds is refused whole', async () => {
  const db = fixture()
  await expect(
    renameTouchpoint(clientFor(db), 'tp-zoom', 'Zoom Recording'),
  ).rejects.toThrow()
  expect(db.touchpoints.find((row) => row.id === 'tp-zoom')!.name).toBe('Zoom')
  expect(cellOf(db).content).toBe('Zoom, Zoom Recording')
})
