import type { ChangeEntry, RevertSpec } from '@/lib/authoringSession'

export type RecordedAuthoringWrite = { id: string; change_id: string }
type Args = Record<string, unknown>

/** IDs may be opaque, but an empty or nil identity never proves a write. */
export function isWrittenIdentity(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
    && value.trim() !== '00000000-0000-0000-0000-000000000000'
}

function receipt(value: unknown): RecordedAuthoringWrite {
  if (!value || typeof value !== 'object' || !('id' in value) || !('change_id' in value)
      || !isWrittenIdentity(value.id) || !isWrittenIdentity(value.change_id)) {
    throw invalidReceipt()
  }
  return { id: value.id, change_id: value.change_id }
}

function invalidReceipt(): Error {
  return new Error('The authoring operation returned no matching row or durable change id; read back before retrying.')
}

/**
 * Optional host contracts, not an inventory of installed portable-core RPCs.
 * Each operation owns its receipt, inverse and session description here.
 * Inverses are constructed from the guarded call, never hydrated from wire
 * JSON, and the host already logged them atomically. Session recording must
 * not append another durable row. Client tests at the public wrapper/session
 * seam use an in-memory database; hosts must separately prove SQL/grants.
 * Creation captures delete_cell for human undo. executeRevert checks the
 * humanOnlyInverse flag and rejects it during an attributed agent call;
 * the agent has no direct delete tool.
 */
export const HOST_OPERATIONS = {
  rename_step: {
    receipt(value: unknown, args: Args) {
      const result = receipt(value)
      if (result.id !== args.step_id) throw invalidReceipt()
      return result
    },
    inverse(args: Args): RevertSpec {
      return { fn: 'rename_step', args: { step_id: args.step_id, expected_name: args.new_name, new_name: args.expected_name } }
    },
    describe(entry: ChangeEntry) {
      const name = typeof entry.args.new_name === 'string' ? entry.args.new_name.trim() : ''
      return `Renamed a step${name ? ` to “${name}”` : ''}`
    },
    humanOnlyInverse: false,
  },
  move_cell: {
    receipt(value: unknown, args: Args) {
      const result = receipt(value)
      if (result.id !== args.cell_id) throw invalidReceipt()
      return result
    },
    inverse(args: Args): RevertSpec {
      return { fn: 'move_cell', args: { cell_id: args.cell_id, expected_source: args.destination, destination: args.expected_source } }
    },
    describe: () => 'Moved a cell',
    humanOnlyInverse: false,
  },
  insert_cell_at_position: {
    receipt(value: unknown, _args: Args) {
      const result = receipt(value)
      if (!value || typeof value !== 'object' || !('cell_key' in value)
          || typeof value.cell_key !== 'string' || !value.cell_key.trim()) throw invalidReceipt()
      return { ...result, cell_key: value.cell_key }
    },
    inverse(_args: Args, result: RecordedAuthoringWrite): RevertSpec {
      return { fn: 'delete_cell', args: { cell_id: result.id } }
    },
    describe: () => 'Added a cell',
    humanOnlyInverse: true,
  },
}

export type HostOperation = keyof typeof HOST_OPERATIONS
export type HostReceipt<Fn extends HostOperation> = ReturnType<(typeof HOST_OPERATIONS)[Fn]['receipt']>

export function isHostOperation(fn: string): fn is HostOperation {
  return Object.hasOwn(HOST_OPERATIONS, fn)
}

export const HOST_DESCRIBERS = Object.fromEntries(
  Object.entries(HOST_OPERATIONS).map(([fn, operation]) => [fn, operation.describe]),
) as Record<HostOperation, (entry: ChangeEntry) => string>
