#!/usr/bin/env node
/** Embed existing documents; the authenticated function writes only its index. */
import { withSearchProject, redactSearchCredentials } from './search-project.mjs'
import { whenRun } from './verdict.mjs'

const what = 'the document search index'
const rerun = 'Run npm run index:tool-search.'

export async function indexDocuments({ url, publishableKey, jwt }, fetcher = fetch) {
  let indexed = 0
  let stale = 0
  try {
    // Bounded operator run: another invocation can resume remaining documents.
    for (let batch = 0; batch < 100; batch++) {
      const response = await fetcher(`${url}/functions/v1/index-cell-search`, {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: publishableKey },
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) return { what, findings: [`Index request refused HTTP ${response.status}; indexed ${indexed}, stale ${stale}. Credentials and replies withheld. ${rerun}`] }
      const result = await response.json()
      if (!Number.isInteger(result.indexed) || !Number.isInteger(result.stale) || result.indexed < 0 || result.stale < 0) throw new Error()
      indexed += result.indexed
      stale += result.stale
      if (result.provider) return { what, unverified: `Indexed ${indexed}, stale ${stale}. Provider HTTP ${result.provider.status}: ${redactSearchCredentials(result.provider.message)} ${rerun}` }
      if (!result.more) return indexed === 0
        ? { what, unverified: `Indexed 0, stale ${stale}; no documents were indexed. ${rerun}` }
        : { what, count: indexed, line: `Index run complete: indexed ${indexed}, stale ${stale}. Only embedding rows were written; no blueprint rows were changed.` }
    }
    return { what, unverified: `Indexed ${indexed}, stale ${stale}; the batch limit was reached. ${rerun}` }
  } catch {
    return { what, findings: [`Index run failed; indexed ${indexed}, stale ${stale}. Credentials and replies withheld. ${rerun}`] }
  }
}
export const judge = () => withSearchProject(what, 'npm run index:tool-search', indexDocuments)
whenRun(import.meta.url, judge)
