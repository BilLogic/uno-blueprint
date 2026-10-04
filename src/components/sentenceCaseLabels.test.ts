import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strippedSourcesOn, surfaceOf } from '@/lib/sourceTree'

/*
 * SMALL LABELS ARE SENTENCE CASE.
 *
 * A badge, a tag, an eyebrow, a phase marker, a group heading: 12px sans in
 * muted ink, letter-spacing 0, in the case the string was written in. Never
 * capitals forced by CSS, and never the wide tracking that came with them.
 *
 * The case lives in the STRING. An acronym stays as typed because nothing
 * rewrites it; a label that wants a capital has one in its source. So the rule
 * is enforceable as an absence: no product file may ask CSS to transform case
 * or to open the tracking out. "Product" is the authored components, the dev
 * pages, the class-string constants in `lib/`, `contexts/` and the app root.
 *
 * The vendored tree under `components/ui` belongs to the component CLI and is
 * never edited by hand. Where a primitive capitalises — the command group heading
 * does — the wrapper that renders it restates the label rule; a test below
 * holds that.
 */

/** One rule: a name for the failure and a test of one line. */
type Rule = { name: string; test: (line: string) => boolean }

/** A tracking utility not itself negated (`-tracking-…` tightens). */
const TRACKING = '(?:^|[^\\w-])tracking-'

/** Is any captured number in `line` (by `pattern`, group 1) above zero? */
const anyPositive = (pattern: RegExp) => (line: string) =>
  [...line.matchAll(pattern)].some((match) => Number.parseFloat(match[1]) > 0)

/** A case-forcing utility, bare or under variants (`md:`, `!`, `**:[…]:`). */
const CASE_UTILITY = /^!?(?:[^\s]*:)?!?(uppercase|capitalize)$/

/** Single-word utilities, so a lone `flex` reads as a class and not a word. */
const UNHYPHENATED = new Set([
  'absolute', 'block', 'capitalize', 'contents', 'fixed', 'flex', 'grid',
  'grow', 'hidden', 'inline', 'invisible', 'isolate', 'italic', 'lowercase',
  'relative', 'shrink', 'static', 'sticky', 'truncate', 'underline',
  'uppercase', 'visible',
])

/** Does this token read as a utility rather than an English word? */
const isUtility = (token: string) =>
  UNHYPHENATED.has(token) || /[-:[\]!/]/.test(token)

/**
 * Case-forcing utilities written in a CLASS STRING.
 *
 * Every quoted literal in `code` (template expressions blanked) is read as a
 * class list only when each of its tokens is utility-shaped. So
 * `'text-xs uppercase'` is a use, and a sentence of copy or prose that
 * happens to say "uppercase" is not. Returns `[line, utility]` pairs.
 */
function caseUtilitiesIn(code: string): [number, string][] {
  const found: [number, string][] = []
  for (const match of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const body = match[2].replace(/\$\{[^}]*\}/g, ' ')
    const tokens = body.split(/\s+/).filter(Boolean)
    if (tokens.length === 0 || !tokens.every(isUtility)) continue
    const line = code.slice(0, match.index).split('\n').length
    for (const token of tokens) {
      const hit = CASE_UTILITY.exec(token)
      if (hit) found.push([line, hit[1]])
    }
  }
  return found
}

/** Utilities and inline styles that capitalise or letterspace a label. */
const FORBIDDEN: readonly Rule[] = [
  {
    name: 'inline text-transform',
    test: (line) => /textTransform\s*:\s*['"`](?:uppercase|capitalize)\b/.test(line),
  },
  {
    name: 'wide tracking',
    test: (line) => new RegExp(`${TRACKING}(?:wide|wider|widest)\\b`).test(line),
  },
  {
    name: 'arbitrary positive tracking',
    test: anyPositive(new RegExp(`${TRACKING}\\[\\s*\\+?(\\d*\\.?\\d+)`, 'g')),
  },
  {
    name: 'positive inline letter-spacing',
    test: anyPositive(/letterSpacing\s*:\s*['"`]?\s*\+?(\d*\.?\d+)/g),
  },
]

/** The same rule, in a stylesheet. */
const FORBIDDEN_CSS: readonly Rule[] = [
  {
    name: 'text-transform',
    test: (line) => /text-transform\s*:\s*(?:uppercase|capitalize)\b/.test(line),
  },
  {
    name: '@apply case utility',
    test: (line) => /@apply[^;]*(?:^|[\s:])(?:uppercase|capitalize)\b/.test(line),
  },
  {
    name: '@apply wide tracking',
    test: (line) => /@apply[^;]*(?:^|[^\w-])tracking-(?:wide|wider|widest)\b/.test(line),
  },
  {
    name: 'positive letter-spacing',
    test: anyPositive(/letter-spacing\s*:\s*\+?(\d*\.?\d+)/g),
  },
]

/**
 * Files that name a casing utility as DATA rather than apply it.
 *
 * The class-list reader keeps a table of unhyphenated utilities so it can
 * recognise them; `uppercase` is one entry in that table, not a label.
 */
const NAMES_UTILITIES_AS_DATA = new Set(['lib/classList.ts'])

/**
 * Product source: authored components, the dev pages, the class-string
 * constants and context providers under `lib/` and `contexts/`, and the app
 * root — never the vendored `ui/` tree, never a test.
 */
const productSources = () =>
  strippedSourcesOn('app').filter(
    ({ file }) =>
      !NAMES_UTILITIES_AS_DATA.has(file) &&
      surfaceOf(file) !== 'ui' &&
      (file === 'App.tsx' ||
        ['components/', 'dev/', 'lib/', 'contexts/'].some((prefix) =>
          file.startsWith(prefix),
        )),
  )

/** Every stylesheet under `src/styles`, comments blanked. */
function stylesheets(): { file: string; code: string }[] {
  const root = join(process.cwd(), 'src')
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return walk(path)
      return entry.name.endsWith('.css') ? [path] : []
    })
  return walk(join(root, 'styles')).map((path) => ({
    file: relative(root, path),
    code: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replace(/[^\n]/g, ' '),
    ),
  }))
}

/** `file:line: rule` for every line of `code` a rule matches. */
function offendersIn(file: string, code: string, rules: readonly Rule[]): string[] {
  return code.split('\n').flatMap((line, index) =>
    rules
      .filter(({ test }) => test(line))
      .map(({ name }) => `${file}:${index + 1}: ${name} — ${line.trim().slice(0, 100)}`),
  )
}

/**
 * Each `<CommandGroup … heading=…>` element in `code` whose own className
 * does not restate the label rule over the primitive's capitals.
 *
 * Per element, not per file: one wrapped group does not excuse its sibling.
 * A `className={NAME}` resolves against a string constant in the same file.
 */
function unwrappedCommandGroups(code: string): string[] {
  const constants = new Map(
    [...code.matchAll(/const\s+(\w+)\s*(?::[^=]+)?=\s*['"`]([^'"`]*)['"`]/g)].map(
      (match) => [match[1], match[2]] as const,
    ),
  )
  return [...code.matchAll(/<CommandGroup\b([^>]*)>/g)]
    .filter((match) => /\bheading=/.test(match[1]))
    .filter((match) => {
      const attrs = match[1]
      const literal = /className=\s*["'`{]\s*['"`]?([^"'`}]*)/.exec(attrs)
      const named = /className=\{\s*(\w+)\s*\}/.exec(attrs)
      const classes = named ? (constants.get(named[1]) ?? '') : (literal?.[1] ?? '')
      return !(
        /\[\[cmdk-group-heading\]\]:font-sans\b/.test(classes) &&
        /\[\[cmdk-group-heading\]\]:normal-case\b/.test(classes) &&
        /\[\[cmdk-group-heading\]\]:tracking-normal\b/.test(classes)
      )
    })
    .map((match) => match[0].replace(/\s+/g, ' ').slice(0, 100))
}

describe('small labels are sentence case', () => {
  it('no product source capitalises or letterspaces a label', () => {
    const offenders = productSources().flatMap(({ file, code }) => [
      ...offendersIn(file, code, FORBIDDEN),
      ...caseUtilitiesIn(code).map(([line, utility]) => `${file}:${line}: ${utility}`),
    ])
    expect(
      offenders,
      `Write the label in sentence case and drop the transform:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('no stylesheet capitalises or letterspaces a label', () => {
    const offenders = stylesheets().flatMap(({ file, code }) =>
      offendersIn(file, code, FORBIDDEN_CSS),
    )
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('a wrapper restates the rule over each primitive that capitalises', () => {
    // `CommandGroup` sets its heading in mono capitals with wide tracking.
    const offenders = productSources().flatMap(({ file, code }) =>
      unwrappedCommandGroups(code).map((element) => `${file}: ${element}`),
    )
    expect(
      offenders,
      `Each CommandGroup heading must restate font-sans, normal-case and tracking-normal:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('reads a forced-case label when there is one, so the guard is not vacuous', () => {
    const flagged = (line: string) =>
      FORBIDDEN.some(({ test }) => test(line)) || caseUtilitiesIn(line).length > 0
    expect(flagged(`className="text-xs font-medium tracking-wide uppercase"`)).toBe(true)
    expect(flagged(`cn('font-mono', 'tracking-wider')`)).toBe(true)
    expect(flagged(`style={{ textTransform: 'uppercase' }}`)).toBe(true)
    expect(flagged(`className="text-xs font-medium text-muted-foreground"`)).toBe(false)
    expect(flagged(`className="tracking-tight tracking-normal normal-case"`)).toBe(false)
  })

  it('reads case utilities in class strings, not in prose or copy', () => {
    const hits = (code: string) => caseUtilitiesIn(code).map(([, utility]) => utility)
    expect(hits(`className="text-xs capitalize"`)).toEqual(['capitalize'])
    expect(hits(`cn('font-medium', 'md:uppercase')`)).toEqual(['uppercase'])
    expect(hits("const C = `text-xs ${x} uppercase`")).toEqual(['uppercase'])
    expect(hits(`const K = '**:[[cmdk-group-heading]]:uppercase'`)).toEqual(['uppercase'])
    expect(hits(`label: 'Type it in uppercase to confirm'`)).toEqual([])
    expect(hits(`const why = "capitalize the first word"`)).toEqual([])
    expect(hits(`className="normal-case text-xs"`)).toEqual([])
  })

  it('flags an inline text-transform that forces case', () => {
    const flagged = (line: string) => FORBIDDEN.some(({ test }) => test(line))
    expect(flagged(`style={{ textTransform: 'capitalize' }}`)).toBe(true)
    expect(flagged(`style={{ textTransform: "uppercase" }}`)).toBe(true)
    expect(flagged(`style={{ textTransform: 'none' }}`)).toBe(false)
  })

  it('flags positive arbitrary tracking only', () => {
    const flagged = (line: string) => FORBIDDEN.some(({ test }) => test(line))
    expect(flagged(`className="tracking-[0.2em]"`)).toBe(true)
    expect(flagged(`className="tracking-[.1em]"`)).toBe(true)
    expect(flagged(`className="md:tracking-[1px]"`)).toBe(true)
    expect(flagged(`className="tracking-[0em]"`)).toBe(false)
    expect(flagged(`className="-tracking-[0.02em]"`)).toBe(false)
    expect(flagged(`className="tracking-[-0.02em]"`)).toBe(false)
  })

  it('flags any positive inline letter-spacing', () => {
    const flagged = (line: string) => FORBIDDEN.some(({ test }) => test(line))
    expect(flagged(`style={{ letterSpacing: '0.04em' }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: '1px' }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: '2px' }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: 2 }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: '.1rem' }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: 0 }}`)).toBe(false)
    expect(flagged(`style={{ letterSpacing: '0em' }}`)).toBe(false)
    expect(flagged(`style={{ letterSpacing: '-0.01em' }}`)).toBe(false)
  })

  it('reads a forced-case stylesheet rule', () => {
    const flagged = (line: string) => FORBIDDEN_CSS.some(({ test }) => test(line))
    expect(flagged('  text-transform: uppercase;')).toBe(true)
    expect(flagged('  text-transform: capitalize;')).toBe(true)
    expect(flagged('  @apply text-xs capitalize;')).toBe(true)
    expect(flagged('  text-transform: none;')).toBe(false)
    expect(flagged('  letter-spacing: 0.05em;')).toBe(true)
    expect(flagged('  letter-spacing: -0.01em;')).toBe(false)
    expect(flagged('  letter-spacing: 0;')).toBe(false)
  })

  it('checks each CommandGroup, not the file', () => {
    const wrapped = `const H = '**:[[cmdk-group-heading]]:font-sans **:[[cmdk-group-heading]]:normal-case **:[[cmdk-group-heading]]:tracking-normal'`
    expect(
      unwrappedCommandGroups(`${wrapped}\n<CommandGroup className={H} heading="A">`),
    ).toEqual([])
    expect(
      unwrappedCommandGroups(
        `${wrapped}\n<CommandGroup className={H} heading="A">\n<CommandGroup heading="B">`,
      ),
    ).toHaveLength(1)
    expect(
      unwrappedCommandGroups(
        `<CommandGroup className="**:[[cmdk-group-heading]]:normal-case" heading="C">`,
      ),
    ).toHaveLength(1)
    // Two of the three is not enough: the primitive's mono face stays.
    expect(
      unwrappedCommandGroups(
        `<CommandGroup className="**:[[cmdk-group-heading]]:normal-case **:[[cmdk-group-heading]]:tracking-normal" heading="D">`,
      ),
    ).toHaveLength(1)
    expect(unwrappedCommandGroups(`<CommandGroup>`)).toEqual([])
  })
})
