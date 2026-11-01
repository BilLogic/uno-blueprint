#!/usr/bin/env node
/**
 * A generated seed loads onto a FRESH core + recipe, and a keyless read returns
 * the content.
 *
 * The path this guards is the one a non-professional deployer actually walks:
 * clone the repo, set the two `VITE_SUPABASE_*` values, replay the schema and
 * the seed onto a brand-new database, and expect their content to show up. Every
 * other database check here reads as the OWNER — which cannot see the failure
 * that matters most on that path, because the deployed app never reads as the
 * owner. It holds the anon key. A table the migrations forgot to expose renders
 * blank in a browser and stays green in an owner-only check.
 *
 * So this builds the whole stack on an empty Postgres, loads the committed seed,
 * and reads it back AS `anon` — the role the deployed app's key resolves to:
 *
 *   1. supabase/portable/supabase-shim.sql        the role names + auth/storage
 *   2. supabase/portable/platform-defaults.sql    the platform's default privileges
 *   3. supabase/generated/portable-core.generated.sql      the contract
 *   4. supabase/generated/supabase-recipe.generated.sql    Supabase's enforcement
 *   5. supabase/seed.sql                          the generated sample content
 *
 * Then, as `anon`: every table the seed populates comes back non-empty, and the
 * two joins the app actually renders — the blueprint grid and the service
 * hierarchy — return rows. A permission the recipe never granted surfaces here
 * as "permission denied for table …", which is the browser's blank screen, six
 * minutes earlier and with the table named.
 *
 * That is what a READER sees. The same database is then asked what a signed-in
 * AUTHOR may write, and asked by BECOMING that author: for every verb the
 * editors use on a table — update, and for five of them insert and delete as
 * well — the check sets the role, sets a service-account claim, attempts the
 * write, and rolls it back. Then it does the same as a signed-in reader, who
 * must change nothing. Grants and policies have both been missing in the last
 * three migrations, neither is visible on a laptop holding the dev service key,
 * and a policy that refuses matches zero rows and returns 200 — so the question
 * is asked as the write, not of the catalog. See scripts/panel-write-surface.mjs.
 *
 * Ordering is the whole subtlety. The platform default (step 2) is set BEFORE
 * the core creates any table, so every table inherits the anon SELECT the way a
 * real project's tables do — and the recipe's surgical revokes (evidence,
 * business_models) then land on top exactly as they do on Supabase. See
 * platform-defaults.sql for why that file exists at all.
 *
 * This IS the behavioural-parity substrate later reconciliation tickets read
 * against: swap the sample seed for a deployment's own generated seed and the
 * same assertion says whether that content renders.
 *
 *   npm run check:seed-load
 *
 * Needs a reachable Postgres 17 and permission to create a database. In CI that
 * is the `portable-core` job's `postgres:17` service (PG* already in the env);
 * locally it is whatever `psql` / `createdb` connect to by default. No Docker,
 * no Supabase, no shim an adopter installs — the same stance as the rest of the
 * portable-core job.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  ANY_SIGNED_IN_USER_MAY_WRITE,
  buildWriteSurfaceSql,
  evaluateWriteSurface,
  writeSurfaceAssertions,
  writeSurfaceEntries,
} from './panel-write-surface.mjs'
import { whenRun } from './verdict.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const ROOT = process.cwd()
const P = (rel) => resolve(ROOT, rel)

/** Applied in this order onto the empty database. */
export const STACK = [
  'supabase/portable/supabase-shim.sql',
  'supabase/portable/platform-defaults.sql',
  'supabase/generated/portable-core.generated.sql',
  'supabase/generated/supabase-recipe.generated.sql',
  'supabase/seed.sql',
]

/**
 * Tables the sample seed populates. Each must come back non-empty when read as
 * `anon`; an empty one means the seed did not write it OR the recipe does not
 * expose it to the deployed key, and the report cannot tell those apart from
 * here — both are the same blank screen, and both are this check's job to catch.
 *
 * evidence and business_models are deliberately absent: the seed leaves them
 * empty (an offline reader could never see restricted rows), and the recipe
 * hides business_models and evidence from anon outright (see SIGNED_IN_ONLY).
 */
export const POPULATED = [
  'services',
  'phases',
  'scenarios',
  'paths',
  'steps',
  'path_steps',
  'lanes',
  'cells',
  'cell_dependencies',
  'touchpoints',
  'cell_touchpoints',
  'resources',
  'slices',
  'slides',
]

/**
 * What a signed-out visitor may NOT read. Each relation is selected from as
 * `anon` and must be refused with a permission error, then as `authenticated`
 * and must answer. Evidence excerpts can carry interview content, the edit history
 * and the recovery list are the record of who changed what, audit findings are
 * the team's own triage, and an agent transcript belongs to its author — none
 * of it is the published board.
 *
 * Refused, not empty: a policy that hides every row still answers 200, and a
 * reader cannot tell "nothing here" from "nothing for you". A revoked grant is
 * the one answer that says which it is, and it is the one a client can gate on
 * before it asks (`canReadPrivate`).
 */
export const SIGNED_IN_ONLY = [
  'evidence',
  'evidence_counts',
  'authoring_changes',
  'trash',
  'audit_findings',
  'agent_sessions',
  'agent_messages',
]

/**
 * The board and the slices cut from it: everything a signed-out visitor reads
 * to see a blueprint.
 * `POPULATED` already proves each of these that the seed fills comes back
 * non-empty; this is the wider promise that none of them is refused, the two
 * the sample seed leaves empty included.
 */
export const PUBLIC_BOARD = [...POPULATED, 'stakeholders', 'slide_images']

/** One read of one relation as one role, as psql takes it on stdin. */
export function buildRoleReadSql(role, relation) {
  return `set role ${role};\nselect count(*) from public.${relation};\n`
}

/**
 * What the role reads got wrong. `outcomes` maps `role:relation` to `'ok'` or
 * the error text psql printed.
 */
export function evaluateRoleReads(outcomes) {
  const problems = []
  for (const relation of SIGNED_IN_ONLY) {
    const anon = outcomes.get(`anon:${relation}`)
    if (anon === 'ok') {
      problems.push(`public.${relation} is readable as anon — a signed-out visitor can read it`)
    } else if (anon !== undefined && !/permission denied/.test(anon)) {
      problems.push(`public.${relation} failed as anon for a reason other than a refusal: ${anon}`)
    }
    const signedIn = outcomes.get(`authenticated:${relation}`)
    if (signedIn !== undefined && signedIn !== 'ok') {
      problems.push(`public.${relation} is refused to a signed-in reader: ${signedIn}`)
    }
  }
  for (const relation of PUBLIC_BOARD) {
    const anon = outcomes.get(`anon:${relation}`)
    if (anon !== undefined && anon !== 'ok') {
      problems.push(`public.${relation} is refused as anon — the board and its slices must stay readable signed-out: ${anon}`)
    }
  }
  return problems
}

/**
 * The reads the app performs to render, as raw counts. `@grid` is the
 * blueprint itself — a path, its ordered steps, and the cells at each
 * lane × step; `@hierarchy` is the nav spine down to a path. Each must return
 * rows, which a populated-but-unjoinable seed (a dangling foreign key the owner
 * inserted around) would not.
 *
 * `@registry` and `@placement` are the touchpoint registry the same way the
 * app reaches it (#325). The registry is the DEPLOYMENT's (ADR 0003), so
 * `useRegistryTouchpoints` reads `touchpoints` unscoped and `@registry` is the
 * same unscoped read: non-zero proves the anon key sees the entries a panel
 * offers to link to. `@placement` is the other half — a cell's placement joined
 * to its registry row, the name / kind / icon a touchpoint cell renders
 * (`cellTouchpointsFromRows`). A deployment's touchpoints render through this
 * template's registry exactly when both reads return rows to the deployed key.
 */
export const RENDER_READS = {
  '@grid':
    'select count(*) from public.paths p ' +
    'join public.path_steps ps on ps.path_id = p.id ' +
    'join public.steps s on s.id = ps.step_id ' +
    'join public.cells c on c.step_id = s.id ' +
    'join public.lanes l on l.id = c.lane_id',
  '@hierarchy':
    'select count(*) from public.services sv ' +
    'join public.phases ph on ph.service_id = sv.id ' +
    'join public.scenarios sc on sc.phase_id = ph.id ' +
    'join public.paths pa on pa.scenario_id = sc.id',
  // A deployment carries its tool logos as data in `touchpoints.icon_url`
  // (#326). The fixture below seeds one as the owner; this read, run as anon,
  // is the deployed key seeing it — the value a deployment renders off the row
  // rather than a tool name matched against a table baked into code.
  '@icon': `select count(*) from public.touchpoints where icon_url = '${'/touchpoint-logos/example-logo.png'}'`,
  // The registry a cell can link to, read the way the hook reads it: unscoped,
  // because no service owns a registry row (ADR 0003). Non-zero proves the anon
  // key sees the entries the panel offers.
  '@registry': 'select count(*) from public.touchpoints',
  // A placement joined to its registry row — the name the touchpoint cell shows
  // in the registry's spelling, not the placement's own. The embed the board
  // query names `touchpoints`, run here as the join it compiles to.
  '@placement':
    'select count(*) from public.cell_touchpoints ct ' +
    'join public.touchpoints tp on tp.id = ct.touchpoint_id',
}

/**
 * What each render read renders, for the failure line. `@icon` is not here: its
 * empty result has a bespoke message (a grant the recipe never extended to the
 * new column), handled before this map is consulted.
 */
export const RENDER_READ_NAMES = {
  '@grid': 'the blueprint grid',
  '@hierarchy': 'the service hierarchy',
  '@registry': 'the touchpoint registry a panel offers to link to',
  '@placement': "a cell's touchpoint placement",
}

/**
 * The sample seed ships no tool logos, so the icon column would read as all-null
 * and `@icon` above could never see a value carried to the anon key. This stands
 * one up the way a deployment's seed would: the OWNER sets one touchpoint's
 * icon, and the anon read proves the deployed key sees it (#326). It runs after
 * the stack and before the inventory read.
 */
export const ICON_FIXTURE_URL = '/touchpoint-logos/example-logo.png'
export const ICON_FIXTURE_SQL =
  `update public.touchpoints set icon_url = '${ICON_FIXTURE_URL}' ` +
  'where id = (select id from public.touchpoints order by id limit 1);'

/** The single query, run as `anon`, that returns one `label|count` row each. */
export function buildInventorySql() {
  const rows = [
    ...POPULATED.map(
      (t) => `select '${t}'::text as t, count(*)::bigint as n from public.${t}`,
    ),
    ...Object.entries(RENDER_READS).map(
      ([label, sql]) => `select '${label}', n from (${sql}) as ${label.slice(1)}(n)`,
    ),
  ]
  return `set role anon;\n${rows.join('\nunion all\n')}\norder by t;`
}

/** Parse `label|count` lines from `psql -At -F '|'`. */
export function parseCounts(stdout) {
  const counts = new Map()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const [label, n] = trimmed.split('|')
    if (label === undefined || n === undefined) continue
    counts.set(label, Number(n))
  }
  return counts
}

/** What is empty that should not be. */
export function evaluate(counts) {
  const problems = []
  for (const table of POPULATED) {
    const n = counts.get(table)
    if (n === undefined) {
      problems.push(`public.${table} returned no row — the anon read never reached it`)
    } else if (n === 0) {
      problems.push(`public.${table} is empty as anon — the seed did not populate it, or the recipe does not expose it to the anon key`)
    }
  }
  for (const label of Object.keys(RENDER_READS)) {
    const n = counts.get(label)
    if (!n || n === 0) {
      if (label === '@icon') {
        problems.push(
          `a deployment touchpoint icon (@icon) is not visible as anon — the ` +
            `icon_url column did not reach the deployed key (a grant the recipe ` +
            `never extended to the new column, or the fixture did not apply)`,
        )
        continue
      }
      const what = RENDER_READ_NAMES[label] ?? label
      problems.push(`${what} (${label}) returned no rows — the seed loaded but does not render`)
    }
  }
  return problems
}

const DB = process.env.SEED_LOAD_DB ?? 'seed_load_check'

function run(bin, args, extraEnv = {}, input = undefined) {
  return execFileSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

function psql(args, extraEnv = {}, input = undefined) {
  // Notices are the migrations' running commentary (`renamed 11 objects …`);
  // warnings and above still come through, and ON_ERROR_STOP makes any error a
  // non-zero exit rather than a message swallowed mid-file.
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, ...args], {
    PGOPTIONS: '--client-min-messages=warning',
    ...extraEnv,
  }, input)
}

// THE GAPS RIDE ON THE GREEN LINE. A table this check does not yet ask about is
// said out loud on a passing run, because a gap the check knows about and does
// not name is the shape of hole this whole file exists to close — so it is part
// of the summary rather than a finding, and it is printed where the summary is.
/**
 * The verdict: the generated seed loaded on a fresh database, then read as anon
 * and written as the roles the editors use.
 *
 * Pure — it stands a database up, exercises it, decides, and hands back what it
 * found. Nothing here prints or exits.
 */
export function judge() {
  const what = 'a read the deployed key makes against the seeded database'
  run('dropdb', ['--if-exists', DB])
  run('createdb', [DB])
  try {
    for (const file of STACK) psql(['-f', P(file)])
    // Stand up a deployment's tool logo (#326) as the owner, so the anon read
    // below (`@icon`) proves the value reaches the deployed key.
    psql(['-c', ICON_FIXTURE_SQL])
    // The other half of "a deployment works": the anon read above is what a
    // reader sees, this is what a signed-in AUTHOR may write. It BECOMES the
    // role and attempts each write inside a transaction it rolls back, because
    // the catalog cannot answer the question — a policy that exists and admits
    // nobody satisfies an existence test, and every one of these tables carries
    // one. See scripts/panel-write-surface.mjs.
    //
    // Fed on stdin rather than with `-c`, because it is a script: fixtures, a
    // temp table, a loop, and the ROLLBACK that undoes all three.
    const writeProblems = evaluateWriteSurface(
      psql(['-At', '-F', '|', '-f', '-'], {}, buildWriteSurfaceSql()),
    )
    if (writeProblems.length > 0) {
      return {
        what,
        opening: 'The recipe applied, but a signed-in author cannot write what the panels show:\n',
        findings: writeProblems.map((problem) => `  ${problem}`),
        closing:
          '\nThe editors make these writes directly, under the caller\'s own ' +
          'privileges. A missing grant is a refusal the author sees; a missing ' +
          'UPDATE or DELETE policy is worse — the statement matches no row and ' +
          'returns 200, so a save is reported as a deleted row and a delete as no ' +
          'change at all. Neither is visible locally, where the dev service key ' +
          'bypasses RLS. Each line above is a write that was actually attempted, ' +
          'as the role, against the database this run built.',
      }
    }
    // Who may read what, asked by BECOMING each role — the catalog can say a
    // grant exists, only the read says whether it is refused.
    const outcomes = new Map()
    const reads = [
      ...SIGNED_IN_ONLY.flatMap((relation) => [
        ['anon', relation],
        ['authenticated', relation],
      ]),
      ...PUBLIC_BOARD.map((relation) => ['anon', relation]),
    ]
    for (const [role, relation] of reads) {
      try {
        psql(['-At', '-f', '-'], {}, buildRoleReadSql(role, relation))
        outcomes.set(`${role}:${relation}`, 'ok')
      } catch (error) {
        outcomes.set(
          `${role}:${relation}`,
          (error.stderr?.toString() ?? String(error.message)).trim(),
        )
      }
    }
    const readProblems = evaluateRoleReads(outcomes)
    if (readProblems.length > 0) {
      return {
        what,
        opening: 'The recipe applied, but who may read what is not what it should be:\n',
        findings: readProblems.map((problem) => `  ${problem}`),
        closing:
          '\nEvidence, the edit history and its recovery list, audit findings and ' +
          'agent transcripts are for signed-in readers; the board and its ' +
          'slices are for everyone. Revoke the anon grant (and any policy naming anon or ' +
          'public) for the first kind; keep the anon grant on the second.',
      }
    }
    const stdout = psql(['-At', '-F', '|', '-c', buildInventorySql()])
    const counts = parseCounts(stdout)
    const problems = evaluate(counts)
    if (problems.length > 0) {
      return {
        what,
        count: counts.size,
        opening: 'The seed loaded, but a keyless read does not see the content:\n',
        findings: problems.map((problem) => `  ${problem}`),
        closing:
          '\nThis is the deployed app reading with the anon key. A table it cannot ' +
          'see renders blank in the browser. Expose it to anon in the recipe ' +
          '(a migration `grant select … to anon`), or fix the seed that left it empty.',
      }
    }
    const assertions = writeSurfaceAssertions()
    const entries = writeSurfaceEntries()
    const verbs = [...new Set(entries.flatMap((entry) => entry.verbs))].sort()
    return {
      what,
      count: counts.size,
      line:
        `the generated seed loads on a fresh core + recipe and renders as anon ` +
        `(${POPULATED.length} tables populated, ${Object.keys(RENDER_READS).length} render reads return rows), ` +
        `refuses anon on ${SIGNED_IN_ONLY.length} signed-in-only relations a signed-in reader still reads, ` +
        `and every write the editors make was attempted as the role and rolled back ` +
        `(${assertions.filter((one) => one.who === 'author').length} an author made, ` +
        `${assertions.filter((one) => one.who === 'viewer').length} a signed-in reader was refused, ` +
        `over ${entries.length} tables and ${verbs.join('/').toLowerCase()})` +
        Object.entries(ANY_SIGNED_IN_USER_MAY_WRITE)
          .map(([table, because]) => `\n  not yet asked of public.${table}: ${because}`)
          .join(''),
    }
  } catch (error) {
    // A non-zero psql exit — an apply that would not run, or a read the anon
    // role is refused. Its stderr names the file and the statement, so it is
    // the most useful thing to print.
    const stderr = error.stderr?.toString() ?? ''
    return {
      what,
      opening: 'The fresh-database seed load failed:\n',
      findings: [stderr.trim() || String(error.message)],
      closing:
        '\nThe stack that is applied, in order:\n' +
        STACK.map((f) => `  ${f}`).join('\n') +
        '\n\nReproduce it by hand against a scratch database with those files, ' +
        'in that order, under `psql -v ON_ERROR_STOP=1`.',
    }
  } finally {
    run('dropdb', ['--if-exists', DB])
  }
}

whenRun(import.meta.url, judge)
