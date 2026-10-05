// @vitest-environment jsdom
/**
 * The touchpoint block: what a touchpoint cell's editor adds to the regular
 * cell layout, and nothing more.
 *
 * A touchpoint cell opens the same editor as any other cell, with one block
 * directly under Content for the placement it was opened on: the touchpoint as
 * a badge, then the placement's Summary and Role.
 * Every label is the one the interface-schema map binds to its column, so the
 * block carries no heading or copy of its own to explain whose fields they are.
 *
 * Its resources are not here. They stay readable in the Resources tab, which
 * lists a placement's rows beside the cell's own.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

const { board, nameOnly } = vi.hoisted(() => ({
  board: { touchpoints: [] as CellTouchpoint[], resources: [] as CellResource[] },
  nameOnly: { data: [] as { id: string; name: string }[] },
}))

vi.mock('@/lib/cellContentMutations', () => ({ updateCellContent: vi.fn() }))
vi.mock('@/lib/cellSpecMutations', () => ({ updateCellSpec: vi.fn() }))
vi.mock('@/lib/authoringRpc', () => ({ upsertCell: vi.fn() }))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
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
            resources: board.resources,
            touchpoints: board.touchpoints,
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
  useNameOnlyPlacements: () => ({ status: 'ready', data: nameOnly.data }),
  useTouchpointEntry: () => ({ status: 'loading' }),
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

const placementResource: CellResource = {
  id: 'res-1',
  placementId: 'ct-1',
  name: 'Portal guide',
  url: 'https://example.com/guide',
  kind: 'link',
  featured: false,
}

function block(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-touchpoint-block]')
  expect(found, 'the touchpoint block did not render').toBeTruthy()
  return found!
}

function precedes(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}

beforeEach(() => {
  board.touchpoints = []
  board.resources = []
  nameOnly.data = []
})

afterEach(cleanup)

describe('the touchpoint block', () => {
  it('names the touchpoint as a badge, then Summary and Role', () => {
    board.touchpoints = [placement()]
    render(
      <CellPanelEditor cellId="cell-1" placement={placement()} onDone={() => {}} />,
    )

    const inBlock = within(block())
    const label = inBlock.getByText('Touchpoint')
    const badge = inBlock.getByTitle('Intake portal')
    const summary = inBlock.getByText('Summary')
    const role = inBlock.getByText('Role')

    expect(precedes(label, badge)).toBe(true)
    expect(precedes(badge, summary)).toBe(true)
    expect(precedes(summary, role)).toBe(true)
    // A registry-backed placement offers its entry's own editor, in the badge row.
    expect(inBlock.getByRole('button', { name: 'Edit touchpoint' })).toBeTruthy()
  })

  it('sits directly under Content, ahead of the cell’s own Summary', () => {
    board.touchpoints = [placement()]
    render(
      <CellPanelEditor cellId="cell-1" placement={placement()} onDone={() => {}} />,
    )

    const content = screen.getByText('Content')
    const [blockSummary, cellSummary] = screen.getAllByText('Summary')
    expect(block().contains(blockSummary)).toBe(true)
    expect(precedes(content, block())).toBe(true)
    expect(precedes(block(), cellSummary)).toBe(true)
  })

  it('carries no explanatory copy and no resources list of its own', () => {
    // The placement has a resource; the Resources tab lists it, not this block.
    board.touchpoints = [placement()]
    board.resources = [placementResource]
    render(
      <CellPanelEditor cellId="cell-1" placement={placement()} onDone={() => {}} />,
    )

    expect(screen.queryByText(/” at this step/)).toBeNull()
    expect(screen.queryByText(/own words here/)).toBeNull()
    expect(screen.queryByText('Save resources')).toBeNull()
    expect(screen.queryByText('Portal guide')).toBeNull()
  })

  it('puts the opened name-only placement’s registry card in its block', () => {
    const named = placement({ touchpointId: null, kind: null, name: 'Duty phone' })
    board.touchpoints = [named]
    nameOnly.data = [
      { id: 'ct-1', name: 'Duty phone' },
      { id: 'ct-2', name: 'Radio' },
    ]
    render(<CellPanelEditor cellId="cell-1" placement={named} onDone={() => {}} />)

    const opened = document.querySelector('[data-name-only-placement="Duty phone"]')
    const other = document.querySelector('[data-name-only-placement="Radio"]')
    expect(within(block()).getByTitle('Duty phone')).toBeTruthy()
    expect(block().contains(opened)).toBe(true)
    // Every other name-only card keeps its place above the form.
    expect(other).toBeTruthy()
    expect(block().contains(other)).toBe(false)
    expect(precedes(other!, block())).toBe(true)
  })
})

describe('the Content hint about renaming a touchpoint', () => {
  const hint = /Changing a touchpoint’s name here removes its Summary, Role and resources at this step/

  it('shows when the cell holds a touchpoint, and describes the Content control', () => {
    board.touchpoints = [placement()]
    render(
      <CellPanelEditor cellId="cell-1" placement={placement()} onDone={() => {}} />,
    )

    const note = screen.getByText(hint)
    const content = document.querySelector('[data-panel-editor] input')
    expect(note.id).toBeTruthy()
    expect(content?.getAttribute('aria-describedby')).toBe(note.id)
  })

  it('shows on a cell holding a touchpoint even when opened on the cell itself', () => {
    board.touchpoints = [placement()]
    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)

    expect(screen.getByText(hint)).toBeTruthy()
  })

  it('stays away from a cell holding none', () => {
    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)

    expect(screen.queryByText(hint)).toBeNull()
    expect(
      document.querySelector('[data-panel-editor] input')?.hasAttribute('aria-describedby'),
    ).toBe(false)
  })
})
