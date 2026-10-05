import { hostOf } from '@/lib/cellResources'
import { validateResourceUrl } from '@/lib/resourceUrl'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

/**
 * A cell's resources as the panel's form holds them between opening and Save.
 *
 * Everything a cell points at is one list to the reader and several to the
 * database: the cell's own rows, written by `sync_cell_resources`, and each
 * placement's, written by `sync_placement_resources`, with a link's
 * `featured` flag and the cell's frame — its featured image — as two more
 * writes beside them. This module is the draft over all of it, and nothing
 * here touches the network: it says what changed, in the shape each write
 * takes, and in the order the panel's Save sends it.
 */

/** Who a resource belongs to: the cell itself (null), or a placement by its id. */
export type ResourceOwnerId = string | null

/** An owner as the list heads its group. */
export type ResourceOwner = { id: ResourceOwnerId; name: string }

/** One row of the draft. `key` survives every edit; `id` is the database's, null until written. */
export type DraftResource = {
  key: string
  id: string | null
  owner: ResourceOwnerId
  kind: 'link' | 'attachment'
  name: string
  url: string
  featured: boolean
  /**
   * The owner a re-tagged row came from, so Save can write that owner's list
   * — the removal — before this one, the add. Absent on every other row.
   */
  movedFrom?: ResourceOwnerId
}

/** The draft: every row in group order, and the cell's featured image. */
export type ResourceDrafts = {
  rows: readonly DraftResource[]
  frame: string | null
}

/** The rows a sync takes — what the write stores, and what a comparison compares. */
export type ResourceSyncRow = { id: string | null; kind: string; name: string; url: string }

/** The heading over the cell's own rows. */
export const THIS_CELL = 'This cell'

/**
 * A list as its sync will store it: the url checked (a link's) or trimmed (a
 * file's, which the bucket minted), and a nameless row named by its host.
 *
 * The one normalisation, shared by both list writes and by the comparison
 * that decides whether a list is written at all — so a list Save would find
 * identical is never offered as a change, and never logged as one.
 */
export function rowsForSync(
  drafts: readonly { id?: string | null; kind?: string; name: string; url: string }[],
): ResourceSyncRow[] {
  return drafts.map((draft) => {
    const kind = draft.kind === 'attachment' ? 'attachment' : 'link'
    const checked =
      kind === 'attachment'
        ? { ok: true as const, url: draft.url.trim() }
        : validateResourceUrl(draft.url)
    if (!checked.ok) throw new Error(checked.problem)
    return {
      id: draft.id ?? null,
      kind,
      name: draft.name.trim() || hostOf(checked.url),
      url: checked.url,
    }
  })
}

/** The draft as it stands when the panel opens: every row with a url, and the frame. */
export function draftsFromResources(
  resources: readonly CellResource[],
  frame: string | null,
): ResourceDrafts {
  return {
    rows: resources.flatMap((resource, index) => {
      const url = resource.url?.trim()
      if (!url) return []
      return [
        {
          key: resource.id ?? `stored:${index}`,
          id: resource.id,
          owner: resource.placementId,
          kind: resource.kind === 'attachment' ? 'attachment' : 'link',
          name: resource.name,
          url,
          featured: resource.featured,
        } satisfies DraftResource,
      ]
    }),
    frame: frame?.trim() || null,
  }
}

/** The draft's rows back in the board's shape — what a list write captures as its inverse. */
export function resourcesFromDrafts(drafts: ResourceDrafts): CellResource[] {
  return drafts.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    url: row.url,
    placementId: row.owner,
    featured: row.featured,
  }))
}

/**
 * The groups, in reading order: This cell, then each placement at the cell
 * that has a row behind it. A row whose placement the cell no longer lists
 * still gets a group, so nothing it holds goes missing from the screen.
 */
export function resourceOwners(
  touchpoints: readonly CellTouchpoint[],
  rows: readonly DraftResource[] = [],
): ResourceOwner[] {
  const owners: ResourceOwner[] = [{ id: null, name: THIS_CELL }]
  const seen = new Set<string>()
  for (const touchpoint of touchpoints) {
    if (!touchpoint.id || seen.has(touchpoint.id)) continue
    seen.add(touchpoint.id)
    owners.push({ id: touchpoint.id, name: touchpoint.name })
  }
  for (const row of rows) {
    if (row.owner === null || seen.has(row.owner)) continue
    seen.add(row.owner)
    owners.push({ id: row.owner, name: 'A touchpoint' })
  }
  return owners
}

/** One owner's rows, in order. */
export function groupRows(
  rows: readonly DraftResource[],
  owner: ResourceOwnerId,
): DraftResource[] {
  return rows.filter((row) => row.owner === owner)
}

// ---------------------------------------------------------------------------
// Edits. Each takes the draft and returns the next one; none of them writes.
// ---------------------------------------------------------------------------

/** A new row at the end of its owner's group. */
export function addResource(
  drafts: ResourceDrafts,
  row: Omit<DraftResource, 'id' | 'featured'>,
): ResourceDrafts {
  return { ...drafts, rows: [...drafts.rows, { ...row, id: null, featured: false }] }
}

export function removeResource(drafts: ResourceDrafts, key: string): ResourceDrafts {
  return { ...drafts, rows: drafts.rows.filter((row) => row.key !== key) }
}

export function renameResource(
  drafts: ResourceDrafts,
  key: string,
  name: string,
): ResourceDrafts {
  return {
    ...drafts,
    rows: drafts.rows.map((row) => (row.key === key ? { ...row, name } : row)),
  }
}

/** One place up (-1) or down (1) within the row's own group; the edge is a no-op. */
export function moveResource(
  drafts: ResourceDrafts,
  key: string,
  by: -1 | 1,
): ResourceDrafts {
  const row = drafts.rows.find((entry) => entry.key === key)
  if (!row) return drafts
  const group = groupRows(drafts.rows, row.owner)
  const index = group.findIndex((entry) => entry.key === key)
  const target = index + by
  if (target < 0 || target >= group.length) return drafts
  const order = group.map((entry) => entry.key)
  order.splice(index, 1)
  order.splice(target, 0, key)
  return reorderGroup(drafts, row.owner, order)
}

/**
 * One group in a new order, the others where they were. Keys the group does
 * not hold are ignored, and a row the order leaves out keeps its place at the
 * end, so a drag that raced an edit cannot drop a row.
 */
export function reorderGroup(
  drafts: ResourceDrafts,
  owner: ResourceOwnerId,
  keys: readonly string[],
): ResourceDrafts {
  const group = groupRows(drafts.rows, owner)
  const byKey = new Map(group.map((row) => [row.key, row]))
  const ordered = keys.flatMap((key) => {
    const row = byKey.get(key)
    if (!row) return []
    byKey.delete(key)
    return [row]
  })
  const next = [...ordered, ...byKey.values()]
  let cursor = 0
  return {
    ...drafts,
    rows: drafts.rows.map((row) => (row.owner === owner ? next[cursor++]! : row)),
  }
}

/**
 * Give a row to another owner.
 *
 * Two lists, two writes: a removal from the one and an add to the other. So
 * the row leaves under a new key with no id — the database will mint one —
 * and its featured flag resets, because the flag belonged to the old row.
 */
export function retagResource(
  drafts: ResourceDrafts,
  key: string,
  owner: ResourceOwnerId,
  newKey: string,
): ResourceDrafts {
  const row = drafts.rows.find((entry) => entry.key === key)
  if (!row || row.owner === owner) return drafts
  const moved = addResource(removeResource(drafts, key), {
    key: newKey,
    owner,
    kind: row.kind,
    name: row.name,
    url: row.url,
  })
  return {
    ...moved,
    rows: moved.rows.map((entry) =>
      entry.key === newKey ? { ...entry, movedFrom: row.owner } : entry,
    ),
  }
}

export function featureResource(
  drafts: ResourceDrafts,
  key: string,
  featured: boolean,
): ResourceDrafts {
  return {
    ...drafts,
    rows: drafts.rows.map((row) => (row.key === key ? { ...row, featured } : row)),
  }
}

export function setFeaturedImage(drafts: ResourceDrafts, url: string): ResourceDrafts {
  return { ...drafts, frame: url.trim() || null }
}

// ---------------------------------------------------------------------------
// What Save would write.
// ---------------------------------------------------------------------------

/** What a list compares as: its sync rows, or null when one of them would not save. */
function comparable(rows: readonly DraftResource[]): string | null {
  try {
    return JSON.stringify(rowsForSync(rows))
  } catch {
    return null
  }
}

/**
 * Whether a list differs from what it was. Under `rowsForSync` when both
 * sides pass it; as typed when neither does — a stored link the validator
 * refuses is still the same link if nobody touched it, and calling it a
 * change would open the panel on an unsaved edit nobody made.
 */
function listChanged(before: readonly DraftResource[], after: readonly DraftResource[]): boolean {
  const was = comparable(before)
  const now = comparable(after)
  if (was === null && now === null) {
    const raw = (rows: readonly DraftResource[]) =>
      JSON.stringify(
        rows.map((row) => [row.id, row.kind, row.name.trim(), row.url.trim()]),
      )
    return raw(before) !== raw(after)
  }
  return was === null || now === null || was !== now
}

/**
 * The lists in the order Save writes them: the cell's, then each
 * placement's — except that a list a re-tagged row LEFT is written before
 * the list it joined. A failure between the two then leaves the row missing
 * from the board, which the kept draft puts right on retry, rather than on
 * it twice. Two lists that trade rows both ways keep the default order.
 */
function sourcesFirst(
  lists: { owner: ResourceOwnerId; rows: DraftResource[] }[],
): { owner: ResourceOwnerId; rows: DraftResource[] }[] {
  const remaining = [...lists]
  const ordered: typeof lists = []
  while (remaining.length > 0) {
    const ready = remaining.findIndex((list) =>
      list.rows.every(
        (row) =>
          row.id !== null ||
          row.movedFrom === undefined ||
          row.movedFrom === list.owner ||
          !remaining.some((other) => other !== list && other.owner === row.movedFrom),
      ),
    )
    ordered.push(...remaining.splice(ready < 0 ? 0 : ready, 1))
  }
  return ordered
}

/**
 * Refuse a plan before anything is written: a list that would not pass
 * `rowsForSync` would throw only when its own write comes round, after the
 * cell and every list before it had already been written.
 */
export function assertPlanWritable(plan: ResourceSavePlan): void {
  for (const list of plan.lists) rowsForSync(list.rows)
}

/**
 * The writes Save sends, in the order it sends them.
 *
 * - **Lists**, the cell's first and then each placement's in group order —
 *   a re-tag's source before its target — and only the ones that differ from
 *   the baseline under `rowsForSync`, the normalisation the write itself
 *   applies.
 * - **Featured flags**, one per link whose flag moved. A row with no id yet
 *   is new, and the database starts it unfeatured.
 * - **The featured image**, last, when the frame moved.
 *
 * `survives` answers for a placement whether the cell's text still names it.
 * A save that takes a touchpoint's name out of the text deletes its
 * placement, so its list and flags would be written onto nothing; they are
 * left out here rather than left to fail, the same rule the placement's own
 * fields follow.
 */
export type ResourceSavePlan = {
  lists: { owner: ResourceOwnerId; rows: DraftResource[] }[]
  featured: { key: string; featured: boolean }[]
  frame: { url: string | null } | null
}

export function planResourceSave(
  baseline: ResourceDrafts,
  drafts: ResourceDrafts,
  survives: (owner: string) => boolean = () => true,
): ResourceSavePlan {
  const owners: ResourceOwnerId[] = [null]
  for (const row of [...baseline.rows, ...drafts.rows]) {
    if (row.owner !== null && !owners.includes(row.owner)) owners.push(row.owner)
  }
  const kept = (owner: ResourceOwnerId) => owner === null || survives(owner)

  const lists = sourcesFirst(
    owners.flatMap((owner) => {
      if (!kept(owner)) return []
      const after = groupRows(drafts.rows, owner)
      return listChanged(groupRows(baseline.rows, owner), after) ? [{ owner, rows: after }] : []
    }),
  )

  const stored = new Map(
    baseline.rows.flatMap((row) => (row.id ? [[`${row.owner}:${row.id}`, row.featured]] : [])),
  )
  const featured = drafts.rows.flatMap((row) => {
    if (row.kind !== 'link' || !kept(row.owner)) return []
    const before = row.id ? (stored.get(`${row.owner}:${row.id}`) ?? false) : false
    return row.featured === before ? [] : [{ key: row.key, featured: row.featured }]
  })

  const frame = drafts.frame === baseline.frame ? null : { url: drafts.frame }

  return { lists, featured, frame }
}

/**
 * How many changes the panel's count shows for the resources: one per write
 * Save would send — a changed list, a moved flag, a moved featured image. A
 * re-tag is two, because it is two lists.
 */
export function resourceChangeCount(plan: ResourceSavePlan): number {
  return plan.lists.length + plan.featured.length + (plan.frame ? 1 : 0)
}

/**
 * The rows that differ from the baseline, by key, for the list to mark: new
 * or re-tagged, renamed, moved within their group, featured or unfeatured, or
 * the picture the featured image is about to become.
 */
export function unsavedResourceKeys(
  baseline: ResourceDrafts,
  drafts: ResourceDrafts,
): Set<string> {
  const before = new Map(baseline.rows.map((row) => [row.key, row]))
  const indexIn = (rows: readonly DraftResource[], row: DraftResource) =>
    groupRows(rows, row.owner).findIndex((entry) => entry.key === row.key)
  const keys = new Set<string>()
  for (const row of drafts.rows) {
    const stored = before.get(row.key)
    if (
      !stored ||
      stored.owner !== row.owner ||
      stored.name.trim() !== row.name.trim() ||
      stored.featured !== row.featured ||
      indexIn(baseline.rows, stored) !== indexIn(drafts.rows, row) ||
      (drafts.frame !== baseline.frame && row.url === drafts.frame)
    ) {
      keys.add(row.key)
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// Settling: what a write that landed does to the baseline, so a retry after a
// later write failed sends only what is left.
// ---------------------------------------------------------------------------

/** Both halves of the draft: where it started, and where it is. */
export type ResourceDraftState = { baseline: ResourceDrafts; drafts: ResourceDrafts }

/**
 * A list write landed. Its rows become the baseline's for that owner, and
 * each row the write created takes the id the database gave it — read back
 * in list order, which is the order the sync stored positions in — so a later
 * write names the row it means instead of inserting it a second time.
 *
 * `ids` is null when the read-back did not answer. The list is settled all
 * the same, because it WAS written: sending it again would insert its new
 * rows twice.
 */
export function settleList(
  state: ResourceDraftState,
  owner: ResourceOwnerId,
  ids: readonly string[] | null,
): ResourceDraftState {
  const group = groupRows(state.drafts.rows, owner)
  const usable = ids && ids.length === group.length ? ids : null
  const idFor = new Map(group.map((row, index) => [row.key, usable?.[index] ?? row.id]))
  const storedFeatured = new Map(
    groupRows(state.baseline.rows, owner).flatMap((row) =>
      row.id ? [[row.id, row.featured]] : [],
    ),
  )
  const drafts: ResourceDrafts = {
    ...state.drafts,
    rows: state.drafts.rows.map((row) =>
      row.owner === owner ? { ...row, id: idFor.get(row.key) ?? null } : row,
    ),
  }
  const written = groupRows(drafts.rows, owner).map((row) => ({
    ...row,
    // The sync never writes `featured`: a kept row keeps the flag it had,
    // and a row it inserted starts without one.
    featured: row.id ? (storedFeatured.get(row.id) ?? false) : false,
  }))
  // The baseline's other groups stay where they were; this one is replaced.
  const others = state.baseline.rows.filter((row) => row.owner !== owner)
  return { baseline: { ...state.baseline, rows: [...others, ...written] }, drafts }
}

/**
 * Ids read back later for a list that already landed — the first read did
 * not answer. Paired by the order the list was WRITTEN in, which is the
 * baseline's for that owner, and carried to the draft's rows by key, so a
 * reorder made since does not mismatch them.
 */
export function adoptIds(
  state: ResourceDraftState,
  owner: ResourceOwnerId,
  ids: readonly string[],
): ResourceDraftState {
  const written = groupRows(state.baseline.rows, owner)
  if (ids.length !== written.length) return state
  const idFor = new Map(written.map((row, index) => [row.key, row.id ?? ids[index]!]))
  const adopt = (rows: readonly DraftResource[]) =>
    rows.map((row) => (row.owner === owner && idFor.has(row.key) ? { ...row, id: idFor.get(row.key)! } : row))
  return {
    baseline: { ...state.baseline, rows: adopt(state.baseline.rows) },
    drafts: { ...state.drafts, rows: adopt(state.drafts.rows) },
  }
}

/** A flag write landed: the baseline's row now carries it. */
export function settleFeatured(
  state: ResourceDraftState,
  key: string,
  featured: boolean,
): ResourceDraftState {
  return {
    ...state,
    baseline: {
      ...state.baseline,
      rows: state.baseline.rows.map((row) => (row.key === key ? { ...row, featured } : row)),
    },
  }
}

/** The frame write landed. */
export function settleFrame(state: ResourceDraftState, url: string | null): ResourceDraftState {
  return { ...state, baseline: { ...state.baseline, frame: url } }
}
