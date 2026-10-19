#!/usr/bin/env node
/** Real Auth and Edge proof; only temporary private conversation rows are written. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { whenRun } from './verdict.mjs'

export async function judge() {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') return { what: 'the remote MCP proof', findings: ['Could not read .env.'], closing: 'Run `npm run test:tool-server:project`.' }
  }
  const env = { ...dotenv, ...process.env }
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL',
    'TOOL_SERVER_TEST_PASSWORD', 'TOOL_SERVER_OTHER_EMAIL', 'TOOL_SERVER_OTHER_PASSWORD']
  const missing = required.filter(name => !env[name])
  if (missing.length) return {
    what: 'the remote MCP proof',
    unverified: `Set ${missing.join(', ')} in .env or the environment; see .env.example. Run npm run test:tool-server:project.`,
  }
  const databases = []
  const clients = []
  const identities = []
  const id = crypto.randomUUID()
  const fact = `Private tracer fact ${crypto.randomUUID()}`
  let inserted = false
  let step = 'opening the authenticated MCP clients'
  const findings = []
  try {
    const endpoint = new URL(`${env.SUPABASE_URL}/functions/v1/uno-tools`)
    for (const prefix of ['TEST', 'OTHER']) {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      databases.push(db)
      step = `signing in the ${prefix.toLowerCase()} caller`
      const { data, error } = await db.auth.signInWithPassword({
        email: env[`TOOL_SERVER_${prefix}_EMAIL`], password: env[`TOOL_SERVER_${prefix}_PASSWORD`],
      })
      assert(!error && data.session, 'Test login must succeed.')
      identities.push(data.user.id)
      const client = new Client({ name: 'remote-read-proof', version: '1' })
      clients.push(client)
      step = `connecting the ${prefix.toLowerCase()} MCP client`
      await client.connect(new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      }))
    }
    step = 'reading the caller profile through MCP'
    const profile = await clients[0].callTool({ name: 'get_profile', arguments: {} })
    assert(!profile.isError && JSON.stringify(profile).includes('may_confirm'), 'Caller profile read completes.')
    step = 'reading the reference resource through MCP'
    const resources = await clients[0].listResources()
    assert(resources.resources.some(resource => resource.uri === 'uno://references/lane-roles'))
    assert(JSON.stringify(await clients[0].readResource({ uri: 'uno://references/lane-roles' })).includes('frontstage'))
    step = 'writing the temporary conversation'
    assert.notEqual(identities[0], identities[1], 'The test needs two distinct callers.')
    assert.equal((await databases[0].from('agent_sessions').insert({ id, title: 'Temporary MCP proof' })).error, null)
    inserted = true
    assert.equal((await databases[0].from('agent_messages').insert({
      session_id: id, seq: 0, kind: 'user', payload: { kind: 'user', text: fact },
    })).error, null)
    step = 'reading the private transcript through MCP'
    const call = client => client.callTool({ name: 'get_session', arguments: { session_id: id } })
    assert(JSON.stringify(await call(clients[0])).includes(fact), 'Owner reads the private fact.')
    const other = JSON.stringify(await call(clients[1]))
    assert(!other.includes(fact) && other.includes('No session with id'), 'Other caller cannot read the private fact.')
    step = 'reading the blueprint through MCP'
    const blueprint = await clients[0].callTool({ name: 'list_blueprint', arguments: { granularity: ['phase'] } })
    assert(!blueprint.isError && Array.isArray(blueprint.content), 'Blueprint read completes.')
    step = 'checking missing and invalid JWT refusals'
    for (const token of [undefined, 'invalid-token']) {
      const response = await fetch(endpoint, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
      assert.equal(response.status, 401)
      assert(response.headers.get('WWW-Authenticate')?.includes('resource_metadata'))
    }

  } catch {
    findings.push(`Remote MCP proof failed while ${step}. Credentials and response data withheld.`)
  } finally {
    if (inserted) {
      const { error, data } = await databases[0].from('agent_sessions').delete().eq('id', id).select('id')
      if (error || data?.length !== 1) findings.push('Temporary conversation cleanup failed.')
    }
    await Promise.allSettled(clients.map(client => client.close()))
    await Promise.allSettled(databases.map(db => db.auth.signOut({ scope: 'local' })))
  }
  return {
    what: 'the remote MCP proof', count: 1, findings,
    line: 'PASS: real Auth logins; caller profile; reference resource; owner MCP read; other-owner RLS refusal; blueprint read; missing and invalid JWT refusals. Temporary conversation removed.',
    closing: 'Run `npm run test:tool-server:project`.',
  }
}
whenRun(import.meta.url, judge)
