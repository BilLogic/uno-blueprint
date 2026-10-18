// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { openMcpHttp } from '@/test/mcpHttp'
import { POSTGREST_URL, postgrestFetch } from '@/test/postgrestDatabase'

let http: Awaited<ReturnType<typeof openMcpHttp>> | undefined
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  await http?.close()
})
it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('MCP reads real rows as each caller and RLS refuses the other person’s private transcript', async () => {
  http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({
    url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL),
  })
  async function connect(jwt: string) {
    const client = new Client({ name: 'database-seam', version: '1' })
    clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http!.url), {
      requestInit: { headers: { Authorization: `Bearer ${jwt}` } },
    }))
    return client
  }
  const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
  const other = await connect(process.env.MCP_TEST_OTHER_JWT!)
  const call = (client: Client, id: string) => client.callTool({ name: 'get_session', arguments: { session_id: id } })
  const first = 'd0000000-0000-4000-8000-000000000001'
  const second = 'd0000000-0000-4000-8000-000000000002'
  expect(JSON.stringify(await call(owner, first))).toContain('The first private fact.')
  expect(JSON.stringify(await call(other, first))).not.toContain('The first private fact.')
  expect(JSON.stringify(await call(other, first))).toContain('No session with id')
  expect(JSON.stringify(await call(other, second))).toContain('The second private fact.')
  expect(JSON.stringify(await owner.callTool({ name: 'list_blueprint', arguments: { granularity: ['phase'] } }))).toContain('Discover')
  expect((await fetch(http.url, { method: 'POST', headers: { Authorization: 'Bearer invalid-token' } })).status).toBe(401)
})
