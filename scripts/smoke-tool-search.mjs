#!/usr/bin/env node
/** Read-only proof against an operator-configured search index. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { whenRun } from './verdict.mjs'

export async function judge() {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') return { what: 'live tool search', findings: ['Could not read .env.'] }
  }
  const env = { ...dotenv, ...process.env }
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD'].filter(name => !env[name])
  if (missing.length) return { what: 'live tool search', unverified: `Set ${missing.join(', ')}; see .env.example.` }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const client = new Client({ name: 'live-search-proof', version: '1' })
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: env.TOOL_SERVER_TEST_EMAIL, password: env.TOOL_SERVER_TEST_PASSWORD })
    if (error || !data.session) throw new Error()
    await client.connect(new StreamableHTTPClientTransport(new URL(`${env.SUPABASE_URL}/functions/v1/uno-tools`), {
      requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }))
    const { data: cells, error: readError } = await db.from('cells').select('id, content').limit(1)
    if (readError) throw new Error()
    const query = cells?.[0]?.content?.match(/[\p{L}]{4,}/u)?.[0] ?? 'request review'
    const reply = await client.callTool({ name: 'search_blueprint', arguments: { query, granularity: ['cell'] } })
    if (reply.isError) throw new Error()
    const text = JSON.stringify(reply.content)
    if (/Bearer\s+\S+|AIza[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(text)) throw new Error()
    if (!cells?.length) return { what: 'live tool search', unverified: 'The configured project has no cells. MCP search answered, but ranked live cells and a matching keyword result cannot be verified.' }
    if (/WORDS ONLY|words only/.test(text)) return {
      what: 'live tool search',
      unverified: text.includes(cells[0].id)
        ? 'Keyword fallback returned an existing cell; live meaning matching did not run. The reply does not establish the provider failure reason.'
        : 'Meaning matching did not run, and keyword fallback did not return the selected cell.',
    }
    if (!text.includes(cells[0].id)) throw new Error()
    if (!/\[(?:words and )?meaning\]/.test(text)) return { what: 'live tool search', unverified: 'The provider embedded the question, but no indexed cell was returned by meaning. Existing cells still need document embeddings.' }
    return { what: 'live tool search', count: 1, line: 'PASS: MCP search returned an existing cell with meaning matching; no credential-shaped text was found in the reply.' }
  } catch {
    return { what: 'live tool search', findings: ['Live search failed. Credentials and business replies withheld.'], closing: 'Run npm run test:tool-search:project.' }
  } finally {
    await client.close()
    await db.auth.signOut({ scope: 'local' })
  }
}
whenRun(import.meta.url, judge)
