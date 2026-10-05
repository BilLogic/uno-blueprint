// @vitest-environment jsdom
/**
 * Which budget a NEW cell is measured against, and what decides it.
 *
 * A touchpoint-lane cell holds a list of labels and every other lane holds a
 * sentence, so the two are measured against two budgets. An existing cell
 * already asks the question with the lane's role, the way the canvas and the
 * band do. A draft asked it with the lane's NAME alone — and `lanes.name` is
 * free-form, in any language, so a new cell in a touchpoint lane called
 * anything but one of the legacy names got the sentence budget. The draft now
 * carries the role of the lane it was opened on.
 *
 * The template's default gives both kinds the same number, which is correct
 * for a template and makes the kind invisible on screen. So prose keeps the
 * template's own budget here and only the touchpoint budget is narrowed: the
 * one number that differs is the one the kind decides.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { templateDefaultCellBudget, resolveDeploymentConfig } from '@/deploymentConfig'
import { configureCellBudget } from '@/lib/cellContentLimits'
import {
  BACKSTAGE_TOUCHPOINTS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
} from '@/lib/laneRoles'

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: null, configured: false, canWrite: true }),
}))
// A draft has no row, so none of the editor's per-cell reads have anything to
// return; the board it was opened from is not needed either, because the
// draft names its own lane.
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => null,
}))
vi.mock('@/hooks/useBlueprintCell', () => ({
  useBlueprintCell: () => null,
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
  OwnerTagSelect: ({ value, ariaLabel }: { value: string; ariaLabel: string }) => (
    <input aria-label={ariaLabel} value={value} readOnly />
  ),
}))
vi.mock('@/components/blueprint/StatusSelect', () => ({
  StatusSelect: ({ value }: { value: string }) => (
    <select aria-label="Status" value={value} onChange={() => {}}>
      <option value={value}>{value}</option>
    </select>
  ),
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'

/** Narrower than any sentence below, so only a touchpoint lane is over it. */
const TOUCHPOINT_BUDGET = 24

/** Three touchpoints in one cell: past the touchpoint budget, well inside prose. */
const THREE_TOUCHPOINTS = 'Online portal, Confirmation email, Phone line'

beforeEach(() => {
  configureCellBudget({
    prose: { ...templateDefaultCellBudget.prose },
    touchpointLabels: { target: TOUCHPOINT_BUDGET, warning: TOUCHPOINT_BUDGET },
  })
})

afterEach(() => {
  configureCellBudget(resolveDeploymentConfig().cellBudget)
  cleanup()
})

/**
 * A cell being created in the named lane, with the same text typed into its
 * Content field, which is the first input the form draws.
 */
function typeIntoDraftIn(lane: { name: string; role?: string | null }) {
  render(
    <CellPanelEditor
      cellId={null}
      draft={{
        pathId: 'path-1',
        laneId: 'lane-1',
        stepId: 'step-1',
        laneName: lane.name,
        laneRole: lane.role ?? null,
        stepName: 'Hears about the service',
        stepIndex: 0,
      }}
      onDone={() => {}}
    />,
  )
  const input = document.querySelector('input')
  expect(input, 'the editor drew no Content field').toBeTruthy()
  fireEvent.change(input!, { target: { value: THREE_TOUCHPOINTS } })
}

/** The note under the Content field, or null when the text fits. */
function guidance(): string | null {
  return screen.queryByRole('status')?.textContent ?? null
}

describe('a new cell in a touchpoint lane gets the touchpoint budget', () => {
  it('is decided by the role the lane carries, whatever the lane is called', () => {
    typeIntoDraftIn({ name: 'Tools the applicant meets', role: FRONTSTAGE_TOUCHPOINTS_ROLE })
    expect(guidance()).toContain(`${TOUCHPOINT_BUDGET} is the canvas budget`)
  })

  it('covers the backstage role too', () => {
    typeIntoDraftIn({ name: 'Systems', role: BACKSTAGE_TOUCHPOINTS_ROLE })
    expect(guidance()).toContain(`${TOUCHPOINT_BUDGET} is the canvas budget`)
  })

  it('still reaches a lane with no role by its legacy name', () => {
    for (const name of ['Front Stage Touchpoints', 'Front Stage Tech', 'Back Stage Tech']) {
      typeIntoDraftIn({ name })
      expect(guidance(), name).toContain(`${TOUCHPOINT_BUDGET} is the canvas budget`)
      cleanup()
    }
  })
})

describe('a new cell in any other lane gets the prose budget', () => {
  it('gives an actor lane the prose budget', () => {
    typeIntoDraftIn({ name: 'Applicant', role: CUSTOMER_ACTIONS_ROLE })
    expect(guidance()).toBeNull()
  })

  it('lets the role outrank a name that happens to be a legacy touchpoint name', () => {
    // The role is the row's own statement of what the lane is; the name table
    // is only for rows that never made one.
    typeIntoDraftIn({ name: 'Front Stage Tech', role: CUSTOMER_ACTIONS_ROLE })
    expect(guidance()).toBeNull()
  })

  it('gives a lane with no role and no known name the prose budget', () => {
    typeIntoDraftIn({ name: 'Something nobody has classified' })
    expect(guidance()).toBeNull()
  })
})
