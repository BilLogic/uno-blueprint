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
 * or to open the tracking out.
 *
 * The vendored tree under `components/ui` belongs to the component CLI and is
 * never edited by hand. Where a primitive capitalises — the command group heading
 * does — the wrapper that renders it restates the label rule; the second test
 * holds that.
 */

/** Utilities and inline styles that capitalise or letterspace a label. */
const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: 'uppercase', pattern: /\buppercase\b/ },
  { name: 'wide tracking', pattern: /\btracking-(?:wide|wider|widest)\b/ },
  { name: 'arbitrary positive tracking', pattern: /\btracking-\[\d/ },
  {
    name: 'positive inline letter-spacing',
    pattern: /letterSpacing\s*:\s*['"]?0?\.\d*[1-9]\d*(?:em|rem|px)/,
  },
]

/** The same rule, in a stylesheet. */
const FORBIDDEN_CSS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'text-transform: uppercase', pattern: /text-transform\s*:\s*uppercase/ },
  { name: '@apply uppercase', pattern: /@apply[^;]*\buppercase\b/ },
  { name: '@apply wide tracking', pattern: /@apply[^;]*\btracking-(?:wide|wider|widest)\b/ },
]

/** Product source: authored components and the dev pages, never `ui/`. */
const productSources = () =>
  [...strippedSourcesOn('components'), ...strippedSourcesOn('dev')].filter(
    ({ file }) => surfaceOf(file) !== 'ui',
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
function offendersIn(
  file: string,
  code: string,
  rules: readonly { name: string; pattern: RegExp }[],
): string[] {
  return code.split('\n').flatMap((line, index) =>
    rules
      .filter(({ pattern }) => pattern.test(line))
      .map(({ name }) => `${file}:${index + 1}: ${name} — ${line.trim().slice(0, 100)}`),
  )
}

describe('small labels are sentence case', () => {
  it('no product component capitalises or letterspaces a label', () => {
    const offenders = productSources().flatMap(({ file, code }) =>
      offendersIn(file, code, FORBIDDEN),
    )
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

  it('a wrapper restates the rule over a primitive that capitalises', () => {
    // `CommandGroup` sets its heading in mono capitals with wide tracking.
    const offenders = productSources()
      .filter(({ code }) => /<CommandGroup\b[^>]*\bheading=/.test(code))
      .filter(
        ({ code }) =>
          !/\[\[cmdk-group-heading\]\]:normal-case/.test(code) ||
          !/\[\[cmdk-group-heading\]\]:tracking-normal/.test(code),
      )
      .map(({ file }) => file)
    expect(
      offenders,
      `A CommandGroup heading here must restate normal-case and tracking-normal:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('reads a forced-case label when there is one, so the guard is not vacuous', () => {
    const flagged = (line: string) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(line))
    expect(flagged(`className="text-xs font-medium tracking-wide uppercase"`)).toBe(true)
    expect(flagged(`cn('font-mono', 'tracking-wider')`)).toBe(true)
    expect(flagged(`className="tracking-[0.2em]"`)).toBe(true)
    expect(flagged(`style={{ textTransform: 'uppercase' }}`)).toBe(true)
    expect(flagged(`style={{ letterSpacing: '0.04em' }}`)).toBe(true)
    expect(flagged(`className="text-xs font-medium text-muted-foreground"`)).toBe(false)
    expect(flagged(`className="tracking-tight tracking-normal normal-case"`)).toBe(false)
    expect(
      FORBIDDEN_CSS.some(({ pattern }) => pattern.test('  text-transform: uppercase;')),
    ).toBe(true)
  })
})
