import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { rolldown } from 'rolldown'
import { edgeImportFindings } from '../build-tool-server.mjs'
import { verdict } from '../verdict.mjs'

it.each([
  "import { value } from '@supabase/server'; console.log(value)",
  "export { value } from '@supabase/server'",
  "export const load = () => import('@supabase/server')",
])('the emitted Edge graph refuses a bare dependency: %s', async code => {
  const bundle = await rolldown({
    input: 'fixture', external: ['@supabase/server'],
    plugins: [{ name: 'fixture', resolveId: id => id === 'fixture' ? id : null, load: id => id === 'fixture' ? code : null }],
  })
  try {
    const { output } = await bundle.generate({ format: 'esm', file: 'server.generated.js' })
    const findings = edgeImportFindings(output)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatch(/server.generated.js:\d+:.*@supabase\/server/)
    const errors = []
    let exitCode = 0
    verdict({ findings, closing: 'Run `npm ci && npm run build:tool-server`.' }, {
      err: text => errors.push(text), fail: code => { exitCode = code },
    })
    expect(exitCode).toBe(1)
    expect(errors.at(-1)).toBe('Run `npm ci && npm run build:tool-server`.')
  } finally { await bundle.close() }
})

it('a self-contained Edge chunk passes even when its text mentions package imports', () => {
  expect(edgeImportFindings([{ type: 'chunk', fileName: 'server.generated.js',
    code: `const example = "import('@supabase/server')"`, imports: [], dynamicImports: [],
  }])).toEqual([])
})

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
