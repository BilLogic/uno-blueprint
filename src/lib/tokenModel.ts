import {
  blankComments,
  filesOn,
  sourceOf,
  type StrippedSource,
  stripComments,
  strippedSourcesOn,
} from '@/lib/sourceTree'
import {
  composite,
  hexToRgb,
  hslToRgb,
  oklchFromSrgb,
  oklchInGamut,
  type Rgb,
} from '@/lib/oklch'

/**
 * One queryable model of the visual vocabulary. Test-time only.
 *
 * The style rules in this repository were enforced by three independent files
 * — `styles/tokens.test.ts`, `lib/palette.test.ts`, `lib/tokenDiscipline.test.ts`
 * — and each one carried its own reader. `tokens.test.ts` concatenated every
 * stylesheet into a single string and swept it for `--name:`, which can answer
 * "is this name written down somewhere" and nothing else. `palette.test.ts`
 * opened `colors.css`, `semantic.css` and both theme files itself, and read a
 * dial by taking the first `--name:` match in one file. Three readers, three
 * samples, and no shared answer to the question every colour rule actually
 * rests on: what does this name resolve to, at the root, under this theme.
 *
 * A fourth ad-hoc guard would have made a fourth reader. So this module is the
 * single seam — the decision that one token model is the single style seam:
 * it answers what is declared, where, under which selector, at what value once
 * the cascade has run in a given subtree, and who consumes it — and every rule
 * becomes an assertion against those answers rather than a new file walker.
 * Widen the sampling here and every rule inherits the fix.
 *
 * Three things in this tree defeat the simpler readers it replaces, and each
 * one is why a piece of the parser below looks the way it does:
 *
 *  - `print.css` declares `--surface`, `--contrast` and most of the dial set
 *    inside `@media print`, and `colors.css` wraps its entire dark palette in
 *    `@media screen`. A reader with no at-rule context reports `print.css` as
 *    the winner for every dial in both themes, and cannot see that the light
 *    ramps are what reach paper. Both are asked about deliberately, so the
 *    printed page is a cascade with an answer rather than a blind spot.
 *  - Forty-two declarations in this tree are wrapped across lines, thirty-six
 *    of them in `semantic.css` — `--primary` itself among them, along with
 *    `--primary-foreground`, `--border` and `--input`. A per-line regex cannot
 *    see any of them.
 *  - `unset-tw-colors.css` is seventeen `--color-amber-*: initial` namespace
 *    resets and nothing else. A property pattern that stops at the hyphen
 *    makes the whole file invisible.
 *
 * NOT in the model: the compiled artifact. Liveness — "does this name still
 * have a consumer" — cannot be read off the stylesheets alone, and this repo
 * has its own proof: `--colors-white` is declared in `global.css` and read
 * exactly once, from a JSX attribute in `components/editor/CanvasPenCursor.tsx`.
 * Nothing asserted today needs the compiled output; a deletion pass would, and
 * that pass had a prerequisite to land first. Tailwind v4 scans non-gitignored
 * markdown, so a class name written in a document under `docs/` generates that
 * class in the compiled CSS and would stand as the evidence that the token it
 * names is live. `styles/tailwind.config.css` now holds `docs/`, `scripts/`
 * and the tests out of the scan, so that step is behind us and what the phase
 * still owes is the rule over the artifact itself.
 *
 * The scan is also what decides which `@theme` keys become custom properties
 * at all, which is a fact about the artifact and so likewise outside this
 * model. `styles/tokens.test.ts` records why the rules here can be right about
 * a registration without knowing it.
 */

/**
 * WHOSE FILES THE MODEL READS is the build's answer, not this file's.
 *
 * The two walkers below used to resolve `src/` from this module's own
 * location and walk it. That is right in this tree and wrong everywhere else:
 * a deployment installs the package under `node_modules`, so the walk found
 * the PACKAGE's stylesheets and never the deployment's own — `styles/brand.css`
 * beside them, which is exactly where a deployment's dials live. Every rule
 * riding this model then judged the package inside a consumer, and passed,
 * having measured nothing about the application that consumer builds.
 *
 * So the sample is the `app` subject of `scripts/sweep.mjs`: the deployment's
 * `src` laid over the package's, per path, which is the same overlay the build
 * applies. The paths read `src/…` wherever the file is, and the root is the
 * tree the run is in — never this file's location, which is the rule
 * `sweep.mjs`'s header states for every check.
 *
 * The two walkers that used to state that here are now ONE reading, in
 * `lib/sourceTree.ts`, which asks the sweep once for the whole application and
 * answers by surface. This model takes its stylesheets and its source from it,
 * and so does every guard that used to open a file of this tree by hand: a
 * file that moves is then answered in one listing rather than in each reader.
 * What stays here is the parsing — what a declaration is, what the cascade
 * says, who consumes a name — which is the model's own job and not a walk.
 */
const STYLES_PREFIX = 'styles/'
/** The stylesheet entry. Import order is read from it, never restated here. */
const ENTRY = `${STYLES_PREFIX}tailwind.config.css`

export type Theme = 'light' | 'dark'

/**
 * Which output medium the cascade is being read for.
 *
 * `screen` sets `@media print` blocks aside; `print` sets `@media screen`
 * blocks aside and lets the print block win. Both halves matter, and neither
 * is decoration: `print.css` restates dials inside `@media print`, and
 * `colors.css` wraps its ENTIRE dark palette in `@media screen` precisely so
 * that the light ramps above it are what reaches paper. A reader with one
 * medium can describe neither arrangement.
 */
export type Medium = 'screen' | 'print'

/**
 * Which layer a name is declared in. A name may appear in exactly one.
 *
 * `dial` is the small set of per-theme inputs; `primitive` the ramps in
 * `colors.css` and the exported palette in `global.css`; `semantic` the
 * derived answers to questions a component asks; `domain` the board's own
 * vocabulary in `blueprint.css`; `registry` the `@theme` keys that mint
 * utilities and the resets that clear Tailwind's own.
 */
export type TokenLayer =
  | 'dial'
  | 'primitive'
  | 'semantic'
  | 'domain'
  | 'registry'

export type Declaration = {
  /** `--surface-hue` */
  name: string
  /** Right-hand side, trimmed and whitespace-collapsed, `var()`s intact. */
  value: string
  /** The selector list the declaration sits under, e.g. `:root, .light`. */
  selector: string
  /**
   * The at-rules and outer selectors wrapping it, outermost first — e.g.
   * `['@media print']` for the print override block. A declaration inside a
   * print-only block is not part of the screen cascade, and a model that
   * could not see that would report `print.css` as the winner for every dial.
   */
  context: string[]
  /** Path relative to `src/styles`, e.g. `themes/light.css`. */
  file: string
  line: number
  layer: TokenLayer
}

export type Consumer = {
  /** The name consumed, e.g. `--motion-micro`. */
  name: string
  /** Path relative to `src`, e.g. `components/editor/CanvasPenCursor.tsx`. */
  file: string
  line: number
  kind: 'stylesheet' | 'source'
  /**
   * How the name was read. `var` is the ordinary function; anything else is
   * Tailwind v4's bare-value shorthand, where the utility itself is the
   * function — `duration-(--motion-micro)`, `w-(--sidebar-width)`. The
   * shorthand resolves the property exactly as `var()` does, so a rule that
   * only knew about `var(` would let a whole class of reference dangle.
   */
  via: string
  /**
   * Was a fallback supplied — `var(--x, 12px)`? A name read WITH a fallback
   * still renders when nothing declares it, so a rule about dangling
   * references has to be able to tell the two apart. The blueprint cell
   * tokens depend on this: every consumer reads them as
   * `var(--…-blueprint-cell, <default>)` and the fallback arm IS the resting
   * state, so those names are undeclared at the root on purpose.
   */
  hasFallback: boolean
}

/**
 * A custom property declared from TypeScript rather than from a stylesheet.
 *
 * Four shapes, and all four are this app declaring a token: an inline style
 * key (`{ '--x': value }`), Tailwind's arbitrary-property syntax inside a
 * class string (`[--x:value]`), an imperative `setProperty('--x', …)`, and
 * the named constant such a call goes through (`const FOO_VAR = '--x'`). The
 * last one matters more than it looks — this codebase routes most of its
 * imperative writes through a named constant, and a reader that only saw
 * literal `setProperty` calls would miss every one of them.
 */
export type SourceDeclaration = {
  name: string
  /** Path relative to `src`. */
  file: string
  line: number
  via: 'style-key' | 'arbitrary-property' | 'set-property' | 'named-constant'
}

/** A source file of the application, comments blanked. The reading's shape. */
export type SourceFile = StrippedSource

export type Stylesheet = {
  /** Path relative to `src/styles`. */
  file: string
  text: string
  /**
   * Position in the cascade. Files the entry imports carry their import index;
   * a stylesheet the entry never imports is not in the cascade at all.
   */
  order: number
}

// ---------------------------------------------------------------------------
// Stylesheets
// ---------------------------------------------------------------------------

function layerOf(file: string): TokenLayer {
  if (file.startsWith('themes/')) return 'dial'
  if (file === 'colors.css' || file === 'global.css') return 'primitive'
  if (file === 'theme.css' || file === 'unset-tw-colors.css') return 'registry'
  if (file === 'blueprint.css') return 'domain'
  return 'semantic'
}

let cachedSheets: Stylesheet[] | null = null

/**
 * Every stylesheet under `src/styles`, in cascade order.
 *
 * Order comes from the `@import` list in the entry sheet rather than from a
 * list here, because the entry's own header says source order is what breaks
 * the `:root`-versus-`.dark` tie — a model that guessed the order would be
 * wrong about exactly the case that matters.
 */
export function stylesheets(): Stylesheet[] {
  if (cachedSheets) return cachedSheets
  const sheets = filesOn('styles', (path) => path.endsWith('.css'))
  const entryText = sourceOf(ENTRY)
  const imported = [...entryText.matchAll(/@import\s+'\.\/([^']+)'/g)].map(
    ([, path]) => path,
  )
  const swept = sheets.map(({ file }) => file.slice(STYLES_PREFIX.length))
  const ordered = [
    ...imported,
    ...swept.filter((file) => !imported.includes(file)).sort(),
  ]
  cachedSheets = ordered.map((file, order) => ({
    file,
    text: sourceOf(`${STYLES_PREFIX}${file}`),
    // Files the entry never imports sort after everything it does, and are
    // excluded from cascade resolution below.
    order: imported.includes(file) ? order : Number.POSITIVE_INFINITY,
  }))
  return cachedSheets
}

/** One stylesheet by its path relative to `src/styles`. */
export function stylesheet(file: string): Stylesheet {
  const sheet = stylesheets().find((entry) => entry.file === file)
  if (!sheet) throw new Error(`no such stylesheet: ${file}`)
  return sheet
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

let cachedDeclarations: Declaration[] | null = null

/**
 * Every custom property declared anywhere under `src/styles`, in cascade order.
 *
 * The parser tracks the selector each declaration sits under by watching brace
 * depth: at depth 1 inside a top-level rule the selector is that rule's, and a
 * nested rule (`&:hover`, a media query's child, the `[data-blueprint-tone]`
 * blocks nested inside the board's own scope) reports the innermost selector
 * with everything outside it in `context`. That is enough to answer "does this
 * rule apply at the root under `.dark`", which is the only question the
 * cascade resolver asks.
 */
export function declarations(): Declaration[] {
  if (cachedDeclarations) return cachedDeclarations
  cachedDeclarations = allDeclarations().filter((entry) =>
    entry.name.startsWith('--'),
  )
  return cachedDeclarations
}

/**
 * Every rule that declares a given CSS property, anywhere in the tree.
 *
 * Takes ordinary properties as well as custom ones, so a rule can ask about
 * `animation:` or `transition:` without opening files of its own.
 */
export function rulesDeclaring(property: string): Declaration[] {
  return allDeclarations().filter((entry) => entry.name === property)
}

let cachedAll: Declaration[] | null = null

/**
 * Every declaration in every stylesheet, with the selector it sits under.
 *
 * A character scanner rather than a per-line regex, because the per-line
 * version could only see a declaration that closed its own line. Forty-two in
 * this tree do not — `--primary`, `--primary-foreground`, `--border`,
 * `--input` and thirty-two more in `semantic.css` alone are written as
 * multi-line `oklch(…)` calls, so the most-derived names in the system would
 * be invisible to the seam that exists to see them. Nothing would have failed:
 * a rule only fails on what it can read.
 *
 * Values are whitespace-collapsed, so a declaration means the same thing
 * whichever way it was wrapped.
 */
function allDeclarations(): Declaration[] {
  if (cachedAll) return cachedAll
  const out: Declaration[] = []
  for (const sheet of stylesheets()) {
    const layer = layerOf(sheet.file)
    const stack: string[] = []
    let buffer = ''
    let line = 1
    // The line the buffer's first non-blank character sits on, so a wrapped
    // declaration is reported where its name is, not where its `;` is.
    let bufferLine = 1
    const flush = () => {
      // `--color-amber-*` is a Tailwind namespace reset, and a declaration:
      // `unset-tw-colors.css` is seventeen of them and nothing else, and a
      // name pattern that stopped at the hyphen made the whole file invisible.
      const declaration =
        /^\s*(-{2}[a-zA-Z0-9-]+\*?|[a-z-]+)\s*:\s*([\s\S]*)$/.exec(buffer)
      if (declaration) {
        out.push({
          name: declaration[1],
          value: declaration[2].trim().replace(/\s+/g, ' '),
          selector: stack[stack.length - 1] ?? '',
          context: stack.slice(0, -1),
          file: sheet.file,
          line: bufferLine,
          layer,
        })
      }
      buffer = ''
    }
    for (const char of blankComments(sheet.text)) {
      if (char === '\n') line += 1
      if (char === '{') {
        stack.push(buffer.trim().replace(/\s+/g, ' '))
        buffer = ''
      } else if (char === '}') {
        // An unterminated final declaration (`color: red }`) is still one.
        flush()
        stack.pop()
      } else if (char === ';') {
        flush()
      } else {
        if (!buffer.trim() && char.trim()) bufferLine = line
        buffer += char
      }
    }
  }
  cachedAll = out
  return cachedAll
}

/** Every declaration in one stylesheet. */
export function declarationsIn(file: string): Declaration[] {
  return declarations().filter((entry) => entry.file === file)
}

/** The distinct names one stylesheet declares. */
export function namesIn(file: string): Set<string> {
  return new Set(declarationsIn(file).map((entry) => entry.name))
}

export type StyleUse = {
  /** The matched text, e.g. `var(--color-slate-500)`. */
  match: string
  /** The property whose value carries it, e.g. `background-color`. */
  property: string
  /** The selector list that declaration sits under. */
  selector: string
  /** Path relative to `src/styles`. */
  file: string
  line: number
  layer: TokenLayer
}

/**
 * Every declared value in every stylesheet that matches a pattern.
 *
 * The stylesheet counterpart of `sourceMatching`, and the reason a rule can
 * read a stylesheet at all: a rule that sampled `src/**.tsx` and stopped there
 * left a stylesheet free to consume a name at a tier the same rule forbade a
 * component to touch. Widening the model once widens it for every rule that
 * asks, which is what the seam ADR is for.
 *
 * Declared VALUES rather than raw text, for two reasons a raw-text scan gets
 * wrong. Comments are already blanked upstream, so the two
 * `var(--color-amber-100)` in `colors.css`'s header prose — which explain the
 * Tailwind namespace split and paint nothing — are not uses. And `layer` comes
 * along, so a rule can say which tier a match sits in rather than naming the
 * files that happen to hold one today.
 *
 * The pattern must carry `g`; `sourceMatching` asks the same.
 */
export function stylesheetMatching(pattern: RegExp): StyleUse[] {
  const out: StyleUse[] = []
  for (const entry of allDeclarations()) {
    for (const match of entry.value.matchAll(pattern)) {
      out.push({
        match: match[0],
        property: entry.name,
        selector: entry.selector,
        file: entry.file,
        line: entry.line,
        layer: entry.layer,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

/**
 * The subtree an answer is being read for, as the selectors that match it.
 *
 * Empty is the root element, which is what every rule asked for until a value
 * in this system stopped being a property of the page. A role tint is measured
 * from the surface it is drawn on, and `semantic.css` re-derives the block at
 * `[data-ground]` for exactly that reason — so "what does this name resolve to"
 * has a second half now, and the model answers it rather than each rule
 * re-deriving a subtree's arithmetic in TypeScript beside the CSS.
 *
 * A scope is spelled the way the stylesheet spells it, so a rule can take the
 * scopes it asks about FROM the stylesheet — `rulesDeclaring('--ground')` hands
 * back every ground the file offers — and never carry a list of its own.
 */
export type Scope = readonly string[]

/**
 * Does this selector list apply to the element `scope` describes under `theme`?
 *
 * `:root`, `.light` and `.dark` all carry specificity (0,1,0), so whichever
 * rule comes last in source order wins — which is the whole mechanism behind
 * the theme flip: `themes/light.css` matches bare `:root`, `:root` matches
 * `<html class="dark">` too, and light imports before dark but after
 * `semantic.css`. Anything more specific, or scoped to a subtree the caller did
 * not ask about, is skipped.
 *
 * A root declaration still applies inside a scope, and that is not a shortcut:
 * every custom property inherits, so a name the subtree does not re-declare
 * reaches it with the root's answer. The one reading this cannot give is a name
 * declared ONLY at the root whose value depends on something the subtree
 * overrides — inheritance carries the computed value, where this would
 * substitute afresh. `--ground` is read by the seven tints and by nothing else,
 * and all seven are inside the block the scope re-declares, so the case does
 * not arise here; a name added outside that block and reading `--ground` would
 * be the thing that made it arise.
 */
function applies(selector: string, theme: Theme, scope: Scope): boolean {
  if (!selector) return false
  return selector.split(',').some((part) => {
    const trimmed = part.trim()
    if (scope.includes(trimmed)) return true
    if (trimmed === ':root') return true
    if (trimmed === '.light') return theme === 'light'
    if (trimmed === '.dark') return theme === 'dark'
    // `lib/theme.ts` stamps the class on documentElement, so `:root.light`
    // and friends are the same element wearing both.
    if (trimmed === ':root.light' || trimmed === 'html.light')
      return theme === 'light'
    if (trimmed === ':root.dark' || trimmed === 'html.dark')
      return theme === 'dark'
    return false
  })
}

/**
 * Does the at-rule context wrapping a declaration apply on `medium`?
 *
 * Only the root cascade counts, so anything nested under a selector rather
 * than an at-rule is out whichever medium is asked for. Among the at-rules,
 * a query naming one medium and not the other applies on that one alone;
 * everything else (`@supports`, `@layer`, a width query, `screen, print`)
 * applies on both.
 */
function appliesOn(context: string[], medium: Medium): boolean {
  return context.every((rule) => {
    if (!rule) return true
    if (!/^@(media|supports|layer)\b/.test(rule)) return false
    if (!/^@media\b/.test(rule)) return true
    const print = /\bprint\b/.test(rule)
    const screen = /\bscreen\b/.test(rule)
    if (print === screen) return true
    return medium === 'print' ? print : screen
  })
}

/**
 * The declaration that wins at the root element under `theme`, or undefined.
 *
 * This is the question no reader in this repo could answer before: not what a
 * file says about `--surface-hue`, but what `--surface-hue` resolves to once
 * the medium's at-rules have been sorted out and source order has broken the
 * `:root`/`.dark` tie.
 *
 * `medium` is what makes the printed page measurable. On `screen` the
 * `@media print` block in `print.css` is set aside; on `print` it is the
 * override that wins, and `colors.css`'s `@media screen` dark palette is the
 * thing set aside instead. Printing from dark mode is a real cascade with a
 * real answer, and asking for it is how a rule can hold that answer to
 * something.
 */
export function winningDeclaration(
  name: string,
  theme: Theme,
  medium: Medium = 'screen',
  scope: Scope = [],
): Declaration | undefined {
  const order = new Map(stylesheets().map((sheet) => [sheet.file, sheet.order]))
  let winner: Declaration | undefined
  for (const entry of declarations()) {
    if (entry.name !== name) continue
    if (!Number.isFinite(order.get(entry.file) ?? Infinity)) continue
    if (!appliesOn(entry.context, medium)) continue
    if (!applies(entry.selector, theme, scope)) continue
    winner = entry
  }
  return winner
}

/**
 * The value of `name` at the root under `theme`, with `var()` chased through.
 *
 * Falls back to a `var()`'s own default (`var(--x, 12px)`) when the referenced
 * name resolves to nothing, which is what the browser does. `medium` selects
 * which cascade is being asked about — the screen one by default, the printed
 * one on request — and `scope` which subtree, the root by default.
 *
 * A fallback arm is itself resolved, so a nested one —
 * `var(--a, var(--b, 12px))` — chases `--b` when `--a` is unset, as the
 * browser does. `defined` names declarations this tree does not make, the way
 * an embedding app's own `:root` would: each one wins over the cascade, which
 * is how an override seam is asked what it does when someone fills it.
 */
export function resolveValue(
  name: string,
  theme: Theme,
  medium: Medium = 'screen',
  scope: Scope = [],
  defined: Readonly<Record<string, string>> = {},
): string | undefined {
  return resolveIn(name, { theme, medium, scope, defined }, new Set())
}

type Resolution = {
  theme: Theme
  medium: Medium
  scope: Scope
  defined: Readonly<Record<string, string>>
}

function resolveIn(
  name: string,
  at: Resolution,
  seen: Set<string>,
): string | undefined {
  if (seen.has(name)) return undefined
  seen.add(name)
  const value = Object.hasOwn(at.defined, name)
    ? at.defined[name]
    : winningDeclaration(name, at.theme, at.medium, at.scope)?.value
  if (value === undefined) return undefined
  return substitute(value, at, seen)
}

/**
 * Every `var()` in `value` replaced by what it resolves to. Parsed with a
 * paren depth rather than a pattern, so a fallback that holds its own
 * parentheses — a nested `var()`, a `calc()` — is read whole. A reference
 * that resolves to nothing and has no fallback is left as written.
 */
function substitute(value: string, at: Resolution, seen: Set<string>): string {
  let out = ''
  let cursor = 0
  const opener = /\bvar\(/g
  for (let match = opener.exec(value); match; match = opener.exec(value)) {
    const open = match.index + match[0].length
    let depth = 0
    let comma = -1
    let close = -1
    for (let index = open; index < value.length; index += 1) {
      const char = value[index]
      if (char === '(') depth += 1
      else if (char === ')') {
        if (depth === 0) {
          close = index
          break
        }
        depth -= 1
      } else if (char === ',' && depth === 0 && comma === -1) comma = index
    }
    if (close === -1) break
    const referenced = value.slice(open, comma === -1 ? close : comma).trim()
    const resolved = resolveIn(referenced, at, new Set(seen))
    const replacement =
      resolved !== undefined
        ? resolved
        : comma !== -1
          ? substitute(value.slice(comma + 1, close).trim(), at, seen)
          : value.slice(match.index, close + 1)
    out += value.slice(cursor, match.index) + replacement
    cursor = close + 1
    opener.lastIndex = cursor
  }
  return out + value.slice(cursor)
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * Every non-test TypeScript file under `src`, comments stripped.
 *
 * The whole of `src`, deliberately, and not the shorter list of roots that
 * would look tidier. The rule this model absorbed — "every custom-property
 * reference in the app resolves to something" — already read the entire tree,
 * so a model sampling less than that would have narrowed a live guard while
 * claiming to generalise it. Sampling is the one thing a single seam exists to
 * get right, and the safe direction is outward.
 */
export function sourceFiles(): SourceFile[] {
  return strippedSourcesOn()
}

/**
 * Blanking comments is the reading's, and re-exported because this model's
 * consumers have always asked it for the stripped shape. The account of why a
 * comment is blanked rather than deleted is in `lib/sourceTree.ts`.
 */
export { stripComments }

let cachedSourceDeclarations: SourceDeclaration[] | null = null

/** Every custom property this app declares from TypeScript. */
export function sourceDeclarations(): SourceDeclaration[] {
  const cached = cachedSourceDeclarations
  if (cached) return cached
  const patterns: ReadonlyArray<readonly [SourceDeclaration['via'], RegExp]> = [
    ['style-key', /['"`](--[\w-]+)['"`]\s*:/g],
    ['arbitrary-property', /\[(--[\w-]+):/g],
    ['set-property', /setProperty\(\s*['"`](--[\w-]+)['"`]/g],
    ['named-constant', /=\s*['"`](--[\w-]+)['"`]/g],
  ]
  const out: SourceDeclaration[] = []
  for (const source of sourceFiles()) {
    source.code.split('\n').forEach((text, index) => {
      for (const [via, pattern] of patterns) {
        for (const match of text.matchAll(pattern)) {
          out.push({ name: match[1], file: source.file, line: index + 1, via })
        }
      }
    })
  }
  cachedSourceDeclarations = out
  return out
}

/**
 * Every name this app declares, from either side of the seam.
 *
 * A stylesheet declaration and a TypeScript one are the same fact to a
 * consumer: the property has a value at the point it is read. Which side it
 * came from is a question `declarationsIn` and `sourceDeclarations` answer
 * separately, for the rules that care.
 */
export function declaredNames(): Set<string> {
  return new Set([
    ...declarations().map((entry) => entry.name),
    ...sourceDeclarations().map((entry) => entry.name),
  ])
}

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

let cachedConsumers: Consumer[] | null = null

/**
 * Everywhere a custom property is read.
 *
 * Three shapes, and the model needs all three. `var(--x)` in a stylesheet is
 * the obvious one. `var(--x)` inside a class string or template literal in
 * source is the second. The third is Tailwind v4's bare-value shorthand —
 * `duration-(--motion-micro)`, `w-(--sidebar-width)` — where the utility name
 * stands in for `var`, and which a `var(`-only scan reads straight past.
 *
 * The inline style KEY (`{ '--x': value }`) is a declaration, not a read, and
 * lives in `sourceDeclarations` instead.
 */
export function consumers(): Consumer[] {
  if (cachedConsumers) return cachedConsumers
  const out: Consumer[] = []
  // The function name is captured so a failure can say how the name was
  // reached, and the comma so a rule can tell `var(--x)` from `var(--x, 1px)`.
  const VAR_ONLY = /(var)\(\s*(--[a-zA-Z0-9-]+)\s*(,?)/g
  // `[\w-]` carries the trailing hyphen, so `w-`, `max-h-` and `duration-`
  // are each read as the "function" standing in for `var`.
  const VAR_OR_UTILITY = /([a-zA-Z][\w-]*)\(\s*(--[a-zA-Z0-9-]+)\s*(,?)/g
  const push = (
    text: string,
    file: string,
    kind: Consumer['kind'],
    pattern: RegExp,
  ) => {
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        out.push({
          name: match[2],
          file,
          line: index + 1,
          kind,
          via: match[1],
          hasFallback: match[3] === ',',
        })
      }
    })
  }
  for (const sheet of stylesheets()) {
    // Comments blanked: `var(--brand-N)` written in a header paragraph to
    // explain a naming convention is prose, not a read, and four stylesheets
    // carry exactly that. Blanking rather than deleting keeps line numbers.
    //
    // `var(` only on this side, because the bare-value shorthand widened for
    // below is a UTILITY-CLASS idiom that cannot appear in a stylesheet. Left
    // broad, it reads Tailwind v4's own `--value(--color-*)` in an `@utility`
    // body as a dangling reference, which it is not.
    push(blankComments(sheet.text), sheet.file, 'stylesheet', VAR_ONLY)
  }
  for (const source of sourceFiles()) {
    push(source.code, source.file, 'source', VAR_OR_UTILITY)
  }
  cachedConsumers = out
  return cachedConsumers
}

/** Every read of one name. */
export function consumersOf(name: string): Consumer[] {
  return consumers().filter((entry) => entry.name === name)
}

// ---------------------------------------------------------------------------
// Class strings
// ---------------------------------------------------------------------------

export type ClassUse = {
  /** The utility as written, e.g. `z-[30]` or `border-border/60`. */
  utility: string
  file: string
  line: number
  /** The whole source line, for a rule that asks what element it is on. */
  text: string
}

let cachedClassUses: ClassUse[] | null = null

/**
 * Every utility-shaped token that appears inside a quoted string in the
 * given sources.
 *
 * Quoted-string-only on purpose: it keeps identifiers, imports and prose out
 * of the sample without needing to know which prop a string ends up on.
 * Taking the sources as an argument is what lets a rule prove itself against
 * a violating string rather than only against the tree.
 */
export function classUsesIn(
  sources: ReadonlyArray<Pick<SourceFile, 'file' | 'code'>>,
): ClassUse[] {
  const out: ClassUse[] = []
  for (const source of sources) {
    source.code.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
        const body = match[1] ?? match[2] ?? match[3] ?? ''
        for (const token of body.split(/\s+/)) {
          if (!token) continue
          if (!/^[-a-z@[\]:.]/i.test(token)) continue
          out.push({ utility: token, file: source.file, line: index + 1, text })
        }
      }
    })
  }
  return out
}

/** Every class use in the application's source. */
export function classUses(): ClassUse[] {
  cachedClassUses ??= classUsesIn(sourceFiles())
  return cachedClassUses
}

/** Every class use matching a pattern, as `file:line: utility` strings. */
export function classUsesMatching(pattern: RegExp): string[] {
  return classUses()
    .filter((use) => {
      pattern.lastIndex = 0
      return pattern.test(use.utility)
    })
    .map((use) => `${use.file}:${use.line}: ${use.utility}`)
}

/** Every source line matching a pattern, as `file:line: match` strings. */
export function sourceMatching(pattern: RegExp): string[] {
  const out: string[] = []
  for (const source of sourceFiles()) {
    source.code.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        out.push(`${source.file}:${index + 1}: ${match[0]}`)
      }
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Colour, re-exported.
 *
 * The arithmetic itself lives in `oklch.ts`, so the brand-accent reader — which
 * runs in a browser — can reach it without dragging this module's file reads
 * along. Re-exported here rather than moved out of sight, because every
 * colour rule in the suite asks this model its questions and the seam ADR says
 * there is one place to ask.
 */
export type { Rgb } from '@/lib/oklch'
export {
  chromaCeiling,
  composite,
  contrast,
  derivedFillInk,
  hexToRgb,
  hslToRgb,
  inSrgbGamut,
  oklch,
  oklchFromSrgb,
  oklchHue,
  oklchInGamut,
  oklchToLinearSrgb,
  relativeLuminance,
} from '@/lib/oklch'

const scaleCache = new Map<Theme, Map<string, Rgb>>()

/**
 * The `--color-{family}-{step}` ramps for one theme, keyed `family-step`.
 *
 * Read straight off `colors.css`: light in the leading `:root` block, dark in
 * the `@media screen` block that follows it.
 */
export function palette(theme: Theme): Map<string, Rgb> {
  const cached = scaleCache.get(theme)
  if (cached) return cached
  const css = stylesheet('colors.css').text
  const darkStart = css.indexOf('@media screen {')
  const block =
    theme === 'light'
      ? css.slice(css.indexOf(':root {'), darkStart)
      : css.slice(darkStart)
  const scale = new Map<string, Rgb>()
  const declaration =
    /--color-([a-z]+)-(\d+):\s*hsla?\(\s*([\d.]+)(?:deg)?,\s*([\d.]+)%,\s*([\d.]+)%/g
  for (const [, family, step, h, s, l] of block.matchAll(declaration)) {
    scale.set(`${family}-${step}`, hslToRgb(Number(h), Number(s), Number(l)))
  }
  return scaleCache.set(theme, scale), scale
}

/** Resolve a `var(--color-family-step)` string against one theme. */
export function resolvePaletteToken(token: string, theme: Theme): Rgb {
  const match = /--color-([a-z]+-\d+)/.exec(token)
  if (!match) throw new Error(`not a palette token: ${token}`)
  const value = palette(theme).get(match[1])
  if (!value) throw new Error(`missing from colors.css: ${match[1]}`)
  return value
}

/** A numeric dial's value at the root under `theme`. */
export function dial(name: string, theme: Theme): number {
  const value = resolveValue(name, theme)
  if (value === undefined) throw new Error(`dial not declared: ${name}`)
  const number = /^-?[\d.]+/.exec(value.trim())
  if (!number)
    throw new Error(`dial ${name} is not numeric under ${theme}: ${value}`)
  return Number(number[0])
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * A colour as CSS computes it: OKLCH plus alpha, and deliberately NOT gamut
 * mapped.
 *
 * Relative colour syntax reads `l`, `c` and `h` off the origin colour before
 * any mapping happens, so a chain that multiplies chroma and then divides it
 * again has to be carried at full precision or the round trip loses colour the
 * browser never lost. Mapping is what `toRgb` does, once, at the end.
 */
export type ColorValue = { l: number; c: number; h: number; alpha: number }

/**
 * What `name` resolves to as a colour, at the root, under `theme`.
 *
 * `resolveValue` already chases `var()` to a literal; what it hands back is
 * still CSS — `oklch(from oklch(0.68 0.14 clamp(65, calc(75 + 0), 95))
 * calc(l - 0.4) calc(c * 0.9) h)` is a real value in this system. Everything
 * below evaluates that: `calc`, `clamp`, `min`, `max`, percentages, relative
 * colour syntax, `oklch()`, `hsl()` and hex.
 *
 * This is why it belongs on the model rather than in a test. Every contrast
 * rule until now re-derived the arithmetic of the declaration it was measuring
 * — writing `Math.min(0.985, Math.max(0.205, (0.62 - L) * 100))` in TypeScript
 * beside the `clamp()` in CSS — so a rule could go on passing after the
 * declaration it claims to measure had changed underneath it. Reading the
 * cascade's own answer removes the second copy.
 */
export function resolveColorValue(
  name: string,
  theme: Theme,
  medium: Medium = 'screen',
  scope: Scope = [],
): ColorValue {
  const value = resolveValue(name, theme, medium, scope)
  if (value === undefined) throw new Error(`not declared: ${name}`)
  return parseColor(value, name)
}

/**
 * `name` as sRGB under `theme`, chroma-reduced into the gamut.
 *
 * A translucent token needs the ground it is painted on: pass `over` and the
 * result is the composite, omit it and a translucent token throws rather than
 * quietly measuring as though it were opaque. That silent read is the shape of
 * the defect this vocabulary exists to end — an alpha measured against nothing
 * is a number with no ground under it.
 *
 * An OPAQUE token can have the same defect one level up, and `scope` is what
 * asks about it: a colour derived from the page is a different colour on a
 * surface that re-derives it, and a rule that only ever read the root would
 * report the page's answer for every element on the screen.
 */
export function resolveColor(
  name: string,
  theme: Theme,
  options: { over?: Rgb; medium?: Medium; scope?: Scope } = {},
): Rgb {
  const { l, c, h, alpha } = resolveColorValue(
    name,
    theme,
    options.medium ?? 'screen',
    options.scope ?? [],
  )
  const rgb = oklchInGamut(l, c, h)
  if (alpha >= 1) return rgb
  if (!options.over)
    throw new Error(
      `${name} is translucent under ${theme} (alpha ${alpha}); pass \`over\``,
    )
  return composite(rgb, alpha, options.over)
}

/** A CSS colour string as OKLCH + alpha. Exported so a literal is measurable. */
export function parseColor(text: string, what = 'value'): ColorValue {
  const tokens = lex(text)
  const reader = { tokens, at: 0, depth: 0 }
  const colour = readColor(reader, what)
  if (reader.at !== tokens.length)
    throw new Error(`trailing input in ${what}: ${text}`)
  return colour
}

type Lexeme = { kind: 'number' | 'word' | 'punct'; text: string; value: number }
/**
 * `depth` is what tells an alpha separator from a division.
 *
 * At the top of a component slot `/` opens the alpha, and CSS requires real
 * division to be written inside `calc()`. Track the bracket depth and both
 * readings are available to the same parser: `oklch(from x l calc(c / 2) h /
 * 30%)` divides once and separates once, and neither is a guess.
 */
type Reader = { tokens: Lexeme[]; at: number; depth: number }

const NUMBER = /^[0-9.]+(%|deg|grad|rad|turn)?/
const WORD = /^[a-zA-Z][a-zA-Z0-9-]*/
const HEX = /^#[0-9a-fA-F]{3,8}/

function lex(text: string): Lexeme[] {
  const out: Lexeme[] = []
  let rest = text.trim()
  while (rest.length > 0) {
    const head = rest[0]
    if (/\s/.test(head)) {
      rest = rest.slice(1)
      continue
    }
    if (head === '#') {
      const hex = HEX.exec(rest)
      if (!hex) throw new Error(`bad hex in: ${text}`)
      out.push({ kind: 'word', text: hex[0], value: NaN })
      rest = rest.slice(hex[0].length)
      continue
    }
    if ('()+*/,'.includes(head)) {
      out.push({ kind: 'punct', text: head, value: NaN })
      rest = rest.slice(1)
      continue
    }
    // A `-` starts a negative literal only where a value may start; between
    // two values it is CSS `calc()` subtraction, which the grammar reads as an
    // operator. `calc(l - 0.4)` and `oklch(-0.1 0 0)` are both real.
    if (head === '-' && !endsValue(out) && NUMBER.test(rest.slice(1))) {
      const number = NUMBER.exec(rest.slice(1)) as RegExpExecArray
      out.push(...[numberLexeme('-' + number[0])])
      rest = rest.slice(1 + number[0].length)
      continue
    }
    if (head === '-' || head === '%') {
      out.push({ kind: 'punct', text: head, value: NaN })
      rest = rest.slice(1)
      continue
    }
    const number = NUMBER.exec(rest)
    if (number) {
      out.push(numberLexeme(number[0]))
      rest = rest.slice(number[0].length)
      continue
    }
    const word = WORD.exec(rest)
    if (word) {
      out.push({ kind: 'word', text: word[0], value: NaN })
      rest = rest.slice(word[0].length)
      continue
    }
    throw new Error(`cannot read: ${rest.slice(0, 24)} (in ${text})`)
  }
  return out
}

/**
 * A percentage is carried as its fraction, so `20% * 0.5` is 0.1 and an alpha
 * slot needs no unit knowledge at all. The two component slots that count in
 * hundreds — HSL saturation and lightness — multiply back where they are read,
 * which is the one place the convention has to be undone.
 */
function numberLexeme(text: string): Lexeme {
  const percent = text.endsWith('%')
  const number = Number(text.replace(/(%|deg|grad|rad|turn)$/, ''))
  return { kind: 'number', text, value: percent ? number / 100 : number }
}

/** True where the token just read ends a value, so the next `-` is an operator. */
function endsValue(out: Lexeme[]): boolean {
  const last = out[out.length - 1]
  if (!last) return false
  if (last.kind === 'number') return true
  if (last.kind === 'word') return true
  return last.text === ')'
}

function peek(reader: Reader): Lexeme | undefined {
  return reader.tokens[reader.at]
}

function take(reader: Reader, text: string): void {
  const next = reader.tokens[reader.at]
  if (!next || next.text !== text)
    throw new Error(`expected ${text}, got ${next?.text ?? 'end'}`)
  reader.at += 1
}

const COLOR_FUNCTIONS = new Set(['oklch', 'hsl', 'hsla'])

function readColor(reader: Reader, what: string): ColorValue {
  const head = peek(reader)
  if (!head) throw new Error(`empty colour in ${what}`)
  if (head.text.startsWith('#')) {
    reader.at += 1
    const [l, c, h] = oklchFromSrgb(hexToRgb(head.text))
    return { l, c, h, alpha: 1 }
  }
  if (!COLOR_FUNCTIONS.has(head.text))
    throw new Error(`not a colour in ${what}: ${head.text}`)
  reader.at += 1
  take(reader, '(')
  const colour =
    head.text === 'oklch' ? readOklch(reader, what) : readHsl(reader)
  take(reader, ')')
  return colour
}

function readOklch(reader: Reader, what: string): ColorValue {
  let origin: ColorValue | undefined
  if (peek(reader)?.text === 'from') {
    reader.at += 1
    origin = readColor(reader, what)
  }
  const scope = origin ?? { l: NaN, c: NaN, h: NaN, alpha: NaN }
  const l = readExpression(reader, scope)
  const c = readExpression(reader, scope)
  const h = readExpression(reader, scope)
  // CSS gives a relative colour the origin's own alpha when the slot is
  // omitted, which is why `--sidebar-primary: var(--primary)` and
  // `oklch(from var(--primary) l c h)` are the same colour and not two.
  const alpha = readAlpha(reader, scope, origin?.alpha ?? 1)
  return { l, c, h, alpha }
}

function readHsl(reader: Reader): ColorValue {
  const scope = { l: NaN, c: NaN, h: NaN, alpha: NaN }
  const h = readExpression(reader, scope)
  skipComma(reader)
  const s = readExpression(reader, scope) * 100
  skipComma(reader)
  const light = readExpression(reader, scope) * 100
  // `hsla(0, 0%, 0%, 0.05)` puts the alpha behind a comma and `hsl(0deg 0% 0%
  // / 5%)` behind a slash. Both spellings are in this tree — the legacy
  // palette export uses the first — so both are read here.
  const comma = peek(reader)?.text === ','
  if (comma) reader.at += 1
  const alpha = comma ? readExpression(reader, scope) : readAlpha(reader, scope, 1)
  const [l, c, hue] = oklchFromSrgb(hslToRgb(h, s, light))
  return { l, c, h: hue, alpha }
}

function skipComma(reader: Reader): void {
  if (peek(reader)?.text === ',') reader.at += 1
}

function readAlpha(
  reader: Reader,
  scope: ColorValue,
  fallback: number,
): number {
  if (peek(reader)?.text !== '/') return fallback
  reader.at += 1
  return readExpression(reader, scope)
}

/*
 * The expression grammar CSS numeric functions actually use:
 *
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := number | 'l' | 'c' | 'h' | 'alpha' | '(' expression ')'
 *               | 'calc' '(' expression ')'
 *               | ('clamp' | 'min' | 'max') '(' expression (',' …)* ')'
 *
 * `l`, `c`, `h` and `alpha` are the relative-colour keywords, and they are the
 * reason `scope` is threaded through: inside `oklch(from X …)` they name X's
 * own components, and outside one they are not defined at all — which is what
 * the NaN scope makes true rather than silently zero.
 */
function readExpression(reader: Reader, scope: ColorValue): number {
  let total = readTerm(reader, scope)
  for (;;) {
    const next = peek(reader)
    if (!next || (next.text !== '+' && next.text !== '-')) return total
    if (reader.depth === 0) return total
    reader.at += 1
    const right = readTerm(reader, scope)
    total = next.text === '+' ? total + right : total - right
  }
}

function readTerm(reader: Reader, scope: ColorValue): number {
  let total = readFactor(reader, scope)
  for (;;) {
    const next = peek(reader)
    if (!next || (next.text !== '*' && next.text !== '/')) return total
    if (reader.depth === 0) return total
    reader.at += 1
    const right = readFactor(reader, scope)
    total = next.text === '*' ? total * right : total / right
  }
}

const KEYWORDS = new Set(['l', 'c', 'h', 'alpha'])
const VARIADIC = new Set(['min', 'max', 'clamp'])

function readFactor(reader: Reader, scope: ColorValue): number {
  const head = peek(reader)
  if (!head) throw new Error('expression ended early')
  if (head.kind === 'number') {
    reader.at += 1
    return head.value
  }
  if (head.text === '-') {
    reader.at += 1
    return -readFactor(reader, scope)
  }
  if (head.text === '(') {
    reader.at += 1
    reader.depth += 1
    const inner = readExpression(reader, scope)
    reader.depth -= 1
    take(reader, ')')
    return inner
  }
  if (head.text === 'calc') {
    reader.at += 1
    take(reader, '(')
    reader.depth += 1
    const inner = readExpression(reader, scope)
    reader.depth -= 1
    take(reader, ')')
    return inner
  }
  if (VARIADIC.has(head.text)) {
    reader.at += 1
    take(reader, '(')
    reader.depth += 1
    const args = [readExpression(reader, scope)]
    while (peek(reader)?.text === ',') {
      reader.at += 1
      args.push(readExpression(reader, scope))
    }
    reader.depth -= 1
    take(reader, ')')
    if (head.text === 'min') return Math.min(...args)
    if (head.text === 'max') return Math.max(...args)
    return Math.min(Math.max(args[0], args[1]), args[2])
  }
  if (KEYWORDS.has(head.text)) {
    reader.at += 1
    const component = scope[head.text as keyof ColorValue]
    if (Number.isNaN(component))
      throw new Error(`${head.text} used outside a relative colour`)
    return component
  }
  throw new Error(`cannot evaluate: ${head.text}`)
}

// ---------------------------------------------------------------------------
// The role vocabulary
// ---------------------------------------------------------------------------

/**
 * The coloured roles. A role is a meaning, never a position on a ramp.
 *
 * Adding one here is the whole edit a new role costs on this side: every rule
 * that reads this list covers it from that moment, and fails until all seven
 * of its names are declared.
 */
export const ROLES = [
  'primary',
  'brand',
  'warning',
  'destructive',
  'info',
  'success',
  'secondary',
] as const

export type Role = (typeof ROLES)[number]

/**
 * The seven jobs, as the templates that build a role's names.
 *
 * An author picks one by answering what the colour is sitting on — the solid,
 * the tint, or the page — rather than by reading a number. That is the whole
 * difference between this list and a ramp.
 */
export const ROLE_JOBS = [
  (role: string) => `--${role}`,
  (role: string) => `--${role}-foreground`,
  (role: string) => `--surface-${role}`,
  (role: string) => `--text-on-surface-${role}`,
  (role: string) => `--text-${role}`,
  (role: string) => `--border-${role}`,
  (role: string) => `--wash-${role}`,
] as const

/** The seven names one role must declare. */
export function roleTokens(role: string): string[] {
  return ROLE_JOBS.map((job) => job(role))
}

/**
 * The role names that are not declared anywhere in the stylesheets.
 *
 * An invariant rather than a census, which is the difference between a rule
 * that survives the next unrelated edit and one that breaks on it. "Every role
 * declares all seven" holds when an eighth role arrives and starts failing the
 * moment that role is short a name; "there are forty-nine role tokens" is true
 * once and wrong forever after.
 *
 * `declared` is a parameter so the rule itself can be tested against a set it
 * did not read off disk — a rule nothing can make fail is not a rule.
 */
export function missingRoleTokens(
  roles: readonly string[] = ROLES,
  declared: ReadonlySet<string> = declaredNames(),
): string[] {
  return roles.flatMap((role) =>
    roleTokens(role).filter((name) => !declared.has(name)),
  )
}
