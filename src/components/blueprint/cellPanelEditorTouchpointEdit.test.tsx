// @vitest-environment jsdom
/**
 * Edit touchpoint, from the panel's side.
 *
 * The cell editor opens the registry entry's own editor over itself, and the
 * two forms have to stay out of each other's way: the dialog saves only the
 * registry, the panel's unsaved edits are still there when it closes, and
 * the one write that does reach the panel — a rename, which rewrites this
 * cell's text in the database — moves the panel's copy of Content with it.
 *
 * That last part is the reason this file exists. The panel's Content is the
 * text the content sync reads on its next Save, and a placement is kept by
 * the name the text lists. Left holding the old name, the panel would write
 * it back, and the sync would delete the renamed placement with its Summary,
 * Role and resources. So: untouched Content follows the rename, and edited
 * Content refuses it before anything is sent.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellTouchpoint } from '@/types/blueprint'
import type { TouchpointUpdate } from '@/lib/touchpointMutations'

const { updateCellContent, updateCellSpec, updateTouchpointPlacement, updateTouchpoint } =
  vi.hoisted(() => ({
    updateCellContent: vi.fn(async () => {}),
    updateCellSpec: vi.fn(async () => {}),
    updateTouchpointPlacement: vi.fn(async () => {}),
    updateTouchpoint: vi.fn(),
  }))

vi.mock('@/lib/cellContentMutations', () => ({ updateCellContent }))
vi.mock('@/lib/cellSpecMutations', () => ({ updateCellSpec }))
// The content guard is the real one: whether the placement survives a Save
// is the question a rename puts at risk.
vi.mock('@/lib/touchpointMutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/touchpointMutations')>()),
  updateTouchpointPlacement,
  updateTouchpoint,
}))
vi.mock('@/lib/authoringRpc', () => ({ upsertCell: vi.fn() }))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
// The board as it stood before the rename. It is never refetched here, which
// is the window the panel has to survive: the database has the new name and
// the board does not yet.
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({
    blueprints: [
      {
        cells: [
          {
            id: 'cell-1',
            content: 'Intake portal, Case file',
            summary: 'Where a report is filed.',
            owner: null,
            perceived_owner: null,
            resources: [],
            touchpoints: [placement()],
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
  useTouchpointEntry: (id: string | null) =>
    id
      ? {
          status: 'ready',
          data: {
            id,
            name: 'Intake portal',
            kind: 'app',
            summary: null,
            url: null,
            iconUrl: null,
            placements: 3,
          },
        }
      : { status: 'loading' },
}))
vi.mock('@/components/blueprint/OwnerTagSelect', () => ({
  OwnerTagSelect: ({ ariaLabel }: { ariaLabel: string }) => (
    <input aria-label={ariaLabel} readOnly />
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

const RENAMED: TouchpointUpdate = {
  touchpointId: 'tp-1',
  name: 'Report portal',
  previousName: 'Intake portal',
  cellIds: ['cell-1', 'cell-9'],
  changed: true,
  previous: { name: 'Intake portal', kind: 'app', summary: null, url: null, iconUrl: null },
}

function editor(over: Partial<CellTouchpoint> = {}) {
  render(<CellPanelEditor cellId="cell-1" placement={placement(over)} onDone={() => {}} />)
}

/** The panel's Content input: the form's first `<input>`. */
function content(): HTMLInputElement {
  return document.querySelector('[data-panel-editor] input') as HTMLInputElement
}

function block(): HTMLElement {
  return document.querySelector('[data-touchpoint-block]') as HTMLElement
}

/** The placement's Summary, inside the block. */
function placementSummary(): HTMLTextAreaElement {
  return block().querySelector('textarea') as HTMLTextAreaElement
}

/** The cell's own Summary, the first textarea outside the block. */
function cellSummary(): HTMLTextAreaElement {
  return Array.from(
    document.querySelectorAll<HTMLTextAreaElement>('[data-panel-editor] textarea'),
  ).find((one) => !block().contains(one))!
}

function openEditor(): HTMLElement {
  fireEvent.click(within(block()).getByRole('button', { name: 'Edit touchpoint' }))
  return screen.getByRole('dialog', { name: 'Edit touchpoint' })
}

function rename(dialog: HTMLElement, to: string) {
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: to } })
}

beforeEach(() => {
  updateCellContent.mockClear()
  updateCellSpec.mockClear()
  updateTouchpointPlacement.mockClear()
  updateTouchpoint.mockReset()
})

afterEach(cleanup)

describe('Edit touchpoint in the cell panel', () => {
  it('is offered for a placement the registry holds, and not for a name-only one', () => {
    editor()
    expect(within(block()).getByRole('button', { name: 'Edit touchpoint' })).toBeTruthy()

    cleanup()
    editor({ touchpointId: null })
    expect(screen.queryByRole('button', { name: 'Edit touchpoint' })).toBeNull()
  })

  it('opens over the panel with the entry’s reach, and writes nothing on Cancel', () => {
    editor()
    const dialog = openEditor()

    expect(within(dialog).getByText('Changes apply at all 3 steps that use Intake portal.')).toBeTruthy()
    rename(dialog, 'Report portal')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(updateTouchpoint).not.toHaveBeenCalled()
    expect(content().value).toBe('Intake portal, Case file')
  })

  it('leaves the panel’s unsaved edits as they were, whether the dialog is cancelled or saved', async () => {
    updateTouchpoint.mockResolvedValue({ ...RENAMED, name: 'Intake portal', cellIds: [] })
    editor()
    fireEvent.change(cellSummary(), { target: { value: 'The desk’s first minute.' } })
    fireEvent.change(placementSummary(), { target: { value: 'The screen a report starts on.' } })

    fireEvent.click(within(openEditor()).getByRole('button', { name: 'Cancel' }))
    expect(cellSummary().value).toBe('The desk’s first minute.')
    expect(placementSummary().value).toBe('The screen a report starts on.')

    // A save of a field no cell's text carries.
    const dialog = openEditor()
    fireEvent.change(within(dialog).getByLabelText('URL'), {
      target: { value: 'https://example.com/portal' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save touchpoint' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(updateTouchpoint).toHaveBeenCalledWith({}, 'tp-1', {
      name: 'Intake portal',
      kind: 'app',
      summary: null,
      url: 'https://example.com/portal',
      iconUrl: null,
    })
    expect(cellSummary().value).toBe('The desk’s first minute.')
    expect(placementSummary().value).toBe('The screen a report starts on.')
    expect(content().value).toBe('Intake portal, Case file')
    // The registry's Save is not the panel's.
    expect(updateCellContent).not.toHaveBeenCalled()
    expect(updateTouchpointPlacement).not.toHaveBeenCalled()
  })

  it('moves untouched Content to the new name, and the panel’s next Save keeps the placement', async () => {
    updateTouchpoint.mockResolvedValue(RENAMED)
    editor()
    const dialog = openEditor()
    rename(dialog, 'Report portal')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save touchpoint' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Whole items, as the database rewrote them; the neighbour is untouched.
    expect(content().value).toBe('Report portal, Case file')
    expect(within(block()).getByTitle('Report portal')).toBeTruthy()

    // The panel's own edit after the rename, then its Save.
    fireEvent.change(placementSummary(), { target: { value: 'The screen a report starts on.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateTouchpointPlacement).toHaveBeenCalledTimes(1))

    // The text is what the database already holds, so nothing writes it —
    // and nothing writes the old name back for the sync to act on.
    expect(updateCellContent).not.toHaveBeenCalled()
    expect(updateTouchpointPlacement).toHaveBeenCalledWith(
      {},
      { id: 'ct-1', cellId: 'cell-1', name: 'Report portal' },
      { summary: 'The screen a report starts on.', role: null },
      { summary: 'Where a report is filed.', role: null },
    )
  })

  it('leaves Content alone when the rename did not rewrite this cell', async () => {
    updateTouchpoint.mockResolvedValue({ ...RENAMED, cellIds: ['cell-9'] })
    editor()
    const dialog = openEditor()
    rename(dialog, 'Report portal')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save touchpoint' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(content().value).toBe('Intake portal, Case file')
  })

  it('refuses a rename while Content is edited, says why, and writes nothing', () => {
    editor()
    fireEvent.change(content(), { target: { value: 'Intake portal, Case file, Phone line' } })
    const dialog = openEditor()
    rename(dialog, 'Report portal')

    expect(
      within(dialog).getByText(/Save or cancel your edits to this cell’s Content before renaming/),
    ).toBeTruthy()
    const save = within(dialog).getByRole('button', { name: 'Save touchpoint' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)

    expect(updateTouchpoint).not.toHaveBeenCalled()
    expect(content().value).toBe('Intake portal, Case file, Phone line')
  })
})
