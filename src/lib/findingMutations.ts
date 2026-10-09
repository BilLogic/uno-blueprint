import type { SupabaseClient } from '@supabase/supabase-js'
import { recordChange } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import type { FindingRating } from '@/lib/findingPriority'
import { requireRowsWritten } from '@/lib/optimisticConcurrency'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/** Mirrors `audit_findings_severity_check` — a bad severity fails to compile. */
export type FindingSeverity = 'info' | 'warn' | 'critical'
/** Mirrors `audit_findings_status_check`. */
export type FindingStatus = 'open' | 'resolved' | 'dismissed'
/** Mirrors `audit_findings_source_check`. */
export type FindingSource = 'audit' | 'whatif' | 'import-sweep'

/**
 * Findings writes, in the session ledger like every other write.
 *
 * The agent's `create_finding` and `update_finding` tools wrote the table
 * straight from the tool dispatcher, which is the one place the omission was
 * hardest to see: the writes were made by a machine, in a batch, on rows a
 * person had often already read and triaged. Three defects followed, none of
 * them visible at the call site.
 *
 * 1. **Nothing reached the ledger.** An audit run could rewrite the severity
 *    and summary of a finding a person had triaged, and leave no row in the
 *    change list saying it had.
 * 2. **Undo was worse than inert.** The ledger's undo takes the newest entry
 *    that captured an inverse. With the findings writes absent from the list,
 *    a press after an audit run reached past them and took back the person's
 *    own last edit instead — silently, and on something they had not been
 *    looking at.
 * 3. **A zero-row update read as success.** The dedupe rewrite was
 *    `.update().eq('id', …)` with no `.select()`, which returns `error: null`
 *    when nothing matched.
 *
 * ## Why a created finding has no revert
 *
 * Every update here carries a captured inverse. The insert deliberately does
 * not, and that is a fact about the grants rather than an omission: DELETE on
 * this table is revoked from `authenticated` and never granted back, with no
 * policy to reach it — the recipe's comment for that grant block says delete
 * stays revoked everywhere, and the unique index over open fingerprints is the
 * dedupe backstop behind it.
 *
 * The only ways to make a finding go quiet are `resolved` and `dismissed`, and
 * neither is an inverse: both are triage decisions a person's own reading is
 * supposed to produce. `dismissed` is the worse of the two, because the dedupe
 * rule below is that dismissed stays dismissed — an undo that wrote it would
 * suppress that check on every future run, invisibly, which is precisely what
 * the insert policy's `status = 'open'` check exists to prevent. An entry with
 * no revert control is honest about what can be taken back; one whose control
 * quietly dismisses a check is not.
 */
export type FindingDraft = {
  serviceId: string
  runId: string
  source: FindingSource
  checkKey: string
  severity: FindingSeverity
  /**
   * How much fixing it matters, and how much work the fix takes. Required on
   * a new finding: the columns are nullable only so that rows recorded before
   * the ratings existed stay valid, and a reader shows those as unrated.
   */
  impact: FindingRating
  effort: FindingRating
  /**
   * Ordered cell ids. A finding raised against live rows carries them into
   * `cell_keys` too — the table checks the two have equal cardinality, and
   * there is no IR key path to record for such a finding. An id is a worse
   * trail than a key path and a far better one than an empty array.
   *
   * The two are still written as separate named fields, so an inverse can put
   * each column back as it was rather than rebuilding one from the other.
   */
  cellIds: readonly string[]
  summary: string
  fingerprint: string
}

/**
 * What `recordFinding` did.
 *
 * A tri-state rather than a boolean because the third case writes nothing at
 * all, and the caller has a different sentence for each.
 */
export type FindingOutcome =
  | { kind: 'created'; findingId: string; reopened: boolean }
  | { kind: 'deduped'; findingId: string }
  | { kind: 'suppressed' }

/** The columns the grant allows an update to write — the grant, as a type. */
export type FindingUpdate = {
  severity?: FindingSeverity
  /** Null only on the way back: an inverse restoring a row that was unrated. */
  impact?: FindingRating | null
  effort?: FindingRating | null
  summary?: string | null
  runId?: string
  cellIds?: readonly string[]
  /**
   * Written and reverted SEPARATELY from `cell_ids`, even though a finding
   * raised against live rows sets both to the same list. The two columns can
   * hold different things — an imported finding carries real IR key paths
   * here — so an inverse that names only `cellIds` restores that column and
   * rewrites this one from it, losing the key paths for good.
   */
  cellKeys?: readonly string[]
  source?: FindingSource
  status?: FindingStatus
}

type FindingPatch = Database['public']['Tables']['audit_findings']['Update']

/**
 * `FindingUpdate` in the column names the table uses.
 *
 * Named keys only, and an absent key stays absent: the inverse is built from
 * the same shape, and it must write back only what the forward write moved.
 */
function toPatch(update: FindingUpdate): FindingPatch {
  const patch: FindingPatch = {}
  if (update.severity !== undefined) patch.severity = update.severity
  if (update.impact !== undefined) patch.impact = update.impact
  if (update.effort !== undefined) patch.effort = update.effort
  if (update.summary !== undefined) patch.summary = update.summary
  if (update.runId !== undefined) patch.run_id = update.runId
  if (update.cellIds !== undefined) patch.cell_ids = [...update.cellIds]
  if (update.cellKeys !== undefined) patch.cell_keys = [...update.cellKeys]
  if (update.source !== undefined) patch.source = update.source
  if (update.status !== undefined) patch.status = update.status
  return patch
}

/**
 * Record a finding, honouring the dedupe contract.
 *
 * The read, the branch and both writes live together because the branch *is*
 * the write path: "an open twin already exists" and "a person dismissed this"
 * are the two answers that decide whether anything is written at all, and
 * splitting them across the caller would put half the rule outside the module
 * the write boundary protects.
 *
 * The suppressed case records nothing — not an entry without a revert, but no
 * entry. The ledger's claim is that it lists writes that landed, and this one
 * did not happen.
 */
export async function recordFinding(
  client: Client,
  draft: FindingDraft,
): Promise<FindingOutcome> {
  const { data: existing, error: readError } = await client
    .from('audit_findings')
    .select('id, status')
    .eq('service_id', draft.serviceId)
    .eq('fingerprint', draft.fingerprint)
    .order('updated_at', { ascending: false })
  if (readError) throw toAuthoringError(readError)

  const open = existing?.find((row) => row.status === 'open')
  if (open) {
    await updateFinding(client, open.id, {
      severity: draft.severity,
      impact: draft.impact,
      effort: draft.effort,
      summary: draft.summary,
      runId: draft.runId,
      cellIds: draft.cellIds,
      // Both, named separately, so the inverse can put each column back as it
      // was. A finding raised against live rows has no key path to record, so
      // the ids stand in for one here; that is not a reason to let the undo
      // conflate them.
      cellKeys: draft.cellIds,
      source: draft.source,
    })
    return { kind: 'deduped', findingId: open.id }
  }

  if (existing?.some((row) => row.status === 'dismissed')) {
    return { kind: 'suppressed' }
  }

  const { data, error } = await client
    .from('audit_findings')
    .insert({
      service_id: draft.serviceId,
      run_id: draft.runId,
      source: draft.source,
      check_key: draft.checkKey,
      severity: draft.severity,
      impact: draft.impact,
      effort: draft.effort,
      summary: draft.summary,
      cell_ids: [...draft.cellIds],
      cell_keys: [...draft.cellIds],
      fingerprint: draft.fingerprint,
    })
    .select('id')
    .single()
  if (error) throw toAuthoringError(error)

  // No inverse — see the module header. The entry is still recorded: a change
  // with no revert control is recoverable from, a missing one is not.
  recordChange('create_finding', {
    finding_id: data.id,
    check_key: draft.checkKey,
    severity: draft.severity,
    impact: draft.impact,
    effort: draft.effort,
    run_id: draft.runId,
  })

  return {
    kind: 'created',
    findingId: data.id,
    reopened: (existing?.length ?? 0) > 0,
  }
}

/**
 * Edit one finding, capturing the prior value of every column it writes.
 *
 * Self-inverse, like `updateCellSpec`: the captured payload IS a
 * `FindingUpdate`, so the revert hands it straight back to this function.
 * Keyed on the finding id rather than on the fingerprint, so an out-of-order
 * revert lands on the finding the edit came from — the fingerprint is
 * deliberately not an identity here, because reopening a resolved twin mints a
 * second row that shares it.
 *
 * Only the named fields are captured. An inverse that wrote every granted
 * column back would undo a status flip that happened between the edit and the
 * undo, which is a different change belonging to a different person.
 *
 * `record: false` is for the revert path, which must not log its own undo.
 */
export async function updateFinding(
  client: Client,
  findingId: string,
  update: FindingUpdate,
  options: { record?: boolean } = {},
): Promise<void> {
  const patch = toPatch(update)
  if (Object.keys(patch).length === 0) {
    throw new Error('An empty finding update writes nothing — pass a field.')
  }

  // Before the write, while the previous values are still knowable.
  const { data: before, error: readError } = await client
    .from('audit_findings')
    .select(
      'id, check_key, severity, impact, effort, summary, run_id, cell_ids, cell_keys, source, status',
    )
    .eq('id', findingId)
    .maybeSingle()
  if (readError) throw toAuthoringError(readError)
  if (!before) throw new Error(`No finding with id ${findingId}.`)

  const previous: FindingUpdate = {}
  if (update.severity !== undefined) previous.severity = before.severity as FindingSeverity
  if (update.impact !== undefined) previous.impact = (before.impact ?? null) as FindingRating | null
  if (update.effort !== undefined) previous.effort = (before.effort ?? null) as FindingRating | null
  if (update.summary !== undefined) previous.summary = before.summary
  if (update.runId !== undefined) previous.runId = before.run_id
  if (update.cellIds !== undefined) previous.cellIds = before.cell_ids
  if (update.cellKeys !== undefined) previous.cellKeys = before.cell_keys
  if (update.source !== undefined) previous.source = before.source as FindingSource
  if (update.status !== undefined) previous.status = before.status as FindingStatus

  const { data, error } = await client
    .from('audit_findings')
    .update(patch)
    .eq('id', findingId)
    .select('id')
  if (error) throw toAuthoringError(error)
  // `.select()` is what makes the next line real: without it there are no rows
  // to count, and a write that matched nothing reports success.
  requireRowsWritten(data, 'finding')

  if (options.record !== false) {
    recordChange(
      'update_finding',
      {
        finding_id: findingId,
        check_key: before.check_key,
        ...(update.status !== undefined ? { status: update.status } : {}),
      },
      { fn: 'update_finding', args: { finding_id: findingId, update: previous } },
    )
  }
}
