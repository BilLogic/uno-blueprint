import { createClient } from '@supabase/supabase-js'

import { serverSearchConfig } from '@/lib/agent/server/searchConfig'
export { serverSearchConfig }

// This runtime contract matches the fixed vector space in the cell-search recipe.
const INDEX = { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 } as const
const BATCH_SIZE = 5

type PendingCell = { cell_id: string; document: string; content_hash: string }

/** A bounded operator request: read cells, embed documents, store only index rows. */
export function createCellSearchIndexer(options: {
  url: string
  publishableKey: string
  search: ReturnType<typeof serverSearchConfig>
  fetch?: typeof fetch
}): (request: Request) => Promise<Response> {
  const fetcher = options.fetch ?? fetch
  return async request => {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const jwt = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!jwt) return new Response(null, { status: 401 })
    const search = options.search
    if (!search) return Response.json({ error: 'The document embedding configuration is unavailable.' }, { status: 503 })
    if (search.index.provider !== INDEX.provider || search.index.model !== INDEX.model || search.index.dimensions !== INDEX.dimensions)
      return Response.json({ error: `The document index requires ${INDEX.provider}/${INDEX.model} with ${INDEX.dimensions} dimensions.` }, { status: 503 })
    const key = search.apiKey
    const client = createClient(options.url, options.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetcher, headers: { Authorization: `Bearer ${jwt}` } },
    })
    let indexed = 0
    let stale = 0
    try {
      const identity = await client.auth.getUser(jwt)
      if (identity.error || !identity.data.user) return new Response(null, { status: 401 })
      const confirmer = await client.from('profiles').select('may_confirm').eq('user_id', identity.data.user.id).maybeSingle()
      if (confirmer.error || !confirmer.data?.may_confirm) return new Response(null, { status: 403 })
      const pending = await client.rpc('cell_search_pending', { p_limit: BATCH_SIZE })
      if (pending.error || !Array.isArray(pending.data)) throw new Error()
      const cells = pending.data as PendingCell[]
      for (const cell of cells) {
        const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${INDEX.model}:embedContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ model: `models/${INDEX.model}`, content: { parts: [{ text: cell.document }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: INDEX.dimensions }),
          signal: AbortSignal.timeout(8000),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
          const message = body.error?.message
          const quota = response.status === 429 || response.status === 402 || /quota|billing|budget/i.test(message ?? '')
          const safe = quota && typeof message === 'string'
            ? message.replaceAll(key, '[redacted]').replaceAll(cell.document, '[document withheld]')
              .replace(/AIza[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]').slice(0, 1500)
            : `Embedding provider refused HTTP ${response.status}; response withheld.`
          return Response.json({ indexed, stale, more: false, provider: { status: response.status, message: safe } })
        }
        const body = await response.json() as { embedding?: { values?: number[] } }
        const values = body.embedding?.values
        if (!values || values.length !== INDEX.dimensions || !values.every(Number.isFinite) || !values.some(value => value !== 0)) throw new Error()
        const stored = await client.rpc('store_cell_search_embedding', {
          p_cell_id: cell.cell_id, p_model: INDEX.model,
          p_embedding: JSON.stringify(values), p_content_hash: cell.content_hash,
        })
        if (stored.error) throw new Error()
        if (stored.data === true) indexed++
        else stale++
      }
      return Response.json({ indexed, stale, more: cells.length === BATCH_SIZE })
    } catch {
      return Response.json({ indexed, stale, error: 'Index batch failed; credentials and document text withheld.' }, { status: 500 })
    }
  }
}
