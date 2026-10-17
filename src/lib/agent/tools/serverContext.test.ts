import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { createServerToolContext } from '@/lib/agent/tools/serverContext'
import { configureAgentTools } from '@/lib/agent/tools/roster'
import { NO_SEARCH_REFUSAL, VIEW_ONLY_REFUSAL } from '@/lib/agent/tools/refusals'
import { overPostgrest, POSTGREST_URL, POSTGREST_JWT, postgrestClient, postgrestFetch } from '@/test/postgrestDatabase'

const scope = {
  kind: 'service' as const,
  serviceId: '11111111-1111-4111-8111-111111111111',
  serviceName: 'Subscription service',
}

function serverContext(options: Partial<Parameters<typeof createServerToolContext>[0]> = {}) {
  return createServerToolContext({
    url: 'http://127.0.0.1:1', publishableKey: 'public-test-key',
    jwt: 'caller-jwt', sessionId: 'server-session', scope, ...options,
  })
}

let server: Server | undefined
afterEach(async () => {
  configureAgentTools(undefined)
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
})

it('answers an aborted call with the loop stopped refusal', async () => {
  const controller = new AbortController()
  controller.abort()
  expect(await serverContext({ signal: controller.signal }).call('get_cell', {}))
    .toBe('Stopped by the user before this call ran.')
})

it.each([false, true])('reads with the caller JWT and service scope (standalone transport: %s)', async (standalone) => {
  server = createServer((request, response) => {
    expect(request.headers.authorization).toBe('Bearer caller-jwt')
    const url = new URL(request.url!, 'http://localhost')
    expect(url.pathname).toBe(standalone ? '/business_models' : '/rest/v1/business_models')
    expect(url.searchParams.get('service_id')).toBe('eq.11111111-1111-4111-8111-111111111111')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({
      pricing: 'A monthly subscription', funding: null, partners: null,
      revenue_model: null, delivery_cost: null,
    }))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test server port')
  const url = `http://127.0.0.1:${address.port}`
  const context = serverContext({
    url, fetch: standalone ? postgrestFetch(url) : undefined,
  })
  expect(await context.call('get_business_model', {})).toContain('A monthly subscription')
})

it.each([
  'open_phase', 'open_scenario', 'focus_cell', 'ui_command',
  'open_cell_panel', 'set_canvas_mode', 'set_sidebar', 'annotate_cells',
  'get_ui_state', 'list_ui_commands',
  'list_sessions', 'get_session', 'get_change_history',
])('refuses the browser-backed tool %s before validating its arguments', async (name) => {
  expect(await serverContext().call(name, {})).toBe(`The ${name} tool is not available in this server context.`)
})

it('answers withheld writes and search with the loop admission refusals', async () => {
  expect(await serverContext().call('update_cell', {})).toBe(VIEW_ONLY_REFUSAL)
  expect(await serverContext().call('search_blueprint', {})).toBe(NO_SEARCH_REFUSAL)
})

it('applies the deployment allowlist to both the roster and calls', async () => {
  configureAgentTools(['get_cell', 'open_phase'])
  const context = serverContext()
  expect(context.roster.map((tool) => tool.name)).toEqual(['get_cell'])
  expect(await context.call('get_business_model', {})).toBe('There is no get_business_model tool in this session.')
})

it('validates arguments through the same tool boundary as the canvas', async () => {
  await expect(serverContext().call('get_cell', {})).rejects.toThrow(/cell_id/)
})

// The runner builds the committed seed and mints a service claim
// (`app_metadata.role = 'service'`, random `sub`). Test setup adds a business
// model to the seeded service; anon holds no select on that table. The
// publishable key is not a JWT, so the caller's token is the only thing that
// can authenticate: if the access-token wiring fell back to the key, PostgREST
// would refuse it.
const seededServiceId = 'f0000000-0000-4000-8000-000000000010'

async function seedBusinessModel() {
  const { error } = await postgrestClient().from('business_models').upsert({
    service_id: seededServiceId, pricing: 'A monthly subscription',
  })
  expect(error).toBeNull()
}

function liveContext(fetch: typeof globalThis.fetch) {
  return serverContext({
    url: POSTGREST_URL, jwt: POSTGREST_JWT, fetch,
    scope: { kind: 'service', serviceId: seededServiceId, serviceName: 'Keeping a blueprint true' },
  })
}

it.runIf(overPostgrest)(
  'reads a business model through the server context over PostgREST with the minted service claim',
  async () => {
    await seedBusinessModel()
    const context = liveContext(postgrestFetch(POSTGREST_URL))
    expect(await context.call('get_business_model', {})).toContain('A monthly subscription')
  },
)

it.runIf(overPostgrest)(
  'is refused the business model over PostgREST when the caller JWT never reaches the database',
  async () => {
    await seedBusinessModel()
    const throughPrefix = postgrestFetch(POSTGREST_URL)
    const withoutCaller: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers)
      headers.delete('Authorization')
      return throughPrefix(input, { ...init, headers })
    }
    await expect(liveContext(withoutCaller).call('get_business_model', {}))
      .rejects.toThrow(/permission denied/)
  },
)
