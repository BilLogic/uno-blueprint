#!/usr/bin/env node
/** Embed existing documents; the authenticated function writes only its index. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { whenRun } from './verdict.mjs'

export async function judge() {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') return { what: 'the document search index', findings: ['Could not read .env.'] }
  }
  const env = { ...dotenv, ...process.env }
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD'].filter(name => !env[name])
  if (missing.length) return { what: 'the document search index', unverified: `Set ${missing.join(', ')}; see .env.example.` }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  let indexed = 0
  let stale = 0
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: env.TOOL_SERVER_TEST_EMAIL, password: env.TOOL_SERVER_TEST_PASSWORD })
    if (error || !data.session) throw new Error()
    // Bounded operator run: another invocation can resume remaining documents.
    for (let batch = 0; batch < 100; batch++) {
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/index-cell-search`, {
        method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: env.SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) return { what: 'the document search index', findings: [`Index request refused HTTP ${response.status}; indexed ${indexed}, stale ${stale}. Credentials and replies withheld.`] }
      const result = await response.json()
      if (!Number.isInteger(result.indexed) || !Number.isInteger(result.stale)) throw new Error()
      indexed += result.indexed
      stale += result.stale
      if (result.provider) return { what: 'the document search index', unverified: `Indexed ${indexed}, stale ${stale}. Provider HTTP ${result.provider.status}: ${String(result.provider.message).replace(/AIza[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')}` }
      if (!result.more) return { what: 'the document search index', count: 1, line: `Index run complete: indexed ${indexed}, stale ${stale}. Only embedding rows were written; no blueprint rows were changed.` }
    }
    return { what: 'the document search index', unverified: `Indexed ${indexed}, stale ${stale}; the batch limit was reached. Run again to resume.` }
  } catch {
    return { what: 'the document search index', findings: [`Index run failed; indexed ${indexed}, stale ${stale}. Credentials and replies withheld.`] }
  } finally { await db.auth.signOut({ scope: 'local' }) }
}
whenRun(import.meta.url, judge)
