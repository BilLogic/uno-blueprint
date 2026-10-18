// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { openMcpHttp } from '@/test/mcpHttp'

const servers: Awaited<ReturnType<typeof openMcpHttp>>[] = []
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  await Promise.all(servers.splice(0).map(server => server.close()))
})
async function serve(handler: (request: Request) => Promise<Response>) {
  const server = await openMcpHttp(handler)
  servers.push(server)
  return server.url
}

it('an MCP client reads with its JWT on every call, and unauthenticated calls receive OAuth discovery', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'test-key', alg: 'ES256' }] }
  const jwt = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject('c0000000-0000-4000-8000-000000000001').setAudience('authenticated').setExpirationTime('5m').sign(privateKey)
  const seen: string[] = []
  const database = await serve(async request => {
    seen.push(request.headers.get('Authorization') ?? '')
    return Response.json(request.url.includes('/agent_sessions')
      ? { id: 'd0000000-0000-4000-8000-000000000001', title: 'Private conversation' }
      : [{ payload: { kind: 'user', text: 'A fact in my conversation.' } }])
  })
  const url = await serve(request => handler(request))
  const handler = createToolServer({ url: database, publishableKey: 'sb_publishable_test', jwks, resourceUrl: url })
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` }
  const client = new Client({ name: 'seam-test', version: '1' })
  clients.push(client)
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }))
  const listed = await client.listTools()
  expect(listed.tools.some(tool => tool.name === 'get_session')).toBe(true)
  expect(listed.tools.some(tool => tool.name === 'open_cell_panel')).toBe(false)
  expect(listed.tools.some(tool => tool.name === 'search_blueprint')).toBe(false)
  expect(listed.tools.some(tool => tool.name === 'get_reference')).toBe(false)
  const resources = await client.listResources()
  expect(resources.resources.some(resource => resource.uri === 'uno://references/lane-roles')).toBe(true)
  expect(JSON.stringify(await client.readResource({ uri: 'uno://references/lane-roles' }))).toContain('frontstage')
  await expect(client.readResource({ uri: 'uno://references/unknown' })).rejects.toThrow()
  const reply = await client.callTool({ name: 'get_session', arguments: { session_id: 'd0000000-0000-4000-8000-000000000001' } })
  expect(JSON.stringify(reply)).toContain('A fact in my conversation.')
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every(token => token === `Bearer ${jwt}`)).toBe(true)
  delete headers.Authorization
  await expect(client.listTools()).rejects.toThrow()
  const refused = await fetch(url, { method: 'POST' })
  expect(refused.status).toBe(401)
  expect(refused.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
})

it('MCP search sends only the server key to the embedding provider and never to the database or reply', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'search-key', alg: 'ES256' }] }
  const jwt = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'search-key' })
    .setSubject('c0000000-0000-4000-8000-000000000001').setAudience('authenticated').setExpirationTime('5m').sign(privateKey)
  const secret = 'server-only-test-key'
  let embedded = false
  const database = await serve(async request => {
    if (request.url.includes('/services')) return Response.json([{ id: 'f0000000-0000-4000-8000-000000000010', name: 'Only service', slug: 'only' }])
    const body = await request.json()
    expect(body.query_embedding).toBe('[1,0]')
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(JSON.stringify(body)).not.toContain('client-supplied-key')
    return Response.json([{ kind: 'cell', id: 'f0000000-0000-4000-8000-110300010001', snippet: 'A server search fact', matched_by: 'meaning', total_matched: 1 }])
  })
  const url = await serve(request => handler(request))
  const handler = createToolServer({ url: database, publishableKey: 'sb_publishable_test', resourceUrl: url, jwks,
    search: { apiKey: secret, index: { provider: 'openai', model: 'read-test-index', dimensions: 2 },
      fetch: async (_input, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secret}`)
        embedded = true; return Response.json({ data: [{ embedding: [1, 0] }] })
      } },
  })
  const client = new Client({ name: 'search-seam', version: '1' }); clients.push(client)
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
  const reply = await client.callTool({ name: 'search_blueprint', arguments: { query: 'a fact', api_key: 'client-supplied-key' } })
  expect(embedded).toBe(true)
  expect(JSON.stringify(reply)).toContain('A server search fact')
  expect(JSON.stringify(reply)).not.toContain(secret)
})
