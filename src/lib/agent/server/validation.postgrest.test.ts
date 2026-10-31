// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { pythonVerdicts } from '@/test/blueprintValidatorParity'
import { serviceDocument, validateDocument } from '@/lib/agent/validation/service'
import { openMcpHttp } from '@/test/mcpHttp'

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('a clean service passes and an incomplete path is located for both a confirmer and a contributor, without writing', async () => {
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  const clean = 'a0000000-0000-4000-8000-000000000100'
  const incomplete = 'a0000000-0000-4000-8000-000000000200'
  const before = await Promise.all([clean, incomplete].map(p_service_id => db.rpc('read_service_blueprint', { p_service_id })))
  const documents = before.map(result => serviceDocument(result.data).document)
  const expected = pythonVerdicts(documents)
  for (const [index, document] of documents.entries()) {
    const result = validateDocument(document)
    expect(result.errors.map(issue => issue.path).sort()).toEqual(expected[index].paths)
    expect(result.errors.length === 0).toBe(expected[index].valid)
    expect(result.warnings.length).toBe(expected[index].warnings)
  }
  const logBefore = await db.from('authoring_changes').select('id')
  try {
    for (const jwt of [process.env.MCP_TEST_OWNER_JWT!, process.env.MCP_TEST_OTHER_JWT!]) {
      const client = new Client({ name: 'validation-reader', version: '1' }); clients.push(client)
      await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
      const listed = await client.listTools()
      expect(listed.tools.find(tool => tool.name === 'validate_blueprint')?.annotations?.readOnlyHint).toBe(true)
      for (const [service_id, valid] of [[clean, true], [incomplete, false]] as const) {
        const reply = await client.callTool({ name: 'validate_blueprint', arguments: { service_id } })
        expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
        const verdict = JSON.parse((reply.content as { text: string }[])[0].text)
        expect(verdict).toMatchObject({ service_id, valid })
        if (valid) expect(verdict.errors).toEqual([])
        else expect(verdict.errors).toEqual(expect.arrayContaining([expect.objectContaining({
          location: expect.objectContaining({ kind: 'path', id: 'a0000000-0000-4000-8000-000000000204', jsonpath: expect.stringContaining('.lanes') }),
          message: expect.stringContaining('lane'),
        })]))
      }
      const unknown = await client.callTool({ name: 'validate_blueprint', arguments: { service_id: 'a0000000-0000-4000-8000-999999999999' } })
      expect(unknown.isError).toBe(true)
      expect(JSON.stringify(unknown.content)).toContain('list_services')
    }
    const after = await Promise.all([clean, incomplete].map(p_service_id => db.rpc('read_service_blueprint', { p_service_id })))
    expect(before.every(result => !result.error)).toBe(true)
    expect(after.map(result => result.data)).toEqual(before.map(result => result.data))
    expect((await db.from('authoring_changes').select('id')).data).toEqual(logBefore.data)
  } finally { await Promise.all(clients.map(client => client.close())); await http.close() }
}, 30000)
