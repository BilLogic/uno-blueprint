#!/usr/bin/env node
/**
 * The cell-edit slice, over standalone PostgREST on a real database.
 *
 * `src/slices/cellEditRevert.slice.test.tsx` drives the cell edit with its
 * revert through the real panel, save, ledger and revert. Its fast form runs
 * over an in-memory table, which cannot see a grant or a policy. This is the
 * primary form the slice ticket asked for: the same flow, through
 * `supabase-js`, against PostgREST over the stack `check:seed-load` builds,
 * as the role a signed-in author is — `authenticated`, carrying the service
 * claim the recipe's restrictive policies ask for. A grant the recipe forgot
 * on a column the panel writes is a 42501 here; a policy that admits nobody
 * is an update that matched no row, which the save refuses; either fails the
 * slice rather than only the seed-load check.
 *
 *   POSTGREST_BIN=<path to postgrest> node scripts/run-slice-over-postgrest.mjs [--prove]
 *
 * What it does, in order, and takes down again in a `finally`:
 *
 *   1. builds the stack into a scratch database (`SLICE_DB`, default
 *      `slice_over_postgrest`), plus the one role PostgREST needs that the
 *      shim does not make — `authenticator`, which logs in and switches to
 *      `anon` or `authenticated` per request;
 *   2. starts PostgREST on `SLICE_PORT` (default 3111) with a secret this
 *      run generates, and waits for it to answer;
 *   3. mints the service claim with that secret and runs the slice with
 *      `SLICE_POSTGREST_URL` and `SLICE_POSTGREST_JWT` set, timing it;
 *   4. with `--prove`: revokes UPDATE on one column the panel writes, runs
 *      the slice again and requires it to FAIL, then puts the grant back. A
 *      guard nobody has watched go red is a guard nobody knows the shape of.
 *
 * WITHOUT A BINARY IT SAYS SO AND STOPS. PostgREST is not an npm package and
 * not something this repository downloads on a developer's machine without
 * asking; CI fetches a pinned release. A run with no `POSTGREST_BIN` and no
 * `postgrest` on PATH is a run that measured nothing, and that is said
 * through the unverified register — a warning and a summary line — rather
 * than a green exit.
 *
 * The runtime is printed on every run because the ticket asked for it: the
 * decision to keep this as the primary form holds while it stays near a
 * minute, and the large-component-splits decision records the number.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STACK } from './check-seed-loads.mjs'
import { mintServiceClaim } from './mint-service-claim.mjs'
import { sweep, unverified } from './sweep.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const ROOT = process.cwd()
const DB = process.env.SLICE_DB ?? 'slice_over_postgrest'
const PORT = Number(process.env.SLICE_PORT ?? 3111)
/** The slice, an application file: located through the `app` subject like every other. */
const SLICE = 'src/slices/cellEditRevert.slice.test.tsx'
/** The column the proof revokes: written by the content half of every save. */
const PROOF_COLUMN = 'summary'

function run(bin, args, extraEnv = {}, input) {
  return execFileSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

function psql(args, input) {
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, ...args], {
    PGOPTIONS: '--client-min-messages=warning',
  }, input)
}

/**
 * The PostgREST binary, or null: the flag, then PATH. A flag that names a
 * path with nothing at it is a misconfiguration, not an absence — a typo in
 * CI would otherwise turn the whole step into a green skip — so it fails,
 * naming the path it looked at.
 */
function postgrestBinary() {
  const named = process.env.POSTGREST_BIN
  if (named) {
    if (!existsSync(named)) throw new Error(`POSTGREST_BIN names ${named}, and nothing is there`)
    return resolve(named)
  }
  const found = spawnSync('sh', ['-c', 'command -v postgrest'], { encoding: 'utf8' })
  return found.status === 0 ? found.stdout.trim() : null
}

/**
 * The stack `check:seed-load` applies, then the role PostgREST connects as.
 * `authenticator` is PostgREST's, not the recipe's: it holds no privilege of
 * its own and is granted the two request roles so it can switch to them.
 */
function buildDatabase(password) {
  run('dropdb', ['--if-exists', DB])
  run('createdb', [DB])
  for (const file of STACK) psql(['-f', resolve(ROOT, file)])
  psql(
    ['-f', '-'],
    `do $$ begin
       if not exists (select from pg_roles where rolname = 'authenticator') then
         create role authenticator noinherit login;
       end if;
     end $$;
     grant anon, authenticated to authenticator;`,
  )
  // The password comes in through the environment and a psql variable, not
  // the statement text: a statement that fails is echoed into the log with
  // its position, and an argument is a process listing away.
  run(
    'psql',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', '-'],
    { PGOPTIONS: '--client-min-messages=warning', SLICE_AUTHENTICATOR_PASSWORD: password },
    "\\getenv pw SLICE_AUTHENTICATOR_PASSWORD\nalter role authenticator with password :'pw';\n",
  )
}

/** The connection string PostgREST is given: the CI service's host and port, this run's role. */
function databaseUri(password) {
  const host = process.env.PGHOST ?? 'localhost'
  const port = process.env.PGPORT ?? '5432'
  return `postgres://authenticator:${encodeURIComponent(password)}@${host}:${port}/${DB}`
}

async function waitForPostgrest(child, url) {
  const started = Date.now()
  let last = 'nothing listening'
  while (Date.now() - started < 30_000) {
    if (child.exitCode !== null) throw new Error(`PostgREST exited with ${child.exitCode} before it answered`)
    try {
      const response = await fetch(url)
      if (response.ok) return
      // A 503 is PostgREST still loading its schema cache; anything else that
      // is not 200 is remembered so the failure says what it answered.
      last = `HTTP ${response.status}`
    } catch {
      last = 'nothing listening'
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`PostgREST did not come up on ${url} within 30 seconds (last: ${last})`)
}

/** The child gone, or two seconds passed: what `dropdb` waits for. */
function exited(child) {
  if (!child || child.exitCode !== null) return Promise.resolve()
  return new Promise((settle) => {
    const timer = setTimeout(settle, 2000)
    child.once('exit', () => {
      clearTimeout(timer)
      settle()
    })
    child.kill('SIGTERM')
  })
}

/** The slice, timed. `{ status, seconds, output }`. */
function runSlice(url, jwt, test, label, env = {}) {
  const started = Date.now()
  const slice = isAbsolute(test) ? test :
    sweep({ subject: 'app', root: ROOT, where: (path) => path === test, what: label }).locate(test)
  const result = spawnSync('npx', ['vitest', 'run', slice], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, SLICE_POSTGREST_URL: url, SLICE_POSTGREST_JWT: jwt, ...env, CI: process.env.CI ?? 'true' },
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    status: result.status,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

/** The PostgREST child, module-wide so a signal handler can reach it. */
let child = null

/** Take the child and the scratch database down; what every exit path ends in. */
async function takeDown() {
  await exited(child)
  child = null
  try {
    // `--force`, for a pool connection that outlived the two seconds.
    run('dropdb', ['--if-exists', '--force', DB])
  } catch (error) {
    // Said, not thrown: a drop that fails must not mask the run's own answer.
    console.error(`could not drop ${DB}: ${error.stderr?.toString().trim() || error.message}`)
  }
}

/**
 * Shared scratch stack for the live tests. `prepare(psql)` runs after the stack
 * is built and before PostgREST starts — test setup a caller adds on top of the
 * committed seed. `env(secret)` returns further variables for the test, such as
 * claims minted for named accounts with this run's secret.
 */
export async function runPostgrestTest({
  test = SLICE, label = 'the cell-edit slice', prove = false,
  prepare = () => {}, env = () => ({}),
  jwtSecret: suppliedSecret, mintClaim = mintServiceClaim,
} = {}) {
  let binary
  try {
    binary = postgrestBinary()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }
  if (!binary) {
    unverified(
      `${label} over PostgREST`,
      'no PostgREST binary was found (POSTGREST_BIN unset and nothing on PATH), so the test ' +
        'did not run here against the recipe’s grants and policies. CI fetches a pinned release; ' +
        'locally, point POSTGREST_BIN at one.',
    )
    console.log('skipped: no PostgREST binary — see the unverified warning above.')
    return
  }

  const password = randomBytes(12).toString('hex')
  const secret = suppliedSecret ?? randomBytes(32).toString('hex')
  const url = `http://localhost:${PORT}`
  const stderr = []
  try {
    buildDatabase(password)
    prepare(psql)
    child = spawn(binary, [], {
      env: {
        ...process.env,
        PGRST_DB_URI: databaseUri(password),
        PGRST_DB_SCHEMAS: 'public',
        PGRST_DB_ANON_ROLE: 'anon',
        PGRST_JWT_SECRET: secret,
        PGRST_SERVER_PORT: String(PORT),
        PGRST_LOG_LEVEL: 'error',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)))
    await waitForPostgrest(child, url)
    const jwt = await mintClaim({ secret })
    const extra = env(secret)

    const green = runSlice(url, jwt, test, label, extra)
    if (green.status !== 0) {
      console.error(green.output)
      console.error(`\n${label} FAILED over PostgREST (${green.seconds}s)`)
      process.exitCode = 1
      return
    }
    console.log(green.output.trim())
    console.log(`${label} passed over PostgREST in ${green.seconds}s`)

    if (prove) {
      psql(['-c', `revoke update (${PROOF_COLUMN}) on public.cells from authenticated`])
      // PostgREST caches the schema; a reload notification is how a grant
      // change reaches it without a restart.
      psql(['-c', "notify pgrst, 'reload schema'"])
      let red
      try {
        red = runSlice(url, jwt, test, label, extra)
      } finally {
        // Put back whatever happened, so a throw mid-proof does not leave the
        // database (which the outer finally drops anyway) or a reader of the
        // log believing the grant is gone.
        psql(['-c', `grant update (${PROOF_COLUMN}) on public.cells to authenticated`])
        psql(['-c', "notify pgrst, 'reload schema'"])
      }
      if (red.status === 0) {
        console.error(
          `the slice stayed green with UPDATE on public.cells.${PROOF_COLUMN} revoked from ` +
            'authenticated: it is not measuring the grants, and a guard that cannot go red ' +
            'is not a guard',
        )
        process.exitCode = 1
        return
      }
      console.log(
        `and went red with UPDATE on public.cells.${PROOF_COLUMN} revoked (${red.seconds}s), ` +
          'so the grants are what it measures',
      )
    }
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message)
    if (stderr.length > 0) console.error(stderr.join('').trim())
    process.exitCode = 1
  } finally {
    await takeDown()
  }
}

// A cancelled job takes the child and the scratch database with it, rather
// than leaving a PostgREST on the port and a database for the next run to
// trip over.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    takeDown().finally(() => process.exit(130))
  })
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) await runPostgrestTest({ prove: process.argv.includes('--prove') })
