import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ENTITY_STATUS, asEntityStatus, type EntityStatus } from '@/lib/entityStatus'
import { upsertCell, type CellWrite } from '@/lib/authoringRpc'
import type { CellSpecUpdate } from '@/lib/cellSpecMutations'
import { cellBudgetKindForLane, type CellBudgetKind } from '@/lib/cellContentLimits'
import type { CellResource } from '@/types/blueprint'
import type { Database, Json } from '@/types/database'
import { recordChange } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import { requireRowsWritten } from '@/lib/optimisticConcurrency'
import { rowsForSync } from '@/lib/resourceDrafts'
import { parseCellContentItems } from '@/lib/parseCellContent'
import { invalidateCellBoard, invalidateQueries } from '@/lib/queryClient'
import { queryKeys } from '@/lib/queryKeys'

type Client = SupabaseClient<Database>

/**
 * What a cell's own writes change on screen: the grid and the board draw
 * the text, and the owner vocabulary is read off the cells. Called by every
 * writer below once its rows have landed — the raw writers a revert shares
 * included, so their callers do not call it again — and never by a caller.
 */
function cellWritten(cellId: string): void {
  invalidateCellBoard(cellId)
  invalidateQueries(queryKeys.ownerTags)
}

/** One resource a removed placement carried, as the sync hands it back. */
export type RemovedResource = {
  kind: string
  name: string
  url: string | null
  position: number
  featured: boolean
  origin: string
}

/**
 * A placement's per-moment writing, as the sync hands it back: its summary
 * and role, and its resources in order (the revert re-creates them). The
 * row itself stays, name-only, when it carried any of these.
 */
export type RemovedPlacement = {
  name: string
  position: number
  summary: string | null
  role: string | null
  resources?: RemovedResource[]
}

/**
 * Bring a cell's placements into line with the text just saved.
 *
 * One RPC, because this has to be one transaction: the position constraint
 * is DEFERRABLE INITIALLY DEFERRED, and PostgREST gives every statement its
 * own transaction, so a reorder issued row by row collides with itself. The
 * gate on touchpoint-bearing cells lives in the function too: content on an
 * actor lane is a sentence about what somebody did, and syncing it would
 * file that sentence in the registry as a tool.
 *
 * Returns the placements it removed, with their writing, so the caller can
 * put them in the inverse it records.
 */
export async function syncCellTouchpoints(
  client: Client,
  cellId: string,
  content: string,
): Promise<RemovedPlacement[]> {
  const { data, error } = await client.rpc('sync_cell_touchpoints', {
    p_cell_id: cellId,
    p_names: parseCellContentItems(content),
  })
  if (error) throw toAuthoringError(error)
  const removed = (data as { removed?: unknown } | null)?.removed
  return Array.isArray(removed) ? (removed as RemovedPlacement[]) : []
}

/** Put back the writing a removed placement was carrying. */
export async function restoreCellTouchpoints(
  client: Client,
  cellId: string,
  rows: RemovedPlacement[],
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await client.rpc('restore_cell_touchpoints', {
    p_cell_id: cellId,
    p_rows: rows as unknown as Json,
  })
  if (error) throw toAuthoringError(error)
  cellWritten(cellId)
}

export type CellContentUpdate = {
  /** The text in the cell on the grid. */
  content: string
  summary: string
  owner: string
  perceivedOwner: string
  /**
   * How far along the thing this cell describes is.
   *
   * Required rather than optional, and that is the point: `previous` is this
   * same type, so a caller that captures an inverse has to capture the status
   * with it. An optional field would have let a revert restore four fields
   * and leave the fifth where the edit put it, and report "taken back".
   */
  status: EntityStatus
}

/**
 * Write the cell's own text.
 *
 * These columns carry a column-level grant from the authoring migration, for
 * the same reason the spec columns do: the panel can edit what a cell *says*
 * without that opening the cell's position — path, lane, step — to the same
 * path. Where a cell sits is structure, and structure goes through the RPCs.
 * `status` is granted the same way, by the migration that added the column
 * against the editors that would follow — this is one of them.
 *
 * `content` is the one field that is never nulled. A cell with no text is a
 * blank box on the grid that cannot be told apart from a gap in the blueprint,
 * so an empty label is refused here rather than stored.
 */
export async function updateCellContent(
  client: Client,
  cellId: string,
  update: CellContentUpdate,
  /** The values being replaced — captured so the change can be reverted. */
  previous?: CellContentUpdate,
  /**
   * Session-log participation, decided per call rather than by ambient
   * module state: a revert passes `record: false` so undoing "edited text"
   * never logs a new edit — while a concurrent ordinary save, in flight at
   * the same moment, still logs itself. A global suspend flag around an
   * `await` swallowed exactly those saves.
   */
  options: { record?: boolean } = {},
): Promise<void> {
  const content = update.content.trim()
  if (!content) {
    throw new Error('A cell needs text — an empty one reads as a gap in the grid.')
  }

  const { data, error } = await client
    .from('cells')
    .update({
      content,
      // Empty means "not specified", stored as null so the read path has one
      // kind of empty to check rather than two.
      summary: update.summary.trim() || null,
      owner: update.owner.trim() || null,
      perceived_owner: update.perceivedOwner.trim() || null,
      // Never null: the column is `not null default 'live'`, and a cell with
      // no status would read as unassessed rather than current.
      status: update.status,
    })
    .eq('id', cellId)
    .select('id')
  if (error) throw toAuthoringError(error)
  // `.select('id')` + this check, not `error === null`: a matched-nothing
  // update is a 200 with an empty array. Without it, editing a cell whose
  // path was since deleted "succeeds", and its revert reports "taken back"
  // having written nothing.
  requireRowsWritten(data, 'cell')
  // The placements follow the text: a new line is a new placement, a line
  // that left keeps its writing as a name-only row or goes. What
  // the sync removed rides in the inverse so a revert can put it back.
  const removed = await syncCellTouchpoints(client, cellId, content)
  cellWritten(cellId)
  // Direct table write, so `call()` never sees it — logged here for the same
  // reason and with the same after-success placement.
  if (options.record !== false) {
    recordChange(
      'update_cell_content',
      { cell_id: cellId },
      previous?.content.trim()
        ? {
            fn: 'update_cell_content',
            args: {
              cell_id: cellId,
              update: previous,
              ...(removed.length > 0 ? { removed_placements: removed } : {}),
            },
          }
        : undefined,
    )
  }
}

/**
 * Which cell-text budget a write is measured against, from the lane the cell
 * sits on. Falls through to prose when the lane cannot be read — the same
 * fallback the panel uses when it cannot see a role.
 */
export async function laneBudgetKind(
  client: Client,
  laneId: string | null | undefined,
): Promise<CellBudgetKind> {
  if (!laneId) return cellBudgetKindForLane(null)
  const { data, error } = await client
    .from('lanes')
    .select('name, lane_role')
    .eq('id', laneId)
    .maybeSingle()
  if (error || !data) return cellBudgetKindForLane(null)
  return cellBudgetKindForLane({ name: data.name, role: data.lane_role })
}

/** A cell as an edit finds it: both halves as their writers take them, and the lane it sits on. */
export type CellBeforeEdit = {
  content: CellContentUpdate
  spec: CellSpecUpdate
  laneId: string | null
}

/**
 * Read a cell for an edit that names only the fields it changes. Both
 * writers above take the whole of their half and capture the whole as the
 * inverse, so a partial edit reads the row first and this is where it
 * reads it. `status` comes back to be handed straight through: an edit to
 * a cell's wording must not move it.
 */
export async function readCellBeforeEdit(client: Client, cellId: string): Promise<CellBeforeEdit> {
  const { data, error } = await client
    .from('cells')
    .select('content, summary, owner, perceived_owner, status, function, form, value_props, lane_id')
    .eq('id', cellId)
    .maybeSingle()
  if (error) throw toAuthoringError(error)
  if (!data) throw new Error(`No cell with id ${cellId}.`)
  const valueProps = Array.isArray(data.value_props)
    ? (data.value_props as Array<{ for?: string; value?: string }>).map((entry) => ({
        for: entry.for ?? '',
        value: entry.value ?? '',
      }))
    : []
  return {
    content: {
      content: data.content ?? '',
      summary: data.summary ?? '',
      owner: data.owner ?? '',
      perceivedOwner: data.perceived_owner ?? '',
      status: asEntityStatus(data.status) ?? DEFAULT_ENTITY_STATUS,
    },
    spec: {
      function: data.function ?? '',
      form: data.form ?? '',
      valueProps,
    },
    laneId: data.lane_id ?? null,
  }
}

/**
 * Create the cell at a slot, and refuse when one is there. The RPC upserts,
 * so a second call on the same slot would silently OVERWRITE the cell;
 * creation means creation, edits go through the content writer, and being
 * told so is a better answer than a quiet update.
 *
 * The guard is the error message, not the guarantee: a read followed by a
 * write holds nothing, so the RPC still reports which half it took and the
 * ledger branches on that (see `CellWrite`).
 */
export async function createCell(
  client: Client,
  input: { pathId: string; laneId: string; stepId: string; content: string },
): Promise<CellWrite> {
  const { data: occupied, error } = await client
    .from('cells')
    .select('id')
    .eq('lane_id', input.laneId)
    .eq('step_id', input.stepId)
    .or('position.is.null,position.eq.0')
    .limit(1)
  if (error) throw toAuthoringError(error)
  if (occupied && occupied.length > 0)
    throw new Error(
      `A cell already exists at that slot (${occupied[0].id}) — upsert_cell only creates. Use update_cell to edit the existing cell.`,
    )
  return upsertCell(client, input)
}

/**
 * A row as the editor holds it. `id` is the row it came from; absent on a
 * row typed since the last save. `kind` is `attachment` for a file and
 * `link` otherwise; the sync leaves a kept row's kind alone either way.
 */
export type ResourceDraft = {
  id?: string | null
  kind?: 'link' | 'attachment'
  name: string
  url: string
}

/** The rows `sync_cell_resources` takes, and the shape a revert carries. */
export type ResourceRowInput = {
  /** Null for a row to insert; the row's own id for one to update in place. */
  id: string | null
  kind: string
  name: string
  url: string | null
}

/**
 * Replace the cell's resources, in one transaction.
 *
 * An RPC rather than a table write, and the reason is the position column:
 * the editor rewrites a whole list, PostgREST gives every statement its own
 * transaction, and a deferred rule only forgives a collision until COMMIT.
 * `sync_cell_resources` reconciles the list inside one — a row that arrives
 * with its id is updated in place, so a reorder keeps every id.
 *
 * It writes the cell's OWN rows. A placement's resources sit in the same
 * list to be read but are the touchpoint's to write, and the sync refuses
 * their ids.
 */
export async function updateCellResources(
  client: Client,
  cellId: string,
  /** The rows being replaced — captured so the change can be reverted. */
  existing: readonly CellResource[],
  drafts: readonly ResourceDraft[],
): Promise<void> {
  // The one place a nameless resource gets a name, and the same
  // normalisation the panel compares its draft by. The database refuses a
  // row without a name rather than inventing a second answer.
  const rows: ResourceRowInput[] = rowsForSync(drafts)

  await writeCellResources(client, cellId, rows)
  recordChange(
    'update_cell_resources',
    { cell_id: cellId },
    // The captured list, written back as it stood — by id, so the revert
    // restores the rows themselves, not look-alikes. The cell's own rows
    // only: the sync refuses a placement's ids, so the inverse names none.
    {
      fn: 'update_cell_resources',
      args: {
        cell_id: cellId,
        resources: existing
          .filter((resource) => !resource.placementId)
          .map((resource) => ({
            id: resource.id,
            kind: resource.kind,
            name: resource.name,
            url: resource.url,
          })),
      },
    },
  )
}

/** The write itself, shared by the save and by its revert. */
export async function writeCellResources(
  client: Client,
  cellId: string,
  rows: readonly ResourceRowInput[],
): Promise<void> {
  const { error } = await client.rpc('sync_cell_resources', {
    p_cell_id: cellId,
    p_rows: rows as unknown as Json,
  })
  if (error) throw toAuthoringError(error)
  cellWritten(cellId)
}
