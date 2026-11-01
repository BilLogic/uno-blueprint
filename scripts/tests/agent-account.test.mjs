/**
 * The agent account's renderers and ratchet, on fixtures and on the real
 * sources. `check:agent-account` needs the database; what it renders and
 * what it holds are decided here without one.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  classifyRelation,
  coverage,
  entityKinds,
  evaluate,
  handWritten,
  prohibitionCount,
  ratchetFailures,
  reconcile,
  renderSchema,
  renderVocabulary,
  schemaDeclaration,
  splice,
  tableColumns,
  vocabularySource,
} from '../agent-account.mjs'
import { credentials, resolveSignedIn } from '../generate-agent-account.mjs'
import { sweep } from '../sweep.mjs'

const ROOT = new URL('../..', import.meta.url).pathname
const app = sweep({ subject: 'app', root: ROOT })

/**
 * The two application sources this suite reads, out of wherever they are.
 *
 * `agent-account.mjs` itself already states this pair of roots — that is what
 * `vocabularySource` and `schemaDeclaration` are for, and the fixtures below
 * assert both branches of each. Its TEST was the half still spelling
 * `${ROOT}src/…`, so the thing that measured the two-root rule was the one
 * thing that only worked under one of them. The sweep of the `app` subject is
 * what answers "wherever they are" now: it lays a deployment's `src` over the
 * installed package's per path, and a file it cannot find is this suite's
 * subject gone, which is why the read below refuses null rather than returning
 * it. `docs/agents/blueprint.md` below stays a plain path: the account document
 * is the READING repository's, and a deployment renders its own.
 */
const readApp = (path) => {
  const text = app.read(path)
  assert.ok(text !== null, `no ${path} under ${app.base}: this test has no subject`)
  return text
}

test('the six entity kinds are read off panelTerms.ts as written', () => {
  const kinds = entityKinds(readApp('src/lib/panelTerms.ts'))
  assert.deepEqual(
    kinds.map((k) => k.kind),
    ['service', 'phase', 'scenario', 'path', 'step', 'lane'],
  )
  assert.equal(kinds[0].label, 'Service')
  assert.match(kinds[5].definition, /^A row of the board/)
})

test('every relation with a Row type is a column inventory', () => {
  const columns = tableColumns(readApp('src/types/database.ts'))
  assert.ok(columns.get('paths').includes('kind'))
  assert.ok(columns.get('evidence_counts'), 'views carry a Row too')
  assert.equal(columns.has('search_blueprint'), false, 'a function has no Row')
})

test('the vocabulary is one line per kind, definition verbatim', () => {
  const out = renderVocabulary([{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }])
  assert.equal(out, '**Lane** — One row of the board.')
})

const columns = new Map([
  ['paths', ['id', 'kind', 'status']],
  ['evidence', ['id', 'note']],
])
const comments = [
  { relation: 'paths', column_name: null, comment: 'One route through a scenario.' },
  { relation: 'paths', column_name: 'kind', comment: 'happy | variant | exception' },
  { relation: 'evidence', column_name: null, comment: 'Provenance rows.' },
]
const readable = new Set(['paths'])

test('the schema section lays comments over the inventory and keeps sealed relations visible', () => {
  const out = renderSchema({ columns, comments, readable })
  assert.match(out, /### `paths`\nOne route through a scenario\.\n\n1 of 3 columns described\./)
  assert.match(out, /\| `kind` \| happy \\\| variant \\\| exception \|/, 'a pipe in a comment is escaped in a cell')
  assert.match(out, /\| `status` \| — \|/, 'an undescribed column is a visible gap')
  assert.match(out, /### Not readable with the anon key[\s\S]*- `evidence` — Provenance rows\./)
})

test('coverage counts only relations an agent can read', () => {
  assert.deepEqual(coverage({ columns, comments, readable }), { described: 1, of: 3 })
})

test('a generated section is replaced between its markers and nothing else moves', () => {
  const doc = 'before\n\n<!-- generated:x from y -->\n\nold\n\n<!-- /generated:x -->\n\nafter\n'
  assert.equal(splice(doc, 'x', 'new'), 'before\n\n<!-- generated:x from y -->\n\nnew\n\n<!-- /generated:x -->\n\nafter\n')
  assert.throws(() => splice('no markers', 'x', 'new'), /no <!-- generated:x -->/)
})

test('a splice that cannot find its markers names the document it was handed', () => {
  // The message reaches a reader standing in whichever repository ran the
  // generator, so it quotes that repository's own spelling. The default is a
  // description rather than either one.
  assert.throws(
    () => splice('no markers', 'x', 'new', 'docs/whatever/this-tree-calls-it.md'),
    /^Error: docs\/whatever\/this-tree-calls-it\.md has no/,
  )
  assert.throws(() => splice('no markers', 'x', 'new'), /^Error: the agent-account document has no/)
})

test('every failure a reader is handed names their document, not one tree\u2019s spelling', () => {
  // The generator is byte-identical in two repositories and the two docs
  // trees agree on nothing, so a message that spelled either would be right
  // in one and send the other's reader nowhere. Same rule as the npm alias:
  // the command these failures prescribe is named by path.
  const kinds = [{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }]
  const sources = { columns, comments, readable }
  const paths = { document: 'docs/elsewhere/account.md', baseline: 'docs/elsewhere/baseline.json' }
  const { failures } = evaluate({ doc: MARKED, kinds, sources, baseline: null, check: true, paths })

  assert.ok(failures.length >= 2, 'a stale document and a missing baseline are both failures')
  for (const failure of failures) {
    assert.doesNotMatch(failure, /docs\/agents\/|docs\/engineering\//, failure)
    assert.doesNotMatch(failure, /npm run/, failure)
  }
  assert.ok(
    failures.some((one) => one.includes(paths.document)),
    'the stale-document failure names the document the reader has',
  )
  assert.ok(
    failures.some((one) => one.includes(paths.baseline)),
    'the missing-baseline failure names the baseline the reader has',
  )
})

test('the hand-written core excludes frontmatter and generated sections, and its prohibitions are counted', () => {
  const doc = '---\nsummary: never mind\n---\n\nDo this. <!-- generated:x -->\nnever that\n<!-- /generated:x -->\nDo not skip; the staff they do not see may never notice.'
  assert.equal(handWritten(doc).trim(), 'Do this. \nDo not skip; the staff they do not see may never notice.')
  // An instruction at the head of a sentence, not a description inside one.
  assert.equal(prohibitionCount(handWritten(doc)), 1)
})

test('the ratchet: coverage may only rise, prohibitions may only fall, and an unrecorded gain is stale', () => {
  const baseline = { columnComments: { described: 40, of: 100 }, prohibitions: 2 }
  assert.deepEqual(ratchetFailures({ columnComments: { described: 40, of: 100 }, prohibitions: 2 }, baseline), [])
  assert.match(ratchetFailures({ columnComments: { described: 40, of: 101 }, prohibitions: 2 }, baseline)[0], /coverage fell/)
  assert.match(ratchetFailures({ columnComments: { described: 40, of: 100 }, prohibitions: 3 }, baseline)[0], /3 prohibition/)
  assert.match(ratchetFailures({ columnComments: { described: 41, of: 100 }, prohibitions: 2 }, baseline)[0], /stale/)
  assert.match(ratchetFailures({ columnComments: { described: 40, of: 100 }, prohibitions: 1 }, baseline)[0], /stale/)
})

const MARKED = `---
summary: a fixture
---

hand.

<!-- generated:vocabulary from panelTerms.ts -->

old vocab

<!-- /generated:vocabulary -->

<!-- generated:schema from the catalog -->

old schema

<!-- /generated:schema -->
`

test('the check fails when the account is stale or column-comment coverage falls', () => {
  const kinds = [{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }]
  const sources = { columns, comments, readable }
  const matching = evaluate({
    doc: MARKED,
    kinds,
    sources,
    baseline: { columnComments: { described: 1, of: 3 }, prohibitions: 0 },
    check: false,
  })
  const held = evaluate({
    doc: matching.next,
    kinds,
    sources,
    baseline: { columnComments: { described: 1, of: 3 }, prohibitions: 0 },
    check: true,
  })
  assert.deepEqual(held.failures, [])

  const stale = evaluate({
    doc: MARKED,
    kinds,
    sources,
    baseline: { columnComments: { described: 1, of: 3 }, prohibitions: 0 },
    check: true,
  })
  assert.match(stale.failures[0], /is not what its sources render/)

  const fell = evaluate({
    doc: matching.next,
    kinds,
    sources,
    baseline: { columnComments: { described: 1, of: 2 }, prohibitions: 0 },
    check: true,
  })
  assert.match(fell.failures[0], /coverage fell/)
})

test('recording the baseline is not judged against the baseline it replaces', () => {
  const kinds = [{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }]
  const sources = { columns, comments, readable }
  const first = evaluate({ doc: MARKED, kinds, sources, baseline: null, check: false, record: true })
  assert.deepEqual(first.failures, [], 'the first record writes the baseline the missing-file failure asks for')

  const gained = { columnComments: { described: 0, of: 3 }, prohibitions: 0 }
  const rerecord = evaluate({ doc: MARKED, kinds, sources, baseline: gained, check: false, record: true })
  assert.deepEqual(rerecord.failures, [], 'a re-record after a gain is the fix the stale failure names')

  const unrecorded = evaluate({ doc: MARKED, kinds, sources, baseline: gained, check: false })
  assert.match(unrecorded.failures[0], /stale/)
  const missing = evaluate({ doc: MARKED, kinds, sources, baseline: null, check: false })
  assert.match(missing.failures[0], /does not exist/)
})

test('with no database configured, nothing is generated', () => {
  assert.equal(credentials({}), null)
  assert.equal(
    credentials({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'your-anon-key' }),
    null,
  )
  assert.deepEqual(
    credentials({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321/',
      VITE_SUPABASE_ANON_KEY: 'sb_anon_test_key',
    }),
    { url: 'http://127.0.0.1:54321', key: 'sb_anon_test_key' },
  )
})

test('the committed core has no prohibitions', () => {
  const doc = readFileSync(`${ROOT}docs/agents/blueprint.md`, 'utf8')
  assert.equal(prohibitionCount(handWritten(doc)), 0)
})

/* ------------------------------------------ where each source comes from */

test('the vocabulary follows the application, into the package when this tree has no src', () => {
  const vendored = vocabularySource('/repo', (p) => p === '/repo/src/lib/panelTerms.ts')
  assert.deepEqual(vendored, { path: '/repo/src/lib/panelTerms.ts', owner: 'repository' })

  const imported = vocabularySource('/repo', (p) => p.includes('node_modules'))
  assert.equal(imported.owner, 'package')
  assert.match(imported.path, /node_modules\/uno-blueprint\/src\/lib\/panelTerms\.ts$/)
})

test('the schema declaration is the deployment root first, and the package only as a default', () => {
  const own = schemaDeclaration('/repo', () => true)
  assert.deepEqual(own, { path: '/repo/deployment/types/database.ts', owner: 'deployment' })

  const vendored = schemaDeclaration('/repo', (p) => p === '/repo/src/types/database.ts')
  assert.equal(vendored.owner, 'repository')

  const fallback = schemaDeclaration('/repo', () => false)
  assert.equal(fallback.owner, 'package')
  assert.match(fallback.path, /node_modules\/uno-blueprint\/src\/types\/database\.ts$/)
})

/* ------------------------------------------ the database has the last word */

test('a relation is readable, sealed or simply not in this database', () => {
  assert.equal(classifyRelation({ status: 200, body: [] }), 'readable')
  assert.equal(classifyRelation({ status: 404, body: { code: 'PGRST205' } }), 'absent')
  assert.equal(classifyRelation({ status: 401, body: { code: '42501' } }), 'sealed')
  assert.equal(classifyRelation({ status: 403, body: { code: '42501' } }), 'sealed')
  assert.equal(classifyRelation({ status: 500, body: 'gateway' }), 'unknown')
})

// The measured case: a package declaration against a deployment's own
// database. The declaration names two relations this database does not have
// and one column it renamed; the database has three columns the declaration
// never heard of.
const DECLARED = new Map([
  ['cells', ['id', 'content']],
  ['stakeholders', ['id', 'name', 'part_of_id']],
  ['business_models', ['id', 'name']],
  ['schema_version', ['version']],
  ['service_account_emails', ['email']],
])
const PROBED = new Map([
  ['cells', { status: 'readable', columns: ['id', 'content', 'search_tsv'], order: 'table' }],
  ['stakeholders', { status: 'readable', columns: ['id', 'name', 'parent_id'], order: 'table' }],
  ['business_models', { status: 'sealed' }],
  ['schema_version', { status: 'absent' }],
  ['service_account_emails', { status: 'absent' }],
])
const LIVE_COMMENTS = [
  { relation: 'cells', column_name: null, comment: 'One moment on the board.' },
  { relation: 'cells', column_name: 'content', comment: 'The sentence of record.' },
  { relation: 'cells', column_name: 'origin', comment: 'Where the row came from.' },
  { relation: 'stakeholders', column_name: null, comment: 'Actors.' },
  { relation: 'business_models', column_name: null, comment: 'Commercial framing.' },
]

test('the account names only what this database confirmed, whatever the declaration says', () => {
  const { columns, readable, notes } = reconcile({
    declared: DECLARED,
    probed: PROBED,
    comments: LIVE_COMMENTS,
  })

  assert.equal(columns.has('schema_version'), false, 'a declared relation this database lacks is dropped')
  assert.equal(columns.has('service_account_emails'), false)
  assert.deepEqual(columns.get('cells'), ['id', 'content', 'search_tsv', 'origin'])
  assert.deepEqual(columns.get('stakeholders'), ['id', 'name', 'parent_id'], 'the renamed column goes')
  assert.deepEqual(columns.get('business_models'), [], 'a sealed relation keeps its name and no columns')
  assert.deepEqual([...readable], ['cells', 'stakeholders'])

  assert.ok(notes.some((n) => /schema_version/.test(n) && /service_account_emails/.test(n)))
  assert.ok(notes.some((n) => /stakeholders\.part_of_id/.test(n)))
  assert.ok(notes.some((n) => /cells\.search_tsv/.test(n)))
})

test('a relation that gave no row renders in one order, whoever asked the questions', () => {
  const asked = (columns) =>
    reconcile({
      declared: new Map([['slide_images', columns]]),
      probed: new Map([['slide_images', { status: 'readable', columns }]]),
      comments: [{ relation: 'slide_images', column_name: 'position', comment: 'The order.' }],
    }).columns.get('slide_images')

  assert.deepEqual(asked(['id', 'slide_id', 'position']), ['id', 'position', 'slide_id'])
  assert.deepEqual(asked(['position', 'id', 'slide_id']), ['id', 'position', 'slide_id'])
})

test('a deployment whose schema differs holds a true account and passes its own check', () => {
  const kinds = [{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }]
  const sources = reconcile({ declared: DECLARED, probed: PROBED, comments: LIVE_COMMENTS })
  const live = { ...sources, comments: LIVE_COMMENTS }

  const rendered = evaluate({ doc: MARKED, kinds, sources: live, baseline: null, check: false, record: true }).next
  assert.match(rendered, /### `cells`[\s\S]*\| `search_tsv` \| — \|/)
  assert.doesNotMatch(rendered, /`schema_version`/)
  assert.doesNotMatch(rendered, /`part_of_id`/)
  assert.match(rendered, /### Not readable with the anon key[\s\S]*- `business_models` — Commercial framing\./)

  const baseline = { columnComments: coverage(live), prohibitions: prohibitionCount(handWritten(rendered)) }
  const held = evaluate({ doc: rendered, kinds, sources: live, baseline, check: true })
  assert.deepEqual(held.failures, [], 'a true account of a differing schema is green')
})

test('an account that has gone stale against its own database fails', () => {
  const kinds = [{ kind: 'lane', label: 'Lane', definition: 'One row of the board.' }]
  const before = reconcile({ declared: DECLARED, probed: PROBED, comments: LIVE_COMMENTS })
  const beforeSources = { ...before, comments: LIVE_COMMENTS }
  const rendered = evaluate({ doc: MARKED, kinds, sources: beforeSources, baseline: null, check: false, record: true }).next
  const baseline = {
    columnComments: coverage(beforeSources),
    prohibitions: prohibitionCount(handWritten(rendered)),
  }

  // The deployment's own migration adds a column. The document does not move.
  const after = reconcile({
    declared: DECLARED,
    probed: new Map([
      ...PROBED,
      ['cells', { status: 'readable', columns: ['id', 'content', 'search_tsv', 'status'], order: 'table' }],
    ]),
    comments: LIVE_COMMENTS,
  })
  const stale = evaluate({
    doc: rendered,
    kinds,
    sources: { ...after, comments: LIVE_COMMENTS },
    baseline,
    check: true,
  })
  assert.match(stale.failures[0], /is not what its sources render/)
  assert.match(stale.failures[0], /toward the database/)
})

/* ------------------------------------------ what a signed-in reader reads */

// A relation the anon key is refused and a signed-in session reads. The probe
// can only say "sealed"; the columns come from whatever the running repository
// hands in — in a deployment, its own migration series.
const SIGNED_IN = new Map([['evidence', ['id', 'cell_id', 'excerpt']]])
const SIGNED_IN_PROBED = new Map([
  ['cells', { status: 'readable', columns: ['id', 'content'], order: 'table' }],
  ['evidence', { status: 'sealed' }],
  ['business_models', { status: 'sealed' }],
])
const SIGNED_IN_COMMENTS = [
  { relation: 'cells', column_name: 'content', comment: 'The sentence of record.' },
  { relation: 'evidence', column_name: null, comment: 'Provenance rows.' },
  { relation: 'evidence', column_name: 'excerpt', comment: 'The quoted passage.' },
  { relation: 'evidence', column_name: 'source_label', comment: 'Where the passage came from.' },
  { relation: 'business_models', column_name: null, comment: 'Commercial framing.' },
]

test('a signed-in-only relation keeps its columns, in the order its source gave them', () => {
  const { columns, readable, signedIn } = reconcile({
    declared: new Map([['evidence', ['id', 'excerpt', 'retired_column']]]),
    probed: SIGNED_IN_PROBED,
    comments: SIGNED_IN_COMMENTS,
    signedInColumns: SIGNED_IN,
  })
  assert.deepEqual(columns.get('evidence'), ['id', 'cell_id', 'excerpt', 'source_label'], 'a commented column is confirmed too')
  assert.deepEqual([...signedIn], ['evidence'])
  assert.equal(readable.has('evidence'), false, 'the anon key still cannot read it')
  assert.deepEqual(columns.get('business_models'), [], 'a sealed relation no source describes stays a name')
})

test('the signed-in source does not outrank the database', () => {
  const { columns, readable, signedIn, notes } = reconcile({
    declared: new Map(),
    probed: new Map([
      ['evidence', { status: 'readable', columns: ['id', 'excerpt'], order: 'table' }],
      ['trash', { status: 'absent' }],
    ]),
    comments: [],
    signedInColumns: new Map([
      ['evidence', ['id', 'excerpt']],
      ['trash', ['id']],
    ]),
  })
  assert.ok(readable.has('evidence'), 'an anon read is the truth, whatever the source said')
  assert.equal(signedIn.size, 0)
  assert.equal(columns.has('trash'), false, 'a relation this database lacks is not rendered')
  assert.ok(notes.some((n) => /anon key reads/.test(n) && /evidence/.test(n)))
  assert.ok(notes.some((n) => /^named signed-in only but not in this database/.test(n) && /trash/.test(n)))
})

test('a signed-in-only relation renders in full, marked, and counts toward coverage', () => {
  const sources = { ...reconcile({ declared: new Map(), probed: SIGNED_IN_PROBED, comments: SIGNED_IN_COMMENTS, signedInColumns: SIGNED_IN }), comments: SIGNED_IN_COMMENTS }
  const out = renderSchema(sources)
  assert.match(out, /### `evidence`\nProvenance rows\.\n\nSigned-in only: a signed-in session reads it and the anon key is refused\.\n\n2 of 4 columns described\./)
  assert.match(out, /\| `excerpt` \| The quoted passage\. \|/)
  assert.match(out, /### Not readable with the anon key[\s\S]*- `business_models` — Commercial framing\./)
  assert.doesNotMatch(out, /- `evidence` —/, 'a described relation is not also listed as a bare name')
  assert.doesNotMatch(out, /### `cells`\n[^\n]*\n\nSigned-in only/, 'an anon-readable relation carries no mark')
  assert.deepEqual(coverage(sources), { described: 3, of: 6 })
})

test('with no signed-in source the account is what it always was', () => {
  const without = reconcile({ declared: new Map(), probed: SIGNED_IN_PROBED, comments: SIGNED_IN_COMMENTS })
  assert.equal(without.signedIn.size, 0)
  assert.deepEqual(without.columns.get('evidence'), [])
})

test('the signed-in source is the running repository\'s, and a malformed one refuses the run', async () => {
  assert.deepEqual(await resolveSignedIn(null, new Map()), new Map())
  const declared = new Map([['evidence', ['id']]])
  const seen = []
  const answer = await resolveSignedIn(
    async (input) => {
      seen.push(input)
      return new Map([['evidence', ['id', 'excerpt']]])
    },
    declared,
    '/repo',
  )
  assert.deepEqual(answer, new Map([['evidence', ['id', 'excerpt']]]))
  assert.deepEqual(seen, [{ root: '/repo', declared }])
  await assert.rejects(() => resolveSignedIn(['evidence'], declared), /neither null nor a function/)
  await assert.rejects(() => resolveSignedIn(undefined, declared), /neither null nor a function/, 'the field is required')
  await assert.rejects(() => resolveSignedIn(() => ({ evidence: ['id'] }), declared), /must answer a Map/)
})

test('the signed-in source is compared with the declaration in its own words, and an empty answer stays a name', () => {
  const { columns, signedIn, notes } = reconcile({
    declared: new Map([['evidence', ['id', 'retired_column']]]),
    probed: new Map([
      ['evidence', { status: 'sealed' }],
      ['trash', { status: 'sealed' }],
    ]),
    comments: [],
    signedInColumns: new Map([
      ['evidence', ['id', 'excerpt']],
      ['trash', []],
    ]),
  })
  assert.ok(notes.some((n) => /^declared columns the signed-in source does not name: evidence\.retired_column$/.test(n)))
  assert.ok(notes.some((n) => /^columns the signed-in source names that the declaration does not: evidence\.excerpt$/.test(n)))
  assert.equal(notes.some((n) => /this database/.test(n)), false, 'the database was never asked about these columns')
  assert.deepEqual(columns.get('trash'), [])
  assert.deepEqual([...signedIn], ['evidence'])
})
