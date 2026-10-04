/**
 * Check D — neither "chip" nor "pill" is a name in this app.
 *
 * The `pill`/`chip` row of `scripts/retired-vocabulary.mjs` enforces nothing in
 * the identifier sweep and says so: no database object was ever called either
 * word, and a guard that cannot fire is a comment wearing a check's clothes.
 * The row's copy list covers what a reader sees, which `retired-copy.test.mjs`
 * holds. Between the two sat the whole of the app's own vocabulary — a
 * component, a prop, a constant, a variant string, a data attribute, a file
 * name — with nothing but review watching it. #160 renamed the touchpoint half
 * and left `FloatingSidebarPill`, `SliceRefocusPill` and `PathNotionPill`
 * standing, which is how a rename held by review ends.
 *
 * SUBJECT: every `.ts`, `.tsx` and `.css` file under `src`, COMMENTS REMOVED,
 * plus the file names themselves. Test files are in — a test asserting against
 * a retired name carries it as surely as the component would.
 *
 * AND THE COVER FIGURES' CLASS NAMES, SINCE #188 — `docs/assets/*.svg`, which
 * are authored by hand and ship byte-for-byte. They are a third subject rather
 * than an extension of the first, because a figure is styled only by its own
 * `<style>` block and reads nothing from `src`; the walk and the two
 * assertions that read them are at the foot of this file, under their own
 * heading. `chip` survived #324 and #358 in fifty-one of those class strings,
 * which is the same lesson one file type over: a rename is held by whatever
 * opens the file, and nothing had ever opened these for a name.
 *
 * COMMENTS ARE THE SECOND SUBJECT, SINCE #358. They were excluded on the
 * argument that a codebase is allowed to say why a word left, and that a guard
 * reading comments could not be satisfied by any tree that explains its own
 * history. That argument was right about the DOCUMENTS and wrong about the
 * axis. What it protects is the rename map and this file, and both live under
 * `scripts/`, outside a subject that was always `src`. Inside `src` a comment
 * is not history — it is the sentence the next reader learns the name from,
 * which is how `layer` survived `21000104` in eleven places (#327) and `chip`
 * survived #324 in forty. So one walk now feeds two assertions: the names it
 * keeps, and the comments it strips out.
 *
 * NO EXEMPTION LIST, and that is a property of the subject rather than an
 * omission. The four documents this repository exempts everywhere else — this
 * file, `.changeset/`, `CHANGELOG.md` and `supabase/migrations/` — are outside
 * `src` by construction, so nothing whose job is to write the retired word
 * down is ever read. An exemption list is where a real finding hides; the
 * cheapest one is the list the subject makes unnecessary.
 *
 * `src` is the whole subject for the same reason `supabase/migrations` is not:
 * a migration is a DATED RECORD of what was applied on a day, and rewriting a
 * record is worse than the word it removes. `lane_role`'s catalogue comment
 * still reads "pill cells" because no migration has changed it, so the
 * documents that quote that comment — `references/data-model.md`,
 * `references/ir-schema.json`, `agents/render-checker.md`, `CONTEXT.md`'s lane
 * definition — quote it accurately and are outside this file. They move when
 * the comment does. (The vendored mirror of the first of those does sit under
 * `src`, and is markdown: the walk's extension filter never opens it.)
 *
 * BOTH WORDS, SINCE #324. `pill` came first (#158) because `chip` was still a
 * live NAME here — `coverContent.chip`, the cover's copy-button strings, named
 * before the design system split the two ideas. That rename is done: the key is
 * `commandCopy`, the component is `CoverCommandCopy`, the ledger's markers are
 * a `VerdictBadge` and a `FilterTag`, and the deployment's spelling is what
 * each of them took. So the subject is the row's whole pair
 * now, which is what the instance's own `badge-and-tag.test.mjs` — the file
 * this is modelled on and now named for — has held all along.
 *
 * Proved to go red below, in the shape the rest of this directory argues for:
 * a check that is green against this tree could equally be a check that
 * examines nothing.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { RENAME_MAP } from '../retired-vocabulary.mjs'
import { coverAssetFiles } from '../sync-cover-assets.mjs'
import { sweep } from '../sweep.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
/**
 * The application, wherever this tree keeps it: the `app` subject, narrowed.
 *
 * `resolve(ROOT, 'src')` is this repository's answer and only this
 * repository's: a deployment installs this package and reads the application
 * out of `node_modules/uno-blueprint`, with no `src` of its
 * own. `readdirSync` on a directory that is not there threw, which is the
 * loud form of this defect and the lucky one — a walk of its own is one line
 * away from the silent form, where a tolerated absence sweeps nothing and
 * every assertion under it agrees. The sweep refuses an empty result for that
 * reason, beside the three tests below that count what came back. Its paths are
 * already the ones a finding prints — `src/styles/blueprint.css` on either
 * side, whichever layer holds the file — so the spot checks stay one string
 * apiece.
 *
 * `docs/assets`, further down, is deliberately NOT resolved this way. A figure
 * is documentation and documentation is this tree's, the same way `scripts/`
 * is.
 */
const APP = sweep({
  subject: 'app',
  root: ROOT,
  where: (path) => /\.(tsx?|css)$/.test(path),
  what: '.ts, .tsx or .css',
})

/* --------------------------------------------------------------- the tree */

/** Block and line comments removed, so only names are left to read. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** A block comment, or a line comment whose `//` is not part of a URL. */
const COMMENT = /\/\*[\s\S]*?\*\/|(^|[^:])(\/\/.*)$/gm

/**
 * The complement of `stripComments`: every comment kept, every other character
 * blanked to a space.
 *
 * Blanked rather than collected, so a line number still means what it says —
 * the report below is `file:line`, and a guard that names the wrong line is a
 * guard nobody trusts twice. It is written against the same two patterns
 * instead of subtracting one result from the other, because positions shift
 * the moment anything is removed.
 */
export function commentsOnly(source) {
  const out = source.replace(/[^\n]/g, ' ').split('')
  for (const match of source.matchAll(COMMENT)) {
    const text = match[2] ?? match[0]
    const start = match.index + (match[2] ? match[1].length : 0)
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '\n') out[start + i] = text[i]
    }
  }
  return out.join('')
}

/**
 * Every TypeScript and stylesheet file of the application, split into its two
 * halves: `code` is the file with comments stripped, `comments` is what the
 * stripping removed. One listing, because the two assertions below are one
 * subject read twice and a second walk would be a second thing to keep in step.
 *
 * A PATH THAT VANISHED between the listing and the read is skipped, and every
 * other failure throws — a build artefact removed in the gap, or a symlink
 * pointing at something that has gone, would otherwise turn a vocabulary guard
 * red for a reason that has nothing to do with vocabulary, while a permission
 * the checkout should not have is a fact about the tree worth hearing. Neither
 * half of that rule is written here: `sweep.mjs` states it once for every walk
 * in the repository that reads a path something else listed. And the skip
 * cannot quietly shrink the subject: the three tests below count what came
 * back and name the directories that must be in it.
 */
export function appSources() {
  return APP.files
    .flatMap((file) => {
      const source = APP.read(file)
      if (source === null) return [] // listed, then gone before this read
      return [{ file, code: stripComments(source), comments: commentsOnly(source) }]
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

/* --------------------------------------------- chip and pill, as names */

/**
 * The words that stopped being names, read OFF the rename map rather than
 * copied out of it.
 *
 * The selector is the map's own shape and not a position in it: a row with an
 * empty `retired` list renamed no database object, and a row with an empty
 * `migrations` list was never applied to a database at all. A row that is both
 * *and* retired more than one name renamed the app's own vocabulary — two
 * words for two ideas, which is precisely the kind of rename no schema and no
 * generated type can hold, and precisely what this file exists to hold
 * instead. `pill`/`chip` is that row today.
 *
 * The other no-migration row is `kit` (#552). It is one word, held by Check C
 * as a whole-word copy spelling. A substring walk of `kit` would flag
 * `WebKit` and every `-webkit-` utility, which is why this file does not
 * take it.
 */
export const RETIRED_DESIGN_WORDS = Object.freeze(
  RENAME_MAP.filter(
    (row) =>
      row.retired.length === 0 &&
      row.migrations.length === 0 &&
      new Set(row.was).size > 1,
  ).flatMap((row) => row.was),
)

const SAYS_RETIRED = new RegExp(`(${RETIRED_DESIGN_WORDS.join('|')})`, 'i')

test('the retired pair is derived from the rename map', () => {
  // The derivation is the one part of this file that can go wrong quietly. A
  // row edited so that it no longer matches leaves a SMALLER set, and a
  // smaller set is a check that has stopped covering a word without saying so.
  // (An empty set is the loud failure: the pattern becomes `()`, which matches
  // every name in the tree.) So the pair is stated once, here, as a fact about
  // the map rather than as the list the walks read.
  assert.deepEqual([...RETIRED_DESIGN_WORDS].sort(), ['chip', 'pill'])
})

/** Every name in the tree that still says chip or pill, with where it is. */
export function namesThatSayChipOrPill(sources) {
  const out = []
  for (const { file, code } of sources) {
    if (SAYS_RETIRED.test(file)) out.push(`${file} — the file name`)
    code.split('\n').forEach((line, index) => {
      if (SAYS_RETIRED.test(line)) out.push(`${file}:${index + 1} ${line.trim()}`)
    })
  }
  return out
}

test('no name in the app says chip or pill', () => {
  const found = namesThatSayChipOrPill(appSources())
  assert.deepEqual(
    found,
    [],
    'A name says "chip" or "pill". The design system has two words: a BADGE ' +
      'describes the thing it sits on, a TAG is one value out of a set. Both ' +
      'retired words were a third and fourth name for those two ideas, and a ' +
      'touchpoint is a cell with a shape variant rather than a shape of its ' +
      `own:\n${found.join('\n')}`,
  )
})

test('the check goes red on a name that reintroduces the word', () => {
  const planted = [
    {
      file: 'src/components/editor/FloatingSidebarPill.tsx',
      code: 'export function FloatingSidebarPill() {}',
    },
    {
      file: 'src/components/cover/CoverCommandChip.tsx',
      code: 'export const chip = 1',
    },
    { file: 'src/lib/quiet.ts', code: "export const PILL_HEIGHT = 52\nconst x = 'pills'" },
  ]
  assert.deepEqual(namesThatSayChipOrPill(planted), [
    'src/components/editor/FloatingSidebarPill.tsx — the file name',
    'src/components/editor/FloatingSidebarPill.tsx:1 export function FloatingSidebarPill() {}',
    'src/components/cover/CoverCommandChip.tsx — the file name',
    'src/components/cover/CoverCommandChip.tsx:1 export const chip = 1',
    'src/lib/quiet.ts:1 export const PILL_HEIGHT = 52',
    "src/lib/quiet.ts:2 const x = 'pills'",
  ])
})

/** The two fixtures both halves are proved against — see below. */
const NAMED_NOTHING = Object.freeze([
  {
    file: 'src/components/editor/Quiet.tsx',
    code: [
      '/* The collapsed remnant used to be a pill with its own name. */',
      'export function FloatingSidebarNavbar() {} // was a chip',
    ].join('\n'),
  },
  {
    file: 'src/styles/quiet.css',
    code: '/* a touchpoint, once a chip, sits a step paler */\n.cell { color: red; }',
  },
])

test('the name check reads names and not comments', () => {
  // The name half's subject, stated as a passing case: neither file names
  // anything retired, so this half must stay silent on both. The comment half
  // below reads exactly these lines and fails on them, which is the whole of
  // what #358 changed — the two are one corpus read on two axes, not one
  // check that grew a second opinion.
  const quiet = [
    {
      file: 'src/components/editor/Quiet.tsx',
      code: [
        '/* The collapsed remnant used to be a pill with its own name. */',
        'export function FloatingSidebarNavbar() {} // was a chip',
      ].join('\n'),
    },
    {
      file: 'src/styles/quiet.css',
      code: '/* a touchpoint, once a chip, sits a step paler */\n.cell { color: red; }',
    },
  ].map(({ file, code }) => ({ file, code: stripComments(code) }))
  assert.deepEqual(namesThatSayChipOrPill(quiet), [])
})

/* ------------------------------------------ chip and pill, in a comment */

/** Every comment in the tree that still says chip or pill, with where it is. */
export function commentsThatSayChipOrPill(sources) {
  const out = []
  for (const { file, comments } of sources) {
    comments.split('\n').forEach((line, index) => {
      if (SAYS_RETIRED.test(line)) out.push(`${file}:${index + 1} ${line.trim()}`)
    })
  }
  return out
}

test('no comment in the app says chip or pill', () => {
  const found = commentsThatSayChipOrPill(appSources())
  assert.deepEqual(
    found,
    [],
    'A comment says "chip" or "pill". A comment inside `src` is where the next ' +
      'reader learns what to call the thing, so it teaches the retired name as ' +
      'surely as a component would: a BADGE describes the thing it sits on, a ' +
      'TAG is one value out of a set. Where neither word is what the sentence ' +
      'means, say what it means — a filled square, an attachment, a button — ' +
      `rather than reaching for a third:\n${found.join('\n')}`,
  )
})

test('the comment check goes red on the sentences the name check ignores', () => {
  const planted = NAMED_NOTHING.map(({ file, code }) => ({
    file,
    code: stripComments(code),
    comments: commentsOnly(code),
  }))
  assert.deepEqual(namesThatSayChipOrPill(planted), [])
  assert.deepEqual(commentsThatSayChipOrPill(planted), [
    'src/components/editor/Quiet.tsx:1 ' +
      '/* The collapsed remnant used to be a pill with its own name. */',
    'src/components/editor/Quiet.tsx:2 // was a chip',
    'src/styles/quiet.css:1 /* a touchpoint, once a chip, sits a step paler */',
  ])
})

test('the comment reader keeps the line numbers and drops the code', () => {
  // The extraction, on the shapes the corpus actually holds: a bare code line,
  // a block spanning two lines, a `//` inside a URL (which is the reason
  // `stripComments` carries `(^|[^:])` at all), and a trailing comment.
  const source = [
    'const a = 1',
    '/* block',
    '   spanning */',
    "const url = 'https://example.com' // after a URL",
    'const b = 2 // trailing',
  ].join('\n')
  const lines = commentsOnly(source).split('\n')
  assert.equal(lines.length, 5, 'a blanked line went missing')
  assert.deepEqual(
    lines.map((line) => line.trim()),
    ['', '/* block', 'spanning */', '// after a URL', '// trailing'],
  )
  // Blanked, not deleted: the comment sits where it sat.
  assert.equal(lines[4].indexOf('//'), source.split('\n')[4].indexOf('//'))
})

test('the walk reads the comments it claims to', () => {
  // The same fact the name walk asserts, one axis over. A reader that returned
  // nothing would satisfy the assertion above in silence.
  const sources = appSources()
  const written = sources.flatMap(({ comments }) =>
    comments.split('\n').filter((line) => line.trim() !== ''),
  )
  assert.ok(written.length > 1000, `only ${written.length} comment lines were read`)
  assert.ok(sources.some(({ comments }) => comments.includes('badge')))
})

test('the walk reads the tree it claims to', () => {
  // A guard whose extraction is wrong reports nothing and looks identical to a
  // clean codebase. Two facts about the corpus, cheap and load-bearing: the
  // stylesheet is in (its comments carried the word until this change), and the
  // renamed component is there under its current name.
  const sources = appSources()
  assert.ok(sources.some(({ file }) => file === 'src/styles/blueprint.css'))
  assert.ok(
    sources.some(({ code }) => code.includes('export function FloatingSidebarNavbar')),
  )
})

test('the walk reads the WHOLE tree, not a handful of directories', () => {
  // The breadth, stated separately from the two spot checks above, because the
  // two would still pass over a walk that had quietly stopped descending — and
  // because `walk` skips an entry that vanishes under it, which is safe only
  // while something counts what came back.
  //
  // The sampling gap this names is a real one: a guard that reads only
  // `components/` looks exactly like a guard that reads everything, right up
  // until a retired name lands in `lib/`.
  const sources = appSources()
  assert.ok(sources.length > 200, `only ${sources.length} source files found under src`)
  for (const root of ['components/', 'lib/', 'contexts/', 'hooks/', 'styles/', 'types/']) {
    assert.ok(
      sources.some((one) => one.file.startsWith(`src/${root}`)),
      `src/${root} is not in the subject`,
    )
  }
})

/* ----------------------------------- chip and pill, in a figure's classes */

/**
 * THE FIGURES ARE THE THIRD SUBJECT, SINCE #188.
 *
 * `docs/assets/*.svg` are the cover page's diagrams, and they are AUTHORED —
 * `scripts/sync-cover-assets.mjs` copies them to `public/cover/` and changes
 * nothing on the way, so what is written here is what ships. Each carries its
 * own `<style>` block, and `CoverFigure` serves it through an `<img>`, which
 * seals page CSS out of the file. That block is therefore not one stylesheet
 * among several: it is the whole of the styling that will ever reach the
 * figure. A class name in one of these files is a name in exactly the sense
 * the two walks above use the word — something the next person editing the
 * figure learns the vocabulary from — and until this change it was held by
 * nothing but review.
 *
 * Review lost. `chip` stopped being a name under `src` in #324 and left its
 * comments in #358, and forty-one `class="chip"` attributes and ten `.chip`
 * rules sat in these figures through both sweeps, because no check had ever
 * opened an SVG looking for a NAME. `retired-copy.test.mjs` does open them,
 * and is right not to have caught this: its subject is the words a reader
 * sees, which in an SVG means the text nodes and not the attributes. The
 * class strings sat in the gap between two checks that were each correct
 * about their own subject.
 *
 * TWO ASSERTIONS OVER ONE WALK, which is the shape the pair above already has.
 *
 *   1. NO RETIRED WORD IN A CLASS NAME. The subject is both places a figure
 *      can write one — the rule in its `<style>` block and the token in a
 *      `class` attribute. Both, because a rename that moves one and not the
 *      other is the mistake this change itself had to avoid, and a guard
 *      reading only the attributes would have called such a rename done.
 *
 *   2. EVERY CLASS USED HAS A RULE IN THE SAME FILE. This is what makes the
 *      first assertion impossible to satisfy by halves: rename the rule alone
 *      and the attributes are left styling nothing, rename the attributes
 *      alone and the rule is. It can be an assertion at all only because of
 *      the `<img>` seal — with no second place a rule could be hiding, "not
 *      in this file" is the whole of "nowhere". The same sentence about a
 *      class under `src` would be unwritable, where a rule may come from any
 *      of Tailwind's generated utilities.
 *
 * THE CONVERSE IS DELIBERATELY NOT ASSERTED. A rule that no attribute uses is
 * left alone, and four stand today — `uiTitle` in the cell figure, `spoke` in
 * three of the skill figures. A rule nobody uses styles nothing and teaches
 * nobody, because a name is learned where it is USED; sweeping the four would
 * be a second finding with a different subject, and this file's header already
 * says that the answer to a subject reaching too far is to narrow it.
 */

const FIGURES = resolve(ROOT, 'docs', 'assets')

/** The contents of a `<style>` block. */
const STYLE_BLOCK = /<style>([\s\S]*?)<\/style>/g

/**
 * A class selector inside one. The leading letter is what keeps this off a
 * decimal: `letter-spacing: .07em` and `opacity: .9` are the two shapes these
 * files carry, and a digit follows the dot in both.
 */
const CLASS_RULE = /\.([A-Za-z][\w-]*)/g

/** A `class` attribute, whose value may hold several names. */
const CLASS_ATTRIBUTE = /\sclass="([^"]*)"/g

/** The 1-based line `index` falls on. */
function lineAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function figureFiles() {
  return readdirSync(FIGURES)
    .filter((name) => name.endsWith('.svg'))
    .sort()
    .map((name) => ({
      file: `docs/assets/${name}`,
      code: readFileSync(join(FIGURES, name), 'utf8'),
    }))
}

/**
 * Each figure's class vocabulary, split the way the two assertions need it:
 * the names its stylesheet DEFINES and the names its markup USES, each
 * carrying the line it first appears on so a failure names a place.
 */
export function figureClasses(files = figureFiles()) {
  return files.map(({ file, code }) => {
    const defined = new Map()
    for (const block of code.matchAll(STYLE_BLOCK)) {
      const start = block.index + block[0].indexOf(block[1])
      for (const rule of block[1].matchAll(CLASS_RULE)) {
        if (!defined.has(rule[1])) defined.set(rule[1], lineAt(code, start + rule.index))
      }
    }
    const used = new Map()
    for (const attribute of code.matchAll(CLASS_ATTRIBUTE)) {
      const at = attribute.index + attribute[0].indexOf('class=')
      for (const name of attribute[1].trim().split(/\s+/)) {
        if (name && !used.has(name)) used.set(name, lineAt(code, at))
      }
    }
    return { file, defined, used }
  })
}

/** Every figure class name that still says chip or pill, with where it is. */
export function figureNamesThatSayChipOrPill(figures) {
  const out = []
  for (const { file, defined, used } of figures) {
    for (const [name, line] of defined) {
      if (SAYS_RETIRED.test(name)) out.push(`${file}:${line} .${name} — the rule`)
    }
    for (const [name, line] of used) {
      if (SAYS_RETIRED.test(name)) out.push(`${file}:${line} class="${name}"`)
    }
  }
  return out
}

/** Every class a figure uses that its own stylesheet never gives a rule. */
export function figureClassesWithNoRule(figures) {
  const out = []
  for (const { file, defined, used } of figures) {
    for (const [name, line] of used) {
      if (!defined.has(name)) out.push(`${file}:${line} class="${name}"`)
    }
  }
  return out
}

test('no class name in a figure says chip or pill', () => {
  const found = figureNamesThatSayChipOrPill(figureClasses())
  assert.deepEqual(
    found,
    [],
    'A class in a cover figure says "chip" or "pill". These files are authored ' +
      'and ship as written, so the name is what the next person editing the ' +
      'figure will copy. The design system has two words: a BADGE describes ' +
      'the thing it sits on, a TAG is one value out of a set. Move the rule ' +
      `and the attributes together — a half-rename fails the check below:\n${found.join('\n')}`,
  )
})

test('every class a figure uses is defined by that figure', () => {
  const found = figureClassesWithNoRule(figureClasses())
  assert.deepEqual(
    found,
    [],
    'A cover figure uses a class its own `<style>` block never defines, so the ' +
      'attribute styles nothing. An `<img>` seals page CSS out of these files, ' +
      'which leaves no other stylesheet that could be carrying the rule — the ' +
      `usual cause is a rename that moved the rule and left the markup:\n${found.join('\n')}`,
  )
})

test('the figure checks go red on a class that reintroduces the word', () => {
  // Both halves of a rename, planted separately, so neither assertion can be
  // satisfied by doing half the work: the first figure renamed its rule and
  // kept its attributes, the second did the reverse.
  const planted = figureClasses([
    {
      file: 'docs/assets/planted-rule-moved.svg',
      code: [
        '<svg>',
        '  <style>',
        '    .badge { font-size: 10px; }',
        '    .mono { font-family: monospace; }',
        '  </style>',
        '  <text class="chip">Phase 1</text>',
        '  <text class="chip mono">a step</text>',
        '</svg>',
      ].join('\n'),
    },
    {
      file: 'docs/assets/planted-markup-moved.svg',
      code: [
        '<svg>',
        '  <style>',
        '    .pill { font-size: 10px; }',
        '    .badge { font-size: 10px; }',
        '  </style>',
        '  <text class="badge">Phase 1</text>',
        '</svg>',
      ].join('\n'),
    },
  ])
  // Each name is reported once per file, at the line it first appears on, so
  // the two `chip` attributes below are one finding and not two.
  assert.deepEqual(figureNamesThatSayChipOrPill(planted), [
    'docs/assets/planted-rule-moved.svg:6 class="chip"',
    'docs/assets/planted-markup-moved.svg:3 .pill — the rule',
  ])
  assert.deepEqual(figureClassesWithNoRule(planted), [
    'docs/assets/planted-rule-moved.svg:6 class="chip"',
  ])
})

test('the figure walk reads the figures it claims to', () => {
  // A reader that opened nothing, or that found no classes in what it opened,
  // would satisfy both assertions above in silence — the failure mode every
  // check in this directory is written against.
  const figures = figureClasses()
  assert.equal(figures.length, coverAssetFiles().length)
  const used = figures.reduce((total, { used: names }) => total + names.size, 0)
  assert.ok(used > 80, `the figures parsed to ${used} class names`)
  // The word this change moved the corpus to, in the two places it can sit.
  assert.ok(figures.some(({ defined }) => defined.has('badge')))
  assert.ok(figures.some(({ used: names }) => names.has('badge')))
})
