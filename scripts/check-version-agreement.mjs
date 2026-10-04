#!/usr/bin/env node
/**
 * One version number, five places that state it.
 *
 * `package.json` is the source. `.claude-plugin/plugin.json` is what a
 * consumer's plugin install reads, the CHANGELOG's top heading is what a
 * human reads, and `package-lock.json` states it twice — at its root and in
 * its `packages[""]` entry — because `npm install` rewrites both from
 * package.json and a lockfile behind the manifest makes every install in a
 * fresh worktree a dirty file. The fifth is the initialiser's own manifest,
 * `packages/create-uno-blueprint/package.json`: it downloads the release
 * whose tag is its own version, so an initialiser one number off writes a
 * workspace from a release nobody meant, or from one that does not exist. A
 * release where those disagree tells five different stories about the same
 * tree, and only one of them is checkable — so check it.
 *
 *   node scripts/check-version-agreement.mjs           # fail on disagreement
 *   node scripts/check-version-agreement.mjs --write   # copy into the others
 *
 * `--write` exists because `changeset version` only knows about package.json.
 * It propagates — into plugin.json, both lockfile entries and the
 * initialiser's manifest; it never invents. The CHANGELOG stays a human's
 * job, so a release with no written entry still fails the check.
 *
 * THE FIFTH PLACE IS HELD ONLY WHERE IT EXISTS. A workspace the initialiser
 * wrote is this tree without the initialiser's folder, and it carries this
 * check. There the manifest is not a statement that disagrees; it is not a
 * statement, and four places are what there is to hold.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { whenRun } from './verdict.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()

/** The initialiser's manifest: the one publishable package in the tree. */
export const INITIALISER_MANIFEST = 'packages/create-uno-blueprint/package.json'

/** The version in the CHANGELOG's first release heading, or null. */
export function changelogVersion(source) {
  const match = /^##\s+(\d+\.\d+\.\d+)\b/m.exec(source)
  return match ? match[1] : null
}

export function versions(root = REPO_ROOT) {
  const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
  const lock = read('package-lock.json')
  return {
    'package.json': read('package.json').version,
    '.claude-plugin/plugin.json': read('.claude-plugin/plugin.json').version,
    'CHANGELOG.md': changelogVersion(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')),
    'package-lock.json': lockfileVersion(lock),
    ...(existsSync(join(root, INITIALISER_MANIFEST))
      ? { [INITIALISER_MANIFEST]: read(INITIALISER_MANIFEST).version }
      : {}),
  }
}

/**
 * The version a lockfile states, or null when its two statements disagree.
 * npm writes the same number at the root and under `packages[""]`; a lockfile
 * that says two things says nothing this check can trust.
 */
export function lockfileVersion(lock) {
  const root = lock.version ?? null
  const self = lock.packages?.['']?.version ?? null
  return root === self ? root : null
}

/** Every file whose stated version differs from package.json's. */
export function disagreements(stated) {
  const source = stated['package.json']
  return Object.entries(stated)
    .filter(([file, version]) => file !== 'package.json' && version !== source)
    .map(([file, version]) => ({ file, version, expected: source }))
}

/** One disagreement, as the sentence that names the file and both numbers. */
export const disagreementLine = ({ file, version, expected }) =>
  `${file} says ${version ?? '(none)'}, package.json says ${expected}`

/**
 * Copy package.json's version over the first `"version"` a manifest states.
 * A text edit rather than a JSON round-trip, so the file keeps its formatting
 * and the diff is the one line that changed. Returns true if it changed.
 */
function writeManifestVersion(root, manifest) {
  const path = join(root, manifest)
  const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const raw = readFileSync(path, 'utf8')
  const next = raw.replace(/("version":\s*)"[^"]*"/, `$1"${source}"`)
  if (next === raw) return false
  writeFileSync(path, next)
  return true
}

/** Copy package.json's version into plugin.json. Returns true if it changed. */
export function writePluginVersion(root = REPO_ROOT) {
  return writeManifestVersion(root, '.claude-plugin/plugin.json')
}

/**
 * Copy package.json's version into the lockfile's two statements. A text
 * edit rather than a JSON round-trip, so the lockfile keeps npm's formatting
 * byte for byte and the diff is the two lines that changed.
 */
export function writeLockfileVersion(root = REPO_ROOT) {
  const path = join(root, 'package-lock.json')
  const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const raw = readFileSync(path, 'utf8')
  // The root statement is the first "version" in the file; the packages[""]
  // statement is the first "version" after the `"": {` entry opens.
  const next = raw
    .replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${source}"`)
    .replace(/("":\s*\{\s*\n\s*"name":[^\n]*\n\s*"version":\s*)"[^"]*"/, `$1"${source}"`)
  if (next === raw) return false
  writeFileSync(path, next)
  return true
}

/**
 * Copy package.json's version into the initialiser's manifest. Returns true
 * if it changed, and null where there is no initialiser to write to.
 */
export function writeInitialiserVersion(root = REPO_ROOT) {
  if (!existsSync(join(root, INITIALISER_MANIFEST))) return null
  return writeManifestVersion(root, INITIALISER_MANIFEST)
}

/**
 * The verdict: every file stating a version, held to package.json’s.
 *
 * Pure — it reads them, decides, and hands back what it found. Nothing here exits,
 * and `--write` is the release step saying what it did rather than a verdict.
 */
export function judge(argv = process.argv.slice(2)) {
  // `--write` is the release step propagating package.json's number, not a
  // judgement about the tree, so it says what it did and hands the verdict
  // nothing to say.
  if (argv.includes('--write')) {
    const plugin = writePluginVersion()
    const lock = writeLockfileVersion()
    console.log(plugin ? 'plugin.json version updated' : 'plugin.json already current')
    console.log(lock ? 'package-lock.json version updated' : 'package-lock.json already current')
    const initialiser = writeInitialiserVersion()
    if (initialiser !== null) {
      console.log(
        initialiser
          ? `${INITIALISER_MANIFEST} version updated`
          : `${INITIALISER_MANIFEST} already current`,
      )
    }
    return {}
  }
  const stated = versions()
  return {
    what: 'a file stating the version',
    count: Object.keys(stated).length,
    findings: disagreements(stated).map(disagreementLine),
    closing: '\nRun `npx changeset version` to cut a release, or fix the file by hand.',
    line: `version ${stated['package.json']} agrees everywhere`,
  }
}

whenRun(import.meta.url, judge)
