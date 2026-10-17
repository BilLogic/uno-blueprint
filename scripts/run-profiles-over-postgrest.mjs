#!/usr/bin/env node
/**
 * The profile live test, over standalone PostgREST on a scratch database.
 *
 * Builds the stack the cell-edit slice runs on, then adds login accounts for
 * the placeholder pilot people (`scripts/tests/fixtures/profiles.sql`) and
 * runs the pilot profile seed twice from `supabase/pilot/profiles.example.json`,
 * so the test reads what an idempotent seed linked by email. It mints one
 * claim per person — a signed-in person, not a service account — and runs
 * `src/lib/profiles.postgrest.test.ts` with them set. Without a PostgREST
 * binary it says so through the unverified register and exits cleanly.
 *
 *   POSTGREST_BIN=<path to postgrest> node scripts/run-profiles-over-postgrest.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mintServiceClaim } from './mint-service-claim.mjs'
import { runPostgrestTest } from './run-slice-over-postgrest.mjs'
import { pilotProfilesSql } from './seed-pilot-profiles.mjs'
import { sweep } from './sweep.mjs'

const ROOT = process.cwd()
const TEST = 'src/lib/profiles.postgrest.test.ts'
const test = sweep({
  subject: 'app', root: ROOT, where: (path) => path === TEST,
  what: 'the profile live test',
}).locate(TEST)
const people = JSON.parse(readFileSync(resolve(ROOT, 'supabase/pilot/profiles.example.json'), 'utf8'))

/** The fixture's accounts: the consultant may confirm, the expert contributes only. */
const CONFIRMER = 'c0000000-0000-4000-8000-000000000001'
const CONTRIBUTOR = 'c0000000-0000-4000-8000-000000000003'

await runPostgrestTest({
  test,
  label: 'profiles and who may confirm',
  prepare(psql) {
    psql(['-f', resolve(ROOT, 'scripts/tests/fixtures/profiles.sql')])
    const seed = pilotProfilesSql(people)
    psql(['-f', '-'], seed)
    psql(['-f', '-'], seed)
  },
  env: (secret) => ({
    PROFILES_CONFIRMER_JWT: mintServiceClaim({ secret, sub: CONFIRMER, service: false }),
    PROFILES_CONTRIBUTOR_JWT: mintServiceClaim({ secret, sub: CONTRIBUTOR, service: false }),
  }),
})
