// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

const live = Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS)
it.runIf(live)('every write works over MCP; contributions are proposals, approval revalidates, and both people reach the durable log', async () => {
  const service = 'f0000000-0000-4000-8000-000000000010'
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test',
    resourceUrl: http.url, jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: postgrestFetch(POSTGREST_URL) })
  const clients: Client[] = []
  const called = new Set<string>()
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  async function connect(jwt: string) {
    const client = new Client({ name: 'write-database-seam', version: '1' }); clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    return client
  }
  async function call(client: Client, name: string, args: Record<string, unknown>, confirmed = true) {
    const reply = await client.callTool({ name, arguments: { ...args, service_id: service, confirmed } })
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
    called.add(name)
    return JSON.parse((reply.content as { text: string }[])[0].text)
  }
  try {
    const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
    const contributor = await connect(process.env.MCP_TEST_OTHER_JWT!)
    const write = async (name: string, args: Record<string, unknown>) => {
      const before = await db.from('authoring_changes').select('id')
      expect(before.error).toBeNull()
      const result = await call(owner, name, args)
      const after = await db.from('authoring_changes').select('id,revert')
      expect(after.error).toBeNull()
      const priorIds = new Set(before.data!.map(row => row.id))
      const added = after.data!.filter(row => !priorIds.has(row.id))
      if (result.outcome === 'applied') {
        expect(added, name).toHaveLength(1)
        expect(added[0].revert, name).toMatchObject({ kind: 'captured_rows', rows: expect.any(Array) })
        expect((added[0].revert as { rows: unknown[] }).rows.length, name).toBeGreaterThan(0)
      } else expect(added, name).toHaveLength(0)
      return result
    }
    const newService = await write('create_service', { name: 'Another service' })
    expect((await db.from('services').select('name').eq('id', newService.result).single()).data?.name).toBe('Another service')
    const phase = (await write('create_phase', { name: 'MCP phase' })).result
    const created = (await write('create_scenario', { phase_id: phase, name: 'MCP scenario', step_count: 2 })).result
    const path = created.path_id
    const scenario = created.scenario_id
    await write('create_lane', { scenario_id: scenario, name: 'Service team', lane_role: 'frontstage_actions' })
    const lane = (await db.from('lanes').select('id').eq('path_id', path).single()).data!.id
    const steps = (await db.from('path_steps').select('step_id').eq('path_id', path).order('position')).data!
    const cell = (await write('upsert_cell', { path_id: path, lane_id: lane, step_id: steps[0].step_id, content: 'Receive request' })).result.id
    const second = (await write('upsert_cell', { path_id: path, lane_id: lane, step_id: steps[1].step_id, content: 'Review request' })).result.id
    await write('update_cell', { cell_id: cell, content: 'Receive and record request', function: 'Capture needs', form: 'Conversation', value_props: [{ for: 'Owner', value: 'A clear request' }] })
    await write('create_cell_dependency', { source_cell_id: cell, target_cell_id: second, kind: 'leads_to', label: 'Review follows receipt' })
    expect((await db.from('cell_dependencies').select('note').eq('source_cell_id', cell).eq('target_cell_id', second).single()).data?.note).toBe('Review follows receipt')
    const step = (await write('create_step', { path_id: path, name: 'Follow up' })).result
    expect((await db.from('steps').select('name').eq('id', step).single()).data?.name).toBe('Follow up')
    const alternate = (await write('create_path', { scenario_id: scenario, name: 'Alternate request', lane_source_path_id: path })).result
    expect((await db.from('paths').select('name').eq('id', alternate).single()).data?.name).toBe('Alternate request')
    const copy = (await write('duplicate_path', { source_path_id: path, name: 'Copied request', kind: 'variant' })).result
    expect((await db.from('cells').select('id').eq('path_id', copy)).data).toHaveLength(2)
    const scenarioCopy = (await write('duplicate_scenario', { source_scenario_id: scenario, name: 'Copied scenario' })).result
    expect((await db.from('paths').select('id').eq('scenario_id', scenarioCopy)).data).toHaveLength(3)
    await write('update_path', { path_id: path, name: 'Main request' })
    expect((await db.from('paths').select('name').eq('id', path).single()).data?.name).toBe('Main request')
    await write('update_phase', { phase_id: phase, name: 'Named phase' })
    await write('update_scenario', { scenario_id: scenario, name: 'Named scenario' })
    await write('update_step', { step_id: step, name: 'Named step' })
    await write('update_lane', { lane_id: lane, name: 'Named lane' })
    const stakeholder = (await write('create_stakeholder', { name: 'Dispatch team', kind: 'staff' })).result
    await write('update_stakeholder', { stakeholder_id: stakeholder, summary: 'Handles incoming requests', aliases: ['Dispatch'] })
    expect((await db.from('stakeholders').select('summary').eq('id', stakeholder).single()).data?.summary).toBe('Handles incoming requests')
    const evidence = (await write('create_evidence', { cell_id: cell, kind: 'interview', title: 'Team interview' })).result
    await write('update_evidence', { evidence_id: evidence, note: 'The team described this sequence.' })
    expect((await db.from('evidence').select('note, contributed_by').eq('id', evidence).single()).data).toEqual({ note: 'The team described this sequence.', contributed_by: 'b0000000-0000-4000-8000-000000000001' })
    const slice = (await write('create_slice', { title: 'Request brief', kind: 'journey', cell_ids: [cell, second] })).result
    const sliceId = typeof slice === 'string' ? slice : slice.id ?? slice.slice_id
    await write('update_slice', { slice_id: sliceId, title: 'Incoming request brief' })
    await write('replace_slides', { slice_id: sliceId, slides: [{ cells: [second, cell], title: 'Review the sequence' }] })
    expect((await db.from('slides').select('cell_ids').eq('slice_id', sliceId).order('position')).data).toEqual([{ cell_ids: [second, cell] }])
    expect((await write('share_slice', { slice_id: sliceId })).result.link).toMatch(/\/shared\/[0-9a-f]{64}$/)
    expect((await write('unshare_slice', { slice_id: sliceId })).result).toEqual({ links_stopped: 1 })
    const finding = (await write('create_finding', { source: 'audit', check_key: 'source-gap', severity: 'warn', impact: 'medium', effort: 'low', summary: 'The follow-up source is missing.', cell_ids: [second] })).result
    const originalFinding = (await db.from('audit_findings').select('*').eq('id', finding).single()).data
    const unchanged = await call(contributor, 'create_finding', { source: 'whatif', check_key: 'source-gap', severity: 'critical', impact: 'high', effort: 'high', summary: 'Another person replaced this observation.', cell_ids: [second] }, false)
    expect(unchanged.outcome).toBe('unchanged')
    expect(unchanged.message).toContain('original recorder')
    expect((await db.from('audit_findings').select('*').eq('id', finding).single()).data).toEqual(originalFinding)
    await write('update_finding', { finding_id: finding, status: 'resolved' })
    expect((await db.from('audit_findings').select('status').eq('id', finding).single()).data?.status).toBe('resolved')
    const ownEvidence = await call(contributor, 'create_evidence', { cell_id: cell, kind: 'interview', title: 'A contributed source' }, false)
    expect(ownEvidence.outcome).toBe('applied')
    expect((await call(contributor, 'update_evidence', { evidence_id: ownEvidence.result, note: 'My source wording' }, false)).outcome).toBe('applied')
    expect((await db.from('evidence').select('note').eq('id', ownEvidence.result).single()).data?.note).toBe('My source wording')
    expect((await call(contributor, 'update_evidence', { evidence_id: evidence, note: 'Unapproved source wording' })).outcome).toBe('proposed')
    expect((await db.from('evidence').select('note').eq('id', evidence).single()).data?.note).toBe('The team described this sequence.')
    const ownFinding = await call(contributor, 'create_finding', { source: 'audit', check_key: 'contributed-gap', severity: 'warn', impact: 'medium', effort: 'low', summary: 'A contributed gap', cell_ids: [cell] }, false)
    expect(ownFinding.outcome).toBe('applied')
    const revisedFinding = await call(contributor, 'create_finding', { source: 'whatif', check_key: 'contributed-gap', severity: 'critical', impact: 'high', effort: 'high', summary: 'The recorder revised this observation.', cell_ids: [cell] }, false)
    expect(revisedFinding.outcome).toBe('applied')
    expect(revisedFinding.result).toBe(ownFinding.result)
    expect((await db.from('audit_findings').select('summary, recorded_by').eq('id', ownFinding.result).single()).data).toEqual({ summary: 'The recorder revised this observation.', recorded_by: 'b0000000-0000-4000-8000-000000000002' })
    for (const status of ['dismissed', 'open']) {
      expect((await call(contributor, 'update_finding', { finding_id: finding, status })).outcome).toBe('proposed')
      expect((await db.from('audit_findings').select('status').eq('id', finding).single()).data?.status).toBe('resolved')
    }
    const before = await db.from('cells').select('*').eq('id', cell).single()
    expect(before.data).toMatchObject({ content: 'Receive and record request', function: 'Capture needs', form: 'Conversation' })
    const proposed = await call(contributor, 'update_cell', { cell_id: cell, form: 'Written request' })
    expect(proposed.outcome).toBe('proposed')
    expect(JSON.stringify(await owner.callTool({ name: 'list_suggested_changes', arguments: {} }))).toContain(proposed.suggested_change_id)
    expect((await db.from('cells').select('*').eq('id', cell).single()).data).toEqual(before.data)
    await write('approve_suggested_change', { suggested_change_id: proposed.suggested_change_id })
    expect((await db.from('cells').select('form').eq('id', cell).single()).data?.form).toBe('Written request')
    const log = await db.from('authoring_changes').select('author_id, proposed_by, approved_by').eq('proposed_by', 'b0000000-0000-4000-8000-000000000002')
    expect(log.data).toEqual([{ author_id: 'c0000000-0000-4000-8000-000000000001', proposed_by: 'b0000000-0000-4000-8000-000000000002', approved_by: 'b0000000-0000-4000-8000-000000000001' }])
    const structural = await call(contributor, 'create_phase', { name: 'Suggested phase' })
    expect((await db.from('phases').select('id').eq('name', 'Suggested phase')).data).toEqual([])
    await write('approve_suggested_change', { suggested_change_id: structural.suggested_change_id })
    expect((await db.from('phases').select('id').eq('name', 'Suggested phase')).data).toHaveLength(1)
    const declined = await call(contributor, 'update_cell', { cell_id: cell, summary: 'A declined summary' })
    await write('decline_suggested_change', { suggested_change_id: declined.suggested_change_id })
    expect((await db.from('suggested_changes').select('status').eq('id', declined.suggested_change_id).single()).data?.status).toBe('declined')
    const stale = await call(contributor, 'update_cell', { cell_id: cell, content: 'Stale proposed wording' })
    await write('update_cell', { cell_id: cell, content: 'Newer reviewed wording' })
    const refused = await owner.callTool({ name: 'approve_suggested_change', arguments: { suggested_change_id: stale.suggested_change_id } })
    expect(refused.isError).toBe(true)
    expect(JSON.stringify(refused)).toContain('changed since this proposal')
    expect((await db.from('cells').select('content').eq('id', cell).single()).data?.content).toBe('Newer reviewed wording')
    const invalid = await owner.callTool({ name: 'create_lane', arguments: { scenario_id: scenario, name: 'Bad lane', lane_role: 'invented_role', confirmed: true } })
    expect(invalid.isError).toBe(true)
    expect((await db.from('lanes').select('id').eq('name', 'Bad lane')).data).toEqual([])
    const oversized = await owner.callTool({ name: 'duplicate_path', arguments: { source_path_id: 'd0000000-0000-4000-8000-000000000050', name: 'Oversized copy', confirmed: true } })
    expect(oversized.isError).toBe(true)
    expect(JSON.stringify(oversized)).toContain('50 cells')
    expect((await db.from('paths').select('id').eq('name', 'Oversized copy')).data).toEqual([])
    const allWrites = TOOL_DEFINITIONS.filter(tool => tool.surface === 'write').map(tool => tool.name).sort()
    expect([...called].filter(name => allWrites.includes(name)).sort()).toEqual(allWrites)
  } finally { await Promise.all(clients.map(client => client.close())); await http.close() }
}, 30000)
