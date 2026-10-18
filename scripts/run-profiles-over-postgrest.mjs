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
import assert from 'node:assert/strict'

import { mintPersonClaim } from './mint-service-claim.mjs'
import { runPostgrestTest } from './run-slice-over-postgrest.mjs'
import { PILOT_ROLES, pilotProfilesSql } from './seed-pilot-profiles.mjs'
import { sweep } from './sweep.mjs'

const ROOT = process.cwd()
const TEST = 'src/lib/profiles.postgrest.test.ts'
const test = sweep({
  subject: 'app', root: ROOT, where: (path) => path === TEST,
  what: 'the profile live test',
}).locate(TEST)
const people = JSON.parse(readFileSync(resolve(ROOT, 'supabase/pilot/profiles.example.json'), 'utf8'))

/** The fixture's accounts: the consultant may confirm, the expert contributes only. */
// The fixture is the single source of account ids.
const accounts = readFileSync(resolve(ROOT, 'scripts/tests/fixtures/profiles.sql'), 'utf8')
  .match(/c0000000-[0-9a-f-]+/g)
const [CONFIRMER, OWNER, CONTRIBUTOR] = accounts
const EXPERT_PROFILE = PILOT_ROLES.expert.profileId

await runPostgrestTest({
  test,
  label: 'profiles and who may confirm',
  prepare(psql) {
    psql(['-f', resolve(ROOT, 'scripts/tests/fixtures/profiles.sql')])
    const seed = pilotProfilesSql(people)
    psql(['-c', `insert into public.stakeholders (name, kind) values
      ('Business owner', 'team'), ('Subject-matter expert', 'partner');`])
    assert.throws(() => psql(['-f', '-'], seed), /expert stakeholder kind does not fit/)
    psql(['-c', "update public.stakeholders set kind = 'staff' where name = 'Subject-matter expert'"])
    psql(['-f', '-'], seed)
    // Re-running must preserve an operator changing who may confirm.
    psql(['-c', `update public.profiles set may_confirm = true where id = '${EXPERT_PROFILE}'`])
    psql(['-f', '-'], seed)
    psql(['-c', `do $$ begin
      if not (select may_confirm from public.profiles where id = '${EXPERT_PROFILE}') then
        raise exception 'seed reset may_confirm';
      end if;
    end $$;
    update public.profiles set may_confirm = false where id = '${EXPERT_PROFILE}';`])
  },
  env: (secret) => ({
    PROFILES_CONFIRMER_JWT: mintPersonClaim({ secret, sub: CONFIRMER }),
    PROFILES_OWNER_JWT: mintPersonClaim({ secret, sub: OWNER }),
    PROFILES_CONTRIBUTOR_JWT: mintPersonClaim({ secret, sub: CONTRIBUTOR }),
  }),
})
