#!/usr/bin/env node
/** Explicit live proof: create and rename only a new, clearly test-only service. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { whenRun } from './verdict.mjs'

export async function judge() {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const env = { ...dotenv, ...process.env }
  const what = 'live journey names'
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD']
  if (env.TOOL_STRUCTURE_LIVE_PROOF !== '1' || required.some(name => !env[name])) return {
    what, unverified: 'Set TOOL_STRUCTURE_LIVE_PROOF=1 and the documented synthetic tool-server login in .env to create a separate test-only service. Run npm run test:structure:project.',
  }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const client = new Client({ name: 'structure-live-proof', version: '1' })
  let step = 'signing in the synthetic caller'
  let service
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: env.TOOL_SERVER_TEST_EMAIL, password: env.TOOL_SERVER_TEST_PASSWORD })
    assert(!error && data.session)
    await client.connect(new StreamableHTTPClientTransport(new URL(`${env.SUPABASE_URL}/functions/v1/uno-tools`), {
      requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }))
    async function call(name, args) {
      step = `calling ${name} within the new test service`
      const reply = await client.callTool({ name, arguments: { ...args, confirmed: true } })
      assert(!reply.isError)
      const result = JSON.parse(reply.content[0].text)
      assert.equal(result.outcome, 'applied')
      return result.result
    }
    step = 'checking the synthetic caller may confirm'
    const profile = await db.from('profiles').select('may_confirm').eq('user_id', data.user.id).single()
    assert(!profile.error && profile.data.may_confirm)
    service = await call('create_service', { name: `Tool structure test only ${crypto.randomUUID()}` })
    const phase = await call('create_phase', { service_id: service, name: 'Initial phase' })
    const created = await call('create_scenario', { phase_id: phase, name: 'Initial scenario', step_names: ['Choose support', 'Describe request'] })
    const path = created.path_id
    const scenario = created.scenario_id
    const names = await db.from('path_steps').select('position,steps(name)').eq('path_id', path).order('position')
    assert(!names.error)
    assert.deepEqual(names.data.map(row => row.steps.name), ['Choose support', 'Describe request'])
    const column = await call('create_step', { path_id: path, name: 'Receive answer' })
    await call('create_lane', { scenario_id: scenario, name: 'Initial lane' })
    const lanes = await db.from('lanes').select('id').eq('path_id', path).single()
    assert(!lanes.error)
    const levels = ['phase', 'scenario', 'step', 'lane']
    const ids = [phase, scenario, column, lanes.data.id]
    const old = ['Initial phase', 'Initial scenario', 'Receive answer', 'Initial lane']
    for (const [index, level] of levels.entries()) {
      await call(`update_${level}`, { [`${level}_id`]: ids[index], name: `Named ${level}` })
      step = `reading back the test-only ${level} and its attribution`
      const row = await db.from(`${level}s`).select('name').eq('id', ids[index]).single()
      assert(!row.error && row.data.name === `Named ${level}`)
      const log = await db.from('authoring_changes').select('author_id,revert').eq('fn', `update_${level}`).eq(`args->>${level}_id`, ids[index]).single()
      assert(!log.error && log.data.author_id === data.user.id)
      assert(log.data.revert.rows.some(row => row.table === `${level}s` && row.before?.name === old[index] && row.after?.name === `Named ${level}`))
    }
    return { what, count: 4, line: `PASS: four MCP renames, initial step labels, named step creation and caller/prior-name audit readback in test-only service ${service}. Existing services were not changed.` }
  } catch {
    return { what, findings: [`Live proof failed while ${step}. Credentials and replies withheld.${service ? ` Test-only service: ${service}.` : ''}`] }
  } finally { await Promise.allSettled([client.close(), db.auth.signOut({ scope: 'local' })]) }
}
whenRun(import.meta.url, judge)
