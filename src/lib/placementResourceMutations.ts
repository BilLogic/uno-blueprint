import type { SupabaseClient } from '@supabase/supabase-js'
import { recordChange } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import { rowsForSync } from '@/lib/resourceDrafts'
import type { Database, Json } from '@/types/database'
import type { CellResource } from '@/types/blueprint'
import { invalidateCellBoard } from '@/lib/queryClient'

type Client = SupabaseClient<Database>

/**
 * A row of a placement's list as the editor holds it.
 *
 * `id` is the row it came from, absent on a row pasted since the last save.
 * `kind` rides along because an attachment and a link sit in the same
 * list and the sync must not turn one into the other — it never writes kind
 * on a kept row, and reads it only for a new one.
 */
export type PlacementResourceDraft = {
  id?: string | null
  kind: string
  name: string
  url: string
}

/** The rows `sync_placement_resources` takes, and the shape a revert carries. */
export type PlacementResourceRowInput = {
  id: string | null
  kind: string
  name: string
  url: string
}

/**
 * Replace a placement's resources.
 *
 * One RPC, one transaction: the position rule is deferrable, so a reorder
 * lands as one statement, and reordering changes no `featured` value — the
 * column is not in the function's UPDATE. A pasted link with no name is
 * named by its host here, the same fallback the cell's list uses, so the
 * database never sees a nameless row.
 *
 * The inverse is the captured list, by id, written back as it stood —
 * identity-keyed so undo restores the rows themselves, not look-alikes.
 */
export async function updatePlacementResources(
  client: Client,
  placement: { id: string; cellId: string | null },
  existing: readonly CellResource[],
  drafts: readonly PlacementResourceDraft[],
): Promise<void> {
  const rows: PlacementResourceRowInput[] = rowsForSync(drafts)

  await writePlacementResources(client, placement.id, rows, placement.cellId)
  recordChange(
    'update_placement_resources',
    {
      placement_id: placement.id,
      ...(placement.cellId ? { cell_id: placement.cellId } : {}),
    },
    {
      fn: 'update_placement_resources',
      args: {
        placement_id: placement.id,
        resources: existing
          .filter((resource) => resource.placementId === placement.id)
          .map((resource) => ({
            id: resource.id,
            kind: resource.kind,
            name: resource.name,
            url: resource.url ?? '',
          })),
      },
    },
  )
}

/**
 * The write itself, shared by the save and by its revert. The overview
 * counts a placement's resources and the grid draws the featured one, so
 * the cell's board refetches — every board, when the caller knows no cell.
 */
export async function writePlacementResources(
  client: Client,
  placementId: string,
  rows: readonly PlacementResourceRowInput[],
  cellId: string | null = null,
): Promise<void> {
  const { error } = await client.rpc('sync_placement_resources', {
    p_placement_id: placementId,
    p_rows: rows as unknown as Json,
  })
  if (error) throw toAuthoringError(error)
  invalidateCellBoard(cellId)
}

/** A row's `featured` as it was before a featuring write — the inverse's unit. */
export type FeaturedBefore = { id: string; featured: boolean }

/**
 * Feature or unfeature one resource.
 *
 * "Set as button" on a link, "Unset" on one. An attachment's picture is set
 * as the cell's frame instead, which is its featured image. The function clears the owner's previous preview in the same
 * transaction and hands back every row it changed with its before-value, so
 * featuring an attachment records an inverse of exactly two rows and undo
 * restores both — through `restore_featured_resources`, which writes the
 * captured pairs back with no clearing rule.
 */
export async function setFeaturedResource(
  client: Client,
  resource: { id: string; placementId: string | null; cellId?: string | null },
  featured: boolean,
): Promise<FeaturedBefore[]> {
  const { data, error } = await client.rpc('set_featured_resource', {
    p_resource_id: resource.id,
    p_featured: featured,
  })
  if (error) throw toAuthoringError(error)
  const previous = readPrevious(data)
  if (previous.length === 0) {
    throw new Error('That resource no longer exists — nothing was written.')
  }
  invalidateCellBoard(resource.cellId)
  recordChange(
    'set_featured_resource',
    {
      resource_id: resource.id,
      featured,
      ...(resource.placementId ? { placement_id: resource.placementId } : {}),
      ...(resource.cellId ? { cell_id: resource.cellId } : {}),
    },
    { fn: 'restore_featured_resources', args: { p_rows: previous } },
  )
  return previous
}

function readPrevious(data: unknown): FeaturedBefore[] {
  const previous = (data as { previous?: unknown } | null)?.previous
  if (!Array.isArray(previous)) return []
  return previous.flatMap((entry) => {
    const row = entry as { id?: unknown; featured?: unknown }
    return typeof row.id === 'string' && typeof row.featured === 'boolean'
      ? [{ id: row.id, featured: row.featured }]
      : []
  })
}
