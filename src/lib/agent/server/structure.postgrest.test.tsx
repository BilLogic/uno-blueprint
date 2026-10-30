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
import { runTool } from '@/lib/agent/tools/definition'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { useServicePhases } from '@/hooks/useServicePhases'

const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => ({ client: context.client, configured: true }) }))

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('journey names persist through MCP, proposals preserve them and the canvas refetches all four levels', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  context.client = db
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  async function connect(jwt: string) {
    const client = new Client({ name: 'structure-caller', version: '1' }); clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    return client
  }
  try {
    const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
    const contributor = await connect(process.env.MCP_TEST_OTHER_JWT!)
    async function call(client: Client, name: string, args: Record<string, unknown>) {
      const reply = await client.callTool({ name, arguments: { ...args, confirmed: true } })
      expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
      return JSON.parse((reply.content as { text: string }[])[0].text)
    }
    const service = (await call(owner, 'create_service', { name: 'Structure test only' })).result as string
    const phase = (await call(owner, 'create_phase', { service_id: service, name: 'Initial phase' })).result as string
    const { scenario_id: scenario, path_id: path } = (await call(owner, 'create_scenario', {
      phase_id: phase, name: 'Initial scenario', step_names: ['Choose support', 'Describe request'],
    })).result as { scenario_id: string; path_id: string }
    expect((await db.from('steps').select('name').eq('scenario_id', scenario).order('name')).data).toEqual([{ name: 'Choose support' }, { name: 'Describe request' }])
    const step = (await call(owner, 'create_step', { path_id: path, name: 'Receive answer' })).result as string
    await call(owner, 'create_lane', { scenario_id: scenario, name: 'Initial lane' })
    const lane = (await db.from('lanes').select('id').eq('path_id', path).single()).data!.id
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const canvas = renderHook(() => ({ hierarchy: useServicePhases(service), board: useCanvasBlueprints([scenario]) }), { wrapper })
    const shown = () => {
      const ph = canvas.result.current.hierarchy.phases[0]
      const board = canvas.result.current.board.blueprintsByPathId.get(path)
      return [ph?.name, ph?.scenarios?.[0]?.name, board?.steps.find(row => row.id === step)?.name, board?.lanes.find(row => row.id === lane)?.name]
    }
    const oldNames = ['Initial phase', 'Initial scenario', 'Receive answer', 'Initial lane']
    await waitFor(() => expect(shown()).toEqual(oldNames))
    const otherService = (await call(owner, 'create_service', { name: 'Other test-only service' })).result as string
    const levels = ['phase', 'scenario', 'step', 'lane'] as const
    const ids = [phase, scenario, step, lane]
    const tables = ['phases', 'scenarios', 'steps', 'lanes'] as const
    for (const [i, level] of levels.entries()) {
      const args = { [`${level}_id`]: ids[i], name: `Named ${level}` }
      if (level === 'step' || level === 'lane') {
        for (const bad of [
          { ...args, [`${level}_id`]: crypto.randomUUID() },
          { ...args, name: '   ' },
          { ...args, service_id: otherService },
        ]) {
          const refused = await owner.callTool({ name: `update_${level}`, arguments: { ...bad, confirmed: true } })
          expect(refused.isError).toBe(true)
          expect(JSON.stringify(refused.content)).toMatch(/read|blank|invalid arguments/i)
          expect((await db.from(tables[i]).select('name').eq('id', ids[i]).single()).data?.name).toBe(oldNames[i])
        }
      }
      expect((await call(owner, `update_${level}`, args)).outcome).toBe('applied')
      const log = await db.from('authoring_changes').select('author_id,revert').eq('fn', `update_${level}`).single()
      expect(log.error).toBeNull()
      expect(log.data).toMatchObject({ author_id: 'c0000000-0000-4000-8000-000000000001', revert: { kind: 'captured_rows', rows: expect.arrayContaining([
        expect.objectContaining({ table: tables[i], before: expect.objectContaining({ name: oldNames[i] }), after: expect.objectContaining({ name: `Named ${level}` }) }),
      ]) } })
      const proposed = await call(contributor, `update_${level}`, { ...args, name: `Proposed ${level}` })
      expect(proposed.outcome).toBe('proposed')
      expect((await db.from(tables[i]).select('name').eq('id', ids[i]).single()).data?.name).toBe(`Named ${level}`)
      const bad = await owner.callTool({ name: `update_${level}`, arguments: { ...args, name: '   ', confirmed: true } })
      expect(bad.isError).toBe(true)
    }
    expect(shown()).toEqual(oldNames)
    await act(() => cache.refetchQueries())
    await waitFor(() => expect(shown()).toEqual(levels.map(level => `Named ${level}`)))
    expect(canvas.result.current.board.usingFallback).toBe(false)
    const invalid = await owner.callTool({ name: 'create_scenario', arguments: { phase_id: phase, name: 'Invalid', step_count: 3, step_names: ['One'], confirmed: true } })
    expect(invalid.isError).toBe(true)
    expect((await db.from('scenarios').select('id').eq('name', 'Invalid')).data).toEqual([])
    const canvasContext = fakeToolContext({ client: db, session: { id: crypto.randomUUID(), attributed: work => work() }, scope: { kind: 'service', serviceId: service, serviceName: 'Structure test only' } })
    for (const [name, args] of [
      ['create_service', { name: 'Canvas test only' }],
      ['create_scenario', { phase_id: phase, name: 'Canvas initial scenario', step_count: 2 }],
      ...levels.map((level, i) => [`update_${level}`, { [`${level}_id`]: ids[i], name: `Canvas ${level}` }]),
    ] as [string, Record<string, unknown>][]) {
      const tool = findToolDefinition(name)!
      const before = await db.from('services').select('id,name').order('id')
      const proposal = JSON.parse(await runTool(tool, args, canvasContext))
      expect(proposal).toMatchObject({ outcome: 'proposed', message: expect.stringContaining('approve') })
      expect((await db.from('services').select('id,name').order('id')).data).toEqual(before.data)
      for (const [i, table] of tables.entries())
        expect((await db.from(table).select('name').eq('id', ids[i]).single()).data?.name).toBe(`Named ${levels[i]}`)
      expect(JSON.parse(await runTool(tool, { ...args, confirmed: true }, canvasContext)).outcome).toBe('applied')
      if (name.startsWith('update_')) {
        const i = levels.indexOf(name.slice(7) as typeof levels[number])
        // Later calls compare the canvas's now-confirmed name.
        await call(owner, name, { ...args, name: `Named ${levels[i]}` })
      }
    }

  } finally {
    cleanup(); cache.clear(); context.client = null
    await Promise.all(clients.map(client => client.close())); await http.close(); vi.unstubAllGlobals()
  }
}, 30000)

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('structure summaries land with labels and preserve both prior values through MCP', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  async function connect(jwt: string) {
    const client = new Client({ name: 'summary-caller', version: '1' }); clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    return client
  }
  try {
    const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
    const contributor = await connect(process.env.MCP_TEST_OTHER_JWT!)
    async function call(client: Client, name: string, args: Record<string, unknown>) {
      const reply = await client.callTool({ name, arguments: { ...args, confirmed: true } })
      expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
      return JSON.parse((reply.content as { text: string }[])[0].text)
    }
    const service = (await call(owner, 'create_service', { name: 'Summary test only' })).result as string
    const phase = (await call(owner, 'create_phase', { service_id: service, name: 'Original phase', summary: 'Original phase explanation' })).result as string
    const { scenario_id: scenario, path_id: path } = (await call(owner, 'create_scenario', {
      phase_id: phase, name: 'Original scenario', summary: 'Original scenario explanation', step_names: ['Arrival'],
    })).result as { scenario_id: string; path_id: string }
    const step = (await call(owner, 'create_step', { path_id: path, name: 'Original step', summary: 'Original step explanation' })).result as string
    expect((await db.from('path_steps').select('position').eq('path_id', path).order('position')).data).toEqual([{ position: 0 }, { position: 1 }])
    for (const [kind, id, table] of [['phase', phase, 'phases'], ['scenario', scenario, 'scenarios'], ['step', step, 'steps']] as const) {
      const args = { [`${kind}_id`]: id, name: `Short ${kind}`, summary: `New explanation for ${kind}` }
      expect((await call(owner, `update_${kind}`, args)).outcome).toBe('applied')
      expect((await db.from(table).select('name,summary').eq('id', id).single()).data).toEqual({ name: args.name, summary: args.summary })
      const readback = await owner.callTool({ name: 'list_blueprint', arguments: { granularity: [kind], service: 'all' } })
      expect(JSON.stringify(readback.content)).toContain(args.summary)
      const logs = await db.from('authoring_changes').select('revert').eq('fn', `update_${kind}`)
      expect(logs.error).toBeNull()
      expect(logs.data).toEqual(expect.arrayContaining([expect.objectContaining({ revert: expect.objectContaining({ rows: expect.arrayContaining([
        expect.objectContaining({ table, before: expect.objectContaining({ id, name: `Original ${kind}`, summary: `Original ${kind} explanation` }) }),
        expect.objectContaining({ table, after: expect.objectContaining({ id, name: args.name, summary: args.summary }) }),
      ]) }) })]))
      await call(owner, `update_${kind}`, { [`${kind}_id`]: id, name: 'A person may choose a much longer label than the writing guidance' })
      expect((await db.from(table).select('summary').eq('id', id).single()).data?.summary).toBe(args.summary)
    }
    const gridReadback = await owner.callTool({ name: 'get_blueprint', arguments: { scenario_id: scenario } })
    expect(JSON.stringify(gridReadback.content)).toContain('New explanation for step')
    const proposed = await call(contributor, 'update_step', { step_id: step, name: 'Proposed label', summary: 'Proposed explanation' })
    expect(proposed.outcome).toBe('proposed')
    expect((await db.from('steps').select('summary').eq('id', step).single()).data?.summary).toBe('New explanation for step')
    await call(owner, 'approve_suggested_change', { suggested_change_id: proposed.suggested_change_id })
    expect((await db.from('steps').select('name,summary').eq('id', step).single()).data).toEqual({ name: 'Proposed label', summary: 'Proposed explanation' })
  } finally {
    await Promise.all(clients.map(client => client.close())); await http.close(); vi.unstubAllGlobals()
  }
}, 30000)
