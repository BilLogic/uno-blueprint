// @vitest-environment jsdom
/**
 * The Resources tab's drafts and the panel's one Save.
 *
 * The tab sits beside the form, not inside it, so these cases mount the two
 * the way the panel does — siblings under the panel's resource draft — and
 * drive them as an author would: edit in the tab, read the count and press
 * Save in the form. The writes are stubbed onto one log so the order is the
 * assertion, and a stub can be told to refuse once so the resume is too.
 */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

const {
  log,
  fail,
  stored,
  updateCellContent,
  updateCellSpec,
  updateTouchpointPlacement,
  updateCellResources,
  updatePlacementResources,
  setFeaturedResource,
  setCellFeaturedImage,
} = vi.hoisted(() => {
  const log: string[] = []
  const fail = { on: null as string | null }
  const stored = new Map<string, string[]>()
  const step = (name: string) => {
    if (fail.on === name) {
      fail.on = null
      throw new Error(`${name} refused`)
    }
    log.push(name)
  }
  type Row = { id?: string | null }
  return {
    log,
    fail,
    stored,
    updateCellContent: vi.fn(async () => step('cell')),
    updateCellSpec: vi.fn(async () => step('spec')),
    updateTouchpointPlacement: vi.fn(async () => step('placement')),
    updateCellResources: vi.fn(async (_c: unknown, _id: string, _e: unknown, rows: Row[]) => {
      step('cell list')
      stored.set('cell', rows.map((row, index) => row.id ?? `new-cell-${index}`))
    }),
    updatePlacementResources: vi.fn(
      async (_c: unknown, placement: { id: string }, _e: unknown, rows: Row[]) => {
        step(`list ${placement.id}`)
        stored.set(placement.id, rows.map((row, index) => row.id ?? `new-${index}`))
      },
    ),
    setFeaturedResource: vi.fn(async (_c: unknown, row: { id: string }, featured: boolean) => {
      step(`featured ${row.id} ${featured}`)
      return []
    }),
    setCellFeaturedImage: vi.fn(async (_c: unknown, input: { imageUrl: string | null }) => {
      step('frame')
      return { cell_id: 'cell-1', frame: input.imageUrl }
    }),
  }
})

vi.mock('@/lib/cellContentMutations', () => ({ updateCellContent, updateCellResources }))
vi.mock('@/lib/cellSpecMutations', () => ({ updateCellSpec }))
vi.mock('@/lib/touchpointMutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/touchpointMutations')>()),
  updateTouchpointPlacement,
}))
vi.mock('@/lib/placementResourceMutations', () => ({
  updatePlacementResources,
  setFeaturedResource,
}))
vi.mock('@/lib/authoringRpc', () => ({
  upsertCell: vi.fn(),
  setCellFeaturedImage,
}))

/** The read-back of new ids: an owner's ids in position order, from what the stubs stored. */
const client = {
  from: () => {
    let owner = 'cell'
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: string) => {
        if (column === 'cell_touchpoint_id') owner = value
        return query
      },
      is: () => query,
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: (stored.get(owner) ?? []).map((id) => ({ id })), error: null }),
    }
    return query
  },
}
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client, configured: true, canWrite: true }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => 'design' }))

const PICTURE =
  'https://x.supabase.co/storage/v1/object/public/cell-attachments/cells/cell-1/screen.png'
const PLACEMENT: CellTouchpoint = {
  id: 'ct-1',
  touchpointId: 'tp-1',
  name: 'Intake portal',
  kind: 'app',
  iconUrl: null,
  summary: 'Where a report is filed.',
  role: null,
}
const RESOURCES: CellResource[] = [
  { id: 'r-cell', name: 'Tracker', kind: 'link', url: 'https://tracker.dev/1', placementId: null, featured: false },
  { id: 'r-pic', name: 'Screen', kind: 'attachment', url: PICTURE, placementId: null, featured: false },
  { id: 'r-tp', name: 'Intake form', kind: 'link', url: 'https://intake.example/form', placementId: 'ct-1', featured: false },
]
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
            value_props: [],
            resources: RESOURCES,
            touchpoints: [PLACEMENT],
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
vi.mock('@/components/blueprint/OwnerTagSelect', () => ({
  OwnerTagSelect: ({ value, ariaLabel, onChange }: { value: string; ariaLabel: string; onChange: (next: string) => void }) => (
    <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))
vi.mock('@/components/blueprint/RoleSelect', () => ({
  RoleSelect: () => null,
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'
import { CellResourcesTab } from '@/components/blueprint/CellResourcesTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResourceDraftsProvider } from '@/contexts/ResourceDraftsContext'

/**
 * The panel, reduced to what this suite is about: the draft above the form
 * and the tab, and Cancel or Save closing it. Closing unmounts the draft,
 * which is how the real panel discards it; "Reopen" mounts a fresh one.
 */
function Panel({ resources = RESOURCES }: { resources?: CellResource[] }) {
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
    )
  }
  return (
    <TooltipProvider>
      <ResourceDraftsProvider
        resources={resources}
        frame={null}
        touchpoints={[PLACEMENT]}
        openedPlacementId="ct-1"
      >
        <CellPanelEditor cellId="cell-1" placement={PLACEMENT} onDone={() => setOpen(false)} />
        <CellResourcesTab cellId="cell-1" resources={resources} touchpoints={[PLACEMENT]} />
      </ResourceDraftsProvider>
    </TooltipProvider>
  )
}

function openMenu(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
  fireEvent.mouseUp(trigger, { button: 0 })
  fireEvent.click(trigger)
}
async function chooseFromMenu(rowName: string, item: string) {
  openMenu(screen.getByLabelText(`More for ${rowName}`))
  await waitFor(() => expect(document.body.textContent).toContain(item))
  fireEvent.click(screen.getByText(item))
}
function pasteLink(url: string) {
  fireEvent.change(screen.getByLabelText('Paste a link'), { target: { value: url } })
  fireEvent.click(screen.getByText('Add'))
}
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const status = () => screen.getByText(/No changes|unsaved change/).textContent

beforeEach(() => {
  log.length = 0
  fail.on = null
  stored.clear()
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('a resource draft is part of the panel’s form', () => {
  it('enables Save and counts in the unsaved changes, one per list', async () => {
    render(<Panel />)
    expect(status()).toBe('No changes')
    expect(saveButton().disabled).toBe(true)

    pasteLink('youtu.be/walk')
    expect(status()).toBe('1 unsaved change')
    expect(saveButton().disabled).toBe(false)

    // A re-tag is two lists: the one it left and the one it joined.
    await chooseFromMenu('Tracker', 'Move to Intake portal')
    await waitFor(() => expect(status()).toBe('2 unsaved changes'))
    expect(log).toEqual([])
  })

  it('Cancel discards every resource draft, and nothing is written', async () => {
    render(<Panel />)
    pasteLink('youtu.be/walk')
    await chooseFromMenu('Tracker', 'Set as button')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByText('Reopen'))

    expect(status()).toBe('No changes')
    expect(screen.queryByText('youtu.be')).toBeNull()
    expect(screen.queryByLabelText('Featured')).toBeNull()
    expect(log).toEqual([])
  })

  it('Save writes the cell, the placement, the cell’s list, the placement’s, the flags, then the image', async () => {
    render(<Panel />)
    const textareas = () => Array.from(document.querySelectorAll('[data-panel-editor] textarea'))
    // The placement's Summary sits in the touchpoint block; the cell's is the other one.
    const block = document.querySelector('[data-touchpoint-block]')!
    fireEvent.change(block.querySelector('textarea')!, { target: { value: 'The screen.' } })
    fireEvent.change(textareas().find((one) => !block.contains(one))!, {
      target: { value: 'The moment it lands.' },
    })
    // Into the opened touchpoint by default.
    pasteLink('youtu.be/walk')
    await chooseFromMenu('Tracker', 'Rename…')
    const field = await waitFor(() => screen.getByLabelText('Rename Tracker') as HTMLInputElement)
    fireEvent.change(field, { target: { value: 'Delivery tracker' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await chooseFromMenu('youtu.be', 'Set as button')
    await chooseFromMenu('Screen', 'Set as featured image')

    fireEvent.click(saveButton())
    await waitFor(() => expect(log).toContain('frame'))
    expect(log).toEqual([
      'cell',
      'placement',
      'cell list',
      'list ct-1',
      // The new link's flag, by the id its list write just minted.
      'featured new-1 true',
      'frame',
    ])
    expect(setCellFeaturedImage).toHaveBeenCalledWith(client, { cellId: 'cell-1', imageUrl: PICTURE })
    // Saved, so the panel closed.
    await waitFor(() => expect(screen.getByText('Reopen')).toBeTruthy())
  })

  it('a failure part-way keeps what is unwritten, and the retry writes only that', async () => {
    render(<Panel />)
    fireEvent.change(document.querySelector('[data-panel-editor] input')!, {
      target: { value: 'Intake portal, Duty phone' },
    })
    await chooseFromMenu('Tracker', 'Rename…')
    const field = await waitFor(() => screen.getByLabelText('Rename Tracker') as HTMLInputElement)
    fireEvent.change(field, { target: { value: 'Delivery tracker' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    pasteLink('youtu.be/walk')
    expect(status()).toBe('3 unsaved changes')

    fail.on = 'list ct-1'
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText('list ct-1 refused')).toBeTruthy())
    expect(log).toEqual(['cell', 'cell list'])
    // The cell and its list landed; the placement's list is all that is left.
    expect(status()).toBe('1 unsaved change')
    expect(screen.getByLabelText('Intake portal').querySelector('[data-unsaved]')).not.toBeNull()

    fireEvent.click(saveButton())
    await waitFor(() => expect(log).toContain('list ct-1'))
    // Nothing was written twice: not the cell, not the cell's list.
    expect(log).toEqual(['cell', 'cell list', 'list ct-1'])
    expect(updatePlacementResources).toHaveBeenCalledTimes(2)
    expect(
      updatePlacementResources.mock.calls[1]![3].map((row: { id?: string | null }) => row.id ?? null),
    ).toEqual(['r-tp', null])
  })

  it('a placement the text no longer names has its list neither counted nor written', async () => {
    render(<Panel />)
    pasteLink('youtu.be/walk')
    expect(status()).toBe('1 unsaved change')
    fireEvent.change(document.querySelector('[data-panel-editor] input')!, {
      target: { value: 'Duty phone' },
    })
    // One change: the content. The placement's list goes with the placement.
    expect(status()).toBe('1 unsaved change')
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText('Reopen')).toBeTruthy())
    expect(log).toEqual(['cell'])
  })
})

describe('a stored link the sync would refuse', () => {
  const LEGACY: CellResource[] = [
    ...RESOURCES,
    { id: 'r-old', name: 'Old wiki', kind: 'link', url: 'http://legacy.example/old', placementId: null, featured: false },
  ]

  it('opens on no changes while nobody touches it', () => {
    render(<Panel resources={LEGACY} />)
    expect(status()).toBe('No changes')
  })

  it('a Save that would write its list is refused before anything is written', async () => {
    render(<Panel resources={LEGACY} />)
    const block = document.querySelector('[data-touchpoint-block]')!
    fireEvent.change(block.querySelector('textarea')!, { target: { value: 'The screen.' } })
    await chooseFromMenu('Tracker', 'Set as button')
    await chooseFromMenu('Old wiki', 'Rename…')
    const field = await waitFor(() => screen.getByLabelText('Rename Old wiki') as HTMLInputElement)
    fireEvent.change(field, { target: { value: 'Older wiki' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText(/Use an https link/)).toBeTruthy())
    // Not the cell, not the placement, not a flag: nothing.
    expect(log).toEqual([])
    expect(status()).toBe('3 unsaved changes')
  })
})
