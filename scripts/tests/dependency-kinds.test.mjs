#!/usr/bin/env node
/**
 * The documented dependency vocabulary, and the parsing that keeps it honest.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import {
  allowedBare,
  bareMentions,
  compare,
  differences,
  documentedKinds,
  enforcedKinds,
  retiredMentions,
} from '../check-dependency-kinds.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

test('this tree documents the kind vocabulary its constraint enforces', () => {
  const { read, ...found } = compare(ROOT)
  assert.deepEqual(found, {
    undocumented: [],
    unknown: [],
    retired: [],
    bare: [],
  })
  // How wide the two sweeps were, which is what the check hands the verdict as
  // its count. Asserted here because a comparison that found nothing wrong over
  // nothing at all reads exactly like this one.
  assert.ok(read > 0, 'the two sweeps read no file, so nothing was compared')
})

test('the enforced values come out of the CHECK constraint', () => {
  const sql = "  constraint cell_triggers_kind_check check (kind in ('trigger','needs')),"
  assert.deepEqual(enforcedKinds(sql), ['trigger', 'needs'])
})

test('the constraint is matched under the table name it was renamed to', () => {
  const sql = "constraint cell_dependencies_kind_check check (kind in ('trigger', 'needs'))"
  assert.deepEqual(enforcedKinds(sql), ['trigger', 'needs'])
})

test('a redefined constraint reads as its LAST definition, across lines', () => {
  // Both halves of this were silent failures in 21000114000000.
  //
  // The rule used to be "exactly one definition, or throw", on the reasoning
  // that a redefinition should fail loudly rather than be read stale. But
  // dropping and re-adding the constraint is how an enum changes, so the rule
  // made the ordinary case an error. The file is generated in migration
  // order, so the last definition is the one a fresh database ends up with.
  const twice = [
    "constraint cell_triggers_kind_check check (kind in ('trigger','needs'))",
    "  add constraint cell_dependencies_kind_check",
    "  check (kind in ('leads_to', 'enables'));",
  ].join('\n')
  // ...and it is written across three lines, which the one-line pattern did
  // not match at all — so the sweep read the ORIGINAL constraint and reported
  // agreement with a column that had changed underneath it.
  assert.deepEqual(enforcedKinds(twice), ['leads_to', 'enables'])
  assert.throws(() => enforcedKinds('-- no constraint here\n'))
})

test('the documented values stop at the end of the enum sentence', () => {
  const row =
    '- `cell_dependencies.kind`: `leads_to` \\| `enables`. `leads_to` draws and' +
    ' `enables` does not, and neither is `trigger`.'
  assert.deepEqual(documentedKinds(row), ['leads_to', 'enables'])
})

test('a missing enum row fails loudly rather than comparing an empty list', () => {
  assert.throws(() => documentedKinds('## Enums\n\n- `paths.kind`: `happy`.\n'))
})

// The defect this check was written for: the doc taught two values the
// column has never accepted.
test('a value the constraint refuses is named, in either direction', () => {
  assert.deepEqual(differences(['leads_to', 'enables'], ['trigger', 'needs']), {
    undocumented: ['trigger', 'needs'],
    unknown: ['leads_to', 'enables'],
  })
})

test('the retired words are caught in prose, with file and line', () => {
  const files = ['skills/whatif/references/whatif-playbook.md']
  const read = () => 'a line\nthe tracer walks `trigger` edges\ndeep `needs` chains\n'
  assert.deepEqual(retiredMentions(files, read), [
    { file: files[0], line: 2, found: '`trigger`', instead: '`leads_to`' },
    { file: files[0], line: 3, found: '`needs`', instead: '`enables`' },
  ])
})

test('the English verb "needs" is left alone outside a code span', () => {
  assert.deepEqual(retiredMentions(['x.md'], () => 'a slice needs a cell\n'), [])
})

test('the database trigger these documents discuss is not a retired kind', () => {
  // `references/data-model.md` has a section on the integrity trigger
  // `cells_validate_path_match`. A bare word sweep read every line of it as a
  // dependency kind, which is why the subject is the code span and not the
  // word — narrowing the subject rather than dropping `trigger` from the list.
  const prose = 'The DB trigger cells_validate_path_match enforces, on insert:\n'
  assert.deepEqual(retiredMentions(['references/data-model.md'], () => prose), [])
})

// The defect #157 was filed for. `references/canvas-adapter.md` said
// "trigger-vs-needs semantics" and `evals/behavioral/evals.json` said "Walks
// trigger/needs edges" for a release after 21000114000000, and the code-span
// assertion above could not see either — neither wears backticks.
test('a retired kind spelled as a bare word is a finding', () => {
  const eval_set = 'evals/behavioral/evals.json'
  const read = () => '"Walks trigger/needs edges downstream (visited set)",\n'
  assert.deepEqual(bareMentions([eval_set], read), [
    {
      file: eval_set,
      line: 1,
      found: 'trigger/needs',
      instead: '`leads_to`/`enables`',
    },
  ])
})

test('the same line spelled in the live kinds passes', () => {
  const read = () => '"Walks leads_to/enables edges downstream (visited set)",\n'
  assert.deepEqual(bareMentions(['evals/behavioral/evals.json'], read), [])
})

test('the bare sweep reads the phrases, in and out of backticks', () => {
  // Half the escapees quoted one word of the phrase and not the other, which
  // is why the backticks in these patterns are optional rather than absent.
  const lines = [
    'Per-tool write rules (content required, trigger-vs-needs semantics,',
    'and so is a `needs` edge either way — the canvas draws no arrow',
    'the tracer walks trigger edges downstream',
  ].join('\n')
  assert.deepEqual(
    bareMentions(['references/canvas-adapter.md'], () => lines).map((hit) => hit.found),
    ['trigger-vs-needs', 'needs edge', 'trigger edge'],
  )
})

test('a line matching two patterns is one finding, not two', () => {
  // "trigger/needs edges" is both `trigger/needs` and `needs edge`. It is one
  // mistake, and reporting it twice makes a two-line failure read as four
  // documents.
  const hits = bareMentions(['x.md'], () => 'Walks trigger/needs edges\n')
  assert.equal(hits.length, 1)
})

test('the database trigger is out of reach of the phrases, not exempted', () => {
  // `references/data-model.md` has a whole section on the integrity trigger
  // `cells_validate_path_match`. No allowlist entry covers it — the patterns
  // simply cannot reach a sentence about it, which is the whole reason they
  // are phrases and not words.
  const prose = [
    'The DB trigger `cells_validate_path_match` enforces, on every cell insert:',
    'a slice needs a cell that does not exist',
    'Re-generations do not re-trigger the gate unless',
  ].join('\n')
  assert.deepEqual(bareMentions(['references/data-model.md'], () => prose), [])
  assert.equal(allowedBare('references/data-model.md', prose), false)
})

test('a sentence about the retirement may spell the retired pair', () => {
  // GLOSSARY.md's glossary note and ir-schema.json's `kind` description both
  // say which pair 21000114000000 withdrew. A check that flagged them would
  // be asking the vocabulary not to explain itself.
  const note = 'the retired `needs` edge pointed the other way, so 21000114 turned it'
  assert.equal(allowedBare('references/ir-schema.json', note), true)
  assert.deepEqual(bareMentions(['references/ir-schema.json'], () => `${note}\n`), [])
})

test("a user's own words in a skill-firing eval are not doctrine", () => {
  // `evals/trigger/` holds the query a USER types, verbatim, decoys included.
  // Holding those phrasings to the schema vocabulary would make the decoys
  // less realistic, which is the one thing that set is for.
  const query = '{"query": "walk the trigger/needs edges", "should_trigger": false},'
  assert.equal(allowedBare('evals/trigger/map.json', query), true)
  assert.equal(allowedBare('evals/behavioral/evals.json', query), false)
})
