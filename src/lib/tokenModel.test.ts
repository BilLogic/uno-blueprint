import { describe, expect, it } from 'vitest'
import { sweep } from '../../scripts/sweep.mjs'
import {
  consumersOf,
  contrast,
  declarationsIn,
  declaredNames,
  declarations,
  hslToRgb,
  parseColor,
  resolveColor,
  resolveColorValue,
  resolveValue,
  rulesDeclaring,
  sourceFiles,
  sourceMatching,
  stripComments,
  stylesheet,
  stylesheetMatching,
  stylesheets,
  winningDeclaration,
} from '@/lib/tokenModel'
import type { Medium, Scope, StyleUse } from '@/lib/tokenModel'

/**
 * The seam's own guard.
 *
 * The decision that one token model is the single style seam makes
 * `tokenModel` the one place that answers what the token layer declares, so
 * every rule built on it inherits whatever the reader cannot see.
 * A reader's blind spot does not announce itself: no rule fails, because a
 * rule only fails on what it can read. That is the failure mode this file
 * exists to make loud, and each case below is one the simpler readers this
 * model replaced actually got wrong on this tree.
 */

describe('the declaration reader', () => {
  it('sees a declaration wrapped across lines', () => {
    // Forty-two declarations in this tree are wrapped, and `--primary` — the
    // most-derived name in the system — is one of them. A per-line regex, the
    // shape both readers this model replaced used, sees none of them.
    const wrapped = rulesDeclaring('--primary')
    expect(wrapped).toHaveLength(1)
    expect(wrapped[0].file).toBe('semantic.css')
    expect(wrapped[0].selector).toBe(':root, .dark, .light, [data-ground]')
    // Whitespace-collapsed, so how a value was wrapped is not part of what it is.
    expect(wrapped[0].value).toBe(
      'oklch( var(--primary-lightness) var(--primary-chroma) var(--primary-hue) )',
    )
    expect(wrapped[0].value).not.toMatch(/\n/)
  })

  it('reports a wrapped declaration at the line its name sits on', () => {
    const [declaration] = rulesDeclaring('--primary')
    const line = stylesheet('semantic.css').text.split('\n')[
      declaration.line - 1
    ]
    expect(line).toContain('--primary:')
  })

  it('misses none of the declarations in any sheet', () => {
    // The blunt cross-check: count `--name:` at the start of a line in the raw
    // text and compare, sheet by sheet. A reader that drops a shape drops the
    // count with it. Every stylesheet is checked rather than a chosen one,
    // because choosing is the habit this model exists to end.
    for (const sheet of stylesheets()) {
      const text = sheet.text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
        comment.replace(/[^\n]/g, ' '),
      )
      const written = [...text.matchAll(/^\s*--[a-zA-Z0-9-]+\*?\s*:/gm)].length
      expect(
        `${sheet.file}: ${declarationsIn(sheet.file).length}`,
      ).toBe(`${sheet.file}: ${written}`)
    }
  })

  it('reads a Tailwind namespace reset as a declaration', () => {
    // `unset-tw-colors.css` is `--color-amber-*: initial` resets and nothing
    // else. A name pattern that stopped at the hyphen made the whole file
    // invisible, which is a file the cascade depends on being there.
    //
    // The shape is the assertion, never the count: WHICH families belong on
    // the list is `tailwindColorReset.test.ts`'s question, and it answers it
    // against Tailwind's own theme rather than against a number written here.
    const resets = declarationsIn('unset-tw-colors.css')
    expect(resets.length).toBeGreaterThan(0)
    expect(resets.every((entry) => entry.name.endsWith('-*'))).toBe(true)
    expect(resets.every((entry) => entry.value === 'initial')).toBe(true)
  })
})

describe('the cascade', () => {
  it('sets aside whichever at-rules the medium does not reach', () => {
    // `print.css` restates dials inside `@media print`, under `:root, .dark`.
    // A resolver without at-rule context reports print.css as the winner for
    // every one of them, in both themes — which would make the screen palette
    // unmeasurable from here.
    const inPrint = rulesDeclaring('--surface').find(
      (entry) => entry.file === 'print.css',
    )
    expect(inPrint?.context).toEqual(['@media print'])
    expect(winningDeclaration('--surface', 'light')?.file).toBe(
      'themes/light.css',
    )
    expect(winningDeclaration('--surface', 'dark')?.file).toBe('themes/dark.css')

    // And on `print` the same block is the winner instead — the question the
    // print rules in `styles/tokens.test.ts` are asked against.
    expect(winningDeclaration('--surface', 'dark', 'print')?.file).toBe(
      'print.css',
    )

    // The mirror image, and the reason the medium had to cut both ways:
    // `colors.css` wraps its ENTIRE dark palette in `@media screen`, so the
    // `:root` light ramp above it is what a printed page reads even from a
    // dark one. 204 values that print.css never has to copy.
    const screenOnly = rulesDeclaring('--color-blue-900').find((entry) =>
      entry.context.includes('@media screen'),
    )
    expect(screenOnly?.selector).toBe('.dark')
    expect(winningDeclaration('--color-blue-900', 'dark')?.line).toBe(
      screenOnly?.line,
    )
    expect(
      winningDeclaration('--color-blue-900', 'dark', 'print')?.selector,
    ).toBe(':root')
  })

  it('breaks the :root / .dark tie on source order, the way the browser does', () => {
    // Both selectors carry specificity (0,1,0), so the later import wins.
    // `themes/light.css` matches bare `:root`, which matches under dark too;
    // `themes/dark.css` imports after it and is what takes `--surface` back.
    const order = new Map(stylesheets().map((s) => [s.file, s.order]))
    expect(order.get('themes/light.css')!).toBeLessThan(
      order.get('themes/dark.css')!,
    )
    expect(resolveValue('--surface', 'light')).toBe('0.995')
    expect(resolveValue('--surface', 'dark')).toBe('0.19')
  })

  it('chases var() through to a value', () => {
    // `--primary` is three dials deep and every colour assertion rests on the
    // resolved triple rather than on the text of the declaration.
    expect(resolveValue('--primary', 'light')).toBe('oklch( 0.536 0.101 175 )')
    expect(resolveValue('--primary', 'dark')).toBe('oklch( 0.771 0.129 175 )')
  })
})

/**
 * The source reader, and the property the style rules cannot check about
 * themselves: that a reported `file:line` is the line the reader means.
 *
 * `stripComments` used to DELETE block comments rather than blank them, so
 * every newline inside a file's header vanished and every line number after it
 * shifted up by the header's height. Nothing failed, because a passing rule
 * reports no lines at all — the drift only shows once a rule starts failing,
 * which is the moment the number has to be right. Converting the token
 * discipline guard onto this model is that moment: it names a file and a line
 * for every offender it finds, and `dev/ArrowSituationCatalogPage.tsx` opens
 * with a thirteen-line header, so its `#2563eb` on line 28 was being reported
 * at line 15, on an import statement.
 */
describe('the source reader', () => {
  // The raw file, opened the way the model opens it: the `app` subject of
  // `scripts/sweep.mjs`, whose paths read `src/…` wherever the file is. A
  // reader resolved from THIS file's location would agree with the model here
  // and disagree with it in a deployment, where the model reads the overlay
  // and the test would still be reading the package.
  const app = sweep({ subject: 'app', what: 'file of the application' })
  const raw = (file: string): string => {
    const text = app.read(`src/${file}`)
    if (text === null) throw new Error(`src/${file} went away mid-test`)
    return text
  }

  it('reads the whole of src, not a chosen list of roots', () => {
    // The rule this model absorbed already read every `.ts`/`.tsx` under
    // `src`. Sampling less while claiming to generalise would have been a
    // silent narrowing, which is the exact defect the single-style-seam
    // decision is about.
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(300)
    for (const root of ['components/', 'contexts/', 'hooks/', 'lib/', 'data/']) {
      expect(files.some((file) => file.file.startsWith(root))).toBe(true)
    }
    expect(files.some((file) => file.file === 'App.tsx')).toBe(true)
    expect(files.some((file) => file.file.includes('.test.'))).toBe(false)
  })

  it('keeps every line, so a stripped file numbers the same as the raw one', () => {
    for (const source of sourceFiles()) {
      const text = raw(source.file)
      expect(source.code.split('\n')).toHaveLength(text.split('\n').length)
    }
  })

  it('reports a match at the line it sits on in the file on disk', () => {
    // One end-to-end check through the same path a rule takes, rather than
    // trusting the line-count equality above to imply it.
    const matches = sourceMatching(/ARROW_COLOR = /g)
    expect(matches.length).toBeGreaterThan(0)
    for (const match of matches) {
      const [file, line] = match.split(':')
      const lines = raw(file).split('\n')
      expect(lines[Number(line) - 1]).toContain('ARROW_COLOR = ')
    }
  })

  it('still blanks what a comment says, so a comment is not a use', () => {
    const stripped = stripComments('const a = 1 /* text-red-500 */\nconst b = 2\n')
    expect(stripped).not.toContain('text-red-500')
    expect(stripped.split('\n')).toHaveLength(3)
  })

  it('sees a name read from source and not from any stylesheet', () => {
    // Liveness cannot be read off the stylesheets. `--colors-white` is
    // declared in `global.css` and read from a JSX attribute in
    // `CanvasPenCursor` — a read no stylesheet scan can see, whatever else it
    // finds. It used to be read from source and NOWHERE else, which made it
    // the whole example; the annotation-chrome ink ladder now takes it from
    // `semantic.css` too, so the example is stated as the property rather
    // than as that one name's census, and survives the next ladder.
    expect(
      consumersOf('--colors-white').filter((entry) => entry.kind === 'source')
        .length,
    ).toBe(1)

    const sourceOnly = [...declaredNames()].filter((name) => {
      const reads = consumersOf(name)
      return (
        reads.some((entry) => entry.kind === 'source') &&
        !reads.some((entry) => entry.kind === 'stylesheet')
      )
    })
    expect(sourceOnly.length).toBeGreaterThan(0)
  })

  it('sees Tailwind bare-value shorthand as a read', () => {
    // `duration-(--motion-micro)` resolves the property exactly as `var()`
    // does. A `var(`-only scan reads straight past it, and every reference
    // written that way would be free to dangle.
    const shorthand = consumersOf('--motion-micro').filter(
      (entry) => entry.kind === 'source' && entry.via !== 'var',
    )
    expect(shorthand.length).toBeGreaterThan(0)
  })

  it('tells a fallback read from a bare one', () => {
    // The blueprint cell tokens are declared per role and read at the cell as
    // `var(--…-blueprint-cell, <default>)`, where the fallback arm IS the
    // resting state. A dangling-reference rule that could not see the comma
    // would have to either exempt them by name or fail on every one.
    const cell = consumersOf('--background-blueprint-cell')
    expect(cell.some((entry) => entry.hasFallback)).toBe(true)
  })
})

/**
 * The colour reader.
 *
 * Every contrast rule in this suite used to restate the arithmetic of the
 * declaration it measured — a `clamp()` in CSS and a `Math.min(Math.max(…))`
 * beside it in TypeScript. Two copies of one derivation is the arrangement
 * where a rule keeps passing after the thing it claims to measure has moved,
 * so the model reads the declaration instead. These cases are the ones that
 * would let it read a declaration wrongly and say nothing.
 */
/**
 * The stylesheet half of the reader, and the property that decides how wide a
 * stylesheet rule can be: a stylesheet's prose is not a use of what it names.
 *
 * Every rule this model backed read `src/**.tsx` and stopped there, so a
 * stylesheet was free to consume a name at a tier the same rule forbade a
 * component to touch. `stylesheetMatching` is the half that closes that, and
 * the cases below are the ones a raw-text scan of the same files gets wrong.
 *
 * This codebase writes a paragraph above almost every block, and those
 * paragraphs quote the names they explain. `colors.css`'s header spells
 * `var(--color-amber-100)` twice to explain the Tailwind namespace split, and
 * a text scan reports both — which would make the first `var()` rule fail on a
 * file that paints nothing, and teach the next reader that the rule cannot be
 * trusted. Matching declared VALUES rather than text is what avoids that, and
 * it is worth asserting rather than assuming.
 */
describe('the stylesheet reader', () => {
  it('reads a value, not the prose that names it', () => {
    // Two in colors.css's header, nought in its declarations: this file
    // declares the ramp, and registration — the self-referential
    // `--color-amber-100: var(--color-amber-100)` — happens in theme.css.
    expect(stylesheet('colors.css').text).toContain('var(--color-amber-100)')
    const prose = stylesheetMatching(/var\(--color-amber-100\)/g).filter(
      (use) => use.file === 'colors.css',
    )
    expect(prose).toEqual([])
  })

  it('reads values, not the declarations that sit beside them', () => {
    // A declaration site — a name followed by its colon — is text every
    // stylesheet is full of and no VALUE ever contains. A text scan reports
    // `semantic.css` here; a value scan reports nothing, which is the whole
    // difference. The name itself is read as a value elsewhere, so this is
    // the left-hand side being excluded rather than the name being absent.
    expect(stylesheet('semantic.css').text).toContain('--annotation-selected:')
    expect(stylesheetMatching(/--annotation-selected:/g)).toEqual([])
    expect(
      stylesheetMatching(/var\(--annotation-selected\)/g).length,
    ).toBeGreaterThan(0)
  })

  it('reports a match at the line it sits on in the file on disk', () => {
    const matches = stylesheetMatching(/var\(--color-blue-900\)/g)
    expect(matches.length).toBeGreaterThan(0)
    for (const use of matches) {
      const line = stylesheet(use.file).text.split('\n')[use.line - 1]
      expect(line).toContain(use.match)
    }
  })

  it('carries the layer, so a rule can scope itself by tier rather than by filename', () => {
    const registered = stylesheetMatching(/var\(--color-amber-100\)/g)
    expect(registered.map((use) => `${use.file}:${use.layer}`)).toContain(
      'theme.css:registry',
    )
  })

  it('names the declaration a match was carried by, not just the file', () => {
    // The same text in two tiers, told apart by what carries it: theme.css
    // registers the step self-referentially, semantic.css spends it on a
    // role. A rule that may forbid one and not the other needs both halves.
    const uses = stylesheetMatching(/var\(--color-blue-900\)/g)
    const carried = uses.map(
      (use) => `${use.file}:${use.layer}:${use.property}`,
    )
    expect(carried).toContain('theme.css:registry:--color-blue-900')
    expect(carried).toContain('semantic.css:semantic:--annotation-selected')
    const role = uses.find((use) => use.property === '--annotation-selected')!
    expect(role.selector).toContain(':root')
    expect(role.match).toBe('var(--color-blue-900)')
  })

  it('reports every match in a value, not the first', () => {
    // `[data-ground='card']` derives `--ground` from two elevation names in
    // one `calc()`. A reader that stopped at the first match would report a
    // declaration as reading half of what it reads.
    const elevations = stylesheetMatching(
      /var\(--elevation[a-z0-9-]*\)/g,
    ).filter((use) => use.selector === "[data-ground='card']")
    expect(elevations.map((use) => use.match)).toEqual([
      'var(--elevation-step)',
      'var(--elevation-2)',
    ])
  })

  it('finds nothing for a pattern no declared value carries', () => {
    expect(stylesheetMatching(/var\(--no-such-name-anywhere\)/g)).toEqual([])
  })
})

/**
 * The two answers this reader gives that the deployment's copy does not, kept
 * whole while it grew the two it was missing.
 *
 * `Medium` and `Scope` are not decoration on the cascade — they are the second
 * and third question a rule asks after "which theme". A change that widened
 * the reader's reach and quietly narrowed either of these would be a reader
 * that answers more questions and fewer of the ones already being asked.
 */
describe('the reader still answers by medium and by scope', () => {
  it('takes a medium and reads the cascade that medium reaches', () => {
    const screen: Medium = 'screen'
    const print: Medium = 'print'
    // `print.css` restates `--surface` inside `@media print`; on screen the
    // theme file wins, on paper the print block does.
    expect(winningDeclaration('--surface', 'dark', screen)?.file).toBe(
      'themes/dark.css',
    )
    expect(winningDeclaration('--surface', 'dark', print)?.file).toBe(
      'print.css',
    )
    // And the mirror: colors.css wraps its dark palette in `@media screen`,
    // so a printed dark page reads the light ramp above it.
    expect(winningDeclaration('--color-blue-900', 'dark', screen)?.selector).toBe(
      '.dark',
    )
    expect(winningDeclaration('--color-blue-900', 'dark', print)?.selector).toBe(
      ':root',
    )
  })

  it('takes a scope and reads the subtree it names', () => {
    const root: Scope = []
    const card: Scope = ["[data-ground='card']"]
    // `--ground` is declared at `[data-ground]` and re-derived per surface.
    // Reading it at the root and on a card must not give the same answer, or
    // the subtree arithmetic in semantic.css is not being read at all.
    const atRoot = resolveValue('--ground', 'dark', 'screen', root)
    const onCard = resolveValue('--ground', 'dark', 'screen', card)
    expect(atRoot).toBeDefined()
    expect(onCard).toBeDefined()
    expect(onCard).not.toBe(atRoot)
    expect(winningDeclaration('--ground', 'dark', 'screen', card)?.selector).toBe(
      "[data-ground='card']",
    )
    // A scope is spelled the way the stylesheet spells it, so the scopes a
    // rule asks about come from the stylesheet rather than a list of its own.
    const declared = rulesDeclaring('--ground').map((rule) => rule.selector)
    expect(declared).toContain(card[0])
  })

  it('answers both repos through one shape', () => {
    // The point of the merge: one reader, and a `StyleUse` sits beside the
    // medium and scope answers rather than in place of them.
    const use: StyleUse | undefined = stylesheetMatching(
      /var\(--color-blue-900\)/g,
    )[0]
    expect(use).toBeDefined()
    expect(typeof use!.match).toBe('string')
    expect(typeof use!.property).toBe('string')
    expect(typeof use!.selector).toBe('string')
    expect(typeof use!.file).toBe('string')
    expect(typeof use!.line).toBe('number')
    expect(declarationsIn(use!.file).some((d) => d.line === use!.line)).toBe(
      true,
    )
  })
})

describe('the colour reader', () => {
  it('reads a slash as alpha in a component slot and as division inside calc', () => {
    // `oklch(from x l calc(c / 2) h / 30%)` divides once and separates once.
    // A parser with one rule for `/` either loses the alpha or multiplies the
    // chroma by the alpha, and both answers look like a colour.
    const colour = parseColor('oklch(from oklch(0.5 0.2 100) l calc(c / 2) h / 30%)')
    expect(colour.c).toBeCloseTo(0.1, 10)
    expect(colour.alpha).toBeCloseTo(0.3, 10)
  })

  it('gives a relative colour the origin alpha when the slot is omitted', () => {
    // Otherwise `oklch(from <translucent> l c h)` silently becomes opaque, and
    // a measurement against it reports a ground that never renders.
    expect(parseColor('oklch(from oklch(0.5 0 0 / 40%) l c h)').alpha).toBeCloseTo(
      0.4,
      10,
    )
  })

  it('refuses a relative keyword used outside a relative colour', () => {
    expect(() => parseColor('oklch(l 0 0)')).toThrow(/relative colour/)
  })

  it('reads both alpha spellings of hsl', () => {
    // The legacy palette export writes `hsla(0, 0%, 0%, 0.05)`; the derivation
    // layer writes `hsl(0deg 0% 0% / 5%)`. Both are in this tree.
    expect(parseColor('hsla(0, 0%, 0%, 0.05)').alpha).toBeCloseTo(0.05, 10)
    expect(parseColor('hsl(0deg 0% 0% / 5%)').alpha).toBeCloseTo(0.05, 10)
  })

  it('agrees with the ramp reader on a colour both can read', () => {
    // `palette()` parses `colors.css` with a regex and this parses the same
    // declaration as CSS. Two readers of one file that disagree is the defect
    // the single seam exists to prevent, so they are held to each other.
    const viaParser = resolveColor('--color-blue-900', 'light')
    const [h, s, l] = /hsl\(\s*([\d.]+)[^\d]*([\d.]+)%\s*,?\s*([\d.]+)%/.exec(
      resolveValue('--color-blue-900', 'light') ?? '',
    )!.slice(1)
    expect(contrast(viaParser, hslToRgb(Number(h), Number(s), Number(l)))).toBe(1)
  })

  it('refuses to measure a translucent token against no ground', () => {
    // `--muted` is `--foreground` at a few percent. Measured as though it were
    // opaque it reads as near-black ink; painted on the page it is a hairline
    // lift. The first number is not a worse answer, it is a different token.
    expect(() => resolveColor('--muted', 'light')).toThrow(/translucent/)
  })

  it('reads every colour-valued declaration in the tree', () => {
    // The reader's sampling, held the way the declaration reader's is. A
    // parser that quietly failed on one spelling would narrow every rule built
    // on it, and no rule would fail to say so.
    const unreadable: string[] = []
    for (const name of new Set(declarations().map((entry) => entry.name))) {
      for (const theme of ['light', 'dark'] as const) {
        const value = resolveValue(name, theme)
        if (!value || !/^(oklch|hsla?|#)/.test(value.trim())) continue
        try {
          resolveColorValue(name, theme)
        } catch (thrown) {
          unreadable.push(`${name} (${theme}): ${(thrown as Error).message}`)
        }
      }
    }
    expect(unreadable).toEqual([])
  })
})
