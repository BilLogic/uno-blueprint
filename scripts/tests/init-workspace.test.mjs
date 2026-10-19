import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve('skills/init/scripts/init_state.py')

test('an installed init script uses the caller workspace for linked queries and its default ledger', () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'init-workspace-')))
  try {
    mkdirSync(join(workspace, 'bin'))
    writeFileSync(join(workspace, 'bin/supabase'), `#!/usr/bin/env python3
import json,os
print(json.dumps([{'state': json.dumps({'services': [], 'profiles': [], 'changes': []})}]))
open('linked-query-root', 'w').write(os.getcwd())
`, { mode: 0o755 })
    const env = { ...process.env, PATH: `${workspace}/bin:${process.env.PATH}` }
    const state = spawnSync('python3', [script, 'state'], { cwd: workspace, env, encoding: 'utf8' })
    assert.equal(state.status, 0, state.stderr)
    assert.equal(readFileSync(join(workspace, 'linked-query-root'), 'utf8'), workspace)
    const record = spawnSync('python3', [script, 'record', '--profile', 'profile', '--kind', 'question',
      '--scope', 'topic:question', '--summary', 'Question for later', '--severity', 'info', '--impact', 'low', '--effort', 'low'],
    { cwd: workspace, env, encoding: 'utf8' })
    assert.equal(record.status, 0, record.stderr)
    const ledger = JSON.parse(readFileSync(join(workspace, 'audit/findings-report.json'), 'utf8'))
    assert.equal(ledger.rows[0].source, 'init')
    assert.equal(JSON.parse(record.stdout).ledger, join(workspace, 'audit/findings-report.json'))
  } finally { rmSync(workspace, { recursive: true, force: true }) }
})


test('mark-run refuses an unknown profile in one sentence without a traceback', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'init-unknown-profile-'))
  try {
    mkdirSync(join(workspace, 'bin'))
    writeFileSync(join(workspace, 'bin/supabase'), '#!/bin/sh\nprintf "[]\\n"\n', { mode: 0o755 })
    const result = spawnSync('python3', [script, 'mark-run', '--profile', '00000000-0000-4000-8000-000000000099'], {
      cwd: workspace, env: { ...process.env, PATH: `${workspace}/bin:${process.env.PATH}` }, encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim(), 'No profile matched; the run was not marked.')
  } finally { rmSync(workspace, { recursive: true, force: true }) }
})
