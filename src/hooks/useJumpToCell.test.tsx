// @vitest-environment jsdom
/**
 * Going to a cell on another path: the scenario opens on that path when the
 * board is not showing it, and is left alone when it is.
 *
 * Stubbed at the seams the hook calls through — the editor's `openScenario`,
 * the path store's selection, the path memory and the focus pipeline — so
 * what is asserted is the order of calls a reader's click turns into, which
 * is the whole of the hook.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({
  calls: [] as string[],
  selectedScenarioId: 'scenario-goals' as string | null,
  selectedPaths: ['path-main'] as string[],
  editor: true,
}))

vi.mock('@/contexts/EditorContext', () => ({
  useOpenScenarioOptional: () =>
    seams.editor
      ? (scenarioId: string) => seams.calls.push(`open ${scenarioId}`)
      : null,
  useSelectedScenarioIdOptional: () => seams.selectedScenarioId,
}))
vi.mock('@/contexts/PathSelectionContext', () => ({
  usePathSelectionContextOptional: () => ({
    getSelectedPathIds: () => seams.selectedPaths,
  }),
}))
vi.mock('@/lib/pathMemory', () => ({
  writeLastViewedPath: (scenarioId: string, pathId: string) =>
    seams.calls.push(`remember ${scenarioId} ${pathId}`),
}))
vi.mock('@/lib/openScenarioSeam', () => ({
  activateBaseView: () => seams.calls.push('base view'),
}))
vi.mock('@/lib/canvasFocusCells', () => ({
  requestScenarioCellFocus: (
    scenarioId: string,
    cellId: string,
    opts: { openDetail: boolean },
  ) =>
    seams.calls.push(
      `focus ${scenarioId} ${cellId}${opts.openDetail ? ' +panel' : ''}`,
    ),
}))

import { useJumpToCell } from '@/hooks/useJumpToCell'

afterEach(() => {
  seams.calls.length = 0
  seams.selectedScenarioId = 'scenario-goals'
  seams.selectedPaths = ['path-main']
  seams.editor = true
})

const jumpWith = () => renderHook(() => useJumpToCell()).result.current

describe('going to a cell on another path', () => {
  it('opens another scenario on the far cell’s path, then flies there and opens its panel', () => {
    jumpWith()!({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
    expect(seams.calls).toEqual([
      'remember scenario-report path-report',
      'open scenario-report',
      'focus scenario-report cell-report +panel',
    ])
  })

  it('switches this scenario to a path the board is not showing', () => {
    jumpWith()!({
      cellId: 'cell-detour',
      pathId: 'path-detour',
      scenarioId: 'scenario-goals',
    })
    expect(seams.calls).toEqual([
      'remember scenario-goals path-detour',
      'open scenario-goals',
      'focus scenario-goals cell-detour +panel',
    ])
  })

  it('leaves the board alone when the far cell’s path is already on it', () => {
    seams.selectedPaths = ['path-main', 'path-detour']
    jumpWith()!({
      cellId: 'cell-detour',
      pathId: 'path-detour',
      scenarioId: 'scenario-goals',
    })
    expect(seams.calls).toEqual([
      'base view',
      'focus scenario-goals cell-detour +panel',
    ])
  })

  it('offers no jump where there is no editor to navigate with', () => {
    seams.editor = false
    expect(jumpWith()).toBeNull()
  })
})
