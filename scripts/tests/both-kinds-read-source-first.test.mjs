#!/usr/bin/env node
/**
 * Which end of an `enables` edge is the precondition — asserted, not assumed.
 *
 * `enables` replaced `depends_on` for exactly one reason, and the migration
 * that made the change said so: the problem was never the word, it was
 * DIRECTION.
 *
 *     A sets_off   B  →  A comes first, A causes B
 *     A depends_on B  →  B comes first, B is required by A
 *
 * Two kinds pointing opposite ways means an edge's direction cannot be read
 * without first checking its kind. `enables` puts both kinds source-first:
 * "Account has been verified" enables "Greets the customer by name".
 * GLOSSARY.md says the same ("both read source-first"), and the panel groups
 * are symmetric because of it.
 *
 * The agent surface has said the opposite before. `create_cell_dependency`
 * described `enables` as "the target must already be true for the source to
 * work", and the canvas adapter repeated it — so an agent following either
 * wrote every precondition edge backwards, into a column whose CHECK
 * constraint is happy to store it that way. Nothing failed; the graph was just
 * wrong, and the what-if trace that walks it inherited the error.
 *
 * A prose contradiction between files is not something a type can catch, so
 * this is the mechanism. It is deliberately about DIRECTION rather than
 * wording: any of these may be rewritten, and none may say that the target
 * comes first.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sweep } from '../sweep.mjs'

const REPO_ROOT = process.cwd()

/** The application, wherever this tree keeps it. */
const app = sweep({ subject: 'app', root: REPO_ROOT })

/**
 * A teaching surface, read wherever this tree keeps it.
 *
 * Two of the three are files of THIS tree, which every deployment holds
 * byte-identical beside this test. The third is the APPLICATION's, and a
 * deployment keeps no `src`: it reads the application out of
 * `node_modules/uno-blueprint`. The `app` sweep knows the
 * difference, and a file it cannot find is asserted away rather than read as an
 * empty one — which matters here more than it looks, because the rule below is
 * "no surface says the wrong thing", and a surface nobody can read says nothing
 * at all.
 *
 * The path is spelled `src/…` on both sides of that, so a failure names the
 * file the way a reader would go looking for it.
 */
const read = (path) => {
  if (!path.startsWith('src/')) return readFileSync(resolve(REPO_ROOT, path), 'utf8')
  const text = app.read(path)
  assert.ok(text !== null, `no ${path} under ${app.base}: this test has no subject`)
  return text
}

/**
 * Every place that TEACHES the kinds, as opposed to storing them. The canvas
 * adapter is read at its source under `references/`; the copy the app bundles
 * is generated from it.
 */
const TEACHING_SURFACES = [
  'GLOSSARY.md',
  'references/canvas-adapter.md',
  'src/lib/agent/tools/definitions/cells.ts',
]

/**
 * Sentences that put the TARGET first — the inversion, in the shapes it has
 * actually taken. Each is a claim that the far end of the edge is the
 * prerequisite, which is `depends_on` semantics wearing the word `enables`.
 */
const TARGET_FIRST = [
  /the target must already be true/i,
  // The read tool's spelling of the same inversion: "the other" is the target
  // when the sentence is about "this cell" (#755).
  /the other must already be true/i,
  /target\s+must\s+exist\s+(?:first|before)/i,
  /enables[^.]{0,40}\btarget\s+enables\s+(?:the\s+)?source/i,
]

/**
 * How a surface says which end comes first: in so many words, or by handing
 * the kinds' semantics to the tool descriptions. The adapter takes the second
 * route, and that is a statement of where the answer lives rather than
 * silence about it — the tool descriptions are the cell tools' definitions,
 * which are on the list above and have to say it in so many words.
 */
const STATES_DIRECTION =
  /source-first|`leads_to`-vs-`enables` semantics[\s\S]{0,120}live in the\s+tool descriptions/i

/** The retired pair for the same distinction. */
const RETIRED_DISTINCTION = /\b(?:temporal|functional)\b/i

/** Lines of `source` matching `pattern`, as `file:line — text`. */
export function offendingLines(path, source, pattern) {
  return source
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => pattern.test(text))
    .map(({ text, line }) => `${path}:${line} — ${text.trim().slice(0, 100)}`)
}

test('no surface that teaches the kinds puts the target first', () => {
  const offenders = TEACHING_SURFACES.flatMap((path) => {
    const source = read(path)
    return TARGET_FIRST.flatMap((pattern) =>
      offendingLines(path, source, pattern),
    )
  })

  assert.deepEqual(
    offenders,
    [],
    'An `enables` edge runs source → target: the SOURCE is the precondition. ' +
      'A surface saying otherwise teaches an agent to record the graph ' +
      `backwards:\n${offenders.join('\n')}`,
  )
})

test('every surface says which end comes first, or names where it is said', () => {
  // Not merely the absence of the wrong sentence: a file that says nothing
  // about direction passes the rule above while leaving a reader to guess,
  // and guessing is what produced the inversion.
  for (const path of TEACHING_SURFACES) {
    assert.match(
      read(path),
      STATES_DIRECTION,
      `${path} teaches the two kinds without saying which end comes first`,
    )
  }
  // The deferral only counts while the place it defers to says it outright.
  assert.match(read('src/lib/agent/tools/definitions/cells.ts'), /source-first/i)
})

test('the retired distinction stays retired', () => {
  // The words temporal and functional were retired from every doc: they named
  // the distinction without making it usable.
  const offenders = TEACHING_SURFACES.flatMap((path) =>
    offendingLines(path, read(path), RETIRED_DISTINCTION),
  )
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('the matcher catches the sentence that shipped, and clears the fix', () => {
  // The exact wording that was live in both files, and its replacement.
  const shipped =
    '"enables" = the target must already be true for the source to work'
  const fixed =
    '"enables" = the source makes the target possible without causing it'

  assert.equal(offendingLines('x', shipped, TARGET_FIRST[0]).length, 1)
  assert.equal(offendingLines('x', fixed, TARGET_FIRST[0]).length, 0)
  const listShipped =
    '`leads_to` means this cell makes the other one happen; `enables` means the other must already be true'
  assert.equal(offendingLines('x', listShipped, TARGET_FIRST[1]).length, 1)

  // And it is not a sweep for the word "target": the correct sentence uses it.
  assert.equal(
    offendingLines('x', 'the source makes the target possible', TARGET_FIRST[0])
      .length,
    0,
  )
})

test('a surface that neither says it nor defers is caught', () => {
  // Non-vacuity for the rule that accepts two shapes: an adapter that only
  // lists the kinds, with no direction and no pointer, must not pass.
  assert.doesNotMatch('Kinds: `leads_to` and `enables`.', STATES_DIRECTION)
  assert.match(
    'rules (`leads_to`-vs-`enables` semantics, step names) live in the\ntool descriptions',
    STATES_DIRECTION,
  )
})
