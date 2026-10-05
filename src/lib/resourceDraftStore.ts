import type { SupabaseClient } from '@supabase/supabase-js'
import { setCellFeaturedImage } from '@/lib/authoringRpc'
import { updateCellResources } from '@/lib/cellContentMutations'
import {
  setFeaturedResource,
  updatePlacementResources,
} from '@/lib/placementResourceMutations'
import {
  adoptIds,
  planResourceSave,
  resourcesFromDrafts,
  settleFeatured,
  settleFrame,
  settleList,
  type ResourceDrafts,
  type ResourceDraftState,
  type ResourceOwnerId,
} from '@/lib/resourceDrafts'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/**
 * One panel's resource draft, as a tiny store: the baseline frozen when the
 * panel opened, the draft the Resources tab edits, and the save the panel's
 * form runs.
 *
 * A store object and not a pair of `useState`s because two components that
 * are not parent and child both hold it — the tab edits it, the form counts
 * it and saves it — and because the save is a sequence of awaits that must
 * read where the draft stands after each landed write, not where it stood
 * when the click happened. It is one instance per open panel, handed down by
 * the panel through context and gone when the panel closes; nothing about it
 * is module-level, because nothing outside that panel has any business
 * reading it.
 */
export type ResourceDraftStore = {
  getSnapshot: () => ResourceDraftState
  subscribe: (listener: () => void) => () => void
  /** Apply an edit to the draft. The baseline does not move. */
  edit: (change: (drafts: ResourceDrafts) => ResourceDrafts) => void
  /** Write what changed, in order, settling each write as it lands. */
  save: (client: Client, input: { cellId: string; survives?: (owner: string) => boolean }) => Promise<void>
}

export function createResourceDraftStore(initial: ResourceDrafts): ResourceDraftStore {
  // One object per write, never rebuilt by a read: `useSyncExternalStore`
  // loops on a snapshot that is a new value every call.
  let state: ResourceDraftState = { baseline: initial, drafts: initial }
  const listeners = new Set<() => void>()
  const set = (next: ResourceDraftState) => {
    state = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    edit: (change) => set({ ...state, drafts: change(state.drafts) }),
    save: (client, { cellId, survives }) =>
      saveResourceDrafts(client, { cellId, survives, get: () => state, set }),
  }
}

/**
 * The resource half of the panel's Save. It runs after the cell and the
 * placement, so a list never lands on a placement the cell's text has just
 * removed.
 *
 * The cell's list, then each placement's — a re-tag's source before its
 * target — then the featured flags, then the featured image. Flags come
 * after the lists because a link added in this draft has no id until its
 * list is written, and a flag is written by id; the image comes last because
 * it is a url, and the url should be in a list the database holds before the
 * cell leads with it.
 *
 * Each write settles the moment it lands — its part of the baseline becomes
 * what was written — so a write that throws leaves exactly the unwritten part
 * as the draft, and pressing Save again sends only that. The same resume the
 * form already does for a created cell, one step finer.
 */
export async function saveResourceDrafts(
  client: Client,
  {
    cellId,
    survives,
    get,
    set,
  }: {
    cellId: string
    survives?: (owner: string) => boolean
    get: () => ResourceDraftState
    set: (state: ResourceDraftState) => void
  },
): Promise<void> {
  for (const list of planResourceSave(get().baseline, get().drafts, survives).lists) {
    const existing = resourcesFromDrafts(get().baseline)
    if (list.owner === null) {
      await updateCellResources(client, cellId, existing, list.rows)
    } else {
      await updatePlacementResources(client, { id: list.owner, cellId }, existing, list.rows)
    }
    set(settleList(get(), list.owner, await readListIds(client, cellId, list.owner)))
  }

  const { featured, frame } = planResourceSave(get().baseline, get().drafts, survives)

  /*
    A flag is written by id, and a row its list created has one only if the
    read-back answered. One that did not — now or on an earlier attempt — is
    asked for again here; the list is not written a second time for it.
  */
  const unnamed = new Set<ResourceOwnerId>()
  for (const flag of featured) {
    const row = get().drafts.rows.find((entry) => entry.key === flag.key)
    if (row && !row.id) unnamed.add(row.owner)
  }
  for (const owner of unnamed) {
    const ids = await readListIds(client, cellId, owner)
    if (ids) set(adoptIds(get(), owner, ids))
  }

  // Unsets before sets, so a flag never reads as two buttons where one is
  // being swapped for another.
  const ordered = [...featured].sort((a, b) => Number(a.featured) - Number(b.featured))
  for (const flag of ordered) {
    const row = get().drafts.rows.find((entry) => entry.key === flag.key)
    if (!row?.id) {
      // Left pending, not settled: the count stays above zero, and the next
      // Save asks for the id again rather than dropping the flag.
      throw new Error('The link was saved but could not be featured — try Save again.')
    }
    await setFeaturedResource(
      client,
      { id: row.id, placementId: row.owner, cellId },
      flag.featured,
    )
    set(settleFeatured(get(), flag.key, flag.featured))
  }

  if (frame) {
    await setCellFeaturedImage(client, { cellId, imageUrl: frame.url })
    set(settleFrame(get(), frame.url))
  }
}

/**
 * The ids of one owner's rows, in the order the list just wrote them.
 *
 * Both syncs answer with nothing, and both store each row's position as its
 * index in the list they were sent, so reading the owner's rows back by
 * position pairs every row with the id the database gave it. Null when the
 * read does not answer: the write landed regardless, and the caller settles
 * it all the same.
 */
async function readListIds(
  client: Client,
  cellId: string,
  owner: ResourceOwnerId,
): Promise<string[] | null> {
  try {
    const query = client.from('resources').select('id').order('position')
    const { data, error } =
      owner === null
        ? await query.eq('cell_id', cellId).is('cell_touchpoint_id', null)
        : await query.eq('cell_touchpoint_id', owner)
    if (error || !data) return null
    return data.map((row) => row.id)
  } catch {
    return null
  }
}
