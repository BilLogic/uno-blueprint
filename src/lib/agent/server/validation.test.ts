// @vitest-environment node
import { expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { openMcpHttp } from '@/test/mcpHttp'

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

it.each(['clean', 'framed cell', 'missing lanes', 'self edge', 'frame and self edge'])('a caller validates a %s service without changing its blueprint', async defect => {
  const blueprint = { id: id(1), name: 'Request support', entity_examples: {}, phases: [{
    id: id(2), name: 'Arrival', position: 0, scenarios: [{
      id: id(3), name: 'Ask for support', position: 0, layout: 'stacked', steps: [{ id: id(4), name: 'Describe request' }], paths: [{
        id: id(5), name: 'First request', kind: 'happy', path_steps: [{ step_id: id(4), position: 0 }],
        lanes: [{ id: id(6), name: 'Customer', lane_role: 'customer_actions', position: 0 }], cells: [], dependencies: [],
      }],
    }],
  }] }
  const path = blueprint.phases[0].scenarios[0].paths[0]
  if (defect === 'missing lanes') path.lanes = []
  if (defect.includes('self edge')) {
    Object.assign(path, { cells: [{ id: id(7), lane_id: id(6), step_id: id(4), content: 'Describe request' }], dependencies: [{ source_lane_id: id(6), source_step_id: id(4), target_lane_id: id(6), target_step_id: id(4), kind: 'leads_to' }] })
  }
  if (defect === 'framed cell') Object.assign(path, { cells: [{ id: id(7), lane_id: id(6), step_id: id(4), content: 'Describe request' }] })
  if (defect === 'frame and self edge' || defect === 'framed cell') Object.assign(path.cells[0], { frame: 'https://example.test/frame.png' })
  const before = structuredClone(blueprint)
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'validation-key', alg: 'ES256' }] }
  const token = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'validation-key' })
    .setSubject(id(99)).setAudience('authenticated').setExpirationTime('5m').sign(privateKey)
  const database = await openMcpHttp(async request => request.url.includes('/rpc/read_service_blueprint')
    ? Response.json(blueprint) : Response.json({ message: 'No mutation endpoint in this database.' }, { status: 405 }))
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: database.url, publishableKey: 'sb_publishable_test', resourceUrl: http.url, jwks })
  const caller = new Client({ name: 'validation-caller', version: '1' })
  try {
    await caller.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
    const reply = await caller.callTool({ name: 'validate_blueprint', arguments: { service_id: id(1) } })
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true)
    const verdict = JSON.parse((reply.content as { text: string }[])[0].text)
    expect(verdict).toMatchObject({ service_id: id(1), valid: ['clean', 'framed cell'].includes(defect) })
    if (['clean', 'framed cell'].includes(defect)) expect(verdict.errors).toEqual([])
    if (defect === 'missing lanes') expect(verdict.errors).toEqual(expect.arrayContaining([expect.objectContaining({ location: expect.objectContaining({ id: id(5), jsonpath: expect.stringContaining('.lanes') }) })]))
    if (defect.includes('self edge')) expect(verdict.errors).toEqual(expect.arrayContaining([expect.objectContaining({ location: expect.objectContaining({ id: id(7) }), message: expect.stringContaining('itself') })]))
    expect(blueprint).toEqual(before)
  } finally { await caller.close(); await http.close(); await database.close() }
})
