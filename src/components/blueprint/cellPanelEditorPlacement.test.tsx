// @vitest-environment jsdom
/**
 * The order a cell's Save writes in, and the one condition it writes under.
 *
 * The editor holds a cell's fields and one placement's fields in ONE form
 * behind ONE Save, which is right for the reader — the panel is showing one
 * cell and one of its touchpoints — and is why the order of the writes
 * underneath is load-bearing rather than tidy.
 *
 * `updateCellContent` calls `sync_cell_touchpoints`, which brings the cell's
 * placements into line with the text just saved. So:
 *
 *   - **The cell goes first.** A save that took this touchpoint's name out of
 *     the text deletes its placement, detail and all. Writing the placement's
 *     words first would write them onto a row about to be destroyed.
 *   - **And the placement write asks whether it survived.** Writing it
 *     afterwards unconditionally fails on zero rows — on a save that did
 *     exactly what the author asked for.
 *
 * Both halves are invisible in the source order alone, which is why they are
 * asserted here: a later edit that hoists the placement write for tidiness,
 * or drops the `placementSurvivesContent` guard as redundant, breaks a real
 * behaviour and nothing else would say so.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellTouchpoint } from '@/types/blueprint'

/*
  The write log and the stubs that append to it.

  Inside `vi.hoisted` because `vi.mock`'s factory is lifted above every
  ordinary declaration in the file: a factory closing over a plain `const`
  reads it before it exists.
*/
const { calls, updateCellContent, updateCellSpec, updateTouchpointPlacement } =
  vi.hoisted(() => {
    const log: string[] = []
    return {
      calls: log,
      updateCellContent: vi.fn(async () => {
        log.push('cell')
      }),
      updateCellSpec: vi.fn(async () => {
        log.push('spec')
      }),
      updateTouchpointPlacement: vi.fn(async () => {
        log.push('placement')
      }),
    }
  })

vi.mock('@/lib/cellContentMutations', () => ({ updateCellContent }))
vi.mock('@/lib/cellSpecMutations', () => ({ updateCellSpec }))
// The guard is the real one — the point is that the editor consults it, not
// that a stub can be made to answer either way.
vi.mock('@/lib/touchpointMutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/touchpointMutations')>()),
  updateTouchpointPlacement,
}))
vi.mock('@/lib/authoringRpc', () => ({
  upsertCell: vi.fn(async () => ({ id: 'cell-1', inserted: true, previous: null })),
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
// The editor reads the whole cell off the board it was opened from, so the
// board is where the cell's text and owner pair have to be for these to run.
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({
    blueprints: [
      {
        cells: [
          {
            id: 'cell-1',
            content: 'Intake portal',
            summary: 'Where a report is filed.',
            owner: null,
            perceived_owner: null,
            resources: [],
          },
        ],
      },
    ],
  }),
}))
vi.mock('@/hooks/useValueAudiences', () => ({
  useValueAudiences: () => ({ status: 'ready', data: [] }),
}))
vi.mock('@/hooks/useRegistryTouchpoints', () => ({
  useRegistryTouchpoints: () => ({ status: 'ready', data: [] }),
  useNameOnlyPlacements: () => ({ status: 'ready', data: [] }),
}))
// The owner tags come from their own query against a client this file does
// not stand up. A plain labelled input is the whole of what these cases ask
// of the control: that typing in it makes the cell's half of the form dirty.
vi.mock('@/components/blueprint/OwnerTagSelect', () => ({
  OwnerTagSelect: ({
    value,
    ariaLabel,
    onChange,
  }: {
    value: string
    ariaLabel: string
    onChange: (next: string) => void
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'

function placement(over: Partial<CellTouchpoint> = {}): CellTouchpoint {
  return {
    id: 'ct-1',
    touchpointId: 'tp-1',
    name: 'Intake portal',
    kind: 'app',
    iconUrl: null,
    summary: 'Where a report is filed.',
    role: null,
    ...over,
  }
}

/**
 * The Content input — the form's first, and the only `<input>` above the
 * placement group. `Field` labels its child by position rather than by `for`,
 * so there is no accessible name to ask for.
 */
function contentInput(): HTMLInputElement {
  const input = document.querySelector('[data-panel-editor] input')
  expect(input, 'the content field did not render').toBeTruthy()
  return input as HTMLInputElement
}

/** The placement group's Summary — the second field of that name on screen. */
function placementSummary(): HTMLTextAreaElement {
  const group = document.querySelector('[data-panel-editor] .border-border')
  expect(group, 'the placement group did not render').toBeTruthy()
  const field = group!.querySelector('textarea')
  expect(field, 'the placement group has no summary field').toBeTruthy()
  return field as HTMLTextAreaElement
}

/**
 * The CELL's Summary — the first `<textarea>` outside the placement group.
 *
 * Two fields carry that label, which is the whole reason the group draws a
 * border and says whose it is; neither can be asked for by name.
 */
function cellSummary(): HTMLTextAreaElement {
  const inGroup = placementSummary()
  const field = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      '[data-panel-editor] textarea',
    ),
  ).find((one) => one !== inGroup)
  expect(field, 'the cell summary field did not render').toBeTruthy()
  return field!
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  calls.length = 0
  updateCellContent.mockClear()
  updateCellSpec.mockClear()
  updateTouchpointPlacement.mockClear()
})

afterEach(cleanup)

describe('one Save over a cell and one of its placements', () => {
  it('writes the cell first and the placement after it', async () => {
    render(
      <CellPanelEditor
        cellId="cell-1"
        placement={placement()}
        onDone={() => {}}
      />,
    )

    // Both halves of the one form, in the one sitting the single Save is for.
    fireEvent.change(cellSummary(), {
      target: { value: 'The moment a report reaches the desk.' },
    })
    fireEvent.change(placementSummary(), {
      target: { value: 'The screen a report is filed on.' },
    })
    save()
    await vi.waitFor(() => expect(calls).toContain('placement'))

    // The cell's write runs `sync_cell_touchpoints`; the placement's words go
    // onto a row that survived it, never onto one about to be deleted.
    expect(calls).toEqual(['cell', 'placement'])
  })

  it('does not write a placement the saved text no longer names', async () => {
    render(
      <CellPanelEditor
        cellId="cell-1"
        placement={placement()}
        onDone={() => {}}
      />,
    )

    // The author renamed the touchpoint out of the cell's text AND edited the
    // placement's words in the same sitting. The sync will delete the row; a
    // write after it would fail on zero rows, on a save that did exactly what
    // was asked.
    fireEvent.change(contentInput(), { target: { value: 'Duty phone' } })
    fireEvent.change(placementSummary(), {
      target: { value: 'The screen a report is filed on.' },
    })
    save()
    await vi.waitFor(() => expect(calls).toContain('cell'))

    expect(updateTouchpointPlacement).not.toHaveBeenCalled()
  })

  it('leaves the placement alone when only the cell changed', async () => {
    render(
      <CellPanelEditor
        cellId="cell-1"
        placement={placement()}
        onDone={() => {}}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Owner' }), {
      target: { value: 'Field operations' },
    })
    save()
    await vi.waitFor(() => expect(calls).toContain('cell'))

    // A write per edited thing, not a write per Save: an untouched placement
    // gets no ledger entry to take back.
    expect(updateTouchpointPlacement).not.toHaveBeenCalled()
  })

  it('offers no placement fields where the placement has no row', async () => {
    render(
      <CellPanelEditor
        cellId="cell-1"
        // A board with no database behind it: the placements come out of the
        // bundled sample content, and there is nothing to save into. Offering
        // the form there would be offering a Save that writes nothing.
        placement={placement({ id: null, touchpointId: null })}
        onDone={() => {}}
      />,
    )

    expect(screen.queryByLabelText('Role')).toBeNull()
  })
})
