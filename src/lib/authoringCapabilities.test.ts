import { afterEach, describe, expect, it } from 'vitest'
import { updateCellStatus } from '@/lib/cellContentMutations'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { setAuthoringLogWriter, supabaseAuthoringLogWriter } from '@/lib/authoringLog'
import { renameStep, moveCell, insertCellAtPosition } from '@/lib/authoringRpc'
import { inMemoryDatabase, type InMemoryDatabase } from '@/test/inMemoryDatabase'
import { executeRevert } from '@/lib/revertChange'

afterEach(() => {
  clearSession()
  setAuthoringLogWriter(null)
})

describe('optional host-recorded structural authoring', () => {
  it.each([
    null,
    { id: 'step', change_id: null },
    { id: 'other-step', change_id: 'change' },
    { id: 'step', change_id: '' },
  ])('refuses malformed rename receipts without minting a session inverse: %j', async (receipt) => {
    const db = inMemoryDatabase({}, { rpc: () => receipt })
    await expect(renameStep(db.client, { stepId: 'step', expectedName: 'Before', name: 'After' })).rejects.toThrow(/read back before retrying/)
    expect(sessionSnapshot()).toHaveLength(0)
  })

  it('checks the durable receipt when restoring exact step names', async () => {
    let missingReceipt = false
    const db: InMemoryDatabase = inMemoryDatabase({ steps: [{ id: 'step', name: ' Before ' }], authoring_changes: [] }, {
      rpc(fn, args) {
        if (fn !== 'rename_step') throw new Error(`Unexpected RPC ${fn}`)
        if (missingReceipt) return null
        expect(db.tables.steps[0].name).toBe(args.expected_name)
        db.tables.steps[0].name = args.new_name
        db.tables.authoring_changes.push({ fn, args })
        return { id: 'step', change_id: 'change' }
      },
    })
    await renameStep(db.client, { stepId: 'step', expectedName: ' Before ', name: ' After ' })
    const entry = sessionSnapshot()[0]
    missingReceipt = true
    await expect(executeRevert(db.client, entry)).rejects.toThrow(/durable change id/)
    missingReceipt = false
    await executeRevert(db.client, entry)
    expect(db.tables.steps[0].name).toBe(' Before ')
    expect(sessionSnapshot()).toHaveLength(1)
    expect(db.tables.authoring_changes).toHaveLength(2)
  })

  it('requires a created key and durable receipt for explicit-slot insertion', async () => {
    const db = inMemoryDatabase({}, { rpc: () => ({ id: 'created', change_id: 'change' }) })
    await expect(insertCellAtPosition(db.client, {
      pathId: 'path', laneId: 'lane', stepId: 'step', position: 1, content: 'Text', status: 'planned',
    })).rejects.toThrow(/read back before retrying/)
    expect(sessionSnapshot()).toHaveLength(0)
  })

  it('moves a cell by identity, preserves its details, and restores the captured coordinates', async () => {
    const source = { path_id: 'old-path', lane_id: 'old-lane', step_id: 'old-step', position: 0 }
    const destination = { path_id: 'new-path', lane_id: 'new-lane', step_id: 'new-step', position: 1 }
    const db: InMemoryDatabase = inMemoryDatabase({
      cells: [{ id: 'cell', ...source, content: 'Keep text', cell_key: 'stable-key' }],
      evidence: [{ id: 'evidence', cell_id: 'cell' }], authoring_changes: [],
    }, { rpc(fn, args) {
      if (fn !== 'move_cell') throw new Error(`Unexpected RPC ${fn}`)
      expect(db.tables.cells[0]).toMatchObject(args.expected_source as object)
      Object.assign(db.tables.cells[0], args.destination)
      db.tables.authoring_changes.push({ fn, args })
      return { id: 'cell', change_id: 'move-change' }
    } })
    await moveCell(db.client, { cellId: 'cell', expectedSource: source, destination })
    expect(db.tables.cells[0]).toEqual({ id: 'cell', ...destination, content: 'Keep text', cell_key: 'stable-key' })
    expect(db.tables.evidence).toEqual([{ id: 'evidence', cell_id: 'cell' }])
    const inverse = sessionSnapshot()[0]
    destination.position = 9
    await executeRevert(db.client, inverse)
    expect(db.tables.cells[0]).toMatchObject(source)
    expect(db.tables.authoring_changes).toHaveLength(2)
    expect(sessionSnapshot()).toHaveLength(1)
  })

  it('inserts at an explicit secondary slot and captures only the created identity for human undo', async () => {
    const db: InMemoryDatabase = inMemoryDatabase({ cells: [{ id: 'existing', position: 0 }], authoring_changes: [] }, {
      rpc(fn, args) {
        if (fn !== 'insert_cell_at_position') throw new Error(`Unexpected RPC ${fn}`)
        db.tables.cells.push({ id: 'created', position: args.at_position, content: args.content, status: args.status })
        db.tables.authoring_changes.push({ fn, args })
        return { id: 'created', change_id: 'insert-change', cell_key: 'new-key' }
      },
    })
    const result = await insertCellAtPosition(db.client, {
      pathId: 'path', laneId: 'lane', stepId: 'step', position: 1, content: 'New text', status: 'planned',
    })
    expect(result).toEqual({ id: 'created', change_id: 'insert-change', cell_key: 'new-key' })
    expect(db.tables.cells).toEqual([{ id: 'existing', position: 0 }, { id: 'created', position: 1, content: 'New text', status: 'planned' }])
    expect(db.tables.authoring_changes).toHaveLength(1)
    expect(sessionSnapshot()[0].revert).toEqual({ fn: 'delete_cell', args: { cell_id: 'created' } })
  })

  it('renames a shared step with one server record and a locally constructed session inverse', async () => {
    const db: InMemoryDatabase = inMemoryDatabase({
      steps: [{ id: 'step', name: 'Old step' }],
      path_steps: [{ path_id: 'path-one', step_id: 'step', position: 0 }, { path_id: 'path-two', step_id: 'step', position: 1 }],
      authoring_changes: [],
    }, {
      rpc(fn, args) {
        if (fn === 'record_authoring_change') {
          db.tables.authoring_changes.push(args)
          return 'client-duplicate'
        }
        if (fn !== 'rename_step') throw new Error(`Unexpected RPC ${fn}`)
        db.tables.steps[0].name = 'New step'
        db.tables.authoring_changes.push({ id: 'server-change', fn, args })
        return { id: 'step', change_id: 'server-change', revert: { fn: 'untrusted_wire_inverse', args: {} } }
      },
    })
    setAuthoringLogWriter(supabaseAuthoringLogWriter(db.client))
    await renameStep(db.client, { stepId: 'step', expectedName: 'Old step', name: 'New step' })
    const read = await db.client.from('steps').select('*').eq('id', 'step').maybeSingle()
    expect(read.data).toMatchObject({ id: 'step', name: 'New step' })
    expect(db.tables.path_steps).toHaveLength(2)
    expect(db.tables.authoring_changes).toHaveLength(1)
    expect(db.rpcs.map((rpc) => rpc.fn)).toEqual(['rename_step'])
    expect(sessionSnapshot()[0].revert).toEqual({
      fn: 'rename_step', args: { step_id: 'step', expected_name: 'New step', new_name: 'Old step' },
    })
  })
})

function blankCellDatabase(ledger?: 'error' | 'zero') {
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const database: InMemoryDatabase = inMemoryDatabase({
    cells: [{ id: 'blank-cell', content: '', summary: 'Keep this', status: 'live' }],
    cell_touchpoints: [{ id: 'placement', cell_id: 'blank-cell', name: 'Keep placement', position: 0 }],
    authoring_changes: [],
  }, {
    rpc(fn, args) {
      if (fn !== 'record_authoring_change') throw new Error(`Unexpected RPC ${fn}`)
      if (ledger === 'error') throw new Error('Ledger unavailable')
      if (ledger === 'zero') return null
      database.tables.authoring_changes.push({ id, ...args })
      return id
    },
  })
  return database
}

describe('status-only authoring through the mutation and durable/session ledgers', () => {
  it('changes a blank cell status, preserving text and placements, with one exact inverse', async () => {
    const db = blankCellDatabase()
    const changeId = await updateCellStatus(db.client, 'blank-cell', 'deprecated', 'live')
    const read = await db.client.from('cells').select('*').eq('id', 'blank-cell').maybeSingle()
    expect(read.data).toMatchObject({ content: '', summary: 'Keep this', status: 'deprecated' })
    expect(db.tables.cell_touchpoints).toEqual([{ id: 'placement', cell_id: 'blank-cell', name: 'Keep placement', position: 0 }])
    expect(db.updates[0].patch).toEqual({ status: 'deprecated' })
    expect(db.tables.authoring_changes).toHaveLength(1)
    expect(db.tables.authoring_changes[0]).toMatchObject({
      id: changeId, fn: 'update_cell_status',
      revert: { fn: 'update_cell_status', args: { cell_id: 'blank-cell', expected_status: 'deprecated', status: 'live' } },
    })
    expect(sessionSnapshot()).toHaveLength(1)
    expect(db.rpcs.map((rpc) => rpc.fn)).toEqual(['record_authoring_change'])
  })

  it('restores status from the branded session inverse without another record or text sync', async () => {
    const db = blankCellDatabase()
    await updateCellStatus(db.client, 'blank-cell', 'built', 'live')
    await executeRevert(db.client, sessionSnapshot()[0])
    const read = await db.client.from('cells').select('*').eq('id', 'blank-cell').maybeSingle()
    expect(read.data).toMatchObject({ status: 'live', content: '', summary: 'Keep this' })
    expect(db.tables.cell_touchpoints).toHaveLength(1)
    expect(db.tables.authoring_changes).toHaveLength(1)
    expect(sessionSnapshot()).toHaveLength(1)
  })

  it('refuses stale or missing cells without a write or inverse record', async () => {
    const db = blankCellDatabase()
    await expect(updateCellStatus(db.client, 'blank-cell', 'deprecated', 'built')).rejects.toThrow(/status changed/)
    await expect(updateCellStatus(db.client, 'missing', 'deprecated', 'live')).rejects.toThrow(/no longer exists/)
    expect(db.updates).toHaveLength(0)
    expect(db.tables.authoring_changes).toHaveLength(0)
    expect(sessionSnapshot()).toHaveLength(0)
  })

  it('allows only one of two competing expected-status writes', async () => {
    const db = blankCellDatabase()
    const outcomes = await Promise.allSettled([
      updateCellStatus(db.client, 'blank-cell', 'built', 'live'),
      updateCellStatus(db.client, 'blank-cell', 'planned', 'live'),
    ])
    expect(outcomes.filter((one) => one.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((one) => one.status === 'rejected')).toHaveLength(1)
    expect(db.tables.authoring_changes).toHaveLength(1)
    expect(sessionSnapshot()).toHaveLength(1)
  })

  it.each(['error', 'zero'] as const)('surfaces a partial write after a %s ledger failure and retains its inverse', async (failure) => {
    const db = blankCellDatabase(failure)
    await expect(updateCellStatus(db.client, 'blank-cell', 'deprecated', 'live')).rejects.toThrow(/status changed.*record failed/)
    const read = await db.client.from('cells').select('*').eq('id', 'blank-cell').maybeSingle()
    expect(read.data).toMatchObject({ status: 'deprecated', content: '' })
    expect(db.tables.authoring_changes).toHaveLength(0)
    expect(sessionSnapshot()[0].revert).toEqual({
      fn: 'update_cell_status', args: { cell_id: 'blank-cell', status: 'live', expected_status: 'deprecated' },
    })
  })
})
