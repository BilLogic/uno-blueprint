#!/usr/bin/env node
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { resolve } from 'node:path'
import { runPostgrestTest } from './run-slice-over-postgrest.mjs'
import { sweep } from './sweep.mjs'

const cases = {
  default: { test: 'src/lib/agent/server/mcp.postgrest.test.ts', fixtures: ['mcp-sessions'] },
  '--writes': { test: 'src/lib/agent/server/writes.postgrest.test.ts', fixtures: ['tool-writes'] },
  '--reads': { test: 'src/lib/agent/server/reads.postgrest.test.ts', fixtures: ['mcp-sessions','tool-reads'] },
  '--search': { test: 'src/lib/agent/server/search.postgrest.test.ts', fixtures: ['mcp-sessions','cell-search'], recipe: 'scripts/recipes/cell-search.sql' },
  '--services': { test: 'src/lib/agent/server/services.postgrest.test.ts', fixtures: ['tool-writes','services'] },
  '--authoring': { test: 'src/lib/agent/server/authoring.postgrest.test.tsx', fixtures: ['mcp-sessions','authoring'] },
}
const selected = Object.keys(cases).find(flag => process.argv.includes(flag)) ?? 'default'
const { test: TEST, fixtures, recipe } = cases[selected]
const test = sweep({ subject: 'app', root: process.cwd(), where: path => path === TEST, what: 'the MCP boundary' }).locate(TEST)

const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'scratch-key', alg: 'ES256' }] }
const token = sub => new SignJWT({ role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'scratch-key' }).setSubject(sub)
  .setAudience('authenticated').setExpirationTime('10m').sign(privateKey)
const [owner, other] = await Promise.all([
  token('c0000000-0000-4000-8000-000000000001'), token('c0000000-0000-4000-8000-000000000002'),
])
await runPostgrestTest({
  test, label: 'the MCP tool server',
  jwtSecret: JSON.stringify(jwks), mintClaim: () => owner,
  prepare(psql) {
    if (recipe) psql(['-f', resolve(recipe)])
    for (const fixture of fixtures) psql(['-f', resolve(`scripts/tests/fixtures/${fixture}.sql`)])
  },
  env: () => ({ MCP_TEST_JWKS: JSON.stringify(jwks), MCP_TEST_OWNER_JWT: owner, MCP_TEST_OTHER_JWT: other }),
})
