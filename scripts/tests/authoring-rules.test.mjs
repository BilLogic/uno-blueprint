#!/usr/bin/env node
/**
 * Dependency and version rules (phases 5 and 6).
 *
 * These are the checks that stop a blueprint from describing something that
 * cannot happen: an arrow between two alternatives, a copy whose arrows point
 * back at the original, two versions nobody can tell apart.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
// Through the alias, not up two directories. A deployment reads the
// application out of `node_modules/uno-blueprint` and has no
// `src` to walk up into, so `../../src/lib/…` is a file that is not there and
// the suite cannot even load. `@/…` is the same pair of roots the build
// resolves, so this import lands on whichever one holds the application.
import { validateDraftDependency } from '@/lib/dependencyValidation.ts'
import {
  validateDraftVersion,
  describeVersionOutcome,
} from '@/lib/versionValidation.ts'

const source = { cellId: 'a', pathId: 'p1', label: 'Greet customer' }
const sameVersion = { cellId: 'b', pathId: 'p1', label: 'Share screen' }
const otherVersion = { cellId: 'c', pathId: 'p2', label: 'Escalate' }

const draft = (patch) => ({
  sourceCellId: 'a',
  targetCellId: 'b',
  kind: 'leads_to',
  label: '',
  note: '',
  ...patch,
})

test('a valid handoff has no problems', () => {
  assert.deepEqual(
    validateDraftDependency(draft(), sameVersion, []),
    [],
  )
})

test('a cell cannot depend on itself', () => {
  const problems = validateDraftDependency(
    draft({ targetCellId: 'a' }),
    source,
    [],
  )
  assert.ok(problems.some((p) => /cannot depend on itself/.test(p)))
})

test('a link may cross paths: the service rule is the database\'s', () => {
  // A link may join two paths, or two scenarios, of one service. Whether the
  // other end is in the same service is the database's to refuse, in its own
  // sentence; the panel only ever offers cells of the service it has open.
  assert.deepEqual(
    validateDraftDependency(
      draft({ targetCellId: 'c' }),
      otherVersion,
      [],
    ),
    [],
  )
})

test('no target is reported before anything else', () => {
  const problems = validateDraftDependency(
    draft({ targetCellId: null }),
    null,
    [],
  )
  assert.deepEqual(problems, ['Pick the cell this one connects to.'])
})

test('the same connection is not added twice', () => {
  const problems = validateDraftDependency(draft(), sameVersion, [
    { targetCellId: 'b', kind: 'leads_to' },
  ])
  assert.ok(problems.some((p) => /already exists/.test(p)))
})

test('the same pair may hold both a leads_to and an enables', () => {
  const problems = validateDraftDependency(
    draft({ kind: 'enables' }),
    sameVersion,
    [{ targetCellId: 'b', kind: 'leads_to' }],
  )
  assert.deepEqual(problems, [])
})

// --- versions ---------------------------------------------------------------

const version = (patch) => ({
  mode: 'blank',
  name: 'Escalation',
  pathType: 'alternative',
  sourcePathId: null,
  copyCells: true,
  copyDependencies: true,
  ...patch,
})

test('a version needs a name', () => {
  assert.ok(
    validateDraftVersion(version({ name: '  ' }), []).some((p) =>
      /needs a name/.test(p),
    ),
  )
})

test('sibling names must differ, ignoring case', () => {
  const problems = validateDraftVersion(version({ name: 'happy path' }), [
    'Happy Path',
  ])
  assert.ok(problems.some((p) => /already has a path/.test(p)))
})

test('duplicating requires a source', () => {
  const problems = validateDraftVersion(
    version({ mode: 'duplicate', sourcePathId: null }),
    [],
  )
  assert.ok(problems.some((p) => /Pick the path to copy/.test(p)))
})

test('arrows cannot be copied without their cells', () => {
  const problems = validateDraftVersion(
    version({
      mode: 'duplicate',
      sourcePathId: 'p1',
      copyCells: false,
      copyDependencies: true,
    }),
    [],
  )
  assert.ok(problems.some((p) => /without the cells/.test(p)))
})

test('the outcome sentence names the arrow behaviour', () => {
  assert.match(
    describeVersionOutcome(version({ mode: 'duplicate', sourcePathId: 'p1' })),
    /repointed onto the copies/,
  )
  assert.match(
    describeVersionOutcome(
      version({ mode: 'duplicate', sourcePathId: 'p1', copyDependencies: false }),
    ),
    /no arrows/,
  )
})
