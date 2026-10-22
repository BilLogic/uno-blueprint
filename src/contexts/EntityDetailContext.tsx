import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  claimPanel,
  getPanelOwner,
  releasePanel,
  subscribePanelOwner,
} from '@/lib/openPanelStore'

export type StructureDraft =
  | { kind: 'lane'; scenarioId: string; atPosition?: number }
  | { kind: 'step'; pathId: string; atPosition?: number }

/**
 * The levels of the tree that own spec fields and are not a cell.
 *
 * `service` joined on 2026-08-21 when the tier was unpinned. It is the only
 * member whose `id` the opener does not need to know — there is one service —
 * but it carries one anyway so every member of the union has the same shape.
 */
export type EntityDetailKind =
  | 'service'
  | 'lane'
  | 'phase'
  | 'scenario'
  | 'step'

export type EntityDetailSelection = {
  kind: EntityDetailKind
  /** The row's id — the panel reads everything else from the database. */
  id: string
  draft?: StructureDraft
}

type EntityDetailContextValue = {
  selection: EntityDetailSelection | null
  openEntity: (selection: EntityDetailSelection) => void
  /**
   * Open it, or close it if it is already the one open.
   *
   * The canvas's own grammar: a bare click on the cell the panel is showing
   * closes it. An affordance that only ever opens leaves the reader hunting
   * for the ✕ after every glance.
   */
  toggleEntity: (selection: EntityDetailSelection) => void
  openCreate: (draft: StructureDraft, opener: HTMLButtonElement) => void
  closeEntity: () => void
  isOpen: boolean
}

const EntityDetailContext = createContext<EntityDetailContextValue | null>(null)

export function EntityDetailProvider({
  children,
  /** Clears the open panel when the active scenario or slide changes. */
  resetKey,
}: {
  children: ReactNode
  resetKey?: string
}) {
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const [selection, setSelection] = useState<EntityDetailSelection | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate reset-on-key: the entity a panel is describing may not exist in the new workspace
    setSelection(null)
    openerRef.current = null
  }, [resetKey])

  const openEntity = useCallback((next: EntityDetailSelection) => {
    openerRef.current = null
    claimPanel('entity')
    setSelection(next)
  }, [])

  const openCreate = useCallback(
    (draft: StructureDraft, opener: HTMLButtonElement) => {
      openerRef.current = opener
      claimPanel('entity')
      setSelection({ kind: draft.kind, id: 'draft', draft })
    },
    [],
  )

  const toggleEntity = useCallback((next: EntityDetailSelection) => {
    setSelection((current) => {
      if (current && current.kind === next.kind && current.id === next.id) {
        releasePanel('entity')
        return null
      }
      claimPanel('entity')
      return next
    })
  }, [])

  const closeEntity = useCallback(() => {
    setSelection(null)
    releasePanel('entity')
    const opener = openerRef.current
    openerRef.current = null
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }, [])

  // One panel at a time: when the cell panel takes the drawer, this one drops
  // its selection. Render-phase guarded set, the codebase's
  // derive-during-render idiom — and only the selection, because ownership has
  // already moved and releasing it here would take the drawer away from the
  // panel that just claimed it.
  const owner = useSyncExternalStore(subscribePanelOwner, getPanelOwner)
  if (owner !== 'entity' && selection !== null) setSelection(null)

  const value = useMemo<EntityDetailContextValue>(
    () => ({
      selection,
      openEntity,
      openCreate,
      toggleEntity,
      closeEntity,
      isOpen: selection !== null,
    }),
    [selection, openEntity, openCreate, toggleEntity, closeEntity],
  )

  return (
    <EntityDetailContext.Provider value={value}>
      {children}
    </EntityDetailContext.Provider>
  )
}

/**
 * Read the entity panel. Throws outside the provider.
 *
 * It used to return a closed, inert value instead, so an affordance could sit
 * on chrome the provider did not reach without every call site guarding. That
 * was the wrong trade in the only case it applied to: the provider reached one
 * tab body, and every affordance outside it — the sidebar's nav, the sticky
 * header, the phase menubar, the breadcrumb — got a working button that did
 * nothing at all when clicked. Silence is the one failure a UI cannot report.
 *
 * The provider is mounted on the shell now (`EditorShell`), above both the
 * desktop and mobile trees, so anything rendered inside the app is inside it.
 * A call from somewhere else is a mounting mistake, and throwing is how a
 * mounting mistake gets found — on the first render, in development, with the
 * component named.
 */
export function useEntityDetail(): EntityDetailContextValue {
  const value = useContext(EntityDetailContext)
  if (!value) {
    throw new Error(
      'useEntityDetail must be used inside an EntityDetailProvider — it is mounted on EditorShell.',
    )
  }
  return value
}
