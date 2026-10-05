/**
 * What has been changed since Edit was turned on.
 *
 * Every structural write in the app goes through one `call()` in
 * `authoringRpc.ts`, so the log is an append there — which is what makes it
 * trustworthy: it records calls that were actually made, not intentions. It
 * cannot drift from the database, because it *is* the list of things sent to
 * the database.
 *
 * Deliberately not an undo stack. Undo is positional — it reverses whatever
 * happened last — while this is addressable: having added a step, a lane and a
 * cell, wanting the lane back should not mean undoing two things you meant to
 * keep. Entries that captured an inverse carry it in `revert`, and the sheet
 * offers a per-row revert; entries without one (deletes, changes recorded
 * before their before-state was captured) simply show no revert control.
 *
 * Module-level rather than React state because `call()` is a plain function
 * with no component around it. Subscribers read through `useSyncExternalStore`.
 *
 * It is no longer the ONLY record. `recordChange` also appends to
 * `public.authoring_changes` through `authoringLog.ts`, which is what survives
 * the refresh this list does not. The two are deliberately different things:
 * this one is positional, small and fast, and is what undo reads; that one is
 * append-only, permanent, and nothing stored in it is ever replayed.
 *
 * That last clause used to read "and is read by nobody in this app", and it
 * was already false when it was written. `public.trash` is a view over the
 * deletion rows of that same table, and `useArchiveAvailable` reads it on
 * every session to decide whether a delete affordance may ship at all. What
 * it reads is `select id limit 1` — the question is whether the relation is
 * there, not what is in it — so no stored payload has ever been handed back
 * to the app. That is the claim worth making, and the difference matters:
 * a table something already reads is a table the next person reaches into
 * for the payload as well.
 *
 * Which is why the claim is now a wall instead of a habit. `executeRevert`
 * takes a `SessionEntry`, a type only `recordChange` below can mint, so a row
 * selected out of `public.authoring_changes` cannot be handed to the undo
 * path — not because nobody has tried, but because it does not compile.
 * `revertBoundaryContract.test.ts` holds the rest of the argument.
 */
import { appendToAuthoringLog } from '@/lib/authoringLog'

/**
 * How to take one change back: the operation that undoes it, captured at
 * record time while the before-state was still known. `fn` is either an
 * authoring RPC name or one of the direct-table mutation names
 * (`update_cell_content`, `update_cell_spec`, `update_cell_resources`) —
 * `executeRevert` in `revertChange.ts` knows which is which.
 */
export type RevertSpec = {
  fn: string
  args: Record<string, unknown>
}

/**
 * Every operation that can land in the ledger — the authoring RPCs plus the
 * direct-table mutations that log themselves.
 *
 * A union rather than `string` so that adding an operation and forgetting to
 * teach `describeChange` about it is a **compile error** instead of a row in
 * the sheet reading "duplicate scenario" — the lowercased function name, which
 * is exactly what shipped when `duplicate_scenario` was added beside
 * `duplicate_path` and only one of the two got a case.
 */
export type WriteFn =
  | 'create_phase'
  | 'create_scenario'
  | 'create_path'
  | 'duplicate_path'
  | 'duplicate_scenario'
  | 'rename_phase'
  | 'rename_scenario'
  | 'update_scenario_layout'
  | 'rename_path'
  | 'rename_owner_tag'
  | 'add_step'
  | 'add_lane'
  | 'upsert_cell'
  | 'update_cell_content'
  | 'update_cell_resources'
  | 'update_placement_resources'
  | 'set_featured_resource'
  | 'restore_featured_resources'
  | 'set_placement_touchpoint'
  | 'remove_placement'
  | 'restore_placement'
  | 'rename_touchpoint'
  | 'update_touchpoint'
  | 'update_touchpoint_placement'
  | 'update_cell_spec'
  | 'update_lane_spec'
  | 'update_phase_spec'
  | 'update_scenario_spec'
  | 'update_service_summary'
  | 'update_business_model'
  | 'update_service_entity_examples'
  | 'update_path_spec'
  | 'update_step_spec'
  | 'create_stakeholder'
  | 'update_stakeholder'
  | 'add_evidence'
  | 'update_evidence'
  | 'delete_evidence'
  | 'set_cell_dependency'
  | 'update_cell_dependency'
  | 'set_cell_featured_image'
  | 'clear_cell_dependency'
  | 'reorder_steps'
  | 'set_path_steps'
  | 'reorder_lanes'
  | 'delete_scenario'
  | 'delete_path'
  | 'remove_step'
  | 'remove_lane'
  | 'delete_cell'
  | 'delete_slice'
  | 'create_slice'
  | 'duplicate_slice'
  | 'update_slice_meta'
  | 'replace_slides'
  | 'update_slide_images'
  | 'create_finding'
  | 'update_finding'

export type ChangeEntry = {
  id: string
  /** The RPC that ran, e.g. `add_step`. */
  fn: WriteFn
  /** Exactly what was sent. Ids, not names — names are resolved at render. */
  args: Record<string, unknown>
  at: number
  /** Present when this change can be individually taken back. */
  revert?: RevertSpec
  /** Set when the canvas agent made this change; absent = human. */
  author?: 'agent'
  /** The agent session the change belongs to (its ✦ row grouping). */
  agentSessionId?: string
}

declare const SESSION_ORIGIN: unique symbol

/**
 * A change entry that came off THIS build's stack — the only thing
 * `executeRevert` accepts.
 *
 * The brand is phantom: `SESSION_ORIGIN` is a declared symbol with no runtime
 * existence, so a `SessionEntry` IS a `ChangeEntry` at run time and nothing is
 * added to the object. What it buys is that the type cannot be satisfied from
 * anywhere else. A row selected out of `public.authoring_changes` has every
 * field in the right place and is still not one, so feeding the durable log
 * to the inverse-applier does not type-check.
 *
 * It exists because the stored rows are not one shape, and because the table
 * has no way to make them one. `record_authoring_change` takes `args` and
 * `revert` as free jsonb — it checks that the operation is named and nothing
 * about what is under it — so the log can hold an `update_cell_content` row
 * whose payload puts `content` where this app has only ever put a nested
 * `update`. Such a row was written by something other than this app, which is
 * the point: the shapes in there are the writers' business, one per caller,
 * and no version column could speak for a caller that stamps none.
 *
 * `revertChange.ts` reads every captured payload through an unchecked cast,
 * and those casts are sound for exactly one reason: their input was built by
 * the build that reads it. Before this type that reason held by habit.
 * Nothing in the code, the schema or the tests would have failed if someone
 * had wired a read of the log into the undo path; it would have compiled, and
 * then thrown on the row above.
 *
 * `recordChange` is the only mint, and `revertBoundaryContract.test.ts` holds
 * it to that — a cast to `SessionEntry` anywhere else in `src/` fails there.
 */
export type SessionEntry = ChangeEntry & { readonly [SESSION_ORIGIN]: true }

/**
 * While set, recorded changes are attributed to the agent. Set only by
 * `attributedTo`, for the span of one tool call. A human save landing
 * during an in-flight agent batch would wear the wrong badge — a cosmetic
 * misattribution, not a data hazard (unlike the old recording-suspend flag
 * this deliberately does not gate), and one person racing their own agent
 * is the corner.
 */
let agentAttribution: { sessionId: string } | null = null

/**
 * Run a piece of work as an agent session's: every change recorded while it
 * runs wears that session's badge. Scoped rather than a set/clear pair, so
 * no caller can leave attribution on after a throw — the one caller is the
 * live tool context, and a tool never touches this by name.
 */
export async function attributedTo<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  agentAttribution = { sessionId }
  try {
    return await work()
  } finally {
    agentAttribution = null
  }
}

/**
 * The agent session a write happening right now would be attributed to, or
 * null when the human is driving.
 *
 * Read by the scoped revert (`revert_my_changes`): it needs to know *whose*
 * entries to take back, and the attribution the dispatcher already set is the
 * one authority on that. The alternative — passing the session id in as a
 * command argument — would let the model name someone else's session.
 */
export function currentAgentSessionId(): string | null {
  return agentAttribution?.sessionId ?? null
}

/** Operations that cannot be taken back once the session is saved. */
const DESTRUCTIVE = new Set([
  'delete_scenario',
  'delete_path',
  'delete_cell',
  'delete_slice',
  'remove_step',
  'remove_lane',
])

let entries: SessionEntry[] = []
let listeners: Array<() => void> = []
let counter = 0

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeToSession(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

/** Stable snapshot — `useSyncExternalStore` compares by identity. */
export function sessionSnapshot(): SessionEntry[] {
  return entries
}

export function recordChange(
  fn: WriteFn,
  args: Record<string, unknown>,
  revert?: RevertSpec,
): void {
  counter += 1
  const entry: ChangeEntry = {
    id: `c${counter}`,
    fn,
    args,
    at: Date.now(),
    revert,
    ...(agentAttribution
      ? { author: 'agent' as const, agentSessionId: agentAttribution.sessionId }
      : {}),
  }
  // The one mint of a `SessionEntry`, and the reason the type is worth
  // having: an entry is branded here, after `recordChange` has assembled it
  // from arguments this build's own mutation modules passed in. Nothing that
  // arrived over the wire can acquire the brand, so nothing that arrived over
  // the wire can reach `executeRevert`.
  entries = [...entries, entry as SessionEntry]
  emit()
  // The durable half. Here and not at the call sites for the same reason the
  // array is filled here: one funnel, so the record and the list cannot
  // disagree about what happened. It never throws — the write it describes
  // has already landed, and failing an author's save because an audit append
  // did not is a worse lie than the missing row.
  appendToAuthoringLog(entry)
}

/** Save: the changes are wanted, so stop tracking them. Writes nothing. */
export function clearSession(): void {
  if (entries.length === 0) return
  entries = []
  emit()
}

export function forgetChange(id: string): void {
  const next = entries.filter((entry) => entry.id !== id)
  if (next.length === entries.length) return
  entries = next
  emit()
}

/** True when saving would put anything permanently out of reach. */
export function sessionHasDestructive(list: readonly ChangeEntry[]): boolean {
  return list.some((entry) => DESTRUCTIVE.has(entry.fn))
}

/*
 * There is deliberately no by-operation "irreversible" predicate. There used
 * to be an empty `Set` of operation names and an `isIrreversible(entry)` over
 * it, whose doc described behaviour the code could not exhibit — the set being
 * empty, it answered false for everything, including the deletes it named.
 *
 * Revertibility is not a property of the operation, it is a property of the
 * ENTRY: the same `upsert_cell` is revertible when its id came back and not
 * when it did not, and `update_cell_content` is revertible only if the caller
 * captured a before-state. So `!entry.revert` — what `revertAll` and the row
 * button already ask — is the whole predicate, and a second, coarser one
 * beside it could only ever disagree with it.
 */

/**
 * One human sentence per change.
 *
 * Named by what was done, never by table — "Added a step" and not
 * `INSERT path_steps`. Where a name was supplied to the RPC it is quoted,
 * because that is the word the person typed and the one they will recognise.
 */
/** Rename args carry `new_name`, not `name` — quote what it became. */
function renameTo(entry: ChangeEntry): string {
  const name =
    typeof entry.args.new_name === 'string' ? entry.args.new_name.trim() : ''
  return name ? ` to “${name}”` : ''
}

/** A quoted `name` argument, or nothing when the call carried none. */
function named(entry: ChangeEntry): string {
  const name = typeof entry.args.name === 'string' ? entry.args.name.trim() : ''
  return name ? ` “${name}”` : ''
}

function titled(entry: ChangeEntry): string {
  return typeof entry.args.title === 'string' ? entry.args.title.trim() : ''
}

/**
 * One sentence per operation, keyed by operation.
 *
 * A `Record<WriteFn, …>` and not a `switch`: the switch's `default` turned a
 * forgotten case into a plausible-looking row ("duplicate scenario") that no
 * reviewer would read as a bug. Here, adding a member to `WriteFn` without
 * adding its sentence does not compile.
 */
const DESCRIBERS: Record<WriteFn, (entry: ChangeEntry) => string> = {
  create_phase: (entry) => `Added phase${named(entry)}`,
  create_scenario: (entry) => `Added scenario${named(entry)}`,
  create_path: (entry) => `Added path${named(entry)}`,
  duplicate_path: (entry) =>
    `Duplicated a path as${named(entry) || ' a copy'}`,
  duplicate_scenario: (entry) =>
    `Duplicated a blueprint as${named(entry) || ' a copy'}`,
  rename_phase: (entry) => `Renamed a phase${renameTo(entry)}`,
  rename_scenario: (entry) => `Renamed a scenario${renameTo(entry)}`,
  update_scenario_layout: (entry) =>
    `Showed a scenario ${entry.args.layout === 'merged' ? 'merged' : 'stacked'}`,
  rename_path: (entry) => `Renamed a path${renameTo(entry)}`,
  rename_owner_tag: (entry) => {
    const from = typeof entry.args.from_name === 'string' ? entry.args.from_name : ''
    const to = typeof entry.args.to_name === 'string' ? entry.args.to_name : ''
    return from && to
      ? `Renamed owner tag “${from}” to “${to}”`
      : 'Renamed an owner tag'
  },
  add_step: (entry) => (named(entry) ? `Added step${named(entry)}` : 'Added a step'),
  add_lane: (entry) => `Added lane${named(entry)}`,
  // Reads the derived inverse, because that is where the write's own account
  // of which half it took survives into the entry. `deriveRevert` branches on
  // the report — `delete_cell` for the insert, `restore_cell_content` for the
  // update — so the sentence can branch on the same fact instead of on the
  // operation's name, which is what said "Added a cell" over an edit.
  //
  // No inverse means the update half whose before-state did not come back;
  // an insert always has one. So the absence reads as an edit, not a create.
  upsert_cell: (entry) =>
    entry.revert?.fn === 'delete_cell' ? 'Added a cell' : 'Edited a cell’s text',
  update_cell_content: () => 'Edited a cell’s text',
  update_cell_resources: () => 'Edited a cell’s resources',
  update_placement_resources: () => 'Edited a touchpoint’s resources at this cell',
  set_featured_resource: (entry) =>
    entry.args.featured === false
      ? 'Unfeatured a resource'
      : 'Featured a resource',
  restore_featured_resources: () => 'Put back which resources were featured',
  set_placement_touchpoint: (entry) =>
    typeof entry.args.touchpoint_name === 'string' && entry.args.touchpoint_name
      ? `Linked “${String(entry.args.name ?? '')}” to the registry as “${entry.args.touchpoint_name}”`
      : `Named a placement “${String(entry.args.name ?? '')}”`,
  remove_placement: (entry) => `Removed “${String(entry.args.name ?? '')}” from a cell`,
  restore_placement: () => 'Put a placement back on its cell',
  rename_touchpoint: (entry) => {
    // Named by how far it reached, because that is the whole point of the
    // registry: one edit moves every touchpoint that says the word, and the
    // row is where a person finds out how many that was.
    const cells = Array.isArray(entry.args.cell_ids) ? entry.args.cell_ids.length : 0
    const to = renameTo(entry)
    if (cells === 0) return `Renamed a touchpoint${to}`
    return `Renamed a touchpoint${to} (${cells} ${cells === 1 ? 'cell' : 'cells'})`
  },
  // Named by the entry, and by how far the name reached when it moved: the
  // same edit that changes a summary can rename the tool on every board, and
  // the row is where a person finds out which of the two it was.
  update_touchpoint: (entry) => {
    const name = typeof entry.args.name === 'string' ? entry.args.name.trim() : ''
    const before =
      typeof entry.args.previous_name === 'string' ? entry.args.previous_name.trim() : ''
    if (!name) return 'Edited a touchpoint'
    if (!before || before === name) return `Edited touchpoint “${name}”`
    const cells = Array.isArray(entry.args.cell_ids) ? entry.args.cell_ids.length : 0
    const reach = cells === 0 ? '' : ` (${cells} ${cells === 1 ? 'cell' : 'cells'})`
    return `Edited touchpoint “${before}”, renamed to “${name}”${reach}`
  },
  // Named by the touchpoint, because a cell can hold several and "edited a
  // touchpoint" beside a run of them tells nobody which. The words belong to
  // this touchpoint AT THIS CELL — the same tool at the next step keeps its
  // own.
  update_touchpoint_placement: (entry) =>
    typeof entry.args.name === 'string' && entry.args.name
      ? `Edited “${entry.args.name}” at this cell`
      : 'Edited a touchpoint at this cell',
  update_cell_spec: () => 'Specified function & form',
  update_lane_spec: () => 'Edited a lane’s actor, owner, KPIs & tools',
  update_phase_spec: () => 'Edited a phase’s summary, impact & requirements',
  update_scenario_spec: () => 'Edited a scenario’s summary',
  update_service_summary: () => 'Edited the service’s summary',
  update_business_model: () => 'Edited the business model',
  update_service_entity_examples: () => 'Edited the entity examples',
  update_path_spec: () => 'Edited a path’s summary & note',
  update_step_spec: () => 'Edited a step’s summary',
  create_stakeholder: (entry) => `Added stakeholder${named(entry)}`,
  update_stakeholder: (entry) => `Edited stakeholder${named(entry)}`,
  add_evidence: (entry) =>
    titled(entry) ? `Added evidence “${titled(entry)}”` : 'Added an evidence source',
  update_evidence: (entry) =>
    titled(entry)
      ? `Edited evidence “${titled(entry)}”`
      : 'Edited an evidence source',
  delete_evidence: (entry) =>
    titled(entry)
      ? `Removed evidence “${titled(entry)}”`
      : 'Removed an evidence source',
  // Upserts, so it lands on either side of the line the next one describes,
  // and it says which through its inverse: `clear_cell_dependency` undoes an
  // insert, `restore_cell_dependency` puts a row's words back. An update whose
  // before-state did not come back records no inverse, and that is still an
  // edit rather than a connection.
  set_cell_dependency: (entry) =>
    entry.revert?.fn === 'clear_cell_dependency'
      ? 'Connected two cells'
      : 'Edited a connection',
  update_cell_dependency: () => 'Edited a connection',
  set_cell_featured_image: (entry) =>
    entry.args.image_url ? 'Set a cell’s featured image' : 'Cleared a cell’s featured image',
  clear_cell_dependency: () => 'Removed a connection',
  reorder_steps: () => 'Reordered the steps',
  set_path_steps: () => 'Reordered the steps',
  reorder_lanes: () => 'Reordered the lanes',
  delete_scenario: () => 'Deleted a scenario',
  delete_path: () => 'Deleted a path',
  remove_step: () => 'Deleted a step',
  remove_lane: () => 'Deleted a lane',
  delete_cell: () => 'Deleted a cell',
  delete_slice: (entry) =>
    titled(entry) ? `Deleted slice “${titled(entry)}”` : 'Deleted a slice',
  create_slice: (entry) =>
    titled(entry) ? `Added slice “${titled(entry)}”` : 'Added a slice',
  duplicate_slice: (entry) =>
    titled(entry)
      ? `Duplicated a slice as “${titled(entry)}”`
      : 'Duplicated a slice',
  update_slice_meta: (entry) =>
    titled(entry) ? `Edited slice “${titled(entry)}”` : 'Edited a slice',
  // Named by the count, because "replaced the slides" is the one summary
  // here that hides its own size: this write deletes every slide the slice
  // had, and going from twelve to one is the case the row exists to surface.
  replace_slides: (entry) => {
    const count =
      typeof entry.args.slide_count === 'number' ? entry.args.slide_count : null
    return count === null
      ? 'Rebuilt a slice’s slides'
      : `Rebuilt a slice’s slides (${count} now)`
  },
  // A slide's images are a set. The summary names the count, or that the
  // slide is back to showing every cited cell's frames.
  update_slide_images: (entry) => {
    if (entry.args.shows_all_images === true) {
      return 'A slide now shows every cited cell’s frames'
    }
    const count =
      typeof entry.args.member_count === 'number' ? entry.args.member_count : null
    if (count === 0) return 'A slide now shows no images'
    if (count === null) return 'Edited a slide’s images'
    return `A slide now shows ${count} image${count === 1 ? '' : 's'}`
  },
  // Named by the check rather than by the finding, because that is the word
  // the reader recognises: a finding's id says nothing, and its summary is a
  // whole sentence of its own competing with this one.
  create_finding: (entry) => {
    const severity =
      typeof entry.args.severity === 'string' ? `${entry.args.severity} ` : ''
    const check =
      typeof entry.args.check_key === 'string' ? ` for “${entry.args.check_key}”` : ''
    return `Recorded a ${severity}finding${check}`
  },
  update_finding: (entry) => {
    const check =
      typeof entry.args.check_key === 'string' ? ` for “${entry.args.check_key}”` : ''
    // A status flip is triage and reads as triage; anything else is the audit
    // run rewriting a finding in place, which is a different act.
    return typeof entry.args.status === 'string'
      ? `Marked a finding${check} ${entry.args.status}`
      : `Edited a finding${check}`
  },
}

export function describeChange(entry: ChangeEntry): string {
  const describe: ((entry: ChangeEntry) => string) | undefined =
    DESCRIBERS[entry.fn]
  // Unreachable through the type, kept for the untyped edges (a persisted
  // ledger, a hand-built entry in a test). Silence would be worse: an
  // untracked change is the one case the sheet exists to prevent.
  return describe ? describe(entry) : String(entry.fn).replace(/_/g, ' ')
}

/**
 * Group changes by the path they touched, falling back to a bucket for the
 * ones that name no path.
 *
 * A session can span blueprints, so a flat list puts two "Added a cell" rows
 * next to each other with nothing to tell them apart — the same defect as an
 * arrow picker offering three identical rows.
 */
export function groupChanges<Entry extends ChangeEntry>(
  list: readonly Entry[],
): Array<{ pathId: string | null; entries: Entry[] }> {
  // Generic in the entry rather than fixed to `ChangeEntry`: the sheet groups
  // the session's own rows and then offers a revert on each, so a signature
  // that widened them on the way through would strip the brand exactly where
  // it is needed and force the caller to cast it back on.
  const groups: Array<{ pathId: string | null; entries: Entry[] }> = []
  for (const entry of list) {
    // The order is narrowest-first: a call that names a path belongs with that
    // path, and only a call that names none falls back to its scenario.
    // `source_scenario_id` is `duplicate_scenario`'s — without it the row
    // landed in the no-path bucket, away from the blueprint it copied.
    const raw =
      entry.args.path_id ??
      entry.args.source_path_id ??
      entry.args.scenario_id ??
      entry.args.source_scenario_id
    const pathId = typeof raw === 'string' ? raw : null
    const existing = groups.find((group) => group.pathId === pathId)
    if (existing) existing.entries.push(entry)
    else groups.push({ pathId, entries: [entry] })
  }
  return groups
}
