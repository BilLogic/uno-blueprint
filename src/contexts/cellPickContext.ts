import { createContext, useContext } from 'react'

/**
 * The one place a canvas cell click can mean something other than "open the
 * detail panel".
 *
 * Two producers use it — the Design-mode selection on any canvas, and a slice
 * tab being edited — and one consumer reads it (`BlueprintCellButton`).
 * Routing both through a single context is what keeps the cell button from
 * growing a second, divergent notion of "selected": the panel's selection and
 * a slice's membership are different things and must never be confused.
 */
export type CellPickApi = {
  /**
   * `true` while an explicit selection tool wants a plain click. `false` leaves ordinary reading of the blueprint
   * untouched.
   */
  plainClick: boolean
  /** Enter the explicit Make slice selection tool. */
  startPicking?: () => void
  /** The selection, in order. The toolbar counts it; the dialog consumes it. */
  picked: readonly string[]
  isPicked: (cellId: string) => boolean
  /** 1-based position in the pick order, for the badge. */
  orderOf: (cellId: string) => number | undefined
  /**
   * `true` for a Make slice set-builder rather than an existing slice editor. A slice edit session picks too, but its clicks mean "put this cell in
   * the active slide", so it keeps replace-style semantics of its own.
   */
  gathers?: boolean
  /**
   * What a pick does to the selection already there.
   *
   * This was a single `additive` boolean carrying Figma's object grammar —
   * plain replaces, shift toggles. That grammar is right when a selection is
   * the subject of the next verb and verbs are frequent (move it, resize it),
   * and wrong here: this selection is a **set being assembled**, with one verb
   * at the end of it. Replace-on-click meant the set could never be built by
   * clicking, only by holding shift for every cell after the first.
   *
   * A boolean cannot say which of these four is meant, so it is an enum.
   */
  pick: (cellId: string, mode?: PickMode) => void
  /** Bulk pick, in the given order — lane, column, marquee, select-all. */
  pickMany: (cellIds: readonly string[], mode?: PickMode) => void
  clear: () => void
}

export type PickMode =
  /** Default for a cell click: in if out, out if in. */
  | 'toggle'
  /**
   * Union. A lane or column click takes the whole run — a lane half-picked
   * already should end up wholly picked, which `toggle` would not do.
   */
  | 'add'
  /** Marquee: a deliberate sweep says "these", not "these as well". */
  | 'replace'
  /**
   * Shift-click a cell: everything between the last pick and this one, in grid
   * reading order. Falls back to `toggle` when there is no anchor to reach
   * from.
   */
  | 'range'

export const CellPickContext = createContext<CellPickApi | null>(null)

export function useCellPick(): CellPickApi | null {
  return useContext(CellPickContext)
}
