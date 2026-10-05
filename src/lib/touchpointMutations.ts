/**
 * Writing a touchpoint — the registry entry, and one placement of it.
 *
 * Two writes with one subject and two scopes. `renameTouchpoint` changes what
 * the tool is CALLED, everywhere it is used at once, because the registry owns
 * the name. `updateTouchpointPlacement` changes what an author has to say
 * about it AT ONE CELL — its summary, and whether the moment happens through
 * it — because the placement owns those, and the same tool at the next step
 * keeps its own.
 *
 * That split is the whole of the registry's write story stated as two
 * functions, and it is why they share a module: a reader who finds one has to
 * meet the other, or the next rename will be attempted a cell at a time.
 *
 * ── The placement write UPDATES. It never creates one, and that is a gate ──
 *
 * A placement exists because a cell's text names a touchpoint. `content` is
 * the list, `sync_cell_touchpoints` turns it into rows, and that function
 * holds the one rule that matters: only a touchpoint-BEARING cell gets
 * placements, because `cells.content` on an actor lane is a sentence about
 * what somebody did and filing it in the registry would make a tool out of it.
 *
 * So the placement write goes by placement id and touches only the two detail
 * columns. It cannot insert, so it cannot place a touchpoint on a cell that is
 * not touchpoint-bearing; and `cell_id` and `touchpoint_id` are outside the
 * `authenticated` column grant — three migrations make that grant and they are
 * the whole of it, so the absence is complete rather than a gap some other
 * grant could widen — so it cannot move an existing placement onto one either.
 * The gate is not re-implemented here — it is routed around by nothing, which
 * is a stronger property than a second copy of the check.
 *
 * ── The placement inverse is identity-keyed and writes columns, not a form ─
 *
 * `previous` is captured as COLUMN values — nulls where the row was empty —
 * rather than as the strings the form held, and the revert writes them back
 * verbatim without re-validating. The resource writes learned this first: a
 * revert that rebuilds through the input validator can refuse to restore a
 * link the validator considers malformed, which means an author cannot undo
 * their way back to data that was already there. Imported placements carry
 * prose this module did not choose.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { recordChange } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import { requireRowsWritten } from '@/lib/optimisticConcurrency'
import { parseCellContentItems } from '@/lib/parseCellContent'
import type { TouchpointRoleValue } from '@/lib/touchpointRole'
import type { Database } from '@/types/database'
import { invalidateCellBoard, invalidateQueries } from '@/lib/queryClient'
import { queryKeys } from '@/lib/queryKeys'

type Client = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// The registry: what the tool is called, everywhere at once.
// ---------------------------------------------------------------------------

/** What `rename_touchpoint` hands back. */
export type TouchpointRename = {
  /** The registry row that was renamed. */
  touchpointId: string
  /** What it is called now. */
  name: string
  /** What it was called — the value an inverse needs. */
  previousName: string
  /** The cells whose text the rename rewrote. */
  cellIds: string[]
}

/**
 * Rename a touchpoint everywhere it is.
 *
 * One RPC, because a rename has two halves and they have to move together.
 * The registry row is what the board draws, so changing it alone moves every
 * touchpoint on screen at once — and `cells.content` still holds the OLD
 * string, which a content save re-derives placements from. Leave the text
 * behind and the next edit to any affected cell hands `sync_cell_touchpoints`
 * the stale name, the renamed placement is removed with its summary and its
 * resources, and a fresh registry entry appears under the old name in its
 * place. The rename undoes itself and the authored writing is gone.
 *
 * A client loop could not fix that: PostgREST gives every statement its own
 * transaction, so a failure part-way would leave the registry and the text
 * disagreeing, which is the state this exists to end. The function does the
 * registry row and every bearing cell in one go, matching whole items in the
 * delimited text — renaming `Zoom` leaves `Zoom Recording` alone — and refuses
 * to finish if any bearing cell still names the old value.
 *
 * Which cells it rewrites is decided from the PLACEMENTS, not from a text
 * search, so a cell that happens to spell the same word for another reason is
 * untouched.
 */
export async function renameTouchpoint(
  client: Client,
  touchpointId: string,
  name: string,
  /**
   * Session-log participation, decided per call rather than by ambient module
   * state — the same reasoning as `updateCellContent`. A revert passes
   * `record: false` so taking a rename back never logs a new rename.
   */
  options: { record?: boolean } = {},
): Promise<TouchpointRename> {
  const wanted = name.trim()
  if (!wanted) {
    throw new Error('A touchpoint needs a name — an empty one is a blank cell face.')
  }

  const { data, error } = await client.rpc('rename_touchpoint', {
    p_touchpoint_id: touchpointId,
    p_name: wanted,
  })
  if (error) throw toAuthoringError(error)

  const result = readRename(data)

  // The registry's name is drawn on every placement of it, and read by the pickers.
  invalidateCellBoard(null)
  invalidateQueries(queryKeys.registryTouchpoints.prefix)
  invalidateQueries(queryKeys.touchpointRegistryTones)
  if (options.record !== false) {
    recordChange(
      'rename_touchpoint',
      {
        touchpoint_id: touchpointId,
        new_name: result.name,
        // The cells the rename actually rewrote, so the sheet can say how far
        // a one-word edit reached.
        cell_ids: result.cellIds,
      },
      // The inverse is the same operation pointed the other way, keyed on the
      // touchpoint's id rather than on either name. That is what makes it
      // restore BOTH halves: running it puts the registry row back and
      // rewrites the same cells' text back, in one transaction, exactly as the
      // forward call did. A text-keyed inverse would also rewrite cells that
      // adopted the new name in between.
      {
        fn: 'rename_touchpoint',
        args: { p_touchpoint_id: touchpointId, p_name: result.previousName },
      },
    )
  }

  return result
}

/**
 * Read the rename's answer, or refuse it.
 *
 * A zero-row write is a failure, not a no-op — the house rule the content
 * writes already follow through `requireRowsWritten`. The function raises when
 * the touchpoint is gone, so nothing here is the ordinary path; what this
 * catches is a response that came back shaped like a success while naming
 * nothing, which would let the caller record an inverse for a rename that
 * never happened.
 */
function readRename(data: unknown): TouchpointRename {
  const row = data as {
    touchpoint_id?: unknown
    name?: unknown
    previous_name?: unknown
    cell_ids?: unknown
  } | null

  if (
    !row ||
    typeof row.touchpoint_id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.previous_name !== 'string'
  ) {
    throw new Error('That touchpoint no longer exists — nothing was renamed.')
  }

  return {
    touchpointId: row.touchpoint_id,
    name: row.name,
    previousName: row.previous_name,
    cellIds: Array.isArray(row.cell_ids) ? (row.cell_ids as string[]) : [],
  }
}

// ---------------------------------------------------------------------------
// The placement: what an author has to say about it at one cell.
// ---------------------------------------------------------------------------

/** What the placement editor holds while it is being typed into. */
export type PlacementDetailDraft = {
  /** This touchpoint's own words about this moment. */
  summary: string
  role: TouchpointRoleValue
}

/**
 * The two columns as the table holds them.
 *
 * Empty is `null`, never `''`: the read path already treats null as "not
 * specified", and two spellings of empty is how a field ends up rendering an
 * empty frame instead of nothing at all.
 *
 * Two, and only two. What a placement POINTS AT is a resource carrying the
 * placement's id, edited from the placement's own list — never a column here.
 */
export type PlacementDetailColumns = {
  summary: string | null
  role: TouchpointRoleValue
}

export type PlacementNormalizeResult =
  | { ok: true; columns: PlacementDetailColumns }
  | { ok: false; problem: string }

/**
 * The draft as columns, or the one sentence explaining why it cannot be.
 *
 * Pure, so the rules are testable without a database — which matters most for
 * the two that are easy to get subtly wrong: that an emptied field clears the
 * column rather than storing a blank, and that an unmarked role stays unmarked
 * instead of being defaulted into a judgement.
 */
export function normalizePlacementDetail(
  draft: PlacementDetailDraft,
): PlacementNormalizeResult {
  if (
    draft.role !== null &&
    draft.role !== 'core' &&
    draft.role !== 'peripheral'
  ) {
    return {
      ok: false,
      problem: 'A placement is core, peripheral, or unmarked — nothing else.',
    }
  }

  return {
    ok: true,
    columns: {
      summary: draft.summary.trim() || null,
      role: draft.role,
    },
  }
}

/**
 * Which of the placement's columns a Save would change, comparing the two
 * drafts as the write would store them.
 *
 * Through `normalizePlacementDetail` and not a raw `!==`, because the write
 * trims: a summary that differs only by surrounding whitespace writes the
 * same row, and treating it as an edit would offer a Save that logs a change
 * with nothing in it to take back. One equality rule for the editor's count
 * and its write gate, and it is the write's own.
 *
 * A draft the normaliser refuses is compared as it stands, so an invalid
 * value still reads as changed and reaches the write that explains it.
 */
export function changedPlacementFields(
  after: PlacementDetailDraft,
  before: PlacementDetailDraft,
): Array<keyof PlacementDetailColumns> {
  const stored = (draft: PlacementDetailDraft): PlacementDetailColumns => {
    const normalized = normalizePlacementDetail(draft)
    return normalized.ok ? normalized.columns : draft
  }
  const next = stored(after)
  const previous = stored(before)
  return (['summary', 'role'] as const).filter((key) => next[key] !== previous[key])
}

/**
 * True when the cell text being saved still names this touchpoint.
 *
 * The panel saves the cell's text and this placement's detail in one action,
 * and the text is the list of placements: dropping a name from it makes
 * `sync_cell_touchpoints` remove that placement, detail and all. Writing the
 * detail afterwards would then fail on zero rows — correctly, but with a
 * message about a placement that no longer exists, on a save that did exactly
 * what the author asked. So the caller asks first and skips the write.
 *
 * Not a re-implementation of the sync's diff: it answers one question about
 * one name, using the same parser the sync is handed its names from.
 */
export function placementSurvivesContent(
  content: string,
  name: string,
): boolean {
  return parseCellContentItems(content).includes(name.trim())
}

/**
 * Write one placement's detail.
 *
 * `.select('id')` and `requireRowsWritten`, not `error === null`: a
 * matched-nothing update is a 200 with an empty array, so without the row
 * check editing a placement whose touchpoint was removed elsewhere would
 * report success having written nothing.
 */
export async function updateTouchpointPlacement(
  client: Client,
  placement: { id: string; cellId?: string; name?: string },
  draft: PlacementDetailDraft,
  /** The columns being replaced — captured so the change can be reverted. */
  previous?: PlacementDetailColumns,
  /**
   * Session-log participation, decided per call rather than by ambient module
   * state, for the reason `cellContentMutations` states: a global suspend flag
   * around an `await` also swallows an ordinary save that happens to resolve
   * while a revert is in flight.
   */
  options: { record?: boolean } = {},
): Promise<void> {
  const normalized = normalizePlacementDetail(draft)
  if (!normalized.ok) throw new Error(normalized.problem)

  await writePlacementDetail(client, placement.id, normalized.columns)

  invalidateCellBoard(placement.cellId)
  if (options.record === false) return
  recordChange(
    'update_touchpoint_placement',
    {
      placement_id: placement.id,
      ...(placement.cellId ? { cell_id: placement.cellId } : {}),
      ...(placement.name ? { name: placement.name } : {}),
    },
    previous
      ? {
          fn: 'restore_touchpoint_placement',
          args: { placement_id: placement.id, columns: previous },
        }
      : undefined,
  )
}

/**
 * Put a placement's two columns back exactly as they were.
 *
 * No validation and no log entry. Both are the point: the captured values came
 * out of the database and go back into it unchanged, and undoing an edit must
 * not append an edit to the list the row was just removed from.
 */
export async function restoreTouchpointPlacement(
  client: Client,
  placementId: string,
  columns: PlacementDetailColumns,
): Promise<void> {
  await writePlacementDetail(client, placementId, columns)
  invalidateCellBoard(null)
}

/** The one statement both paths run, so they cannot disagree about columns. */
async function writePlacementDetail(
  client: Client,
  placementId: string,
  columns: PlacementDetailColumns,
): Promise<void> {
  const { data, error } = await client
    .from('cell_touchpoints')
    .update({
      summary: columns.summary,
      role: columns.role,
    })
    .eq('id', placementId)
    .select('id')
  if (error) throw toAuthoringError(error)
  requireRowsWritten(data, 'touchpoint placement')
}
