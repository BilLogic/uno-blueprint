import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { createServerToolContext } from '@/lib/agent/tools/serverContext'

const scope = {
  kind: 'service' as const,
  serviceId: '11111111-1111-4111-8111-111111111111',
  serviceName: 'Subscription service',
}

function serverContext() {
  return createServerToolContext({
    url: 'http://127.0.0.1:1', publishableKey: 'public-test-key',
    jwt: 'caller-jwt', sessionId: 'server-session', scope,
  })
}

let server: Server | undefined
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
})

it('reads the scoped business model with the caller JWT and no browser', async () => {
  server = createServer((request, response) => {
    expect(request.headers.authorization).toBe('Bearer caller-jwt')
    const url = new URL(request.url!, 'http://localhost')
    expect(url.pathname).toBe('/rest/v1/business_models')
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
  const context = createServerToolContext({
    url: `http://127.0.0.1:${address.port}`, publishableKey: 'public-test-key',
    jwt: 'caller-jwt', sessionId: 'server-session',
    scope,
  })
  expect(await context.call('get_business_model', {})).toContain('A monthly subscription')
})

it.each([
  'open_phase', 'open_scenario', 'focus_cell', 'ui_command',
  'open_cell_panel', 'set_canvas_mode', 'set_sidebar', 'annotate_cells',
  'get_ui_state', 'list_ui_commands',
])('withholds %s and refuses a direct call before validating its arguments', async (name) => {
  const context = serverContext()
  expect(context.roster.map((tool) => tool.name)).not.toContain(name)
  expect(await context.call(name, {})).toBe(`There is no ${name} tool in this session.`)
})

it('withholds browser-backed history and writes until server implementations exist', async () => {
  const context = serverContext()
  for (const name of ['list_sessions', 'get_session', 'get_change_history', 'update_cell']) {
    expect(context.roster.map((tool) => tool.name)).not.toContain(name)
    expect(await context.call(name, {})).toBe(`There is no ${name} tool in this session.`)
  }
})

it('validates arguments through the same tool boundary as the canvas', async () => {
  await expect(serverContext().call('get_cell', {})).rejects.toThrow(/cell_id/)
})

// Opt in with RUN_LOCAL_SUPABASE_TESTS=1. Credentials belong in the
// gitignored .env; this test uses password sign-in and a public project key.
it.runIf(process.env.RUN_LOCAL_SUPABASE_TESTS === '1')(
  'reads a business model through the server context against local Supabase',
  async () => {
    const env = loadEnv('test', process.cwd(), 'LOCAL_SUPABASE_')
    const required = (name: string) => {
      const value = env[`LOCAL_SUPABASE_${name}`]
      if (!value) throw new Error(`Set LOCAL_SUPABASE_${name} in .env`)
      return value
    }
    const url = required('URL')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
      throw new Error('The integration test requires a local Supabase URL.')
    }
    const publishableKey = required('ANON_KEY')
    const auth = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await auth.auth.signInWithPassword({
      email: required('EMAIL'), password: required('PASSWORD'),
    })
    if (error || !data.session) throw new Error('Local Supabase password sign-in failed.')
    const context = createServerToolContext({
      url, publishableKey, jwt: data.session.access_token,
      sessionId: crypto.randomUUID(),
      scope: { kind: 'service', serviceId: required('SERVICE_ID'), serviceName: 'Test service' },
    })
    // Seed a known pricing value in the local fixture and record it in .env.
    expect(await context.call('get_business_model', {})).toContain(required('EXPECTED_PRICING'))
  },
)
