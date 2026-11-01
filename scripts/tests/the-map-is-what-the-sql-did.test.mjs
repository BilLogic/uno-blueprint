/**
 * Check G — every rename the map records is a statement the series ran.
 *
 * `scripts/retired-vocabulary.mjs` is what a person or an agent reads to
 * answer "what did this word become?", and until #279 nothing held it against
 * the SQL. Its path-kind row said `unhappy` → `exception`; the migration says
 * `set kind = 'variant' where kind in ('unhappy', 'alternative')`, so both
 * spellings folded onto `variant` and `exception` was never a destination at
 * all. A map that is only a comment drifts, and a drifted map aims a sweep in
 * a direction the database never went. #267 is what that costs.
 *
 * SUBJECT: every pair of every row THAT NAMES A MIGRATION, against the files
 * in `supabase/migrations/` that row names. A row naming no migration —
 * `pill`/`chip`, the design system's own vocabulary — is outside this file
 * entirely, because there is no SQL for it to agree or disagree with; what
 * holds that row is `scripts/tests/badge-and-tag.test.mjs`.
 *
 * ── WHAT A PAIR HAS TO LOOK LIKE ───────────────────────────────────────────
 *
 * The check is not a search for two words in a file. It reads the row's
 * migrations down to their TOP-LEVEL STATEMENTS — comments removed and
 * dollar-quoted bodies removed, so a rewritten function body and a header
 * paragraph are both out — and then asks, for the SHAPE of the pair, whether
 * the statement that would perform it is there:
 *
 *   `t.c = 'a'` → `t.c = 'b'`   an `update public.t` that sets `c = 'b'` and
 *                               names `'a'`. The fold is caught here: a
 *                               destination the update never sets is a lie
 *                               however plausible it reads.
 *   `t.c` → `u.d`               an `alter table … rename column c to d`. The
 *                               TABLE is not matched, because half these
 *                               renames move the column while the table is
 *                               being renamed around it — `slice_items.caption`
 *                               became `slides.title` in two statements.
 *   `a` → `b` (bare, or `*_a`)  a bare name is a table, a function, a column
 *                               or a lane role, so any of the literal forms
 *                               will do: `alter table … rename to`, `alter
 *                               function … rename to`, `rename column … to`, or
 *                               an update that turns one value into the other.
 *
 * ── THE ESCAPE, AND WHY IT HAS TEETH ───────────────────────────────────────
 *
 * Not every rename is a statement. `path.triggers` is a member of an authored
 * JSON file; `cell_touchpoints.url` was COPIED into another table and then
 * dropped; `step_visual` went nowhere. Those pairs carry a `because`, and a
 * `because` is not a way out: this file asserts the statement is genuinely
 * ABSENT. Declaring `because` on a pair whose `update` or `rename` is right
 * there in the migration fails, which is the only thing that stops the excuse
 * becoming the way to silence a real disagreement. A pair whose shape is not
 * one of the three and which carries no `because` fails as well, so no pair
 * escapes by being unreadable.
 *
 * A pair whose `to` is `null` is the fourth shape, and the one case where
 * `because` is a claim rather than an excuse: the name was DROPPED, so the
 * migrations must be seen NOT to move it, and the sentence saying why is
 * required — "nowhere" is the one destination a reader will not take on trust.
 *
 * `kept` is the other direction: a value the fold did NOT move to. It fails if
 * it is on the right of a pair in its own row, or if any of the row's
 * migrations sets the column to it. Both halves go red on the original defect.
 *
 * ── WHY THIS AND NOT SOMETHING CHEAPER ─────────────────────────────────────
 *
 * REPLAYING THE SERIES and reading the catalogue would be the strongest check
 * and is the one this repository already refuses elsewhere: `check:identifiers`
 * needs a local Postgres role and fails on environment, so it cannot be the
 * thing that holds a text file. Statements are what every developer has.
 *
 * A CENSUS — "the map has 23 rows and 46 pairs" — was rejected on the rule
 * this codebase states about assertions: it would break on the next unrelated
 * rename and teach the next person to edit the number. Nothing here counts.
 * Every assertion is per-pair, and a row added tomorrow is checked tomorrow
 * without this file changing.
 *
 * SEARCHING THE WHOLE FILE for both words, rather than one statement, is the
 * shape that would have passed the defect: `21000116000000` names `exception`
 * four times — in its header, in the new CHECK, in a column comment — and
 * never once as something a row was set to. Statement granularity is the
 * difference between a check and a keyword search.
 *
 * ── WHAT IT CANNOT SEE, STATED RATHER THAN HIDDEN ──────────────────────────
 *
 * It reads TEXT, so it proves a statement was WRITTEN, not that it took
 * effect. `21000129000000` exists because a rename that ran can still leave
 * the name behind in a place no reader looks; nothing here would have caught
 * that, and `check:identifiers` against a real catalogue is what does.
 *
 * Statement splitting is on `;` outside dollar quotes. A semicolon inside a
 * single-quoted literal would split a statement in two; none of the 44
 * migrations has one, and the failure mode is a false ALARM rather than a
 * false pass, which is the direction a guard should fail in.
 *
 * It cannot check a pair it has no shape for, which is the whole reason
 * `because` has to be true rather than merely present.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { RENAME_MAP } from '../retired-vocabulary.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const MIGRATIONS = resolve(ROOT, 'supabase/migrations')

/* ------------------------------------------------------------ the statements */

/**
 * A migration's top-level statements, lower-cased and whitespace-collapsed.
 *
 * Line comments go first, then every dollar-quoted body — a `do $$ … $$` block
 * and a rewritten function definition are not statements the series ran against
 * the schema, they are text the series executed, and a name inside one is
 * evidence of nothing about a rename.
 */
export function statementsOf(sql) {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/--.*$/gm, '')
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, ' ')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
}

/** Every migration's statements, keyed by the 14-digit stamp the map names. */
export function migrationStatements(directory = MIGRATIONS) {
  const byStamp = new Map()
  for (const file of readdirSync(directory)) {
    const stamp = /^(\d{14})_/.exec(file)
    if (!stamp || !file.endsWith('.sql')) continue
    byStamp.set(stamp[1], statementsOf(readFileSync(resolve(directory, file), 'utf8')))
  }
  return byStamp
}

/* ----------------------------------------------------------------- the shapes */

const VALUE = /^(\w+)\.(\w+) = '([^']+)'$/
const QUALIFIED = /^(\w+)\.(\w+)$/
const BARE = /^\*?_?(\w+)$/

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Statements that update `public.<table>`, or all of them when table is null. */
const updates = (statements, table) =>
  statements.filter((statement) => {
    const match = /^update public\.(\w+)\b/.exec(statement)
    return match !== null && (table === null || match[1] === table)
  })

const setsTo = (statement, column, value) =>
  new RegExp(`\\b${escape(column)} = '${escape(value)}'`).test(statement)

const renamesColumn = (statements, from, to) =>
  statements.some((statement) =>
    new RegExp(`^alter table (?:only )?public\\.\\w+ rename column ${escape(from)} to ${escape(to)}$`).test(
      statement,
    ),
  )

const renamesTable = (statements, from, to) =>
  statements.some((statement) =>
    new RegExp(`^alter table (?:only )?public\\.${escape(from)} rename to ${escape(to)}$`).test(statement),
  )

// A function is a bare name too: `alter function public.f(…) rename to g`.
const renamesFunction = (statements, from, to) =>
  statements.some((statement) =>
    new RegExp(`^alter function public\\.${escape(from)}\\([^)]*\\) rename to ${escape(to)}$`).test(statement),
  )

const movesValue = (statements, from, to) =>
  updates(statements, null).some(
    (statement) => statement.includes(`= '${to}'`) && statement.includes(`= '${from}'`),
  )

/**
 * Whether the row's migrations perform this pair, or `null` when the pair's
 * shape is not one this file can read a statement for.
 *
 * Null is not a pass. It is the answer that makes `because` mandatory.
 */
export function performs(pair, statements) {
  if (pair.to === null || pair.to === undefined) {
    // A drop. What the migrations must NOT do is move the name anywhere.
    const from = BARE.exec(pair.from)?.[1] ?? pair.from
    const moved =
      updates(statements, null).some((statement) => statement.includes(`'${from}'`)) ||
      statements.some((statement) => new RegExp(`rename (?:column )?${escape(from)} to `).test(statement))
    return !moved
  }
  const fromValue = VALUE.exec(pair.from)
  const toValue = VALUE.exec(pair.to)
  if (fromValue && toValue) {
    if (fromValue[1] !== toValue[1] || fromValue[2] !== toValue[2]) return null
    return updates(statements, fromValue[1]).some(
      (statement) => setsTo(statement, fromValue[2], toValue[3]) && statement.includes(`'${fromValue[3]}'`),
    )
  }
  const fromColumn = QUALIFIED.exec(pair.from)
  const toColumn = QUALIFIED.exec(pair.to)
  if (fromColumn && toColumn) return renamesColumn(statements, fromColumn[2], toColumn[2])
  const fromBare = BARE.exec(pair.from)
  const toBare = BARE.exec(pair.to)
  if (fromBare && toBare && !pair.from.includes('.') && !pair.to.includes('.')) {
    return (
      renamesTable(statements, fromBare[1], toBare[1]) ||
      renamesFunction(statements, fromBare[1], toBare[1]) ||
      renamesColumn(statements, fromBare[1], toBare[1]) ||
      movesValue(statements, fromBare[1], toBare[1])
    )
  }
  return null
}

/* ---------------------------------------------------------------- the findings */

/** Every disagreement between a map and the migrations it names. */
export function mapFindings(map, byStamp) {
  const findings = []
  for (const row of map) {
    if (row.migrations.length === 0) continue
    const missing = row.migrations.filter((stamp) => !byStamp.has(stamp))
    if (missing.length > 0) {
      findings.push(`${row.was[0]}: names ${missing.join(', ')}, which is not a migration in this tree`)
      continue
    }
    const statements = row.migrations.flatMap((stamp) => byStamp.get(stamp))
    const where = row.migrations.join(' / ')
    for (const pair of row.renames) {
      const done = performs(pair, statements)
      if (pair.to === null || pair.to === undefined) {
        // A DROP is a claim, not an excuse: the name went nowhere, and the
        // migrations must not be seen moving it. `because` says why it was
        // dropped and is required, because "nowhere" is the one destination a
        // reader will not believe without a sentence.
        if (!pair.because) {
          findings.push(`${pair.from} → nothing: a dropped name has to say why, and this one does not.`)
        } else if (done === false) {
          findings.push(
            `${pair.from} → nothing: declared dropped, but ${where} moves it somewhere. ` +
              'A name the series renamed is not a name the series dropped.',
          )
        }
        continue
      }
      if (pair.because) {
        if (done === true) {
          findings.push(
            `${pair.from} → ${pair.to}: carries a \`because\`, but ${where} performs it. ` +
              'An excuse has to be true — drop it and let the pair be checked.',
          )
        }
        continue
      }
      if (done === null) {
        findings.push(
          `${pair.from} → ${pair.to}: this file has no statement shape for that pair, and it ` +
            'carries no `because` saying why no single statement performs it.',
        )
        continue
      }
      if (!done) {
        findings.push(
          `${pair.from} → ${pair.to}: ${where} runs no statement that does this. ` +
            'The map says something the series did not do.',
        )
      }
    }
    for (const kept of row.kept) {
      if (row.renames.some((pair) => pair.to === kept)) {
        findings.push(`${kept}: listed as kept and also as somewhere a name landed. It cannot be both.`)
        continue
      }
      const value = VALUE.exec(kept)
      if (!value) continue
      if (updates(statements, value[1]).some((statement) => setsTo(statement, value[2], value[3]))) {
        findings.push(
          `${kept}: listed as a value nothing became, but ${where} sets ${value[1]}.${value[2]} to ` +
            `'${value[3]}'. It was a destination after all.`,
        )
      }
    }
  }
  return findings
}

/* ------------------------------------------------------------------ the tests */

const BY_STAMP = migrationStatements()

test('the statement reader keeps top-level SQL and drops comments and bodies', () => {
  const sql = [
    '-- update public.paths set kind = 1;',
    "alter table public.paths   rename column path_type to kind;",
    'do $x$ begin update public.paths set kind = 2; end $x$;',
  ].join('\n')
  assert.deepEqual(statementsOf(sql), ['alter table public.paths rename column path_type to kind', 'do'])
})

test('every rename the map records is a statement its migrations ran', () => {
  assert.deepEqual(mapFindings(RENAME_MAP, BY_STAMP), [])
})

/**
 * Proved to go red, in the shape the rest of this directory argues for: a check
 * green against this tree could equally be a check that examines nothing. The
 * first row below is the defect verbatim — what the map said before #279.
 */
const row = (renames, extra = {}) => ({
  renames,
  kept: [],
  migrations: ['21000116000000'],
  was: [renames[0].from],
  ...extra,
})

test('the defect this file was written for goes red', () => {
  const findings = mapFindings(
    [
      row([
        { from: "paths.kind = 'unhappy'", to: "paths.kind = 'exception'" },
        { from: "paths.kind = 'alternative'", to: "paths.kind = 'variant'" },
      ]),
    ],
    BY_STAMP,
  )
  assert.equal(findings.length, 1)
  assert.match(findings[0], /unhappy.*exception.*runs no statement that does this/)
})

test('a `because` on a pair the migration performs goes red', () => {
  const findings = mapFindings(
    [row([{ from: 'paths.path_type', to: 'paths.kind', because: 'no reason at all' }])],
    BY_STAMP,
  )
  assert.equal(findings.length, 1)
  assert.match(findings[0], /An excuse has to be true/)
})

test('a pair with no readable shape and no `because` goes red', () => {
  const findings = mapFindings([row([{ from: 'a thing', to: 'another thing' }])], BY_STAMP)
  assert.equal(findings.length, 1)
  assert.match(findings[0], /no statement shape for that pair/)
})

test('a kept value that was a destination goes red, both ways', () => {
  const asDestination = mapFindings(
    [
      row([{ from: "paths.kind = 'unhappy'", to: "paths.kind = 'variant'" }], {
        kept: ["paths.kind = 'variant'"],
      }),
    ],
    BY_STAMP,
  )
  assert.equal(asDestination.length, 1)
  assert.match(asDestination[0], /cannot be both/)

  const asUpdate = mapFindings(
    [
      row([{ from: "scenarios.layout = 'side-by-side'", to: "scenarios.layout = 'stacked'" }], {
        kept: ["paths.kind = 'variant'"],
      }),
    ],
    BY_STAMP,
  )
  assert.equal(asUpdate.length, 1)
  assert.match(asUpdate[0], /It was a destination after all/)
})

test('a name declared dropped that the migration actually moves goes red', () => {
  const findings = mapFindings(
    [
      row([{ from: 'visual', to: null, because: 'it went nowhere' }], {
        migrations: ['21000122000000'],
      }),
    ],
    BY_STAMP,
  )
  assert.equal(findings.length, 1)
  assert.match(findings[0], /declared dropped, but .* moves it somewhere/)
})

test('a name declared dropped with no reason goes red', () => {
  const findings = mapFindings(
    [row([{ from: 'step_visual', to: null }], { migrations: ['21000122000000'] })],
    BY_STAMP,
  )
  assert.equal(findings.length, 1)
  assert.match(findings[0], /a dropped name has to say why/)
})

test('a row naming a migration this tree does not have goes red', () => {
  const findings = mapFindings(
    [row([{ from: 'layers', to: 'lanes' }], { migrations: ['21000199000000'] })],
    BY_STAMP,
  )
  assert.equal(findings.length, 1)
  assert.match(findings[0], /not a migration in this tree/)
})
