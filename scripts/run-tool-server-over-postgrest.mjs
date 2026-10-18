#!/usr/bin/env node
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { resolve } from 'node:path'
import { runPostgrestTest } from './run-slice-over-postgrest.mjs'
import { sweep } from './sweep.mjs'

const reads = process.argv.includes('--reads')
const TEST = reads ? 'src/lib/agent/server/reads.postgrest.test.ts' : 'src/lib/agent/server/mcp.postgrest.test.ts'
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
    psql(['-f', resolve('scripts/tests/fixtures/mcp-sessions.sql')])
    if (reads) psql(['-f', resolve('scripts/tests/fixtures/tool-reads.sql')])
  },
  env: () => ({ MCP_TEST_JWKS: JSON.stringify(jwks), MCP_TEST_OWNER_JWT: owner, MCP_TEST_OTHER_JWT: other }),
})
