// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('every database read has an MCP happy path and JWT refusal; resources and the server-only search key cross the same boundary', async () => {
  const secret = 'server-only-test-key'
  let embedded = 0
  const dbFetch = postgrestFetch(POSTGREST_URL)
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test',
    resourceUrl: http.url, jwks: JSON.parse(process.env.MCP_TEST_JWKS!),
    fetch: (input, init) => { expect(JSON.stringify(init)).not.toContain(secret); return dbFetch(input, init) },
    search: { apiKey: secret, index: { provider: 'openai', model: 'read-test-index', dimensions: 2 },
      fetch: async (input, init) => {
        expect(String(input)).toBe('https://api.openai.com/v1/embeddings')
        expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secret}`)
        embedded++; return Response.json({ data: [{ embedding: [1, 0] }] })
      } },
  })
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.MCP_TEST_OWNER_JWT}` }
  const client = new Client({ name: 'all-read-seam', version: '1' })
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers } }))
    const cellId = 'f0000000-0000-4000-8000-110300010001'
    const cell = (await db.from('cells').select('content, path_id, lane_id').eq('id', cellId).single()).data!
    const path = (await db.from('paths').select('id, name, scenario_id').eq('id', cell.path_id).single()).data!
    const lane = (await db.from('lanes').select('name').eq('id', cell.lane_id).single()).data!
    const slice = (await db.from('slices').select('id, title').order('id').limit(1).single()).data!
    const paths = (await db.from('paths').select('id, scenario_id')).data!
    const compare = paths.find(row => paths.filter(other => other.scenario_id === row.scenario_id).length > 1)!
    const cases: [string, Record<string, unknown>, string][] = [
      ['get_profile', {}, 'Reader profile'],
      ['list_blueprint', { granularity: ['cell'], limit: 500 }, cellId],
      ['get_blueprint', { scenario_id: path.scenario_id }, cellId],
      ['compare_blueprint', { scenario_id: compare.scenario_id }, 'Comparing'],
      ['get_cell', { cell_id: cellId }, cell.content.trim().split('\n')[0]],
      ['list_slices', {}, slice.title], ['get_slice', { slice_id: slice.id }, slice.title],
      ['list_owner_tags', {}, 'Fixture owner'], ['list_stakeholders', {}, 'Reviewing partner'],
      ['list_lanes', {}, lane.name], ['list_cell_dependencies', {}, 'A persisted condition'],
      ['list_evidence', {}, 'Reader seam interview'],
      ['get_evidence', { evidence_ids: ['d0000000-0000-4000-8000-000000000101'] }, 'A persisted source note'],
      ['get_business_model', {}, 'A persisted pricing fact'],
      ['list_sessions', {}, 'First private session'],
      ['get_session', { session_id: 'd0000000-0000-4000-8000-000000000001' }, 'The first private fact.'],
      ['get_change_history', {}, 'Written by another session'],
      ['measure_deletion_impact', { kind: 'path', target_id: path.id }, 'Deleting this path'],
      ['list_findings', { status: 'all' }, 'A persisted finding'],
      ['search_blueprint', { query: 'remote result', api_key: 'a-caller-cannot-replace-the-server-key' }, 'A remote search result'],
    ]
    const listed = (await client.listTools()).tools.map(tool => tool.name).sort()
    expect(listed).toEqual(cases.map(([name]) => name).sort())
    expect(listed).toEqual(TOOL_DEFINITIONS.filter(tool => tool.surface === 'read' && tool.browserBacked === false && !tool.resourceOnly).map(tool => tool.name).sort())
    for (const [name, args, fact] of cases) {
      const reply = await client.callTool({ name, arguments: args })
      expect(reply.isError, `${name}: ${JSON.stringify(reply)}`).not.toBe(true)
      const text = (reply.content as { text: string }[]).map(item => item.text).join('\n')
      expect(text, name).toContain(fact)
      expect(text, name).not.toContain(secret)
    }
    expect(embedded).toBe(1)
    const resources = await client.listResources()
    expect(resources.resources.some(row => row.uri === 'uno://references/lane-roles')).toBe(true)
    expect(JSON.stringify(await client.readResource({ uri: 'uno://references/lane-roles' }))).toContain('frontstage')
    await expect(client.readResource({ uri: 'uno://references/unknown' })).rejects.toThrow()
    delete headers.Authorization
    for (const [name, args] of cases) await expect(client.callTool({ name, arguments: args }), name).rejects.toThrow()
    await expect(client.readResource({ uri: 'uno://references/lane-roles' })).rejects.toThrow()
  } finally { await client.close(); await http.close() }
}, 30000)
