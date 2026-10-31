import { describe, expect, it } from 'vitest'
import {
  clickOpensDetail,
  clickPicks,
  detailClickCloses,
  pickModeForClick,
  pickModeForMarquee,
  type ClickModifiers,
} from '@/lib/cellPickGrammar'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'

/**
 * The detail panel's click toggle. It is worth pinning as a pure function
 * because the interesting part is not "does a second click close it" — it is
 * the four cases that must NOT close it, three of which are invisible from
 * the call site.
 */

function cellAt(stepIndex: number, cellId: string): BlueprintCellSelection {
  return {
    scenarioName: 'Intake Call',
    laneName: 'Actor',
    stepId: `step-${stepIndex}`,
    stepName: `Step ${stepIndex}`,
    stepIndex,
    paths: [
      {
        cellId,
        pathId: 'path-1',
        pathName: 'Happy',
        pathSummary: null,
        pathKind: 'happy',
        content: 'Greets the caller',
        frame: null,
        summary: null,
        touchpoints: [],
        resources: [],
      },
    ],
  }
}

const HUMAN_CLICK = {
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isTrusted: true,
}
const CELL_A = cellAt(1, 'cell-a')
const CELL_B = cellAt(2, 'cell-b')

describe('detailClickCloses', () => {
  it('closes when the click lands on the cell the panel is showing', () => {
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'details',
        current: CELL_A,
        next: CELL_A,
      }),
    ).toBe(true)
  })

  it('opens when the click lands on a different cell', () => {
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'details',
        current: CELL_A,
        next: CELL_B,
      }),
    ).toBe(false)
  })

  it('opens when the panel is closed', () => {
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: null,
        current: null,
        next: CELL_A,
      }),
    ).toBe(false)
  })

  it('switches surface rather than closing when the ledger is on top', () => {
    // The cell is selected underneath, but what the user can SEE is the
    // difference ledger. Closing the whole panel from a click on a cell the
    // panel is not currently showing would read as a bug.
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'differences',
        current: CELL_A,
        next: CELL_A,
      }),
    ).toBe(false)
  })

  it('never closes on the read gesture', () => {
    // ⌘/ctrl-click is "open detail, touch nothing" — and it is the only route
    // to the panel while a picker is armed, so it cannot also be the exit.
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      expect(
        detailClickCloses({
          event: { ...HUMAN_CLICK, ...modifier },
          openSurface: 'details',
          current: CELL_A,
          next: CELL_A,
        }),
      ).toBe(false)
    }
  })

  it('keeps the agent path idempotent', () => {
    // `open_cell_panel` opens the panel by dispatching a ⌘-click on the real
    // cell, so it arrives at the same handler a person's click does. Either
    // guard alone would hold here; both are asserted, because the day someone
    // switches that dispatch to a bare click, `isTrusted` is what stops
    // "open this cell" from silently meaning "close it".
    expect(
      detailClickCloses({
        event: { ...HUMAN_CLICK, metaKey: true, isTrusted: false },
        openSurface: 'details',
        current: CELL_A,
        next: CELL_A,
      }),
    ).toBe(false)
    expect(
      detailClickCloses({
        event: { ...HUMAN_CLICK, isTrusted: false },
        openSurface: 'details',
        current: CELL_A,
        next: CELL_A,
      }),
    ).toBe(false)
  })

  it('opens the clicked cell while a draft is on the panel', () => {
    // A draft and a selection are mutually exclusive, so a draft shows up
    // here as `current: null` and can never reach the close branch.
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'details',
        current: null,
        next: CELL_A,
      }),
    ).toBe(false)
  })

  it('treats a touchpoint as its own cell', () => {
    // The panel can be open on one touchpoint inside a tech cell; clicking a
    // different touchpoint in the same cell has to open it, not close the panel.
    const touchpoint = (item: string) => ({ ...cellAt(1, 'cell-tech'), techItem: item })
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'details',
        current: touchpoint('Phone'),
        next: touchpoint('Calendly'),
      }),
    ).toBe(false)
    expect(
      detailClickCloses({
        event: HUMAN_CLICK,
        openSurface: 'details',
        current: touchpoint('Phone'),
        next: touchpoint('Phone'),
      }),
    ).toBe(true)
  })
})

/**
 * What a modifier means when a cell is clicked.
 *
 * The grammar was once spread across three call sites with slightly different
 * opinions, which is how a selection becomes messy: every gesture individually
 * defensible, no two agreeing. The table in `cellPickGrammar` is the only
 * place the answer lives, and these pin it.
 */
const click = (mods: Partial<ClickModifiers> = {}): ClickModifiers => ({
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods,
})

describe('the pick grammar', () => {
  it('toggles on a plain click, so a set is built and left by clicking', () => {
    // `toggle` is in-if-out, out-if-in, so there is no separate "deselect"
    // gesture that could be missing.
    expect(pickModeForClick(click(), true)).toBe('toggle')
  })

  it('reaches across a run with shift when the picker gathers', () => {
    expect(pickModeForClick(click({ shiftKey: true }), true)).toBe('range')
  })

  it('falls back to toggle on shift when there is no run to reach across', () => {
    // A slice edit session picks one cell into the active frame; there is no
    // ordered gathering to span, so a range would select something arbitrary.
    expect(pickModeForClick(click({ shiftKey: true }), false)).toBe('toggle')
  })

  it('reads the cell on cmd and ctrl, and never touches the selection', () => {
    // The open gesture must not be producible by clicking fast, which is why
    // it is a held modifier and why double-click means nothing: in a toggle
    // grammar, click-in click-out IS a fast double-click.
    expect(clickOpensDetail(click({ metaKey: true }))).toBe(true)
    expect(clickOpensDetail(click({ ctrlKey: true }))).toBe(true)
    expect(clickOpensDetail(click())).toBe(false)
    expect(clickOpensDetail(click({ shiftKey: true }))).toBe(false)
    expect(clickPicks(click({ metaKey: true }), true)).toBe(false)
    expect(clickPicks(click({ ctrlKey: true }), true)).toBe(false)
  })

  it('lets cmd win over shift when both are held — a read stays a read', () => {
    expect(clickOpensDetail(click({ shiftKey: true, metaKey: true }))).toBe(true)
    expect(clickPicks(click({ shiftKey: true, metaKey: true }), true)).toBe(false)
  })

  it('replaces on a bare marquee and widens on a shift marquee', () => {
    expect(pickModeForMarquee({ shiftKey: false })).toBe('replace')
    expect(pickModeForMarquee({ shiftKey: true })).toBe('add')
  })

  it('never gathers cells before the selection tool is active', () => {
    expect(clickPicks(click(), false)).toBe(false)
    expect(clickPicks(click({ shiftKey: true }), false)).toBe(false)
    // ⌘/ctrl is the open gesture everywhere; it never picks.
    expect(clickPicks(click({ metaKey: true }), false)).toBe(false)
    expect(clickPicks(click({ ctrlKey: true }), false)).toBe(false)
  })

  it('lets a plain click gather while Make slice is active', () => {
    expect(clickPicks(click(), true)).toBe(true)
  })
})
