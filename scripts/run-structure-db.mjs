#!/usr/bin/env node
/** Structure naming on a disposable seed-load stack, never a project database. */
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

export async function judge() {
  const what = 'naming journey structure'
  const rerun = 'Run npm run test:structure:db.'
  const database = `structure_proof_${process.pid}`
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
    for (const file of [...STACK, 'scripts/tests/fixtures/tool-writes.sql', 'scripts/tests/structure.sql'])
      output = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
    const count = Number(output.match(/structure_checked=(\d+)/)?.[1] ?? 0)
    const summaries = Number(output.match(/structure_summaries_checked=(\d+)/)?.[1] ?? 0)
    if (summaries !== 3) throw new Error('The proof did not examine summaries at all three structure levels.')
    if (count !== 4) throw new Error('The proof did not examine all four structure levels.')
    return { what, count, line: `PASS: ${count} structure levels checked for renaming, proposals, labels and prior names; summaries checked at all three named levels.` }
  } catch (error) {
    return { what, findings: [`${error.stderr?.toString().trim() || error.message} ${rerun}`] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
