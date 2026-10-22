import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: {
    signInWithPassword: async () => ({ data: { user: { id: 'fixture-person' }, session: { access_token: 'fixture-token' } }, error: null }),
    signOut: async () => ({}),
  },
  from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }),
}) }))
vi.mock('@modelcontextprotocol/client', () => ({
  StreamableHTTPClientTransport: class {},
  Client: class {
    async connect() {}
    async close() {}
    async listTools() { return { tools: ['create_phase', 'create_finding', 'create_service'].map(name => ({ name, annotations: { readOnlyHint: false } })) } }
    async callTool() { return { content: [{ type: 'text', text: '[]' }] } }
  },
}))
const { judge } = await import('../smoke-tool-server.mjs')
afterEach(() => vi.unstubAllEnvs())

it('a remote smoke with no visible service reports unverified instead of claiming read proof', async () => {
  for (const name of ['SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD', 'TOOL_SERVER_OTHER_EMAIL', 'TOOL_SERVER_OTHER_PASSWORD']) vi.stubEnv(name, 'fixture')
  vi.stubEnv('SUPABASE_URL', 'https://fixture.invalid')
  const result = await judge()
  expect(result.unverified).toMatch(/no visible services/i)
  expect(result.findings).toBeUndefined()
  expect(result.line).toBeUndefined()
})
