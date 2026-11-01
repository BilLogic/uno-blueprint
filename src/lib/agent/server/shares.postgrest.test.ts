// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import type { SharedSlice } from '@/lib/agent/server/sharedSlice'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

/**
 * A publishable key is not a JWT. The platform's gateway turns it into the
 * anonymous role; a standalone PostgREST would refuse it as a bad token, so
 * here it is taken off and the request goes out as anon, which is what the
 * gateway does.
 */
function asTheGatewayDoes(inner: typeof fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (!/^Bearer eyJ/.test(headers.get('Authorization') ?? '')) headers.delete('Authorization')
    return inner(input, { ...init, headers })
  }
}

const live = Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS)
it.runIf(live)('a slice across two services is shared by a link that opens its cited cells, live, and refuses every other cell', async () => {
  const service = 'f0000000-0000-4000-8000-000000000010'
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test',
    resourceUrl: http.url, jwks: JSON.parse(process.env.MCP_TEST_JWKS!), fetch: asTheGatewayDoes(postgrestFetch(POSTGREST_URL)) })
  const clients: Client[] = []
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  async function connect(jwt: string) {
    const client = new Client({ name: 'slice-share-seam', version: '1' }); clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${jwt}` } } }))
    return client
  }
  async function call(client: Client, name: string, args: Record<string, unknown>) {
    const reply = await client.callTool({ name, arguments: { confirmed: true, ...args } })
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
    return JSON.parse((reply.content as { text: string }[])[0].text)
  }
  /** What anyone holding the link reads: no sign-in, no key of their own. */
  async function open(link: string) {
    const response = await fetch(`${link}?format=json`)
    return { status: response.status, body: await response.text() }
  }
  try {
    const owner = await connect(process.env.MCP_TEST_OWNER_JWT!)
    const contributor = await connect(process.env.MCP_TEST_OTHER_JWT!)

    // Two cells on one path of the seeded service: one cited, one beside it.
    const held = await db.from('cells').select('id, path_id, content, paths!inner(scenarios!inner(phases!inner(service_id)))')
      .eq('paths.scenarios.phases.service_id', service).neq('path_id', 'd0000000-0000-4000-8000-000000000050').order('id')
    expect(held.error).toBeNull()
    const seeded = held.data!
    const cited = seeded.find(cell => seeded.some(peer => peer.path_id === cell.path_id && peer.id !== cell.id && peer.content !== cell.content))!
    const beside = seeded.find(cell => cell.path_id === cited.path_id && cell.id !== cited.id && cell.content !== cited.content)!
    expect(beside.content).not.toBe(cited.content)

    // A second service with two cells on one path.
    const other = (await call(owner, 'create_service', { name: 'Partner service' })).result as string
    const phase = (await call(owner, 'create_phase', { service_id: other, name: 'Partner phase' })).result
    const created = (await call(owner, 'create_scenario', { service_id: other, phase_id: phase, name: 'Partner scenario', step_count: 2 })).result
    await call(owner, 'create_lane', { service_id: other, scenario_id: created.scenario_id, name: 'Partner team', lane_role: 'partner_actions' })
    const lane = (await db.from('lanes').select('id').eq('path_id', created.path_id).single()).data!.id
    const steps = (await db.from('path_steps').select('step_id').eq('path_id', created.path_id).order('position')).data!
    const otherCited = (await call(owner, 'upsert_cell', { service_id: other, path_id: created.path_id, lane_id: lane, step_id: steps[0].step_id, content: 'Partner confirms the booking' })).result.id
    const otherBeside = (await call(owner, 'upsert_cell', { service_id: other, path_id: created.path_id, lane_id: lane, step_id: steps[1].step_id, content: 'Partner bills privately' })).result.id

    // A slice filed under one service, citing a cell from each.
    const slice = (await call(owner, 'create_slice', { service_id: service, title: 'Partner brief', kind: 'custom', cell_ids: [cited.id, otherCited] })).result
    const read = await owner.callTool({ name: 'get_slice', arguments: { slice_id: slice.id } })
    expect(JSON.stringify(read.content)).toContain(otherCited)
    expect((await db.from('slides').select('cell_ids').eq('slice_id', slice.id).order('position')).data)
      .toEqual([{ cell_ids: [cited.id] }, { cell_ids: [otherCited] }])

    // Someone who may not approve gets a proposal and no link.
    const proposed = await call(contributor, 'share_slice', { service_id: service, slice_id: slice.id })
    expect(proposed.outcome).toBe('proposed')
    expect(JSON.stringify(proposed)).not.toMatch(/[0-9a-f]{64}|"token"|"link"/)

    const shared = await call(owner, 'share_slice', { service_id: service, slice_id: slice.id })
    expect(shared.outcome).toBe('applied')
    const { token, link } = shared.result as { token: string; link: string }
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(link).toBe(`${http.url}/shared/${token}`)
    // Approving the proposal hands the approver a second working link.
    const approved = await call(owner, 'approve_suggested_change', { suggested_change_id: proposed.suggested_change_id })
    const second = approved.result as { token: string; link: string }
    expect(second.link).toBe(`${http.url}/shared/${second.token}`)
    expect(second.token).not.toBe(token)
    expect((await open(second.link)).status).toBe(200)
    const log = await db.from('authoring_changes').select('args, revert').in('fn', ['share_slice', 'approve_suggested_change'])
    const proposal = await db.from('suggested_changes').select('*').eq('id', proposed.suggested_change_id)
    for (const record of [log.data, proposal.data]) {
      expect(JSON.stringify(record)).not.toContain(token)
      expect(JSON.stringify(record)).not.toContain(second.token)
    }

    // The link opens exactly the cited cells, in slide order.
    const opened = await open(link)
    expect(opened.status).toBe(200)
    const seen = JSON.parse(opened.body) as SharedSlice
    expect(seen.title).toBe('Partner brief')
    expect(seen.slides.flatMap(slide => slide.cells.map(cell => cell.id))).toEqual([cited.id, otherCited])
    expect(seen.slides[1].cells[0]).toMatchObject({ service: 'Partner service', lane: 'Partner team', content: 'Partner confirms the booking' })
    for (const refused of [beside.id, otherBeside, beside.content, 'Partner bills privately']) expect(opened.body).not.toContain(refused)
    const plain = await fetch(link)
    expect(plain.headers.get('content-type')).toContain('text/plain')
    expect(await plain.text()).toContain('Partner confirms the booking')

    // The table of links is no request role's to read, signed in or not.
    const anonymous = await fetch(`${POSTGREST_URL}/slice_shares?select=*`)
    expect(anonymous.status).toBe(401)
    expect((await anonymous.json()).code).toBe('42501')
    const signedIn = await db.from('slice_shares').select('*')
    expect(signedIn.error?.code).toBe('42501')

    // A changed cell shows its new value through the link.
    await call(owner, 'update_cell', { service_id: other, cell_id: otherCited, content: 'Partner confirms the booking by text' })
    expect((await open(link)).body).toContain('Partner confirms the booking by text')

    // A guessed or altered token opens nothing, with the same sentence.
    for (const guess of [token.replace(/^./, token[0] === 'a' ? 'b' : 'a'), '0'.repeat(64), 'not-a-token']) {
      const refused = await open(`${http.url}/shared/${guess}`)
      expect(refused.status).toBe(404)
      expect(refused.body).toContain('This link does not open a slice')
    }

    // Unsharing stops the link.
    expect((await call(owner, 'unshare_slice', { service_id: service, slice_id: slice.id })).result).toEqual({ links_stopped: 2 })
    for (const stoppedLink of [link, second.link]) {
      const stopped = await open(stoppedLink)
      expect(stopped.status).toBe(404)
      expect(stopped.body).not.toContain('Partner')
    }

    // A slice is shared under the service it is filed under, and no other.
    const elsewhere = await owner.callTool({ name: 'share_slice', arguments: { service_id: other, slice_id: slice.id, confirmed: true } })
    expect(elsewhere.isError).toBe(true)
    expect(JSON.stringify(elsewhere.content)).toContain('filed under another service')
  } finally { await Promise.all(clients.map(client => client.close())); await http.close() }
}, 30000)
