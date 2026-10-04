/**
 * #89 — the word a panel puts in front of a reader, and the name behind it.
 *
 * Raised by Bill: *"how come we have inconsistent naming from front and
 * backend again (i.e., resources vs. links)?"* The complaint was never that
 * the words differ. This repository already records divergences it means — the
 * "words that keep a retired spelling" section in the header of
 * `scripts/check-retired-identifiers.mjs` names four words that survive a
 * rename sweep and says, for each, why it is right where it stands. Those are
 * decisions, and they are written down. The defect is that **no document
 * mapped interface words to column names**, so a reader could not tell a
 * decision from an accident: the rename map covers schema→schema only.
 *
 * So `LABEL_COLUMNS` — `scripts/interface-schema-map.mjs`, re-exported below —
 * is the enforced half of that map: every word a panel puts in front of a
 * reader, the schema name behind it, and a reason wherever the two differ. The
 * half a person reads is `references/interface-schema-map.md`, RENDERED from
 * this one since #137 rather than hand-kept beside it, so the two cannot
 * disagree about what the map says. What can still disagree is the rendering,
 * which is what the last pair of tests in this file watches.
 *
 * TWO RULES MAKE IT NON-VACUOUS, and each is a way the map could rot:
 *
 *   3. Every row names something the schema has. A label cannot be "fixed"
 *      by pointing it at a second word that is also not there.
 *   4. A divergent row carries a reason and an aligned row does not. The
 *      first half is the issue's ask — "a reason, or a rename". The second
 *      half is what keeps the reason column worth reading: a decision
 *      recorded about a row that never diverged is decoration, and
 *      decoration is what a reader learns to skip — taking the real ones
 *      with it.
 *
 * Each is proved to go red, in the shape `scripts/tests/retired-copy.test.mjs`
 * argues for: a planted fixture the rule must flag, next to a neighbour it
 * must leave alone.
 *
 * RULES 1 AND 2 ARE GONE, and they kept their numbers on the way out because
 * the two that remain are cited by number elsewhere. They scanned the app's
 * `.tsx` for label props — rule 1 held every scanned label to a row of the
 * map, rule 2 held every row to a label some panel still said — and the scan
 * was the only thing that knew what words the cell panel says. It no longer
 * does: since #696 the cell panel's labels and hints are the CELL FIELD
 * DESCRIPTORS in `src/lib/cellFields.ts`, read out of `EDITABLE_CELL_FIELDS`
 * rather than spelled into JSX, and the map's cell rows are read from those
 * same descriptors by `scripts/interface-schema-map.mjs`. So a scan of the
 * panels would find a `{field.label}` expression where the word used to be,
 * and the defect it was built to catch — a label nobody bound to a name —
 * cannot arise for a cell field at all: the descriptor that carries the word
 * IS the binding, and its key is typed against the generated `cells` row. A
 * rule nobody can fail is a rule nobody reads, so both are deleted rather
 * than narrowed. What is left holds the map to the schema it names and to the
 * reasons it records.
 *
 * TWO LABELS ARE RENAMED HERE RATHER THAN REASONED ABOUT, which is the other
 * half of the ask — "a reason, or a rename". The panel said **Text** where the
 * column is `cells.content` and **Value** where it is `cells.value_props`;
 * both columns were already right while the words above them were not.
 *
 * THE THIRD CASE WAS NOT A NAMING PROBLEM AT ALL, and it is no longer a
 * divergence. `cells.links` carried two interface concepts — the tab's `url`
 * entries and the grid's `tech_description` prose — so no label could be its
 * name without lying about half its rows, and the `Resources` row recorded
 * that as a decision while the schema change waited. 21000113000000 made the
 * change: the column is two tables, `Resources` names `resources`, and the row
 * that carried the reason is gone rather than rewritten. What is left is an
 * aligned row like `Evidence`, which is what rule 4 requires of a label that
 * says its own name — a reason kept past the divergence it explained is the
 * decoration this map refuses.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LABEL_COLUMNS } from '../interface-schema-map.mjs'
import { parseGeneratedTypes } from '../check-schema-inventory.mjs'
import { sweep } from '../sweep.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const app = sweep({ subject: 'app', root: ROOT })

/** An application file, wherever it sits; its absence is this test's subject gone. */
const readApp = (path) => {
  const text = app.read(path)
  assert.ok(text !== null, `no ${path} under ${app.base}: this test has no subject`)
  return text
}

const RERUN = 'npm test -- scripts/tests/labels-name-their-columns.test.mjs'
/** Where the map itself lives, since #137 — a row's failure names its row. */
const MAP_FILE = 'scripts/interface-schema-map.mjs'
const MAP_SOURCE = readFileSync(resolve(ROOT, MAP_FILE), 'utf8')

function sourceLine(code, index) {
  return code.slice(0, Math.max(0, index)).split('\n').length
}

function mapRowLocation(label) {
  const index = MAP_SOURCE.indexOf(`label: '${label}'`)
  return `${MAP_FILE}:${sourceLine(MAP_SOURCE, index)}`
}

export function guardFailure(location, message) {
  return `${location}: ${message}\nRun: ${RERUN}`
}

test('guard diagnostics name a source line and the focused rerun command', () => {
  assert.equal(
    guardFailure(`${MAP_FILE}:7`, 'A row names nothing.'),
    `${MAP_FILE}:7: A row names nothing.\nRun: ${RERUN}`,
  )
})

/* --------------------------------------------------------------- the map */

/**
 * The map itself is `scripts/interface-schema-map.mjs`, re-exported here so
 * the two rules below and their fixtures read the way they always have.
 *
 * It moved out of this file in #137, for the reason the document it renders
 * gives: the half a person reads is now generated from the half CI acts on,
 * and a generator cannot import a test file without running its tests.
 */
export { LABEL_COLUMNS }

/**
 * A word reduced to what a comparison can see: lower case, and every run of
 * anything else read as one underscore. "Perceived owner" and
 * `perceived_owner` are the same word written for two audiences.
 */
const canonical = (word) =>
  String(word)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/**
 * The word a schema name puts in front of a reader: the last dotted segment,
 * with a foreign key's `_id` dropped. A column holding a stakeholder is
 * `stakeholder_id`, and a panel is right to say Stakeholder.
 */
const schemaWord = (name) => canonical(name.split('.').pop().replace(/_id$/, ''))

/**
 * True when a label and a schema name are the same word.
 *
 * Singular and plural count as agreement, and they have to: the label over a
 * relation is the thing, the table is the collection, and neither is wrong.
 * Anything further apart than an `s` is a divergence that owes a reason.
 */
export function aligns(label, name) {
  const said = canonical(label)
  const stored = schemaWord(name)
  return said === stored || `${said}s` === stored || said === `${stored}s`
}

/** The names a row's label does not say. Empty means the row is aligned. */
export function divergentNames(row) {
  return row.names.filter((name) => !aligns(row.label, name))
}

/* ------------------------------- rule 3: every row names something real */

/**
 * The schema, read where this package can read it without a database.
 *
 * `src/types/database.ts` is generated FROM a built database by the Supabase
 * CLI and the whole app compiles against it, and
 * `scripts/check-schema-inventory.mjs` holds it to a freshly built schema in
 * CI. So the types are the schema here, and this file reuses that script's
 * parser rather than growing a second reader of the same file.
 */
const SCHEMA = parseGeneratedTypes(readApp('src/types/database.ts'))

/** Schema names the map claims, that the schema does not have. */
export function namesThatDoNotExist(schema, map = LABEL_COLUMNS) {
  return map.flatMap((row) =>
    row.names.flatMap((name) => {
      const [table, column] = name.split('.')
      const relation = schema.get(table)
      if (!relation) return [`${name} — there is no ${table}, so "${row.label}" names nothing`]
      if (column === undefined) return []
      if (!relation.has(column)) {
        return [`${name} — ${table} has no ${column}, so "${row.label}" names nothing`]
      }
      return []
    }),
  )
}

test('every row of the map names something the schema has', () => {
  assert.ok(
    SCHEMA.size > 10,
    guardFailure(
      'src/types/database.ts:1',
      `only ${SCHEMA.size} tables parsed — the generated-schema reader is wrong`,
    ),
  )
  assert.deepEqual(
    namesThatDoNotExist(SCHEMA),
    [],
    guardFailure(
      mapRowLocation(/"([^"]+)"/.exec(namesThatDoNotExist(SCHEMA)[0] ?? '')?.[1] ?? 'Content'),
      'A label is bound to a name the schema does not have. A map that points at a ' +
        'second missing word is the defect restated, not the fix for it.',
    ),
  )
})

test('the existence check goes red on a schema missing them', () => {
  const every = LABEL_COLUMNS.flatMap((row) => row.names)
  assert.equal(namesThatDoNotExist(new Map()).length, every.length)

  // And one name at a time, which is the shape a half-done rename takes: the
  // table survives, the column under it does not.
  const partial = new Map()
  for (const name of every) {
    const [table, column] = name.split('.')
    if (!partial.has(table)) partial.set(table, new Set())
    if (column) partial.get(table).add(column)
  }
  assert.deepEqual(namesThatDoNotExist(partial), [])
  partial.get('cells').delete('value_props')
  assert.deepEqual(namesThatDoNotExist(partial), [
    'cells.value_props — cells has no value_props, so "Value proposition" names nothing',
  ])
})

/* --------------------- rule 4: a divergence is a decision, and nothing else */

/** Rows whose label is not its name, with no reason recorded. */
export function divergencesWithoutReason(map = LABEL_COLUMNS) {
  return map
    .filter((row) => divergentNames(row).length > 0 && row.because.trim().length < 40)
    .map((row) => `${row.label} → ${divergentNames(row).join(', ')}`)
}

/** Rows that agree with the schema and carry a reason anyway. */
export function reasonsWithoutDivergence(map = LABEL_COLUMNS) {
  return map
    .filter((row) => divergentNames(row).length === 0 && row.because.trim().length > 0)
    .map((row) => row.label)
}

test('every divergence is a decision somebody wrote down', () => {
  const found = divergencesWithoutReason()
  assert.deepEqual(
    found,
    [],
    guardFailure(
      mapRowLocation(found[0]?.split(' → ')[0] ?? 'Content'),
      `A label differs from its name with no reason a stranger can evaluate: ${found.join('; ')}. ` +
        "The sweep's retired-spelling entries are the shape: a word that stands where " +
        'it is, and the sentence saying why. That is what every divergence needs — a ' +
        'reason, or a rename.',
    ),
  )
})

test('no row that agrees with the schema carries a reason anyway', () => {
  const found = reasonsWithoutDivergence()
  assert.deepEqual(
    found,
    [],
    guardFailure(
      mapRowLocation(found[0] ?? 'Content'),
      `A reason recorded about a label that never diverged: ${found.join(', ')}. It reads ` +
        'as a decision and settles nothing, and a reason column with decoration in it is ' +
        'a column readers learn to skip — which is how the real ones would get skipped ' +
        'with it.',
    ),
  )
})

test('both halves of the reason rule go red', () => {
  assert.deepEqual(
    divergencesWithoutReason([
      { label: 'Resources', names: ['cells.content'], because: '' },
      { label: 'Blurb', names: ['cells.summary'], because: 'too short to evaluate' },
      { label: 'Summary', names: ['cells.summary'], because: '' },
      {
        label: 'Needs',
        names: ['cell_dependencies.kind'],
        because: 'It names the value the kind holds, not the name of the place holding it.',
      },
    ]),
    ['Resources → cells.content', 'Blurb → cells.summary'],
  )
  assert.deepEqual(
    reasonsWithoutDivergence([
      { label: 'Summary', names: ['cells.summary'], because: 'Because somebody felt like it.' },
      { label: 'Content', names: ['cells.content'], because: '' },
    ]),
    ['Summary'],
  )
})

test('a row is divergent when ANY of its names disagrees', () => {
  // The failure this forbids: a shared word riding into the map on the one
  // name where it happens to match.
  assert.deepEqual(
    divergentNames({ label: 'Summary', names: ['cells.summary', 'cells.content'], because: '' }),
    ['cells.content'],
  )
  assert.deepEqual(divergentNames({ label: 'Evidence', names: ['evidence'], because: '' }), [])
  assert.deepEqual(
    divergentNames({ label: 'Perceived owner', names: ['cells.perceived_owner'], because: '' }),
    [],
  )
})

/* ------------------------------------------- and the map a person reads */

/**
 * The document the map renders into.
 *
 * It was a section of `CONTEXT.md` until #137 and a hand-kept twin of
 * `LABEL_COLUMNS`; it is now `references/interface-schema-map.md`, and
 * GENERATED from `LABEL_COLUMNS` by
 * `scripts/generate-interface-schema-map.mjs`. That changes what this pair of
 * tests is for rather than retiring it. The generator's own `--check` catches
 * a document that stopped matching its source; what this catches is a
 * RENDERING that stopped saying what the source says — a label emitted without
 * its reason, a name lost out of a multi-name row — which `--check` cannot
 * see, because `--check` compares the document to the same render.
 */
const DOCUMENT_FILE = 'references/interface-schema-map.md'
const DOCUMENT = readFileSync(resolve(ROOT, DOCUMENT_FILE), 'utf8')

/** The `| … | … | … |` rows of the binding table, parsed back into rows. */
export function documentedRows(document = DOCUMENT) {
  const section = /<!-- generated:binding[^>]*-->([\s\S]*?)<!-- \/generated:binding -->/.exec(document)
  assert.ok(
    section,
    guardFailure(
      `${DOCUMENT_FILE}:1`,
      `${DOCUMENT_FILE} has no <!-- generated:binding --> section any more`,
    ),
  )
  return section[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length === 3 && !/^-+$/.test(cells[0].replace(/[\s:]/g, '')))
    .filter((cells) => !/^the interface says$/i.test(cells[0].replace(/\*/g, '')))
    .map((cells) => ({
      label: cells[0].replace(/\*/g, '').trim(),
      names: [...cells[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]),
      because: cells[2] === '—' ? '' : cells[2],
    }))
}

test('a missing rendered map names its file, line, and focused rerun', () => {
  assert.throws(
    () => documentedRows('# A reference without the generated table'),
    new RegExp(
      guardFailure(
        `${DOCUMENT_FILE}:1`,
        `${DOCUMENT_FILE} has no <!-- generated:binding --> section any more`,
      ).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ),
  )
})

test('the rendered map still says what LABEL_COLUMNS says', () => {
  const enforced = LABEL_COLUMNS.map((row) => ({
    label: row.label,
    names: [...row.names],
    because: row.because,
  }))
  assert.deepEqual(
    enforced,
    documentedRows(),
    guardFailure(
      `${DOCUMENT_FILE}:${sourceLine(DOCUMENT, DOCUMENT.indexOf('<!-- generated:binding'))}`,
      `${DOCUMENT_FILE} and LABEL_COLUMNS disagree. If the map moved, run ` +
        '`npm run interface-map`; if the RENDERING lost something on the way — a reason, ' +
        'one name of a multi-name row — fix renderBinding, because the document is what a ' +
        'person reads to learn the vocabulary.',
    ),
  )
})

test('the parity check goes red on a table that has drifted', () => {
  const drifted = [
    '<!-- generated:binding -->',
    '',
    '| The interface says | The schema says | Why they differ |',
    '|---|---|---|',
    '| **Content** | `cells.content` | — |',
    '',
    '<!-- /generated:binding -->',
  ].join('\n')
  assert.deepEqual(documentedRows(drifted), [
    { label: 'Content', names: ['cells.content'], because: '' },
  ])
  assert.notEqual(documentedRows(drifted).length, LABEL_COLUMNS.length)

  // A reason dropped from the rendered half is a drift too, and the least
  // visible one: the table still has every row, and one of them has quietly
  // stopped explaining itself.
  const reasonless = drifted.replace(
    '| **Content** | `cells.content` | — |',
    '| **Resources** | `cells.content` | — |',
  )
  assert.deepEqual(documentedRows(reasonless), [
    { label: 'Resources', names: ['cells.content'], because: '' },
  ])
})

/* ------------------------------------------------ the figures that draw them */

/*
 * A figure that draws the cell panel draws its labels, and a repository that
 * reads the figures out of the installed package sweeps those labels by one
 * marker: `<text class="uiLabel">`, the class alone. A redraw that styles them
 * as plain `.label` leaves that sweep with nothing to read and a retired label
 * free to reach the cover, so the marker is held here, where the figures are
 * drawn: every marked label is one the map names, and the cell figure marks
 * the same labels in both of its files.
 */
const UI_LABEL = /<text\b[^>]*class="uiLabel"[^>]*>([\s\S]*?)<\/text>/g

function figureUiLabels(name) {
  const code = readFileSync(resolve(ROOT, 'docs/assets', name), 'utf8')
  return [...code.matchAll(UI_LABEL)].map((match) =>
    match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  )
}

test('the cell figure marks the panel labels it draws, in both themes', () => {
  const light = figureUiLabels('cell-anatomy.svg')
  assert.ok(
    light.length >= 5,
    `docs/assets/cell-anatomy.svg marks ${light.length} labels with class="uiLabel"; ` +
      'mark each panel label it draws (docs/guidelines/composition/cover-page.md § Art direction)',
  )
  assert.deepEqual(figureUiLabels('cell-anatomy.dark.svg'), light)
  const named = new Set(documentedRows().map((row) => row.label))
  assert.deepEqual(
    light.filter((label) => !named.has(label)),
    [],
    'a label the cell figure marks is one references/interface-schema-map.md does not name',
  )
})
