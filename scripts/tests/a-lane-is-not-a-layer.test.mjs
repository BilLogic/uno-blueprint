/**
 * Check F — a lane is a row of the board, and nothing else is a lane.
 *
 * A **lane** is one actor's activity across the steps: a ROW, a `lanes` row,
 * carrying a `lane_role` from a closed set. `GLOSSARY.md` defines it. A
 * **layer** is anything stacked, staged, composited or tiered — the CSS
 * cascade's `@layer`, a composited paint layer, the opaque cover a boot
 * skeleton draws over a sidebar, a rung of the canvas reveal, a design-token
 * tier, an architectural tier like "the tool layer". The two words name
 * disjoint things and this repository needs both.
 *
 * `21000104` renamed the table `layers` to `lanes` and the prose was carried
 * over by word replacement, so every sentence using `layer` in one of those
 * OTHER senses came out saying `lane`. `a1bb7d4a` restored eleven of them;
 * roughly ninety more survived, in comments, in test names, in a prop typed
 * `ArrowLayer` but called `lane`, and in one paragraph a reader sees.
 *
 * WHY THE EXISTING GUARDS COULD NOT SEE THEM. Check A and Check B read
 * database identifiers, and none of these is one. Check C reads the strings a
 * reader meets, and almost none of these reaches a reader. The residue sweep
 * beside Check C catches what a replacement makes of a word it lands INSIDE —
 * `laneed`, `unlaneed` — which is a non-word, and therefore decidable. None of
 * that reaches a valid English word standing for the wrong idea, which is the
 * other half of what a rename over prose produces and the half this file is
 * for.
 *
 * ── SUBJECT: PROSE INCLUDED, WHICH INVERTS CHECK E ─────────────────────────
 *
 * `a-slide-is-not-a-screen.test.mjs` reads names with COMMENTS REMOVED, and
 * its header says why: prose may use an English word, a name may not misuse
 * one. That rule is right for `screen`, which names nothing on the slice
 * surface, and it is exactly wrong here. `lane` is this vocabulary's own word,
 * so the damage is not a name misusing English — it is prose using the domain
 * word for something that is not in the domain. Every site listed above but
 * three lives in a comment. So comments are IN the subject, and the price of
 * that is paid below: the patterns have to earn their place one at a time.
 *
 * ── WHY THIS IS COLLOCATION AND NOT A LIST OF SITES ────────────────────────
 *
 * Four cheaper shapes were tried against the whole tree first, and each is
 * recorded here because the next person will think of them too.
 *
 * POSITION does not separate the senses. In `blueprint.css`, 40 of the 44
 * correct uses of `lane` are in comments and so are all 9 wrong ones; line
 * 700 says "phase frames + lane structure", which is the board, and the very
 * next comment block says "each lane opens when the one before it", which is
 * the reveal. One file, one region, both senses.
 *
 * A PER-FILE SENSE DECLARATION does not work for the same reason, one level
 * up. 91 of the 189 files that use the word hold no lane identifier at all
 * and still discuss board lanes correctly in prose; and the three worst-hit
 * files — `blueprint.css`, `EditorShell.tsx`, `ServiceOverviewView.tsx` —
 * each carry both senses, `EditorShell` within a single sentence: "One layer
 * fixes both … the beat the canvas opens its phase lanes".
 *
 * THE PRE-RENAME TREE IS NOT AN ORACLE, though it is the best evidence there
 * is and it settled a dozen calls. Before the rename `layer` was BOTH words:
 * the schema's name for a row AND the stacking sense. So a pre-rename `layer`
 * may be either — `ServiceOverviewView` had 17 of them, 16 the reveal and one
 * the board's row count. Only the negative direction is sound: a pre-rename
 * `lane` was never touched by the sweep and is therefore the domain word.
 *
 * AN ALLOWLIST OF MODIFIERS is unbuildable. The words that precede `lane` in
 * this tree are overwhelmingly determiners and ordinary adjectives — "a
 * read-only lane", "an empty lane", "the leftmost lane" — so a rule requiring
 * the modifier to be board vocabulary would fail on ordinary writing.
 *
 * What is left, and what this file asserts, is the company the word keeps. A
 * lane is a row of the board: it is not painted over anything, it does not
 * stack, it is not a rung of an animation, and it is not a tier of software.
 * So `lane` may not stand in the vocabulary of the cascade, of compositing,
 * of stacking or of an architectural tier. EACH PATTERN NAMES A CONCEPT, NOT
 * A SITE. `boot lane` is forbidden because a row of the board does not boot,
 * not because twelve files said it; the thirteenth is caught the day it is
 * written, and this file has no idea how many there are.
 *
 * ── WHAT THIS CANNOT SEE, STATED RATHER THAN HIDDEN ────────────────────────
 *
 * Measured against the ninety-odd sentences actually repaired, these patterns
 * catch a little under half. The rest are ANAPHORA: a comment establishes
 * "the boot layer" in its first sentence and says "the lane" four sentences
 * later, or writes "each lane opens when the one before it". The referent is
 * a paragraph away and no line-local rule reaches it. Resolving that needs a
 * parser and a model of the paragraph, which is a bigger machine than the
 * defect deserves and one whose false positives would be argued about
 * forever.
 *
 * That is a real limit and it is the honest one. What makes it tolerable is
 * that anaphora does not arrive alone: a paragraph that says "the lane"
 * meaning a layer almost always NAMES the thing once, and naming it is what
 * this file catches. A sweep that mangles a paragraph trips the pattern on
 * the sentence that introduced the noun, and the reader fixing that line has
 * the rest of the paragraph in front of them.
 *
 * IDENTIFIERS NEED ONLY THEIR DECLARATION CAUGHT, which is why the name
 * patterns below are short. `lane: ArrowLayer` was one line; correcting it
 * turned all twenty-one of its uses into type errors, so `tsc` did the sweep.
 * A guard that also listed `lane === 'forward'` would be enumerating what the
 * compiler already reports.
 *
 * A QUOTED IDENTIFIER IN A COMMENT IS THE HOLE IN THAT ARGUMENT, and
 * `canvasStackingContract.test.ts` sat in it from the rename until a
 * deployment reading the same file found it. That file's header
 * recalls the assertion it used to make, quoting the ternary as a string:
 * "pin `lane === 'forward' ? ...` as an exact substring". The sweep rewrote a
 * `layer` that no compiler was ever going to read, so the paragraph above
 * does not hold — `tsc` sweeps identifiers in CODE, and prose quoting an
 * identifier has no such backstop. The comment then misquoted the very line
 * it documents, which is the worst form this defect takes: the reader who
 * checks the code against the comment finds them disagreeing and cannot tell
 * which one moved.
 *
 * A TEST TITLE IS THE SECOND SHAPE, from that same file: `contains
 * canvas-local lanes in one stacking context`. Here the layer word is right
 * there in the sentence and is even in `LAYER_SENSE` — but it sits AFTER the
 * noun, inside `stacking context`, and these patterns read the word BEFORE.
 * Reading the whole line instead would fire on true sentences: `EditorShell`
 * and `ScenarioBlueprintPanel` both describe "one lane rail" and slots
 * "stacking each path's version" in one breath, and a lane genuinely does sit
 * inside a stacking context. The collocation is real in both directions,
 * which is exactly why proximity cannot decide it.
 *
 * A WRAPPED NOUN PHRASE IS THE THIRD SHAPE, and unlike the two above it is
 * cheap to close: every pattern here is line-local, so `boot\nlane` — the
 * phrase split across a line break — walks past a rule that forbids `boot
 * lane` outright. ADR 0007 carried it for months. Joining wrapped lines
 * before matching would catch it; that is a real upgrade someone should make.
 *
 * A PATTERN HIT IS A FLAG ON THE PARAGRAPH, NOT THE LINE. `aa2b3582` fixed
 * exactly the two lines this file's patterns matched in ADR 0007 and left two
 * more standing in the same sentences — one of them the very next clause,
 * where "the shell's boot layer" is followed by "released by the lane alone".
 * Anaphora is how this defect survives a cleanup: the corrected sentence
 * names the referent, and the sentence after it says "the lane".
 *
 * NEITHER WAS WIDENED FOR, deliberately. The first needs `lane === 'forward'`
 * listed, which the paragraph above argues against and the test below still
 * asserts returns nothing. The second needs a rule that reads the sentence.
 * Both are written down here instead, because a limit this section names is
 * one the next reader can work around, and a limit it hides is one they
 * rediscover the way this one was rediscovered — from downstream.
 *
 * IF THIS PRODUCES A FALSE POSITIVE, THE ANSWER IS A CONVERSATION ABOUT THE
 * SENTENCE, NOT A NEW EXEMPTION. A genuine board lane described with one of
 * these words is a sentence worth rereading; if it survives the reread, the
 * pattern was wrong about the concept and the pattern goes.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { scannedSweep } from '../check-standalone.mjs'

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname)

/**
 * Documents that must be able to write the retired sense down.
 *
 * This file plants every shape to prove the sweep reads it; the residue sweep
 * next door plants its own; a changeset and the CHANGELOG are the same case
 * one step out, because the note explaining that "boot lane" became "boot
 * layer" has to quote both. None of it is prose an agent or a reader is
 * taught from, which is what this check protects.
 *
 * The same rule as `retired-copy.test.mjs`'s `MANGLE_EXEMPT`, spelled out
 * here rather than imported: a test file importing another test file
 * registers that file's tests twice, which its header says and this file
 * learned by doing it.
 */
const QUOTES_THE_RETIRED_SENSE = [
  'scripts/tests/a-lane-is-not-a-layer.test.mjs',
  'scripts/tests/retired-copy.test.mjs',
  'CHANGELOG.md',
]

/** Whether a path is one of those documents. */
export function quotesTheRetiredSense(path) {
  return QUOTES_THE_RETIRED_SENSE.includes(path) || path.startsWith('.changeset/')
}

/**
 * Words that belong to the cascade, to compositing, to stacking, to a staged
 * reveal, or to an architectural tier. A board row can be none of them.
 *
 * `semantic` carries the same exception the residue sweep next door already
 * documents and for the same reason: `semantic lane_role` is the column's
 * name and "semantic lane roles" is what this codebase calls roles that are
 * semantic. The residue is `semantic lane` standing where a TIER was meant,
 * with no role after it.
 */
const LAYER_SENSE = [
  'annotation', 'arrow', 'boot', 'cascade', 'chrome', 'composited',
  'compositing', 'context', 'forward', 'opaque', 'overlay', 'paint',
  'painted', 'persistence', 'presentation', 'scratch', 'semantic',
  'stacking', 'token', 'tool', 'translucent', 'transport', 'ts',
  'typescript', 'wrap', 'z-index',
]

/** Nouns a layer has and a row of a board does not. */
const LAYER_THING = ['boundary', 'boundaries', 'tree', 'hit-testing', 'hit-test']

/**
 * DOM and geometry handles. A lane is a row of DATA drawn by many elements
 * across the whole width of the board, so there is no single element that IS
 * a lane, and nothing to hold a ref, a rect or a scale of. A rendering layer
 * is exactly one element, which is why these compounds only ever meant one.
 */
const HANDLE = [
  'Ref', 'Rect', 'Element', 'Node', 'Scale', 'Interactive', 'Boundary',
  'Opacity', 'ZIndex',
]

export const PATTERNS = [
  {
    pattern: new RegExp(`\\b(?:${LAYER_SENSE.join('|')})[- ]lanes?\\b(?![_ ]roles?\\b)`, 'i'),
    means: 'a layer of the cascade, of paint, of the reveal, or of the stack',
  },
  {
    pattern: new RegExp(`\\blanes?[- ](?:${LAYER_THING.join('|')})\\b`, 'i'),
    means: 'a layer boundary or a layer tree',
  },
  {
    pattern: new RegExp(`[Ll]ane(?:${HANDLE.join('|')})\\b`),
    means: 'a handle on one element, which is a layer and never a row',
  },
  {
    pattern: /\blane[A-Za-z]*\s*:\s*[A-Za-z]*Layer\b/,
    means: 'a binding named for a lane and typed as a layer',
  },
]

/** Every line in `source` standing in the retired sense. */
export function layerSenseIn(source) {
  const hits = []
  source.split('\n').forEach((line, index) => {
    for (const { pattern, means } of PATTERNS) {
      if (pattern.test(line)) hits.push({ line: index + 1, means })
    }
  })
  return hits
}

test('nothing called a lane is a layer', () => {
  const walk = scannedSweep(REPO_ROOT)
  const found = walk.files
    .filter((path) => !quotesTheRetiredSense(path))
    .flatMap((path) => {
      const source = walk.read(path)
      if (source === null) return [] // listed, then gone before this read
      if (source.includes('\0')) return [] // binary
      return layerSenseIn(source).map((hit) => `${path}:${hit.line} — ${hit.means}`)
    })
  assert.deepEqual(
    found,
    [],
    'A lane is one actor\'s row across the steps — see GLOSSARY.md. The word ' +
      'here is standing for something stacked, staged, composited or tiered, ' +
      'which is a LAYER, and the rename that moved the table `layers` to ' +
      `\`lanes\` did not retire that English word:\n${found.join('\n')}`,
  )
})

test('the guard reads the company the word keeps', () => {
  // The subject, exercised directly. A guard whose extraction is wrong
  // reports clean forever and looks exactly like a codebase that is clean.
  assert.deepEqual(
    layerSenseIn(
      [
        "the sidebar's boot lane fires ONCE per entry",
        'Collapsing used to leave TWO chrome lanes stacked',
        'The way marks get out of the scratch lane.',
        'and this element is TRANSFORMED — a composited lane boundary',
        'Three rules, taken from Figma\'s lane tree:',
        'so the whole semantic lane renders greyscale',
        'Malformed arguments reach the tool lane as empty args',
        'All four sit on one shared context lane, so what any surface reads',
        'The reveal\'s arrow lane (stage 4).',
        'const laneRef = useRef<HTMLDivElement>(null)',
        'function getLaneScale(el: HTMLElement): number {',
        '  lane: ArrowLayer',
      ].join('\n'),
    ).map((hit) => hit.line),
    [1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  )
})

test('the guard leaves the board alone', () => {
  // Every one of these is a real sentence from this tree about a real lane.
  // They are the reason the patterns name concepts a row cannot have rather
  // than a vocabulary of rendering words that a board also uses — `ring`,
  // `shadow` and `fill` are all over the correct sentences below.
  assert.deepEqual(
    layerSenseIn(
      [
        'Semantic lane roles — the stable contract between blueprint content and',
        'the semantic lane_role, never the display name',
        'accent rather than the lane ring used for saved membership',
        'a touchpoint sits a step paler than the lane it lives in',
        '1  phase frames + lane structure fade in',
        'the beat the canvas opens its phase lanes',
        'fan onto adjacent lanes instead of overdrawing one line',
        'A lane belongs to ONE path, so a scenario with four paths has four',
        "the touchpoint lane's `touchpoints` variant",
        'Blueprint cells identify their lane by fill alone',
        'One touchpoint inside a touchpoint-lane cell',
        'a storyboard lane, an actor lane and a support lane',
        'const laneId = row.kind === \'lane\' ? (row.lane?.id ?? null) : null',
        'const getLaneRowMinHeight = (lane: BlueprintLane) => 0',
      ].join('\n'),
    ),
    [],
  )
})

test('a name is caught at its declaration, and the compiler does the rest', () => {
  // `lane: ArrowLayer` was one line typing a prop used twenty-one times.
  // The guard claims the declaration only; `tsc` reports every use once the
  // declaration moves, so listing the uses here would enumerate what the
  // compiler already says.
  assert.equal(layerSenseIn('  lane: ArrowLayer').length, 1)
  assert.equal(layerSenseIn("      if (lane === 'forward') {").length, 0)
})

test('the documents that record the rename may quote what it mangled', () => {
  // By path rule, not by line: a changeset explaining this fix quotes the
  // broken phrase and the right one in the same sentence, and no pattern
  // separates that from the wreckage itself.
  assert.ok(quotesTheRetiredSense('.changeset/a-lane-is-not-a-layer.md'))
  assert.ok(quotesTheRetiredSense('CHANGELOG.md'))
  assert.ok(quotesTheRetiredSense('scripts/tests/retired-copy.test.mjs'))
  assert.ok(!quotesTheRetiredSense('src/styles/blueprint.css'))
  assert.ok(!quotesTheRetiredSense('docs/engineering/checks.md'))
})
