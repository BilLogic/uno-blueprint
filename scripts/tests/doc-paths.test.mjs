/**
 * The path sweep refuses a subject a FILTER emptied, not only one a listing
 * did.
 *
 * `trackedPaths` already refused an empty `git ls-files`, and that reads like
 * the whole guard until you follow what the loop actually sweeps: the listing
 * goes through `surfaceDocs`, and a filter that matches nothing empties the
 * subject exactly as completely as a listing that came back empty. The loop
 * runs zero times, no claim in any document is resolved, and the report says
 * `every path named by 0 packaged documents resolves` — a sentence that is
 * true, green, and about nothing. One renamed folder does it.
 *
 * And the subject the filter describes: the check was fenced to the four
 * plugin-surface folders, so `docs/` — the largest prose tree here — and the
 * root documents were resolved by nothing at all. Planted dangling paths in
 * `GLOSSARY.md` and `docs/engineering/checks.md` passed the whole suite.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import {
  ABSENT_BY_DESIGN,
  WORKSPACE_ARTIFACTS,
  isAbsentByDesign,
  isPackagedProse,
  resolves,
  staleAbsences,
  surfaceDocs,
} from '../check-doc-paths.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)

test('a listing with no packaged document in it is refused', () => {
  assert.throws(
    () => surfaceDocs(['CHANGELOG.md', 'docs/adr/0001-a.md', 'scripts/check-thing.mjs']),
    /no markdown at the root or under .*: this check has no subject/,
  )
})

test('the refusal names the folders it looked under', () => {
  assert.throws(() => surfaceDocs([]), /skills\/, references\/, agents\/, hooks\/, docs\//)
})

test('a listing that does carry the subject comes back, and only the markdown', () => {
  assert.deepEqual(
    surfaceDocs(['README.md', 'references/data-model.md', 'skills/map/SKILL.md', 'hooks/guard.py']),
    ['README.md', 'references/data-model.md', 'skills/map/SKILL.md'],
  )
})

test('docs/ and the root documents are in subject; history and the records are not', () => {
  // The fence used to stop at the plugin surface, and its own argument did
  // not: `docs/` is packed with this package and read out of it, so a path
  // named there resolves for every reader who will ever follow it.
  assert.equal(isPackagedProse('docs/engineering/checks.md'), true)
  assert.equal(isPackagedProse('docs/guidelines/documentation.md'), true)
  assert.equal(isPackagedProse('GLOSSARY.md'), true)
  assert.equal(isPackagedProse('AGENTS.md'), true)
  // A record of what shipped, and a record of what was decided. Both keep the
  // words of the day they were written.
  assert.equal(isPackagedProse('CHANGELOG.md'), false)
  assert.equal(isPackagedProse('docs/adr/0020-the-deployment-imports-the-template.md'), false)
  // Not prose at all.
  assert.equal(isPackagedProse('scripts/check-thing.mjs'), false)
})

test('a workspace artifact listed as a glob excuses the file the documents name', () => {
  // `blueprint/*.json` was listed and looked up by exact key, so the three
  // documents naming `blueprint/blueprint.json` failed against an exemption
  // written for them.
  assert.ok(WORKSPACE_ARTIFACTS.has('blueprint/*.json'))
  assert.equal(resolves('blueprint/blueprint.json', 'docs/guide', []), true)
  assert.equal(resolves('blueprint/blueprint.json.bak', 'docs/guide', []), false)
})

test('an absence by design excuses one document, and not the document next to it', () => {
  // The whole point of keying by both: `src/styles/tokens.css` is exempt in
  // the document that explains why it is gone, and stays a failure in
  // references/customization.md, which is where this check caught it.
  assert.equal(isAbsentByDesign('docs/engineering/checks.md', 'src/styles/tokens.css'), true)
  assert.equal(isAbsentByDesign('references/customization.md', 'src/styles/tokens.css'), false)
})

test('an absence nothing matches any more is itself a failure', () => {
  const list = [{ doc: 'docs/gone.md', token: 'x.ts', why: 'the document was deleted' }]
  assert.deepEqual(staleAbsences([], list), list)
  assert.deepEqual(staleAbsences([{ doc: 'docs/gone.md', token: 'x.ts' }], list), [])
})

test('every exemption in either list carries a reason worth reading', () => {
  for (const [token, why] of WORKSPACE_ARTIFACTS) {
    assert.ok(why && why.length > 20, `${token} is exempt with no reason`)
  }
  for (const entry of ABSENT_BY_DESIGN) {
    assert.ok(entry.why && entry.why.length > 20, `${entry.doc} — ${entry.token} states no why`)
  }
})

test('a claim is resolved against the listing it is handed, by segment-aligned suffix', () => {
  // How the documents actually write: `validate_ir.py`, not the whole path.
  // The listing is the whole universe here — the files are handed in, and the
  // walk that produces them is the sweep's, tested in the sweep's own suite.
  const tracked = ['hooks/listed_only_here.py', 'docs/guide/listed-only-here.md']
  assert.equal(resolves('listed_only_here.py', 'docs/engineering', tracked), true)
  assert.equal(resolves('guide/listed-only-here.md', 'docs', tracked), true)
  // A suffix that is not segment-aligned is not a path anybody can follow.
  assert.equal(resolves('nly-here.md', 'docs', tracked), false)
  // And nothing resolves against a listing that does not name it.
  assert.equal(resolves('listed_only_here.py', 'docs/engineering', []), false)
})

test('end-to-end smoke test: the check runs over this repository and names what it swept', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-doc-paths.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /every path named by \d+ packaged documents resolves/)
})
