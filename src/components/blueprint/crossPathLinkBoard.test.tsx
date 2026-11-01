// @vitest-environment jsdom
/**
 * Both arrangements of a scenario's board mark a link between two of its
 * paths on the cells at its ends, and neither draws it as an arrow.
 *
 * Two paths of one scenario, with a `leads_to` from a cell on the first to a
 * cell on the second. Stacked, each path is its own band; Merged, every
 * path's cells share one container — which is the arrangement where the arrow
 * overlay's DOM sweep could find both ends of a link between paths. The
 * overlay is stubbed to record the edges it was handed, because jsdom lays
 * nothing out and an absent stroke would prove nothing.
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
vi.mock('@/hooks/useJumpToCell', () => ({ useJumpToCell: () => vi.fn() }))

import { MergedCompareGrid } from '@/components/blueprint/MergedCompareGrid'
import { StackedCompareGrid } from '@/components/blueprint/StackedCompareGrid'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { buildCompareModel } from '@/lib/compareSlots'
import type { BlueprintData, BlueprintRemoteCell } from '@/types/blueprint'

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

const SCENARIO = 'scenario-goals'

function board(
  pathId: string,
  name: string,
  kind: 'happy' | 'variant',
  content: [string, string],
): BlueprintData {
  return {
    path: {
      id: pathId,
      name,
      summary: null,
      note: null,
      kind,
      status: 'live',
      scenarioId: SCENARIO,
    },
    lanes: [{ id: `${pathId}-lane`, name: 'Tutor', role: 'frontstage_actions', position: 0 }],
    steps: [
      { id: `${pathId}-s1`, name: 'Sets a goal', position: 0 },
      { id: `${pathId}-s2`, name: 'Reviews it', position: 1 },
    ],
    cells: content.map((text, index) => ({
      id: `${pathId}-c${index + 1}`,
      lane_id: `${pathId}-lane`,
      step_id: `${pathId}-s${index + 1}`,
      content: text,
      frame: null,
      summary: null,
    })),
    dependencies: [
      {
        id: `${pathId}-in-path`,
        source_cell_id: `${pathId}-c1`,
        target_cell_id: `${pathId}-c2`,
        kind: 'leads_to',
      },
    ],
  }
}

function remote(of: BlueprintData, cellId: string): BlueprintRemoteCell {
  const cell = of.cells.find((entry) => entry.id === cellId)!
  return {
    id: cell.id,
    content: cell.content,
    laneName: 'Tutor',
    stepName: 'Reviews it',
    pathId: of.path.id,
    pathName: of.path.name,
    scenarioId: SCENARIO,
    scenarioName: 'Goal setting',
    phaseName: 'Term',
  }
}

const MAIN_BASE = board('main', 'Main route', 'happy', ['Sets the goal', 'Reviews the goal'])
const DETOUR_BASE = board('detour', 'Missed session', 'variant', ['Misses it', 'Books a catch-up'])

const CROSS = {
  id: 'edge-cross',
  source_cell_id: 'main-c2',
  target_cell_id: 'detour-c2',
  kind: 'leads_to' as const,
}

const MAIN: BlueprintData = {
  ...MAIN_BASE,
  dependencies: [...MAIN_BASE.dependencies, CROSS],
  remoteCells: [remote(DETOUR_BASE, 'detour-c2')],
}
const DETOUR: BlueprintData = {
  ...DETOUR_BASE,
  dependencies: [...DETOUR_BASE.dependencies, CROSS],
  remoteCells: [remote(MAIN_BASE, 'main-c2')],
}

const blueprints = [MAIN, DETOUR]
const model = buildCompareModel([MAIN, DETOUR])

function markers(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-cross-path-link]')]
    .map((marker) => marker.textContent)
    .sort()
}

describe.each([
  ['Stacked', () => (
    <StackedCompareGrid blueprints={blueprints} model={model} scenarioName="Goal setting" />
  )],
  ['Merged', () => (
    <MergedCompareGrid blueprints={blueprints} model={model} scenarioName="Goal setting" />
  )],
])('%s', (_name, grid) => {
  it('marks the link on the cells at both its ends', () => {
    const { container } = render(
      <EntityDetailProvider>
        <TooltipProvider>{grid()}</TooltipProvider>
      </EntityDetailProvider>,
    )
    expect(markers(container)).toEqual([
      'Comes from Main route',
      'Continues in Missed session',
    ])
  })

  it('hands the arrows the in-path links and never the one between paths', () => {
    render(
      <EntityDetailProvider>
        <TooltipProvider>{grid()}</TooltipProvider>
      </EntityDetailProvider>,
    )
    const all = handed.flat()
    expect(all).toContain('main-in-path')
    expect(all).not.toContain('edge-cross')
  })
})
