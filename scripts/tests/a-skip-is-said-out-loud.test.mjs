/**
 * A CORRECT SKIP IS STILL A SUBJECT NOBODY MEASURED, AND IT SAYS SO.
 *
 * Several guards here end by not looking: no database is configured, the
 * folder they sweep is not in this tree, the checkout was handed no tags. Each
 * of those skips is right, and each of them used to leave a log line among the
 * other log lines and a green exit — the same two things a run that measured
 * everything leaves. `unverified` is the one register that separates them, and
 * this drives it rather than describing it.
 *
 * The sinks are seams, so the annotation and the summary line are asserted as
 * text instead of being inferred from a runner nothing here can start.
 *
 * Run: npm test
 */
import { beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { forgetUnverified, sweep, unverified } from '../sweep.mjs'
import { repoConfig } from '../repo-config.mjs'

/**
 * The root documents these throwaway trees hold, in the order the walk
 * returns them.
 *
 * Named here rather than imported, because the module DISCOVERS the root
 * documents now: importing its answer would make each assertion below a
 * restatement of the walk rather than a claim about it.
 */
const ROOT_FILES = ['AGENTS.md', 'GLOSSARY.md', 'README.md']

beforeEach(() => forgetUnverified())

/** A recorder standing in for the two sinks. */
function sinks(env = {}) {
  const written = []
  const appended = []
  return {
    written,
    appended,
    io: {
      env,
      write: (text) => written.push(text),
      append: (path, text) => appended.push([path, text]),
    },
  }
}

test('a skip is an annotation naming the subject and what would reach it', () => {
  const s = sinks()
  assert.equal(unverified('the agent account', 'no database is configured; set X and Y', s.io), true)
  assert.deepEqual(s.written, [
    '::warning::unverified — the agent account. no database is configured; set X and Y\n',
  ])
  // No summary to write to is the ordinary case: a person at a terminal.
  assert.deepEqual(s.appended, [])
})

test('inside a run it also lands in the summary, under one heading', () => {
  const s = sinks({ GITHUB_STEP_SUMMARY: '/run/summary.md' })
  unverified('the agent account', 'no database', s.io)
  unverified('every release tag', 'no tag is visible', s.io)
  assert.deepEqual(s.appended, [
    ['/run/summary.md', '### Unverified\n\n- **the agent account** — no database\n'],
    ['/run/summary.md', '- **every release tag** — no tag is visible\n'],
  ])
})

test('one fact is stated once, however many callers reach it', () => {
  const s = sinks()
  assert.equal(unverified('the prose under skills/', 'that folder is not here', s.io), true)
  assert.equal(unverified('the prose under skills/', 'that folder is not here', s.io), false)
  assert.equal(s.written.length, 1)
})

test('it is a warning and never an error — a correct skip must not go red', () => {
  const s = sinks()
  unverified('a subject', 'a reason', s.io)
  assert.doesNotMatch(s.written[0], /::error::/)
})

/* ------------------------------------------------- the sweep that collapses */

/** A throwaway tree holding exactly the files named. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'unswept-'))
  for (const rel of files) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), '# doc\n')
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) }
}

/** The docs of one tree, with the sinks the case reads. */
const sweptDocs = (root, io) => sweep({ subject: 'docs', root, io }).files

/** The folders the running repository names as swept, in its own order. */
const SWEPT = repoConfig.sweptDirs

/** One file inside each swept folder, so a tree can have all of them. */
const inEachSweptFolder = SWEPT.map((dir) => `${dir}/a-document.md`)

test('a swept folder this tree does not have is named', () => {
  // The announcement is the only place the missing folders are said, so it is
  // where they are asserted: a tree with the first swept folder and none of
  // the rest names exactly the rest.
  const t = tree([...ROOT_FILES, `${SWEPT[0]}/a-document.md`])
  const s = sinks()
  try {
    sweptDocs(t.root, s.io)
    assert.equal(s.written.length, 1)
    assert.match(
      s.written[0],
      new RegExp(`^::warning::unverified — the prose under ${SWEPT.slice(1).join(', ')}\\.`),
    )
  } finally {
    t.done()
  }
})

test('every folder misspelt collapses the corpus to the root docs, loudly', () => {
  // The whole reason this is a warning rather than a count: the root
  // documents are prepended whatever the folders do, so the result is never
  // empty and a refusal on emptiness would never fire. A tree whose swept
  // folders are all misspelt — here, on disk, which is the same fact from the
  // sweep's side as a misspelling in the config — takes the corpus down to the
  // root alone, and every prose guard goes on passing.
  const t = tree([...ROOT_FILES, 'doc/guide.md', 'skils/map/SKILL.md'])
  const s = sinks()
  try {
    assert.deepEqual(sweptDocs(t.root, s.io), ROOT_FILES)
    assert.equal(s.written.length, 1)
    assert.match(
      s.written[0],
      new RegExp(`^::warning::unverified — the prose under ${SWEPT.join(', ')}\\.`),
    )
  } finally {
    t.done()
  }
})

test('a tree that has every swept folder says nothing', () => {
  const t = tree([...ROOT_FILES, ...inEachSweptFolder])
  const s = sinks()
  try {
    assert.deepEqual(sweptDocs(t.root, s.io), [...ROOT_FILES, ...[...inEachSweptFolder].sort()])
    assert.deepEqual(s.written, [])
  } finally {
    t.done()
  }
})

test('this repository sweeps every folder its own config names', () => {
  const ROOT = new URL('../..', import.meta.url).pathname
  const s = sinks()
  assert.ok(sweptDocs(ROOT, s.io).length > 20)
  assert.deepEqual(s.written, [], 'a folder this repository names as swept is not in the tree')
})
