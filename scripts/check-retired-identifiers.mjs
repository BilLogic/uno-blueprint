#!/usr/bin/env node
/**
 * Check A — retired vocabulary surviving in a database identifier.
 *
 * `alter table … rename` moves the table and the column and nothing else. The
 * index, the constraint, the policy, the trigger, the comment and every plpgsql
 * body keep the name they were created with. An instance built on this
 * template discovered that the hard way — twenty-two objects still carrying
 * retired words a day after the rename that was supposed to have moved them,
 * and nine functions referencing columns that no longer existed because the
 * sweep's `\mservice_scenarios?\M` could not match inside
 * `service_scenario_id`. Both were found by hand, weeks later.
 *
 * This package avoided both: `21000102`'s `__rename_schema_objects` reads the
 * catalogue instead of a hand-written list, and `__assert_vocabulary_gone` was
 * run by each rename. But those helpers were dropped by `21000109` — correctly,
 * they were scaffolding — so nothing has watched the schema since. A rename
 * that lands tomorrow gets no assertion at all unless it writes its own.
 *
 * WHY THIS ASKS A REAL DATABASE. Upstream's equivalent statically replays the
 * migration series in JavaScript, and its own output admits the limit: it
 * checks the FILES, and anything applied out of band is invisible to it. It
 * also cannot see through a `do` block that renames objects from the catalogue,
 * which is exactly how every rename in this package is written — a static
 * reader would report the pre-rename names and be wrong about all of them.
 *
 * CI already builds the real thing. `ci.yml` applies the generated core to a
 * stock `postgres:17`, and separately replays every migration in order into
 * `migration_replay`. Sweeping `pg_catalog` there costs one query and cannot
 * drift from what the migrations actually do.
 *
 * The word list is `scripts/retired-vocabulary.mjs` and is not restated in SQL:
 * this builds the query from it, so a new rename row is enforced the moment it
 * is written down.
 *
 *   node scripts/check-retired-identifiers.mjs            # uses PG* env vars
 *   node scripts/check-retired-identifiers.mjs --database migration_replay
 *   node scripts/check-retired-identifiers.mjs --self-test  # prove it can fail
 *
 * `--self-test` plants an object named for a retired word inside a transaction,
 * asserts the sweep reports it, and rolls back. It runs first in CI, because a
 * sweep that returns nothing looks identical whether the schema is clean or the
 * query is broken — and this query cannot be executed on a machine without
 * Postgres, so its author may never have watched it work.
 *
 * Exits 0 when the database is clean, 1 on any finding, and 1 — loudly — when
 * a database was NAMED and could not be reached, with the connection error
 * quoted. A guard that passes when blind is not a guard; that sentence is
 * `sync-blueprint-contract.mjs`'s and it was written after a check spent weeks
 * exiting 0 without comparing anything. A run where nobody named a database at
 * all exits 0 through the unverified register instead — what NAMING one means,
 * and why that case is not the blind one, is stated once at `judge` below.
 *
 * ── WORDS THAT KEEP A RETIRED SPELLING ─────────────────────────────
 *
 * This section is `CONTEXT.md`'s, word for word, until #137 moved it here. It
 * lived in the glossary because the glossary was where a person went to ask
 * why a sweep skipped a word; it lives here because this is the file that
 * skips it. `RETIRED_IDENTIFIER_EXEMPTIONS` is a few lines below, so the reason
 * and the code that acts on it are now one edit rather than two.
 *
 * Three words changed and no more, all of them deictic: the section said "the
 * map above" and "the interface→schema map above" of documents that sat on the
 * same page, and here it names them. A reference that points at nothing is the
 * one thing a verbatim move cannot keep.
 *
 * Four, and each is a fact about the language rather than a queue. A rename sweep
 * breaks all four, so they are written where the person running that sweep looks.
 *
 * **`slices.description`.** `21000108` renamed `description` to `summary` on the
 * five tables where it named a one-line précis of a thing. A slice's description
 * is not that — it is prose the author writes *about* the slice. The word was
 * right in one place and wrong in five, so five moved. `tech_description`, a link
 * type, was untouched for the same reason, and is now gone with the column that
 * held it — `21000113000000` moved that prose onto `cell_touchpoints.summary`,
 * where it is the one-line précis the word `summary` names. Because the word is
 * still live on `slices`, the
 * `description` row of the rename map enforces **no** identifier fragment at all;
 * `21000108` carries its own assertion instead.
 *
 * **`evidence.proposition_question_key`, and the label above `cells.value_props`.**
 * `propositions` became `business_model` because that word already meant a *cell's*
 * value proposition. The column is not that table: it records which of the three
 * validation questions an evidence row answers — `understand`, `value`,
 * `usability` — and those three are propositions in the ordinary sense, claims the
 * service is betting on. The rename moved the container, not the concept.
 *
 * Both enforced lists key on the **plural**, so nothing has to be exempted to keep
 * either. The identifier list always did. The copy list held the singular as well
 * until the interface→schema map had to name `cells.value_props`, which
 * abbreviates "value proposition" and nothing else: a guard that flagged that
 * label would have pushed a reader away from the name of the column they were
 * editing. `scripts/tests/retired-copy.test.mjs` asserts the split — the plural
 * still flagged on screen, the singular deliberately not — so the shorter list
 * reads as the decision it is rather than as a word someone quietly dropped.
 *
 * **`CanvasAnnotationLayer`.** A rendering layer, unrelated to the lane the
 * blueprint draws. `21000104` says so in its own header. It is a frontend
 * identifier rather than a database name or anything a reader sees, so no check
 * that reads the interface→schema map can reach it.
 *
 * **"derived layer", inside applied migrations and the changelog.** Two migration
 * filenames (`20260729120000_derived_layer.sql`,
 * `20260730090000_derived_layer_grants_hardening.sql`) and ten `--` comments
 * across five applied files keep the retired words, along with the CHANGELOG
 * entries for the releases that shipped them.
 *
 * The rule is the same in both places: **an applied or dated record keeps the
 * spelling it was written with.** Every instance of this template has already run
 * those files; rewriting them buys tidiness at the cost of making applied
 * migrations mutable, which is a precedent worth more than the tidiness. A
 * changelog entry is the same kind of object — it says what shipped, under the
 * name it shipped with.
 *
 * Everything an agent or a reader is *shown* uses the current name. That is the
 * line: the record keeps its spelling, the instruction does not.
 */
import { execFileSync } from 'node:child_process'
import { RETIRED_IDENTIFIER_FRAGMENTS, replacementFor } from './retired-vocabulary.mjs'
import { whenRun } from './verdict.mjs'

/**
 * Identifiers allowed to keep a retired word, each with a reason and usually an
 * expiry. See `scripts/tests/retired-vocabulary.test.mjs` for the two rules that
 * keep the list honest: a permanent entry must be explained in this file's own
 * header — the "words that keep a retired spelling" section above — and an
 * entry whose subject no longer exists fails until someone deletes it.
 *
 * EMPTY, and that is an outcome to protect rather than an accident. Two rows of
 * the rename map could have needed one and do not:
 *
 *   `description` → `summary` enforces no fragment at all, because
 *   `slices.description` and the `tech_description` link type are live words
 *   rather than residue — recorded in the row itself, where the reasoning sits
 *   next to the decision, instead of here where it would read as a grudging
 *   allowance.
 *
 *   `propositions` → `business_model` keys on the plural, so
 *   `evidence.proposition_question_key` is not a case this check has to be
 *   talked out of. It is a live column and always was.
 *
 * @type {ReadonlyArray<import('./retired-vocabulary.mjs').Exemption>}
 */
export const RETIRED_IDENTIFIER_EXEMPTIONS = []

/** The sweep, built from the enforced word list rather than restating it. */
export function sweepSql(fragments = RETIRED_IDENTIFIER_FRAGMENTS) {
  if (fragments.length === 0) throw new Error('no retired fragments — the map is empty')
  const values = fragments.map((f) => `(${quote(f)})`).join(', ')
  return `
with fragment(word) as (values ${values})
select kind, identifier, word, context from (
  select 'table' as kind, cls.relname as identifier, f.word, '' as context
    from pg_class cls
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and cls.relkind in ('r','v','m','p')
     and strpos(cls.relname, f.word) > 0
  union all
  select 'column', cls.relname || '.' || att.attname, f.word, ''
    from pg_attribute att
    join pg_class cls on cls.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and att.attnum > 0 and not att.attisdropped
     and cls.relkind in ('r','v','m','p')
     and strpos(att.attname, f.word) > 0
  union all
  select 'constraint', con.conname, f.word, ''
    from pg_constraint con
    join pg_namespace nsp on nsp.oid = con.connamespace
    cross join fragment f
   where nsp.nspname = 'public' and strpos(con.conname, f.word) > 0
  union all
  select 'index', idx.relname, f.word, ''
    from pg_class idx
    join pg_namespace nsp on nsp.oid = idx.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and idx.relkind = 'i'
     and strpos(idx.relname, f.word) > 0
  union all
  select 'policy', pol.polname || ' on ' || cls.relname, f.word, ''
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and strpos(pol.polname, f.word) > 0
  union all
  select 'trigger', tg.tgname || ' on ' || cls.relname, f.word, ''
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and not tg.tgisinternal
     and strpos(tg.tgname, f.word) > 0
  union all
  select 'sequence', cls.relname, f.word, ''
    from pg_class cls
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    cross join fragment f
   where nsp.nspname = 'public' and cls.relkind = 'S'
     and strpos(cls.relname, f.word) > 0
  union all
  select 'type', typ.typname, f.word, ''
    from pg_type typ
    join pg_namespace nsp on nsp.oid = typ.typnamespace
    cross join fragment f
   where nsp.nspname = 'public' and typ.typtype in ('e','d','c')
     and strpos(typ.typname, f.word) > 0
  union all
  select 'function', pro.proname, f.word, ''
    from pg_proc pro
    join pg_namespace nsp on nsp.oid = pro.pronamespace
    cross join fragment f
   where nsp.nspname = 'public' and strpos(pro.proname, f.word) > 0
  union all
  -- The one an assertion against information_schema cannot see, and the one
  -- that broke upstream: a body still naming a relation the rename moved.
  select 'function body', pro.proname, f.word,
         regexp_replace(
           substr(pro.prosrc,
                  greatest(1, strpos(pro.prosrc, f.word) - 45),
                  length(f.word) + 90),
           '\\s+', ' ', 'g')
    from pg_proc pro
    join pg_namespace nsp on nsp.oid = pro.pronamespace
    cross join fragment f
   where nsp.nspname = 'public' and pro.prokind = 'f'
     and strpos(coalesce(pro.prosrc, ''), f.word) > 0
  union all
  -- A comment is read by the next person and by an agent reading the schema,
  -- so a stale one is a wrong answer with a citation.
  select case when des.objsubid = 0 then 'comment on table' else 'comment on column' end,
         cls.relname || coalesce('.' || att.attname, ''), f.word,
         regexp_replace(des.description, '\\s+', ' ', 'g')
    from pg_description des
    join pg_class cls on cls.oid = des.objoid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    left join pg_attribute att
           on att.attrelid = des.objoid and att.attnum = des.objsubid
                                        and des.objsubid > 0
    cross join fragment f
   where nsp.nspname = 'public' and strpos(des.description, f.word) > 0
) hit
order by kind, identifier, word;
`
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

/**
 * Parse the `kind<TAB>identifier<TAB>word` rows psql emits under `-At -F \t`.
 *
 * A FOUR-FIELD LINE IS A ROW; everything else is noise. psql echoes a command
 * tag — `BEGIN`, `CREATE TABLE`, `ROLLBACK` — for every statement in a
 * multi-statement script, and a tag carries no tabs. The self-test sends
 * exactly such a script, so the first time this ran against a real database it
 * destructured `undefined` and crashed.
 *
 * Which is the self-test doing its job, one layer further out than intended.
 * It was written on the argument that a sweep returning nothing looks the same
 * whether the schema is clean or the query is broken; the thing it actually
 * caught first was the PARSER, on a machine with no Postgres to catch it on.
 */
export function parseRows(tsv) {
  return tsv
    .split('\n')
    // Carriage returns only. Trimming the whole line eats a TRAILING EMPTY
    // FIELD, which is what psql writes for the context column on every branch
    // that has no prose to quote — so `.trim()` here dropped every finding
    // except the two that carried an excerpt.
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('\t'))
    // Four, always — the context column is selected as '' for the branches
    // that have no prose to quote, so the shape does not vary by branch.
    .filter((fields) => fields.length === 4)
    .map(([kind, identifier, word, context]) => ({ kind, identifier, word, context }))
}

/** Findings, with exemptions applied. */
export function findings(rows, exemptions = RETIRED_IDENTIFIER_EXEMPTIONS) {
  return rows
    .map((row) => ({ ...row, subject: `${row.kind} ${row.identifier}` }))
    .filter((row) => !exemptions.some((entry) => entry.identifier === row.subject))
}

/**
 * Prove the sweep reports something, by planting something for it to report.
 *
 * Wrapped in a transaction that always rolls back, so the database it runs
 * against is unchanged whether the assertion passes or fails.
 */
export function selfTestSql(fragments = RETIRED_IDENTIFIER_FRAGMENTS) {
  const word = fragments[fragments.length - 1] // the shortest, so the name stays readable
  return `begin;
create table public.zz_selftest_${word}_table (id int);
${sweepSql([word])}
rollback;`
}

/** How many relations the sweep's every arm hangs off: the subject's size. */
export function sweptSql() {
  return `select count(*) from pg_class cls
  join pg_namespace nsp on nsp.oid = cls.relnamespace
 where nsp.nspname = 'public' and cls.relkind in ('r','v','m','p')`
}

/**
 * The sentence the finding and the register both say, because it is the same
 * fact either way: this check reads a catalogue, and there was not one.
 * Written once so the two cannot drift into disagreeing about what the check
 * is for.
 */
const NOTHING_WITHOUT_A_CATALOGUE =
  'this check compares the CATALOGUE, not the migration files, and has nothing to say without one.'

/** What the sweep names as its subject, and what `--self-test` names as its. */
const SWEPT = 'a retired word swept across the database catalogue'
const PLANTED = 'a planted object the sweep must report'

function psql(args, input) {
  return execFileSync('psql', ['-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

// A DATABASE THAT WAS NAMED AND COULD NOT BE SWEPT IS RED HERE, NOT SKIPPED.
// Everywhere else in this set "could not look" is a warning, because the skip
// is the correct answer; for a named database it is not. This check exists
// because the migration files and the catalogue disagree, and a run that was
// pointed at a server and never reached it has not compared anything — in CI
// it follows the migration replay with `--database migration_replay`, so the
// only way to reach that branch is a database that should have been there and
// was not. So the reason is said as a finding, in the words it has always
// used.
//
// A DATABASE NOBODY NAMED IS THE OTHER CASE, and it is not that one. There is
// no catalogue that should have been there: a person running the suite on a
// machine with no Postgres asked this check nothing. Red there is a guard
// whose readers learn to ignore it, which is the failure `sweep.mjs` argues at
// length under `unverified` — so it goes through that register instead, in the
// same words, and exits clean.
//
// NAMING ONE IS NOT ONLY `--database`. libpq reads a connection out of the
// environment a piece at a time, and a machine that sets PGHOST — or PGUSER,
// PGPORT, PGSERVICE — has pointed this check at a server whether or not it
// spelled the database, which is how the command with no arguments at the top
// of this file has always worked. So any of them is a name, the sweep is
// attempted, and a failure is the finding it was before. Only a run with none
// of them is the one nobody asked anything.
/**
 * The verdict: a database catalogue swept for the words the schema retired.
 *
 * Pure — it sweeps the catalogue, decides, and hands back what it found and how
 * many rows came back. Nothing here prints or exits.
 */
export function judge(argv = process.argv.slice(2), env = process.env) {
  const selfTest = argv.includes('--self-test')
  // The subject the refusal and the register name. `--self-test` measures
  // something else, and a skip that named the sweep would be describing a run
  // that was never asked for.
  const what = selfTest ? PLANTED : SWEPT

  const dbIndex = argv.indexOf('--database')
  const database = dbIndex === -1 ? env.PGDATABASE : argv[dbIndex + 1]

  // A FLAG WITH NO VALUE IS A USAGE ERROR, not a run with no database.
  // `--database` followed by nothing, or by the next flag, is somebody who
  // meant to name one; answering it with a green skip is the check agreeing
  // that nothing was asked.
  if (dbIndex !== -1 && (database === undefined || database.startsWith('--'))) {
    return { what, findings: ['--database was given no value'] }
  }

  // Every piece of a connection libpq would read, not only the database name.
  const named = Boolean(database) || ['PGHOST', 'PGUSER', 'PGPORT', 'PGSERVICE'].some((key) => env[key])

  if (!named) {
    return {
      what,
      unverified:
        `no database was named — ${NOTHING_WITHOUT_A_CATALOGUE} ` +
        'Set PGHOST/PGUSER/PGDATABASE, or pass --database <name>. In CI this runs ' +
        'after the migration replay in ci.yml, which names one.',
    }
  }

  const target = database ? ['-d', database] : []

  if (selfTest) {
    let out
    try {
      out = psql(target, selfTestSql())
    } catch (error) {
      return {
        what,
        findings: [`self-test could not run: ${String(error.stderr || error.message).trim()}`],
      }
    }
    const planted = parseRows(out).filter((row) => row.identifier.includes('zz_selftest'))
    return {
      what,
      count: planted.length,
      findings:
        planted.length === 0
          ? [
              'SELF-TEST FAILED: a table named for a retired word was planted and the sweep ' +
                'did not report it. The query is broken, and a clean result from it means nothing.',
            ]
          : [],
      line: `ok — self-test: the sweep reported ${planted.length} planted object(s), then rolled back`,
    }
  }

  let tsv
  try {
    tsv = psql([...target, '-c', sweepSql()])
  } catch (error) {
    return {
      what,
      findings: [
        `could not sweep a database — ${NOTHING_WITHOUT_A_CATALOGUE}\n` +
          `  ${String(error.stderr || error.message).trim().split('\n').slice(-3).join('\n  ')}\n` +
          '\nA database was named and did not answer: check PGHOST/PGUSER/PGDATABASE, or the ' +
          '--database <name> you passed. In CI this runs after the migration replay in ci.yml.',
      ],
    }
  }

  // The count is the CATALOGUE OBJECTS the sweep looked at, not the rows it
  // came back with and not the length of the fragment list it went looking
  // with. The rows are only the matches, so a clean catalogue returns none and
  // would read as no subject; the fragment list is a constant, so an empty
  // catalogue — the one case the empty-subject rule exists for — would pass
  // green. Relations in `public` are what every arm of the sweep hangs off.
  let swept
  try {
    swept = Number(psql([...target, '-c', sweptSql()]).trim())
  } catch (error) {
    return {
      what,
      findings: [`could not count the catalogue: ${String(error.stderr || error.message).trim()}`],
    }
  }
  const rows = parseRows(tsv)
  const problems = findings(rows)
  return {
    what: 'a relation in the public schema swept for a retired word',
    count: swept,
    findings: problems.map(
      (problem) =>
        `::error::retired vocabulary in ${problem.subject} — "${problem.word}" was ` +
        `renamed to ${replacementFor(problem.word)}. A rename moves the table and ` +
        'the column; it never moves this.' +
        // Without this a reader is told a function body contains a word and left
        // to find it: `duplicate_path` is 100 lines and prose inside it counts.
        (problem.context ? `\n    … ${problem.context.trim()} …` : ''),
    ),
    closing: problems.length > 0 ? `\n${problems.length} database identifier(s) still carry a retired word.` : undefined,
    line:
      `ok — no retired vocabulary in any database identifier ` +
      `(${RETIRED_IDENTIFIER_FRAGMENTS.length} fragments swept across the catalogue)`,
  }
}

whenRun(import.meta.url, judge)
