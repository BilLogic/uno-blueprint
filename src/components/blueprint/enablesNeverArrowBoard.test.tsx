// @vitest-environment jsdom
/**
 * Neither arrangement of a scenario's board draws an `enables` as an arrow.
 *
 * `leads_to` is the drawn kind and `enables` the recorded one: a precondition
 * causes nothing, so an arrow for it would claim a handoff that never
 * happens. A path with one of each kind out of the same cell, beside a
 * second path the comparison needs; the overlay is stubbed to record the
 * edges it was handed, because jsdom lays nothing out and an absent stroke
 * would prove nothing.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const handed = vi.hoisted(() => [] as string[][])
vi.mock('@/components/blueprint/IntegratedDependencyArrows', () => ({
  IntegratedDependencyArrows: (props: {
    dependencies: Array<{ id: string }>
  }) => {
    handed.push(props.dependencies.map((dependency) => dependency.id))
    return null
  },
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: null, configured: false, canWrite: false }),
}))
vi.mock('@/hooks/useJumpToCell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useJumpToCell')>()),
  useJumpToCell: () => vi.fn(),
}))

import { MergedCompareGrid } from '@/components/blueprint/MergedCompareGrid'
import { StackedCompareGrid } from '@/components/blueprint/StackedCompareGrid'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BlueprintCellDetailProvider } from '@/contexts/BlueprintCellDetailContext'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { ScenarioBoardScopeContext } from '@/contexts/scenarioBoardScopeContext'
import { buildCompareModel } from '@/lib/compareSlots'
import type { BlueprintData } from '@/types/blueprint'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  handed.length = 0
})

const MAIN: BlueprintData = {
  path: {
    id: 'main',
    name: 'Main route',
    summary: null,
    note: null,
    kind: 'happy',
    status: 'live',
    scenarioId: 'scenario-goals',
  },
  lanes: [{ id: 'lane', name: 'Tutor', role: 'frontstage_actions', position: 0 }],
  steps: [
    { id: 's1', name: 'Sets a goal', position: 0 },
    { id: 's2', name: 'Reviews it', position: 1 },
    { id: 's3', name: 'Reports it', position: 2 },
  ],
  cells: ['Sets the goal', 'Reviews the goal', 'Reports the goal'].map((content, index) => ({
    id: `c${index + 1}`,
    lane_id: 'lane',
    step_id: `s${index + 1}`,
    content,
    frame: null,
    summary: null,
  })),
  dependencies: [
    { id: 'edge-leads-to', source_cell_id: 'c1', target_cell_id: 'c2', kind: 'leads_to' },
    { id: 'edge-enables', source_cell_id: 'c1', target_cell_id: 'c3', kind: 'enables' },
  ],
}

const DETOUR: BlueprintData = {
  ...MAIN,
  path: { ...MAIN.path, id: 'detour', name: 'Missed session', kind: 'variant' },
  lanes: [{ ...MAIN.lanes[0]!, id: 'detour-lane' }],
  cells: MAIN.cells.map((cell) => ({
    ...cell,
    id: `detour-${cell.id}`,
    lane_id: 'detour-lane',
  })),
  dependencies: [],
}

const blueprints: [BlueprintData, BlueprintData] = [MAIN, DETOUR]
const model = buildCompareModel(blueprints)

describe.each([
  ['Stacked', () => (
    <StackedCompareGrid blueprints={blueprints} model={model} scenarioName="Goal setting" />
  )],
  ['Merged', () => (
    <MergedCompareGrid blueprints={blueprints} model={model} scenarioName="Goal setting" />
  )],
])('%s', (_name, grid) => {
  it('hands the arrows the leads_to and never the enables', () => {
    render(
      <EntityDetailProvider>
        <BlueprintCellDetailProvider enabled>
          <ScenarioBoardScopeContext.Provider value>
            <TooltipProvider>{grid()}</TooltipProvider>
          </ScenarioBoardScopeContext.Provider>
        </BlueprintCellDetailProvider>
      </EntityDetailProvider>,
    )
    const all = handed.flat()
    expect(all).toContain('edge-leads-to')
    expect(all).not.toContain('edge-enables')
  })
})
