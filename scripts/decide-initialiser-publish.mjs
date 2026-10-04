#!/usr/bin/env node
/**
 * Should this run publish the initialiser? One answer, reached before the one
 * command that cannot be taken back.
 *
 * The initialiser, `create-uno-blueprint`, is the one package in this tree
 * that goes to a registry, and a version there is permanent: it cannot be
 * published twice and it cannot be replaced. It also downloads the release
 * whose tag is its own version. So the publish workflow asks here first, and
 * runs `npm publish` only when this says so.
 *
 *   node scripts/decide-initialiser-publish.mjs
 *
 * It reads the run from the environment a workflow sets — `GITHUB_REF_TYPE`,
 * `GITHUB_REF_NAME` and `GITHUB_REPOSITORY` — and appends `publish=true` or
 * `publish=false` to `GITHUB_OUTPUT`. It publishes nothing itself.
 *
 * THREE OUTCOMES, EACH WITH ONE REASON LINE, DECIDED IN THIS ORDER.
 *
 *   SKIP     This tree carries no initialiser. A workspace the initialiser
 *            wrote carries this script and the workflow that runs it, and
 *            has no package to publish. Decided first, before anything reads
 *            a version: what a workspace kept of the template's release
 *            bookkeeping is its owner's business. Green.
 *   SKIP     This repository is not the one the manifest names. A fork, a
 *            repository made from the template, and a copy somebody pushed
 *            elsewhere all carry the manifest, and none of them is where the
 *            package comes from. Green, in one line naming both. A rename of
 *            the template's own repository lands here too, which is why the
 *            manifest's `repository` moves with the rename: the releasing
 *            guide says so.
 *   REFUSE   The run was not started by a `v<version>` tag, the tag is not
 *            the version the initialiser's manifest states, or the places
 *            that state the version disagree (`check-version-agreement.mjs`
 *            is what holds them). Red.
 *   REFUSE   The tagged commit is not on `main`. Anybody who can push a tag
 *            can push one on any commit, and the versions in a commit that
 *            was never merged agree with each other perfectly well. Red.
 *   REFUSE   The installed npm is older than trusted publishing needs, or
 *            could not be asked its version. It would fail at the publish by
 *            asking for a login, which reads as a missing secret. Red, in one
 *            line that names the version or what went wrong.
 *   REFUSE   The registry could not be asked whether the version exists. Red
 *            rather than a guess, because the guess is a publish. Nothing is
 *            wrong with the release; run it again.
 *   SKIP     The registry has this version. Green, and nothing is published:
 *            a run started again says so and stops.
 *   PUBLISH  None of the above.
 *
 * THE TAG EXISTS BEFORE THE PUBLISH BECAUSE THE TAG STARTS IT. The published
 * initialiser downloads `v<its own version>`, so a version on the registry
 * with no tag behind it is a command that ends in a 404. A run a tag started
 * cannot be in that state, which is why any other kind of run is refused.
 *
 * WHAT IT FETCHES IS HANDED IN. The registry's answer, whether the commit is
 * on `main`, and the npm version are three functions with defaults that go
 * and look. A test hands in its own, so every outcome above is reached
 * without a network, a remote or a second npm.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { misnamedTag, tagFor, versionNamedBy } from './check-release-tag.mjs'
import {
  INITIALISER_MANIFEST,
  disagreementLine,
  disagreements,
  versions,
} from './check-version-agreement.mjs'
import { whenRun } from './verdict.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()

/** The registry the initialiser is published to. */
export const REGISTRY = 'https://registry.npmjs.org'

/** How long the registry is given to answer. A stalled lookup is a job that never ends. */
const LOOKUP_TIMEOUT_MS = 30_000

/** The oldest npm that can publish through trusted publishing, as npm's documentation states it. */
const NPM_FLOOR = [11, 5, 1]

/** The branch a release is cut on, as this checkout's remote knows it. */
const MAIN = 'origin/main'

/**
 * `owner/name` for the GitHub repository a manifest names, or null when it
 * names none this can read. A manifest states it as a url or as an object
 * holding one, and npm writes the url as `git+https://github.com/<owner>/<name>.git`.
 */
export function repositoryOf(manifest) {
  const stated = manifest?.repository
  const url = typeof stated === 'string' ? stated : stated?.url
  const match = /^(?:git\+)?https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(url ?? '')
  return match ? match[1] : null
}

/**
 * Whether the registry has `name@version`, asked with the `fetch` handed in.
 *
 * 200 is a version that exists and 404 is one that does not. Anything else —
 * a 5xx, a rate limit, a network that is not there — throws, because it is
 * not an answer to the question.
 */
export function registryLookup(fetch = globalThis.fetch) {
  return async (name, version) => {
    const url = `${REGISTRY}/${name}/${version}`
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (response.status === 200) return true
    if (response.status === 404) return false
    throw new Error(`${url} answered ${response.status}`)
  }
}

/**
 * Whether the commit checked out in `root` is on `main`.
 *
 * `git merge-base --is-ancestor` exits 0 for yes and 1 for no. Any other exit
 * is git saying it could not tell — a shallow checkout with no `origin/main`
 * in it is the usual one — and that throws, because "could not tell" is not
 * "no" and is certainly not "yes".
 */
function onMain(root) {
  return () => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', MAIN], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'pipe'],
        encoding: 'utf8',
      })
      return true
    } catch (error) {
      if (error.status === 1) return false
      const said = String(error.stderr || error.message).trim().split('\n')[0]
      throw new Error(`git could not tell whether HEAD is on ${MAIN}: ${said}`)
    }
  }
}

/** The npm on this machine's PATH, as it states its own version. */
const installedNpm = () => execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()

/** Whether `version` is at or past `NPM_FLOOR`. A version that cannot be read is not. */
function meetsNpmFloor(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number)
  if (!parts) return false
  for (const [index, floor] of NPM_FLOOR.entries()) {
    if (parts[index] !== floor) return parts[index] > floor
  }
  return true
}

/**
 * The decision for one run.
 *
 * The order is the header's. Each fact is asked for only once the answers
 * before it have let the decision get that far, so a workspace is never asked
 * for a changelog and a refused tag never reaches the registry.
 *
 * @returns {Promise<{ outcome: 'publish' | 'skip' | 'refuse', reason: string }>}
 */
async function decide({ root, env, isPublished, isOnMain, npmVersion }) {
  const skip = (reason) => ({ outcome: 'skip', reason })
  const refuse = (reason) => ({ outcome: 'refuse', reason })

  const path = join(root, INITIALISER_MANIFEST)
  if (!existsSync(path)) {
    return skip(
      `this tree has no initialiser (no ${INITIALISER_MANIFEST}), so there is nothing here ` +
        `to publish`,
    )
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  const { name, version } = manifest

  const home = repositoryOf(manifest)
  if (!home) {
    return refuse(`${INITIALISER_MANIFEST} names no GitHub repository this can read`)
  }
  const here = env.GITHUB_REPOSITORY
  if (here?.toLowerCase() !== home.toLowerCase()) {
    return skip(
      `this run is in ${here ?? '(no repository named)'} and ${name} is published from ` +
        `${home}, the repository its manifest names; nothing published`,
    )
  }

  const tag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : null
  if (!tag) {
    return refuse(
      `this run was not started by a tag. ${name} downloads the release tagged ` +
        `${tagFor(version)}, so the tag comes first and the tag is what publishes.`,
    )
  }
  if (versionNamedBy(tag) === null) return refuse(misnamedTag(tag))
  if (tag !== tagFor(version)) {
    return refuse(`tag ${tag} is not the version ${INITIALISER_MANIFEST} states, ${version}`)
  }
  const apart = disagreements(versions(root))
  if (apart.length > 0) return refuse(apart.map(disagreementLine).join('; '))

  try {
    if (!(await isOnMain())) {
      return refuse(
        `tag ${tag} is on a commit that is not on main. A release is tagged at its commit ` +
          `on main, and only that tag publishes.`,
      )
    }
  } catch (error) {
    return refuse(error.message)
  }

  let npm
  try {
    npm = npmVersion()
  } catch (error) {
    return refuse(`npm could not be asked its version: ${error.message.split('\n')[0]}`)
  }
  if (!meetsNpmFloor(npm)) {
    return refuse(
      `npm ${npm} is older than ${NPM_FLOOR.join('.')}, the first that can publish without ` +
        `a token. Raise the Node this workflow sets up.`,
    )
  }

  let published
  try {
    published = await isPublished(name, version)
  } catch (error) {
    return refuse(
      `the registry could not be asked whether ${name}@${version} exists (${error.message}). ` +
        `Nothing is wrong with the release: re-run this run.`,
    )
  }
  return published
    ? skip(`${name}@${version} is already on the registry; nothing published`)
    : { outcome: 'publish', reason: `${name}@${version} is not on the registry; publishing it` }
}

/**
 * The script's entry: decide, and leave the answer where the workflow's next
 * step reads it.
 *
 * @param root         the tree to read
 * @param env          the run's environment
 * @param isPublished  `(name, version) => Promise<boolean>`
 * @param isOnMain     `() => boolean | Promise<boolean>`
 * @param npmVersion   `() => string`
 */
export async function settle({
  root = REPO_ROOT,
  env = process.env,
  isPublished = registryLookup(),
  isOnMain = onMain(root),
  npmVersion = installedNpm,
} = {}) {
  const decision = await decide({ root, env, isPublished, isOnMain, npmVersion })
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `publish=${decision.outcome === 'publish'}\n`)
  }
  return decision
}

/**
 * The verdict for this run: the decision as `verdict.mjs` takes it. A refusal
 * is the one finding; a skip and a publish are each the green line.
 */
export async function judge(facts) {
  const { outcome, reason } = await settle(facts)
  return {
    what: 'a run that could publish the initialiser',
    count: 1,
    findings: outcome === 'refuse' ? [reason] : [],
    opening: 'The initialiser is not published from this run:',
    closing: '\nProcedure: docs/engineering/releasing.md',
    line: reason,
  }
}

whenRun(import.meta.url, () => judge())
