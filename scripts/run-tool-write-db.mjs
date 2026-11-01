#!/usr/bin/env node
/** The write transaction and proposals on a disposable local PostgreSQL stack. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { partition } from './generate-portable-core.mjs'
import { STACK } from './check-seed-loads.mjs'
const database = 'agent_tool_write_proof'
const env = { ...process.env, PGOPTIONS: '--client-min-messages=warning' }
const run = (command, args, input) => execFileSync(command, args, { env, input, stdio: 'pipe', encoding: 'utf8' })
let created = false
try {
  run('createdb', [database]); created = true
  for (const file of [...STACK, 'scripts/tests/fixtures/tool-writes.sql', 'scripts/tests/tool-writes.sql', 'scripts/tests/slice-shares.sql'])
    run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file])
  const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database]
  const original = run('psql', [...psql, '-Atc', "select pg_get_functiondef('public.is_service_account()'::regprocedure)"])
  const recipe = partition(readFileSync('supabase/migrations/21000316000000_a_proposal_is_a_validated_tool_call.sql', 'utf8')).recipe.join('\n')
  for (const allowed of [true, false]) {
    run('psql', psql, `create or replace function public.is_service_account() returns boolean language sql stable as $$ select ${allowed} $$;`)
    run('psql', psql, recipe)
    run('psql', psql, `do $$ begin
      if public.is_service_account() is distinct from ${allowed} then raise exception 'Agent gate replaced the deployment tier'; end if;
    end $$;`)
  }
  run('psql', psql, original)
  console.log('Deployment tier choices survive the agent gate.')
  console.log('All write kinds and a non-confirmer proposal/approval passed on the scratch database.')
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode = 1
} finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
