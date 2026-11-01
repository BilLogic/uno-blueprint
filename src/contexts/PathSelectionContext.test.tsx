// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  PathSelectionProvider,
  usePathSelectionContext,
} from '@/contexts/PathSelectionContext'
import type { PathListItem } from '@/lib/pathSelection'

function path(
  id: string,
  name: string,
  kind: PathListItem['kind'] = 'happy',
): PathListItem {
  return { id, name, summary: null, note: null, kind }
}

/** The template's own sample shape: a differently-named happy path per scenario. */
const CATALOG = new Map<string, PathListItem[]>([
  ['discover', [path('p-discover', 'First visit')]],
  [
    'adopt',
    [
      path('p-nodb', 'No-database run'),
      path('p-supabase', 'Supabase run', 'variant'),
    ],
  ],
  ['map', [path('p-map', 'Guided mapping')]],
  ['operate', [path('p-operate', 'Stewardship loop')]],
])

function wrapper({ children }: { children: ReactNode }) {
  return <PathSelectionProvider>{children}</PathSelectionProvider>
}

function renderStore() {
  return renderHook(() => usePathSelectionContext(), { wrapper })
}

describe('PathSelectionProvider', () => {
  it('leaves no phase empty on the all-phases overview', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))

    // `visibleScenarioSelections` in PhaseScenarioOverview keeps only
    // scenarios with a selected path; a phase with none renders the
    // "No selected paths in this phase" empty state.
    for (const scenarioId of CATALOG.keys()) {
      expect(result.current.getSelectedPathIds(scenarioId)).toHaveLength(1)
    }
  })

  it('defaults each scenario that arrives later too', () => {
    const { result } = renderStore()
    // The overview streams scenarios in as their queries settle. The first
    // arrival used to freeze one global key, and everything after it matched
    // nothing.
    act(() =>
      result.current.syncScenarioPaths(
        new Map([['discover', CATALOG.get('discover')!]]),
        ['discover'],
      ),
    )
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))

    expect(result.current.getSelectedPathIds('map')).toEqual(['p-map'])
    expect(result.current.getSelectedPathIds('operate')).toEqual(['p-operate'])
  })

  it('opens each scenario on one path, so compare stays off by default', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))

    expect(result.current.getSelectedPathIds('adopt')).toEqual(['p-nodb'])
  })

  it('filters globally once the user picks a path', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    // Uncheck everything except one scenario's path.
    act(() => {
      for (const key of [
        'happy:No-database run',
        'happy:Guided mapping',
        'happy:Stewardship loop',
      ]) {
        result.current.togglePathKey(key)
      }
    })

    expect(result.current.activePathKeys).toEqual(['happy:First visit'])
    expect(result.current.getSelectedPathIds('discover')).toEqual(['p-discover'])
    // Explicit means explicit: no per-scenario fallback refills these.
    expect(result.current.getSelectedPathIds('map')).toEqual([])
    expect(result.current.getSelectedPathIds('operate')).toEqual([])
  })

  it('selects a scenario’s second path when the user adds it', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    act(() => result.current.togglePathKey('variant:Supabase run'))

    expect(result.current.getSelectedPathIds('adopt')).toEqual([
      'p-nodb',
      'p-supabase',
    ])
  })

  it('restores per-scenario defaults after the selection is emptied', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    act(() => {
      for (const key of [...result.current.activePathKeys]) {
        result.current.togglePathKey(key)
      }
    })
    expect(
      [...CATALOG.keys()].every(
        (id) => result.current.getSelectedPathIds(id).length === 0,
      ),
    ).toBe(true)

    act(() => result.current.restoreDefaultPathKeys())

    for (const scenarioId of CATALOG.keys()) {
      expect(result.current.getSelectedPathIds(scenarioId)).toHaveLength(1)
    }
  })

  it('surfaces every scenario’s default as a checked filter row', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))

    // What the PATHS checkboxes read to decide `checked`.
    expect(result.current.activePathKeys).toEqual([
      'happy:First visit',
      'happy:No-database run',
      'happy:Guided mapping',
      'happy:Stewardship loop',
    ])
    expect(result.current.defaultPathKeys).toEqual([
      ...result.current.activePathKeys,
    ])
  })

  it('selectDefaultPath lands on the happy path once the catalog has it', () => {
    const { result } = renderStore()
    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    act(() => result.current.selectDefaultPath('adopt'))

    expect(result.current.getSelectedPathIds('adopt')).toEqual(['p-nodb'])
  })

  it('selectDefaultPath waits for the catalog, then applies', () => {
    const { result } = renderStore()
    act(() => result.current.selectDefaultPath('adopt'))
    expect(result.current.getSelectedPathIds('adopt')).toEqual([])

    act(() => result.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    expect(result.current.getSelectedPathIds('adopt')).toEqual(['p-nodb'])
  })

  it('selectDefaultPath shows a followed link’s path beside the default, now or once the catalog arrives', () => {
    const now = renderStore().result
    act(() => now.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    act(() => now.current.selectDefaultPath('adopt', 'p-supabase'))
    expect(now.current.getSelectedPathIds('adopt')).toEqual(['p-nodb', 'p-supabase'])

    const later = renderStore().result
    act(() => later.current.selectDefaultPath('adopt', 'p-supabase'))
    act(() => later.current.syncScenarioPaths(CATALOG, [...CATALOG.keys()]))
    expect(later.current.getSelectedPathIds('adopt')).toEqual(['p-nodb', 'p-supabase'])
  })
})
