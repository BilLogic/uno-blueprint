#!/usr/bin/env node
/**
 * The dependency vocabulary the documents teach, against the one the database
 * enforces.
 *
 * The two `cell_dependencies.kind` values are `leads_to` and `enables` since
 * 21000114000000. Before that the docs and the column disagreed for weeks —
 * the normative reference taught words the CHECK constraint refused, and an
 * agent that trusted it wrote a call that could not land. This file is the
 * check that keeps the two from drifting again, in either direction.
 *
 * So two assertions, the shape the read-surface check had before the adapter's
 * rows were rendered from the roster:
 *
 *   1. THE ENUM. `references/data-model.md`'s Enums section states the values;
 *      the schema's CHECK constraint states the values; they must be the same
 *      set, in both directions.
 *
 *   2. THE RETIRED SPELLING. The words the column no longer accepts —
 *      `trigger` and `needs`, see `RETIRED` — may not appear as code spans in
 *      any document an agent or a reader follows: the references, the skills,
 *      the agents, and the guides. Prose is left alone (a database trigger is
 *      a legitimate subject; "a slice needs a cell" is English), which is why
 *      the subject is the code span and not the word.
 *
 *   3. THE RETIRED SPELLING, UNQUOTED. A code span is not the only way to
 *      name a kind. "trigger-vs-needs semantics" and "Walks trigger/needs
 *      edges" both taught the retired pair for a release after 21000114000000
 *      and assertion 2 could not see either, because neither wears backticks.
 *      `BARE` is the short list of PHRASES in which the two words can only be
 *      dependency kinds, swept over `BARE_TREES` — and over their JSON and
 *      their Python too, because one of the two escapees was an eval and the
 *      other was a comment beside the code that walks the edges.
 *
 * WHY A CHECK OF ITS OWN. `cell_dependencies.kind = 'trigger'` and
 * `cell_dependencies.kind = 'needs'` are values, not identifiers, so the
 * identifier sweep has no fragment to key on and the copy sweep no
 * reader-facing word: a database *trigger* is a live subject in these
 * documents, and "needs" is English. The `needs` edge put the precondition at
 * its target; `enables` puts it at the source, so those edges turned around in
 * 21000114000000 as well as being renamed.
 *
 * SOURCE OF TRUTH: `supabase/generated/portable-core.generated.sql`, not the
 * migrations directly. It is generated FROM the migrations, and CI runs
 * `npm run check:portable-core` — which regenerates and diffs it — before it
 * runs this, so the two cannot disagree without that check failing first.
 * What it buys is a single flat file instead of a replay: reading the
 * constraint out of the migrations means ordering 20-odd files and tracking
 * drop/re-add across a table rename, and a check that reimplements migration
 * replay is a check with its own bugs. The LAST definition of the constraint
 * in that file is the one a fresh database ends up with, so it is the one
 * read — `enforcedKinds` says why.
 *
 *   node scripts/check-dependency-kinds.mjs
 */

import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


const SCHEMA = 'supabase/generated/portable-core.generated.sql'
const DATA_MODEL = 'references/data-model.md'

/**
 * Every tree a reader or an agent takes instructions from. `agents/` was
 * missing at first, and the impact tracer kept walking "incoming `needs`"
 * edges for a whole release after the edges had turned around.
 */
const RULEBOOK = ['references', 'skills', 'agents', 'docs/guide', 'docs/engineering']

/**
 * Retired kind words, and what the database calls them instead.
 *
 * These swapped ends in 21000114000000. The docs used to run AHEAD of the
 * column — they taught `leads_to`/`enables` while the constraint accepted
 * `trigger`/`needs`, which is the drift this file was written for. The column
 * has now caught up and passed them: `trigger` is the retired word, and
 * `needs` is retired twice over, because the edge it named points the other
 * way from the `enables` that replaced it.
 *
 * Both are held to their CODE-SPAN form, and each for its own reason.
 * `needs` is an ordinary English verb — "a slice needs a cell" — which is the
 * rule `enables` used to be held by. `trigger` is a database object these
 * documents legitimately discuss: `references/data-model.md` has a whole
 * section on the integrity trigger `cells_validate_path_match`, and a bare
 * word sweep read every line of it as a retired kind. Narrowing the subject
 * to the code span is the fix; dropping `trigger` from the list would have
 * made this a rule that never covered the word at all.
 */
const RETIRED = [
  [/`trigger`/g, '`trigger`', '`leads_to`'],
  [/`needs`/g, '`needs`', '`enables`'],
]

/**
 * Trees the BARE-WORD sweep reads, and the extensions it reads there.
 *
 * Narrower than `RULEBOOK` in one direction and wider in two others. It drops
 * `docs/`, whose engineering pages have to be able to WRITE the retired pair
 * down to explain this check. It adds `evals/`, because an eval's
 * `expected_behavior` is doctrine an agent is graded against and nothing was
 * reading it. And it reads more than markdown: the two documents this
 * assertion was written for are a JSON eval set and a `.md`, and a third hit
 * was a Python comment beside the adjacency walk in `slice_tools.py`.
 *
 * `scripts/` is deliberately absent. `migrate_ir.py` describes the migration
 * that TURNED THE `needs` EDGES AROUND; a record of a retired edge has to
 * name it, and a sweep there would be a list of exemptions rather than a rule.
 */
const BARE_TREES = ['references', 'skills', 'agents', 'evals']
const BARE_EXTENSIONS = ['.md', '.json', '.py', '.mjs', '.ts', '.sh', '.txt']

/**
 * Phrases in which `trigger` and `needs` can only be dependency kinds.
 *
 * PRECISE ON PURPOSE. A bare `\btrigger\b` sweep flags every line of
 * `references/data-model.md`'s section on the integrity trigger
 * `cells_validate_path_match`, and a bare `\bneeds\b` flags the English verb
 * in "a slice needs a cell" — which is how assertion 2 ended up scoped to the
 * code span in the first place. These four say *edge* or say *the other kind*,
 * and neither word survives that company by accident.
 *
 * The optional backticks are what let one pattern cover `` `needs` edge `` and
 * `needs edge` both: half the escapees quoted one word of the phrase and not
 * the other, which is exactly why assertion 2 missed them.
 */
const BARE = [
  [/`?trigger`?[-/ ]vs[-/ ]`?needs`?/gi, 'trigger-vs-needs', '`leads_to`-vs-`enables`'],
  [/`?needs`?[-/ ]vs[-/ ]`?trigger`?/gi, 'needs-vs-trigger', '`enables`-vs-`leads_to`'],
  [/`?trigger`?\/`?needs`?/gi, 'trigger/needs', '`leads_to`/`enables`'],
  [/\btrigger`? edges?\b/gi, 'trigger edge', '`leads_to` edge'],
  [/\bneeds`? edges?\b/gi, 'needs edge', '`enables` edge'],
]

/**
 * Lines the bare-word sweep is documented to leave alone.
 *
 * Two entries, and each is a kind of sentence rather than a file someone got
 * tired of fixing. `files` is matched against the repo-relative path and
 * `text` against the line; an entry with `text: null` exempts the whole path.
 *
 * The database trigger is NOT here, and that is the point of `BARE` being
 * phrases: `cells_validate_path_match` is a live subject in these documents
 * and no pattern above can reach a sentence about it.
 */
const BARE_ALLOWED = [
  {
    files: /^evals\/trigger\//,
    text: null,
    why: "a skill-firing eval holds the QUERY A USER TYPES, verbatim. Users say"
      + ' the retired word; holding their phrasings to the schema vocabulary'
      + ' would make the decoys less realistic, which is the one thing that set'
      + ' is for. What an eval asserts is swept — evals/behavioral/evals.json.',
  },
  {
    files: /./,
    text: /\bretired\b/i,
    why: "a sentence about the retirement has to spell the retired word."
      + " references/ir-schema.json's `kind` description says which pair"
      + ' 21000114000000 withdrew, and a check'
      + ' that flagged them would be asking the vocabulary not to explain'
      + ' itself.',
  },
]

/**
 * The values `cell_dependencies.kind` accepts.
 *
 * The constraint is still named for the table's old name — the rename
 * migration says so on purpose — so match either.
 *
 * TWO THINGS THIS LEARNED FROM 21000114000000, both silent failures:
 *
 * 1. It insisted on exactly ONE definition and threw otherwise, on the
 *    reasoning that a redefinition should fail loudly rather than be read
 *    stale. A migration that drops and re-adds the constraint is exactly that
 *    redefinition, and it is the ordinary way to change an enum — so the rule
 *    made the normal case an error. The LAST definition wins now, because the
 *    file is generated in migration order and the last one is what a fresh
 *    database ends up with.
 *
 * 2. It matched on one line. `alter table … add constraint … check (…)`
 *    written across three lines did not match at all, so the sweep read the
 *    ORIGINAL constraint and reported agreement with a column that had since
 *    changed underneath it. Whitespace is collapsed before matching.
 */
export function enforcedKinds(sql) {
  const flat = sql.replace(/\s+/g, ' ')
  const pattern =
    /constraint (?:cell_triggers|cell_dependencies)_kind_check check \(kind in \(([^)]*)\)\)/g
  const found = [...flat.matchAll(pattern)]
  if (found.length === 0) {
    throw new Error(`no cell-dependency kind constraint found in ${SCHEMA}`)
  }
  return [...found.at(-1)[1].matchAll(/'([a-z_]+)'/g)].map(([, value]) => value)
}

/** The values the Enums section states for `cell_dependencies.kind`. */
export function documentedKinds(markdown) {
  const row = markdown
    .split('\n')
    .find((line) => line.startsWith('- `cell_dependencies.kind`:'))
  if (!row) throw new Error(`no cell_dependencies.kind enum row found in ${DATA_MODEL}`)
  const list = row.slice(row.indexOf(':') + 1).split('.')[0]
  return [...list.matchAll(/`([a-z_]+)`/g)].map(([, value]) => value)
}

/** Values on one side and not the other. */
export function differences(documented, enforced) {
  const stated = new Set(documented)
  const real = new Set(enforced)
  return {
    undocumented: enforced.filter((value) => !stated.has(value)),
    unknown: documented.filter((value) => !real.has(value)),
  }
}

/**
 * The rulebook, swept: this repository's prose, narrowed to `RULEBOOK`.
 *
 * THE SUBJECT IS `docs` — the prose sweep — because every tree in `RULEBOOK`
 * is markdown and every one of them is a folder that sweep already reads:
 * `references`, `skills` and `agents` are named as swept, and `docs/guide` and
 * `docs/engineering` are inside `docs`. The dated records it leaves out are not
 * in `RULEBOOK` either, for the same reason twice over.
 */
function rulebook(root) {
  return sweep({
    subject: 'docs',
    root,
    what: `rulebook markdown under ${RULEBOOK.join(', ')}`,
    where: (path) => RULEBOOK.some((tree) => path.startsWith(`${tree}/`)),
  })
}

/** `{ file, line, found, instead }` for every retired word still in the rulebook. */
export function retiredMentions(files, read) {
  const hits = []
  for (const file of files) {
    const text = read(file)
    if (text === null) continue // listed, then gone before this read
    text
      .split('\n')
      .forEach((text, index) => {
        for (const [pattern, found, instead] of RETIRED) {
          pattern.lastIndex = 0
          if (pattern.test(text)) hits.push({ file, line: index + 1, found, instead })
        }
      })
  }
  return hits
}

/**
 * The bare-word subject, swept — not only the markdown.
 *
 * THE SUBJECT IS `commit`, and it is the honest one for these four trees. The
 * prose sweep reads markdown alone, and half of what this assertion was
 * written for is a JSON eval set and a Python comment; the `references`
 * subject reads every file but only under `references/` and each skill's own,
 * which is neither all of `skills/` nor any of `evals/`; and `evals/` is in no
 * narrower subject at all. What every one of these files has in common is that
 * this commit carries it, so that is the subject named — and `BARE_TREES` plus
 * `BARE_EXTENSIONS` narrow it to the trees and the extensions the assertion
 * documents above.
 */
function bare(root) {
  return sweep({
    subject: 'commit',
    root,
    what: `${BARE_EXTENSIONS.join(', ')} files under ${BARE_TREES.join(', ')}`,
    where: (path) =>
      BARE_TREES.some((tree) => path.startsWith(`${tree}/`)) &&
      BARE_EXTENSIONS.some((ext) => path.endsWith(ext)),
  })
}

/** Whether `BARE_ALLOWED` documents a reason to leave this line alone. */
export function allowedBare(file, text) {
  return BARE_ALLOWED.some(
    (entry) => entry.files.test(file) && (entry.text === null || entry.text.test(text)),
  )
}

/**
 * `{ file, line, found, instead }` for every retired kind spelled as a bare
 * word in one of the phrases only a dependency kind appears in.
 *
 * ONE FINDING PER LINE. "Walks trigger/needs edges" matches two patterns and
 * is one mistake; reporting it twice makes a two-line failure read as four
 * documents.
 */
export function bareMentions(files, read) {
  const hits = []
  for (const file of files) {
    const text = read(file)
    if (text === null) continue // listed, then gone before this read
    text
      .split('\n')
      .forEach((text, index) => {
        if (allowedBare(file, text)) return
        for (const [pattern, found, instead] of BARE) {
          pattern.lastIndex = 0
          if (pattern.test(text)) {
            hits.push({ file, line: index + 1, found, instead })
            return
          }
        }
      })
  }
  return hits
}

export function compare(root = process.cwd()) {
  const prose = rulebook(root)
  const everything = bare(root)
  // The two files this check names by hand, and neither may be missing: an
  // absent schema or reference is a fact about the tree, not a file that
  // vanished mid-run, and comparing against nothing is the failure the whole
  // file is against. A sweep answers for any path under it, named or swept.
  const stated = (sweeps, path) => {
    const text = sweeps.read(path)
    if (text === null) throw new Error(`no ${path} under ${sweeps.base}: nothing to compare against`)
    return text
  }
  return {
    ...differences(
      documentedKinds(stated(prose, DATA_MODEL)),
      enforcedKinds(stated(everything, SCHEMA)),
    ),
    retired: retiredMentions(prose.files, prose.read),
    bare: bareMentions(everything.files, everything.read),
    // How wide the two sweeps were, out of the walk that has just happened. A
    // second walk for the same number is two derivations of one fact, free to
    // disagree, and the walk paid for twice.
    read: prose.files.length + everything.files.length,
  }
}

/**
 * The verdict: the documented vocabulary against the enforced one, and the
 * rulebook against both.
 *
 * Pure — it reads the tree, decides, and hands back what it found. Nothing
 * here prints or exits.
 */
export function judge(root = process.cwd()) {
  const { undocumented, unknown, retired, bare: bareWords, read } = compare(root)
  const findings = [
    ...undocumented.map(
      (value) => `the constraint accepts kind '${value}', which ${DATA_MODEL} does not state`,
    ),
    ...unknown.map(
      (value) => `${DATA_MODEL} states kind '${value}', which the constraint refuses`,
    ),
    ...[...retired, ...bareWords].map(
      ({ file, line, found, instead }) =>
        `${file}:${line} says ${found}; the database calls it ${instead}`,
    ),
  ]
  return {
    // The subject is the files a kind could be named in — the rulebook markdown
    // and the committed files the bare-word sweep reads — because that is what
    // this check actually opened, and a run that opened none of them has
    // compared the vocabulary against nothing.
    what: 'a rulebook document and a committed file that could name a dependency kind',
    count: read,
    findings,
    closing:
      `\nThe enforced vocabulary wins — a documented value the CHECK constraint` +
      ` refuses is an agent writing a call that cannot land. Fix the documents.`,
    line:
      `${DATA_MODEL} states the kind vocabulary the constraint enforces, and no` +
      ` rulebook document contradicts it`,
  }
}

whenRun(import.meta.url, judge)
