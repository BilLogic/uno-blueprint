// @vitest-environment jsdom
/**
 * Going to a cell on another path: the path joins what the board shows —
 * never replaces it — and nothing is written to the phone's path memory.
 *
 * Stubbed at the seams the hook calls through — the editor's `openScenario`,
 * the path store and the focus pipeline — so what is asserted is the calls a
 * reader's click turns into, which is the whole of the hook.
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
      ? (scenarioId: string, opts: { withPath?: string }) =>
          seams.calls.push(`open ${scenarioId} with ${opts.withPath}`)
      : null,
  useSelectedScenarioIdOptional: () => seams.selectedScenarioId,
}))
vi.mock('@/contexts/PathSelectionContext', () => ({
  usePathSelectionContextOptional: () => ({
    getSelectedPathIds: () => seams.selectedPaths,
    setSelectedPathIds: (scenarioId: string, ids: string[]) =>
      seams.calls.push(`show ${scenarioId} ${ids.join('+')}`),
  }),
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
import { storageKey } from '@/lib/storageNamespace'

afterEach(() => {
  seams.calls.length = 0
  seams.selectedScenarioId = 'scenario-goals'
  seams.selectedPaths = ['path-main']
  seams.editor = true
  window.localStorage.clear()
})

const jumpWith = () => renderHook(() => useJumpToCell()).result.current

describe('going to a cell on another path', () => {
  it('opens another scenario with the far cell’s path beside the one it opens on, then flies and opens the panel', () => {
    jumpWith()!({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
    expect(seams.calls).toEqual([
      'open scenario-report with path-report',
      'focus scenario-report cell-report +panel',
    ])
  })

  it('adds a path this scenario is not showing, keeping the ones it is', () => {
    seams.selectedPaths = ['path-main', 'path-late']
    jumpWith()!({
      cellId: 'cell-detour',
      pathId: 'path-detour',
      scenarioId: 'scenario-goals',
    })
    expect(seams.calls).toEqual([
      'base view',
      'show scenario-goals path-main+path-late+path-detour',
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

  it('writes nothing to the phone’s path memory', () => {
    jumpWith()!({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
    expect(window.localStorage.getItem(storageKey('mobile-paths'))).toBeNull()
  })

  it('offers no jump where there is no editor to navigate with', () => {
    seams.editor = false
    expect(jumpWith()).toBeNull()
  })
})
