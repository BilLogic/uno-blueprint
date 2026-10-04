#!/usr/bin/env node
/**
 * A RELEASE TAG PUBLISHES THE INITIALISER, ONCE, AND ONLY WHEN THE NUMBERS AGREE.
 *
 * The publish workflow runs one command it cannot take back, so the decision
 * to run it is a function and is held here. Every case goes in through the
 * door the workflow uses: a tree on disk, the environment a runner sets, and
 * the three facts the script would otherwise go and fetch — what the registry
 * has, whether the tagged commit is on `main`, and which npm is installed —
 * handed in from the test. A misspelt variable name in the script fails here
 * rather than on the first release. Nothing reaches the network, nothing
 * needs a git remote, and nothing publishes.
 *
 * Run: npm test
 */
import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { INITIALISER_MANIFEST } from '../check-version-agreement.mjs'
import {
  judge,
  registryLookup,
  repositoryOf,
  settle,
} from '../decide-initialiser-publish.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const scratch = []
afterEach(() => {
  for (const folder of scratch.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/**
 * A throwaway tree stating `version` everywhere, with the initialiser's
 * manifest stating `initialiser` — or absent when that is null, as it is in a
 * workspace the initialiser wrote.
 */
function treeStating(version, initialiser = version) {
  const root = mkdtempSync(join(tmpdir(), 'initialiser-publish-'))
  scratch.push(root)
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
      JSON.stringify({
        name: 'create-uno-blueprint',
        version: initialiser,
        repository: {
          type: 'git',
          url: 'git+https://github.com/BilLogic/uno-blueprint.git',
          directory: 'packages/create-uno-blueprint',
        },
      }),
    )
  }
  return root
}

/** A registry that holds `versions` of the initialiser, and remembers who asked. */
function registryHolding(...versions) {
  const asked = []
  const isPublished = async (name, version) => {
    asked.push(`${name}@${version}`)
    return versions.includes(version)
  }
  return { isPublished, asked }
}

/** The environment of a run a `v2.4.0` tag started in the template's own repository. */
const TAG_RUN = {
  GITHUB_REF_TYPE: 'tag',
  GITHUB_REF_NAME: 'v2.4.0',
  GITHUB_REPOSITORY: 'BilLogic/uno-blueprint',
}

/**
 * The script's entry, for a `v2.4.0` release that should publish, with
 * overrides. Returns the decision and what was appended to `GITHUB_OUTPUT`.
 */
async function settled({ env = {}, root = treeStating('2.4.0'), ...facts } = {}) {
  const output = join(root, 'github-output')
  const decision = await settle({
    root,
    env: { ...TAG_RUN, GITHUB_OUTPUT: output, ...env },
    isPublished: registryHolding().isPublished,
    isOnMain: () => true,
    npmVersion: () => '11.19.0',
    ...facts,
  })
  return { ...decision, output: existsSync(output) ? readFileSync(output, 'utf8') : null }
}

test('a tag on main for a version the registry does not have publishes it', async () => {
  const registry = registryHolding('2.3.0')
  const { outcome, reason, output } = await settled({ isPublished: registry.isPublished })
  assert.equal(outcome, 'publish')
  assert.match(reason, /create-uno-blueprint@2\.4\.0/)
  assert.deepEqual(registry.asked, ['create-uno-blueprint@2.4.0'])
  assert.equal(output, 'publish=true\n')
})

test('a version already on the registry is left alone, and that is a success', async () => {
  const { outcome, reason, output } = await settled({
    isPublished: registryHolding('2.4.0').isPublished,
  })
  assert.equal(outcome, 'skip')
  assert.match(reason, /already on the registry/)
  assert.equal(output, 'publish=false\n')
})

test('the answer is appended to the step output, not written over it', async () => {
  const root = treeStating('2.4.0')
  writeFileSync(join(root, 'github-output'), 'earlier=kept\n')
  const { output } = await settled({ root })
  assert.equal(output, 'earlier=kept\npublish=true\n')
})

test('with no step output to write to, the decision is still reached', async () => {
  const { outcome, output } = await settled({ env: { GITHUB_OUTPUT: undefined } })
  assert.equal(outcome, 'publish')
  assert.equal(output, null)
})

test('a tag that is not the version the initialiser states is refused', async () => {
  const registry = registryHolding()
  const { outcome, reason, output } = await settled({
    env: { GITHUB_REF_NAME: 'v2.5.0' },
    isPublished: registry.isPublished,
  })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /v2\.5\.0/)
  assert.match(reason, /2\.4\.0/)
  // Refused before the registry is asked anything.
  assert.deepEqual(registry.asked, [])
  assert.equal(output, 'publish=false\n')
})

test('an initialiser one number off the template is refused, naming its manifest', async () => {
  const { outcome, reason } = await settled({ root: treeStating('2.5.0', '2.4.0') })
  assert.equal(outcome, 'refuse')
  assert.ok(reason.includes(`${INITIALISER_MANIFEST} says 2.4.0, package.json says 2.5.0`), reason)
})

test('a tag that is not a release tag is refused', async () => {
  for (const tag of ['v2.4', 'v2.4.0-rc.1', 'vnext', '2.4.0']) {
    const { outcome, reason } = await settled({ env: { GITHUB_REF_NAME: tag } })
    assert.equal(outcome, 'refuse', tag)
    assert.match(reason, /is not v<major>\.<minor>\.<patch>/, tag)
  }
})

test('a run a branch started is refused, whatever the branch is called', async () => {
  // `GITHUB_REF_NAME` is a branch name on a branch run, and a branch can be
  // named like a tag. The ref's type is what says which it is.
  const registry = registryHolding()
  for (const type of ['branch', undefined]) {
    const { outcome, reason, output } = await settled({
      env: { GITHUB_REF_TYPE: type },
      isPublished: registry.isPublished,
    })
    assert.equal(outcome, 'refuse', String(type))
    assert.match(reason, /not started by a tag/, String(type))
    assert.equal(output, 'publish=false\n')
  }
  assert.deepEqual(registry.asked, [])
})

test('a tag on a commit that is not on main is refused', async () => {
  const registry = registryHolding()
  const { outcome, reason } = await settled({
    isOnMain: () => false,
    isPublished: registry.isPublished,
  })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /v2\.4\.0/)
  assert.match(reason, /not on main/)
  assert.deepEqual(registry.asked, [])
})

test('a history that could not be read is a refusal, never a publish', async () => {
  const { outcome, reason } = await settled({
    isOnMain: () => {
      throw new Error('origin/main is not a commit this checkout has')
    },
  })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /origin\/main is not a commit/)
})

test('an npm older than trusted publishing needs is refused in one line', async () => {
  const registry = registryHolding()
  for (const version of ['10.9.2', '11.5.0', '9.0.0', 'not a version']) {
    const { outcome, reason } = await settled({
      npmVersion: () => version,
      isPublished: registry.isPublished,
    })
    assert.equal(outcome, 'refuse', version)
    assert.match(reason, /11\.5\.1/, version)
    assert.ok(reason.includes(version), reason)
    assert.ok(!reason.includes('\n'), reason)
  }
  assert.deepEqual(registry.asked, [])
  for (const version of ['11.5.1', '11.19.0', '12.0.0']) {
    assert.equal((await settled({ npmVersion: () => version })).outcome, 'publish', version)
  }
})

test('an npm that cannot be asked its version is a refusal in one line', async () => {
  const registry = registryHolding()
  const { outcome, reason, output } = await settled({
    npmVersion: () => {
      throw new Error('spawnSync npm ENOENT\n    at somewhere')
    },
    isPublished: registry.isPublished,
  })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /npm could not be asked its version: spawnSync npm ENOENT/)
  assert.ok(!reason.includes('\n'), reason)
  assert.deepEqual(registry.asked, [])
  assert.equal(output, 'publish=false\n')
})

test('a registry that could not be asked is a refusal, never a publish', async () => {
  const { outcome, reason, output } = await settled({
    isPublished: async () => {
      throw new Error('the registry answered 503')
    },
  })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /the registry answered 503/)
  assert.match(reason, /[Rr]e-run/)
  assert.equal(output, 'publish=false\n')
})

test('a tree with no initialiser, which is what a workspace is, has nothing to publish', async () => {
  const registry = registryHolding()
  const { outcome, reason, output } = await settled({
    root: treeStating('2.4.0', null),
    isPublished: registry.isPublished,
  })
  assert.equal(outcome, 'skip')
  assert.match(reason, /no initialiser/)
  assert.deepEqual(registry.asked, [])
  assert.equal(output, 'publish=false\n')
})

test('a workspace that dropped its changelog and plugin manifest still skips', async () => {
  // The skip comes before anything reads the version statements: a workspace
  // is the adopter's tree, and what they kept of the template's release
  // bookkeeping is theirs to decide.
  const root = treeStating('2.4.0', null)
  rmSync(join(root, 'CHANGELOG.md'))
  rmSync(join(root, '.claude-plugin'), { recursive: true })
  rmSync(join(root, 'package-lock.json'))
  const { outcome } = await settled({
    root,
    env: { GITHUB_REPOSITORY: 'somebody/their-service', GITHUB_REF_NAME: 'v0.1.0' },
    npmVersion: () => '10.9.2',
    isOnMain: () => false,
  })
  assert.equal(outcome, 'skip')
})

test('a repository other than the one the manifest names has nothing to publish', async () => {
  // A fork, a repository made from the template with "Use this template", a
  // copy pushed elsewhere: each carries the manifest and the workflow, none is
  // where the package comes from, and a tag pushed there is not a failure. A
  // rename of the template's own repository looks the same, which is why the
  // manifest's `repository` moves with it.
  const registry = registryHolding()
  for (const repository of [
    'somebody/uno-blueprint',
    'SomeOrg/our-service-blueprint',
    'BilLogic/uno-blueprint-next',
    undefined,
  ]) {
    const { outcome, reason, output } = await settled({
      env: { GITHUB_REPOSITORY: repository },
      isPublished: registry.isPublished,
    })
    assert.equal(outcome, 'skip', String(repository))
    assert.ok(reason.includes('BilLogic/uno-blueprint'), reason)
    if (repository) assert.ok(reason.includes(repository), reason)
    assert.ok(!reason.includes('\n'), reason)
    assert.equal(output, 'publish=false\n')
  }
  assert.deepEqual(registry.asked, [])
})

test('a manifest that names no repository it can read is refused', async () => {
  const root = treeStating('2.4.0')
  const path = join(root, INITIALISER_MANIFEST)
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, JSON.stringify({ ...manifest, repository: undefined }))
  const { outcome, reason } = await settled({ root })
  assert.equal(outcome, 'refuse')
  assert.match(reason, /names no GitHub repository/)
})

test('repository names are compared without regard to case', async () => {
  const { outcome } = await settled({ env: { GITHUB_REPOSITORY: 'billogic/Uno-Blueprint' } })
  assert.equal(outcome, 'publish')
})

test('the repository a manifest names is read out of its url, in either spelling', () => {
  assert.equal(
    repositoryOf({ repository: { url: 'git+https://github.com/BilLogic/uno-blueprint.git' } }),
    'BilLogic/uno-blueprint',
  )
  assert.equal(
    repositoryOf({ repository: 'https://github.com/BilLogic/uno-blueprint' }),
    'BilLogic/uno-blueprint',
  )
  assert.equal(repositoryOf({ repository: { url: 'git+ssh://example.test/a/b.git' } }), null)
  assert.equal(repositoryOf({}), null)
})

test('each outcome reaches the verdict as what it is: a green line, or a finding', async () => {
  const facts = { isOnMain: () => true, npmVersion: () => '11.19.0' }
  const judged = (root, env, registry = registryHolding()) =>
    judge({ root, env: { ...TAG_RUN, ...env }, isPublished: registry.isPublished, ...facts })

  const publish = await judged(treeStating('2.4.0'))
  assert.deepEqual(publish.findings, [])
  assert.match(publish.line, /publishing/)
  assert.equal(publish.count, 1)

  const skip = await judged(treeStating('2.4.0', null))
  assert.deepEqual(skip.findings, [])
  assert.match(skip.line, /no initialiser/)
  assert.equal(skip.count, 1)

  const refuse = await judged(treeStating('2.4.0'), { GITHUB_REF_NAME: 'v2.5.0' })
  assert.equal(refuse.findings.length, 1)
  assert.match(refuse.findings[0], /v2\.5\.0/)
})

test('the lookup reads the registry: 200 is published, 404 is not, anything else is an error', async () => {
  const asked = []
  const answering = (status) => async (url) => {
    asked.push(String(url))
    return { status }
  }
  assert.equal(await registryLookup(answering(200))('create-uno-blueprint', '2.4.0'), true)
  assert.equal(await registryLookup(answering(404))('create-uno-blueprint', '2.4.0'), false)
  await assert.rejects(
    registryLookup(answering(503))('create-uno-blueprint', '2.4.0'),
    /503/,
  )
  await assert.rejects(
    registryLookup(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })('create-uno-blueprint', '2.4.0'),
    /ENOTFOUND/,
  )
  assert.equal(asked[0], 'https://registry.npmjs.org/create-uno-blueprint/2.4.0')
})

// A workspace the initialiser wrote carries this file and no `packages/`, so
// there is no manifest for it to hold.
test.skipIf(!existsSync(join(ROOT, INITIALISER_MANIFEST)))(
  'the manifest this tree ships can be published from the repository it names',
  () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, INITIALISER_MANIFEST), 'utf8'))
    // Trusted publishing matches the manifest's repository against the one the
    // workflow runs in, and the initialiser downloads its release from the same
    // place. One that cannot be read is a publish the registry refuses.
    assert.equal(repositoryOf(manifest), 'BilLogic/uno-blueprint')
    assert.equal(manifest.repository.directory, 'packages/create-uno-blueprint')
    assert.equal(manifest.publishConfig?.access, 'public')
    assert.notEqual(manifest.private, true)
  },
)
