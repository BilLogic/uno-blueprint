/**
 * Check E — the slice surface never calls a slide a screen.
 *
 * Three words are settled and distinct. A **frame** is one image on one cell,
 * the `cells.frame` column. A **slide** is one row of a slice, the `slides`
 * table. **screen** is ordinary English — a display, a viewport, the surface a
 * reader happens to be looking at — and is not a name for anything on the
 * board. `GLOSSARY.md` defines all three; `scripts/retired-vocabulary.mjs`
 * records why letting the schema's own prose call a slide a frame was the
 * defect the `slides` rename fixed.
 *
 * The slice editor had drifted to a third spelling and printed it: a title
 * placeholder, an add button, a delete tooltip and a remove tooltip all said
 * "screen", one component carried the index of a slide as `screenIndex`, and
 * the sheet beside it reconciled a selection into "screens". None of that is a
 * retired NAME, so the identifier sweep had nothing to match and Check C —
 * which reads reader-facing strings, and reads them well — had nothing in its
 * word list either. A valid English word used for the wrong thing is invisible
 * to both, and this is the guard for that case.
 *
 * SUBJECT: every non-test `.ts` and `.tsx` under `src` whose path names the
 * slice surface, COMMENTS REMOVED. What is left is identifiers and strings —
 * the two places where a word is a NAME rather than an explanation.
 *
 * COMMENTS ARE NOT THE SUBJECT, and that is the rule that keeps this guard
 * honest rather than an exemption it needs. `SliceHeaderBand` says the two
 * modes read as one object "rather than as two unrelated screens", and
 * `SlicePresentation` says presentation is a mode of the slice "not a separate
 * screen". Both are the ordinary word, correctly used, about surfaces and not
 * about slides. A guard that read them would be answered by rewriting true
 * sentences, which is how the sibling `layer`/`lane` sweep mangled forty of
 * them. Prose may use an English word; a name may not misuse one.
 *
 * TEST FILES ARE NOT THE SUBJECT either, for a reason about the word rather
 * than about tests: `screen` is Testing Library's own export, so every
 * occurrence in a `*.test.tsx` is a library binding this vocabulary has no
 * claim on. The `where` filter below drops them.
 *
 * WHERE THE FILES COME FROM is the `app` subject of `scripts/sweep.mjs`, which
 * answers with this tree's `src` or the one inside
 * `node_modules/uno-blueprint` in a deployment that keeps no copy,
 * and hands back one `src/…` path per file whichever it was. The reporting is
 * what was left to get wrong here: a path made relative to this tree's root came
 * back as `node_modules/uno-blueprint/src/components/editor/…`
 * there, which `SLICE_SURFACE` still matches but which the two files named below
 * do not, so the walk's own proof that it reached the editor failed in the one
 * arrangement it was written to survive.
 *
 * THERE IS NO ASSERTION ABOUT `frame`, deliberately. A frame is a real thing
 * on this surface — `SlideImagesField` shows one — so no rule about the
 * word can be written that is not a list of today's identifiers, and a census
 * breaks on the next unrelated edit. `screen` admits an invariant precisely
 * because it names nothing here at all.
 *
 * IF THIS PRODUCES A FALSE POSITIVE, NARROW THE SUBJECT — NEVER THE WORD.
 * Fewer paths, or comments-only extraction. A `screen` genuinely about a
 * display, in a name, on this surface, is a conversation and not a silencing.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { sweep } from '../sweep.mjs'

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname)

/**
 * The slice surface, by path rather than by enumeration: anything whose file
 * name carries `slice`. A new slice component is covered the day it is
 * written, which an explicit list of four files would not be.
 */
const SLICE_SURFACE = /(^|\/)[^/]*slice[^/]*\.(ts|tsx)$/i

/**
 * `screen` and `screens` as a word, camelCase included — `screenIndex` and
 * `mergeSelectionIntoScreens` are the shapes this exists to catch. The
 * lookahead is what lets `screenshot` through: a following lowercase letter
 * means the word has not ended, and a screenshot is a picture of a display,
 * which nobody has ever confused with a slide.
 *
 * NO `i` FLAG, and the two capitalisations are written out instead. Under `i`
 * the lookahead is case-insensitive too, so the `I` of `screenIndex` reads as
 * a lowercase letter and the exact camelCase shape this was written to catch
 * is the one thing it misses. The extraction test below is what found that.
 */
const SCREEN = /[Ss]creens?(?![a-z])/

/** Comments removed — the header says they are not the subject. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * The slice surface, swept.
 *
 * A SURFACE THAT COMES BACK EMPTY THROWS, and the sweep is what throws: a tree
 * with no slice file in it is not a tree whose slice surface is clean, and the
 * two report the same green line — every run after, because nothing about a walk
 * that has stopped finding its subject looks different from one that found it
 * and agreed.
 */
export function sliceSurface() {
  return sweep({
    subject: 'app',
    root: REPO_ROOT,
    where: (path) => SLICE_SURFACE.test(path) && !/\.test\.tsx?$/.test(path),
    what: 'slice file',
  })
}

/** Every line of the slice surface that names something `screen`. */
export function screenNames(swept = sliceSurface()) {
  const out = []
  for (const file of swept.files) {
    const source = swept.read(file)
    if (source === null) continue // gone between the listing and the read
    stripComments(source)
      .split('\n')
      .forEach((line, index) => {
        if (SCREEN.test(line)) out.push(`${file}:${index + 1} ${line.trim()}`)
      })
  }
  return out
}

test('nothing on the slice surface is named a screen', () => {
  const found = screenNames()
  assert.deepEqual(
    found,
    [],
    'A slide is a row of a slice and a frame is one image on one cell. ' +
      '"screen" names neither, and a name or a string on this surface that ' +
      'says it is either a slide wearing the wrong word or a frame wearing ' +
      `it — see GLOSSARY.md:\n${found.join('\n')}`,
  )
})

test('the guard reads names and not prose', () => {
  // The subject, exercised directly. A guard whose extraction is wrong
  // reports clean forever and nobody finds out.
  const files = sliceSurface().files
  assert.ok(
    files.includes('src/components/editor/SliceSlideEditor.tsx'),
    'the walk must reach the editor this check was written for',
  )
  assert.ok(
    files.includes('src/components/editor/CreateSliceSheet.tsx'),
    'the walk must reach the create sheet, whose name leads with Create',
  )

  assert.ok(SCREEN.test('const screenIndex = 1'), 'camelCase is a name')
  assert.ok(SCREEN.test('placeholder="Screen title"'), 'a string is a name')
  assert.ok(SCREEN.test('mergeSelectionIntoScreens('), 'so is a plural suffix')
  assert.ok(!SCREEN.test('await screenshot(page)'), 'a screenshot is a picture')
  assert.ok(
    !SCREEN.test(stripComments('// two unrelated screens')),
    'a line comment is stripped before the word is looked for',
  )
  assert.ok(
    !SCREEN.test(stripComments('/* not a separate screen */')),
    'and so is a block comment',
  )
})
