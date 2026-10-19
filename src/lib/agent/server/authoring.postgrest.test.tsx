// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { Database } from '@/types/database'
import { createToolServer } from '@/lib/agent/server/mcp'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'
import { useCanvasBlueprints } from '@/hooks/useCanvasBlueprints'

const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => ({ client: context.client, configured: true }) }))

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('concurrent callers own their audit rows and an open canvas sees a host write on refetch', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  context.client = db
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  try {
    const cells = await db.from('cells').select('id,content,path_id').order('id').limit(2)
    expect(cells.error).toBeNull()
    expect(cells.data).toHaveLength(2)
    const [first, second] = cells.data!
    const path = await db.from('paths').select('scenario_id').eq('id', first.path_id).single()
    expect(path.error).toBeNull()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const canvas = renderHook(() => useCanvasBlueprints([path.data!.scenario_id]), { wrapper })
    const shown = () => canvas.result.current.blueprintsByPathId.get(first.path_id)?.cells.find(cell => cell.id === first.id)?.content
    await waitFor(() => expect(shown()).toBe(first.content))
    for (const jwt of [process.env.MCP_TEST_OWNER_JWT!, process.env.MCP_TEST_OTHER_JWT!]) {
      const client = new Client({ name: 'authoring-caller', version: '1' })
      clients.push(client)
      await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    }
    const contents = ['First caller changed this action', 'Second caller changed this action']
    const replies = await Promise.all(clients.map((client, index) => client.callTool({ name: 'update_cell', arguments: {
      cell_id: cells.data![index].id, content: contents[index], confirmed: true,
    } })))
    for (const reply of replies) expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
    const log = await db.from('authoring_changes').select('author_id,args,revert').eq('fn','update_cell').in('args->>cell_id',[first.id,second.id])
    expect(log.error).toBeNull()
    for (let index = 0; index < 2; index++) {
      const row = log.data!.find(row => (row.args as { cell_id: string }).cell_id === cells.data![index].id)
      expect(row?.author_id).toBe(`c0000000-0000-4000-8000-00000000000${index + 1}`)
      expect(row?.revert).toMatchObject({ kind: 'captured_rows', rows: expect.arrayContaining([
        expect.objectContaining({ table: 'cells', before: expect.objectContaining({ content: cells.data![index].content }), after: expect.objectContaining({ content: contents[index] }) }),
      ]) })
    }
    expect(shown()).toBe(first.content)
    await act(() => cache.refetchQueries())
    await waitFor(() => expect(shown()).toBe(contents[0]))
    expect(canvas.result.current.usingFallback).toBe(false)
  } finally {
    cleanup(); cache.clear(); context.client = null
    await Promise.all(clients.map(client => client.close())); await http.close()
    vi.unstubAllGlobals()
  }
},30000)
