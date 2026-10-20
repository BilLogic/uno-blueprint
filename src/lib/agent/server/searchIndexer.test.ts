// @vitest-environment node
import { expect, it } from 'vitest'
import { createCellSearchIndexer } from '@/lib/agent/server/searchIndexer'

it('an authenticated index batch reads existing cells and writes only embeddings using a server-held document key', async () => {
  const writes: string[] = []
  const key = 'fixture-only-server-key'
  const handler = createCellSearchIndexer({ url: 'https://database.example.test', publishableKey: 'public-project-key', search: { apiKey: key, index: { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 } },
    fetch: async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(key)
        expect(JSON.parse(String(init?.body))).toMatchObject({ taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 })
        return Response.json({ embedding: { values: Array<number>(768).fill(1) } })
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer person-token')
      expect(String(init?.body ?? '')).not.toContain(key)
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'c0000000-0000-4000-8000-000000000001' })
      if (url.includes('/rest/v1/profiles?')) return Response.json({ may_confirm: true })
      if (url.endsWith('/rpc/cell_search_pending')) return Response.json([{ cell_id: 'f0000000-0000-4000-8000-110300010001', document: 'Receive a request', content_hash: 'fixture-hash' }])
      expect(url).toBe('https://database.example.test/rest/v1/rpc/store_cell_search_embedding')
      writes.push(url)
      return Response.json(true)
    },
  })
  const response = await handler(new Request('https://function.example.test', { method: 'POST', headers: { Authorization: 'Bearer person-token' } }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ indexed: 1, stale: 0, more: false })
  expect(writes).toHaveLength(1)
})

it('a provider quota refusal is returned with counts and its key redacted, with no embedding or blueprint write', async () => {
  const key = 'fixture-only-server-key'
  const handler = createCellSearchIndexer({ url: 'https://database.example.test', publishableKey: 'public-project-key', search: { apiKey: key, index: { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 } },
    fetch: async input => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'c0000000-0000-4000-8000-000000000001' })
      if (url.includes('/rest/v1/profiles?')) return Response.json({ may_confirm: true })
      if (url.endsWith('/rpc/cell_search_pending')) return Response.json([{ cell_id: 'f0000000-0000-4000-8000-110300010001', document: 'Receive a request', content_hash: 'fixture-hash' }])
      expect(url).toContain('generativelanguage.googleapis.com')
      return Response.json({ error: { message: `Monthly quota exhausted; key ${key}`, status: 'RESOURCE_EXHAUSTED' } }, { status: 429 })
    },
  })
  const response = await handler(new Request('https://function.example.test', { method: 'POST', headers: { Authorization: 'Bearer person-token' } }))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({ indexed: 0, stale: 0, more: false, provider: { status: 429, message: 'Monthly quota exhausted; key [redacted]' } })
  expect(JSON.stringify(body)).not.toContain(key)
})

it('an unsigned request sends no provider request and writes nothing', async () => {
  const handler = createCellSearchIndexer({ url: 'https://database.example.test', publishableKey: 'public-project-key', search: { apiKey: 'held-on-server', index: { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 } },
    fetch: async () => { throw new Error('Unsigned calls must not reach a dependency.') },
  })
  expect((await handler(new Request('https://function.example.test', { method: 'POST' }))).status).toBe(401)
})

it('a signed-in person without confirmation rights cannot spend the document embedding key', async () => {
  const handler = createCellSearchIndexer({ url: 'https://database.example.test', publishableKey: 'public-project-key', search: { apiKey: 'held-on-server', index: { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 } },
    fetch: async input => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'c0000000-0000-4000-8000-000000000001' })
      expect(url).toContain('/rest/v1/profiles?')
      return Response.json({ may_confirm: false })
    },
  })
  expect((await handler(new Request('https://function.example.test', { method: 'POST', headers: { Authorization: 'Bearer person-token' } }))).status).toBe(403)
})

it('a configured model mismatch names the index requirement instead of a missing key', async () => {
  const handler = createCellSearchIndexer({ url: 'https://database.example.test', publishableKey: 'public-project-key',
    search: { apiKey: 'held-on-server', index: { provider: 'google', model: 'another-model', dimensions: 768 } },
    fetch: async () => { throw new Error('Invalid configuration must not reach a dependency.') },
  })
  const response = await handler(new Request('https://function.example.test', { method: 'POST', headers: { Authorization: 'Bearer person-token' } }))
  expect(response.status).toBe(503)
  expect(await response.text()).toContain('requires google/gemini-embedding-001 with 768 dimensions')
})
