import { expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { rolldown } from 'rolldown'
import { buildToolServer, edgeImportFindings } from '../build-tool-server.mjs'
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
    expect(findings[0]).toContain('Unwritten Edge bundle "server.generated.js"')
    expect(findings[0]).toContain('external import "@supabase/server"')
  } finally { await bundle.close() }
})

async function inToolServerFixture(code, check, files = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'tool-server-bundle-'))
  try {
    files = { 'src/index.ts': 'export {}', 'src/lib/agent/server/searchIndexer.ts': 'export const indexer = 1', 'src/lib/agent/server/mcp.ts': code, ...files }
    for (const [file, text] of Object.entries(files)) {
      const path = resolve(root, file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text)
    }
    await check(await buildToolServer({ root }), root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

it('a missing package escalates UNRESOLVED_IMPORT and returns the install recovery command', async () => {
  await inToolServerFixture("export { value } from 'missing-tool-server-fixture-package'", (result, root) => {
    expect(result.findings.join('\n')).toContain('UNRESOLVED_IMPORT')
    expect(result.findings.join('\n')).toContain('missing-tool-server-fixture-package')
    expect(result.closing).toBe('Run `npm ci && npm run build:tool-server`.')
    const errors = []
    let exitCode = 0
    verdict(result, { err: text => errors.push(text), fail: code => { exitCode = code } })
    expect(exitCode).toBe(1)
    expect(errors.at(-1)).toBe(result.closing)
    expect(existsSync(resolve(root, 'supabase/functions/uno-tools/server.generated.js'))).toBe(false)
  })
})

it.each([
  ["export { readFileSync } from 'node:fs'", 'Node-only capability', {}],
  ["export { store } from '../sessions'", 'browser capability', { 'src/lib/agent/sessions.ts': 'export const store = 1' }],
  ['export const = ;', 'PARSE_ERROR', {}],
])('a capability or parse failure returns the plain rerun: %s', async (code, message, files) => {
  await inToolServerFixture(code, result => {
    expect(result.findings.join('\n')).toContain(message)
    expect(result.closing).toBe('Run `npm run build:tool-server`.')
  }, files)
})

it.each([false, true])('an unwritten external bundle never points at a missing or stale artifact (stale: %s)', async stale => {
  const file = 'supabase/functions/uno-tools/server.generated.js'
  await inToolServerFixture("export { value } from 'https://example.invalid/module.js'", (result, root) => {
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toContain('Unwritten Edge bundle "server.generated.js"')
    expect(result.findings[0]).not.toContain('supabase/functions/')
    expect(result.findings[0]).not.toMatch(/server.generated.js:\d+/)
    expect(result.closing).toBe('Run `npm run build:tool-server`.')
    if (stale) expect(readFileSync(resolve(root, file), 'utf8')).toBe('Previous successful bundle')
    else expect(existsSync(resolve(root, file))).toBe(false)
  }, stale ? { [file]: 'Previous successful bundle' } : {})
})

it('a self-contained fixture builds and writes successfully', async () => {
  await inToolServerFixture('export const value = 1', (result, root) => {
    expect(result.findings).toBeUndefined()
    expect(result.count).toBeGreaterThan(0)
    expect(readFileSync(resolve(root, 'supabase/functions/index-cell-search/server.generated.js'), 'utf8')).toContain('indexer')
    expect(readFileSync(resolve(root, 'supabase/functions/uno-tools/server.generated.js'), 'utf8')).toContain('value')
  })
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
