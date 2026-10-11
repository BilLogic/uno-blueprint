/**
 * Documented value sets, held to the constraints that define them.
 *
 * `check-blueprint-contract` probes IDENTIFIERS: a doc that names
 * `cells.links` fails when the column is gone. That catches a rename. It
 * cannot catch a claim about which VALUES a column accepts, which is the class
 * that cost the most in the 2026-09-01 audit — `scenarios.layout` taught as
 * `single/side-by-side/integrated` against a CHECK of `single|stacked`; the
 * `Planned:` / `Prototype:` convention taught eleven days after its deletion.
 * Neither is an identifier. Prose does not 400.
 *
 * WHAT A CLAIM IS. A sentence that lists values and says whose they are:
 *
 *   `kind` is exactly three values: `happy`, `variant`, `exception`.
 *   `paths.kind` is `happy | variant | exception`
 *   the `entity_status` domain: `proposed`, `planned`, …
 *   plus `kind` (`link` or `attachment`), `name`, `url`
 *
 * The LIST is a pipe span, or a run of code spans joined by commas, slashes,
 * `or`, `and`. The SCOPE is a column or domain the same sentence names OUTSIDE
 * the list — `kind` in the first example, not in "Table `paths`: `name`,
 * `kind`, `summary`", where it is a member and the run is a column list. A
 * parenthetical is its own sentence, scoped by the span before its bracket. A
 * bare column name resolves to every column so named; the claim holds if any
 * of them accepts exactly this set. A pipe span with no scope is still
 * unmistakably a value set, so it must equal SOME live set whenever it shares
 * a value with one — `loading | ready | error` is a state machine in a doc and
 * shares nothing; `stacked | merged | split` shares two values and is wrong.
 *
 * A markdown claim is EQUALITY: "the vocabulary is these six" is false the day
 * a seventh lands. A catalog comment is SUBSET: "staff/recipient/partner are
 * actors" glosses part of `stakeholders.kind` and is true. Comments carry no
 * backticks, so their lists are found by shape — bracketed, introduced by a
 * colon or a dash, slashed, piped, or `key = gloss` pairs — and a plain
 * comma run that shares no value with the column is English ("a shared step
 * axis, or merged into one grid"). Piped and glossed lists are held strictly:
 * `trigger = temporal; needs = functional` on a column that accepts
 * `leads_to | enables` is stale even though it shares nothing.
 *
 * A RETIRED VALUE is a finding in either medium: the rename map records
 * `scenarios.layout = 'single'` → `'stacked'`, and a list naming `single`
 * is stale whatever else it says. A sentence that records the retirement —
 * correction verb AND the migration that did it — is history, and the
 * exemption is no wider than that sentence.
 *
 * The retired values this holds: `scenarios.layout = 'side-by-side'` and
 * `scenarios.layout = 'integrated'` (folded into `stacked` by
 * 21000116000000); `scenarios.layout = 'single'` (into `stacked` by
 * 21000117000000); `paths.kind = 'unhappy'` and `paths.kind = 'alternative'`
 * (both into `variant` by 21000116000000); `resources.kind = 'other'` (into
 * `attachment` by 21000118000000). Each is a
 * value, so it has no identifier fragment and no copy word for the other
 * sweeps to key on. `cell_touchpoints.url` and `cell_touchpoints.screenshots`,
 * which 21000119000000 moved into `resources` as a featured link and
 * attachments, retire no fragment either: `url` is a live column on
 * `resources`, and "screenshots" is English wherever a render check takes
 * them.
 *
 * BOTH MEDIA KEY ON A MARK — the backtick, or a list's punctuation — and a
 * value is a value without one. `retiredValuesInCompany()` below is the half
 * that has no mark to key on, and it is scoped by COMPANY instead; its own
 * header says how, and why that is the only scope available to it.
 *
 * Pure: reads text and a catalog snapshot, touches nothing. Ported from the
 * instance, where the catalog is read live through `public.value_sets()`;
 * here it is read off `supabase/generated/portable-core.schema.sql`, the
 * dump of what the portable core builds, by `catalogFromSchema()` — so the
 * sweep runs in `npm test` with no database, on every pull request.
 */
import { RENAME_MAP } from './retired-vocabulary.mjs'
import { schemaInventory } from './check-instance-vocabulary.mjs'

/* ------------------------------------------------------------ the catalog */

/**
 * The values a CHECK or domain constraint accepts, or null when it is not a
 * value list. Postgres deparses `col in ('a','b')` as
 * `col = ANY (ARRAY['a'::text, 'b'::text])`; a hand-written `IN (...)` is
 * read too, for a definition captured before deparse.
 */
export function parseValueSet(definition) {
  const list =
    /= ANY \(ARRAY\[([^\]]*)\]\)/.exec(definition) ?? /\bIN \(([^)]*)\)/i.exec(definition)
  if (!list) return null
  const values = [...list[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"))
  return values.length > 0 ? values : null
}

/**
 * The live value sets, indexed three ways: by `table.column`, by domain name,
 * and by bare column name (every table's `kind` is a different set).
 *
 * `rows` is what `public.value_sets()` returns: `{ source, relation,
 * column_name, name, definition }`, one row per single-column CHECK, one per
 * domain, and one per column typed by a domain.
 */
export function catalogValueSets(rows) {
  const columns = new Map()
  const domains = new Map()
  for (const row of rows) {
    const values = parseValueSet(row.definition ?? '')
    if (!values) continue
    const label = row.source === 'domain' ? `domain ${row.name}` : `constraint ${row.name}`
    const set = domains.get(row.name) ?? { name: label, values: new Set(values) }
    if (row.source === 'domain') domains.set(row.name, set)
    if (row.relation && row.column_name) columns.set(`${row.relation}.${row.column_name}`, set)
  }
  const byColumn = new Map()
  for (const key of columns.keys()) {
    const column = key.split('.')[1]
    if (!byColumn.has(column)) byColumn.set(column, [])
    byColumn.get(column).push(key)
  }
  return { columns, domains, byColumn }
}

/**
 * The same index, read off the schema dump: every single-column CHECK and
 * domain `schemaInventory()` finds, in the shape `catalogValueSets()` builds.
 */
export function catalogFromSchema(dump) {
  const { values, typed } = schemaInventory(dump)
  const columns = new Map()
  const domains = new Map()
  for (const [key, set] of values) {
    if (key.startsWith('domain ')) domains.set(key.slice('domain '.length), { name: key, values: set })
  }
  for (const [key, set] of values) {
    if (key.startsWith('domain ')) continue
    // A column typed by a domain IS that domain's set — the live catalog
    // (`catalogValueSets`) hands back the same object for both, and so does this.
    const domain = domains.get(typed.get(key))
    if (domain) {
      columns.set(key, domain)
      continue
    }
    const [table, column] = key.split('.')
    columns.set(key, { name: `constraint ${table}_${column}_check`, values: set })
  }
  const byColumn = new Map()
  for (const key of columns.keys()) {
    const column = key.split('.')[1]
    if (!byColumn.has(column)) byColumn.set(column, [])
    byColumn.get(column).push(key)
  }
  return { columns, domains, byColumn }
}

/**
 * Retired VALUES from the rename map: rows whose `was` is
 * `table.column = 'value'`. Value → what replaced it and which migration.
 */
export function retiredValues(map = RENAME_MAP) {
  const VALUE_RENAME = /^([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*) = '([^']+)'$/
  const retired = new Map()
  for (const row of map) {
    // The PAIRS, not the two lists side by side. `row.is[index]` was the
    // reading #279 removed: it made `unhappy` retire for `exception` here, a
    // value the migration never moved a row to, and this map is what the
    // markdown sweep quotes back at an author. A map without `renames` — the
    // instance's, read over the wire by `check-instance-vocabulary` — still
    // falls back to position, which is all its shape can offer.
    const pairs =
      row.renames ?? row.was.map((from, index) => ({ from, to: row.is[index] ?? row.is[0] ?? null }))
    for (const pair of pairs) {
      const from = VALUE_RENAME.exec(pair.from)
      const to = VALUE_RENAME.exec(pair.to ?? '')
      if (!from || !to) continue
      retired.set(from[2], { column: from[1], is: to[2], migration: row.migrations[0] ?? null })
    }
  }
  return retired
}

/* --------------------------------------------------- the company it keeps */

/**
 * The forms of a table's name a sentence or a figure may use: the plural the
 * schema spells it with, the singular a reader writes, and either of those
 * with the underscores of a compound name written as spaces or hyphens —
 * "cell dependency" is what a paragraph calls `cell_dependencies`.
 */
const tableForms = (table) =>
  [table, table.replace(/ies$/, 'y').replace(/s$/, '')].map(
    (form) => new RegExp(`\\b${form.replace(/_/g, '[ _-]')}\\b`, 'i'),
  )

const UNIT_WORD = /[a-z][a-z0-9_-]*/g

/**
 * Retired values a unit of text offers as live, scoped by the company they keep.
 *
 * `valueSetFindings()` above reads a MARK: a code span in markdown, a list's
 * bracket or slash or pipe in a catalog comment. Neither mark is required to
 * teach a value. "Dead ends: exception/unhappy paths" wears no backticks, and
 * a figure that labels three boxes `Path · happy`, `Path · exception`,
 * `Path · unhappy` wears no punctuation at all — both name a path kind, and
 * one of the three is a kind the CHECK constraint refuses.
 *
 * WHY COMPANY AND NOT THE WORD. Of the eight values this map retires, seven
 * are ordinary English in this tree — `single`, `other`, `needs`, `trigger`,
 * `integrated`, `alternative`, `side-by-side`. A bare-word sweep for them over
 * the swept documents returns eleven hits of which two are defects; the guard
 * would be a list of exemptions on its first run. So the subject is narrowed
 * rather than the word list, which is the rule
 * `scripts/tests/retired-copy.test.mjs` states for the same hazard.
 *
 * TWO SIGNALS, BOTH REQUIRED, and each is about the value's OWN column:
 *
 *   NAMED   the unit names the table the value was retired from. "unhappy
 *           paths" is about `paths.kind`; "a single scenario" is not about
 *           `resources.kind`.
 *   BESIDE  the unit carries a value that column still accepts. `exception`
 *           beside `unhappy`, `happy` beside `unhappy` — a word standing in
 *           an enumeration of a column's values is being offered as one.
 *
 * Either alone is not enough and the measurement says so: `named` alone adds
 * nine sentences about database triggers, single scenarios and side-by-side
 * comparison; `beside` alone reads "a single source of truth … the stacked
 * column headers" as a layout claim. Together they returned three findings
 * across the swept documents and the figures, and all three were defects.
 *
 * NOTHING HERE COUNTS ANYTHING. The rule is per value, per column, per unit;
 * a value the map retires tomorrow is swept tomorrow without this function
 * changing, and this function has no idea how many sites exist today.
 *
 * WHAT IT CANNOT SEE, STATED RATHER THAN HIDDEN. A sentence that names a
 * table and one of its live values in ordinary English, and happens to use a
 * retired value as English too, is a false positive this rule cannot rule out
 * — "a scenario laid out side by side, stacked or merged" would be one. None
 * exists today; when one does, the fix is the sentence or a narrower unit,
 * never a shorter word list. And ANAPHORA is invisible to it: a paragraph
 * that establishes the column and then says the retired word two sentences
 * later keeps a scope this rule does not carry across the boundary.
 *
 * `unit` is one sentence of a document, or one whole figure — a diagram has
 * no sentences, and its `<text>` nodes are read together because they label
 * boxes drawn beside each other.
 */
export function retiredValuesInCompany(unit, catalog, retired = retiredValues()) {
  const words = new Set(unit.toLowerCase().match(UNIT_WORD) ?? [])
  const found = []
  for (const [value, { column, is, migration }] of retired) {
    if (!words.has(value)) continue
    const live = catalog.columns.get(column)
    // A column that still accepts the value has not retired it here. The map
    // is the instance's history as well as this template's, and a fold that
    // has not landed yet is not a stale word — the same rule `valueSetFindings`
    // applies to a scoped list.
    if (!live || live.values.has(value)) continue
    const named = tableForms(column.split('.')[0]).some((form) => form.test(unit))
    const beside = [...live.values].some((other) => other !== value && words.has(other))
    if (named && beside) found.push({ value, column, is, migration })
  }
  return found
}

/* ------------------------------------------------------------- sentences */

const CORRECTION_VERB =
  /\b(renamed|replaced|became|dropped|removed|retired|superseded|deleted|folded|moved|split into)\b/i
// `\`layers\` → \`lanes\`` is the rename statement itself, verb or no verb.
const CORRECTION_ARROW = /→|->/
// A version cited as a filename — `20260821220000_three_kinds_of_route.sql` —
// is still the migration; `_` is a word character and `\b` would refuse it.
// Fourteen digits: the instance stamps the wall clock (2026…), this template
// allocates from its reserved band (2100…).
const CORRECTION_PROOF = /(?<!\w)2[01][0-9]{12}(?![0-9])/

/**
 * A sentence may name a dead identifier or value when it is SAYING it is dead
 * — and it proves that twice: a correction verb AND the migration that did it.
 *
 * One signal is not enough, and the second signal has to be the migration
 * rather than merely another backticked name. A first attempt accepted any
 * other identifier as proof, which a sentence listing three retired spellings
 * satisfies without saying anything about any of them. Requiring the migration
 * also asks of the prose what this repo asks of itself everywhere else: a
 * rename claim cites the file that did it.
 */
export function isCorrection(sentence) {
  return (CORRECTION_VERB.test(sentence) || CORRECTION_ARROW.test(sentence)) && CORRECTION_PROOF.test(sentence)
}

/**
 * A rename table is a deliberate list of dead names — the one place an old
 * spelling belongs. Detected STRUCTURALLY, by a header row whose first cell is
 * `Was`, rather than by wording: both of the bot-facing docs carry one, only
 * one of them under a heading, and a heading-based rule would have missed the
 * other.
 */
export function renameTableState(line, inside) {
  if (/^\|\s*Was\s*\|/i.test(line)) return { skip: true, inside: true }
  if (inside && /^\s*\|/.test(line)) return { skip: true, inside: true }
  return { skip: false, inside: false }
}

/**
 * The lines of a document that belong to the section holding the rename
 * table: the `## ` heading above the `| Was | Is | Migration |` row, to the
 * next `## ` or the end. That section is the one place a retired word is at
 * home — its commentary explains why each name went, by naming it.
 */
export function renameSectionLines(lines) {
  const table = lines.findIndex((line) => /^\|\s*Was\s*\|\s*Is\s*\|/.test(line))
  if (table === -1) return new Set()
  let start = table
  while (start > 0 && !/^## /.test(lines[start])) start -= 1
  let end = table + 1
  while (end < lines.length && !/^## /.test(lines[end])) end += 1
  return new Set(Array.from({ length: end - start }, (_, i) => start + i))
}

const SENTENCE = /(?<=[.!?])\s+/

/**
 * The sentences of a text with the line each starts on. Fenced code is
 * blanked, rename-table rows are dropped, and a paragraph is joined before
 * it is split because Markdown reflows: a list that wraps is one sentence.
 */
export function sentencesOf(text) {
  const body = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
  const lines = body.split('\n')
  // The rename section is where a retired word is at home: its commentary
  // explains why each name went, by naming it. Found by structure, as
  // `a-doc-names` finds it.
  const history = renameSectionLines(lines)
  const sentences = []
  let inTable = false
  let start = 0
  while (start < lines.length) {
    let end = start
    while (end < lines.length && lines[end].trim() !== '') end += 1
    const block = lines.slice(start, end).map((line, offset) => {
      const state = renameTableState(line, inTable)
      inTable = state.inside
      return state.skip || history.has(start + offset) ? '' : line
    })
    // A table row is one statement whose cells are separated by borders,
    // not by list connectors: the row that cites a migration in its first
    // cell and records a rename in its third is one correction. So a row is
    // its own sentence, and a pipe becomes a semicolon, which no run crosses.
    const prose = []
    block.forEach((line, offset) => {
      if (/^\s*\|/.test(line)) {
        const cells = line.split('|').map((cell) => cell.trim()).filter((cell) => cell !== '')
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
          sentences.push({ text: cells.join(' ; '), line: start + offset + 1 })
        }
        prose.push('')
      } else prose.push(line)
    })
    const joined = prose.join('\n')
    let cursor = 0
    for (const sentence of joined.split(SENTENCE)) {
      const at = joined.indexOf(sentence, cursor)
      cursor = at + sentence.length
      if (sentence.trim() === '') continue
      const line = start + 1 + (joined.slice(0, at).match(/\n/g) ?? []).length
      sentences.push({ text: sentence.replaceAll('\n', ' '), line })
    }
    sentences.sort((a, b) => a.line - b.line)
    start = end + 1
  }
  return sentences
}

/** Innermost parentheticals out, each with the text that preceded its bracket. */
function splitParentheticals(sentence) {
  const inner = []
  let outer = sentence
  let match
  while ((match = /\(([^()]*)\)/.exec(outer))) {
    const before = outer.slice(0, match.index)
    inner.push({ text: match[1], before })
    outer = `${before} ${outer.slice(match.index + match[0].length)}`
  }
  return { outer, inner }
}

/* ----------------------------------------------------------------- lists */

const TOKEN = /^[a-z][a-z0-9_-]*$/
const QUALIFIED = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/
const PIPE_SPAN = /^[a-z][a-z0-9_-]*(?:\s*\|\s*[a-z][a-z0-9_-]*)+$/
const SPAN = /`([^`\n]+)`/g
// `` `single` | `stacked` `` — a pipe between spans is a list as much as one inside a span.
const CONNECTOR = /^\s*(?:,|\/|\||(?:,\s*)?(?:or|and))\s*$/

const ARROW = /→|->/
const PREDICATE = /^\s*(?:is|are|was|were|=|:|accepts?|takes?|allows?|in|one of)\b|^\s*[=:]/

/**
 * Lists and scope candidates of a markdown fragment. Code spans only; prose
 * is English. A span on either side of an arrow is half of a rename pair
 * (`label` → `name`) and neither a value nor a scope. A bare column name
 * scopes only when a predicate follows it — "`kind` is", "`kind`:", "`kind` ="
 * — because "`name`, `kind`, `summary`" is a column list and `kind` is a
 * member of it.
 */
function markdownLists(fragment) {
  const spans = [...fragment.matchAll(SPAN)].map((m) => ({
    text: m[1].trim(),
    start: m.index,
    end: m.index + m[0].length,
  }))
  spans.forEach((span, i) => {
    const next = spans[i + 1]
    if (next && ARROW.test(fragment.slice(span.end, next.start))) span.paired = next.paired = true
  })
  const lists = []
  let run = []
  const flush = () => {
    if (run.length >= 2) lists.push({ values: run.map((s) => s.text), strict: true, form: 'run', at: run[0].start })
    run = []
  }
  for (const span of spans) {
    if (span.paired) {
      flush()
      continue
    }
    if (PIPE_SPAN.test(span.text)) {
      flush()
      lists.push({ values: span.text.split(/\s*\|\s*/), strict: true, form: 'pipe', at: span.start })
      continue
    }
    if (!TOKEN.test(span.text)) {
      flush()
      continue
    }
    if (run.length > 0 && !CONNECTOR.test(fragment.slice(run.at(-1).end, span.start))) flush()
    run.push(span)
  }
  flush()
  // A scope PRECEDES its list — "`kind` is `a`, `b`", "`paths.kind` is
  // `a | b`" — so a qualified name trailing an enumeration of other things
  // ("`slices`, `slides`, `evidence`, … and `cell_dependencies.kind`") is
  // one more thing enumerated, not the subject of the list before it.
  const scopes = spans
    .filter((span) => !span.paired)
    .map((span) => ({ text: span.text, predicated: PREDICATE.test(fragment.slice(span.end)), at: span.start }))
  return { lists, scopes, tokens: spans.filter((s) => !s.paired).map((s) => s.text) }
}

const ITEM = '(?!(?:or|and|null)\\b)[a-z][a-z0-9_-]*'
const COMMENT_RUN = new RegExp(
  `(?<![\\w.-])${ITEM}(?:(?:,?\\s+(?:or|and)\\s+|\\s*(?:,|\\/|\\|)\\s*)${ITEM})+`,
  'gi',
)
const COMMENT_SPLIT = /,?\s+(?:or|and)\s+|\s*(?:,|\/|\|)\s*/i
const GLOSSED_KEY = /(?:^|[:;]\s*)([a-z][a-z0-9_-]*)\s*=\s*\S/gi
const COMMENT_WORD = /[A-Za-z][A-Za-z0-9_.-]*/g

/**
 * Lists of a catalog comment, found by shape. A bracket is a list when the
 * run is the whole of it — "(happy, unhappy, exception, alternative)", not
 * "(pill cells, storyboard rows, divider anchoring)". A colon or a dash
 * introduces a list that then runs to the end of its sentence. Slashes and
 * pipes are lists wherever they are; `key = gloss; key = gloss` is one too.
 * Anything else with commas in it is a sentence — "a shared step axis, or
 * merged into one grid" — and is read only for a retired value.
 */
function commentLists(fragment, { bracketed }) {
  const lists = []
  for (const m of fragment.matchAll(COMMENT_RUN)) {
    const text = m[0]
    const before = fragment.slice(0, m.index)
    const after = fragment.slice(m.index + text.length)
    const whole = /^\s*$/.test(before) && /^\s*[.;:]?\s*$/.test(after)
    const piped = text.includes('|')
    const introduced =
      (bracketed && whole) ||
      piped ||
      text.includes('/') ||
      (/[:—-]\s*$/.test(before) && /^\s*[.;]?\s*$/.test(after))
    lists.push({
      values: text.split(COMMENT_SPLIT).map((v) => v.toLowerCase()),
      strict: piped,
      form: piped ? 'pipe' : 'run',
      prose: !introduced,
      at: m.index,
    })
  }
  const keys = [...fragment.matchAll(GLOSSED_KEY)]
  if (keys.length >= 2) {
    lists.push({ values: keys.map((m) => m[1].toLowerCase()), strict: true, form: 'glossed', at: keys[0].index })
  }
  const words = [...fragment.matchAll(COMMENT_WORD)]
  const tokens = words.map((m) => m[0].toLowerCase().replace(/\.$/, ''))
  return {
    lists,
    scopes: words.map((m) => ({ text: m[0].toLowerCase().replace(/\.$/, ''), predicated: true, at: m.index })),
    tokens,
  }
}

/* ------------------------------------------------------------- resolving */

/**
 * The live sets a scope names: a qualified column, a domain, or — through a
 * predicate — every column so named.
 */
function setsNamedBy({ text: token, predicated, at = -1 }, catalog, host) {
  const qualified = QUALIFIED.exec(token)
  if (qualified) {
    const set = catalog.columns.get(token)
    return set ? [{ label: token, set, at }] : []
  }
  if (!TOKEN.test(token)) return []
  const domain = catalog.domains.get(token)
  if (domain) return [{ label: `domain ${token}`, set: domain, at }]
  if (!predicated) return []
  if (host?.relation) {
    const own = catalog.columns.get(`${host.relation}.${token}`)
    return own ? [{ label: `${host.relation}.${token}`, set: own, at }] : []
  }
  return (catalog.byColumn.get(token) ?? []).map((key) => ({ label: key, set: catalog.columns.get(key), at }))
}

/** What a comment is on, as sets: the column's own, or every constrained column of the table. */
function hostSets(host, catalog) {
  if (!host?.relation) return []
  if (host.column) {
    const set = catalog.columns.get(`${host.relation}.${host.column}`)
    return set ? [{ label: `${host.relation}.${host.column}`, set }] : []
  }
  return [...catalog.columns]
    .filter(([key]) => key.startsWith(`${host.relation}.`))
    .map(([key, set]) => ({ label: key, set }))
}

const show = (values) => `{${[...values].join(', ')}}`
const equalSets = (a, b) => a.size === b.size && [...a].every((v) => b.has(v))
const subset = (a, b) => [...a].every((v) => b.has(v))
const overlaps = (a, b) => [...a].some((v) => b.has(v))

/**
 * Every disagreement between a text's value-set claims and the catalog.
 *
 *   medium: 'markdown' — code spans are the tokens; a claim is equality
 *           'comment'  — plain words; a claim is subset; `host` is what the
 *                        comment is on: { relation, column | null }
 *
 * Returns strings that name the site, the claim and the set that refutes it.
 */
export function valueSetFindings({ text, source, medium, host = null }, catalog, retired = retiredValues()) {
  const findings = []
  const where = (line) => (medium === 'markdown' ? `${source}:${line}` : source)
  const listsOf = (fragment, bracketed) =>
    medium === 'markdown' ? markdownLists(fragment) : commentLists(fragment, { bracketed })

  for (const sentence of sentencesOf(text)) {
    if (isCorrection(sentence.text)) continue
    const { outer, inner } = splitParentheticals(sentence.text)
    const outerParsed = listsOf(outer, false)
    const outerRefs = outerParsed.scopes.flatMap((token) => setsNamedBy(token, catalog, host))

    const fragments = [
      { parsed: outerParsed, refs: outerRefs, tokens: outerParsed.tokens },
      ...inner.map(({ text: innerText, before }) => {
        const parsed = listsOf(innerText, true)
        const preceding =
          medium === 'markdown'
            ? /`([^`\n]+)`\s*$/.exec(before)?.[1]
            : /([A-Za-z][A-Za-z0-9_.-]*)\s*$/.exec(before)?.[1]?.toLowerCase()
        const scoped = preceding ? setsNamedBy({ text: preceding, predicated: true }, catalog, host) : []
        const own = parsed.scopes.flatMap((token) => setsNamedBy(token, catalog, host))
        // Inherited outer scope precedes everything inside the bracket.
        return {
          parsed,
          refs: scoped.length > 0 ? scoped : [...own, ...outerRefs.map((ref) => ({ ...ref, at: -1 }))],
          tokens: [...parsed.tokens, ...(preceding ? [preceding] : [])],
        }
      }),
    ]

    // A lone span is not a list, but `integrated` on its own is still a
    // value nothing accepts any more — an agent told to "confirm the
    // `integrated` grid renders" will look for one. Judged only when no
    // column accepts the word today — `single` was English until
    // 21000117000000 retired it, and a finding from then on.
    if (medium === 'markdown') {
      for (const { tokens } of fragments) {
        const lone = tokens.find((token) => {
          const gone = retired.get(token)
          return gone && ![...catalog.columns.values()].some((set) => set.values.has(token))
        })
        if (!lone) continue
        const { column, is, migration } = retired.get(lone)
        findings.push(
          `${where(sentence.line)} names \`${lone}\`, which \`${column}\` retired for ` +
            `\`${is}\` in ${migration ?? 'the rename map'}`,
        )
        break
      }
    }

    for (const { parsed, refs } of fragments) {
      for (const list of parsed.lists) {
        const values = new Set(list.values)
        // Scope is a name OUTSIDE the list: `kind` in "`kind` is `a`, `b`",
        // not in "`name`, `kind`, `summary`", where it is a member.
        let candidates = refs.filter(
          (ref) =>
            ref.at < list.at && !list.values.includes(ref.label.replace(/^domain /, '').split('.').at(-1)),
        )
        if (candidates.length === 0 && medium === 'comment') candidates = hostSets(host, catalog)
        // A retired value is stale in any list about its column. Without a
        // scope it is stale only if no column accepts it today: `custom` left
        // `paths.kind` and still lives on `slices.kind`, so `journey | … |
        // custom` is not about paths.
        const stale = list.values.find((v) => {
          const gone = retired.get(v)
          if (!gone) return false
          if (candidates.some((ref) => ref.set.values.has(v))) return false
          if (candidates.length > 0) return candidates.some((ref) => ref.label === gone.column)
          return ![...catalog.columns.values()].some((set) => set.values.has(v))
        })
        if (stale) {
          const { column, is, migration } = retired.get(stale)
          findings.push(
            `${where(sentence.line)} names \`${stale}\`, which \`${column}\` retired for ` +
              `\`${is}\` in ${migration ?? 'the rename map'}`,
          )
          continue
        }
        if (list.prose) continue
        if (candidates.length === 0) {
          if (list.form !== 'pipe') continue
          // An unscoped pipe span: whichever live set it touches, it must be.
          const all = [...new Set([...catalog.columns.values(), ...catalog.domains.values()])]
          const touched = all.filter((set) => overlaps(values, set.values))
          if (touched.length === 0 || touched.some((set) => equalSets(values, set.values))) continue
          findings.push(
            `${where(sentence.line)} lists ${show(values)}; no constraint accepts that set — ` +
              touched.map((set) => `${set.name} accepts ${show(set.values)}`).join('; '),
          )
          continue
        }
        const holds =
          medium === 'markdown'
            ? candidates.some((ref) => equalSets(values, ref.set.values))
            : list.strict
              ? candidates.some((ref) => subset(values, ref.set.values))
              : candidates.every((ref) => !overlaps(values, ref.set.values)) ||
                candidates.some((ref) => subset(values, ref.set.values))
        if (holds) continue
        const unique = [...new Map(candidates.map((ref) => [ref.label, ref])).values()]
        findings.push(
          `${where(sentence.line)} documents ${unique.map((ref) => `\`${ref.label}\``).join(' / ')} as ` +
            `${show(values)}; ` +
            unique.map((ref) => `${ref.set.name} accepts ${show(ref.set.values)}`).join('; '),
        )
      }
    }
  }
  return findings
}
