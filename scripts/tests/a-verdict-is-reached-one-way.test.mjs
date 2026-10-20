/**
 * EVERY CHECK CONCLUDES THE SAME FOUR WAYS, AND ONE MODULE DECIDES WHICH.
 *
 * `verdict.mjs` is the half of a check that used to be copied: the summary
 * line, the empty-subject rule, and the exit. The copies disagreed — seventeen
 * checks called `process.exit(1)` and seven set `process.exitCode`, which are
 * different promises about the output already queued — and the disagreement
 * was invisible because each copy was read beside its own check rather than
 * beside the others.
 *
 * So the four outcomes are driven here, once, through seams instead of a
 * process: what went to stdout, what went to stderr, what the exit code became,
 * and what landed in the unverified register. A check's own suite is then free
 * to be about its judgement, which is the only part of it that differs.
 *
 * Run: npm test
 */
import { beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'

import { forgetUnverified } from '../sweep.mjs'
import { isTheCommand, verdict } from '../verdict.mjs'

beforeEach(() => forgetUnverified())

/** Recorders standing in for the two consoles, the exit code and the register. */
function sinks() {
  const out = []
  const err = []
  const exits = []
  const warned = []
  return {
    out,
    err,
    exits,
    warned,
    seams: {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      fail: (code) => exits.push(code),
      io: { env: {}, write: (text) => warned.push(text) },
    },
  }
}

test('green — the check says what it measured, in its own words, and nothing fails', () => {
  const s = sinks()
  assert.equal(
    verdict({ what: 'packaged document', count: 58, line: 'every path named by 58 documents resolves' }, s.seams),
    'clean',
  )
  assert.deepEqual(s.out, ['every path named by 58 documents resolves'])
  assert.deepEqual(s.err, [])
  assert.deepEqual(s.exits, [])
  assert.deepEqual(s.warned, [])
})

test('red — the opening, the findings and what to run, on stderr, and the exit is 1', () => {
  const s = sinks()
  assert.equal(
    verdict(
      {
        what: 'packaged document',
        count: 58,
        opening: 'These lines name a path nothing matches:',
        findings: ['  README.md:4  src/styles/tokens.css', '  GLOSSARY.md:9  scripts/gone.mjs'],
        closing: '\n  npm run check:doc-paths\n',
        line: 'a line a failing check must not print',
      },
      s.seams,
    ),
    'findings',
  )
  assert.deepEqual(s.err, [
    'These lines name a path nothing matches:',
    '  README.md:4  src/styles/tokens.css',
    '  GLOSSARY.md:9  scripts/gone.mjs',
    '\n  npm run check:doc-paths\n',
  ])
  // The green line is never printed beside a failure, whatever the check hands over.
  assert.deepEqual(s.out, [])
  assert.deepEqual(s.exits, [1])
})

test('the frame is optional — a check with nothing to say around its findings says nothing', () => {
  const s = sinks()
  verdict({ what: 'pointer', count: 12, findings: ['[pointers] one problem'] }, s.seams)
  assert.deepEqual(s.err, ['[pointers] one problem'])
})

test('an empty subject is red AND said out loud — a clean run over nothing is the defect', () => {
  // The sweep refuses a listing that came back empty; this refuses the same
  // emptiness one level up, where a filter, a renamed folder or a read that
  // skipped every file recreated it. Without this the check prints its green
  // line over a count of zero, every run after.
  const s = sinks()
  assert.equal(verdict({ what: 'packaged document', count: 0, line: 'every path resolves' }, s.seams), 'no subject')
  assert.deepEqual(s.out, [], 'a check that measured nothing must not report a clean run')
  assert.deepEqual(s.exits, [1])
  assert.equal(s.warned.length, 1)
  assert.match(s.warned[0], /^::warning::unverified — packaged document\./)
  assert.match(s.warned[0], /examined none of it/)
})

test('unverified — a check that could not look says so, and does not go red', () => {
  // A correct skip that fails is a guard whose readers learn to ignore it.
  const s = sinks()
  assert.equal(
    verdict(
      {
        what: 'the database catalogue',
        unverified: 'no database is configured; set PGHOST/PGUSER/PGDATABASE, or pass --database.',
      },
      s.seams,
    ),
    'unverified',
  )
  assert.deepEqual(s.out, [])
  assert.deepEqual(s.exits, [], 'a skip is a warning, never an error')
  assert.equal(s.warned.length, 1)
  assert.match(
    s.warned[0],
    /^::warning::unverified — the database catalogue\. no database is configured/,
  )
})

test('an unreached subject outranks a count, so a skip is never read as an empty sweep', () => {
  const s = sinks()
  assert.equal(verdict({ what: 'a seed', count: 0, unverified: 'no sibling checkout ships one' }, s.seams), 'unverified')
  assert.deepEqual(s.exits, [])
})

test('the exit code is set, never taken — the process finishes saying what it found', () => {
  // `process.exit(1)` abandons whatever the runtime has buffered; seventeen
  // checks used it and seven did not, and the long reports are exactly the ones
  // that could lose their last lines. The default sink is the one that waits.
  const before = process.exitCode
  try {
    verdict({ what: 'a thing', count: 1, findings: ['a finding'] }, { out: () => {}, err: () => {} })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = before
  }
})

test('the is-main guard compares paths, so a directory with a space in it still runs', () => {
  // The thirteen "same shape as" comments all said this and no two said it in
  // the same words. It is one function now, and this is where it is proven.
  const argv = process.argv[1]
  try {
    process.argv[1] = '/a directory/with spaces/check-something.mjs'
    assert.equal(isTheCommand(new URL('file:///a%20directory/with%20spaces/check-something.mjs')), true)
    assert.equal(isTheCommand(new URL('file:///a%20directory/with%20spaces/other.mjs')), false)
  } finally {
    process.argv[1] = argv
  }
})

test('nothing imported is the command', () => {
  assert.equal(isTheCommand(import.meta.url), false)
})

test('a check that could not look may still have a sentence of its own, said after the register', () => {
  // The release-tag check knows which version went untagged and the register
  // does not, so it hands over both. The order is the register first, because
  // the annotation is what a runner surfaces against the step.
  const s = sinks()
  verdict(
    {
      what: 'every release tag',
      unverified: 'this checkout can see no `v*` tag.',
      line: 'no release tags yet; 1.0.0 is untagged',
    },
    s.seams,
  )
  assert.deepEqual(s.out, ['no release tags yet; 1.0.0 is untagged'])
  assert.equal(s.warned.length, 1)
  assert.deepEqual(s.exits, [])
})

test('a green line with no count is refused — forgetting is how the defect comes back', () => {
  // `count` is optional because a usage error and a `--write` mode have nothing
  // to count and nothing to say. A judgement that DOES say something and
  // measured nothing it can name is the exact state this module exists to
  // refuse, arriving through a field somebody left off.
  const s = sinks()
  assert.throws(
    () => verdict({ what: 'a document', line: 'every path resolves' }, s.seams),
    /summary line and no count/,
  )
  assert.deepEqual(s.out, [])
})

test('a judgement with nothing to say passes through silently', () => {
  // What a usage error and a `--write` mode hand over: the check has already
  // printed and set its own code, and the module has no verdict to add.
  const s = sinks()
  assert.equal(verdict({}, s.seams), 'clean')
  assert.deepEqual(s.out, [])
  assert.deepEqual(s.err, [])
  assert.deepEqual(s.exits, [])
})
