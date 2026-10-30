import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import type {
  BlueprintCellSelection,
  BlueprintPanelSurface,
} from '@/types/blueprintCellDetail'
import type { BlueprintData } from '@/types/blueprint'
import {
  getBlueprintCellConnections,
  getBlueprintForPath,
} from '@/lib/blueprintCellConnections'
import {
  shouldUseTouchpointCellContent,
  shouldUseStoryboardContent,
} from '@/lib/blueprintLayout'
import { registerAgentUiContext } from '@/lib/agent/uiBridge'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import {
  getCompareReviewState,
  subscribeCompareReview,
} from '@/lib/compareReviewStore'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { setOpenCellId } from '@/lib/openCellStore'
import {
  claimPanel,
  requestPanelTransition,
  getPanelOwner,
  releasePanel,
  subscribePanelOwner,
} from '@/lib/openPanelStore'

export type BlueprintCellPreviewHover = {
  cellId: string
  techItem?: string | null
}

// Re-exported from `@/types/blueprintCellDetail`, where it moved so that pure
// helpers can name a surface without importing React. Existing imports of
// `BlueprintPanelSurface` from this module keep resolving.
export type { BlueprintPanelSurface }

export type BlueprintPanelState = { surface: BlueprintPanelSurface }

type BlueprintCellDetailContextValue = {
  enabled: boolean
  /**
   * The scenario the detail view is scoped to — the focused one, or the one a
   * slice tab / phone shell renders solo. `enabled` says the feature is live;
   * this says WHICH of the mounted boards it is live on, and the two axis
   * headers need both (see `scenarioBoardScopeContext`).
   */
  scenarioId: string | null
  blueprints: BlueprintData[]
  selection: BlueprintCellSelection | null
  selectCell: (selection: BlueprintCellSelection) => boolean
  clearSelection: () => boolean
  /**
   * A cell being *created*: the panel opens on this target with an empty
   * form, and nothing is written until Save. Mutually exclusive with
   * `selection` — a draft is not a cell yet.
   */
  draftCell: DraftCellTarget | null
  openDraftCell: (draft: DraftCellTarget) => void
  /**
   * THE single owner of "is the panel open, and on which surface".
   * `null` = closed. Everything else derives: `isOpen`, the drawer's
   * `open`, the surface switcher. Never OR a second boolean into it.
   */
  panelState: BlueprintPanelState | null
  /** Open the Differences (compare ledger) surface — no selection required. */
  openDifferences: () => void
  /** Swap surfaces inside the open drawer — content swap, never close-reopen. */
  setPanelSurface: (surface: BlueprintPanelSurface) => void
  /** Close the panel: clears panelState + selection + draft atomically. */
  closePanel: () => boolean
  isOpen: boolean
  selectedCellIds: ReadonlySet<string>
  directlyConnectedCellIds: ReadonlySet<string>
  setPreviewHover: (preview: BlueprintCellPreviewHover | null) => void
}

const BlueprintCellDetailContext =
  createContext<BlueprintCellDetailContextValue | null>(null)

// Hover state lives in its own context: it changes on every pointer move over
// the dependency table, and keeping it inside the main context value re-renders
// every cell in every mounted grid per hover.
const BlueprintCellHoverContext =
  createContext<BlueprintCellPreviewHover | null>(null)

type BlueprintCellDetailProviderProps = {
  children: ReactNode
  /** Clears the open panel when the active scenario or slide changes. */
  resetKey?: string
  enabled?: boolean
  /** See `scenarioId` on the context value. */
  scenarioId?: string | null
  blueprints?: BlueprintData[]
}

export function BlueprintCellDetailProvider({
  children,
  resetKey,
  enabled = false,
  scenarioId = null,
  blueprints = [],
}: BlueprintCellDetailProviderProps) {
  const [selection, setSelection] = useState<BlueprintCellSelection | null>(null)
  const [draftCell, setDraftCell] = useState<DraftCellTarget | null>(null)
  const [panelState, setPanelState] = useState<BlueprintPanelState | null>(null)
  const [previewHover, setPreviewHover] =
    useState<BlueprintCellPreviewHover | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate reset-on-key: clears the panel state together when the workspace changes
    setSelection(null)
    setDraftCell(null)
    setPanelState(null)
    setPreviewHover(null)
    // A reset is a close: hand the drawer back so the next opener — cell or
    // entity — starts from nobody owning it.
    releasePanel('cell')
  }, [resetKey])

  // The Differences surface only means something while a comparison is live
  // (≥2 selected paths in the focused scenario view). When that stops being
  // true — a path deselected, the scenario left compare — the surface falls
  // back: details if a cell is selected, closed otherwise. Render-phase
  // guarded set, the codebase's derive-during-render idiom.
  const compareActive =
    useSyncExternalStore(
      subscribeCompareReview,
      () => getCompareReviewState().registration,
    ) !== null
  if (panelState?.surface === 'differences' && !compareActive) {
    setPanelState(selection ? { surface: 'details' } : null)
  }

  // One panel at a time: an entity panel (lane, phase, scenario) taking the
  // drawer closes this one. Render-phase guarded set, same idiom as above —
  // and the panel state alone, because the claim has already moved and
  // releasing here would close the panel that just opened.
  //
  // `=== 'entity'`, not `!== 'cell'`: nobody owning the drawer is the
  // ordinary state after a close, and several openers set the panel without
  // claiming — the agent's `differences_open`, `setPanelSurface` — so a guard
  // on "not mine" nulled those on the very next render while the agent
  // reported the ledger open. Only another panel taking the drawer is a
  // reason to leave it.
  const panelOwner = useSyncExternalStore(subscribePanelOwner, getPanelOwner)
  if (panelOwner === 'entity' && panelState !== null) {
    setPanelState(null)
    setSelection(null)
    setDraftCell(null)
  }

  // Tell the agent's UI-context collector which cell the human has open in
  // the side panel — the panel mounts under the canvas, out of the agent
  // panel's React reach, so this goes through the module bridge.
  useEffect(() => {
    if (!selection) return
    return registerAgentUiContext('cell-panel', () => {
      const cells = selection.paths
        .map((entry) => `${entry.pathName}: ${entry.cellId}`)
        .join('; ')
      return `Cell panel open: "${selection.paths[0]?.content ?? selection.stepName}" — lane "${selection.laneName}", step "${selection.stepName}" (#${selection.stepIndex}), scenario "${selection.scenarioName}". Cell ids by path: ${cells}`
    })
  }, [selection])

  // Publish the open cell so the URL can carry it (`?cell=`) — that address is
  // the share link, and the same one the agent builds when it cites this cell.
  // First path only: a multi-path selection is one cell read across variants,
  // and the first entry is the one the panel opens on.
  useEffect(() => {
    const cellId = selection?.paths[0]?.cellId ?? null
    setOpenCellId(cellId)
    return () => setOpenCellId(null)
  }, [selection])

  const selectCell = useCallback((next: BlueprintCellSelection) => {
    return requestPanelTransition(() => {
    claimPanel('cell')
    setSelection(next)
    setDraftCell(null)
    setPanelState({ surface: 'details' })
    setPreviewHover(null)
    })
  }, [])

  const openDraftCell = useCallback((next: DraftCellTarget) => {
    return requestPanelTransition(() => {
    claimPanel('cell')
    setDraftCell(next)
    setSelection(null)
    setPanelState({ surface: 'details' })
    setPreviewHover(null)
    })
  }, [])

  /**
   * Close the panel: panelState, selection and draft clear atomically —
   * `clearSelection` kept its historical name because every existing caller
   * means "close the panel" by it.
   */
  const clearSelection = useCallback(() => {
    return requestPanelTransition(() => {
    setSelection(null)
    setDraftCell(null)
    setPanelState(null)
    setPreviewHover(null)
    releasePanel('cell')
    })
  }, [])

  const openDifferences = useCallback(() => {
    return requestPanelTransition(() => {
    claimPanel('cell')
    setPanelState({ surface: 'differences' })
    })
  }, [])

  const setPanelSurface = useCallback((surface: BlueprintPanelSurface) => {
    return requestPanelTransition(() => {
    setPanelState({ surface })
    })
  }, [])

  // Latest panel facts for the agent commands below — the commands register
  // once per (enabled, compareActive) and read the live state at fire time.
  const latestRef = useRef({ panelState, selection })
  useEffect(() => {
    latestRef.current = { panelState, selection }
  })

  // Agent parity for the panel surfaces (registry norm: a surface ships
  // with its commands). differences_* exist only while a comparison is
  // live, so list_ui_commands reflects real availability.
  useEffect(() => {
    if (!enabled) return
    const unregister: Array<() => void> = [
      registerAgentUiCommand({
        name: 'panel_surface',
        summary:
          "Switch the open floating panel's surface. arg: details | differences",
        run: (arg) => {
          const { panelState: current, selection: liveSelection } =
            latestRef.current
          if (current === null)
            return 'The panel is closed — open a cell (open_cell_panel) or the ledger (differences_open) first.'
          const surface = arg === 'differences' ? 'differences' : 'details'
          if (
            surface === 'differences' &&
            getCompareReviewState().registration === null
          )
            return 'No comparison is active — the Differences surface needs 2+ selected paths in a focused scenario.'
          if (!setPanelSurface(surface)) return 'Panel transition is awaiting a draft decision or the editor is busy.'
          return `Panel is on the ${surface} surface${
            surface === 'details' && !liveSelection ? ' (no cell selected)' : ''
          }.`
        },
      }),
    ]
    if (compareActive) {
      unregister.push(
        registerAgentUiCommand({
          name: 'differences_open',
          summary:
            'Open the difference ledger (the Differences surface of the floating panel) enumerating every difference between the compared paths.',
          run: () => {
            if (!openDifferences()) return 'Panel transition is awaiting a draft decision or the editor is busy.'
            return 'Difference ledger is open.'
          },
        }),
        registerAgentUiCommand({
          name: 'differences_close',
          summary:
            'Close the difference ledger — falls back to cell details when a cell is selected, otherwise closes the panel.',
          run: () => {
            const { panelState: current, selection: liveSelection } =
              latestRef.current
            if (current?.surface !== 'differences')
              return 'The difference ledger is not open.'
            if (liveSelection) {
              if (!setPanelSurface('details')) return 'Panel transition is awaiting a draft decision or the editor is busy.'
              return "Ledger closed — back on the selected cell's details."
            }
            if (!clearSelection()) return 'Panel transition is awaiting a draft decision or the editor is busy.'
            return 'Ledger closed.'
          },
        }),
      )
    }
    return () => unregister.forEach((fn) => fn())
  }, [enabled, compareActive, setPanelSurface, openDifferences, clearSelection])

  const cellEmphasis = useMemo(() => {
    const selectedCellIds = new Set<string>()
    const directlyConnectedCellIds = new Set<string>()

    if (!selection) {
      return { selectedCellIds, directlyConnectedCellIds }
    }

    const skipHighlightZone = shouldUseStoryboardContent({
      name: selection.laneName,
    })

    for (const path of selection.paths) {
      const resolvedCellId = resolveBlueprintCellId(path.cellId)
      selectedCellIds.add(path.cellId)
      selectedCellIds.add(resolvedCellId)

      if (skipHighlightZone) continue

      const blueprint = getBlueprintForPath(blueprints, path.pathId)
      if (!blueprint) continue

      const connections = getBlueprintCellConnections(
        blueprint,
        resolvedCellId,
      )
      for (const connection of [
        ...connections.incoming,
        ...connections.outgoing,
      ]) {
        directlyConnectedCellIds.add(connection.cellId)
        directlyConnectedCellIds.add(
          resolveBlueprintCellId(connection.cellId),
        )
      }

      // The dependency table also includes technology in the selected step,
      // even when no explicit dependency connects it to the active cell.
      const techLaneIds = new Set(
        blueprint.lanes
          .filter((lane) => shouldUseTouchpointCellContent(lane))
          .map((lane) => lane.id),
      )
      for (const cell of blueprint.cells) {
        if (
          cell.step_id !== selection.stepId ||
          !techLaneIds.has(cell.lane_id)
        ) {
          continue
        }
        directlyConnectedCellIds.add(cell.id)
        directlyConnectedCellIds.add(resolveBlueprintCellId(cell.id))
      }
    }

    return { selectedCellIds, directlyConnectedCellIds }
  }, [blueprints, selection])

  const value = useMemo(
    () => ({
      enabled,
      scenarioId,
      blueprints,
      selection,
      selectCell,
      clearSelection,
      draftCell,
      openDraftCell,
      panelState,
      openDifferences,
      setPanelSurface,
      closePanel: clearSelection,
      isOpen: enabled && panelState !== null,
      selectedCellIds: cellEmphasis.selectedCellIds,
      directlyConnectedCellIds: cellEmphasis.directlyConnectedCellIds,
      setPreviewHover,
    }),
    [
      enabled,
      scenarioId,
      blueprints,
      selection,
      selectCell,
      clearSelection,
      draftCell,
      openDraftCell,
      panelState,
      openDifferences,
      setPanelSurface,
      cellEmphasis,
    ],
  )

  return (
    <BlueprintCellDetailContext.Provider value={value}>
      <BlueprintCellHoverContext.Provider value={previewHover}>
        {children}
      </BlueprintCellHoverContext.Provider>
    </BlueprintCellDetailContext.Provider>
  )
}

/** Hover preview only — subscribe here instead of the main context so hover
 * changes don't re-render selection consumers. */
export function useBlueprintCellPreviewHover() {
  return useContext(BlueprintCellHoverContext)
}

export function useBlueprintCellDetail() {
  const context = useContext(BlueprintCellDetailContext)
  if (!context) {
    throw new Error(
      'useBlueprintCellDetail must be used within BlueprintCellDetailProvider',
    )
  }
  return context
}

export function useBlueprintCellDetailOptional() {
  return useContext(BlueprintCellDetailContext)
}
