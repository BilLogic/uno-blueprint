#!/usr/bin/env node
/** Attribute writes and capture inverse data on the seed-load scratch stack. */
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

export async function judge() {
  const database = `authoring_proof_${process.pid}`
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PGOPTIONS: '--client-min-messages=warning' } })
  let created = false
  try {
    run('createdb', [database]); created = true
    for (const file of [...STACK, 'scripts/tests/fixtures/authoring.sql', 'scripts/tests/authoring.sql'])
      run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
    return { what: 'server authoring changes', count: 1, line: 'PASS: caller attribution, captured prior cell and placement rows, preview rollback, and a distinct approval label passed.' }
  } catch (error) {
    return { what: 'server authoring changes', findings: [error.stderr?.toString() || 'Run npm run test:authoring:db with PostgreSQL available.'] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
