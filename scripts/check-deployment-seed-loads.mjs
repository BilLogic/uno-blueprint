#!/usr/bin/env node
/**
 * A DEPLOYMENT's own seed loads onto THIS template's portable core, and renders.
 *
 * `check:seed-load` proves the loop closes on content this repository generated
 * itself. That is necessary and it is not the interesting question, because the
 * generator and the schema move together — a seed this repo emits can hardly
 * disagree with a core this repo emits. The interesting question is the one a
 * reconciliation ticket actually asks: is the portable core SUFFICIENT for the
 * content a real deployment holds? Only a deployment's own seed can answer it,
 * and that answer is what this check is.
 *
 *   npm run check:deployment-seed-load
 *   npm run check:deployment-seed-load -- --seed ../their-app/supabase/seed.sql
 *
 * The mechanism is deliberately the same as its sibling's, minus the last step:
 *
 *   1. supabase/portable/supabase-shim.sql        the role names + auth/storage
 *   2. supabase/portable/platform-defaults.sql    the platform's default privileges
 *   3. supabase/generated/portable-core.generated.sql      the contract
 *   4. supabase/generated/supabase-recipe.generated.sql    the enforcement
 *   5. THE DEPLOYMENT'S SEED, in the order the deployment itself loads it
 *
 * Then the same anon reads: every table the seed inserts into comes back
 * non-empty to the key a browser holds, and the two joins the app renders — the
 * blueprint grid and the service hierarchy — return rows.
 *
 * ── Why the apply half does not stop at the first error ───────────────────
 *
 * Its sibling runs under `ON_ERROR_STOP=1`, because one broken statement in a
 * seed this repo generated is a bug to fix now. Here the failing statements ARE
 * the deliverable: a reconciliation ticket needs the whole list, grouped, not
 * the first line of it. So the seed is applied with the stop switch OFF and
 * every `psql:file:line: ERROR:` is collected, grouped by reason, and reported
 * with counts and examples.
 *
 * Knock-on failures are separated from root causes and labelled, because a seed
 * loads in dependency order: a lane whose path never inserted fails its foreign
 * key, and every cell in that lane then fails the core's row-validation trigger.
 * Reporting forty of those beside the one column that started it buries the
 * finding. Foreign-key violations and the core's own `cells: …` raises are
 * therefore listed second, under a heading that says they are downstream.
 *
 * ── Finding the deployment ────────────────────────────────────────────────
 *
 * `--seed <path>` or `DEPLOYMENT_SEED=<path>` names it outright, and an
 * operator-named file is not a subject: those two branches resolve the path
 * they were handed and nothing else is consulted.
 *
 * With neither, the check names the `deployment-seed` SUBJECT and judges what
 * comes back. Which sibling checkout is a deployment of this template, and what
 * that deployment loads, are the sweep's questions — asked of the tree the
 * command was run in, not of wherever this file happens to sit, so a deployment
 * running the packaged copy of this check gets its own answer. None, or more
 * than one, and the sweep says the skip out loud and hands back `seen: false`;
 * this check then explains how to point it at a seed and exits 0. That is why
 * it is not in CI: a CI runner checks out one repository, so this check would
 * skip on every run and prove nothing. It is a local guard —
 * docs/engineering/checks.md § The database.
 *
 * ── What counts as "the seed" ─────────────────────────────────────────────
 *
 * A Supabase deployment states its seed in `supabase/config.toml` as an ORDERED
 * list under `[db.seed]`, and a deployment of any size uses it: one file per
 * scenario, loaded after the file that creates the service they hang off. So
 * when a `config.toml` sits beside the named seed, that list is the seed — in
 * its order, globs expanded — and the named file is only how the deployment was
 * located. With no `[db.seed]` section at all, the named file is the whole seed.
 *
 * A section that is there but DISABLED or EMPTY is neither of those, and is the
 * third case this check used to collapse into the second: a deployment that has
 * taken its seed list out of the CLI's reach on purpose. It refuses — see
 * `SEED_LIST_IS_ELSEWHERE` — and the way to run it against such a deployment is
 * to name the files, `--seed a.sql --seed b.sql` or `--seed a.sql,b.sql`, in
 * load order. Named files win over everything, including that refusal.
 *
 * An entry in that list with no file behind it stops the check rather than
 * being passed over, and the text of the files is read before a database is
 * created rather than after the whole apply. Both for the same reason: what
 * this check reports is a claim about a named set of files.
 *
 * Needs a reachable Postgres 17 and permission to create a database, exactly
 * like its sibling.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { RENDER_READS, RENDER_READ_NAMES, STACK, parseCounts } from './check-seed-loads.mjs'
import { sweep } from './sweep.mjs'
import { RESOLVES_TO_NOTHING, resolveSeedFiles } from './seed-list.mjs'
import { whenRun } from './verdict.mjs'

/** This template's own stack files, under the tree the check was run in. */
// The stack is this template's own — the shim, the defaults, the core, the
// recipe — laid down from the tree the check runs in, which is the template:
// this check asks whether a DEPLOYMENT's seed loads onto THIS core, so the
// seed is a subject and the core is the caller's.
const P = (rel) => resolve(process.cwd(), rel)

/**
 * The stack, minus this repository's own seed — a deployment's seed replaces
 * that last step rather than landing on top of it. Filtered rather than sliced
 * so a reordering of STACK cannot silently drop the recipe instead.
 */
export const CORE_STACK = STACK.filter((file) => !/seed\.sql$/.test(file))

/** The render reads a deployment's seed is held to, whatever else it carries. */
export const DEPLOYMENT_RENDER_READS = {
  '@grid': RENDER_READS['@grid'],
  '@hierarchy': RENDER_READS['@hierarchy'],
}

// ── Locating a deployment, and what it loads ───────────────────────────────
//
// Both questions live in seed-list.mjs, which the sweep's deployment-seed
// subject asks too; they are re-exported here for the callers and tests that
// learned them under this name.
export { chooseDeployment, siblingCandidates, packageName, seedSectionFromConfig, expandSeedEntries, resolveSeedFiles } from './seed-list.mjs'

// ── Reading what psql said ─────────────────────────────────────────────────

/** `psql:<file>:<line>: ERROR:  <message>` — the only line shape that matters. */
export const PSQL_ERROR = /^psql:(.+):(\d+): ERROR:\s+(.*)$/

/** Every failing statement psql reported, as `{ file, line, message }`. */
export function parsePsqlErrors(stderr) {
  const failures = []
  for (const line of stderr.split('\n')) {
    const match = PSQL_ERROR.exec(line.trim())
    if (match) failures.push({ file: match[1], line: Number(match[2]), message: match[3] })
  }
  return failures
}

/**
 * Did psql fail to RUN a seed file at all, rather than report the statements in
 * it?
 *
 * The apply half runs with the stop switch off on purpose, so a file whose
 * every statement fails still exits 0 and hands back the whole list. A non-zero
 * status therefore means psql itself gave up before or outside that — and the
 * reachable way for that to happen here is a path that stopped being there,
 * since a scratch database that was just created sits between the listing and
 * this moment. Left unread, that status is the quiet version of the same
 * defect: nothing loads, nothing is reported, and the run goes on to grade a
 * seed that never arrived.
 *
 * Collected failures win, because a seed that sets `ON_ERROR_STOP` in its own
 * text exits non-zero with real findings attached, and those findings are the
 * deliverable.
 */
export function fileNeverRan(status, failures) {
  return status !== 0 && failures.length === 0
}

/**
 * Is this failure a consequence of an earlier one rather than a finding?
 *
 * A seed loads in dependency order. When the statement that inserts a path
 * fails, every lane on that path fails its foreign key and every cell in those
 * lanes fails the core's own row-validation trigger — which raises `cells: …`
 * rather than a constraint name. A seed that wraps its load in one transaction
 * adds a third shape: once any statement fails, Postgres refuses the rest of
 * the block outright. Those three are the whole knock-on surface, and
 * separating them is what keeps the one real cause visible.
 */
export function isDownstream(message) {
  return (
    /violates foreign key constraint/.test(message) ||
    /^cells[.:]/.test(message) ||
    /current transaction is aborted/.test(message)
  )
}

/** Failures collapsed to distinct reasons, root causes first, commonest first. */
export function groupFailures(failures) {
  const byMessage = new Map()
  for (const failure of failures) {
    const group = byMessage.get(failure.message) ?? {
      message: failure.message,
      downstream: isDownstream(failure.message),
      count: 0,
      examples: [],
    }
    group.count += 1
    if (group.examples.length < 3) group.examples.push(`${failure.file}:${failure.line}`)
    byMessage.set(failure.message, group)
  }
  return [...byMessage.values()].sort(
    (a, b) => Number(a.downstream) - Number(b.downstream) || b.count - a.count,
  )
}

// ── Reading the loaded content back, as the deployed key ───────────────────

/**
 * The text of every seed file, joined — read BEFORE anything is applied.
 *
 * This read used to sit at the far end of the run: after the scratch database
 * was made, after four core files went into it, and after one `psql -f` per
 * seed file. Every other listing-then-read in this repository closes in
 * microseconds; this one was held open across a multi-second subprocess, which
 * made it the longest such window in the tree and the only one wide enough for
 * an unrelated process to walk through.
 *
 * Nothing in the read needs the apply — it only wants the text, to learn which
 * tables the seed writes. So it happens here, a moment after the listing that
 * produced these paths, where the window is a few microseconds and where a path
 * that has gone costs nothing that has already been done.
 *
 * A file that is not there is not skipped. The check's whole output is a claim
 * about a named set of files, and a set it quietly shrank is a green that
 * measured something else. This throws, and the reason stays legible in what it
 * throws: `ENOENT` for a path that has gone, something else for a path that
 * cannot be read — the same two cases the sweep's `read` keeps apart for
 * the listings that ARE deliberately stale. Neither is tolerable here, so
 * neither is caught.
 */
export function readSeedFiles(files) {
  return files.map((file) => readFileSync(file, 'utf8')).join('\n')
}

/** Tables a seed inserts into, in first-mention order. */
export function seededTables(sql) {
  const tables = []
  for (const match of sql.matchAll(/insert\s+into\s+public\.([a-z_][a-z0-9_]*)/gi)) {
    const table = match[1].toLowerCase()
    if (!tables.includes(table)) tables.push(table)
  }
  return tables
}

/** The single `label|count` query, run as `anon`. */
export function buildInventorySql(tables) {
  const rows = [
    ...tables.map((t) => `select '${t}'::text as t, count(*)::bigint as n from public.${t}`),
    ...Object.entries(DEPLOYMENT_RENDER_READS).map(
      ([label, sql]) => `select '${label}', n from (${sql}) as ${label.slice(1)}(n)`,
    ),
  ]
  return `set role anon;\n${rows.join('\nunion all\n')}\norder by t;`
}

/** What is empty that the deployment's seed populated. */
export function evaluate(counts, tables) {
  const problems = []
  for (const table of tables) {
    const n = counts.get(table)
    if (n === undefined) {
      problems.push(`public.${table} returned no row — the anon read never reached it`)
    } else if (n === 0) {
      problems.push(
        `public.${table} is empty as anon — the deployment's seed writes it, but the ` +
          `deployed key cannot see a row of it`,
      )
    }
  }
  for (const label of Object.keys(DEPLOYMENT_RENDER_READS)) {
    const n = counts.get(label)
    if (!n) {
      const what = RENDER_READ_NAMES[label] ?? label
      problems.push(
        `${what} (${label}) returned no rows — the deployment's content loaded but does not render`,
      )
    }
  }
  return problems
}

// ── Running it ─────────────────────────────────────────────────────────────

const DB = process.env.DEPLOYMENT_SEED_DB ?? 'deployment_seed_check'

function run(bin, args, extraEnv = {}) {
  return spawnSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 64 * 1024 * 1024,
  })
}

function psql(args, { stopOnError = true } = {}) {
  return run('psql', ['-X', '-q', '-v', `ON_ERROR_STOP=${stopOnError ? 1 : 0}`, '-d', DB, ...args], {
    PGOPTIONS: '--client-min-messages=warning',
  })
}

/** `--seed <path>` from argv, or null. */
export function seedFlags(argv) {
  const paths = []
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] !== '--seed') continue
    const value = argv[at + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--seed needs a path')
    }
    // Repeated and comma-separated both, because a deployment whose seed is
    // twenty-three files has to be able to name them without twenty-three
    // flags, and a caller assembling the list from a loop wants the flag.
    for (const part of value.split(',')) {
      const path = part.trim()
      if (path !== '') paths.push(path)
    }
    at += 1
  }
  return paths
}

/**
 * Named seed files, absolute and in the order given — the operator's answer to
 * the question a config with no list cannot answer.
 *
 * Held to the same rule as an entry in a `[db.seed]` list: every one has to be
 * a file that is there. A name with nothing behind it is the failure
 * `RESOLVES_TO_NOTHING` describes, and typing it by hand makes it likelier,
 * not less.
 */
export function resolveNamedSeeds(paths) {
  return paths.map((path) => {
    const file = resolve(path)
    let stats
    try {
      stats = statSync(file)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      throw new Error(`--seed names ${file}, and it is not there.\n${RESOLVES_TO_NOTHING}`, {
        cause: error,
      })
    }
    if (!stats.isFile()) {
      throw new Error(`--seed names ${file}, and it is not a file.\n${RESOLVES_TO_NOTHING}`)
    }
    return file
  })
}

function skip() {
  // The skip is correct — one checkout genuinely has no deployment to load —
  // and it was invisible, which is the half that is not. A run that loaded a
  // deployment's seed onto this core and a run that loaded nothing at all both
  // ended in a green exit and a log line.
  //
  // THE ANNOUNCEMENT IS THE SWEEP'S, NOT THIS CHECK'S. Naming the subject is
  // what made the skip visible: the sweep has already said, as a warning
  // annotation and a line in the run summary, that a deployment's seed against
  // this template's portable core went unverified, and which of "none" and
  // "several" it saw. Saying it a second time here would print one fact twice
  // and let a reader count call sites instead of subjects. What is left for
  // this check to say is the part the sweep does not: how an operator points
  // it at a seed, which the sweep's sentence mentions and does not spell out.
  console.log(
    `skipped: no deployment's seed to load — see the unverified warning above.\n` +
      `  This check loads a DEPLOYMENT's seed onto this template's core, so it needs a\n` +
      `  deployment checkout. Point it at one with --seed <path-to-supabase/seed.sql>\n` +
      `  or DEPLOYMENT_SEED=<path>. CI checks out one repository and so always skips —\n` +
      `  run it locally before a release. See docs/engineering/checks.md § The database.`,
  )
}

/** The subject, said the way the sweep's register says it. */
const WHAT = "a deployment's seed against this template's portable core"

export function judge(argv = process.argv.slice(2)) {
  const fromEnv = process.env.DEPLOYMENT_SEED
    ? process.env.DEPLOYMENT_SEED.split(',').map((part) => part.trim()).filter(Boolean)
    : []
  const named = [...seedFlags(argv), ...fromEnv]
  let seedPath
  let files
  // The deployment's own root, when the subject named one; otherwise it is
  // read back off the named seed below.
  let base = null
  // Every way of resolving the seed refuses by throwing, and each of those
  // refusals is written for the person who ran the command. A stack trace
  // buries the sentence that tells them what to pass — so the message is the
  // finding, and the verdict carries the failure.
  const refuse = (error) => ({ what: WHAT, findings: [error.message] })
  if (named.length > 1) {
    // Several files named outright: the operator has answered what the config
    // could not, so nothing else is consulted. This is the ONLY way to run the
    // check against a deployment that loads its seed from its own loader.
    try {
      files = resolveNamedSeeds(named)
    } catch (error) {
      return refuse(error)
    }
    seedPath = files[0]
  } else if (named.length === 1) {
    seedPath = resolve(named[0])
    if (!existsSync(seedPath)) return { what: WHAT, findings: [`no seed at ${seedPath}`] }
    try {
      files = resolveSeedFiles(seedPath)
    } catch (error) {
      return refuse(error)
    }
  } else {
    // Nothing was named, so the seed is a SUBJECT: which deployment, and which
    // of its files in which order, are the sweep's answer. `seen: false` is the
    // skip, already announced where a person sees it.
    const swept = sweep({ subject: 'deployment-seed' })
    if (!swept.seen) {
      skip()
      return {}
    }
    base = swept.base
    // The subject's paths are relative to the deployment's root; psql is given
    // the absolute file.
    files = swept.files.map((file) => swept.locate(file))
    seedPath = files[0]
  }
  if (files.length === 0) {
    return { what: WHAT, findings: [`the seed at ${seedPath} resolves to no files`] }
  }
  // `supabase/seed.sql` → the checkout that holds it, so every path in the
  // report reads the way the deployment's own tree does. When the subject named
  // the deployment it has already said which root that is.
  const deploymentRoot = base ?? dirname(dirname(resolve(seedPath)))
  const show = (file) => relative(deploymentRoot, file)
  // Here, next to the listing, rather than after the apply — see readSeedFiles.
  const seedSql = readSeedFiles(files)

  run('dropdb', ['--if-exists', DB])
  const created = run('createdb', [DB])
  if (created.status !== 0) {
    return {
      what: WHAT,
      findings: [`could not create the scratch database ${DB}:\n${created.stderr?.trim() ?? ''}`],
    }
  }
  try {
    for (const file of CORE_STACK) {
      const applied = psql(['-f', P(file)])
      if (applied.status !== 0) {
        return {
          what: WHAT,
          opening: `this template's own stack did not apply — ${file}:\n`,
          findings: [applied.stderr?.trim() ?? ''],
          closing: '\nThat is `npm run check:seed-load`\'s failure, not this one. Run it first.',
        }
      }
    }

    const failures = []
    for (const file of files) {
      const loaded = psql(['-f', file], { stopOnError: false })
      const reported = parsePsqlErrors(loaded.stderr ?? '')
      if (fileNeverRan(loaded.status, reported)) {
        return {
          what: WHAT,
          opening: `psql could not run ${show(file)}:\n`,
          findings: [loaded.stderr?.trim() ?? ''],
          closing:
            '\nNothing in that file reached the database, so everything after it would be ' +
            'grading a seed the deployment does not load.',
        }
      }
      failures.push(...reported)
    }

    if (failures.length > 0) {
      const groups = groupFailures(failures)
      const causes = groups.filter((g) => !g.downstream)
      const knockOn = groups.filter((g) => g.downstream)
      const touched = new Set(failures.map((f) => f.file))
      const group = (g) => [`  ${g.count}x  ${g.message}`, `        ${g.examples.map((e) => show(e)).join(', ')}`]
      return {
        what: WHAT,
        opening:
          `The deployment's seed does not load onto this template's portable core: ` +
          `${failures.length} statements failed across ${touched.size} of ${files.length} seed files.\n`,
        findings: [
          `Root causes (${causes.length} distinct):\n`,
          ...causes.flatMap(group),
          ...(knockOn.length > 0
            ? [
                `\nKnock-on (${knockOn.length} distinct) — rows an earlier failure never inserted:\n`,
                ...knockOn.flatMap(group),
              ]
            : []),
        ],
        closing:
          `\nEach root cause is one of two things, and the message says which:\n` +
          `  - a name or column the core does NOT carry, that the deployment needs —\n` +
          `    a gap in the portable core, and the reconciliation ticket's content;\n` +
          `  - a name the core carries under its CURRENT spelling, which the seed still\n` +
          `    writes under a retired one — the seed is behind, not the core.\n` +
          `Compare each against supabase/generated/portable-core.schema.sql before\n` +
          `deciding which. Reproduce by hand with:\n` +
          `  createdb scratch\n` +
          CORE_STACK.map((f) => `  psql -v ON_ERROR_STOP=1 -d scratch -f ${f}`).join('\n') +
          `\n  psql -d scratch -f ${show(files[0])}   # then the rest, in order`,
      }
    }

    const tables = seededTables(seedSql)
    const inventory = psql(['-At', '-F', '|', '-c', buildInventorySql(tables)])
    if (inventory.status !== 0) {
      return {
        what: WHAT,
        opening: "The deployment's seed applied, but the anon read was refused:\n",
        findings: [inventory.stderr?.trim() ?? ''],
      }
    }
    const problems = evaluate(parseCounts(inventory.stdout ?? ''), tables)
    return {
      what: WHAT,
      count: tables.length,
      opening:
        problems.length > 0
          ? "The deployment's seed loaded, but a keyless read does not see the content:\n"
          : undefined,
      findings: problems.map((problem) => `  ${problem}`),
      closing:
        problems.length > 0
          ? '\nThis is the deployed app reading with the anon key. A table it cannot see ' +
            'renders blank in the browser. Expose it to anon in the recipe (a migration ' +
            '`grant select … to anon`).'
          : undefined,
      line:
        `the deployment's seed (${files.length} file(s) under ${basename(deploymentRoot)}/) ` +
        `loads on a fresh core + recipe and renders as anon ` +
        `(${tables.length} tables populated, ` +
        `${Object.keys(DEPLOYMENT_RENDER_READS).length} render reads return rows)`,
    }
  } finally {
    run('dropdb', ['--if-exists', DB])
  }
}

// THE SKIP IS NOT THE VERDICT'S UNVERIFIED. The sweep has already put this
// subject in the register, and saying it a second time here would print one
// fact twice — so `skip()` says only the part the sweep does not, and hands
// back a judgement with nothing to report and nothing to fail.
whenRun(import.meta.url, judge)
