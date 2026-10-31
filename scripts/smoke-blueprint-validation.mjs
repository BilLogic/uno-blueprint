#!/usr/bin/env node
/** Read the selected existing service through MCP; never seed or repair a live blueprint. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import assert from 'node:assert/strict'
import { whenRun } from './verdict.mjs'

export async function judge() {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const env = { ...dotenv, ...process.env }
  const what = 'the live blueprint validation read'
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD', 'TOOL_VALIDATION_SERVICE_ID']
  if (required.some(key => !env[key])) return { what, unverified: 'Set the synthetic tool-server login and TOOL_VALIDATION_SERVICE_ID in .env, then run npm run test:validation:project.' }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const client = new Client({ name: 'validation-read-proof', version: '1' })
  let step = 'signing in the synthetic reader'
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: env.TOOL_SERVER_TEST_EMAIL, password: env.TOOL_SERVER_TEST_PASSWORD })
    assert(!error && data.session)
    step = 'connecting the authenticated MCP reader'
    await client.connect(new StreamableHTTPClientTransport(new URL(`${env.SUPABASE_URL}/functions/v1/uno-tools`), {
      requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }))
    step = 'validating the selected existing service'
    const reply = await client.callTool({ name: 'validate_blueprint', arguments: { service_id: env.TOOL_VALIDATION_SERVICE_ID } })
    assert(!reply.isError)
    const verdict = JSON.parse(reply.content[0].text)
    assert.equal(verdict.service_id, env.TOOL_VALIDATION_SERVICE_ID)
    assert.equal(typeof verdict.valid, 'boolean')
    assert(Array.isArray(verdict.errors) && Array.isArray(verdict.warnings))
    assert.equal(verdict.valid, verdict.errors.length === 0)
    for (const issue of [...verdict.errors, ...verdict.warnings]) {
      assert(typeof issue.message === 'string' && issue.location?.id && issue.location.jsonpath)
    }
    return { what, count: 1, line: `PASS: read-only MCP validation completed. Blueprint verdict ${verdict.valid ? 'PASS' : 'FAIL'}; ${verdict.errors.length} violations and ${verdict.warnings.length} warnings. No blueprint rows were created, changed or deleted; business replies withheld.` }
  } catch {
    return { what, findings: [`Live validation failed while ${step}; credentials and business replies withheld. Run npm run test:validation:project.`] }
  } finally { await Promise.allSettled([client.close(), db.auth.signOut({ scope: 'local' })]) }
}
whenRun(import.meta.url, judge)
