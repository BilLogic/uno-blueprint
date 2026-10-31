#!/usr/bin/env node
/** Attribute writes and capture inverse data on the seed-load scratch stack. */
import { readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { PANEL_WRITE_SURFACE } from './panel-write-surface.mjs'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

const COMMAND = 'npm run test:authoring:db'
const WHAT = 'server authoring changes'
export async function judge() {
  for (const tool of ['createdb','psql','dropdb']) {
    const probe = spawnSync(tool,['--version'], { stdio: 'pipe' })
    if (probe.error?.code === 'ENOENT') return { what: WHAT, unverified: `${tool} is unavailable; install PostgreSQL, then run ${COMMAND}.` }
    if (probe.error || probe.status !== 0) return { what: WHAT, findings: [`Could not run ${tool}. Run ${COMMAND}.`] }
  }
  const database = `authoring_proof_${process.pid}`
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PGOPTIONS: '--client-min-messages=warning' } })
  const failure = error => ({ what: WHAT, findings: [`${error.stderr?.toString().trim() || error.message}\nRun ${COMMAND}.`] })
  let created = false
  let result
  try {
    run('createdb', [database]); created = true
    let proof = ''
    for (const file of [...STACK, 'scripts/tests/fixtures/authoring.sql', 'scripts/tests/authoring.sql'])
      proof = run('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
    const authored = Object.keys(PANEL_WRITE_SURFACE).map(table => `'${table.replaceAll("'", "''")}'`).join(',')
    const missing = run('psql', ['-X','-q','-At','-d',database,'-c', `
      select string_agg(t,', ') from unnest(array[${authored}]) as t
      where not exists(select 1 from pg_trigger g where g.tgrelid=('public.'||t)::regclass
        and g.tgfoid='public.capture_agent_prior_rows()'::regprocedure and not g.tgisinternal);
    `]).trim()
    if (missing) {
      const file = 'supabase/migrations/21000317000000_a_server_write_captures_its_prior_rows.sql'
      const line = readFileSync(file,'utf8').split('\n').findIndex(line => line.includes('foreach relation')) + 1
      throw new Error(`${file}:${line}: Inverse capture misses authored tables: ${missing}.`)
    }
    const held = proof.match(/^authoring_rows=(\d+)$/m)
    if (!held) throw new Error('The scratch proof did not report its examined audit rows.')
    const count = Number(held[1])
    result = { what: WHAT, count, line: `PASS: ${count} authoring rows checked caller attribution, prior values, preview rollback and distinct approval labels.` }
  } catch (error) { result = failure(error) }
  finally {
    if (created) try { run('dropdb', ['--if-exists', '--force', database]) } catch (error) { result = failure(error) }
  }
  return result
}
whenRun(import.meta.url, judge)
