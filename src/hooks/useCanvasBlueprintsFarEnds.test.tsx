// @vitest-environment jsdom
/**
 * The canvas names the far ends of links that leave a path in at most ONE
 * extra read — and makes none when every link stays on its path, or lands on
 * a board it already holds.
 *
 * The board query carries edge ids only. The far end of a link to a loaded
 * board is named from that board; what is left is read from `cells` in one
 * request. A Supabase client is faked at `from`, so the assertion is the
 * requests the canvas makes, which is the egress this exists to keep down.
 */
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const wire = vi.hoisted(() => ({
  rows: [] as unknown[],
  cellRows: [] as unknown[],
  tables: [] as string[],
  cellIds: [] as string[][],
}))

function builder(table: string) {
  const self = {
    select: () => self,
    eq: () => self,
    in: (_column: string, ids: string[]) => {
      wire.cellIds.push(ids)
      return self
    },
    abortSignal: () => self,
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: table === 'paths' ? wire.rows : wire.cellRows, error: null }),
  }
  return self
}

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    configured: true,
    client: {
      from: (table: string) => {
        wire.tables.push(table)
        return builder(table)
      },
    },
  }),
}))

import { useCanvasBlueprints } from '@/hooks/useCanvasBlueprints'
import { queryClient } from '@/lib/queryClient'

afterEach(() => {
  queryClient.clear()
  wire.rows = []
  wire.cellRows = []
  wire.tables.length = 0
  wire.cellIds.length = 0
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

function path(id: string, cells: unknown[]) {
  return {
    id,
    name: id === 'path-main' ? 'Main route' : 'Missed session',
    kind: id === 'path-main' ? 'happy' : 'variant',
    scenario_id: 'scenario-goals',
    scenarios: { name: 'Goal setting', phases: { name: 'Term' } },
    lanes: [{ id: 'lane', name: 'Tutor', lane_role: null, position: 0 }],
    path_steps: [{ position: 0, steps: { id: 'step', name: 'Reviews it' } }],
    cells,
  }
}

function cell(id: string, outgoing: unknown[] = []) {
  return { id, lane_id: 'lane', step_id: 'step', content: id, outgoing, incoming: [] }
}

const render = () =>
  renderHook(() => useCanvasBlueprints(['scenario-goals']), { wrapper })

describe('naming the far ends of links that leave a path', () => {
  it('makes no follow-up read for a board whose links all stay on it', async () => {
    wire.rows = [
      path('path-main', [
        cell('cell-a', [{ id: 'edge', target_cell_id: 'cell-b', kind: 'leads_to' }]),
        cell('cell-b'),
      ]),
    ]
    const { result } = render()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(wire.tables).toEqual(['paths'])
    expect(result.current.blueprintsByPathId.get('path-main')?.remoteCells).toBeUndefined()
  })

  it('makes none for a link to another path the canvas already holds, and names it from there', async () => {
    wire.rows = [
      path('path-main', [
        cell('cell-a', [{ id: 'edge', target_cell_id: 'cell-detour', kind: 'leads_to' }]),
      ]),
      path('path-detour', [cell('cell-detour')]),
    ]
    const { result } = render()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(wire.tables).toEqual(['paths'])
    expect(result.current.blueprintsByPathId.get('path-main')?.remoteCells).toEqual([
      expect.objectContaining({ id: 'cell-detour', pathName: 'Missed session' }),
    ])
  })

  it('reads every unloaded far end in one request', async () => {
    wire.rows = [
      path('path-main', [
        cell('cell-a', [
          { id: 'edge-1', target_cell_id: 'cell-far-1', kind: 'leads_to' },
          { id: 'edge-2', target_cell_id: 'cell-far-2', kind: 'leads_to' },
        ]),
      ]),
    ]
    wire.cellRows = ['cell-far-1', 'cell-far-2'].map((id) => ({
      id,
      content: id,
      lanes: { name: 'Tutor' },
      steps: { name: 'Writes it up' },
      paths: {
        id: 'path-report',
        name: 'Main route',
        scenarios: { id: 'scenario-report', name: 'Weekly class report', phases: { name: 'Week' } },
      },
    }))
    const { result } = render()
    await waitFor(() =>
      expect(
        result.current.blueprintsByPathId.get('path-main')?.remoteCells,
      ).toHaveLength(2),
    )
    expect(wire.tables).toEqual(['paths', 'cells'])
    expect(wire.cellIds).toEqual([['cell-far-1', 'cell-far-2']])
  })
})
