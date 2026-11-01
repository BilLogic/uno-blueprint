#!/usr/bin/env node
/** Service validation on a disposable seed-load stack, never a project database. */
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

export async function judge() {
  const what = 'reading a service for validation'
  const rerun = 'Run npm run test:validation:db.'
  const database = `validation_proof_${process.pid}`
  const env = { ...process.env, PGOPTIONS: '--client-min-messages=warning' }
  const run = (command, args) => execFileSync(command, args, { env, encoding: 'utf8', stdio: 'pipe' })
  let created = false
  try {
    for (const command of ['createdb', 'psql', 'dropdb']) {
      try { run(command, ['--version']) } catch (error) {
        if (error.code === 'ENOENT') return { what, unverified: `${command} is unavailable. ${rerun}` }
        throw error
      }
    }
    run('createdb', [database]); created = true
    let output = ''
    for (const file of [...STACK, 'scripts/tests/fixtures/tool-writes.sql', 'scripts/tests/fixtures/blueprint-validation.sql', 'scripts/tests/validation.sql'])
      output = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
    const count = Number(output.match(/validation_checked=(\d+)/)?.[1] ?? 0)
    if (count !== 2) throw new Error('The validation export proof did not examine both fixtures.')
    return { what, count, line: `PASS: ${count} services read as a non-approver without changing authoring rows.` }
  } catch (error) {
    return { what, findings: [`${error.stderr?.toString().trim() || error.message} ${rerun}`] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
