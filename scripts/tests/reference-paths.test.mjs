/**
 * The path-stability check, and the list it holds.
 *
 * The check itself is one lookup per line against a sweep of the commit, so
 * what is worth testing is the list and the failure: that every imported path is
 * really there right now, that a moved file is reported by name rather than
 * counted, and that the list cannot quietly acquire a path outside the interface
 * it guards.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  CONSUMER_IMPORTS,
  absences,
  interfaceSweep,
} from '../check-reference-paths.mjs'

test('every path the deployment imports exists and the commit carries it', () => {
  // The sweep hands both halves in: its `files` are the interface as a commit
  // would carry it, its `read` answers whether the file is there.
  const walk = interfaceSweep()
  assert.deepEqual(
    absences(CONSUMER_IMPORTS, new Set(walk.files), (path) => walk.read(path) !== null),
    [],
  )
})

test('the list is eighteen references, four skill bodies, the render walk and the composition documents', () => {
  const skills = CONSUMER_IMPORTS.filter((path) => path.endsWith('/SKILL.md'))
  const renderWalk = CONSUMER_IMPORTS.filter((path) => path.startsWith('render-walk/'))
  // The composition documents, which a deployment's claims check reads out of
  // the installed package: one per assembled surface, plus the survey.
  const composition = CONSUMER_IMPORTS.filter((path) => path.startsWith('docs/'))
  assert.equal(skills.length, 4)
  // The runner a deployment names on the command line, the config it stages
  // and hands to Playwright, and the specs that travel beside it — the view
  // walk, the annotation-drag case, the phone cover walk, the phone
  // agent-jump case, and the served-from-a-path case — plus the remote-image
  // route every spec takes its `test` from, and the case that watches it.
  assert.equal(renderWalk.length, 9)
  assert.equal(composition.length, 10)
  assert.equal(
    CONSUMER_IMPORTS.length - skills.length - renderWalk.length - composition.length,
    18,
  )
  assert.equal(new Set(CONSUMER_IMPORTS).size, CONSUMER_IMPORTS.length)
})

test('a moved reference is named, not counted', () => {
  const tracked = new Set(['references/data-model.md'])
  const found = absences(
    ['references/data-model.md'],
    tracked,
    () => false,
  )
  assert.deepEqual(found, [
    { path: 'references/data-model.md', reason: 'no file at this path' },
  ])
})

test('a file present but untracked would not ship in a git install', () => {
  const found = absences(['references/data-model.md'], new Set(), () => true)
  assert.equal(found.length, 1)
  assert.match(found[0].reason, /untracked/)
})

test('a path outside the interface roots is refused', () => {
  const found = absences(['src/lib/agent/skills.ts'], new Set(), () => true)
  assert.equal(found.length, 1)
  assert.equal(found[0].path, 'src/lib/agent/skills.ts')
  // The sentence names the roots, and it is built from the list rather than
  // repeated here — a fifth root would otherwise leave the refusal telling its
  // reader the wrong four places a path may live.
  assert.equal(
    found[0].reason,
    'not under references/, skills/, render-walk/ or docs/guidelines/composition/',
  )
})
