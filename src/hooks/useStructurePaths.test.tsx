// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/queryKeys'
import { useStructurePaths } from './useStructurePaths'
const database = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: database, configured: true }),
}))
afterEach(cleanup)
it('notifies the editor of a fresh equal read without changing the shared query result contract', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  })
  const key = [queryKeys.structurePaths.of('step:scenario:scenario')]
  const paths = [
    { id: 'path', name: 'Online', items: [{ id: 'step', name: 'Review' }] },
  ]
  client.setQueryData(key, paths, { updatedAt: 1 })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useStructurePaths({ kind: 'step', scenarioId: 'scenario' }),
    { wrapper },
  )
  expect(result.current).toMatchObject({ status: 'ready', readAt: 1 })
  const first = result.current.status === 'ready' ? result.current.data : null
  act(() => {
    client.setQueryData(key, paths, { updatedAt: 2 })
  })
  expect(result.current).toMatchObject({ status: 'ready', readAt: 2 })
  expect(result.current.status === 'ready' && result.current.data).toBe(first)
  client.clear()
})

it('keeps semantic lane roles in the shared ordered-path read', async () => {
  let selection = ''
  const lanes = [
    { id: 'visible', name: 'Front desk', position: 1, lane_role: 'frontstage_actions' },
    { id: 'recipient', name: 'Customer', position: 0, lane_role: 'customer_actions' },
  ]
  const read = {
    select: (columns: string) => { selection = columns; return read },
    eq: () => read,
    order: () => read,
    abortSignal: async () => ({
      data: [{
        id: 'path', name: 'Online', path_steps: [],
        lanes: lanes.map(({ lane_role, ...lane }) =>
          selection.includes('lane_role') ? { ...lane, lane_role } : lane),
      }],
      error: null,
    }),
  }
  database.from.mockReturnValue(read)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useStructurePaths({ kind: 'lane', pathId: 'path', onlyPath: true }),
    { wrapper },
  )
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.status === 'ready' && result.current.data[0].items).toMatchObject([
    { id: 'recipient', role: 'customer_actions' },
    { id: 'visible', role: 'frontstage_actions' },
  ])
  client.clear()
})
