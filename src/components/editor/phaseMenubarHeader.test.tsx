// @vitest-environment jsdom
/**
 * The scenario header: ONE trail, and no query-result message.
 *
 * `ServiceOverviewHeader` owns the query and may print its failure. This bar
 * does not — identity is props. The trail carries both crumbs: the phase,
 * which is the navigation back to it on the overview, and the scenario, which
 * IS the title. There is no second title beside the trail, so the name of the
 * thing you are looking at is printed once.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhaseMenubarHeader } from '@/components/editor/PhaseMenubarHeader'
import { BLUEPRINT_MENUBAR_PHASE_CRUMB_CLASS } from '@/components/editor/menubarHeaderLayout'
import { COVER_DISCONNECTED_STATUS } from '@/components/cover/CoverPage'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { WORKSPACE_BREADCRUMB_LABEL, type NavItem } from '@/types/nav'

const openDetail = vi.hoisted(() => vi.fn())
const goHome = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/EditorContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/EditorContext')>()),
  useEditor: () => ({
    getScenarioDisplayViewType: () => 'stacked',
    setScenarioDisplayViewType: () => {},
    openDetail,
    goHome,
  }),
}))

const PHASE: NavItem = { id: 'phase-1', index: 0, label: 'Onboarding' }
const SCENARIO: NavItem = {
  id: 'scenario-1',
  index: 1,
  label: 'Employment & Access',
  parentId: 'phase-1',
  summary: 'How tutors join the service.',
}

afterEach(() => {
  cleanup()
  openDetail.mockClear()
  goHome.mockClear()
})

/**
 * The scenario (or phase) bar, inside the provider the title affordance needs.
 */
function mountHeader(slide: NavItem) {
  return render(
    <EntityDetailProvider>
      <PhaseMenubarHeader slide={slide} slides={[PHASE, SCENARIO]} />
    </EntityDetailProvider>,
  )
}

describe('the scenario header', () => {
  it('does not print a query-result message', () => {
    mountHeader(SCENARIO)
    expect(screen.queryByText(COVER_DISCONNECTED_STATUS)).toBeNull()
    expect(screen.queryByText('No database connected')).toBeNull()
    expect(screen.getByText('How tutors join the service.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Supabase/i)
  })

  it('holds both crumbs and a separator in one trail', () => {
    const { container } = mountHeader(SCENARIO)

    const trail = screen.getByRole('navigation', { name: 'breadcrumb' })
    // One trail on the bar, and everything in the trail is in THAT trail.
    expect(container.querySelectorAll('nav[aria-label="breadcrumb"]')).toHaveLength(1)
    expect(trail.querySelectorAll('[data-slot="breadcrumb-item"]')).toHaveLength(2)
    expect(trail.querySelectorAll('[data-slot="breadcrumb-separator"]')).toHaveLength(1)
    expect(trail.textContent).toContain('Onboarding')
    expect(trail.textContent).toContain('Employment & Access')
    // The workspace crumb is this template's own name, and stays out.
    expect(trail.textContent).not.toContain(WORKSPACE_BREADCRUMB_LABEL)
  })

  it('prints the scenario name once, as the current crumb', () => {
    const { container } = mountHeader(SCENARIO)

    expect(screen.getAllByText('Employment & Access')).toHaveLength(1)

    const trail = screen.getByRole('navigation', { name: 'breadcrumb' })
    const title = container.querySelector('[data-entity-title-affordance]')
    // The "View details" affordance survived the move, ON the current crumb.
    expect(title).toBeTruthy()
    expect(title?.textContent).toBe('Employment & Access')
    expect(trail.contains(title!)).toBe(true)
  })

  it('sizes both crumbs alike and caps the phase at the shared width', () => {
    const { container } = mountHeader(SCENARIO)

    // One rung for both crumbs, and it is the vendored list's `sm` — 13px on
    // the type ladder. The `text-xs` override here is what made the phase a 12px
    // word beside a 14px title.
    const list = container.querySelector('[data-slot="breadcrumb-list"]')
    const sizes = list?.className.split(/\s+/) ?? []
    expect(sizes).toContain('text-sm')
    expect(sizes).not.toContain('text-xs')

    const phase = screen.getByRole('button', { name: 'Onboarding' })
    expect(phase.className.split(/\s+/)).toEqual(
      expect.arrayContaining(BLUEPRINT_MENUBAR_PHASE_CRUMB_CLASS.split(' ')),
    )
    expect(phase.getAttribute('title')).toBe('Onboarding')
  })

  it('marks the current crumb as the current page', () => {
    const { container } = mountHeader(SCENARIO)

    const current = container.querySelector('[aria-current="page"]')
    expect(current).toBeTruthy()
    expect(current?.textContent).toBe('Employment & Access')
  })

  it('opens that phase from the phase crumb', () => {
    mountHeader(SCENARIO)

    fireEvent.click(screen.getByRole('button', { name: 'Onboarding' }))
    expect(openDetail).toHaveBeenCalledTimes(1)
    expect(openDetail).toHaveBeenCalledWith(PHASE.id)
  })

  it('leaves the phase header without a trail', () => {
    mountHeader(PHASE)
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull()
    expect(screen.getByText('Onboarding')).toBeTruthy()
  })
})
