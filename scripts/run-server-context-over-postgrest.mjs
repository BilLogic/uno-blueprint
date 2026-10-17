#!/usr/bin/env node
/** The server context uses the same scratch stack and minted claim as the slice. */
import { runPostgrestTest } from './run-slice-over-postgrest.mjs'
import { sweep } from './sweep.mjs'

const TEST = 'src/lib/agent/tools/serverContext.test.ts'
const test = sweep({
  subject: 'app', root: process.cwd(), where: (path) => path === TEST,
  what: 'the server tool context',
}).locate(TEST)

await runPostgrestTest({
  test,
  label: 'the server tool context',
})
