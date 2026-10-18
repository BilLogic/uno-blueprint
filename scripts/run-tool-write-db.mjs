#!/usr/bin/env node
/** The write transaction and proposals on a disposable local PostgreSQL stack. */
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
const database = 'agent_tool_write_proof'
const env = { ...process.env, PGOPTIONS: '--client-min-messages=warning' }
const run = (command, args) => execFileSync(command, args, { env, stdio: 'pipe' })
let created = false
try {
  run('createdb', [database]); created = true
  for (const file of [...STACK, 'scripts/tests/fixtures/tool-writes.sql', 'scripts/tests/tool-writes.sql'])
    run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
  console.log('All write kinds and a non-confirmer proposal/approval passed on the scratch database.')
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode = 1
} finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
