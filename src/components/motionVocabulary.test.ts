import { describe, expect, it } from 'vitest'
import { strippedSourcesOn, type StrippedSource } from '@/lib/sourceTree'

/**
 * ONE MOTION VOCABULARY FOR THE PRODUCT LAYER.
 *
 * Every transition a product surface declares says three things out loud: how
 * long (a `--motion-*` rung), which way it eases (one of the four roles — arrive,
 * leave, move, spring) and what happens under reduced motion. A stock Tailwind
 * `duration-200` or `ease-out` is a number nobody chose, and a bare
 * `transition-colors` inherits Tailwind's default curve and 150 ms without
 * saying so — which is how a product ends up with a dozen near-identical
 * timings that read as noise rather than as a system.
 *
 * The rule is checked per string literal, because a class string is where a
 * transition is declared and where its timing has to sit beside it: a
 * transition in one literal and its duration in a conditional three lines down
 * is the shape that drifts.
 *
 * NOT checked: the vendored `ui/` layer, which keeps its upstream timings
 * (vendored primitives stay pristine — a product surface that wants a
 * different feel gets it in its wrapper), and the stylesheets, whose motion
 * the drift test in `lib/motion.test.ts` already holds to the tokens.
 */

const PRODUCT: StrippedSource[] = [
  ...strippedSourcesOn('components').filter(
    ({ file }) => !file.startsWith('components/ui/'),
  ),
  ...strippedSourcesOn('hooks'),
  ...strippedSourcesOn('lib').filter(
    ({ file }) => !file.startsWith('lib/agent/') && !file.startsWith('lib/backend/'),
  ),
]

/** The four roles. Structural and camera stay as CSS aliases, not as classes. */
const EASE = /^ease-(arrive|leave|move|spring)$/
const DURATION = /^duration-\(--motion-(micro|fade|fade-stagger|structural|camera)\)$/
/** A transition or an enter/exit animation, i.e. something with a timing. */
const TIMED = /^(transition(-[a-z]+|-\[[^\]]+\])?|animate-(in|out))$/

/** Numbers and curves nobody chose. */
const FORBIDDEN = [
  /^duration-(\d+|\[[^\]]+\])$/,
  /^delay-(\d+|\[[^\]]+\])$/,
  /^ease-(in|out|in-out|linear|\[[^\]]+\])$/,
  /^ease-(structural|camera)$/,
]

/** Every string literal in the code (comments already blanked). */
function literals(code: string): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = []
  const pattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const match of code.matchAll(pattern)) {
    found.push({
      text: match[0].slice(1, -1),
      line: code.slice(0, match.index).split('\n').length,
    })
  }
  return found
}

/** `motion-reduce:hover:ease-out` → { variants: 'motion-reduce:hover', base: 'ease-out' }. */
function splitVariant(token: string): { variants: string; base: string } {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i += 1) {
    const char = token[i]
    if (char === '[' || char === '(') depth += 1
    else if (char === ']' || char === ')') depth -= 1
    else if (char === ':' && depth === 0) cut = i
  }
  const base = token.slice(cut + 1).replace(/^!|!$/g, '')
  return { variants: cut < 0 ? '' : token.slice(0, cut), base }
}

type Finding = { at: string; problem: string }

/** What is wrong with one literal, if anything. */
function motionFindings(text: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean).map(splitVariant)
  const problems: string[] = []

  for (const { base } of tokens) {
    if (FORBIDDEN.some((rule) => rule.test(base))) {
      problems.push(`\`${base}\` is not a motion token`)
    }
  }

  const timed = tokens.filter(
    ({ variants, base }) =>
      TIMED.test(base) &&
      base !== 'transition-none' &&
      !variants.includes('motion-reduce'),
  )
  if (timed.length === 0) return problems

  const has = (rule: RegExp) => tokens.some(({ base }) => rule.test(base))
  const names = timed.map(({ base }) => base).join(', ')
  if (!has(DURATION)) {
    problems.push(`${names} has no \`duration-(--motion-*)\``)
  }
  if (!has(EASE)) {
    problems.push(`${names} has no role curve (\`ease-arrive|leave|move|spring\`)`)
  }
  const animates = timed.some(({ base }) => base.startsWith('animate-'))
  const transitions = timed.some(({ base }) => base.startsWith('transition'))
  const reduced = (base: string) =>
    tokens.some(
      (token) => token.variants.includes('motion-reduce') && token.base === base,
    )
  if (transitions && !reduced('transition-none')) {
    problems.push(`${names} has no \`motion-reduce:transition-none\``)
  }
  if (animates && !reduced('animate-none')) {
    problems.push(`${names} has no \`motion-reduce:animate-none\``)
  }
  return problems
}

describe('the product layer speaks one motion vocabulary', () => {
  it('reads the product layer', () => {
    expect(PRODUCT.length).toBeGreaterThan(100)
    expect(PRODUCT.some(({ file }) => file.startsWith('components/ui/'))).toBe(
      false,
    )
  })

  it('flags the shapes it is meant to', () => {
    expect(motionFindings('transition-colors hover:bg-accent')).toHaveLength(3)
    expect(motionFindings('transition-all duration-200')).toContain(
      '`duration-200` is not a motion token',
    )
    expect(motionFindings('opacity 200ms ease-out')).toEqual([
      '`ease-out` is not a motion token',
    ])
    expect(
      motionFindings(
        'transition-opacity duration-(--motion-fade) ease-arrive motion-reduce:transition-none',
      ),
    ).toEqual([])
    expect(
      motionFindings(
        'animate-in fade-in duration-(--motion-fade) ease-arrive motion-reduce:animate-none',
      ),
    ).toEqual([])
    // `transition-none` is the absence of a timing, not a timing.
    expect(motionFindings('transition-none')).toEqual([])
    // Variants are read through, brackets and all.
    expect(
      motionFindings('[@media(pointer:coarse)]:duration-300 group-hover:ease-in'),
    ).toHaveLength(2)
  })

  it('has no hardcoded timing or unreduced transition in a product component', () => {
    const findings: Finding[] = []
    for (const { file, code } of PRODUCT) {
      for (const { text, line } of literals(code)) {
        for (const problem of motionFindings(text)) {
          findings.push({ at: `${file}:${line}`, problem })
        }
      }
    }
    expect(
      findings.map(({ at, problem }) => `${at} ${problem}`),
      'a product transition names a --motion-* duration, a role curve and a reduced-motion path',
    ).toEqual([])
  })
})
