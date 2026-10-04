// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileNavSheet } from '@/components/mobile/MobileNavSheet'
import type { NavItem } from '@/types/nav'
import type { Slice } from '@/types/database'

// Render tests for the redesigned mobile drawer: rail + panel. The pinned
// contract from the drawer it replaced survives — the sheet only reports
// what was tapped (slice, phase, scenario, surface, expansion); the shell
// owns what a tap means for the visible surface. New in the redesign: the
// accordion renders scenarios only for expanded phases, driven by
// EditorContext's expandedPhaseIds rather than always-expanded.

const nav = (over: Partial<NavItem> & { id: string; label: string }): NavItem =>
  ({
    parentId: null,
    index: 0,
    summary: '',
    ...over,
  }) as NavItem

const phases = [
  nav({ id: 'ph-1', label: 'Application', index: 1 }),
  nav({ id: 'ph-2', label: 'Onboarding', index: 2 }),
]
const scenarios = [
  nav({ id: 'sc-1', label: 'Discovery', parentId: 'ph-1' }),
  nav({ id: 'sc-2', label: 'Tech Setup', parentId: 'ph-2' }),
]
const slides = [...phases, ...scenarios]
const scenariosByPhase = new Map<string, NavItem[]>([
  ['ph-1', [scenarios[0]]],
  ['ph-2', [scenarios[1]]],
])
const slices = [
  {
    id: 'sl-1',
    title: 'Field Crew lane: intake',
    kind: 'lane',
  } as Slice,
]
const allExpanded = new Set(['ph-1', 'ph-2'])

function renderSheet(over: Partial<Parameters<typeof MobileNavSheet>[0]> = {}) {
  const onSelectSlice = vi.fn()
  const onSelectScenario = vi.fn()
  const onSurfaceChange = vi.fn()
  const onPhaseExpandedChange = vi.fn()
  render(
    <MobileNavSheet
      open
      onOpenChange={() => {}}
      surface="blueprints"
      onSurfaceChange={onSurfaceChange}
      slices={slices}
      slicesLoading={false}
      phases={phases}
      scenariosByPhase={scenariosByPhase}
      slides={slides}
      phasesLoading={false}
      expandedPhaseIds={allExpanded}
      onPhaseExpandedChange={onPhaseExpandedChange}
      selectedPhaseId={null}
      selectedScenarioId={null}
      onSelectSlice={onSelectSlice}
      onSelectScenario={onSelectScenario}
      {...over}
    />,
  )
  return {
    onSelectSlice,
    onSelectScenario,
    onSurfaceChange,
    onPhaseExpandedChange,
  }
}

afterEach(cleanup)

describe('MobileNavSheet routing', () => {
  it('a slice row (Slices surface) reports the slice and only the slice', () => {
    const h = renderSheet({ surface: 'slices' })
    screen.getByText('Field Crew lane: intake').click()
    expect(h.onSelectSlice).toHaveBeenCalledWith('sl-1')
    expect(h.onSelectScenario).not.toHaveBeenCalled()
  })

  it('a phase label is an accordion header: it toggles and never navigates', () => {
    const h = renderSheet({ expandedPhaseIds: new Set<string>() })
    screen.getByText(/Application/).click()
    expect(h.onPhaseExpandedChange).toHaveBeenCalledWith('ph-1', true)
    expect(h.onSelectScenario).not.toHaveBeenCalled()
    expect(h.onSelectSlice).not.toHaveBeenCalled()
  })

  it('tapping an expanded phase label collapses it', () => {
    const h = renderSheet({ expandedPhaseIds: new Set(['ph-1']) })
    screen.getByText(/Application/).click()
    expect(h.onPhaseExpandedChange).toHaveBeenCalledWith('ph-1', false)
  })

  it('a scenario row reports the scenario and only the scenario', () => {
    const h = renderSheet()
    screen.getByText('Discovery').click()
    expect(h.onSelectScenario).toHaveBeenCalledWith('sc-1')
    expect(h.onSelectSlice).not.toHaveBeenCalled()
  })

  it('marks the selected scenario with aria-current', () => {
    renderSheet({ selectedScenarioId: 'sc-2' })
    const row = screen.getByText('Tech Setup').closest('button')
    expect(row?.getAttribute('aria-current')).toBe('true')
  })

  it('marks the selected phase only while no scenario is selected', () => {
    renderSheet({ selectedPhaseId: 'ph-1', selectedScenarioId: 'sc-1' })
    const phaseRow = screen.getByText(/Application/).closest('button')
    expect(phaseRow?.getAttribute('aria-current')).toBeNull()
  })
})

describe('MobileNavSheet accordion and rail', () => {
  it('collapsed phases hide their scenarios', () => {
    renderSheet({ expandedPhaseIds: new Set(['ph-1']) })
    expect(screen.getByText('Discovery')).toBeDefined()
    expect(screen.queryByText('Tech Setup')).toBeNull()
  })

  it('the caret reports an expansion change and nothing else', () => {
    const h = renderSheet({ expandedPhaseIds: new Set(['ph-1']) })
    screen.getByLabelText('Expand Onboarding').click()
    expect(h.onPhaseExpandedChange).toHaveBeenCalledWith('ph-2', true)
    screen.getByLabelText('Collapse Application').click()
    expect(h.onPhaseExpandedChange).toHaveBeenCalledWith('ph-1', false)
    expect(h.onSelectScenario).not.toHaveBeenCalled()
  })

  it('the rail is a radio: tapping Slices reports the surface change', () => {
    const h = renderSheet()
    const slicesButton = screen.getByRole('button', { name: 'Slices' })
    expect(slicesButton.getAttribute('aria-pressed')).toBe('false')
    slicesButton.click()
    expect(h.onSurfaceChange).toHaveBeenCalledWith('slices')
    expect(
      screen
        .getByRole('button', { name: 'Blueprints' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('the blueprints surface does not render slice rows', () => {
    renderSheet({ surface: 'blueprints' })
    expect(screen.queryByText('Field Crew lane: intake')).toBeNull()
  })

  it('slices surface groups rows under the kind section', () => {
    renderSheet({ surface: 'slices' })
    expect(screen.getByText('Lane')).toBeDefined()
    expect(screen.getByText('Field Crew lane: intake')).toBeDefined()
  })

  it('a loading slice list shows skeleton rows, not the empty message', () => {
    renderSheet({ surface: 'slices', slices: [], slicesLoading: true })
    expect(screen.queryByText('No saved slices yet.')).toBeNull()
  })

  it('a truly empty slice list shows the empty message', () => {
    renderSheet({ surface: 'slices', slices: [], slicesLoading: false })
    expect(screen.getByText('No saved slices yet.')).toBeDefined()
  })

  /*
    The phase list draws the same distinction the slice list does.

    It had no empty state at all before, because it could not be empty: a
    read with no rows fell back to the template's bundled sample. The drawer opens
    itself on first load, so on a connected phone that fallback was the whole
    first screen — this template's phase names, under the deployment's name, every
    time.
  */
  it('a loading phase list shows skeleton rows, not the empty message', () => {
    renderSheet({ surface: 'blueprints', phases: [], phasesLoading: true })
    expect(screen.queryByText('No phases in this workspace yet.')).toBeNull()
  })

  it('a truly empty phase list shows the empty message', () => {
    renderSheet({ surface: 'blueprints', phases: [], phasesLoading: false })
    expect(screen.getByText('No phases in this workspace yet.')).toBeDefined()
  })
})
