import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function check(tools) {
  const directory = mkdtempSync(join(tmpdir(), 'authoring-check-'))
  const bin = join(directory, 'bin'); mkdirSync(bin)
  for (const [name, body] of Object.entries(tools)) writeFileSync(join(bin,name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  try {
    return spawnSync(process.execPath, [resolve('scripts/run-authoring-db.mjs')], { env: { ...process.env, PATH: bin }, encoding: 'utf8' })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
const available = 'exit 0'

it('missing PostgreSQL tools report unverified and exit cleanly', () => {
  const result = check({ createdb: available, dropdb: available })
  expect(result.status).toBe(0)
  expect(result.stdout + result.stderr).toMatch(/unverified.*psql/)
})
it('the successful report counts the audit rows it examined', () => {
  const result = check({ createdb: available, dropdb: available, psql: 'case "$*" in *scripts/tests/authoring.sql*) echo authoring_rows=2;; esac' })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('2 authoring rows')
})
it('a database refusal names its source and ends with the rerun command', () => {
  const result = check({ createdb: available, dropdb: available, psql: 'case "$*" in *--version*) exit 0;; esac\necho "scripts/tests/authoring.sql:7: fixture refusal" >&2\nexit 1' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('scripts/tests/authoring.sql:7: fixture refusal')
  expect(result.stderr.trim()).toMatch(/Run npm run test:authoring:db\.$/)
})
