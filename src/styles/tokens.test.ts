import { describe, expect, it } from 'vitest'
import { sweep } from '../../scripts/sweep.mjs'
import { GROUNDS } from '@/lib/ground'
import {
  type Consumer,
  consumers,
  consumersOf,
  contrast,
  declarations,
  declarationsIn,
  declaredNames,
  dial,
  missingRoleTokens,
  namesIn,
  resolveColor,
  resolveValue,
  ROLES,
  roleTokens,
  rulesDeclaring,
  sourceDeclarations,
  sourceFiles,
  stylesheet,
  stylesheets,
  winningDeclaration,
} from '@/lib/tokenModel'

/**
 * Token drift guard for the ported design-system foundation. The app resolves
 * every colour through `var()`, so a deleted or renamed token fails silently
 * in the browser — the property simply does not apply. These are the rules
 * that catch that:
 *
 *  - every bare `var(--x)` in a stylesheet resolves to a declaration
 *    somewhere, and so does every custom-property reference in source,
 *  - the theme dials the semantic layer derives from exist in both themes and
 *    resolve to a number under each,
 *  - every semantic token is declared, at a scope a subtree can re-derive at,
 *  - the blueprint's per-role component tokens hand over token references and
 *    nothing else, and stay unreachable at the root so their fallback arm
 *    remains the default,
 *  - the motion tokens in animations.css agree with `lib/motion.ts`.
 *
 * What changed here is not the rules, it is the reader. This file used to open
 * every stylesheet itself, concatenate them, and sweep the result for
 * `--name:` — which can say whether a name is written down somewhere and can
 * never say what it resolves to, under which theme, at which scope. Two of the
 * rules below could only be approximated on that reading, and one of them was
 * quietly dead. The sample now comes from `tokenModel`, the one seam style
 * enforcement rides — a new style rule is an assertion against that model,
 * never a fourth file walker — so widening the sample widens every rule that
 * asks.
 */

/**
 * Properties injected at runtime by a library, never declared in this tree.
 *
 * Two shapes, and the difference is not cosmetic. The PREFIXES are namespaces
 * a library owns wholesale — Tailwind's internals, the drawer's stacking
 * state — where enumerating the members would be a list nobody could maintain.
 * The NAMES are the Base UI positioner variables, which are a fixed published
 * set, so they are named individually: a typo in `--anchor-width` should fail
 * this rule rather than slip through a prefix that happens to cover it.
 *
 * The Base UI list arrived with the fix to this file's second rule. That rule
 * meant to cover Tailwind's bare-value shorthand — `w-(--anchor-width)`,
 * `origin-(--transform-origin)` — and its pattern required a LETTER before
 * the parenthesis, where every such utility ends in a hyphen. It therefore
 * matched nothing the `var()` pattern beside it had not already matched, and
 * nineteen references in eight files were outside every rule in this file for
 * as long as it has existed. They are inside it now, and this is what they
 * resolve against.
 */
const RUNTIME_PREFIXES = [
  '--tw-', // Tailwind internal
  '--drawer-', // shadcn/base-ui drawer state
  '--stack-', // drawer stacking
  '--nested-drawers',
  '--accordion-', // base-ui accordion panel height
  '--radix-', // radix primitives
]

const RUNTIME_NAMES = [
  // @base-ui/react positioner and popup measurements, written onto the
  // positioner element by the primitive itself. See its `*CssVars` modules.
  '--anchor-width',
  '--available-width',
  '--available-height',
  '--transform-origin',
  '--positioner-width',
  '--positioner-height',
  '--popup-width',
  '--popup-height',
  '--collapsible-panel-height',
]

/**
 * Prefixes left behind when a token name is built by interpolation.
 *
 * `var(--color-${family}-${step})` arrives here truncated at the
 * interpolation. The families and steps it composes from are covered by
 * `palette.test.ts`, which resolves the real token against `colors.css`.
 */
const COMPOSED_TOKEN_PREFIXES = ['--color-']

/**
 * Which side declares a name, or `null` if nothing does.
 *
 * `stylesheet` is a declaration under `src/styles`. `component` is one this app
 * writes from TypeScript — an inline style key, Tailwind's arbitrary-property
 * syntax, a `setProperty` call, or the named constant such a call goes through.
 * `runtime` is a library writing onto an element it owns, which nothing in this
 * tree declares and nothing should.
 *
 * The `component` arm is a real declaration and not a concession. A consumer
 * can tell the two apart by nothing at all: what it needs is for the property
 * to have a value at the point it is read, and a component that sets the token
 * on the element the rule matches has given it one. The model already folds
 * both sides together in `declaredNames`; this splits them again so the rule
 * below can say which arm it leaned on, and so a test can hold each arm to its
 * own promise.
 *
 * A `@theme` REGISTRATION counts as a stylesheet declaration, and `inline`
 * does not change that. It is a fair question whether it should. `inline`
 * decides what a utility compiles to — the value, never the registered name —
 * so a registration is not automatically a custom property in the built CSS.
 * What decides that is Tailwind's content scan: a `@theme` key whose name the
 * scan finds is emitted at `:root, :host`, and one it never finds is dropped.
 * Some of `theme.css` is emitted and some of it is not, and this function
 * cannot tell which from the declaration alone. On the face of it that is a
 * hole: a name registered but not emitted would be read as declared here and
 * resolve to nothing in a browser.
 *
 * It is not a hole, and the reason is the scan itself. Reading a name is one
 * of the things that emits it. A `var(--color-X)` in a stylesheet and an
 * arbitrary-value utility in a component are both found by the scan, so both
 * put the key they name into the artifact. The files this model samples —
 * every stylesheet under `src/styles`, every non-test `.ts` and `.tsx` under
 * `src` — are a subset of the files Tailwind scans, so every read a rule here
 * can see is a read that emits what it reads. The dangling case cannot be constructed from
 * inside the sample, and a branch for it would be asserting a failure mode
 * this build has no way to reach.
 *
 * That subset relation is the whole of the argument, so it is held below
 * rather than left as a claim. What would break it is the sample widening past
 * what Tailwind scans — the direction `tokenModel`'s header calls the safe one
 * — or a new `@source not` line covering a file the sample reads.
 *
 * Ten references live on this today, all of them components reading a name
 * only `theme.css` registers: `--radius-md`, `--color-popover`,
 * `--width-cell-panel` and `--width-cell-panel-expanded`. All four are in the
 * built artifact. No stylesheet reads such a name at all.
 */
const stylesheetNames = new Set(declarations().map((entry) => entry.name))
const componentNames = new Set(sourceDeclarations().map((entry) => entry.name))

export type Declarer = 'stylesheet' | 'component' | 'runtime' | null

export function declarerOf(name: string): Declarer {
  if (stylesheetNames.has(name)) return 'stylesheet'
  if (componentNames.has(name)) return 'component'
  if (RUNTIME_NAMES.includes(name)) return 'runtime'
  if (RUNTIME_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return 'runtime'
  }
  return null
}

/** A read, as the two rules below need to see it. */
export type Reference = Pick<Consumer, 'name' | 'kind' | 'hasFallback'>

/**
 * Why this reference resolves to nothing, or `null` if it resolves.
 *
 * The rule is that a name read without a fallback has to have been declared
 * somewhere, because a browser given neither simply drops the declaration: the
 * property does not apply, the element keeps whatever it inherited, and nothing
 * anywhere reports it. That is the failure this file exists to convert into a
 * red build, and it is the one failure mode in the stylesheets that leaves no
 * trace at all.
 *
 * TWO EXEMPTIONS, and both are the design working rather than a hole conceded.
 *
 * A FALLBACK ARM IS THE VALUE. `var(--x, 12px)` renders 12px when nothing
 * declares `--x`, so the reference is not dangling — it is an override seam,
 * and that is how the font seam is spelled: `theme.css` writes
 * `var(--app-font-sans, 'Ubuntu Sans Variable')` and nothing in this tree
 * declares `--app-font-sans`, on purpose, so an embedder can point it at its
 * own face. A rule that failed on it would be asking the seam to be closed.
 * The model records the comma, so this asks which of the two a reference is
 * rather than guessing from the shape of the closing parenthesis.
 *
 * A COMPONENT MAY DECLARE ON ITS OWN ELEMENT. `blueprint.css` reads
 * `--background-blueprint-fill` and `--background-compare-membership-outline`
 * bare, and no stylesheet declares either: the fill comes from data, so the
 * cell writes it inline on the element the rule matches, through
 * `BLUEPRINT_FILL_PROPERTY` in `lib/pathColorTheme.ts` and through an inline
 * style key in `CompareCellBlock.tsx`. That is the component tier doing the one
 * thing a stylesheet cannot, and the rule below has to see it as a declaration
 * or it condemns the mechanism.
 *
 * The exemption is not free, and the test below spends what it costs: each arm
 * is asserted to still be carrying something, so an arm that stops being needed
 * is noticed rather than left behind as a carve-out for the next dangling
 * reference to slip through.
 *
 * `declarer` is a parameter rather than a closure over the model so the rule
 * can be exercised on references it did not read off disk. A guard whose
 * extraction is wrong reports clean forever and looks exactly like a tree that
 * is clean.
 */
export function resolutionFault(
  reference: Reference,
  declarer: (name: string) => Declarer,
): string | null {
  const { name, kind, hasFallback } = reference
  // A name assembled by interpolation arrives truncated — `--color-` and
  // nothing after it. `palette.test.ts` resolves what it composes to.
  if (kind === 'source' && COMPOSED_TOKEN_PREFIXES.includes(name)) return null
  if (kind === 'stylesheet' && hasFallback) return null
  if (declarer(name) !== null) return null
  return `nothing declares ${name}`
}

const report = (entries: ReturnType<typeof consumers>) => [
  ...new Set(
    entries.map((entry) => `${entry.file}:${entry.line} ${entry.name}`),
  ),
]

const unresolved = (kind: Consumer['kind']) =>
  report(
    consumers().filter(
      (entry) =>
        entry.kind === kind && resolutionFault(entry, declarerOf) !== null,
    ),
  )

describe('token resolution', () => {
  it('resolves every bare var(--x) reference in the stylesheets', () => {
    expect(unresolved('stylesheet')).toEqual([])
  })

  it('resolves every custom-property reference in source', () => {
    // Both ways a component can reach one: `var(--x)` inside a class string or
    // a style value, and Tailwind v4's bare-value shorthand, where the utility
    // itself stands in for `var`. Fallbacks are NOT excused here — a component
    // naming a token this app owns should name one that exists, and the
    // blueprint cell tokens, whose fallback arm is deliberately the default
    // state, are declared per role in `blueprint.css` either way.
    expect(unresolved('source')).toEqual([])
  })

  it('fails on a dangling reference, in either kind', () => {
    // The rule above passes on a clean tree and would pass just as quietly on
    // a tree it could not read. This is the half that says it can still fail.
    const nothing = () => null
    for (const kind of ['stylesheet', 'source'] as const) {
      expect(
        resolutionFault(
          { name: '--nobody-declares-this', kind, hasFallback: false },
          nothing,
        ),
      ).toMatch(/nothing declares --nobody-declares-this/)
    }
  })

  it('leaves the override seam alone, and only in a stylesheet', () => {
    const nothing = () => null
    const seam = { name: '--app-font-sans', hasFallback: true } as const
    expect(resolutionFault({ ...seam, kind: 'stylesheet' }, nothing)).toBeNull()
    // A component writing `var(--typo, 4px)` gets no such excuse: a fallback
    // there hides a misspelling behind a value that happens to look fine.
    expect(resolutionFault({ ...seam, kind: 'source' }, nothing)).not.toBeNull()
  })

  it('takes a component declaring on its own element as declared', () => {
    const asComponent = () => 'component' as const
    expect(
      resolutionFault(
        {
          name: '--background-blueprint-fill',
          kind: 'stylesheet',
          hasFallback: false,
        },
        asComponent,
      ),
    ).toBeNull()
  })

  it('still needs both arms, so neither becomes a dead carve-out', () => {
    const bare = consumers().filter(
      (entry) => entry.kind === 'stylesheet' && !entry.hasFallback,
    )
    const viaComponent = bare.filter(
      (entry) => declarerOf(entry.name) === 'component',
    )
    expect(
      report(viaComponent).length,
      'No stylesheet reads a token only a component declares any more — the ' +
        'component arm of this rule is carrying nothing, and should go with ' +
        'whatever removed the last one.',
    ).toBeGreaterThan(0)
    const seams = consumers().filter(
      (entry) => entry.kind === 'stylesheet' && entry.hasFallback,
    )
    expect(
      seams.filter((entry) => declarerOf(entry.name) === null).length,
      'Every stylesheet fallback now names something declared, so the ' +
        'fallback arm of this rule is excusing nothing.',
    ).toBeGreaterThan(0)
  })

  it('samples nothing Tailwind is told not to scan', () => {
    // The premise `declarerOf` rests on for `@theme` registrations: reading a
    // name is one of the things that emits it, so a read this file can see is
    // a read the build resolves. That holds only while everything this file
    // reads is also something Tailwind reads.
    //
    // Two ways to break it, one from each side. The exclusions are read off
    // the entry sheet rather than restated, so a NEW one fails here and gets
    // looked at: the five below name `docs/`, `scripts/`, the changelog and
    // the changesets, all of which sit outside the `src/styles/**.css` and
    // `src/**.ts(x)` this model samples, and the test files, which it already
    // skips. A sixth could name anything.
    const excluded = [
      ...stylesheet('tailwind.config.css').text.matchAll(
        /@source\s+not\s+'([^']+)'/g,
      ),
    ].map(([, pattern]) => pattern)
    expect(excluded.sort()).toEqual(
      [
        '../**/*.test.{ts,tsx}',
        '../../.changeset',
        '../../CHANGELOG.md',
        '../../docs',
        '../../scripts',
      ].sort(),
    )
    // And from the other side: the sample widening to take in a test file,
    // which is the one exclusion that overlaps where this model already looks.
    const sampled = [
      ...stylesheets().map((sheet) => sheet.file),
      ...sourceFiles().map((source) => source.file),
    ]
    expect(sampled.filter((file) => /\.test\.[jt]sx?$/.test(file))).toEqual([])
  })

  it('lets no prose the scan still reaches spell a theme key', () => {
    // The mirror image of the rule above, and the half `@source not` never
    // closed. Those lines say which files are prose; nothing says the set is
    // complete, and a kind of prose nobody thought of fails nothing at all.
    // That is how a release note came to be the sole reason a `@theme` key
    // stood in the shipped stylesheet, long after the code it was written
    // about was deleted.
    //
    // Stated as the property rather than as a list of files, so it needs no
    // upkeep and no exemptions: markdown offers a `--name` however it is
    // written, bare or backticked, so a `@theme` key spelled in any markdown
    // the scan still reaches is emitted for that reason alone. The subject is
    // a KIND of file — every one of the several dozen still in the scan — and
    // a failure names the sentence and whoever wrote it, not the glob, which
    // is what makes it survive a document being moved or renamed.
    //
    // Class names get no equivalent and cannot have one: any English word can
    // be a utility, so there is no finite set to intersect against. For those
    // `@source not` remains the whole of the defence.
    //
    // What the seam supplies is every style fact here — which names are
    // `@theme` keys, and what the entry sheet excludes. Prose is the one thing
    // the token model deliberately does not read, which is why the file list
    // is asked for separately.
    const registered = new Set(
      declarations()
        .filter((entry) =>
          [entry.selector, ...entry.context].some((scope) =>
            scope.startsWith('@theme'),
          ),
        )
        // A namespace reset (`--color-amber-*`) is a declaration but not a
        // name anything can spell.
        .filter((entry) => !entry.name.endsWith('*'))
        .map((entry) => entry.name),
    )
    expect(registered.size).toBeGreaterThan(0)

    const excluded = [
      ...stylesheet('tailwind.config.css').text.matchAll(
        /@source\s+not\s+'([^']+)'/g,
      ),
    ].map(([, pattern]) => scanExclusion(pattern))

    // Tailwind scans what the working tree holds and `.gitignore` does not
    // hide, tracked or not, which is exactly what the `commit` subject of
    // `scripts/sweep.mjs` lists. Asking for that subject rather than walking
    // the tree means the answer moves with `.gitignore` instead of with a skip
    // list kept here. No root is named either: the sweep's default is the
    // tree the run is in, which is where `lib/sourceTree` takes the
    // application's from too.
    const walk = sweep({
      subject: 'commit',
      where: (file) =>
        file.endsWith('.md') && !excluded.some((pattern) => pattern.test(file)),
      what: 'prose file a commit would carry',
    })
    const prose = walk.files
    expect(prose.length).toBeGreaterThan(0)

    // `git ls-files` reports the INDEX, which goes on naming a file after the
    // working tree has stopped having it — the state a release leaves behind
    // between consuming its changeset files and recording that they are gone.
    // So a listed path that is no longer there is skipped, and every other
    // read failure still throws; the sweep's `read` is where that rule is
    // stated. `prose.length` above is what keeps the skip honest: a sweep that
    // quietly skipped everything would report nothing.
    const spelled: string[] = []
    for (const file of prose) {
      const source = walk.read(file)
      if (source === null) continue
      source.split('\n').forEach((text, index) => {
        for (const [token] of text.matchAll(/--[a-zA-Z0-9_-]+/g)) {
          if (registered.has(token)) {
            spelled.push(`${file}:${index + 1} ${token}`)
          }
        }
      })
    }
    expect(
      spelled,
      'Prose inside the content scan spells a `@theme` key, which puts that ' +
        'key into the built stylesheet whether or not anything renders it. ' +
        'Either say it without the name, or take the file out of the scan ' +
        'beside the exclusions in `tailwind.config.css`.',
    ).toEqual([])
  })
})

/**
 * One `@source not` pattern as a test against a repository-relative path.
 *
 * The patterns are written relative to `src/styles`, where the entry sheet
 * sits, and the file list is relative to the repository root, so the leading
 * hops are resolved rather than matched. A bare directory or file name covers
 * itself and everything under it, which is how Tailwind reads it.
 */
function scanExclusion(pattern: string): RegExp {
  const path = pattern.replace(/^\.\.\/\.\.\//, '').replace(/^\.\.\//, 'src/')
  const body = path.replace(/\*\*\/|\*|\{[^}]*\}|[^*{]+/g, (piece) => {
    if (piece === '**/') return '(?:.*/)?'
    if (piece === '*') return '[^/]*'
    if (piece.startsWith('{')) {
      return `(${piece.slice(1, -1).split(',').join('|')})`
    }
    return piece.replace(/[.+^$()|[\]\\?]/g, '\\$&')
  })
  return new RegExp(`^${body}(?:/|$)`)
}

/* ------------------------------------------------------------------ *
 * Theme dials: the inputs semantic.css derives everything from. Each
 * must be declared in both theme files or a whole derivation chain
 * silently collapses in one mode.
 * ------------------------------------------------------------------ */

const DIALS = [
  '--hue',
  // Declared in both theme files since the unreachable `var(--hue)` default in
  // semantic.css went. It is a dial and not a derivation — a theme picks the
  // neutral ramp's hue — and each theme picks its own, so it belongs here and
  // not in MODE_INVARIANT_DIALS.
  '--surface-hue',
  '--chroma',
  '--surface',
  '--elevation-step',
  '--contrast',
  '--foreground-lightness',
  '--muted-foreground-level',
  '--tertiary-foreground-level',
  '--primary-lightness',
  '--primary-chroma',
  // No brand dial on this list, and none anywhere: the identity fill derives
  // from the pair above per channel, so there is no input here to declare
  // twice. `palette.test.ts` holds the absence — a dial declared in a theme
  // file takes its channel back off the accent in silence, which is the one
  // failure this derivation has.
  '--ring-lightness',
  // How far a role's edge sits off that role's own tint. A dial and not a
  // derivation — the two modes carry different fractions, for the reasons
  // semantic.css states beside the sweep — so print.css has to take it back
  // the way it takes back every other dial the themes disagree about.
  '--role-edge-step',
  '--warning-lightness',
  '--destructive-lightness',
  '--info-lightness',
  '--success-lightness',
]

/**
 * Dials whose value belongs to the design rather than to the mode.
 *
 * These are declared in BOTH theme files, at one value, the way `--hue` is.
 * Not because the cascade needs the second declaration — `themes/light.css`
 * opens on a bare `:root`, so everything in it reaches dark mode whether dark
 * restates it or not — but because that reach is a leak rather than a design.
 * It is the same mechanism that carried light's warm `--surface-hue` into dark
 * and ran every dark surface on it, silently, until somebody looked. A dial
 * that is mode-invariant says so in both files, and the two cannot drift
 * apart without failing below.
 */
const MODE_INVARIANT_DIALS = ['--hue', '--radius']

/** Semantic tokens the shadcn components consume via theme.css. */
const SEMANTIC_TOKENS = [
  '--background',
  '--foreground',
  '--canvas',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--primary-border',
  '--brand',
  '--brand-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--tertiary',
  '--tertiary-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--warning',
  '--warning-foreground',
  '--info',
  '--info-foreground',
  '--success',
  '--success-foreground',
  '--border',
  '--input',
  '--ring',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  '--sidebar-selected',
  '--sidebar-selected-foreground',
  '--sidebar-selected-rail',
  '--sidebar-ancestor',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
]

describe('theme dials and semantic layer', () => {
  it('declares every dial in both theme files', () => {
    const light = namesIn('themes/light.css')
    const dark = namesIn('themes/dark.css')
    expect(DIALS.filter((name) => !light.has(name))).toEqual([])
    expect(DIALS.filter((name) => !dark.has(name))).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    'resolves every dial to a number under %s',
    (theme) => {
      // The half the old reading could not do. Presence in a file is not the
      // same fact as winning at the root: `print.css` restates most of these
      // inside `@media print`, and `themes/light.css` declares most of them
      // under a bare `:root` that matches under dark as well.
      const broken = DIALS.filter((name) => {
        try {
          return !Number.isFinite(dial(name, theme))
        } catch {
          return true
        }
      })
      expect(broken).toEqual([])
    },
  )

  it.each(MODE_INVARIANT_DIALS)(
    'declares %s in both theme files, at one value',
    (name) => {
      // Each theme's own file is what wins in that theme. Drop the dial from
      // either one and the other's declaration leaks across to cover for it,
      // which is the arrangement this rule exists to forbid.
      expect(winningDeclaration(name, 'light')?.file).toBe('themes/light.css')
      expect(winningDeclaration(name, 'dark')?.file).toBe('themes/dark.css')
      expect(resolveValue(name, 'dark')).toBe(resolveValue(name, 'light'))
    },
  )

  it('leaves --radius out of the print override, so a printed corner is the screen corner', () => {
    // `print.css` restates the dials it needs to force the light palette, and
    // radius is not one of them. With both themes answering the same length,
    // print inherits that length whichever mode the page was in.
    const overridden = rulesDeclaring('--radius').filter((rule) =>
      rule.context.some((at) => /^@media\b/.test(at) && /\bprint\b/.test(at)),
    )
    expect(overridden.map((rule) => `${rule.file}:${rule.line}`)).toEqual([])
    expect(resolveValue('--radius', 'light')).toBe('0.5rem')
  })

  it('derives the four radius rungs as multiples of the base, and retires the rest', () => {
    const rungs = Object.fromEntries(
      declarationsIn('theme.css')
        .filter((entry) => entry.name.startsWith('--radius-'))
        .map((entry) => [entry.name, entry.value]),
    )
    expect(rungs['--radius-sm']).toBe('calc(var(--radius) * 0.5)')
    expect(rungs['--radius-md']).toBe('calc(var(--radius) * 0.75)')
    expect(rungs['--radius-lg']).toBe('var(--radius)')
    expect(rungs['--radius-xl']).toBe('calc(var(--radius) * 1.5)')
    expect(rungs['--radius-2xl']).toBeUndefined()
    expect(rungs['--radius-3xl']).toBeUndefined()
    expect(rungs['--radius-4xl']).toBeUndefined()
    expect(rungs['--radius-panel']).toBeUndefined()
  })

  it('declares md and lg shadows in the plain theme block so dark can override them', () => {
    const md = declarationsIn('theme.css').find(
      (entry) => entry.name === '--shadow-md',
    )
    const lg = declarationsIn('theme.css').find(
      (entry) => entry.name === '--shadow-lg',
    )
    expect(md?.selector).toBe('@theme')
    expect(lg?.selector).toBe('@theme')
    expect(md?.selector).not.toMatch(/inline/)
    const darkMd = winningDeclaration('--shadow-md', 'dark')
    const darkLg = winningDeclaration('--shadow-lg', 'dark')
    expect(darkMd?.file).toBe('themes/dark.css')
    expect(darkLg?.file).toBe('themes/dark.css')
    expect(darkMd?.value).toMatch(/inset/)
    expect(darkLg?.value).toMatch(/inset/)
    const floating = declarationsIn('theme.css').find(
      (entry) => entry.name === '--shadow-floating',
    )
    expect(floating?.value).toBe('var(--shadow-md)')
  })

  it('names the page gutter and the content gap as spacing keys', () => {
    const keys = Object.fromEntries(
      declarationsIn('theme.css')
        .filter(
          (entry) =>
            entry.name === '--spacing-gutter' ||
            entry.name === '--spacing-content',
        )
        .map((entry) => [entry.name, entry.value]),
    )
    expect(keys['--spacing-gutter']).toBe('2.5rem')
    expect(keys['--spacing-content']).toBe('1.25rem')
  })

  it('keeps the annotation chrome background mode-invariant and off a dial', () => {
    // The bar floats over a board of coloured cells and must not flip with
    // the theme. Declared off the designers' literal `--colors-*` export —
    // a dial would pull it into the theme the next time someone retunes
    // surface lightness.
    const light = resolveValue('--background-annotation-chrome', 'light')
    const dark = resolveValue('--background-annotation-chrome', 'dark')
    expect(dark).toBe(light)
    const decl = declarationsIn('semantic.css').find(
      (entry) => entry.name === '--background-annotation-chrome',
    )
    expect(decl?.value).toMatch(/var\(--colors-[a-z0-9-]+\)/)
    expect(decl?.value).not.toMatch(
      /var\(--(?:hue|surface|primary|brand|background|foreground)\)/,
    )
  })

  it('derives every semantic token in semantic.css', () => {
    const semantic = namesIn('semantic.css')
    expect(SEMANTIC_TOKENS.filter((name) => !semantic.has(name))).toEqual([])
  })

  it('re-derives every semantic token under .dark and .light subtree scopes', () => {
    // Custom properties resolve `var()` at computed-value time, before
    // inheritance — a subtree that re-declares a dial (the presentation stage)
    // needs the derivations re-declared at that scope, or it inherits the
    // ancestor's already-computed colours.
    //
    // The old reading of this rule checked that a `:root, .dark, .light` block
    // existed SOMEWHERE in the file. Now that the model records the selector
    // each declaration sits under, the rule can ask the question it always
    // meant: is every one of these tokens inside such a block.
    const scoped = new Map(
      declarationsIn('semantic.css').map((entry) => [entry.name, entry.selector]),
    )
    const misscoped = SEMANTIC_TOKENS.filter((name) => {
      const selector = scoped.get(name) ?? ''
      return !(
        selector.includes(':root') &&
        selector.includes('.dark') &&
        selector.includes('.light')
      )
    })
    expect(misscoped).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * The print override.
 *
 * `print.css` forces the light palette onto paper by restating dials
 * inside `@media print`, under `:root, .dark` — the `.dark` arm is what
 * takes the dark theme's declarations back, and it can only take back a
 * name it mentions. So the block has to mention every dial the two themes
 * disagree about, and the header comment in `print.css` said so in prose.
 * Prose does not run, and the block fell nineteen dials behind: a page
 * printed from dark mode kept dark's `--primary-lightness` (0.922) on the
 * light print ground (0.968), and dark's brand, warning and destructive
 * ramps with it.
 *
 * These are that sentence as assertions. Deliberately invariants and not a
 * census: nothing below counts the entries in the block or names the dials
 * it should hold, so a dial added to the theme files at differing values is
 * inside the first rule the day it is added — which is exactly what a count
 * of thirteen could not do.
 * ------------------------------------------------------------------ */

/**
 * Every dial, read off the theme files rather than listed here.
 *
 * `DIALS` above is a hand-kept list, and it is the right shape for what it
 * asserts — those fifteen are the inputs `semantic.css` derives from, and
 * naming them is how a rename gets caught. It is the wrong shape here. A
 * hand-kept list is the failure this file is guarding against.
 */
function themeDials(): string[] {
  return [
    ...new Set([
      ...namesIn('themes/light.css'),
      ...namesIn('themes/dark.css'),
    ]),
  ]
    /*
     * Elevation lives in the plain `@theme` block so dark can override it.
     * Dark restates `--shadow-*`; light does not. They are not dials the
     * print override must chase — print restates them explicitly.
     */
    .filter((name) => !name.startsWith('--shadow-'))
    .sort()
}

/**
 * The dials print sets to a value that is neither theme's, and why.
 *
 * Print is not light mode on paper — it is light mode on a sheet that is
 * already white, so the ground drops off the near-white ceiling to leave the
 * elevation ladder somewhere to climb. Those two are the whole of the
 * deviation, and stating them here is what lets the rule below be "every
 * other dial prints at its light value" instead of a list of hopes.
 *
 * A dial restated in the print block at the DARK value would satisfy the
 * mode-independence rule perfectly well — both modes would agree, on the
 * wrong colour. This is what stops that.
 */
const PAPER_TUNED: Record<string, string> = {
  // The light theme's 0.995 leaves no room above it: a raised surface rounds
  // up against L=1 and the ladder flattens. On paper the plates have to be
  // visible, so the ground drops and the step shrinks to match.
  '--surface': '0.968',
  '--elevation-step': '0.009',
}

describe('the print override', () => {
  it('resolves every dial to one value, whichever mode the page was in', () => {
    // The invariant. A page prints the same whether the reader had dark mode
    // on or not, and no list here has to be updated for that to keep being
    // true of a dial nobody has written yet.
    const modeBound = themeDials()
      .map((name) => ({
        name,
        light: resolveValue(name, 'light', 'print'),
        dark: resolveValue(name, 'dark', 'print'),
      }))
      .filter((entry) => entry.light !== entry.dark)
      .map(
        (entry) =>
          `${entry.name}: ${entry.light} from light, ${entry.dark} from dark`,
      )
    expect(modeBound).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    'prints every dial at its light-theme value, from %s',
    (theme) => {
      // And the value they agree on is the light theme's, for everything
      // except the two paper tunings above.
      const wrong = themeDials()
        .filter((name) => !(name in PAPER_TUNED))
        .map((name) => ({
          name,
          printed: resolveValue(name, theme, 'print'),
          light: resolveValue(name, 'light'),
        }))
        .filter((entry) => entry.printed !== entry.light)
        .map(
          (entry) =>
            `${entry.name}: prints ${entry.printed}, light is ${entry.light}`,
        )
      expect(wrong).toEqual([])
    },
  )

  it('deviates from the light theme only where PAPER_TUNED says so', () => {
    // The ledger is held from both ends, so it cannot keep an entry for a
    // deviation that has since been undone.
    const deviating = themeDials().filter(
      (name) =>
        resolveValue(name, 'light', 'print') !== resolveValue(name, 'light'),
    )
    expect(deviating.sort()).toEqual(Object.keys(PAPER_TUNED).sort())
    for (const [name, value] of Object.entries(PAPER_TUNED)) {
      expect(resolveValue(name, 'dark', 'print')).toBe(value)
    }
  })

  it('restates nothing the dark theme does not take over', () => {
    // The other end of the same rule. `.dark` can only take back a name the
    // block mentions, and the block has no business mentioning anything else:
    // a restatement of a dial both themes already agree on is a second copy
    // with nothing holding it, and the first rule above is what now enforces
    // "the two themes agree" — so the defensive copy buys nothing and rots.
    // This is the general form of the `--radius` rule above.
    const restated = declarationsIn('print.css').filter((rule) =>
      rule.context.some((at) => /^@media\b/.test(at) && /\bprint\b/.test(at)),
    )
    const unnecessary = [...new Set(restated.map((rule) => rule.name))]
      .filter((name) => !(name in PAPER_TUNED))
      .filter(
        (name) => resolveValue(name, 'light') === resolveValue(name, 'dark'),
      )
    expect(unnecessary.sort()).toEqual([])
  })

  it.each([
    ['--primary', 'the filled control'],
    ['--ring', 'the focus ring'],
    ['--brand', 'the identity fill'],
  ])('prints %s — %s — from dark exactly as light mode renders it', (token) => {
    // The three the bug was reported through, asserted where a reader sees
    // them: on the derived colour, not on the dial underneath it. All three
    // are `semantic.css` derivations now — the link that used to stand here
    // was a ramp step registered as `--color-brand-link`, inside an `@theme
    // inline` block that is not part of the root cascade, so only its dial
    // could be measured from here. The ramp is gone and `--brand` is a
    // derivation, so this rule reads the colour for all three.
    const light = resolveValue(token, 'light')
    // A token neither side can resolve would pass this by agreeing on
    // `undefined`, which is how the registered `--color-*` name slipped
    // through when it was written that way.
    expect(light).toBeDefined()
    expect(resolveValue(token, 'dark', 'print')).toBe(light)
  })
})

/* ------------------------------------------------------------------ *
 * Blueprint component tokens. A cell's resting colour comes from its LANE or
 * its touchpoint TONE, which comes from data, so blueprint.css hands the value
 * to the shared rules through `--{property}-blueprint-{part}` custom
 * properties declared per role. Nothing type-checks that contract.
 *
 * Which roles exist, and that each declares the full set, is asserted in
 * `palette.test.ts` — beside the contrast measurements that make the same
 * parse worth doing — and deliberately not restated here. What lives here is
 * the pair of rules about the VALUES those declarations carry, which is a
 * different question from which of them are present.
 * ------------------------------------------------------------------ */

const CELL_TOKENS = [
  '--background-blueprint-cell',
  '--background-blueprint-cell-hover',
  '--background-blueprint-cell-pressed',
  '--ring-blueprint-cell',
  '--foreground-blueprint-cell',
]

const ROLE_SELECTOR = /^\[data-blueprint-(?:lane|tone)='[a-z-]+'\]$/

describe('blueprint component tokens', () => {
  it('assigns only token references, never a raw colour', () => {
    // The whole point of the tier: a component token hands over a value that
    // was chosen in colors.css or semantic.css. A literal here would be a
    // colour invented at the consumer, invisible to both themes' palettes.
    //
    // Every role block, lanes and touchpoint tones alike. The old reading
    // matched `[data-blueprint-lane]` only, so the seven tone blocks — which
    // set the same five properties from the same ramps — were outside it.
    const literals = declarationsIn('blueprint.css')
      .filter((entry) => ROLE_SELECTOR.test(entry.selector))
      .filter((entry) => !/^(?:var\(|color-mix\()/.test(entry.value))
      .map((entry) => `${entry.selector} ${entry.name}: ${entry.value}`)
    expect(literals).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    'leaves no blueprint cell token reachable at the root under %s',
    (theme) => {
      // Every consumer reads these as `var(--…-blueprint-…, fallback)`, and
      // the fallback arm IS the default state. A declaration that won at the
      // root would make the property always resolve, so the default would
      // become unreachable.
      //
      // Asked of the cascade rather than of one `:root { … }` block, which is
      // what the old reading could see: a declaration under `.dark`, or under
      // `html.light`, or in a later sheet, would have passed that check and
      // broken the app in exactly the way it was written to prevent.
      const reachable = CELL_TOKENS.filter((name) =>
        winningDeclaration(name, theme),
      )
      expect(reachable).toEqual([])
    },
  )
})

/* ------------------------------------------------------------------ *
 * Motion vocabulary: animations.css and lib/motion.ts state the same
 * numbers; change both together or this fails.
 * ------------------------------------------------------------------ */

const MOTION_TOKENS = [
  '--motion-structural',
  '--motion-fade',
  '--motion-fade-stagger',
  '--motion-camera',
  '--motion-micro',
]

describe('motion tokens', () => {
  it('declares all five motion durations in animations.css', () => {
    for (const name of MOTION_TOKENS) {
      const rules = rulesDeclaring(name)
      expect(rules.map((rule) => rule.file), name).toEqual(['animations.css'])
      expect(rules[0].value, name).toMatch(/^\d+ms$/)
    }
  })

  it('agrees with lib/motion.ts', async () => {
    const motion = await import('../lib/motion')
    const ms = (name: string) =>
      Number(/^(\d+)ms$/.exec(rulesDeclaring(name)[0].value)![1])
    expect(ms('--motion-structural')).toBe(motion.MOTION_STRUCTURAL_MS)
    expect(ms('--motion-fade')).toBe(motion.MOTION_FADE_MS)
    expect(ms('--motion-fade-stagger')).toBe(motion.MOTION_FADE_STAGGER_MS)
    expect(ms('--motion-camera')).toBe(motion.MOTION_CAMERA_MS)
    expect(ms('--motion-micro')).toBe(motion.MOTION_MICRO_MS)
    expect(stylesheet('animations.css').text).toContain(
      motion.MOTION_STRUCTURAL_EASE,
    )
  })
})

/**
 * The role vocabulary: seven roles, seven names each, one shape.
 *
 * Asserted as an INVARIANT of the vocabulary and never as a census of it.
 * "Every role declares all seven" survives an eighth role being added and
 * starts failing the moment that role is short a name; "there are forty-nine
 * role tokens" is true once and wrong for every edit afterwards. That is the
 * distinction this codebase learned the expensive way in its migration ledger,
 * and it is the reason the rule is driven off `ROLES` rather than off a list
 * of names written out here.
 */
describe('the role vocabulary', () => {
  it('declares all seven names for every role', () => {
    expect(missingRoleTokens()).toEqual([])
  })

  it('fails when a role arrives with fewer than seven', () => {
    // The rule held to its own job. A completeness check that cannot be made
    // to fail is not a completeness check, and the failure mode it has to
    // catch is the realistic one: not a role with nothing declared, but a role
    // with six of the seven, which is what a hand-written role looks like.
    const short = new Set([...declaredNames(), ...roleTokens('ghost')])
    short.delete('--wash-ghost')
    expect(missingRoleTokens([...ROLES, 'ghost'], short)).toEqual(['--wash-ghost'])
  })

  it('makes every role name reachable as a utility', () => {
    // A name nothing can be written against is a name that does not exist. The
    // Tailwind map is the only route from a semantic token to a class, so the
    // rule is that every one of the forty-nine is read there — and it is
    // driven off the role list, so an eighth role has to be registered as well
    // as declared.
    const unregistered = ROLES.flatMap((role) =>
      roleTokens(role).filter(
        (name) =>
          !consumersOf(name).some((entry) => entry.file.endsWith('theme.css')),
      ),
    )
    expect(unregistered).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    'resolves every role name to a colour under %s',
    (theme) => {
      // Declared is not the same fact as resolves. A name whose derivation
      // reaches a `var()` that only one theme declares is declared in the file
      // and resolves to nothing in the other, which is the failure the dial
      // rules above exist for and which reaches these names too.
      const unresolved = ROLES.flatMap((role) =>
        roleTokens(role).filter((name) => resolveValue(name, theme) === undefined),
      )
      expect(unresolved).toEqual([])
    },
  )

  it('derives every role name in semantic.css, inside the re-scoped block', () => {
    // Custom properties resolve their `var()`s at computed-value time, before
    // inheritance, so a subtree that re-declares a dial needs the derivations
    // re-declared at that scope. A role name outside that block inherits the
    // ancestor's already-computed colour and quietly ignores the theme it is
    // sitting in.
    const scoped = new Map(
      declarationsIn('semantic.css').map((entry) => [entry.name, entry.selector]),
    )
    const misplaced = ROLES.flatMap((role) =>
      roleTokens(role).filter((name) => {
        const selector = scoped.get(name) ?? ''
        return !(
          selector.includes(':root') &&
          selector.includes('.dark') &&
          selector.includes('.light')
        )
      }),
    )
    expect(misplaced).toEqual([])
  })
})


/**
 * A role tint stands off the surface it is drawn on, and not off the page.
 *
 * The tint is six percent of the signed canvas→ink span, and an elevation rung
 * is a step of the same size, so a tint derived from the page lands on top of
 * any surface raised off the page. Every role measured 1.02:1 against a card in
 * dark, where the card itself sits 1.09:1 off the canvas — the tint was doing
 * nothing and the role edge was carrying the whole shape. Light read 1.18 only
 * because its span runs the other way and the two distances happened to add;
 * the same arithmetic was underneath it.
 *
 * A stylesheet cannot see what is behind a declaration, so the ground is named
 * on the element by the component that paints the surface, and `semantic.css`
 * re-derives at that scope. These rules are what hold the two halves to each
 * other, and they are written as invariants: the grounds come from the
 * stylesheet, the roles from `ROLES`, and neither list is restated here. A
 * fourth ground or an eighth role is inside every rule below the day it is
 * added.
 */

/** Every ground the stylesheet offers: the page, then each named surface. */
const grounds = () => {
  const scopes = rulesDeclaring('--ground')
    .map((rule) => /^\[data-ground='([a-z-]+)'\]$/.exec(rule.selector))
    .filter((match) => match !== null)
  return [
    // The page is the ground the block itself declares, and `--background` is
    // what the page is painted with.
    { name: 'page', scope: [] as string[], surface: '--background' },
    // A ground is NAMED for its surface — `card` is `--card` — which is what
    // lets a component say what it is without knowing which rung that is.
    ...scopes.map((match) => ({
      name: match[1],
      scope: [match[0]],
      surface: `--${match[1]}`,
    })),
  ]
}

/**
 * How far a tint has to stand off its ground. Under this it is not a surface,
 * it is the ground with a rumour of colour on it — which is what 1.02:1 was.
 */
const TINT_FLOOR = 1.08

/**
 * How much the choice of ground may change that distance.
 *
 * This is the rule that says the fix worked rather than merely that the number
 * is large: a tint is supposed to be the same step off whatever it is drawn on,
 * so the ground may move the measurement a little — contrast ratio is not
 * linear in lightness — and may not decide it.
 */
const GROUND_DRIFT = 0.06

describe('a role tint stands off its ground', () => {
  it('names a surface this vocabulary declares, for every ground', () => {
    // The naming is the whole seam. If `[data-ground='card']` did not answer
    // to `--card`, a component saying `card` would be choosing a lightness
    // nothing paints, and every measurement below would be of a surface that
    // is not on the screen.
    const unnamed = grounds().filter(
      (entry) => resolveValue(entry.surface, 'dark') === undefined,
    )
    expect(unnamed.map((entry) => entry.name)).toEqual([])
  })

  it('offers the component tier exactly the grounds the stylesheet has', () => {
    // Two tiers stating one vocabulary, the way animations.css and lib/motion.ts
    // do below. A ground in `lib/ground.ts` that no scope re-derives at is a
    // component politely telling the stylesheet nothing.
    const scoped = grounds()
      .filter((entry) => entry.name !== 'page')
      .map((entry) => entry.name)
    expect([...GROUNDS].sort()).toEqual([...scoped].sort())
  })

  it.each(['light', 'dark'] as const)(
    'clears every ground, for every role, under %s',
    (theme) => {
      const failures = grounds().flatMap((entry) => {
        const surface = resolveColor(entry.surface, theme)
        return ROLES.filter(
          (role) =>
            contrast(
              resolveColor(`--surface-${role}`, theme, { scope: entry.scope }),
              surface,
            ) < TINT_FLOOR,
        ).map((role) => `${role} on ${entry.name}`)
      })
      expect(failures).toEqual([])
    },
  )

  it.each(['light', 'dark'] as const)(
    'lets the ground move that distance and never decide it, under %s',
    (theme) => {
      const drifted = ROLES.filter((role) => {
        const measured = grounds().map((entry) =>
          contrast(
            resolveColor(`--surface-${role}`, theme, { scope: entry.scope }),
            resolveColor(entry.surface, theme),
          ),
        )
        return Math.max(...measured) - Math.min(...measured) > GROUND_DRIFT
      })
      expect(drifted).toEqual([])
    },
  )

  it('fails on a tint that was derived from the page', () => {
    // The defect itself, as the rule sees it. `--surface-{role}` read at the
    // ROOT is the page-relative tint this vocabulary shipped; measured against
    // a card it is the 1.02:1 that opened the question. A rule that could not
    // produce this failure would pass just as quietly on a tree where nothing
    // had been fixed.
    const card = resolveColor('--card', 'dark')
    const measured = ROLES.map((role) =>
      contrast(resolveColor(`--surface-${role}`, 'dark'), card),
    )
    expect(Math.max(...measured)).toBeLessThan(TINT_FLOOR)
  })
})
