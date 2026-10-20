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
    for (const command of ['createdb', 'psql', 'dropdb']) {
      try { run(command, ['--version']) } catch (error) {
        if (error.code === 'ENOENT') return { what: 'the cell search recipe', unverified: `${command} is unavailable. Run npm run test:tool-search:db with PostgreSQL and pgvector available.` }
        throw error
      }
    }
    run('createdb', [database]); created = true
    const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database]
    const vector = run('psql', [...psql, '-Atc', "select name from pg_available_extensions where name='vector'"]).trim()
    if (!vector) return { what: 'the cell search recipe', unverified: 'pgvector is not installed on this PostgreSQL server; the recipe was not tested.' }
    let output = ''
    for (const file of [...STACK, 'scripts/recipes/cell-search.sql', 'scripts/tests/fixtures/cell-search.sql', 'scripts/tests/cell-search.sql'])
      output = run('psql', [...psql, '-f', file])
    const count = Number(output.match(/indexed_cells=(\d+)/)?.[1] ?? 0)
    return { what: 'the cell search recipe', count, line: `PASS: ${count} indexed scratch cells rank by cosine; keyword fallback, cell-only scope, model mismatch, stale-vector exclusion and caller grants passed.` }
  } catch (error) {
    return { what: 'the cell search recipe', findings: [`${error.stderr?.toString().trim() || 'Scratch database proof failed.'} Run npm run test:tool-search:db.`] }
  } finally { if (created) run('dropdb', ['--if-exists', '--force', database]) }
}
whenRun(import.meta.url, judge)
