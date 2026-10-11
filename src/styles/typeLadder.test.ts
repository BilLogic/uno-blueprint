import { describe, expect, it } from 'vitest'
import {
  classListHas,
  classListOf,
  classLists,
  classListsIn,
  type ClassListInput,
} from '@/lib/classList'
import { sourceOf } from '@/lib/sourceTree'
import { declarationsIn } from '@/lib/tokenModel'

/**
 * The type ladder, and the guards that hold it. A rung owns size and
 * leading; a call site owns weight, tracking and ink.
 *
 * Nine type rungs, two type scopes, one ratio each. Nothing below `xs`. On a
 * presentation surface the floor is `sm`. The roster must know both
 * scopes, or a legitimate mono `sm` (14px) reads as off-ladder.
 */

const THEME = sourceOf('styles/theme.css')
const INPUT = sourceOf('components/ui/input.tsx')

const RUNGS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] as const

const SANS: Record<(typeof RUNGS)[number], string> = {
  xs: '.75rem',
  sm: '.8125rem',
  base: '.9375rem',
  lg: '1rem',
  xl: '1.125rem',
  '2xl': '1.375rem',
  '3xl': '1.75rem',
  '4xl': '2.125rem',
  '5xl': '2.875rem',
}

const MONO: Record<(typeof RUNGS)[number], string> = {
  xs: '.75rem',
  sm: '.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
}

const RATIO: Record<(typeof RUNGS)[number], string> = {
  xs: 'calc(1 / .75)',
  sm: 'calc(1.25 / .875)',
  base: 'calc(1.5 / 1)',
  lg: 'calc(1.75 / 1.125)',
  xl: 'calc(1.75 / 1.25)',
  '2xl': 'calc(2 / 1.5)',
  '3xl': 'calc(2.25 / 1.875)',
  '4xl': 'calc(2.5 / 2.25)',
  '5xl': '1',
}

const MONO_SELECTOR = '.font-mono, code, kbd, pre, samp'

const BELOW_XS = /^(?:[a-z-]+:)*!?text-(?:2xs|3xs|4xs|5xs)$/
const AT_OR_BELOW_XS = /^(?:[a-z-]+:)*!?text-(?:xs|2xs|3xs|4xs|5xs)$/
const ARBITRARY_SIZE =
  /^(?:[a-z-]+:)*!?text-\[(\d+(?:\.\d+)?|\.\d+)(px|rem)\]$/

/** Cover plus the three presentation-stage files whose floor is `sm`. */
const PRESENTATION_FILES = new Set([
  'components/editor/SlicePresentation.tsx',
  'components/editor/SliceHeaderBand.tsx',
  'components/editor/SlideArtboard.tsx',
])

/**
 * Collapse a CSS numeric so `.8125rem` and `0.8125rem` compare equal.
 *
 * @param value - a declaration value
 */
function compactRem(value: string): string {
  return value.replace(/0+\./, '.').replace(/ /g, '')
}

/**
 * The theme.css declaration of `name` whose selector contains `needle`.
 *
 * @param name - custom property
 * @param needle - substring of the selector list
 */
function declaredAs(name: string, needle: string) {
  return declarationsIn('theme.css').find(
    (entry) => entry.name === name && entry.selector.includes(needle),
  )
}

/**
 * A size-rung declaration the roster can judge.
 */
type SizeDecl = {
  name: string
  value: string
  selector: string
}

/**
 * The rung of a size custom property, or null.
 *
 * `--text-sm` → `sm`. `--text-color-*` and `--text-*--line-height` are
 * not sizes. Any other `--text-*` is a rung, including a name the nine
 * do not use — that is how a tenth rung fails instead of slipping past
 * a pattern that only knows `xs`/`sm`/`xl`.
 *
 * @param name - a custom property
 */
function sizeRungOf(name: string): string | null {
  if (!name.startsWith('--text-')) return null
  if (name.startsWith('--text-color-')) return null
  if (name.includes('--line-height')) return null
  return name.slice('--text-'.length)
}

/**
 * Type rung declarations in `theme.css`, both type scopes.
 *
 * Line-heights and `--text-color-*` stay out: those are not rungs.
 */
function textSizeDeclarations(): SizeDecl[] {
  return declarationsIn('theme.css').filter(
    (entry) => sizeRungOf(entry.name) !== null,
  )
}

/**
 * Declarations whose rung is not one of the nine the ADR tables.
 *
 * @param decls - size custom properties
 */
function offRoster(decls: readonly SizeDecl[]): SizeDecl[] {
  return decls.filter((entry) => {
    const rung = sizeRungOf(entry.name)
    return !rung || !(RUNGS as readonly string[]).includes(rung)
  })
}

/**
 * Format a size declaration so a failure names the scope and the rung.
 *
 * @param entry - one size custom property
 */
function describeDecl(entry: SizeDecl): string {
  const scope = entry.selector.includes('.font-mono') ? 'mono' : 'sans'
  return `${scope} ${entry.name}: ${entry.value}`
}

/**
 * Pixel size of an arbitrary `text-[Npx]` / `text-[Nrem]` utility, or null.
 *
 * @param token - one class
 */
function arbitraryPx(token: string): number | null {
  const match = ARBITRARY_SIZE.exec(token)
  if (!match) return null
  const n = Number(match[1])
  return match[2] === 'rem' ? n * 16 : n
}

/**
 * True iff `classes` names a rung below `xs`, or an absolute size below 12px.
 *
 * @param classes - one class list
 */
function belowFloor(classes: ClassListInput): boolean {
  return classListOf(classes).some((token) => {
    if (BELOW_XS.test(token)) return true
    const px = arbitraryPx(token)
    return px !== null && px < 12
  })
}

/**
 * True iff `classes` names `xs` or a rung below it.
 *
 * @param classes - one class list
 */
function atOrBelowXs(classes: ClassListInput): boolean {
  return classListOf(classes).some((token) => AT_OR_BELOW_XS.test(token))
}

/**
 * Whether `file` is a presentation surface, whose floor is `sm`.
 *
 * Cover copy and the three stage files. Editing chrome under
 * `components/editor/` stays on `xs` and is not in this set.
 *
 * @param file - path relative to `src`, as `classLists()` reports it
 */
function isPresentationSurface(file: string): boolean {
  return file.startsWith('components/cover/') || PRESENTATION_FILES.has(file)
}

/**
 * Format a class-list site so a failure names the file, the line, and the classes.
 *
 * @param site - one class list
 */
function describeSite(site: { file: string; line: number; classes: string[] }): string {
  return `${site.file}:${site.line}: ${site.classes.join(' ')}`
}

describe('the type ladder', () => {
  it('declares nine sans rungs and their ratios once, on the theme root', () => {
    for (const rung of RUNGS) {
      const size = declaredAs(`--text-${rung}`, '@theme')
      const leading = declaredAs(`--text-${rung}--line-height`, '@theme')
      expect(size, `--text-${rung} on @theme`).toBeDefined()
      expect(compactRem(size?.value ?? ''), rung).toBe(compactRem(SANS[rung]))
      expect(leading, `--text-${rung}--line-height on @theme`).toBeDefined()
      expect(compactRem(leading?.value ?? ''), `${rung} pairing`).toBe(
        compactRem(RATIO[rung]),
      )
    }
  })

  it('declares the nine mono sizes on the mono scope, and no line-heights there', () => {
    for (const rung of RUNGS) {
      const size = declaredAs(`--text-${rung}`, '.font-mono')
      expect(size, `--text-${rung} on the mono scope`).toBeDefined()
      expect(size?.selector).toBe(MONO_SELECTOR)
      expect(compactRem(size?.value ?? ''), rung).toBe(compactRem(MONO[rung]))
    }
    const monoLeadings = declarationsIn('theme.css').filter(
      (entry) =>
        entry.selector === MONO_SELECTOR &&
        entry.name.endsWith('--line-height'),
    )
    expect(monoLeadings).toEqual([])
  })

  it('gives text-sm a 13px face and an 18.57px box in prose, and 14px / 20px in code', () => {
    // The ratio is `calc(1.25 / .875)`: a 20px line box for what was a 14px
    // rung. The same ratio meeting sans sm (13px) is 18.571…px; meeting mono
    // sm (14px) is 20px. Read off the declarations, not restated as literals.
    const sans = declaredAs('--text-sm', '@theme')
    const mono = declaredAs('--text-sm', '.font-mono')
    const leading = declaredAs('--text-sm--line-height', '@theme')
    const sansRem = Number.parseFloat(sans?.value ?? '')
    const monoRem = Number.parseFloat(mono?.value ?? '')
    const ratio = 1.25 / 0.875
    expect(leading?.value.replace(/\s+/g, '')).toBe('calc(1.25/.875)')
    expect(sansRem * 16).toBe(13)
    expect(monoRem * 16).toBe(14)
    expect(sansRem * 16 * ratio).toBeCloseTo(18.57, 2)
    expect(monoRem * 16 * ratio).toBe(20)
  })

  it('sizes the field input at 16px below md and 13px above it', () => {
    // `lg` is exactly 1rem, the iOS zoom-on-focus floor. `base` drops to 15px
    // in this same edit, so the input cannot stay on it.
    expect(INPUT).toMatch(/\btext-lg\b/)
    expect(INPUT).toMatch(/\bmd:text-sm\b/)
    expect(INPUT).not.toMatch(/\btext-base\b/)
  })
})

describe('the roster', () => {
  it('fails a tenth rung in either scope', () => {
    const tenthSans: SizeDecl = {
      name: '--text-6xl',
      value: '4rem',
      selector: '@theme',
    }
    const tenthMono: SizeDecl = {
      name: '--text-tiny',
      value: '0.5rem',
      selector: MONO_SELECTOR,
    }
    expect(offRoster([tenthSans]).map(describeDecl)).toEqual([
      'sans --text-6xl: 4rem',
    ])
    expect(offRoster([tenthMono]).map(describeDecl)).toEqual([
      'mono --text-tiny: 0.5rem',
    ])
  })

  it('passes a legitimate mono sm', () => {
    const mono = declaredAs('--text-sm', '.font-mono')
    expect(mono, 'mono --text-sm').toBeDefined()
    expect(compactRem(mono?.value ?? '')).toBe(compactRem(MONO.sm))
    expect(Number.parseFloat(mono?.value ?? '') * 16).toBe(14)
    // A roster that only knew sans sizes would take 14px as off-ladder:
    // sans sm is 13px, and 14px is on no sans rung.
    const sansPx = new Set(
      Object.values(SANS).map((value) => Number.parseFloat(value) * 16),
    )
    expect(sansPx.has(14)).toBe(false)
    expect(offRoster([mono!])).toEqual([])
  })

  it('declares no size rung off the roster, in either scope', () => {
    const extra = offRoster(textSizeDeclarations())
    expect(extra.map(describeDecl), extra.map(describeDecl).join('\n')).toEqual(
      [],
    )
  })
})

describe('the floor', () => {
  it('fails a class that names a rung below xs', () => {
    const sites = classListsIn(
      `<span className="text-2xs font-medium text-muted-foreground">Label</span>`,
    )
    expect(sites.some((site) => classListHas(site.classes, 'text-2xs'))).toBe(
      true,
    )
    expect(sites.some((site) => belowFloor(site.classes))).toBe(true)
  })

  it('fails an arbitrary font-size below 12px', () => {
    const sites = classListsIn(`<span className="text-[11px]">Hint</span>`)
    expect(sites.some((site) => belowFloor(site.classes))).toBe(true)
    const rem = classListsIn(`<span className="text-[0.6875rem]">Hint</span>`)
    expect(rem.some((site) => belowFloor(site.classes))).toBe(true)
  })

  it('passes xs and a 12px arbitrary size', () => {
    expect(
      belowFloor(classListsIn(`<span className="text-xs">Chrome</span>`)[0]!.classes),
    ).toBe(false)
    expect(
      belowFloor(
        classListsIn(`<span className="text-[12px]">Chrome</span>`)[0]!.classes,
      ),
    ).toBe(false)
  })

  it('holds the authored tree at xs or above', { timeout: 20_000 }, () => {
    const offenders = classLists().filter((site) => belowFloor(site.classes))
    expect(
      offenders.map(describeSite),
      offenders.map(describeSite).join('\n'),
    ).toEqual([])
  })
})

describe('the display floor', () => {
  it('fails xs on a presentation-surface component', () => {
    const sites = classListsIn(
      `<p className="text-xs text-foreground">Caption</p>`,
      'components/editor/SlicePresentation.tsx',
    )
    expect(sites.every((site) => isPresentationSurface(site.file))).toBe(true)
    expect(sites.some((site) => classListHas(site.classes, 'text-xs'))).toBe(
      true,
    )
    expect(sites.some((site) => atOrBelowXs(site.classes))).toBe(true)
  })

  it('passes xs on editor chrome', () => {
    const sites = classListsIn(
      `<span className="text-xs font-medium text-muted-foreground">Sessions</span>`,
      'components/editor/agent/AgentSessionsView.tsx',
    )
    expect(sites.some((site) => isPresentationSurface(site.file))).toBe(false)
    expect(sites.some((site) => atOrBelowXs(site.classes))).toBe(true)
  })

  it('holds presentation surfaces at sm or above', { timeout: 20_000 }, () => {
    const offenders = classLists().filter(
      (site) => isPresentationSurface(site.file) && atOrBelowXs(site.classes),
    )
    expect(
      offenders.map(describeSite),
      offenders.map(describeSite).join('\n'),
    ).toEqual([])
  })
})

describe('the 4xs/5xs geometry defence', () => {
  it('is answered, naming the type-ladder decision, and the four rungs are gone', () => {
    expect(THEME).toMatch(/theme\.css:531-534/)
    expect(THEME).toMatch(/the decision that a rung owns size and leading/)
    expect(THEME).toMatch(/a rung is chosen for the text's/)
    expect(THEME).toMatch(/never to fit a container/)
    expect(THEME).not.toMatch(/the rungs remain until then/)
    for (const name of ['--text-2xs', '--text-3xs', '--text-4xs', '--text-5xs']) {
      expect(THEME, name).not.toMatch(new RegExp(`${name}:`))
      expect(declaredAs(name, '@theme'), name).toBeUndefined()
    }
  })
})
