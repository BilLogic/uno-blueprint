// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/queryKeys'
import { useStructurePaths } from './useStructurePaths'
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true }),
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
