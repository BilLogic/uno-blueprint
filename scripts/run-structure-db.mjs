#!/usr/bin/env node
/** Structure naming on a disposable seed-load stack, never a project database. */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

export async function judge() {
  const what = 'naming journey structure'
  const rerun = 'Run npm run test:structure:db.'
  const database = `structure_proof_${process.pid}`
  const env = { ...process.env, PGOPTIONS: '--client-min-messages=warning' }
  const run = (command, args, input) => execFileSync(command, args, { env, input, encoding: 'utf8', stdio: 'pipe' })
  let created = false
  try {
    for (const command of ['createdb', 'psql', 'dropdb']) {
      try { run(command, ['--version']) } catch (error) {
        if (error.code === 'ENOENT') return { what, unverified: `${command} is unavailable. ${rerun}` }
        throw error
      }
    }
    run('createdb', [database]); created = true
    let output = ''; let previousGateway
    const migration = 'supabase/migrations/21000316000000_structure_writes_refuse_unapplied_changes.sql'
    const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database]
    for (const file of [...STACK, 'scripts/tests/fixtures/tool-writes.sql', 'scripts/tests/structure.sql']) {
      if (file === 'supabase/generated/portable-core.generated.sql') {
        const core = readFileSync(file, 'utf8')
        const boundary = core.indexOf('-- 21000316000000_')
        if (boundary < 0) throw new Error('The refusal migration is missing from the generated core.')
        run('psql', [...psql, '-f', '-'], core.slice(0, boundary))
        previousGateway = run('psql', [...psql, '-A', '-t', '-c', "select pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure)"])
        run('psql', [...psql, '-f', '-'], core.slice(boundary))
      } else output = run('psql', [...psql, '-f', file])
    }
    // Alter each expected fragment independently: every missing anchor must
    // stop replay, including when the other refusal replacements still fit.
    const anchors = [
      ...['step', 'lane'].map(level => [
        `update public.${level}s set name=a->>'name' where ${level}s.id=(a->>'${level}_id')::uuid;`,
        `Expected ${level} rename update did not match`,
      ]),
      ...['create_phase', 'create_slice', 'create_finding'].map(tool => [
        `when '${tool}' then\n        if p_service_id is null then raise exception`,
        `Expected missing-service refusal for ${tool} did not match`,
      ]),
    ]
    for (const [anchor, message] of anchors) {
      if (!previousGateway.includes(anchor)) throw new Error(`The replacement fixture lacks ${message}.`)
      const altered = previousGateway.replace(anchor, anchor.replace(' then', '  then').replace(' set name=', ' set  name='))
      let refusal = ''
      try {
        run('psql', [...psql, '-f', '-'], `begin;\n${altered};\n${readFileSync(migration, 'utf8')}`)
      } catch (error) { refusal = error.stderr?.toString() ?? error.message }
      if (!refusal.includes(message)) throw new Error(`Migration did not refuse its missing anchor: ${message}; ${refusal || "no refusal"}`)
    }
    const count = Number(output.match(/structure_checked=(\d+)/)?.[1] ?? 0)
    if (count !== 4) throw new Error('The proof did not examine all four structure levels.')
    return { what, count, line: `PASS: ${count} structure levels checked for renaming, refusals, proposals, labels and prior names; all five migration replacements checked independently.` }
  } catch (error) {
    return { what, findings: [`${error.stderr?.toString().trim() || error.message} ${rerun}`] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
