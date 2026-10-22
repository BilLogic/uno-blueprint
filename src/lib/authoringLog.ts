import { HOST_OPERATIONS, isWrittenIdentity } from '@/lib/hostAuthoringOperations'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangeEntry } from '@/lib/authoringSession'
import type { Database, Json } from '@/types/database'

/**
 * The durable half of the change record.
 *
 * `authoringSession.ts` is the fast one: a module-level array, read by the
 * changes sheet, emptied by a page refresh. That is the right shape for undo
 * and the wrong shape for a record — close the tab and thirty edits leave no
 * trace, while a single deleted cell is remembered forever, because deletions
 * were durable and nothing else was.
 *
 * This module is the durable end of the session recorders: the same entry,
 * appended to `public.authoring_changes`. The two are not alternatives. The array stays
 * the undo affordance and this stays the record, and the reason they can
 * coexist is that neither can drift from the other — both are fed by the one
 * session capture, after the write it describes has already succeeded.
 *
 * AUDIT-ONLY. Nothing here replays an inverse. `revert` travels so a row can
 * SAY what would undo it; replaying it against a database that has moved on is
 * a different problem and is out of scope on purpose.
 *
 * That is now enforced rather than described, and the reason is the table's
 * own write surface. `record_authoring_change` validates the operation name
 * and treats `args` and `revert` as free jsonb, so this module is one writer
 * among however many hold the grant — and the log already carries an
 * `update_cell_content` row in a shape no build of this app has emitted. A
 * replay that consumed it would throw, or half-apply. `executeRevert`
 * therefore accepts only a `SessionEntry`, minted by the session recorders.
 * `revertBoundaryContract.test.ts` refuses the casts and signature changes that would let a row from here reach it. The direction of
 * travel is one-way by construction: entries leave the session for this table,
 * and the return trip has no route.
 */

/** One row of `public.authoring_changes`, as `record_authoring_change` takes it. */
export type AuthoringLogRow = {
  fn: string
  args: Json
  revert: Json | null
  author: 'human' | 'agent'
  agent_session_id: string | null
}

/**
 * The operations whose log row is written by the DATABASE, not by this client.
 *
 * Each of these is a `security definer` function that archives every row it is
 * about to destroy — into the log now, into `deleted_structure` before the
 * migration that folded that table in. It has to: the payload can only be
 * captured inside the same transaction as the cascade, and a client-side
 * append runs afterwards, when the rows it was meant to preserve are gone.
 *
 * So appending here as well would put TWO rows in the log for one delete, one
 * of them without the payload — which is worse than the split this whole
 * change exists to end, because both rows would look like records of the same
 * event and only one of them could restore anything.
 *
 * `remove_lanes` is in the set and is not a `WriteFn`: it is reachable only as
 * the captured inverse of `add_lane`, so `recordChange` never sees it. It is
 * listed because this set's contract is "the SQL functions that archive", and
 * `scripts/tests/authoring-log.test.mjs` holds it to exactly that set read out
 * of the migrations — a seventh archiving function added without a line here
 * fails that test rather than silently double-recording.
 */
export const ARCHIVED_BY_THE_DATABASE: ReadonlySet<string> = new Set([
  'delete_cell',
  'delete_path',
  'delete_scenario',
  'remove_lane',
  'remove_lanes',
  'remove_step',
])

/** Optional host RPCs: wrappers require a durable receipt before recording. */
export const RECORDED_BY_THE_HOST: ReadonlySet<string> = new Set(Object.keys(HOST_OPERATIONS))

/**
 * The row one recorded change becomes, or `null` when the database already
 * wrote it.
 *
 * Pure, and separate from the append below, because this is the part worth
 * asserting: that agent attribution survives the crossing. The in-memory entry
 * carries `author: 'agent'` and an `agentSessionId`; a row that dropped either
 * would still look like a complete record of the change and would have lost
 * the only thing that makes an agent's writes accountable.
 */
export function authoringLogRow(entry: ChangeEntry): AuthoringLogRow | null {
  if (ARCHIVED_BY_THE_DATABASE.has(entry.fn) || RECORDED_BY_THE_HOST.has(entry.fn)) return null
  const isAgent = entry.author === 'agent' && Boolean(entry.agentSessionId)
  return {
    fn: entry.fn,
    args: (entry.args ?? {}) as Json,
    revert: entry.revert ? (entry.revert as unknown as Json) : null,
    // The column pair is a biconditional in SQL — an agent session names an
    // agent's write and nothing else — so the two fields are decided together
    // here rather than mapped independently. An entry attributed to an agent
    // with no session id is a bug upstream; recording it as a human's write is
    // the honest reading, and the alternative is a row the constraint refuses
    // and therefore a change with no record at all.
    author: isAgent ? 'agent' : 'human',
    agent_session_id: isAgent ? entry.agentSessionId! : null,
  }
}

export type AuthoringLogWriter = (row: AuthoringLogRow) => Promise<unknown>

/** A command whose success includes the record must await its actual id. */
export async function appendRequiredAuthoringLog(
  entry: ChangeEntry,
  write: AuthoringLogWriter,
): Promise<string> {
  const row = authoringLogRow(entry)
  if (!row) throw new Error('This operation records itself in the database.')
  const id = await write(row)
  if (!isWrittenIdentity(id)) {
    throw new Error('The authoring log returned no change id.')
  }
  return id
}

let writer: AuthoringLogWriter | null = null

/**
 * Install the writer. Called once, beside the shared Supabase client, because
 * `recordChange` is a plain function with no component and no client around it.
 *
 * Null in no-DB mode and in every test that does not opt in, where the append
 * is simply not attempted — the in-memory list still works, which is the point
 * of keeping the two independent.
 */
export function setAuthoringLogWriter(next: AuthoringLogWriter | null): void {
  writer = next
}

/**
 * Append one recorded change, without ever failing the write it describes.
 *
 * Fire-and-forget on purpose. The change has already landed in the database by
 * the time this runs; making the UI report an error because the AUDIT append
 * failed would tell an author their edit did not save when it did, which is a
 * worse lie than the missing row. The failure is loud in the console and
 * nowhere else. Commands whose success explicitly requires a durable receipt
 * use `appendRequiredAuthoringLog` through `recordRequiredChange` instead;
 * they surface a failed append as a partial write and keep the session inverse.
 */
export function appendToAuthoringLog(entry: ChangeEntry): void {
  if (!writer) return
  const row = authoringLogRow(entry)
  if (!row) return
  try {
    const result = writer(row)
    void Promise.resolve(result).catch((error: unknown) => {
      console.error('[authoring-log] could not record a change:', error)
    })
  } catch (error) {
    console.error('[authoring-log] could not record a change:', error)
  }
}

/** The writer that actually reaches the database. */
export function supabaseAuthoringLogWriter(
  client: SupabaseClient<Database>,
): AuthoringLogWriter {
  return async (row) => {
    // The function defaults `revert` and `agent_session_id` to null, so an
    // argument left out and one sent as null are the same call; the generated
    // types spell an optional argument as absent, and this is that spelling.
    const { data, error } = await client.rpc('record_authoring_change', {
      ...row,
      revert: row.revert ?? undefined,
      agent_session_id: row.agent_session_id ?? undefined,
    })
    if (error) throw error
    return data
  }
}
