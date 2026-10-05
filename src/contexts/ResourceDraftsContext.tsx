import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  draftsFromResources,
  resourceOwners,
  type ResourceDraftState,
  type ResourceOwner,
  type ResourceOwnerId,
} from '@/lib/resourceDrafts'
import {
  createResourceDraftStore,
  type ResourceDraftStore,
} from '@/lib/resourceDraftStore'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

type ResourceDraftsValue = {
  store: ResourceDraftStore
  /** The groups, in reading order: This cell, then each placement at the cell. */
  owners: ResourceOwner[]
  /** Where an add goes unless the author picks: the opened touchpoint, else This cell. */
  defaultOwner: ResourceOwnerId
}

const ResourceDraftsContext = createContext<ResourceDraftsValue | null>(null)

/**
 * The cell panel's resource draft, shared by the two halves of the panel
 * that have to agree on it: the Resources tab, which edits it, and the
 * form, whose one Save writes it and whose count says it is unsaved.
 *
 * The tabs sit beside the form rather than inside it, so the draft is held
 * by the component above both — the panel — and handed down. Context rather
 * than a module store because there IS a tree here: one panel, one draft,
 * gone when the panel closes (which is what Cancel does) and never read by
 * anything outside it. The tab switching away unmounts the tab, not this.
 *
 * The baseline is frozen when the provider mounts, for the same reason the
 * form freezes its own: a write elsewhere refetches the board mid-edit, and
 * a draft compared against the live query would call an edit saved, or a
 * revert an edit. The caller keys the provider on what makes it a different
 * draft — the cell, and the touchpoint it was opened on.
 */
export function ResourceDraftsProvider({
  resources,
  frame,
  touchpoints,
  openedPlacementId = null,
  children,
}: {
  resources: readonly CellResource[]
  frame: string | null
  touchpoints: readonly CellTouchpoint[]
  /** The touchpoint the panel was opened on, when it has a row. */
  openedPlacementId?: string | null
  children: ReactNode
}) {
  const [store] = useState(() => createResourceDraftStore(draftsFromResources(resources, frame)))
  const { drafts } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const owners = useMemo(
    () => resourceOwners(touchpoints, drafts.rows),
    [touchpoints, drafts.rows],
  )
  const defaultOwner =
    openedPlacementId && owners.some((owner) => owner.id === openedPlacementId)
      ? openedPlacementId
      : null
  const value = useMemo(
    () => ({ store, owners, defaultOwner }),
    [store, owners, defaultOwner],
  )
  return (
    <ResourceDraftsContext.Provider value={value}>{children}</ResourceDraftsContext.Provider>
  )
}

/**
 * The draft and where it stands, or null outside a panel that holds one —
 * a form mounted on its own, or a draft cell, which has no resources yet.
 */
export function useResourceDraftsOptional():
  | (ResourceDraftsValue & { state: ResourceDraftState })
  | null {
  const value = useContext(ResourceDraftsContext)
  const state = useSyncExternalStore(
    value?.store.subscribe ?? noSubscribe,
    value?.store.getSnapshot ?? noSnapshot,
  )
  return value && state ? { ...value, state } : null
}

const noSubscribe = () => () => {}
const noSnapshot = () => null
