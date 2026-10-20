// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('a confirmer starts a service from an empty business, discovers its id and creates a phase; a contributor only proposes', async () => {
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  async function connect(jwt: string) {
    const client = new Client({ name: 'new-service-seam', version: '1' }); clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    return client
  }
  try {
    const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
    const contributor = await connect(process.env.MCP_TEST_OTHER_JWT!)
    const missing = await owner.callTool({ name: 'create_phase', arguments: { name: 'Arrival', confirmed: true } })
    expect(missing.isError).toBe(true)
    expect(JSON.stringify(missing.content)).toContain('create_service')
    const created = await owner.callTool({ name: 'create_service', arguments: { name: 'Request support', summary: 'Help with an existing request', confirmed: true } })
    expect(created.isError).not.toBe(true)
    const result = JSON.parse((created.content as { text: string }[])[0].text)
    expect(result.outcome).toBe('applied')
    const serviceId = result.result as string
    expect(serviceId).toMatch(/^[0-9a-f-]{36}$/)
    const listed = await owner.callTool({ name: 'list_services', arguments: {} })
    expect(listed.isError).not.toBe(true)
    expect(JSON.stringify(listed.content)).toContain(serviceId)
    expect(JSON.stringify(listed.content)).toContain('Request support')
    expect((await db.from('cells').select('id')).data).toEqual([])
    const phase = await owner.callTool({ name: 'create_phase', arguments: { service_id: serviceId, name: 'Arrival', confirmed: true } })
    expect(phase.isError).not.toBe(true)
    expect((await db.from('phases').select('name').eq('service_id', serviceId)).data).toEqual([{ name: 'Arrival' }])
    const audit = await db.from('authoring_changes').select('author_id,agent_session_id,args').eq('fn', 'create_service').single()
    expect(audit.error).toBeNull()
    expect(audit.data?.author_id).toBe('c0000000-0000-4000-8000-000000000001')
    expect(audit.data?.agent_session_id).toBeTruthy()
    expect(audit.data?.args).toMatchObject({ result: serviceId })
    const proposal = await contributor.callTool({ name: 'create_service', arguments: { name: 'Another offering', confirmed: true } })
    expect(proposal.isError).not.toBe(true)
    const pending = JSON.parse((proposal.content as { text: string }[])[0].text)
    expect(pending.outcome).toBe('proposed')
    expect((await db.from('services').select('id')).data).toEqual([{ id: serviceId }])
    const suggestion = await db.from('suggested_changes').select('tool_name,suggested_by').eq('id', pending.suggested_change_id).single()
    expect(suggestion.data).toEqual({ tool_name: 'create_service', suggested_by: 'b0000000-0000-4000-8000-000000000002' })
    const accepted = await owner.callTool({ name: 'approve_suggested_change', arguments: { suggested_change_id: pending.suggested_change_id } })
    expect(accepted.isError).not.toBe(true)
    expect((await db.from('services').select('name').eq('name', 'Another offering')).data).toHaveLength(1)
    const injected = await owner.callTool({ name: 'create_service', arguments: { name: 'Wrong business', business_id: 'unrelated', confirmed: true } })
    expect(injected.isError).toBe(true)
    expect((await db.from('services').select('name').eq('name', 'Wrong business')).data).toEqual([])
    expect((await fetch(http.url, { method: 'POST', headers: { Authorization: 'Bearer invalid-token' } })).status).toBe(401)
  } finally { await Promise.all(clients.map(client => client.close())); await http.close() }
}, 30000)
