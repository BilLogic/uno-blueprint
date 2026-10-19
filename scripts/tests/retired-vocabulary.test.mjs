/**
 * The rename map's word lists come from the names the map records, and every
 * exemption still says why.
 *
 * There used to be a fourth test here, holding `GLOSSARY.md`'s prose table
 * against `scripts/retired-vocabulary.mjs`. Two lists were the point: a prose
 * table should not be load-bearing for a build, and a documented map that had
 * drifted from the enforced one was a lie in the file people read to learn the
 * vocabulary. #137 removed the prose half — the glossary defines terms and
 * stops — so the pair is a single list and the parity test has nothing left to
 * compare. What that test was protecting is now protected by there being one
 * map.
 *
 * The two rules that used to read the glossary read a HEADER instead, and both
 * read the header of the file that acts on them: a row enforcing nothing is
 * explained where the row is, and a permanent exemption is explained where the
 * check skips the word. Exemption and reason are one edit rather than two.
 *
 * The exemption rules live here because they are the same argument. An
 * exemption that cannot expire is how upstream's `Layer` breadcrumb survived
 * six months as a "temporary" sequencing note, and a permanent one that
 * explains itself nowhere is the same thing wearing a reason.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RENAME_MAP, RETIRED_COPY_WORDS, RETIRED_IDENTIFIER_FRAGMENTS } from '../retired-vocabulary.mjs'
import { RETIRED_IDENTIFIER_EXEMPTIONS } from '../check-retired-identifiers.mjs'
import { DATABASE_NAME_EXEMPTIONS } from '../check-database-names.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const MAP = resolve(ROOT, 'scripts/retired-vocabulary.mjs')
const SWEEP = resolve(ROOT, 'scripts/check-retired-identifiers.mjs')

/* ------------------------------------------------------------- the headers */

/**
 * The leading `/** … *\/` of a script — the header a reader lands in.
 *
 * Read rather than imported, because the subject IS the prose: a rule about
 * what a header says cannot be satisfied by an exported constant.
 */
export function headerComment(source) {
  const start = source.indexOf('/**')
  assert.ok(start >= 0 && start < 40, 'no header comment to read')
  const end = source.indexOf('*' + '/', start)
  assert.ok(end > 0, 'no header comment to read')
  return source.slice(start, end)
}

test('the header reader takes the first block and stops', () => {
  assert.equal(headerComment('/**\n * One.\n */\nconst x = 1\n/** Two. */').includes('One'), true)
  assert.equal(headerComment('/**\n * One.\n */\nconst x = 1\n/** Two. */').includes('Two'), false)
  assert.throws(() => headerComment('const x = 1\n'), /no header comment to read/)
})

test('every enforced fragment comes from the row it sits in', () => {
  for (const row of RENAME_MAP) {
    for (const fragment of row.retired) {
      assert.ok(
        row.was.some((was) => was.toLowerCase().includes(fragment.toLowerCase())),
        `"${fragment}" is enforced on the ${row.was.join('/')} row but is not part of ` +
          'any name that row says was retired — the enforced word has wandered.',
      )
    }
  }
})

test('every copy spelling comes from an identifier the same row retired', () => {
  for (const row of RENAME_MAP) {
    for (const word of row.copy) {
      const collapsed = word.replace(/\s+/g, '')
      assert.ok(
        row.was.some((was) => was.toLowerCase().replace(/[_.*]/g, '').includes(collapsed.replace(/s$/, ''))),
        `the copy spelling "${word}" does not correspond to anything the ` +
          `${row.was.join('/')} row retired.`,
      )
    }
  }
})

/**
 * A row may enforce nothing — but only out loud.
 *
 * `description` is the case: it was renamed on five tables and is still the
 * right word on a sixth, so no identifier fragment can be keyed on it without
 * an exemption list longer than the rule. That is a real judgement, and it has
 * to be written where a reader meets the thing it is about.
 *
 * FOUR PLACES, NOT ONE, and the census is the point rather than a loophole.
 * Each explanation sits beside what it is about: a NAME the checks skip is
 * explained in the map's own header (`description`, `business_model`,
 * `cell_dependencies.label`); a spelling the SWEEP skips is explained in the
 * sweep's header; a retired dependency KIND in the header of the check that
 * holds the kinds; and every other retired VALUE — a `was` of the form
 * `table.column = 'value'`, or a column folded into `resources` — in the
 * header of `scripts/value-set-claims.mjs`, which is what holds them, since
 * a value has no identifier fragment to sweep. What the rule forbids is a row
 * explained in NONE of the four, which is how a deliberate silence becomes an
 * oversight somebody closes.
 */
const EXPLANATIONS = [
  ['scripts/retired-vocabulary.mjs', () => headerComment(readFileSync(MAP, 'utf8'))],
  ['scripts/check-retired-identifiers.mjs', () => headerComment(readFileSync(SWEEP, 'utf8'))],
  ['scripts/check-dependency-kinds.mjs', () => headerComment(readFileSync(resolve(ROOT, 'scripts/check-dependency-kinds.mjs'), 'utf8'))],
  ['scripts/value-set-claims.mjs', () => headerComment(readFileSync(resolve(ROOT, 'scripts/value-set-claims.mjs'), 'utf8'))],
]

test('a row that enforces nothing is explained where its subject lives', () => {
  const prose = EXPLANATIONS.map(([name, read]) => [name, read()])
  for (const row of RENAME_MAP) {
    if (row.retired.length > 0 || row.copy.length > 0) continue
    const word = row.was[0]
    assert.ok(
      prose.some(([, text]) => text.includes(word)),
      `the ${word} row enforces nothing and none of ${prose.map(([name]) => name).join(', ')} ` +
        'says why. A word the checks deliberately ignore has to be documented as a live ' +
        'word, or the next person reads the gap as an oversight and closes it.',
    )
  }
})

test('the explanation rule goes red on a row nobody accounted for', () => {
  const unexplained = { was: ['a_table.a_column'], is: ['b'], migrations: [], retired: [], copy: [] }
  const prose = EXPLANATIONS.map(([, read]) => read())
  assert.equal(
    prose.some((text) => text.includes(unexplained.was[0])),
    false,
  )
})

/* ---------------------------------------------------------------- exemptions */

const ALL_EXEMPTIONS = [
  ...RETIRED_IDENTIFIER_EXEMPTIONS.map((entry) => ({ ...entry, list: 'identifier' })),
  ...DATABASE_NAME_EXEMPTIONS.map((entry) => ({ ...entry, list: 'database name' })),
]

test('every exemption states a reason, and an expiry or nothing', () => {
  for (const entry of ALL_EXEMPTIONS) {
    assert.ok(
      entry.because && entry.because.length > 20,
      `${entry.identifier} (${entry.list}) needs a reason a stranger can evaluate`,
    )
    if (entry.until !== undefined) {
      assert.match(
        entry.until,
        /^#\d+$/,
        `${entry.identifier} expires on "${entry.until}" — an expiry is an issue number`,
      )
    }
  }
})

/**
 * A permanent exemption is a claim that the word means something here, and a
 * check that deliberately skips a word has to say so where it skips it.
 * Without this, "permanent" quietly means "nobody got round to it".
 *
 * The subject was `GLOSSARY.md` until #137. The glossary was where the reason
 * lived and the check was where it applied, so an exemption and its reason were
 * two files and two edits; the glossary is now a glossary and the reasoning —
 * the whole "words that keep a retired spelling" section — moved into the
 * sweep's own header, which is what this reads.
 */
test("every permanent exemption rests on a word the sweep's header defines", () => {
  const prose = headerComment(readFileSync(SWEEP, 'utf8')).toLowerCase()
  const undefined_ = ALL_EXEMPTIONS.filter((entry) => !entry.until).filter(
    (entry) =>
      !RETIRED_IDENTIFIER_FRAGMENTS.concat(RETIRED_COPY_WORDS).every((word) =>
        entry.identifier.toLowerCase().includes(word) ? prose.includes(word) : true,
      ),
  )
  assert.deepEqual(
    undefined_.map((entry) => entry.identifier),
    [],
    'A permanent exemption rests on a word the header of ' +
      'scripts/check-retired-identifiers.mjs never explains. Say in that header what ' +
      'the word means here and why it survives, or give the exemption an `until`.',
  )
})

/**
 * Zero is the number to protect.
 *
 * Both lists are empty, and that was designed rather than lucky — the two words
 * that could have needed an entry are handled in the map instead: `description`
 * enforces nothing, and `propositions` keys on the plural so
 * `evidence.proposition_question_key` was never a case to argue about. Both
 * arguments are in the sweep's header, in the section that moved there from the
 * glossary in #137. If a
 * future rename adds an entry here, this test is where someone has to say so on
 * purpose, and the three tests above start applying to it.
 */
test('the exemption lists are empty, and adding to one is a deliberate act', () => {
  assert.deepEqual(
    ALL_EXEMPTIONS.map((entry) => `${entry.list}: ${entry.identifier}`),
    [],
    'An exemption was added. That may well be right — but update this test with ' +
      'the reason, so the next reader sees a decision rather than a list that grew.',
  )
})
