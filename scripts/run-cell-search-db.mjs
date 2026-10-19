#!/usr/bin/env node
/** Real pgvector recipe checks on a disposable copy of the seed-load stack. */
import { execFileSync } from 'node:child_process'
import { STACK } from './check-seed-loads.mjs'
import { whenRun } from './verdict.mjs'

export async function judge() {
  const database = `cell_search_proof_${process.pid}`
  const env = { ...process.env, PGOPTIONS: '--client-min-messages=warning' }
  const run = (command, args) => execFileSync(command, args, { env, stdio: 'pipe', encoding: 'utf8' })
  let created = false
  try {
    run('createdb', [database]); created = true
    const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database]
    const vector = run('psql', [...psql, '-Atc', "select name from pg_available_extensions where name='vector'"]).trim()
    if (!vector) return { what: 'the cell search recipe', unverified: 'pgvector is not installed on this PostgreSQL server; the recipe was not tested.' }
    for (const file of [...STACK, 'scripts/recipes/cell-search.sql', 'scripts/tests/fixtures/cell-search.sql', 'scripts/tests/cell-search.sql'])
      run('psql', [...psql, '-f', file])
    return { what: 'the cell search recipe', count: 1, line: 'PASS: seeded scratch cells rank by cosine; keyword fallback, model mismatch, stale-vector exclusion and caller grants passed.' }
  } catch (error) {
    return { what: 'the cell search recipe', findings: [error.stderr?.toString() || 'Scratch database proof failed. Run npm run test:tool-search:db with PostgreSQL and pgvector available.'] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
