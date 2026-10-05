// @vitest-environment jsdom
/**
 * Status is editable from the panel, and its revert is whole.
 *
 * `StatusSelect` had been in this repository for a while with nothing wiring
 * it to a cell: the one governed vocabulary on the board was the one thing an
 * author could not set. Adding the field is half the change; the other half
 * is the inverse.
 *
 * `updateCellContent` records `previous` as the change's revert, and
 * `executeRevert` replays that payload as an ordinary update. So a `previous`
 * that carries four fields and not the fifth is a revert that restores the
 * text, the summary and both owners, leaves the status where the edit put it,
 * and reports "taken back" — a write that succeeded and did less than it
 * claimed, which is the one failure the ledger's row-count guard cannot see.
 *
 * `CellContentUpdate` requires `status`, so omitting it from `previous` is a
 * compile error rather than a silent gap. This asserts the value as well as
 * the key: it has to be the status the cell held when the form opened, not
 * the one being saved.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellContentUpdate } from '@/lib/cellContentMutations'

const { updateCellContent, updateCellSpec } = vi.hoisted(() => ({
  updateCellContent: vi.fn(async () => {}),
  updateCellSpec: vi.fn(async () => {}),
}))

vi.mock('@/lib/cellContentMutations', () => ({ updateCellContent }))
vi.mock('@/lib/cellSpecMutations', () => ({ updateCellSpec }))
vi.mock('@/lib/authoringRpc', () => ({
  upsertCell: vi.fn(async () => ({ id: 'cell-1', inserted: true, previous: null })),
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))

/*
  The board the panel was opened from, which is where the editor reads the
  cell's status. `planned` and not the default, so a baseline that quietly
  fell back to `live` would fail this rather than pass it by luck.
*/
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({
    blueprints: [
      {
        cells: [
          {
            id: 'cell-1',
            content: 'Intake portal',
            summary: 'Where a report is filed.',
            owner: 'Support',
            perceived_owner: 'The council',
            status: 'planned',
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
  useTouchpointEntry: () => ({ status: 'loading' }),
}))

// The owner tags query a client this file does not stand up.
vi.mock('@/components/blueprint/OwnerTagSelect', () => ({
  OwnerTagSelect: ({
    value,
    ariaLabel,
  }: {
    value: string
    ariaLabel: string
    onChange: (next: string) => void
  }) => <input aria-label={ariaLabel} value={value} readOnly />,
}))

/*
  A plain labelled `<select>` in place of the real control.

  What the real one does — names its value in full, lists every rung, hands
  the chosen value back, stays in the tab order — is asserted where it lives,
  in optionSelect.test.tsx. The question here is only whether the form carries
  what it hands back into the write and the inverse, and a listbox in a portal
  would make that question hard to ask.
*/
vi.mock('@/components/blueprint/StatusSelect', () => ({
  StatusSelect: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (next: string) => void
  }) => (
    <select
      aria-label="Status"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="proposed">Proposed</option>
      <option value="planned">Planned</option>
      <option value="built">Built</option>
      <option value="live">Live</option>
      <option value="deprecated">Deprecated</option>
      <option value="retired">Retired</option>
    </select>
  ),
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'

const statusField = () =>
  screen.getByLabelText('Status') as HTMLSelectElement

beforeEach(() => {
  updateCellContent.mockClear()
  updateCellSpec.mockClear()
})

afterEach(cleanup)

describe("a cell's status, from the shared panel", () => {
  it('opens on the status the cell actually holds', () => {
    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)
    expect(statusField().value).toBe('planned')
  })

  it('writes the new status and records the old one as the inverse', async () => {
    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)
    fireEvent.change(statusField(), { target: { value: 'deprecated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(updateCellContent).toHaveBeenCalled())
    const [, , update, previous] = updateCellContent.mock.calls[0] as unknown as [
      unknown,
      string,
      CellContentUpdate,
      CellContentUpdate,
    ]
    expect(update.status).toBe('deprecated')
    // The whole inverse, not just its new field: a revert restores five
    // fields or it restores none of them honestly.
    expect(previous).toEqual({
      content: 'Intake portal',
      summary: 'Where a report is filed.',
      owner: 'Support',
      perceivedOwner: 'The council',
      status: 'planned',
    })
  })

  it('is on its own enough to make the form dirty', async () => {
    // Status is the only field that changes here. An editor that watched the
    // four text fields for a diff and not this one would show Save, do
    // nothing, and say it had saved.
    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)
    fireEvent.change(statusField(), { target: { value: 'retired' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(updateCellContent).toHaveBeenCalledTimes(1))
  })
})
