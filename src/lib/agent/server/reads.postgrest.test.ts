// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('every database read has an MCP happy path, its own refusal where it has a target or private rows, and a JWT refusal; resources and the server-only search key cross the same boundary', async () => {
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
      ['list_services', {}, 'f0000000-0000-4000-8000-000000000010'],
      ['validate_blueprint', { service_id: 'f0000000-0000-4000-8000-000000000010' }, '"service_id":"f0000000-0000-4000-8000-000000000010"'],
      ['list_suggested_changes', {}, '[]'],
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
    const readNames = new Set(TOOL_DEFINITIONS.filter(tool => tool.surface === 'read').map(tool => tool.name))
    const listed = (await client.listTools()).tools.map(tool => tool.name).filter(name => readNames.has(name)).sort()
    expect(listed).toEqual(cases.map(([name]) => name).sort())
    expect(listed).toEqual(TOOL_DEFINITIONS.filter(tool => tool.surface === 'read' && tool.browserBacked === false && !tool.resourceOnly).map(tool => tool.name).sort())
    for (const [name, args, fact] of cases) {
      const reply = await client.callTool({ name, arguments: args })
      expect(reply.isError, `${name}: ${JSON.stringify(reply)}`).not.toBe(true)
      const text = (reply.content as { text: string }[]).map(item => item.text).join('\n')
      expect(text, name).toContain(fact)
      expect(text, name).not.toContain(secret)
      if (name === 'list_sessions') expect(text).not.toContain('Second private session')
    }
    expect(embedded).toBe(1)
    // A read's own refusal: an id it cannot serve, or another caller's private
    // rows. Reads of business-wide rows with no target have none of their own;
    // the unauthenticated refusal below covers every read.
    const unknown = 'f0000000-0000-4000-8000-0000000fffff'
    const other = new Client({ name: 'all-read-seam-other', version: '1' })
    await other.connect(new StreamableHTTPClientTransport(new URL(http.url),
      { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TEST_OTHER_JWT}` } } }))
    const refusals: [string, Record<string, unknown>, Client, string][] = [
      ['get_profile', {}, other, 'Reader profile'],
      ['validate_blueprint', { service_id: unknown }, client, '"service_id"'],
      ['list_blueprint', { granularity: ['cell'], service: 'No such service', limit: 500 }, client, cellId],
      ['get_blueprint', { scenario_id: unknown }, client, cellId],
      ['get_cell', { cell_id: unknown }, client, cell.content.trim().split('\n')[0]],
      ['get_slice', { slice_id: unknown }, client, slice.title],
      ['list_cell_dependencies', { cell_id: unknown }, client, 'A persisted condition'],
      ['list_evidence', { cell_id: unknown }, client, 'Reader seam interview'],
      ['get_evidence', { evidence_ids: [unknown] }, client, 'A persisted source note'],
      ['list_findings', { status: 'all', cell_id: unknown }, client, 'A persisted finding'],
      ['list_sessions', {}, other, 'First private session'],
      ['get_session', { session_id: 'd0000000-0000-4000-8000-000000000002' }, client, 'The second private fact.'],
    ]
    try {
      for (const [name, args, caller, withheld] of refusals) {
        const reply = await caller.callTool({ name, arguments: args })
        const text = (reply.content as { text: string }[]).map(item => item.text).join('\n')
        expect(reply.isError === true || !text.includes(withheld), `${name} served ${withheld}`).toBe(true)
      }
    } finally { await other.close() }
    const resources = await client.listResources()
    expect(resources.resources.some(row => row.uri === 'uno://references/lane-roles')).toBe(true)
    expect(JSON.stringify(await client.readResource({ uri: 'uno://references/lane-roles' }))).toContain('frontstage')
    await expect(client.readResource({ uri: 'uno://references/unknown' })).rejects.toThrow()
    delete headers.Authorization
    for (const [name, args] of cases) await expect(client.callTool({ name, arguments: args }), name).rejects.toThrow()
    await expect(client.readResource({ uri: 'uno://references/lane-roles' })).rejects.toThrow()
  } finally { await client.close(); await http.close() }
}, 30000)
