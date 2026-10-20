import { describe, expect, it } from 'vitest'
import { indexDocuments } from '../backfill-tool-search.mjs'

const context = { url: 'https://database.example.test', publishableKey: 'fixture-public', jwt: 'fixture-person' }
describe('the document indexing operator report', () => {
  it('reports zero indexed cells as unverified', async () => {
    const result = await indexDocuments(context, async () => Response.json({ indexed: 0, stale: 0, more: false }))
    expect(result.unverified).toContain('Indexed 0')
    expect(result.count).toBeUndefined()
  })
  it('counts the documents it actually indexed across batches', async () => {
    let batch = 0
    const result = await indexDocuments(context, async () => Response.json({ indexed: ++batch === 1 ? 5 : 2, stale: 0, more: batch === 1 }))
    expect(result.count).toBe(7)
  })
  it('redacts a provider refusal and ends with the rerun command', async () => {
    const result = await indexDocuments(context, async () => Response.json({ indexed: 0, stale: 0, more: false, provider: { status: 429, message: 'Budget exhausted. Bearer fixture-secret' } }))
    expect(result.unverified).not.toContain('fixture-secret')
    expect(result.unverified).toMatch(/Run npm run index:tool-search\.$/)
  })
  it.each([async () => new Response(null, { status: 403 }), async () => { throw new Error('private reply') }])('ends failures with the rerun command without exposing replies', async fetcher => {
    const result = await indexDocuments(context, fetcher)
    expect(result.findings[0]).toMatch(/Run npm run index:tool-search\.$/)
    expect(JSON.stringify(result)).not.toContain('private reply')
  })
})
