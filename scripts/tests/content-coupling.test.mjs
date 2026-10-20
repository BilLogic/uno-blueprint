#!/usr/bin/env node
/**
 * Content coupling, checked where a pasted value would break the boundary.
 *
 * The sibling suite (`standalone.test.mjs`) holds the word-grep to two things
 * at once: a real reference has to fail, and the ordinary English the tree is
 * full of has to pass. This one has the same pair to hold and a harder second
 * half, because its subject is CONTENT rather than a name — the sample
 * blueprint's own thousand ids, a placeholder somebody typed, and the word
 * `tutorial` all have to walk through. A guard that fires on those is a guard
 * somebody switches off.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ALLOWED,
  PATTERNS,
  SAMPLE_ID_PREFIX,
  couplingsIn,
  findings,
  idAlphabet,
  isAllowed,
  isScanned,
  isTemplateId,
  scannedFiles,
  staleAllowances,
} from '../check-content-coupling.mjs'

const labels = (source) => couplingsIn(source).map((hit) => hit.label)
const matches = (source) => couplingsIn(source).map((hit) => hit.match)

/* ------------------------------------------------------- the shipped tree */

test('no shared file a commit would carry holds a deployment’s content', () => {
  assert.deepEqual(
    findings().map(({ path, line, match, label }) => `${path}:${line} — ${match} · ${label}`),
    [],
  )
})

test('a listing every predicate rejects is refused, not swept as clean', () => {
  // The twin next door made the same claim and neither function held it: two
  // steps stand between `git ls-files` and the subject — the listing, and a
  // predicate that can reject every path in it — and either coming back empty
  // printed `no deployment content in 0 shared files` in the usual green.
  const root = mkdtempSync(join(tmpdir(), 'coupling-empty-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
    git('init', '-q')
    // Listed, and outside the subject: nothing here is under a scanned root.
    mkdirSync(join(root, 'supabase'), { recursive: true })
    writeFileSync(join(root, 'supabase/seed.sql'), 'select 1;\n')
    git('add', '-A')
    // The refusal is the sweep's now — `sweep.mjs`'s `commit` subject — and it
    // names what this check was looking for rather than the subject's own name.
    assert.throws(
      () => scannedFiles(root),
      /no shared file a commit would carry under .*: this walk has no subject/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every ALLOWED entry still has a site, so no exemption is a blind spot', () => {
  assert.deepEqual(staleAllowances(), [])
})

/* ------------------------------------------------------------ planted ids */

test('a cell id pasted out of another database is caught, with its line', () => {
  const found = couplingsIn('const cell = {\n  id: "ae874da3-865c-a06c-f55e-e9085920b694",\n}\n')
  assert.deepEqual(
    found.map(({ line, label, match }) => ({ line, label, match })),
    [
      {
        line: 2,
        label: 'an opaque id',
        match: 'ae874da3-865c-a06c-f55e-e9085920b694',
      },
    ],
  )
  assert.equal(found[0].text, 'id: "ae874da3-865c-a06c-f55e-e9085920b694",')
})

test('a deployment’s STRUCTURED ids are caught too — a pattern is not a passport', () => {
  // These are the shape a deployment mints for itself. They look hand-made
  // and are not: five distinct digits, against the three a person types.
  assert.deepEqual(matches('a0000000-0000-4000-8000-000000040103'), [
    'a0000000-0000-4000-8000-000000040103',
  ])
  assert.equal(idAlphabet('a0000000-0000-4000-8000-000000040103'), 5)
})

test('the sample blueprint’s own ids pass, by origin rather than by exemption', () => {
  // Every id in src/data/sampleBlueprint.ts and supabase/seed.sql comes out of
  // `fid()` in scripts/generate_sample_blueprint.mjs, which mints this prefix.
  assert.deepEqual(labels(`${SAMPLE_ID_PREFIX}510300050005`), [])
  assert.deepEqual(labels(`${SAMPLE_ID_PREFIX}000000000010`), [])
  assert.equal(isTemplateId(`${SAMPLE_ID_PREFIX}510300050005`), true)
})

test('a placeholder somebody typed passes; the version and variant nibbles do not count', () => {
  // All four are in the tree today. Counting the required `4` and `8` would
  // make each of them look two digits richer than the person who typed it.
  assert.deepEqual(labels('11111111-1111-1111-1111-111111111111'), [])
  assert.deepEqual(labels('11111111-1111-4111-8111-111111111111'), [])
  assert.deepEqual(labels('00000000-0000-4000-8000-000000000000'), [])
  assert.deepEqual(labels('aaaaaaaa-0000-4000-8000-000000000001'), [])
  assert.equal(idAlphabet('11111111-1111-4111-8111-111111111111'), 1)
})

/* ---------------------------------------------------------- planted words */

test('a role name from the deployment’s cast is caught', () => {
  assert.deepEqual(labels('name: str(\'e.g. "Lead Tutor"\')'), [
    'the cast of the deployment this template was generalised from',
  ])
  assert.deepEqual(matches('// four "Regular Tutor" lanes'), ['Tutor'])
  assert.deepEqual(matches('reminds tutors to check them'), ['tutors'])
})

test('the cast pattern is word-bounded, so ordinary English passes', () => {
  // An unbounded /tutor/ fails on the first sentence about a tutorial and the
  // check does not survive its first week.
  assert.deepEqual(labels('see the tutorial in docs/guide/'), [])
  assert.deepEqual(labels('a statutory retention window'), [])
})

test('a scenario name from that deployment’s scheduling vocabulary is caught', () => {
  assert.deepEqual(matches('* with Standard Scheduling focused, 176 lane headers'), [
    'Standard Scheduling',
  ])
  assert.deepEqual(matches('`Under 12 hours`, not `Late call-off path`'), ['call-off'])
  assert.deepEqual(matches('the fill-in request path'), ['fill-in request'])
})

test('a deployment’s touchpoint asset is caught; the template’s own fixture is not', () => {
  assert.deepEqual(matches("iconUrl: '/touchpoint-logos/zoom-logo.png'"), [
    '/touchpoint-logos/zoom-logo.png',
  ])
  assert.deepEqual(labels("'/touchpoint-logos/example-logo.png'"), [])
})

test('vendor names are product vocabulary, not one deployment’s content', () => {
  // The keys of TOUCHPOINT_COLORS. What is matched is the ASSET PATH, which is
  // a file only that deployment has — the same line check-standalone draws.
  assert.deepEqual(labels("Zoom: 'indigo',"), [])
  assert.deepEqual(labels("'Google Docs': 'crimson',"), [])
  assert.deepEqual(labels('the session the student joins'), [])
})

/* -------------------------------------------------------- subject and list */

test('a fixture is out of subject, and the vendored mirror with it', () => {
  assert.equal(isScanned('src/lib/agent/tools/specs.ts'), true)
  assert.equal(isScanned('references/data-model.md'), true)
  assert.equal(isScanned('src/lib/agent/skill/references/data-model.md'), false)
  assert.equal(isScanned('src/lib/cellTouchpoints.test.ts'), false)
  assert.equal(isScanned('scripts/tests/run_tests.sh'), false)
  assert.equal(isScanned('supabase/seed.sql'), false)
  // The generator IS in subject: it is where a planted id gets written by hand.
  assert.equal(isScanned('scripts/generate_sample_blueprint.mjs'), true)
})

test('every root document is in subject, the always-loaded tier included', () => {
  // The sweep used to narrow by directory, over seven roots no root-level file
  // can match. So a foreign cell id appended to AGENTS.md — the one file every
  // session is handed without choosing — passed in green, and so did the same
  // line in SETUP.md, INDEX.md, CONTRIBUTING.md and SECURITY.md. Nothing beside
  // the list said they were out, which is what made it an escape rather than a
  // decision.
  for (const doc of [
    'AGENTS.md',
    'README.md',
    'GLOSSARY.md',
    'SETUP.md',
    'INDEX.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CHANGELOG.md',
  ]) {
    assert.equal(isScanned(doc), true, `${doc} is outside the sweep's subject`)
  }
  // The plugin's hooks and the changesets were outside it for the same reason.
  assert.equal(isScanned('hooks/validate_ir_on_edit.py'), true)
  assert.equal(isScanned('.changeset/a-change.md'), true)
})

test('the three shapes planted in AGENTS.md and SETUP.md are caught where they land', () => {
  // The leak, reproduced: a cell id copied out of a deployment's database, its
  // cast, and a touchpoint asset only it has the file for. Under the seven-root
  // subject all three passed; the report now names the document and the line.
  const planted = couplingsIn(
    'Cell `ae874da3-865c-a06c-f55e-e9085920b694` is assigned to a Regular Tutor.\n' +
      'Logo: `/touchpoint-logos/zoom-logo.png`\n',
  )
  assert.deepEqual(
    planted.map(({ line, match }) => `${line}:${match}`),
    [
      '1:ae874da3-865c-a06c-f55e-e9085920b694',
      '1:Tutor',
      '2:/touchpoint-logos/zoom-logo.png',
    ],
  )
  assert.equal(isScanned('AGENTS.md') && isScanned('SETUP.md'), true)
})

test('an allowlist entry exempts one file and one value, and nothing else', () => {
  const allowed = [
    { file: 'src/lib/legacy.ts', match: 'Tutor', why: 'pinned by a design decision' },
  ]
  assert.equal(isAllowed('src/lib/legacy.ts', 'Tutor', allowed), true)
  assert.equal(isAllowed('src/lib/other.ts', 'Tutor', allowed), false)
  assert.equal(isAllowed('src/lib/legacy.ts', 'tutors', allowed), false)
})

test('an allowance nothing matches any more is itself a failure', () => {
  const allowed = [{ file: 'src/gone.ts', match: 'Tutor', why: 'the file was deleted' }]
  // The sweep is handed in: a walk with nothing in it is a tree that has no
  // site for any allowance, so every entry is stale.
  assert.deepEqual(staleAllowances({ files: [], read: () => null }, allowed), allowed)
})

test('every pattern says why it exists, because the failure report prints it', () => {
  for (const pattern of PATTERNS) {
    assert.ok(pattern.label, 'a pattern with no label reports nothing readable')
    assert.ok(pattern.why && pattern.why.length > 40, `${pattern.label} states no why`)
    assert.ok(pattern.find.global, `${pattern.label} is not global — matchAll would throw`)
  }
  for (const entry of ALLOWED) {
    assert.ok(entry.why && entry.why.length > 20, `${entry.file} states no why`)
  }
})
