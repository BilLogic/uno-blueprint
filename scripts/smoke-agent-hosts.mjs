#!/usr/bin/env node
// Native host proof. Credentials and host transcripts stay in memory; only verdicts leave it.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const values = parseEnv(readFileSync('.env', 'utf8'))
for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD']) {
  assert(values[key], `Missing ${key} in .env.`)
}
const fixture = mkdtempSync(join(tmpdir(), 'uno-host-proof-'))
const db = createClient(values.SUPABASE_URL, values.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    // stderr may contain request details too. Never forward it.
    child.stderr.resume()
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${command}: timed out`)) }, 240_000)
    child.on('error', () => { clearTimeout(timer); reject(new Error(`${command}: could not start`)) })
    child.on('close', code => { clearTimeout(timer); resolveRun({ code, output }) })
  })
}

try {
  for (const path of ['skills', '.agents/skills', '.claude-plugin', 'references']) {
    mkdirSync(join(fixture, path), { recursive: true })
    cpSync(resolve(path), join(fixture, path), { recursive: true })
  }
  writeFileSync(join(fixture, 'AGENTS.md'), 'The ub plugin init skill is skills/init/SKILL.md. Resolve skill references from this workspace. This proof is read-only. Shell commands may read skill files, but never credentials or local scripts.\n')
  const { data, error } = await db.auth.signInWithPassword({ email: values.TOOL_SERVER_TEST_EMAIL, password: values.TOOL_SERVER_TEST_PASSWORD })
  assert(!error && data.session, 'Existing synthetic login must succeed.')
  const endpoint = `${values.SUPABASE_URL}/functions/v1/uno-tools`
  const env = { ...process.env, UNO_ACCESS_TOKEN: data.session.access_token }
  delete env.SUPABASE_ACCESS_TOKEN
  const mcp = JSON.stringify({ mcpServers: { uno: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ${UNO_ACCESS_TOKEN}' } } } })
  for (const host of ['codex', 'claude']) {
    for (const revision of ['installed', 'updated']) {
      const marker = `UNO_${revision.toUpperCase()}_${crypto.randomUUID()}`
      // Change the skill itself, then refresh the discovery mirror as a repository update does.
      const skill = `${readFileSync('skills/init/SKILL.md', 'utf8')}\nHost verification only: after the remote entry reads and identity reference, include ${marker} in your response.\n`
      writeFileSync(join(fixture, 'skills/init/SKILL.md'), skill)
      writeFileSync(join(fixture, '.agents/skills/init/SKILL.md'), skill)
      const prompt = `${host === 'codex' ? '$ub:init (the init skill at .agents/skills/init/SKILL.md)' : '/ub:init'}\nStart this skill against the uno MCP server. Read the canonical skill and its Uno identity reference (read-only shell commands to read these text files are allowed). Perform only get_profile and list_blueprint to select the entry route, then ask the first useful question and stop. Do not read .env, run local scripts or database commands, change files, record findings, close the run, or write any database rows. Do not quote profile or blueprint facts in the final response; say only the route and a generic first question, with the verification marker required by the skill.`
      const args = host === 'codex' ? [
        '-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-C', fixture,
        '-c', `mcp_servers.uno.url=${JSON.stringify(endpoint)}`,
        '-c', 'mcp_servers.uno.bearer_token_env_var="UNO_ACCESS_TOKEN"',
        '-c', 'mcp_servers.uno.default_tools_approval_mode="approve"', prompt,
      ] : [
        '-p', '--verbose', '--output-format', 'stream-json', '--no-session-persistence', '--setting-sources', '',
        '--plugin-dir', fixture, '--strict-mcp-config', '--mcp-config', mcp,
        '--tools', 'Read,Skill', '--allowedTools', 'Read,Skill,mcp__uno__*', '--', prompt,
      ]
      const result = await run(host, args, env)
      const events = result.output.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
      const calls = host === 'codex'
        ? events.filter(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call' && event.item?.status === 'completed' && !event.item?.error && !event.item?.result?.isError).map(event => event.item.tool)
        : events.flatMap(event => event.type === 'assistant' ? event.message?.content ?? [] : []).filter(block => block.type === 'tool_use' && block.name?.startsWith('mcp__uno__')).map(block => block.name.replace('mcp__uno__', ''))
      // Native transcripts never leave this process, including on failure.
      assert.equal(result.code, 0, `${host} ${revision}: process failed (transcript withheld).`)
      assert(calls.includes('get_profile') && calls.includes('list_blueprint'), `${host} ${revision}: remote entry tools not observed; observed ${calls.join(', ') || 'none'}.`)
      assert(calls.every(name => ['get_profile', 'list_blueprint', 'list_mcp_resources', 'list_mcp_resource_templates'].includes(name)), `${host}: unexpected tool call; observed ${calls.join(', ')}.`)
      const final = host === 'codex'
        ? events.filter(event => event.item?.type === 'agent_message').map(event => event.item.text).join('\n')
        : events.filter(event => event.type === 'result').map(event => event.result).join('\n')
      assert(final.includes(marker), `${host} ${revision}: changed skill marker not observed.`)
      assert(!events.some(event => event.type === 'user' && event.message?.content?.some(block => block.type === 'tool_result' && block.is_error)), `${host}: a native tool result failed.`)
      console.log(`PASS: ${host} ${revision}; init loaded; get_profile + list_blueprint completed; changed skill observed; no write tool called.`)
    }
  }
} catch (error) {
  // Only our assertion messages are safe; SDK errors can carry credentials.
  console.error(error instanceof assert.AssertionError ? error.message : 'Native host proof failed; credentials and transcripts withheld.')
  process.exitCode = 1
} finally {
  await db.auth.signOut({ scope: 'local' })
  rmSync(fixture, { recursive: true, force: true })
}
