/**
 * Check C — the words a person reads on screen match the words in the schema.
 *
 * Identifier drift between the app and the database is nearly impossible here:
 * `src/types/database.ts` is generated from a built database, so every table
 * and column name reaches TypeScript by machine and `tsc` fails if the app
 * disagrees. Everything a rename breaks sits in the places the generator cannot
 * reach, and this is the last of them. Nothing asserts that a label says "lane"
 * when the table says `lanes`. It is true today because `21000104` was done
 * carefully by hand, which is not a mechanism.
 *
 * SUBJECT: JSX text nodes; the props that reach a reader, named one by one in
 * `READER_FACING_PROPS`; the copy a component assembles into a named local
 * before handing it to one of those props; and the string content of the
 * modules enrolled in `COPY_MODULES`. Nothing else. Not comments, not
 * identifiers, not imports, not `data-*`, and not a string that names a
 * database object — that is Check B, a different check with a different
 * subject.
 *
 * IF THIS PRODUCES A FALSE POSITIVE, NARROW THE SUBJECT — NEVER THE WORD LIST.
 * Fewer prop names, fewer node kinds, one module off the enrolment. Dropping
 * `layer` from the word list to silence one legitimate use converts this into a
 * rule that never covered `layer` at all, and the next person cannot tell the
 * difference.
 *
 * `CanvasAnnotationLayer` is the case that tests this. It is a rendering layer
 * and a legitimate use of the word — but it is an identifier, and identifiers
 * are not the subject, so it needs no exemption. If it ever reaches a label a
 * user reads, the honest fix is to rename the label, not the list.
 *
 * ── WHAT THIS GUARD DOES NOT SEE ───────────────────────────────────────────
 *
 * #628 found three strings on screen that every check here passed, and the
 * three escaped along three different edges. Two of those edges are now read
 * and the rest are not, so they are written down: a guard whose blind spots are
 * stated is worth more than one that reads as complete and is not. Each of
 * these is a place a retired word can reach a reader today with nothing
 * reporting it.
 *
 * - **A `.ts` module that is not enrolled.** `panelTerms.ts` and
 *   `sliceValidation.ts` are read because `COPY_MODULES` names them, and
 *   nothing puts the NEXT copy module on that list except a person. A blanket
 *   sweep of `src/**` was measured instead of assumed and is not the answer:
 *   46 strings in `.ts` files carry a retired spelling and 44 of them are
 *   nobody's copy — a dev-only arrow catalogue naming layout columns, the
 *   agent tool descriptions, `compareGridTracks`'s CSS track names,
 *   `monoRegisters`'s "not a numeral column". Reading them all would force an
 *   exemption apiece, and an exemption list is where a real finding hides.
 * - **`src/content/coverContent.ts`, specifically.** It is reader-facing copy
 *   by its own header — every string on the landing view — and it is NOT
 *   enrolled, because two of its sentences say "one shared context layer" in
 *   the software-tier sense, and the rename map's `layers` → `lanes` row
 *   decides that collision by arguing a `.ts` module reaches no reader. On this
 *   one file that argument is untrue. Which way it should fall is a ruling
 *   about the word, not a fix to this guard, so it is named here and left.
 * - **The interpolated half of a template literal.** `` `Unknown ${label}.` ``
 *   is read as "Unknown ." — the guard sees the literal chunks and never what
 *   the expression evaluates to, so a retired word reaching a reader through a
 *   variable is invisible to every subject below.
 * - **Copy assembled anywhere but a named local.** A `*Label` / `*Text` /
 *   `*Hint` / `*Message` / `*Description` / `*Caption` binding is read; a
 *   sentence built in a `.map`, a helper's return value, or a local called
 *   something else is not.
 * - **A reader-facing prop nobody added.** The list below has to name each one,
 *   and a new prop is unread until it does. It was re-derived for #628 from
 *   every prop in the tree carrying a prose string literal, which is a census
 *   of today and not a mechanism.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scannedSweep } from '../check-standalone.mjs'
import { sweep } from '../sweep.mjs'
import { RETIRED_COPY_WORDS } from '../retired-vocabulary.mjs'
import { coverAssetFiles } from '../sync-cover-assets.mjs'

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname)
/**
 * The package the application sits in: this tree, or the dependency a
 * deployment reads it out of.
 *
 * TWO OF THE THREE SUBJECTS BELOW ARE THE APPLICATION'S and the third is this
 * tree's, and they are resolved apart for that reason. The `.tsx` sweep and
 * the enrolled copy modules are files a deployment does not have — it installs
 * this package and keeps no `src` — so both are found under `APP_PACKAGE`,
 * which is this repository's own root when the application is here. The
 * residue sweep at the end is `git ls-files` over THIS commit, which is a
 * question only this tree can ask of itself, and it stays on `REPO_ROOT`.
 *
 * The `app` subject of `scripts/sweep.mjs` resolves both: the `.tsx` walk, and
 * `APP_PACKAGE` — the sweep's own `base`, the directory a `src/…` path hangs
 * off. That is the half that used to be got wrong here as well as the walk: a
 * path made relative to a deployment's root came back as
 * `node_modules/uno-blueprint/src/components/…`, which the
 * `.tsx` filter still admits and which no finding, no exemption and no reader
 * of this file would recognise.
 */
const APP = sweep({ subject: 'app', root: REPO_ROOT })
const APP_PACKAGE = APP.base

/**
 * The props whose string value a person reads.
 *
 * Five of these are the HTML and ARIA attributes the guard started with. The
 * rest are this tree's own panel vocabulary, added for #628 after `hint` —
 * the popover under a field label — turned out to carry a retired word past
 * every check. They were not guessed: every prop in every `.tsx` whose value
 * is a prose string literal was listed, and these are the ones a person reads.
 * What was left out is left out on purpose — `className` and
 * `triggerClassName`, SVG's `d`, `viewBox`, `transform` and `strokeDasharray`,
 * and `rel`. None of them is copy.
 *
 * A census is not a mechanism, which the header says out loud: the next
 * reader-facing prop is unread until somebody puts it here.
 */
const READER_FACING_PROPS = [
  'aria-label',
  'ariaLabel',
  'title',
  'placeholder',
  'alt',
  'label',
  'hint',
  'description',
  'summary',
  'meta',
  'message',
  'closeLabel',
  'triggerLabel',
  'addLabel',
  'removeLabel',
]

const PROP_VALUE = new RegExp(
  `\\b(${READER_FACING_PROPS.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*['"\`]([^'"\`]*)['"\`]\\s*\\})`,
  'g',
)

/**
 * Text sitting between a closing `>` and the next opening `<`, carrying no
 * braces — a JSX text node, near enough. A real parser would be better and is
 * not worth a dependency: the only way this misreads ordinary code is a
 * comparison like `a > b && c < d`, and that has to contain a retired word
 * before anyone hears about it.
 */
const JSX_TEXT = />([^<>{}]+)</g

/** A single-quoted, double-quoted or backticked literal, wherever it sits. */
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g

/**
 * A literal's readable half, with every `${…}` blanked.
 *
 * The blanking is what makes a template literal readable at all — without it
 * `` `Unknown ${draft.sliceKind}.` `` carries an identifier into the match and
 * a retired NAME in an expression reads as a retired WORD on screen, which is
 * Check B's subject and not this one. It is also the limit the header states:
 * what the expression evaluates to is gone, so only the authored chunks around
 * it are ever read. An interpolation containing a brace of its own —
 * `${flag ? {a: 1} : 2}` — blanks only as far as the first `}`, which
 * under-reads and never over-reads.
 */
export function literalText(raw) {
  return raw.replace(/\$\{[^}]*\}/g, ' ')
}

/**
 * A local whose NAME says it holds copy.
 *
 * `StepPanel` assembled "different columns on 3 paths" into `positionLabel`
 * and handed it to a prop, so the prop scan saw an identifier and the text
 * scan saw nothing — #628's fourth string, found by widening to this. Keyed on
 * the suffix rather than on where the value goes, because a binding called
 * `positionLabel` has already declared what it is; the six suffixes cover 77
 * strings in this tree and none of them is anything but copy.
 */
const COPY_BINDING =
  /^([ \t]*)const\s+[A-Za-z0-9_$]*(?:Label|Text|Hint|Message|Description|Caption)\s*=/gm

/** Each retired spelling as a whole-word pattern, spaces matching any run. */
const PATTERNS = RETIRED_COPY_WORDS.map((word) => ({
  word,
  pattern: new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'i'),
}))

/**
 * Comments removed, because the header says they are not the subject and the
 * extraction has to agree with it.
 *
 * `JSX_TEXT` reads between a `>` and the next `<`, which a doc comment
 * containing a backticked `` `<textarea>` `` opens: everything from there to
 * the next real `<` — the whole of `panelShell.tsx`'s error-boundary
 * paragraph — arrived as one "reader-facing string". A prose sentence is
 * exactly what this guard is told not to read, and the fix the header names
 * for a false positive is to narrow the SUBJECT.
 *
 * The same shape as `scripts/tests/badge-and-tag.test.mjs`'s, spelled out here
 * rather than imported: a test file importing another test file registers that
 * file's tests twice.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Every `.tsx` in the app, as `{ file, code }`, with `src/…` paths.
 *
 * A WALK THAT FINDS NOTHING THROWS, and the sweep is what throws. An empty
 * subject and a clean one print the same green line, and the green one goes on
 * being printed every run after — which on this guard means a retired word can
 * be on screen with nothing in the suite disagreeing.
 */
function applicationComponents() {
  const swept = sweep({
    subject: 'app',
    root: REPO_ROOT,
    where: (path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'),
    what: '.tsx',
  })
  const found = []
  for (const file of swept.files) {
    const code = swept.read(file)
    if (code === null) continue // gone between the listing and the read
    found.push({ file, code: stripComments(code) })
  }
  return found
}

/**
 * A copy binding's initialiser, as source text.
 *
 * It runs from the `const` to the first line that is blank or indented no
 * deeper than the `const` itself — a continuation is always indented past its
 * own statement, and a blank line ends one in every file this tree writes.
 * Capped, so a binding that somehow never terminates cannot swallow a module.
 */
function bindingSource(code, start, indent) {
  const lines = code.slice(start).split('\n')
  const taken = [lines[0]]
  for (const line of lines.slice(1, 40)) {
    if (line.trim() === '') break
    if (/^\s*/.exec(line)[0].length <= indent.length) break
    taken.push(line)
  }
  return taken.join('\n')
}

/** Every reader-facing string in the app, with where it came from. */
export function readerFacingStrings(files = applicationComponents()) {
  const out = []
  for (const { file, code } of files) {
    if (!file.endsWith('.tsx')) continue
    for (const match of code.matchAll(PROP_VALUE)) {
      const value = match[2] ?? match[3] ?? match[4]
      if (value) out.push({ file, where: `${match[1]}=`, value })
    }
    for (const match of code.matchAll(JSX_TEXT)) {
      const value = match[1].trim()
      if (value && /[A-Za-z]/.test(value)) out.push({ file, where: 'text', value })
    }
    for (const match of code.matchAll(COPY_BINDING)) {
      const source = bindingSource(code, match.index, match[1])
      for (const literal of source.matchAll(STRING_LITERAL)) {
        const value = literalText(literal[1] ?? literal[2] ?? literal[3] ?? '').trim()
        if (value && /[A-Za-z]/.test(value)) out.push({ file, where: 'copy binding', value })
      }
    }
  }
  return out
}

/** Reader-facing strings carrying a retired spelling. */
export function offenders(strings = readerFacingStrings()) {
  return strings.flatMap((entry) => {
    const hit = PATTERNS.find(({ pattern }) => pattern.test(entry.value))
    return hit ? [`${entry.file} (${entry.where}) "${entry.value}" — "${hit.word}"`] : []
  })
}

test('no retired spelling reaches a reader', () => {
  const strings = readerFacingStrings()
  // The walk found FILES; this is what says it found the COPY. A tree whose
  // components yield no reader-facing string at all is one this guard has
  // stopped reading, and that reads exactly like a tree it has read and
  // agreed with.
  assert.ok(strings.length > 0, 'not one reader-facing string was read')
  const found = offenders(strings)
  assert.deepEqual(
    found,
    [],
    'A retired word is on screen. The schema, the docs and the agent all use the ' +
      'current one, and a UI that disagrees is the same defect as a doc asserting ' +
      `an interface the code lacks — pointed at the user instead:\n${found.join('\n')}`,
  )
})

test('the guard reads the props and the text nodes it claims to', () => {
  // The subject, exercised directly. A guard whose extraction is wrong reports
  // nothing and looks identical to a codebase that is clean — which is the
  // whole failure mode this file exists to avoid, so it cannot rely on the
  // corpus happening to contain an example.
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '<Button aria-label="Add a layer">',
        '  <span>Every lifecycle starts here</span>',
        '</Button>',
        '<Field placeholder="row position" label={"Propositions"} />',
        '<img alt="a service scenario" />',
      ].join('\n'),
    },
  ]
  const found = offenders(readerFacingStrings(planted)).map((one) => one.split(' — ')[1])
  assert.deepEqual(found.sort(), [
    '"layer"',
    '"lifecycle"',
    '"propositions"',
    '"row position"',
    '"service scenario"',
  ])
})

test('the panel props a reader reads are read too', () => {
  // #628's third string was a `hint`, and the prop list did not name it. Every
  // prop added with it is planted here: a list that names a prop and does not
  // read it is the same silence as not naming it.
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '<PanelTextareaField hint="the sentence that makes the column legible" />',
        '<PanelHeader description="a service scenario, end to end" closeLabel="Close the layer" />',
        '<PanelIdentity meta="different columns on 3 paths" />',
        '<EmptyState summary="No lifecycle yet" />',
        '<PanelErrorBoundary message="This slice item failed to display." />',
        '<Expandable triggerLabel="Expand: row position" />',
        '<KpiRows addLabel="Add a cell trigger" removeLabel="Remove a check name" />',
        '<OwnerTagSelect ariaLabel="Perceived layer" />',
      ].join('\n'),
    },
  ]
  const found = offenders(readerFacingStrings(planted)).map((one) => one.split(' — ')[1])
  assert.deepEqual(found.sort(), [
    '"cell trigger"',
    '"check name"',
    '"column"',
    '"columns"',
    '"layer"',
    '"layer"',
    '"lifecycle"',
    '"row position"',
    '"service scenario"',
    '"slice item"',
  ])
})

test('a sentence assembled into a named local is read', () => {
  // The shape that got past the prop scan: the prop holds an identifier and
  // the sentence was built three lines above it. The binding after it has to
  // stay out of the first one's initialiser, which is what the indent rule is
  // for, and `positionClass` is not copy and is not read.
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '  const positionLabel =',
        '    step.positions.length === 0',
        '      ? `different columns on ${step.positions.length} paths`',
        '      : null',
        '  const positionClass = "flex-col gap-2"',
        '',
        '  return <PanelIdentity meta={positionLabel} className={positionClass} />',
      ].join('\n'),
    },
  ]
  const strings = readerFacingStrings(planted).filter((one) => one.where === 'copy binding')
  assert.deepEqual(strings.map((one) => one.value), ['different columns on   paths'])
  assert.deepEqual(
    offenders(strings).map((one) => one.split(' — ')[1]),
    ['"columns"'],
  )
})

test('the guard does not read what it excludes', () => {
  const quiet = [
    {
      file: 'components/quiet.tsx',
      code: [
        // An identifier, an import, a data attribute and a database name are
        // each somebody else's subject. `CanvasAnnotationLayer` is the real
        // case: a rendering layer, legitimately named, and not copy.
        "import { CanvasAnnotationLayer } from '@/components/canvas'",
        '<div data-canvas-annotation-layer className="layer-1">',
        "  {supabase.from('service_lifecycles')}",
        '</div>',
      ].join('\n'),
    },
    { file: 'lib/not-a-component.ts', code: '<span>the layer</span>' },
  ]
  assert.deepEqual(offenders(readerFacingStrings(quiet)), [])
})

/**
 * The one word this list keys on the plural, stated here rather than left to
 * the list to be read as an oversight.
 *
 * `21000111` renamed the table `propositions`; it did not retire the English
 * noun. Its own header says what the collision was — the word "already means
 * something else one level down: a CELL's value proposition" — and
 * `cells.value_props` is that phrase abbreviated. So the panel label
 * `Value proposition` (#89) is the schema's own word spelled out, and a word
 * list that flagged it would be pushing a reader away from the name of the
 * column they are editing.
 *
 * This is not the forbidden move the header above describes. Dropping `layer`
 * to silence a legitimate use would leave the retired NAME uncovered; the
 * retired name here is the plural, and the plural is still on the list.
 */
test('the singular is a live word, and only the retired plural is flagged', () => {
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '<Field label="Value proposition" />',
        '<Field label={"Propositions"} />',
      ].join('\n'),
    },
  ]
  const found = offenders(readerFacingStrings(planted)).map((one) => one.split(' — ')[1])
  assert.deepEqual(found, ['"propositions"'])
})

/**
 * #552 — "kit" named the template, and "template" is the one word now.
 * Whole-word, because a substring would flag `kitchen`, `toolkit`, `kitfox`
 * and every `-webkit-` utility this tree actually writes.
 */
test('kit is retired as a whole word, and words that merely contain it pass', () => {
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '<span>cloned the kit</span>',
        '<Field label="kitchen" />',
        '<img alt="the toolkit" />',
        '<Button aria-label="kitfox" />',
      ].join('\n'),
    },
  ]
  const found = offenders(readerFacingStrings(planted)).map((one) => one.split(' — ')[1])
  assert.deepEqual(found, ['"kit"'])
})

/**
 * "Columns" labelled a count of steps, and "step" is the glossary's word for
 * what the board draws as a column. A layout column kept in a `className`, a
 * `data-*` attribute or an identifier is never this guard's subject, so it
 * needs no exemption, and it is planted here beside the copy the guard must
 * flag.
 */
test('a step is not called a column on screen, and a layout column in code passes', () => {
  const planted = [
    {
      file: 'components/planted.tsx',
      code: [
        '<span>Columns</span>',
        '<Button aria-label="Select the Sign up column" />',
        '<div className="grid-cols-3 flex-col" data-blueprint-column-header="">',
        '  <span>Steps</span>',
        '</div>',
      ].join('\n'),
    },
  ]
  const found = offenders(readerFacingStrings(planted)).map((one) => one.split(' — ')[1])
  assert.deepEqual(found.sort(), ['"column"', '"columns"'])
})

/* --------------------------------------------------------- the copy modules */

/**
 * THIRD SUBJECT: the `.ts` modules whose job is the words themselves.
 *
 * Two of #628's three strings were here and not in any component: a definition
 * in `panelTerms.ts` and a validation message in `sliceValidation.ts`. Neither
 * is a prop and neither is a text node, so no amount of widening the first
 * subject reaches them — a component that renders `PANEL_TERMS.step` renders an
 * identifier, and the sentence is a field of a plain object one import away.
 *
 * ENROLMENT, NOT THE TREE, and the header says what that costs. A module earns
 * a place here by holding copy and nothing else, so that EVERY string in it can
 * be read without a single exemption; that is the property the tree as a whole
 * does not have. Each entry says why in a sentence a stranger can check, and
 * the paths are asserted to exist so a rename cannot quietly empty the list.
 */
const COPY_MODULES = [
  {
    path: 'src/lib/panelTerms.ts',
    because:
      'it is nothing but sentences a reader hovers to read — the two invented ' +
      'words and the six entity kinds — and it holds no identifier, no class ' +
      'name and no database name for a word list to trip over.',
  },
  {
    path: 'src/lib/sliceValidation.ts',
    because:
      'every `message` it returns is shown to the author inline, in place of ' +
      'the PostgREST error it exists to replace. Its own header says so.',
  },
]

/** Every string in an enrolled copy module, comments and `${…}` removed. */
export function copyModuleStrings(modules = COPY_MODULES) {
  const out = []
  for (const { path } of modules) {
    const code = stripComments(readFileSync(resolve(APP_PACKAGE, path), 'utf8'))
    for (const literal of code.matchAll(STRING_LITERAL)) {
      const value = literalText(literal[1] ?? literal[2] ?? literal[3] ?? '').trim()
      if (value && /[A-Za-z]/.test(value)) out.push({ file: path, where: 'copy', value })
    }
  }
  return out
}

test('no retired spelling reaches a reader from a copy module', () => {
  const found = offenders(copyModuleStrings())
  assert.deepEqual(
    found,
    [],
    'A retired word is in a module whose whole job is the words a reader ' +
      `reads. It reaches a popover or an inline error the same way a label ` +
      `does:\n${found.join('\n')}`,
  )
})

test('every enrolled copy module exists, and says why it is enrolled', () => {
  // A list pointing at a renamed file reads exactly like a clean codebase.
  assert.ok(COPY_MODULES.length > 0)
  for (const entry of COPY_MODULES) {
    assert.ok(existsSync(resolve(APP_PACKAGE, entry.path)), `${entry.path} is gone`)
    assert.ok(entry.because.length > 40, `${entry.path} says nothing about why`)
  }
  assert.ok(copyModuleStrings().length > 10, 'the copy modules parsed to almost no text')
})

test('the copy-module reader reads a plain field and a template literal', () => {
  // The two shapes #628 escaped through, and the interpolation blanked out.
  const planted = `
    export const TERMS = {
      step: { definition: 'A column of the board, read down every lane.' },
    }
    export function problem(draft) {
      return { message: \`Unknown slice type “\${draft.sliceKind}”.\` }
    }
  `
  const values = []
  for (const literal of stripComments(planted).matchAll(STRING_LITERAL)) {
    values.push(literalText(literal[1] ?? literal[2] ?? literal[3] ?? '').trim())
  }
  assert.deepEqual(values, [
    'A column of the board, read down every lane.',
    'Unknown slice type “ ”.',
  ])
  assert.deepEqual(
    offenders(values.map((value) => ({ file: 'planted.ts', where: 'copy', value }))).map(
      (one) => one.split(' — ')[1],
    ),
    ['"column"', '"slice type"'],
  )
})

/* ------------------------------------------------------------- the figures */

/**
 * SECOND SUBJECT: the text inside the authored diagrams.
 *
 * `docs/assets/` is where the figures are authored; `sync-cover-assets.mjs`
 * copies them to the gitignored `public/cover/` at predev and prebuild, and
 * `CoverPage` renders them **inside the app**. So a word in a `<text>` node
 * reaches a reader the way a heading does, and it reaches every instance built
 * from this template as well.
 *
 * Added because the first subject could not see them at all. Every rename this
 * repository has run — `service_lifecycles` to `services`, `layers` to `lanes`,
 * `propositions` to `business_model` — had to be carried into these files by
 * hand, and a figure that was missed would say the retired word on every cover
 * page built from this template with nothing reporting it. Any copy of these
 * files kept outside this repository inherits that, which is the reason to fix
 * the mechanism here rather than in the copies.
 *
 * This is a widened SUBJECT, not a widened word list. Same
 * `RETIRED_COPY_WORDS`, same `offenders()`; only where a reader-facing string
 * is looked for has changed.
 *
 * `<text>` only. Not `id`, not `class`, not an SVG comment, not the filename —
 * a figure called `four-ways-in.svg` is nobody's copy. `public/cover/` is
 * deliberately NOT read: it is generated, gitignored, and a check that reads
 * build output reports the same finding twice.
 */
const FIGURES = resolve(REPO_ROOT, 'docs/assets')

/** `<text>` content, with any `<tspan>` markup inside it flattened away. */
const SVG_TEXT = /<text\b[^>]*>([\s\S]*?)<\/text>/g

export function figureStrings(files = figureFiles()) {
  const out = []
  for (const { file, code } of files) {
    for (const match of code.matchAll(SVG_TEXT)) {
      const value = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      if (value && /[A-Za-z]/.test(value)) out.push({ file, where: 'text', value })
    }
  }
  return out
}

function figureFiles() {
  return readdirSync(FIGURES)
    .filter((name) => name.endsWith('.svg'))
    .sort()
    .map((name) => ({
      file: `docs/assets/${name}`,
      code: readFileSync(resolve(FIGURES, name), 'utf8'),
    }))
}

test('no retired spelling reaches a reader through a figure', () => {
  const found = offenders(figureStrings())
  assert.deepEqual(
    found,
    [],
    'A retired word is on screen in a diagram. These render in the app through ' +
      `the cover page, not only in a README:\n${found.join('\n')}`,
  )
})

test('the figure guard reads the text nodes it claims to', () => {
  // The extraction, on the shapes the real files use: a plain node, one broken
  // across lines, one built from tspans, and the attributes NOT read.
  const planted = [
    {
      file: 'docs/assets/planted.svg',
      code: [
        '<text x="10" y="20" class="uiLabel">Service lifecycle</text>',
        '<text x="10" y="40">a row',
        '  position</text>',
        '<text x="10" y="60"><tspan>one</tspan> <tspan>lane</tspan></text>',
        '<rect id="layer-1" class="layer" data-note="the layer"/>',
        '<!-- a lifecycle in a comment is not copy -->',
      ].join('\n'),
    },
  ]
  const strings = figureStrings(planted)
  assert.deepEqual(
    strings.map((one) => one.value),
    ['Service lifecycle', 'a row position', 'one lane'],
  )
  assert.deepEqual(
    offenders(strings).map((one) => one.split(' — ')[1]).sort(),
    ['"lifecycle"', '"row position"'],
  )
})

test('every authored figure is covered, and there are some', () => {
  // A reader that found no files would pass the assertion above in silence,
  // which is the failure mode this whole file is written against.
  const files = figureFiles()
  assert.equal(files.length, coverAssetFiles().length)
  assert.ok(figureStrings(files).length > 100, 'the figures parsed to almost no text')
})

/**
 * The shape a MECHANICAL rename leaves behind.
 *
 * `21000104` renamed `layers` to `lanes`, and the prose was carried over by
 * word replacement, so eleven sentences using `layer` in its ordinary English
 * sense came out with `lane` substituted into the middle of a word or an
 * unrelated idea: "tabs laneed", "deliberately unlaneed", "the semantic lane"
 * of design tokens. Every one passed `tsc`, every check, and review — a
 * comment is not the subject of any of them (#327).
 *
 * These three patterns are not about `lane`. They are about the residue: a
 * word that exists in no dictionary, and one phrase whose meaning the rename
 * inverted. The list grows the next time a rename mangles something, which is
 * the point — a sweep that only knows the last one is a fixed bug, not a
 * guard.
 *
 * `semantic lane_role` and `semantic lane roles` are deliberately NOT residue:
 * the column is named that, and roles that are semantic is what this codebase
 * means by the phrase. The negative lookahead is what tells the two apart —
 * the residue is `semantic lane` standing where a TIER was meant, with no role
 * after it.
 *
 * THE LIST GREW FOR `visual` → `storyboard` (#391), which is the same hazard
 * with a wider blast radius: `visual` is an ordinary English adjective in this
 * tree in a dozen places a rename has no business touching — a panel is
 * `visually` de-emphasised, WebKit's `visual` viewport is a platform term, a
 * divider band has a `visual` width. Two of the three shapes below are the
 * non-words a word replacement makes of the -ly and -ise families, and those
 * are the reliable half: no dictionary has them, so no sentence can want them.
 *
 * The third is the `semantic lane` case one rename over. A storyboard is made
 * of FRAMES — `21000115000000` settled that word, and the rename map's
 * `cells.picture` row says why — so "storyboard element" is never what a
 * sentence in this repository means; it is "visual element" with the noun
 * swapped, which is the shape `agents/document-reader.md` would have taken.
 * No pattern is offered for "storyboard centre" or "storyboard order",
 * because both halves of those are ordinary English and the only rule that
 * separates them is the list of sentences they came from — a fixed bug rather
 * than a guard.
 *
 * THE LIST GREW AGAIN FOR `trigger` → `dependency` (#159), and this time
 * BEFORE the rename rather than after it. The two words differ from the pairs
 * above in the way that
 * matters here: `trigger` is a VERB as well as a noun, and the sentences the
 * rename passes through use it as one — `slice_tools.py` describes an actor
 * "being triggered by" a cell and "triggering" another, two lines from the
 * `path["triggers"]` array whose name really did move. A word replacement over
 * that file makes non-words of both inflections, and `dependency` has no verb
 * form to make them out of, so no sentence in this tree can want either. That
 * is the same reliability test the -ly and -ise shapes above pass, which is why
 * these two are worth keying on and why no pattern is offered for the noun: a
 * "dependency arrow" and a "dependency edge" are exactly what this vocabulary
 * now means, and a guard that flagged them would forbid the word the rename
 * installed.
 */
const MANGLED = [
  { pattern: /\blaneed\b/i, meant: 'layered' },
  { pattern: /\bunlaneed\b/i, meant: 'unlayered' },
  { pattern: /\bsemantic lane(?![_ ]roles?\b)/i, meant: 'semantic layer' },
  { pattern: /\bstoryboardly\b/i, meant: 'visually' },
  { pattern: /\bstoryboardi[sz](?:e|es|ed|ing|ation|ations)\b/i, meant: 'visualise / visualisation' },
  { pattern: /\bstoryboard elements?\b/i, meant: 'visual element' },
  { pattern: /\bdependencyed\b/i, meant: 'triggered' },
  { pattern: /\bdependencying\b/i, meant: 'triggering' },
]

/**
 * Documents that must be able to write the residue down.
 *
 * This file plants every shape to prove the sweep reads it. A changeset and
 * the CHANGELOG are the same case one step out: the note explaining that
 * "tabs laneed" became "tabs layered" has to quote both, and CONTEXT.md's
 * standing rule — an applied or dated record keeps the spelling it was
 * written with — already covers the second. Neither is prose an agent or a
 * reader is taught from, which is what the sweep is protecting.
 */
const MANGLE_EXEMPT = [
  'scripts/tests/retired-copy.test.mjs',
  'scripts/tests/a-lane-is-not-a-layer.test.mjs',
  'CHANGELOG.md',
]

/** Whether a path is one of those documents. */
export function mangleExempt(path) {
  return MANGLE_EXEMPT.includes(path) || path.startsWith('.changeset/')
}

/**
 * A line's continuation, with whatever marker starts it taken off.
 *
 * ` * lane renders greyscale` continues a doc comment; `  lane renders` a
 * wrapped markdown paragraph. Neither marker is part of the sentence.
 */
const CONTINUATION = /^\s*(?:\*|\/\/|#|-|>)?\s*/

/**
 * Each line, and each line joined to the one after it.
 *
 * `semantic lane` reached `references/customization.md` and survived every
 * run of this sweep, because the phrase WRAPPED: "so the whole semantic"
 * ended one line and "lane renders greyscale" began the next, and a per-line
 * test cannot see a phrase that no single line contains. Only the multi-word
 * patterns can be split this way — a wrap cannot break `laneed` — but the
 * sweep does not have to know which is which, so both are read the same way.
 *
 * A hit is reported on the FIRST of the two lines, which is where a reader
 * starts reading the sentence.
 *
 * The join is only allowed to report a match that STRADDLES the boundary —
 * one that neither line carries by itself. Without that, a line whose
 * NEIGHBOUR contains the whole phrase gets blamed for it, and every wrapped
 * paragraph reports its residue twice, on the line above it and on itself.
 */
export function mangledIn(source) {
  const hits = []
  const lines = source.split('\n')
  lines.forEach((line, index) => {
    const next = lines[index + 1]
    const tail = next === undefined ? '' : next.replace(CONTINUATION, '')
    const joined = `${line} ${tail}`.replace(/\s+/g, ' ')
    for (const { pattern, meant } of MANGLED) {
      if (pattern.test(line)) hits.push({ line: index + 1, meant })
      else if (pattern.test(joined) && !pattern.test(tail)) {
        hits.push({ line: index + 1, meant })
      }
    }
  })
  return hits
}

test('a rename left no mangled English behind', () => {
  const walk = scannedSweep(REPO_ROOT)
  const found = walk.files
    .filter((path) => !mangleExempt(path))
    .flatMap((path) => {
      const source = walk.read(path)
      if (source === null) return [] // listed, then gone before this read
      if (source.includes('\0')) return [] // binary
      return mangledIn(source).map((hit) => `${path}:${hit.line} — meant "${hit.meant}"`)
    })
  assert.deepEqual(found, [])
})

test('the documents that record a rename may quote what it mangled', () => {
  // By path rule, not by line: a changeset explaining the fix quotes the
  // broken word and the right one in the same sentence, and no pattern
  // separates that from the wreckage itself.
  assert.ok(mangleExempt('.changeset/a-layer-of-tokens-is-not-a-lane.md'))
  assert.ok(mangleExempt('CHANGELOG.md'))
  assert.ok(mangleExempt('scripts/tests/retired-copy.test.mjs'))
  assert.ok(!mangleExempt('docs/engineering/checks.md'))
  assert.ok(!mangleExempt('src/styles/animations.css'))
})

test('the sweep reads the residue and not the column it resembles', () => {
  assert.deepEqual(
    mangledIn(
      [
        'tabs laneed over the base view',
        'deliberately unlaneed so they win',
        'the semantic lane above has one job',
        'the semantic lane_role, never the display name',
        'Semantic lane roles — the contract between content and rendering',
        'a lane is a row of the blueprint',
      ].join('\n'),
    ).map((hit) => `${hit.line}:${hit.meant}`),
    ['1:layered', '2:unlayered', '3:semantic layer'],
  )
})

test('the sweep reads a phrase the wrap broke in half', () => {
  // The shape that got past it. `references/customization.md` carried
  // "the whole semantic / lane renders greyscale" across a wrap for as long
  // as this sweep has existed, and every run read both halves and saw
  // nothing wrong with either.
  assert.deepEqual(
    mangledIn(
      [
        '  template ships hue-neutral — every chroma dial is 0, so the whole semantic',
        '  lane renders greyscale. To rebrand: set `--hue` to your OKLCH hue,',
      ].join('\n'),
    ).map((hit) => `${hit.line}:${hit.meant}`),
    ['1:semantic layer'],
  )
  // A doc comment's continuation marker is not part of the sentence.
  assert.deepEqual(
    mangledIn(['   * the design system\'s own semantic', '   * lane above has one job'].join('\n'))
      .map((hit) => `${hit.line}:${hit.meant}`),
    ['1:semantic layer'],
  )
  // And the column the phrase resembles still passes when IT wraps.
  assert.deepEqual(
    mangledIn(['  * the semantic', '  * lane_role, never the display name'].join('\n')),
    [],
  )
})

test('the sweep reads what a trigger → dependency replacement would leave', () => {
  // The verb forms only. The noun phrases below them are the vocabulary this
  // rename installs, so all three have to pass — a guard that flagged
  // "dependency edge" would forbid the settled word.
  assert.deepEqual(
    mangledIn(
      [
        'being dependencyed by the actor is contact',
        'the cell dependencying them is contact too',
        'a dependency edge between two cells on the same path',
        'when two dependencies arrive at one target cell',
        'the dependency arrows fade in last',
      ].join('\n'),
    ).map((hit) => `${hit.line}:${hit.meant}`),
    ['1:triggered', '2:triggering'],
  )
})

test('the sweep reads what a visual → storyboard replacement leaves', () => {
  // The shapes #391 could have produced, against the words it must not touch.
  // `storyboards` is a real plural and `storyboard frame` is the settled
  // phrase, so both have to pass — a guard that flagged them would be read as
  // forbidding the word the rename installed.
  assert.deepEqual(
    mangledIn(
      [
        'this panel is storyboardly de-emphasized',
        'a storyboardisation of the journey',
        'we storyboardize the strip on mount',
        'spatial/storyboard elements that do not fit the grid',
        'a storyboard element',
        'the board carries two storyboards',
        'a storyboard frame is one image on one cell',
        'the storyboard row draws nothing of its own',
      ].join('\n'),
    ).map((hit) => `${hit.line}:${hit.meant}`),
    [
      '1:visually',
      '2:visualise / visualisation',
      '3:visualise / visualisation',
      '4:visual element',
      '5:visual element',
    ],
  )
})
