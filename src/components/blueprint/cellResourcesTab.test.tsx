// @vitest-environment jsdom
/**
 * The Resources tab in both modes: the same groups, editable in Edit mode
 * and listed without controls in View mode, plus the logos a cell inherits
 * from its touchpoints, which are never rows of its own.
 */
import { useEffect } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellResourcesTab } from '@/components/blueprint/CellResourcesTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ResourceDraftsProvider,
  useResourceDraftsOptional,
} from '@/contexts/ResourceDraftsContext'
import { planResourceSave, type ResourceDraftState } from '@/lib/resourceDrafts'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

const rpc = vi.fn()
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: { rpc }, canWrite: true }),
}))
let canvasMode = 'design'
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => canvasMode }))

const LOGO = '/touchpoint-logos/example-logo.png'
const placedOn: CellTouchpoint = {
  id: 'p-1',
  touchpointId: 'tp-1',
  name: 'Intake App',
  kind: 'app',
  iconUrl: LOGO,
  summary: null,
  role: null,
}

const row = (over: Partial<CellResource> & { id: string; url: string }): CellResource => ({
  name: 'Tracker',
  kind: 'link',
  placementId: null,
  featured: false,
  ...over,
})
const RESOURCES: CellResource[] = [
  row({ id: 'r-cell', url: 'https://tracker.dev/1' }),
  row({ id: 'r-tp', url: 'https://example.com/intake', name: 'Intake form', placementId: 'p-1' }),
]

let latest: ResourceDraftState | null = null
function Probe() {
  const state = useResourceDraftsOptional()?.state ?? null
  useEffect(() => {
    latest = state
  })
  return null
}

function mount(
  resources: CellResource[],
  touchpoints: CellTouchpoint[] = [placedOn],
  frame: string | null = null,
) {
  return render(
    <TooltipProvider>
      <ResourceDraftsProvider resources={resources} frame={frame} touchpoints={touchpoints}>
        <CellResourcesTab cellId="cell-1" resources={resources} touchpoints={touchpoints} />
        <Probe />
      </ResourceDraftsProvider>
    </TooltipProvider>,
  )
}

const inherited = () =>
  document.querySelector('[aria-label="Inherited from this cell\'s touchpoints"]')

beforeEach(() => {
  canvasMode = 'design'
  latest = null
  rpc.mockReset()
})
afterEach(cleanup)

describe('View mode lists the same groups, without controls', () => {
  it('heads This cell, then the touchpoint by name, each row a link out', () => {
    canvasMode = 'view'
    const { container, getByLabelText } = mount(RESOURCES)
    const groups = [...container.querySelectorAll('[data-resource-group]')]
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'This cell',
      'Intake App',
    ])
    expect(getByLabelText('This cell').querySelector('a')?.getAttribute('href')).toBe(
      'https://tracker.dev/1',
    )
    expect(getByLabelText('Intake App').textContent).toContain('Intake form')
    // No editor: no menu, no handle, no paste field, no upload.
    expect(container.querySelector('[data-resource-row]')).toBeNull()
    expect(container.querySelector('button[aria-label^="More for"]')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
  })

  it('leaves out an owner with nothing to list', () => {
    canvasMode = 'view'
    const { container } = mount([RESOURCES[1]!])
    const groups = [...container.querySelectorAll('[data-resource-group]')]
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Intake App'])
  })

  it('says so when the cell points at nothing', () => {
    canvasMode = 'view'
    const { container } = mount([], [{ ...placedOn, iconUrl: null }])
    expect(container.textContent).toContain('No resources linked to this cell.')
  })
})

describe('a touchpoint’s logo is listed on the cell, inherited and read-only', () => {
  it('in Edit mode: listed with one control and never drafted as a row', () => {
    const { container, queryByLabelText } = mount(RESOURCES)
    expect(inherited()?.textContent).toContain('Intake App')
    expect(inherited()?.querySelector('img')?.getAttribute('src')).toBe(LOGO)
    expect(inherited()?.querySelectorAll('button')).toHaveLength(1)
    expect(queryByLabelText('More for Intake App')).toBeNull()
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(2)
    expect(latest!.drafts.rows.map((entry) => entry.url)).not.toContain(LOGO)
  })

  it('in Edit mode: setting the logo as the featured image is a draft, marked unsaved', () => {
    const { getByLabelText } = mount(RESOURCES)
    fireEvent.click(getByLabelText('Set the Intake App logo as the featured image'))
    expect(rpc).not.toHaveBeenCalled()
    expect(planResourceSave(latest!.baseline, latest!.drafts).frame).toEqual({ url: LOGO })
    expect(inherited()?.querySelector('[data-unsaved]')?.textContent).toContain('Unsaved')
    expect(
      (getByLabelText('The Intake App logo is the featured image') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('in Edit mode: a logo that already is the frame says so and offers nothing', () => {
    const { getByLabelText } = mount(RESOURCES, [placedOn], LOGO)
    const control = getByLabelText('The Intake App logo is the featured image') as HTMLButtonElement
    expect(control.disabled).toBe(true)
    expect(inherited()?.querySelector('[data-unsaved]')).toBeNull()
  })

  it('in View mode: listed on a cell that points at nothing else', () => {
    canvasMode = 'view'
    const { container } = mount([], [placedOn])
    expect(container.textContent).not.toContain('No resources linked to this cell.')
    expect(inherited()?.textContent).toContain('Intake App')
    expect(inherited()?.querySelector('button')).toBeNull()
  })

  it('a touchpoint with no logo lends nothing', () => {
    canvasMode = 'view'
    mount([], [{ ...placedOn, iconUrl: null }])
    expect(inherited()).toBeNull()
  })
})
