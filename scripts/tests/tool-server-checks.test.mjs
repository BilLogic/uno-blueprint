import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

it('an unconfigured remote proof registers unverified without leaking environment values', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'tool-server-proof-'))
  try {
    const env = { ...process.env }
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL',
      'TOOL_SERVER_TEST_PASSWORD', 'TOOL_SERVER_OTHER_EMAIL', 'TOOL_SERVER_OTHER_PASSWORD']) delete env[name]
    const result = spawnSync(process.execPath, [resolve('scripts/smoke-tool-server.mjs')], { cwd, env, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('unverified')
    expect(result.stderr).toContain('TOOL_SERVER_TEST_PASSWORD')
    expect(result.stderr).toContain('test:tool-server:project')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
