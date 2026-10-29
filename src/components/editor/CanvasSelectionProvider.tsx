import { useCanvasAnnotationToolOptional } from '@/contexts/canvasAnnotationContext'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CanvasCellContextMenu } from '@/components/editor/CanvasCellContextMenu'
import { MarqueeSelection } from '@/components/editor/MarqueeSelection'
import {
  CellPickContext,
  useCellPick,
  type CellPickApi,
  type PickMode,
} from '@/contexts/cellPickContext'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import {
  getSharedCanvasMode,
  useCanvasModeValue,
} from '@/contexts/canvasModeContext'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import { registerAgentUiContext } from '@/lib/agent/uiBridge'
import { allCellsInReadingOrder } from '@/lib/canvasCellQuery'
import { useCanvasActiveEffect } from '@/contexts/canvasActiveContext'

/** Toggle each id in or out, preserving pick order for the ones that stay. */
function toggleInto(current: string[], cellIds: readonly string[]): string[] {
  const next = [...current]
  for (const cellId of cellIds) {
    const at = next.indexOf(cellId)
    if (at === -1) next.push(cellId)
    else next.splice(at, 1)
  }
  return next
}

/**
 * The explicit Make slice tool, independent of canvas Edit mode. Ordinary
 * clicks read cells until the tool is armed. Pick order becomes slice order;
 * clearing, Escape or leaving Edit mode exits the tool without remounting the
 * canvas. An existing slice edit session keeps its own picker.
 */
export function CanvasSelectionProvider({ children }: { children: ReactNode }) {
  const mode = useCanvasModeValue()
  /*
    A picker may already own this surface. The slice edit session provides
    its own — clicks mean "put this cell in the highlighted slide", not
    "gather toward a new slice" — and this provider mounts *inside* it, on
    the viewport. Providing unconditionally shadowed the session: canvas
    clicks fed a phantom gathering selection, and the bar offered to make a
    slice out of a slice. An outer picker passes through untouched; the
    gathering machinery below exists only for surfaces that have none.
  */
  const outer = useCellPick()
  const detail = useBlueprintCellDetailOptional()
  const [picked, setPicked] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const setAnnotationTool = useCanvasAnnotationToolOptional()?.setTool
  const startPicking = useCallback(() => {
    setAnnotationTool?.('select')
    setPicking(true)
  }, [setAnnotationTool])
  // Where a shift-range reaches *from*. Held separately from `picked` because
  // the anchor is the last cell touched, which is not always the last entry —
  // toggling a cell out leaves the anchor where it was.
  const anchor = useRef<string | null>(null)

  // Leaving Design mode drops the selection: the badges and rings are Design
  // affordances, and a selection surviving invisibly into View would reappear
  // on the way back with no memory of why. Cleared during render rather than
  // in an effect, so View never paints one frame still showing pick badges.
  const [lastMode, setLastMode] = useState(mode)
  if (lastMode !== mode) {
    setLastMode(mode)
    if (mode !== 'design') {
      if (picked.length > 0) setPicked([])
      if (picking) setPicking(false)
    }
  }

  const pickMany = useCallback(
    (cellIds: readonly string[], mode: PickMode = 'toggle') => {
      setPicking(true)
      setPicked((current) => {
        if (mode === 'replace') return [...new Set(cellIds)]

        if (mode === 'add') {
          // Union, not toggle. Clicking a lane whose cells are half-picked
          // should end with the whole lane picked — toggling would deselect
          // exactly the half that was already there, which reads as a bug.
          const next = [...current]
          for (const cellId of cellIds) {
            if (!next.includes(cellId)) next.push(cellId)
          }
          return next
        }

        if (mode === 'range') {
          const from = anchor.current
          const to = cellIds[cellIds.length - 1]
          const order = allCellsInReadingOrder()
          const start = from === null ? -1 : order.indexOf(from)
          const end = to === undefined ? -1 : order.indexOf(to)
          // No anchor, or either end not on this grid: fall back to toggling
          // rather than selecting something arbitrary.
          if (start === -1 || end === -1) return toggleInto(current, cellIds)
          const span = order.slice(Math.min(start, end), Math.max(start, end) + 1)
          const next = [...current]
          for (const cellId of span) {
            if (!next.includes(cellId)) next.push(cellId)
          }
          return next
        }

        return toggleInto(current, cellIds)
      })
      const last = cellIds[cellIds.length - 1]
      if (mode !== 'range' && last !== undefined) anchor.current = last
    },
    [],
  )

  const pick = useCallback(
    (cellId: string, mode: PickMode = 'toggle') => {
      pickMany([cellId], mode)
    },
    [pickMany],
  )

  const clear = useCallback(() => {
    setPicking(false)
    setPicked([])
    anchor.current = null
  }, [])

  /**
   * Picking no longer opens the detail panel.
   *
   * It used to: a click *was* a single selection, so one pick meant one cell
   * being edited. Once a click started gathering that stopped being true —
   * every first cell of a slice threw a panel across the canvas you were
   * picking from, and the panel is 320px of the thing you are trying to read.
   *
   * Opening it is now deliberate, and has two gestures of its own:
   * double-click and right-click → *View cell detail*. Both leave the
   * selection exactly as it was, which is the whole point — you can read a
   * cell you are still deciding about.
   *
   * What remains here is only the *closing* half: once two or more cells are
   * picked, a panel describing one of them is describing the wrong thing.
   *
   * The detail context is read through a **ref**, not a dependency. Its value
   * is a fresh object on every render of its provider, and selecting a cell
   * re-renders that provider — so depending on it directly re-runs this
   * effect, which selects again, which re-renders. That is not a subtle risk;
   * it is an immediate "Maximum update depth exceeded".
   */
  const detailRef = useRef(detail)
  useEffect(() => {
    detailRef.current = detail
  })

  const wasMultiple = useRef(false)
  useEffect(() => {
    const target = detailRef.current
    if (mode !== 'design' || !target) return

    const multiple = picked.length > 1
    // Only on the transition, so closing the panel by hand while two cells
    // stay picked does not have it slammed shut again on the next render.
    if (multiple && !wasMultiple.current) target.clearSelection()
    wasMultiple.current = multiple
  }, [mode, picked])

  // Agent parity: gather/clear the Design-mode selection by cell id —
  // the same pickMany/clear the marquee and lane/column headers call.
  useCanvasActiveEffect(() => {
    if (outer !== null) return // a session picker owns clicks here
    const unregister = [
      registerAgentUiCommand({
        name: 'select_cells',
        summary:
          'Gather cells into the Design-mode selection (for Make slice etc.). arg: comma-separated cell ids, or "all". Replaces the current selection. Needs design mode.',
        run: (arg) => {
          if (getSharedCanvasMode() !== 'design')
            return 'Selection gathers only in design mode — set_canvas_mode design first.'
          if (!arg) throw new Error('arg required: cell ids or "all"')
          const ids =
            arg.trim() === 'all'
              ? allCellsInReadingOrder()
              : arg.split(',').map((id) => id.trim()).filter(Boolean)
          if (ids.length === 0) return 'Nothing to select.'
          pickMany(ids, 'replace')
          return `Selected ${ids.length} cell(s).`
        },
      }),
      registerAgentUiCommand({
        name: 'clear_cell_selection',
        summary: 'Clear the Design-mode cell selection.',
        run: () => {
          clear()
          return 'Selection cleared.'
        },
      }),
    ]
    return () => unregister.forEach((fn) => fn())
  }, [outer, pickMany, clear])

  // Report the gathered selection to the agent's UI-context collector —
  // "what the user selected" in Design mode is exactly this ordered list.
  useCanvasActiveEffect(() => {
    if (picked.length === 0) return
    return registerAgentUiContext(
      'design-picks',
      () =>
        `User's Design-mode selection (${picked.length} cells, in pick order): ${picked.join(', ')}`,
    )
  }, [picked])

  useEffect(() => {
    if (mode !== 'design') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only when the canvas itself is the surface being escaped. With a
        // dialog, popover or menu open, Escape belongs to that layer — one
        // keystroke must not both close a sheet and wipe a selection that
        // took minutes to gather across blueprints.
        if (event.defaultPrevented) return
        if (
          document.querySelector(
            '[role="dialog"], [role="menu"], [data-canvas-cell-menu], [data-slot="popover-content"]',
          )
        ) {
          return
        }
        clear()
        return
      }
      if (!picking) return
      // Cmd/Ctrl-A takes the whole grid, in reading order. Guarded on the
      // event target so it never steals the shortcut from a text field.
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'a' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        const all = allCellsInReadingOrder()
        if (all.length === 0) return
        event.preventDefault()
        setPicked(all)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, picking, clear])

  const api = useMemo<CellPickApi>(() => {
    const order = new Map(picked.map((cellId, index) => [cellId, index + 1]))
    return {
      plainClick: mode === 'design' && picking,
      startPicking,
      gathers: true,
      picked,
      isPicked: (cellId) => order.has(cellId),
      orderOf: (cellId) => order.get(cellId),
      pick,
      pickMany,
      clear,
    }
  }, [clear, mode, pick, pickMany, picked, picking, startPicking])

  /*
    One tree shape in both modes.

    This used to return a bare fragment in View and the Provider in Edit —
    which reads as an optimisation and is actually a bomb: React sees a
    different element type at the root and unmounts the entire subtree on
    every mode switch. The camera reset to identity and its refit never
    landed (an empty canvas at 100% zoom, read as "zoom is broken"), 400
    cells re-rendered from scratch (~700ms jam, read as "loading is
    broken"), and every annotation — held in plain useState inside the
    remounted subtree — was silently deleted.

    Outside Design the *value* is null instead, which is exactly what
    consumers already expect from `useCellPick` when there is no picker.
  */
  const gatherHere = outer === null && mode === 'design' && picking

  return (
    <CellPickContext.Provider value={outer ?? (mode === 'design' ? api : null)}>
      {children}
      {/* Marquee and the context menu speak the gathering grammar (replace
          sweeps, toggle items); they stand down under a session picker whose
          clicks mean something else. */}
      {gatherHere ? (
        <>
          <MarqueeSelection />
          <CanvasCellContextMenu />
        </>
      ) : null}
    </CellPickContext.Provider>
  )
}
