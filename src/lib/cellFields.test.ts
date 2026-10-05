import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CELL_FIELDS,
  cellFieldsFromRow,
  cellSelectColumns,
  sameCellEdit,
  type AnyCellField,
  type RawCellColumns,
} from '@/lib/cellFields'
import { normalizeBlueprint } from '@/lib/normalizeBlueprint'
import { PATH_BLUEPRINT_SELECT } from '@/lib/workflowQueries'

/*
  THE SELECT AND THE NORMALIZER ARE FUNCTIONS OF ONE LIST.

  What held them together before was a test that read the select STRING and
  the normalizer SOURCE and compared the two column lists, because neither
  `tsc` nor a runtime assertion could see a column named in one and dropped
  from the other. That test is gone: both now derive from `CELL_FIELDS`, and
  the proof is not that two texts agree but that changing one descriptor
  moves both derivations at once.
*/

const ROW: RawCellColumns = {
  id: 'cell-1',
  lane_id: 'lane-1',
  step_id: 'step-1',
  content: 'Dispatcher confirms the address',
  position: 2,
  summary: 'Books a crew',
  status: 'planned',
  function: 'Confirm',
  value_props: [{ for: 'Customer', value: 'A booked slot' }],
  owner: 'Dispatch',
}

afterEach(() => {
  vi.doUnmock('@/lib/cellFields')
  vi.resetModules()
})

describe('the cell field list', () => {
  it('names every column the board select asks for, and every one lands on the cell', () => {
    const selected = cellSelectColumns()
    // Whole identifiers, not substrings: `owner` sits inside `perceived_owner`.
    const columns = selected.split(',').map((column) => column.trim())
    const cell = cellFieldsFromRow(ROW)
    for (const descriptor of CELL_FIELDS) {
      // `function` is a reserved word to PostgREST and travels quoted.
      const spelled = descriptor.key === 'function' ? '"function"' : descriptor.key
      expect(columns, descriptor.key).toContain(spelled)
      expect(cell, descriptor.key).toHaveProperty(descriptor.key)
    }
    // And the board select carries that block — the derivation is the one
    // the canvas reads with, not a parallel string.
    expect(PATH_BLUEPRINT_SELECT).toContain(selected)
  })

  it('moves the select and the normalized cell together when one descriptor changes', () => {
    // Drop one column: the select stops asking for it, the cell stops
    // carrying it, in the same edit. Then change how one is read: the cell's
    // value moves and the select is untouched, because the mapping is the
    // descriptor's and the select only knows the key.
    const withoutSummary = CELL_FIELDS.filter((descriptor) => descriptor.key !== 'summary')
    expect(cellSelectColumns(withoutSummary)).not.toContain('summary')
    expect(cellFieldsFromRow(ROW, withoutSummary)).not.toHaveProperty('summary')

    const shouting: readonly AnyCellField[] = CELL_FIELDS.map((descriptor) =>
      descriptor.key === 'content'
        ? { ...descriptor, normalize: (value: string | null | undefined) => (value ?? '').toUpperCase() }
        : descriptor,
    )
    expect(cellFieldsFromRow(ROW, shouting).content).toBe('DISPATCHER CONFIRMS THE ADDRESS')
    expect(cellSelectColumns(shouting)).toBe(cellSelectColumns())
  })

  it('is the list the exported select and normalizer are bound to, not a parallel copy', async () => {
    // The helpers above take the list as an argument; the select constant and
    // the normalizer bind `CELL_FIELDS` when their modules load. So load them
    // over a list with one descriptor fewer and watch both move — the proof
    // that the exports derive from the list rather than restating it.
    vi.resetModules()
    vi.doMock('@/lib/cellFields', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/cellFields')>()
      const fields = actual.CELL_FIELDS.filter((descriptor) => descriptor.key !== 'owner')
      return {
        ...actual,
        CELL_FIELDS: fields,
        CELL_SELECT_COLUMNS: actual.cellSelectColumns(fields),
        cellFieldsFromRow: (row: RawCellColumns, list = fields) =>
          actual.cellFieldsFromRow(row, list),
      }
    })
    const { PATH_BLUEPRINT_SELECT: select } = await import('@/lib/workflowQueries')
    const { normalizeBlueprint: normalize } = await import('@/lib/normalizeBlueprint')

    expect(select.split(',').map((column) => column.trim())).not.toContain('owner')
    expect(select).toContain('perceived_owner')
    const { cells } = normalize({
      id: 'path-1',
      name: 'Happy path',
      kind: 'happy',
      lanes: [{ id: 'lane-1', name: 'Dispatch', position: 0 }],
      path_steps: [{ position: 0, steps: { id: 'step-1', name: 'Confirm' } }],
      cells: [ROW],
    })
    expect(cells[0]).not.toHaveProperty('owner')
    expect(cells[0]).toHaveProperty('perceived_owner', null)
  })

  it('reads a row the way the canvas needs it: defaults, narrowing, and null for absence', () => {
    const cell = cellFieldsFromRow({ ...ROW, position: undefined, status: 'whatever' })
    // Sorted on by every slot, so absent is 0 rather than undefined.
    expect(cell.position).toBe(0)
    // A status the renderer has no treatment for reads as absent.
    expect(cell.status).toBeNull()
    // A column the fallback did not carry is null, not undefined — one kind
    // of empty for the panel to check.
    expect(cell.form).toBeNull()
    expect(cell.frame).toBeNull()
    expect(cell.perceived_owner).toBeNull()
    // Except the jsonb shape, which stays absent so "unset" and "set to
    // nothing" can be told apart.
    expect(cellFieldsFromRow({ ...ROW, value_props: undefined }).value_props).toBeUndefined()
    expect(cell.value_props).toEqual([{ for: 'Customer', value: 'A booked slot' }])
    expect(cellFieldsFromRow(ROW).status).toBe('planned')
  })

  it('is what the normalizer puts on a blueprint cell', () => {
    const { cells } = normalizeBlueprint({
      id: 'path-1',
      name: 'Happy path',
      kind: 'happy',
      lanes: [{ id: 'lane-1', name: 'Dispatch', position: 0 }],
      path_steps: [{ position: 0, steps: { id: 'step-1', name: 'Confirm' } }],
      cells: [ROW],
    })
    expect(cells[0]).toMatchObject(cellFieldsFromRow(ROW))
  })

  it('sorts every field into one of the three groups, with a write route that matches', () => {
    for (const descriptor of CELL_FIELDS) {
      expect(['structure', 'content', 'spec']).toContain(descriptor.group)
      // Structure moves through an RPC or not at all; content and spec go
      // through their own grants, except the frame, which is an RPC of its
      // own. A content field routed through the spec grant would be a
      // write the grant refuses.
      if (descriptor.group === 'structure') expect([null, 'rpc']).toContain(descriptor.writeRoute)
      if (descriptor.group === 'spec') expect(descriptor.writeRoute).toBe('spec')
      if (descriptor.group === 'content')
        expect(['content', 'rpc']).toContain(descriptor.writeRoute)
    }
    // The agent's argument names are the column names: `update_cell` takes
    // each field under its schema spelling, and the derivation that will
    // build its schema from this list relies on that.
    for (const descriptor of CELL_FIELDS) {
      if ('agentArg' in descriptor) expect(descriptor.agentArg).toBe(descriptor.key)
    }
  })
})

/*
  The value propositions compared as the spec write stores them: each entry
  trimmed, a row blank on both sides dropped. Anything looser offers a Save
  that writes the list it read and logs a change with nothing in it.
*/
describe('sameCellEdit over the value propositions', () => {
  const stored = [{ for: 'Residents', value: 'A report reaches the desk.' }]

  it('treats an added blank row as no change', () => {
    expect(sameCellEdit('value_props', [...stored, { for: '', value: '  ' }], stored)).toBe(true)
  })

  it('treats whitespace the write trims as no change', () => {
    expect(
      sameCellEdit('value_props', [{ for: 'Residents ', value: ' A report reaches the desk.' }], stored),
    ).toBe(true)
  })

  it('still sees a real edit', () => {
    expect(sameCellEdit('value_props', [{ for: 'Residents', value: 'A reply.' }], stored)).toBe(false)
    expect(sameCellEdit('value_props', [{ for: '', value: 'Half a row' }], [])).toBe(false)
  })
})
