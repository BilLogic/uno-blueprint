// @vitest-environment node
import { expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createToolServer } from '@/lib/agent/server/mcp'
import { POSTGREST_URL, postgrestClientAs, postgrestFetch } from '@/test/postgrestDatabase'
import { openMcpHttp } from '@/test/mcpHttp'

it.runIf(Boolean(POSTGREST_URL && process.env.MCP_TEST_JWKS))('MCP ranks indexed cells by cosine and a provider quota refusal still returns keyword matches without its key', async () => {
  const key = 'only-the-fixture-provider-sees-this-key'
  let quota = false
  const dbFetch = postgrestFetch(POSTGREST_URL)
  const http = await openMcpHttp(request => handler(request))
  const handler = createToolServer({ url: POSTGREST_URL, publishableKey: 'sb_publishable_test', resourceUrl: http.url,
    jwks: JSON.parse(process.env.MCP_TEST_JWKS!),
    fetch: async (input, init) => {
      expect(String(init?.body ?? '')).not.toContain(key)
      return dbFetch(input, init)
    },
    search: { apiKey: key, index: { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 },
      fetch: async (_input, init) => {
        expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(key)
        expect(JSON.parse(String(init?.body)).taskType).toBe('RETRIEVAL_QUERY')
        return quota ? Response.json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Monthly quota exhausted.' } }, { status: 429 })
          : Response.json({ embedding: { values: [1, ...Array<number>(767).fill(0)] } })
      } },
  })
  const client = new Client({ name: 'indexed-search-seam', version: '1' })
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.MCP_TEST_OWNER_JWT}` }
  const db = postgrestClientAs(process.env.MCP_TEST_OWNER_JWT!)
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers } }))
    const { data: indexed, error } = await db.from('cells').select('id,content').order('id').limit(2)
    expect(error).toBeNull()
    expect(indexed).toHaveLength(2)
    const ranked = await client.callTool({ name: 'search_blueprint', arguments: { query: '__meaning_probe__', granularity: ['cell'] } })
    expect(ranked.isError).not.toBe(true)
    const text = JSON.stringify(ranked.content)
    expect(text).toContain('[meaning]')
    expect(text.indexOf(indexed![0].id)).toBeGreaterThan(-1)
    expect(text.indexOf(indexed![0].id)).toBeLessThan(text.indexOf(indexed![1].id))
    expect(text).not.toContain(key)
    quota = true
    const fallback = await client.callTool({ name: 'search_blueprint', arguments: { query: indexed![0].content, granularity: ['cell'] } })
    expect(fallback.isError).not.toBe(true)
    expect(JSON.stringify(fallback.content)).toContain('words only')
    expect(JSON.stringify(fallback.content)).toContain(indexed![0].id)
    expect(JSON.stringify(fallback)).not.toContain(key)
    delete headers.Authorization
    await expect(client.callTool({ name: 'search_blueprint', arguments: { query: 'anything' } })).rejects.toThrow()
  } finally { await client.close(); await http.close() }
}, 30000)
