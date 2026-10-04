import { describe, expect, it } from 'vitest'
import { filesOn, surfaceOf } from '@/lib/sourceTree'

/*
 * TWO WAYS TO LABEL A THING, AND ONLY TWO.
 *
 *   `PanelSectionLabel` — a section name inside a panel.
 *   `Eyebrow` — a small word over a region of chrome. One spelling, in one
 *     file.
 *
 * Both are sentence case now, like every small label
 * (`sentenceCaseLabels.test.ts` holds that across the tree). What this file
 * still holds is the older half: the capitalised hand-spelling that both
 * primitives replaced does not come back.
 *
 * Both existed before this test and both were bypassed: a dependency group
 * inlined its own capitalised label while every other panel section used the
 * primitive, and twenty-odd eyebrows were written by hand at two different
 * letterspacings. Every utility in those strings is legal on its own, which is
 * why review never caught it — the drift is only visible when you count.
 *
 * So the rule is enforced where it can be: an authored component may not spell
 * an eyebrow itself. The primitives are exempt, being the place it is spelled.
 */

/** The primitives, and the vendored tree the component CLI owns. */
const EXEMPT = new Set([
  'components/blueprint/Eyebrow.tsx',
  'components/blueprint/PanelSectionLabel.tsx',
])

/**
 * A capitalised SMALL label written by hand: the eyebrow, spelled out.
 *
 * Both halves are load-bearing. `uppercase` alone catches a badge — a divider
 * badge is capitals too, and it is a different thing: a badge says what
 * something IS and carries its own geometry and colour. An eyebrow is `text-xs`
 * chrome furniture over a region, which is the pair this matches.
 */
const HAND_SPELLED = /(?=.*\buppercase\b)(?=.*\btext-xs\b)/

/**
 * Every authored component, text and all.
 *
 * The vendored tree is skipped by SURFACE rather than by folder name partway
 * through a walk: the component CLI owns what is under `components/ui`, and
 * that is a named region of the application rather than a directory this rule
 * recognised on its way past.
 */
const componentFiles = () =>
  filesOn(
    'components',
    (path) =>
      path.endsWith('.tsx') &&
      !path.includes('.test.') &&
      surfaceOf(path) !== 'ui' &&
      !EXEMPT.has(path),
  )

describe('an eyebrow is spelled in one place', () => {
  it('is not written by hand in a component', () => {
    const offenders = componentFiles().flatMap(({ file, text }) => {
      const lines = text.split('\n')
      return lines.flatMap((line, index) => {
        // Only class strings. Prose about the register — and there is some,
        // in files that explain why they carry a mono one — is not a use.
        if (!HAND_SPELLED.test(line)) return []
        if (!/className|cn\(|'|"/.test(line)) return []
        if (/^\s*(\/\/|\*|\/\*)/.test(line.trim())) return []
        // The mono registers are their own thing: a phase marker and a slide
        // number are identity, not chrome furniture, and they say so.
        if (/font-mono/.test(line)) return []
        return [`${file}:${index + 1}: ${line.trim().slice(0, 100)}`]
      })
    })
    expect(
      offenders,
      `Use <Eyebrow> — it is one spelling, in one file:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('reads a hand-spelled eyebrow when there is one, so the guard is not vacuous', () => {
    // The exact string this replaced, at both letterspacings it was found in.
    expect(HAND_SPELLED.test('className="text-xs font-medium tracking-wide text-muted-foreground uppercase"')).toBe(true)
    expect(HAND_SPELLED.test('className="text-xs font-medium tracking-wider text-muted-foreground uppercase"')).toBe(true)
    expect(HAND_SPELLED.test('className="text-xs font-medium text-muted-foreground"')).toBe(false)
  })
})
