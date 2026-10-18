// @vitest-environment node
import { expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { openMcpHttp } from '@/test/mcpHttp'

it('MCP admits a valid write and refuses invalid arguments, secrets and an oversized call before asking for a write', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'write-key', alg: 'ES256' }] }
  const jwt = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'write-key' })
    .setSubject('c0000000-0000-4000-8000-000000000001').setAudience('authenticated').setExpirationTime('5m').sign(privateKey)
  const writes: unknown[] = []
  const database = await openMcpHttp(async request => {
    writes.push(await request.json())
    return Response.json({ outcome: 'applied', result: 'A write completed.' })
  })
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: database.url, publishableKey: 'sb_publishable_test',
    resourceUrl: http.url, jwks })
  const client = new Client({ name: 'write-seam', version: '1' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
    expect((await client.listTools()).tools.some(tool => tool.name === 'update_cell')).toBe(true)
    expect(JSON.stringify(await call('update_cell', { cell_id: crypto.randomUUID(), content: 'Reviewed wording', confirmed: true }))).toContain('applied')
    expect(writes).toHaveLength(1)
    const secret = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
    expect(JSON.stringify(await call('update_cell', { cell_id: crypto.randomUUID(), content: secret }))).toContain('secret')
    expect(JSON.stringify(await call('update_cell', { cell_id: crypto.randomUUID(), content: 'Reviewed wording', extra: { nested: secret } }))).toContain('secret')
    expect(JSON.stringify(await call('create_scenario', { phase_id: crypto.randomUUID(), name: 'Intake', step_count: -1 }))).toContain('positive')
    expect(JSON.stringify(await call('create_slice', { title: 'Brief', kind: 'journey', cell_ids: Array.from({ length: 51 }, () => crypto.randomUUID()) }))).toContain('50 cells')
    expect(writes).toHaveLength(1)
  } finally { await client.close(); await http.close(); await database.close() }
})
