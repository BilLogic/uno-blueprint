#!/usr/bin/env node
/**
 * The one version number, checked where a release would break it.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INITIALISER_MANIFEST,
  changelogVersion,
  disagreements,
  lockfileVersion,
  versions,
  writeInitialiserVersion,
} from '../check-version-agreement.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * A throwaway tree stating `version` in every place but the initialiser's
 * manifest, which states `initialiser` — or is absent when that is null, as
 * it is in a workspace the initialiser wrote.
 */
function treeStating(version, initialiser) {
  const root = mkdtempSync(join(tmpdir(), 'version-agreement-'))
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write('package.json', JSON.stringify({ name: 'uno-blueprint', version }))
  write('.claude-plugin/plugin.json', JSON.stringify({ version }))
  write('CHANGELOG.md', `# Changelog\n\n## ${version}\n`)
  write('package-lock.json', JSON.stringify({ version, packages: { '': { version } } }))
  if (initialiser !== null) {
    write(
      INITIALISER_MANIFEST,
      `{\n  "name": "create-uno-blueprint",\n  "version": "${initialiser}",\n  "engines": { "node": ">=22" }\n}\n`,
    )
  }
  return root
}

test('this tree states one version everywhere', () => {
  assert.deepEqual(disagreements(versions(ROOT)), [])
})

test('the changelog version is the first release heading, not the title', () => {
  const source = '# Changelog\n\nBlurb about 9.9.9.\n\n## 0.5.0 — 2026-08-24\n\n## 0.4.0\n'
  assert.equal(changelogVersion(source), '0.5.0')
  assert.equal(changelogVersion('# Changelog\n\nNothing released yet.\n'), null)
})

test('a disagreement names the file, what it says, and what it should say', () => {
  const wrong = disagreements({
    'package.json': '0.5.0',
    '.claude-plugin/plugin.json': '0.4.0',
    'CHANGELOG.md': '0.5.0',
  })
  assert.deepEqual(wrong, [
    { file: '.claude-plugin/plugin.json', version: '0.4.0', expected: '0.5.0' },
  ])
})

test('a missing changelog heading disagrees rather than passing quietly', () => {
  const wrong = disagreements({ 'package.json': '0.5.0', 'CHANGELOG.md': null })
  assert.equal(wrong.length, 1)
  assert.equal(wrong[0].version, null)
})

test('the lockfile states its version twice, and the check reads it as one', () => {
  assert.equal(
    lockfileVersion({ version: '1.5.0', packages: { '': { version: '1.5.0' } } }),
    '1.5.0',
  )
})

test('a lockfile that disagrees with itself states no version at all', () => {
  // `npm install` rewrites both from package.json; a lockfile carrying two
  // numbers was edited by hand, and neither is trusted.
  assert.equal(
    lockfileVersion({ version: '1.5.0', packages: { '': { version: '0.5.0' } } }),
    null,
  )
})

test('a lockfile behind the manifest is a disagreement, not a dirty worktree', () => {
  const wrong = disagreements({
    'package.json': '1.5.0',
    '.claude-plugin/plugin.json': '1.5.0',
    'CHANGELOG.md': '1.5.0',
    'package-lock.json': '0.5.0',
  })
  assert.deepEqual(wrong, [
    { file: 'package-lock.json', version: '0.5.0', expected: '1.5.0' },
  ])
})

test('an initialiser behind the template is a disagreement naming its manifest', () => {
  const root = treeStating('2.4.0', '2.3.0')
  try {
    assert.deepEqual(disagreements(versions(root)), [
      { file: INITIALISER_MANIFEST, version: '2.3.0', expected: '2.4.0' },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the write step carries the version into the initialiser and touches nothing else in it', () => {
  const root = treeStating('2.4.0', '2.3.0')
  try {
    assert.equal(writeInitialiserVersion(root), true)
    assert.equal(
      readFileSync(join(root, INITIALISER_MANIFEST), 'utf8'),
      '{\n  "name": "create-uno-blueprint",\n  "version": "2.4.0",\n  "engines": { "node": ">=22" }\n}\n',
    )
    assert.deepEqual(disagreements(versions(root)), [])
    // A second run has nothing left to say.
    assert.equal(writeInitialiserVersion(root), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a tree with no initialiser, which is what a workspace is, still agrees', () => {
  const root = treeStating('2.4.0', null)
  try {
    assert.equal(INITIALISER_MANIFEST in versions(root), false)
    assert.deepEqual(disagreements(versions(root)), [])
    assert.equal(writeInitialiserVersion(root), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// A workspace the initialiser wrote carries this file and no `packages/`, so
// there is nothing for this to hold there.
test.skipIf(!existsSync(join(ROOT, 'packages')))(
  'wherever the initialiser sits in this tree, the guard is looking at it',
  () => {
    // The guard skips a manifest that is not there, so a moved folder would
    // pass in silence. Found by name rather than by the path the guard holds.
    const manifests = readdirSync(join(ROOT, 'packages'))
      .map((folder) => `packages/${folder}/package.json`)
      .filter((path) => existsSync(join(ROOT, path)))
      .filter((path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8')).name === 'create-uno-blueprint')

    assert.deepEqual(manifests, [INITIALISER_MANIFEST])
    assert.equal(typeof versions(ROOT)[INITIALISER_MANIFEST], 'string')
  },
)
