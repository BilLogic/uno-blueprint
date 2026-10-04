#!/usr/bin/env node
/**
 * The last place this repo states its version: the git tag.
 *
 * `check-version-agreement.mjs` holds the files that state it together — the
 * manifest, the plugin manifest, the changelog, the lockfile and the
 * initialiser's manifest. None of them is what a consumer actually pins —
 * `github:BilLogic/uno-blueprint#v0.4.0` resolves a TAG, and a lockfile
 * integrity hash exists only because a tag names one immutable tree. A
 * release with no tag states a version that nothing downstream can ask for.
 *
 *   node scripts/check-release-tag.mjs             # tags that exist must be honest
 *   node scripts/check-release-tag.mjs --require   # ...and this version must have one
 *
 * The default mode is deliberately two-sided rather than one:
 *
 *   - A `v*` tag whose name is not a released version in the CHANGELOG is a
 *     tag nobody can read a release out of.
 *   - A `v<version>` tag whose tree states a different version is a tag that
 *     lies about what it points at, which is worse than no tag at all.
 *   - Once tagging has started, it cannot stop: every release from the OLDEST
 *     tagged one forward must have a tag, EXCEPT the version being released.
 *     Before the first tag that clause sleeps, and it never reaches back over
 *     the releases that shipped before tagging did — retro-tagging six old
 *     trees is not what this guard is for.
 *
 * `--require` is the release step (see docs/engineering/releasing.md). It is
 * not run on ordinary pull requests, because the tag for a version is cut
 * after the release commit is on `main`, not before.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { whenRun } from './verdict.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()

/** `v0.4.0` for `0.4.0`. One shape, so nothing has to guess. */
export const tagFor = (version) => `v${version}`

/** The version a release tag names, or null when its name is not one. */
export const versionNamedBy = (tag) => /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1] ?? null

/** What is wrong with a tag `versionNamedBy` reads no version out of. */
export const misnamedTag = (tag) => `tag ${tag} is not v<major>.<minor>.<patch>`

/** Every version the CHANGELOG records under a release heading. */
export function releasedVersions(source) {
  return [...source.matchAll(/^##\s+(\d+\.\d+\.\d+)\b/gm)].map(([, version]) => version)
}

/**
 * What is wrong with a set of tags, as sentences naming the tag.
 *
 * Pure so the failure shapes are testable without a git repository per case:
 * everything git-shaped is resolved by the caller and handed in.
 *
 * @param tags        the `v*` tags that exist
 * @param released    versions with a CHANGELOG release heading
 * @param version     what package.json states
 * @param taggedTree  version stated by `v<version>`'s tree, or null when the
 *                    tag does not exist
 * @param require     also demand a tag for `version`
 */
export function tagFaults({ tags, released, version, taggedTree, require = false }) {
  const faults = []

  for (const tag of tags) {
    const named = versionNamedBy(tag)
    if (named === null) {
      faults.push(misnamedTag(tag))
      continue
    }
    if (!released.includes(named)) {
      faults.push(`tag ${tag} names a version the CHANGELOG never released`)
    }
  }

  if (taggedTree !== null && taggedTree !== version) {
    faults.push(
      `tag ${tagFor(version)} points at a tree whose package.json says ${taggedTree}`,
    )
  }

  const tagged = (each) => tags.includes(tagFor(each))
  if (require && !tagged(version)) {
    faults.push(`version ${version} is released in the CHANGELOG and has no tag`)
  }
  // The era of tagged releases: from the oldest tag forward, with the
  // CHANGELOG newest-first, there may be no holes. Releases older than that
  // shipped before this repo tagged anything and are left where they are.
  const era = released.map(tagged).lastIndexOf(true)
  for (const each of released.slice(0, Math.max(era, 0))) {
    if (tagged(each)) continue
    // The version being released is the one case this clause must not judge:
    // its tag is cut after the release commit is on `main`, so demanding one
    // here would make the release commit itself unmergeable. That demand is
    // `--require`, which the release step runs and a pull request does not.
    if (each === version) continue
    faults.push(`release ${each} has no tag ${tagFor(each)}`)
  }

  return faults
}

/**
 * `git`, run — and a failure to run it is a fact about the tree, not an empty
 * answer.
 *
 * This caught everything and returned `null`, and `localTags` turned `null`
 * into `[]`. Every assertion below is written over the tags that exist, so an
 * empty list makes all four vacuous: the loops do not run, the era scan slices
 * to length zero, and the script prints `no release tags yet` and exits 0.
 * That sentence was then the same for a repository that has never been tagged,
 * a checkout handed no tags, a tree that is not a git repository at all, and a
 * box with no `git` on it — four states, one green line.
 *
 * `git tag --list` exits 0 and prints nothing when there are simply no tags,
 * so the two cases ARE distinguishable and only the catch was conflating them.
 * A non-zero exit is news.
 */
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch (error) {
    throw new Error(
      `git ${args.join(' ')} failed in ${REPO_ROOT}: ${error.message.split('\n')[0]}. ` +
        `This check reads tags out of git, so it has no subject without one.`,
    )
  }
}

/** The `v*` tags this checkout can see. Empty means git said there are none. */
export function localTags() {
  return git('tag', '--list', 'v*').split('\n').filter(Boolean)
}

/**
 * The version stated by the tree a tag points at.
 *
 * Only ever called for a tag `localTags` just reported, so a tag that cannot
 * be read is a tag that says nothing about the tree it names — which is the
 * thing this check exists to refuse, and it now arrives as the failure it is.
 */
export function versionAtTag(tag) {
  return JSON.parse(git('show', `${tag}:package.json`)).version
}

/**
 * The verdict: the release tags this checkout can see, held to what the changelog
 * and package.json say was released.
 *
 * Pure — it reads the tags and the tree, decides, and hands back what it found.
 * Nothing here prints or exits.
 */
export function judge(argv = process.argv.slice(2)) {
  const require = argv.includes('--require')
  const version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version
  const released = releasedVersions(readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'))
  const tags = localTags()

  const faults = tagFaults({
    tags,
    released,
    version,
    taggedTree: tags.includes(tagFor(version)) ? versionAtTag(tagFor(version)) : null,
    require,
  })

  // Every assertion this check makes is written over the tags that exist, so
  // with none there is nothing for any of them to be true of. A checkout is
  // normally handed no tags — the workflow fetches them in a step of its own —
  // and a reader looking at a green job has no way to tell that run from one
  // where the fetch was dropped. The line says which version is untagged, which
  // the register's sentence does not, so the judgement hands over both and the
  // module prints them in that order.
  if (faults.length === 0 && tags.length === 0) {
    return {
      what: 'every release tag',
      line: `no release tags yet; ${version} is untagged (see docs/engineering/releasing.md)`,
      unverified:
        `this checkout can see no \`v*\` tag, so nothing was held: not that a tag names a ` +
        `released version, not that ${tagFor(version)} would point at a tree stating ` +
        `${version}, and not that tagging has gone on once it started. Fetch tags before ` +
        `this check (see docs/engineering/releasing.md).`,
    }
  }

  return {
    what: 'a release tag',
    count: tags.length,
    findings: faults,
    closing:
      `\nCut the tag on main and push it:\n` +
      `  git tag -a ${tagFor(version)} -m "${tagFor(version)}" && git push origin ${tagFor(version)}\n` +
      `Procedure: docs/engineering/releasing.md`,
    line: tags.includes(tagFor(version))
      ? `${tags.length} release tag(s), and ${tagFor(version)} is among them`
      : `${tags.length} release tag(s); ${version} is not tagged yet`,
  }
}

whenRun(import.meta.url, judge)
