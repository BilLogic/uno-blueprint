import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  declarations,
  declarationsIn,
  type TokenLayer,
} from '@/lib/tokenModel'

/**
 * The registry maps; it does not compute, and it does not reach below the
 * semantic layer.
 *
 * `theme.css` is the `@theme inline` block that mints Tailwind utilities. Its
 * whole job is an indirection: a semantic token declared in `semantic.css`
 * gets a name in Tailwind's colour namespace, so `bg-canvas` and
 * `text-muted-foreground` exist. Its own header has said "every entry is
 * `--color-X: var(--X)`" since it was written, and for most of its life that
 * sentence was true of most of it.
 *
 * It was not true of twenty entries. Ten of them read
 *
 *     --color-warning-200: hsl(var(--warning-200));
 *
 * and ten more said the same for `destructive`. That single line is wrong at
 * two tiers at once. It performs colour arithmetic — `hsl()` assembles a
 * colour out of a raw triple, which is the semantic layer's job and no part of
 * a namespace map. And the triple it assembles lives in `themes/light.css` and
 * `themes/dark.css`, the DIAL files: the registry was reaching past the whole
 * semantic layer into the per-theme inputs. The result was that
 * `border-destructive-400` and `bg-warning-200` were legal classes, and they
 * were legal for exactly one reason — this file said so.
 *
 * Deleting those twenty lines fixes today. It does nothing about tomorrow,
 * because nothing stopped the next person adding them back. This file is the
 * part that does: it states the two shapes an entry may take, and every
 * registration added from here on is checked by it without this file changing.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 *
 * A colour registration is one of exactly two things.
 *
 *  1. A NAMESPACE DECLARATION, `--color-X: var(--color-X)`. Self-referential
 *     on purpose and copied from upstream: `inline` makes the utility compile
 *     to the registration's value, which here is the name itself, so the value
 *     resolves against the single declaration in `colors.css`. (Tailwind emits
 *     the registration too — it keeps a `@theme` key whose name the content
 *     scan finds, and a self-referential value spells its own name — but that
 *     copy is layered and `colors.css` is not, so `colors.css` wins.) The hue
 *     families are 204 of these. Nothing is being re-pointed and no value is
 *     being computed — the name names itself.
 *
 *  2. AN INDIRECTION, `--color-X: var(--Y)`, where `--Y` is a semantic token.
 *     One bare `var()`: no function wrapped round it, no fallback arm, nothing
 *     beside it, and no declaration of `--Y` anywhere in the dial or primitive
 *     layers. There are 99 of these.
 *
 * Anything else is the fault. `hsl(var(--warning-200))` fails the first half
 * of clause 2 — it is not a bare reference — and `var(--warning-200)` written
 * instead would fail the second, because `--warning-200` is declared in the
 * theme files. Both halves are needed: the wreckage happened to arrive in the
 * first shape, and the obvious way to "fix" it by hand is the second.
 *
 * ── THE CHEAPER RULES, AND WHY EACH ONE IS NOT THIS ────────────────────────
 *
 * A LIST OF FORBIDDEN NAMES is a census. It is true of the twenty lines that
 * prompted it and says nothing about the twenty-first. A role added next
 * quarter arrives with its own ramp, and the list does not know the role
 * exists.
 *
 * "NO `hsl(` ON THE RIGHT" catches the exact wreckage and nothing adjacent to
 * it. `rgb(`, `oklch(`, `color-mix(`, `light-dark(` and a bare hex literal all
 * walk straight past a rule written against the one function that happened to
 * be there.
 *
 * "NO NUMERIC SUFFIX ON THE LEFT" was the first form this rule was proposed
 * in, and it is the interesting failure. Two hundred and four legitimate
 * entries carry one — every step of every hue family — so the rule as stated
 * would condemn the layer it was written to protect. That is not a detail to
 * paper over with an exception: the number was never what was wrong.
 * `--color-amber-100` is a position on a ramp and is supposed to be, because a
 * hue family is colour that carries no meaning and a step is the only thing
 * there is to name. What was wrong with `--color-warning-200` is that
 * `warning` is a ROLE — a meaning — and a meaning has jobs, not positions.
 * A rule about digits cannot see that difference; a rule about reach can, and
 * does, without knowing either word.
 *
 * `--color-chart-1` … `-5` are the case that settles it. They are numbered,
 * they are not self-referential, and a numeric-suffix rule flags all five. But
 * their number is a series identity, not a rung — chart-3 is not a step darker
 * than chart-2 — and they point at `--chart-N` in `semantic.css` and compute
 * nothing. They are correct, they need no exception, and they pass here
 * because reach and shape are what is asked about.
 *
 * OPENING `theme.css` WITH `fs` AND SWEEPING IT PER LINE reads the wrong text.
 * Forty-two declarations in this tree wrap across lines and two of them are in
 * this file; and per-line reading cannot tell a declaration from the same
 * characters inside the paragraph of prose above it. The token model already
 * parses every stylesheet with a character scanner that tracks brace depth and
 * blanks comments, and the decision that one token model is the single style
 * seam says a new rule becomes an assertion against it rather than a fourth
 * file walker. So this file opens nothing.
 *
 * ── WHAT THIS DOES NOT COVER, STATED RATHER THAN HIDDEN ────────────────────
 *
 * THE SUBJECT IS THE COLOUR NAMESPACES — `--color-*` and the utility-scoped
 * `--border-color-*` and `--text-color-*`. The other namespaces this file
 * registers are deliberately out, and not because they would be inconvenient:
 * `--radius-sm: calc(var(--radius) * 0.5)` is a real derivation and the radius
 * ladder is arithmetic by design, `--font-sans` is a fallback chain whose
 * shape the file argues for at length, and `--width-listbox: 320px` and
 * `--shadow-floating` are measures with no colour underneath them. Colour is
 * where a tier confusion is invisible in review and shows up as a wrong pixel,
 * so colour is what is claimed.
 *
 * A COLOUR NAMESPACE THAT DOES NOT CONTAIN THE WORD `color` is outside the
 * pattern — Tailwind's `--fill-*` and `--stroke-*` are colour and would not be
 * matched. This file registers none today. `--stroke-blueprint-arrow` is the
 * first `--stroke-*` name in the tree and does not change that: it is a
 * component token declared at `:root` in `blueprint.css`, not an `@theme`
 * registration, so it mints no utility and this file never sees it. A
 * `--stroke-*` arriving in the REGISTRY would be outside this rule until the
 * pattern is widened, and widening it is a one-line edit.
 *
 * A REGISTRATION POINTING AT `blueprint.css` FAILS, and that is intended
 * rather than overlooked. Some of the board's vocabulary is declared
 * unreachable at the root so that each consumer's fallback arm stays the
 * resting state, and the rest — the overview's own names — is pinned to a
 * look its owner chose rather than derived; minting a utility from either
 * would be a decision worth arguing about, and failing here is how the
 * argument starts.
 */

/** Registry keys in a colour namespace: `--color-*`, `--border-color-*`, … */
const COLOUR_KEY = /^--(?:[a-z-]+-)?color-/

/** A value that is one bare `var()` reference and nothing else. */
const BARE_REFERENCE = /^var\((--[A-Za-z0-9-]+)\)$/

/**
 * Layers a registry entry may not reach into.
 *
 * `dial` is the per-theme input the wreckage read. `primitive` is the ramps,
 * and it is here for the same reason the token-discipline rule keeps source
 * off them: a name in the middle of the stack that resolves straight to a ramp
 * step has skipped the layer where meaning is assigned. The self-referential
 * namespace declaration is not this — it is checked before reach is.
 */
const BELOW_THE_SEAM: TokenLayer[] = ['dial', 'primitive']

export type Entry = { name: string; value: string }

/**
 * Why this entry is not a legal registration, or `null` if it is.
 *
 * `layersOf` is a parameter rather than a closure over the stylesheets so the
 * rule can be exercised on declarations it did not read off disk. A guard
 * whose extraction is wrong reports clean forever and looks exactly like a
 * file that is clean.
 */
export function registryFault(
  entry: Entry,
  layersOf: (name: string) => TokenLayer[],
): string | null {
  if (!COLOUR_KEY.test(entry.name)) return null
  const reference = BARE_REFERENCE.exec(entry.value)
  if (!reference) {
    return `value is not a bare var() reference — the registry maps a name, it does not compute a colour: ${entry.value}`
  }
  const target = reference[1]
  if (target === entry.name) return null // namespace declaration
  const layers = layersOf(target)
  if (layers.length === 0) return `points at ${target}, which nothing declares`
  const below = layers.filter((layer) => BELOW_THE_SEAM.includes(layer))
  if (below.length > 0) {
    return `points at ${target}, declared in the ${[...new Set(below)].join(' and ')} layer — the registry maps the semantic layer and never reaches below it`
  }
  return null
}

/** The layer of every declaration of `name`, read from the model. */
function layersOf(name: string): TokenLayer[] {
  return declarations()
    .filter((entry) => entry.name === name)
    .map((entry) => entry.layer)
}

test('every colour registration is a map, not a computation', () => {
  const faults = declarationsIn('theme.css')
    .map((entry) => {
      const fault = registryFault(entry, layersOf)
      return fault ? `theme.css:${entry.line} — ${entry.name}: ${fault}` : null
    })
    .filter((fault): fault is string => fault !== null)
  assert.deepEqual(
    faults,
    [],
    'A colour entry in theme.css is either `--color-X: var(--color-X)`, which ' +
      'declares a primitive namespace, or `--color-X: var(--Y)` with `--Y` a ' +
      'semantic token. A value that computes, or one that reads a per-theme ' +
      `dial, mints a utility the layer below was never meant to expose:\n${faults.join('\n')}`,
  )
})

test('the guard catches the registrations it was written for', () => {
  // The twenty lines this rule replaces, as they stood. `--warning-200` and
  // `--destructive-200` were declared in both theme files and restated in
  // print, so a reader looking them up saw a dial three times over.
  const dial = () => ['dial', 'dial', 'semantic'] as TokenLayer[]
  assert.match(
    registryFault(
      { name: '--color-warning-200', value: 'hsl(var(--warning-200))' },
      dial,
    ) ?? '',
    /not a bare var\(\) reference/,
  )
  assert.match(
    registryFault(
      { name: '--color-destructive-600', value: 'hsl(var(--destructive-600))' },
      dial,
    ) ?? '',
    /not a bare var\(\) reference/,
  )
  // The hand-repair that keeps the utility and drops the function. This is
  // the second half of the rule earning its place: unwrapping `hsl()` looks
  // like a fix and re-mints exactly the same class.
  assert.match(
    registryFault(
      { name: '--color-destructive-400', value: 'var(--destructive-400)' },
      dial,
    ) ?? '',
    /declared in the dial layer/,
  )
})

test('the guard catches what a rule about hsl() would not', () => {
  const semantic = () => ['semantic'] as TokenLayer[]
  const computed = [
    'rgb(var(--warning-200))',
    'oklch(var(--warning-l) var(--warning-c) var(--warning-h))',
    'color-mix(in oklch, var(--warning) 20%, var(--canvas))',
    'light-dark(var(--warning), var(--warning-dark))',
    '#f5a524',
    'var(--warning, #f5a524)',
    'var(--warning) var(--canvas)',
  ]
  assert.deepEqual(
    computed.filter(
      (value) =>
        registryFault({ name: '--color-warning', value }, semantic) === null,
    ),
    [],
  )
})

test('the guard leaves both legal shapes alone', () => {
  const semantic = () => ['semantic'] as TokenLayer[]
  const primitive = () => ['primitive'] as TokenLayer[]
  // A namespace declaration: numbered, self-referential, value in colors.css.
  assert.equal(
    registryFault(
      { name: '--color-amber-100', value: 'var(--color-amber-100)' },
      primitive,
    ),
    null,
  )
  // An indirection, in each of the three colour namespaces this file uses.
  assert.equal(
    registryFault({ name: '--color-canvas', value: 'var(--canvas)' }, semantic),
    null,
  )
  assert.equal(
    registryFault(
      { name: '--border-color-muted', value: 'var(--border-muted)' },
      semantic,
    ),
    null,
  )
  assert.equal(
    registryFault(
      { name: '--text-color-contrast', value: 'var(--foreground-contrast)' },
      semantic,
    ),
    null,
  )
  // A numbered indirection whose number is an identity, not a rung. Five of
  // these are live, and a rule about digits would have condemned all five.
  assert.equal(
    registryFault({ name: '--color-chart-3', value: 'var(--chart-3)' }, semantic),
    null,
  )
})

test('the non-colour namespaces are out of subject, and say so by passing', () => {
  const never = () => {
    throw new Error('reach must not be asked about a non-colour key')
  }
  for (const entry of [
    { name: '--radius-sm', value: 'calc(var(--radius) * 0.5)' },
    { name: '--width-listbox', value: '320px' },
    { name: '--shadow-floating', value: 'var(--shadow-md)' },
    { name: '--text-xs', value: '.75rem' },
    { name: '--font-mono', value: "var(--app-font-mono), monospace" },
  ]) {
    assert.equal(registryFault(entry, never), null, entry.name)
  }
})

test('the model is what is read, and it sees the whole file', () => {
  // The live assertion is only worth what its sample is. If the model ever
  // stops reading this file, every rule above passes on an empty list.
  const entries = declarationsIn('theme.css')
  assert.ok(
    entries.filter((entry) => COLOUR_KEY.test(entry.name)).length > 100,
    'theme.css should be the colour registry; the model read too little of it',
  )
  assert.ok(
    entries.some((entry) => entry.name === '--color-canvas'),
    'the model should see the plain indirections',
  )
  assert.ok(
    entries.some((entry) => entry.name === '--color-amber-100'),
    'the model should see the namespace declarations',
  )
})
