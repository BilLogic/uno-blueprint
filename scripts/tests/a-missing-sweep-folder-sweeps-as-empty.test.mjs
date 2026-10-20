/**
 * A folder the sweep is told to read, and the repository does not have, sweeps
 * as empty.
 *
 * The swept folders are each repository's own (`scripts/repo-config.mjs`), and
 * a repository without a plugin surface has `docs/` and no `references/`,
 * `skills/` or `agents/`. A sweep that threw on the first missing folder would
 * take down every guard that reads prose, over a fact about the tree rather
 * than a defect in it.
 *
 * Every tree here is built in a temporary directory and holds only the files
 * named, so each case is about the RULE rather than about this repository —
 * which is what lets the same cases hold in every repository that carries the
 * `docs` subject, whatever its own folder list says.
 */
import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { forgetUnverified, sweep } from '../sweep.mjs'

/** A throwaway tree holding exactly the files named. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'swept-'))
  for (const rel of files) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), '# doc\n')
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) }
}

/**
 * The root documents these throwaway trees hold, in the order the walk
 * returns them.
 *
 * Named here rather than imported, because the sweep DISCOVERS the root
 * documents: importing its answer would make each assertion below a
 * restatement of the walk rather than a claim about it.
 */
const ROOT_FILES = ['AGENTS.md', 'GLOSSARY.md', 'README.md']

/**
 * A sink that keeps the announcement out of this run's annotations.
 *
 * Each tree below is deliberately missing folders, so each sweep of one has
 * something true to announce — and an annotation raised by a fixture is an
 * annotation a reader has to learn to ignore. `a-skip-is-said-out-loud.test.mjs`
 * is where the announcement itself is asserted.
 */
const QUIET = { env: {}, write: () => {}, append: () => {} }

/** The docs of one throwaway tree, quietly. */
const sweptDocs = (root) => sweep({ subject: 'docs', root, io: QUIET }).files

// Each fixture is missing folders on purpose, and the announcement is said
// once per process: forgetting between cases is what keeps every case its own.
afterEach(() => forgetUnverified())

test('a tree with docs/ and no plugin surface sweeps its docs and nothing else', () => {
  const t = tree([...ROOT_FILES, 'docs/guide.md', 'docs/engineering/checks.md', 'docs/adr/0001-a.md'])
  try {
    assert.deepEqual(sweptDocs(t.root), [
      ...ROOT_FILES,
      'docs/engineering/checks.md',
      'docs/guide.md',
    ])
  } finally {
    t.done()
  }
})

test('a tree with none of the swept folders sweeps its root docs alone', () => {
  const t = tree(ROOT_FILES)
  try {
    assert.deepEqual(sweptDocs(t.root), ROOT_FILES)
  } finally {
    t.done()
  }
})

test('a folder that exists is still swept beside one that does not', () => {
  const t = tree([...ROOT_FILES, 'skills/map/SKILL.md'])
  try {
    assert.deepEqual(sweptDocs(t.root), [...ROOT_FILES, 'skills/map/SKILL.md'])
  } finally {
    t.done()
  }
})

test('a root document nobody listed is swept; the changelog is the one that is not', () => {
  // The list used to be three names, so SETUP.md, INDEX.md, CONTRIBUTING.md
  // and SECURITY.md were read by no prose sweep at all, with no reason stated
  // beside the list. The root is read instead — so a document added at it
  // tomorrow is swept tomorrow, and the single exclusion carries its reason.
  const t = tree([...ROOT_FILES, 'SETUP.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/guide.md'])
  try {
    assert.deepEqual(sweptDocs(t.root), [
      'AGENTS.md',
      'GLOSSARY.md',
      'README.md',
      'SECURITY.md',
      'SETUP.md',
      'docs/guide.md',
    ])
  } finally {
    t.done()
  }
})
