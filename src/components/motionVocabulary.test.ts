import { describe, expect, it } from 'vitest'
import {
  blankComments,
  filesOn,
  strippedSourcesOn,
  type StrippedSource,
} from '@/lib/sourceTree'
import { rulesDeclaring } from '@/lib/tokenModel'

/**
 * ONE MOTION VOCABULARY FOR THE PRODUCT LAYER.
 *
 * Every transition a product surface declares says three things out loud: how
 * long (a `--motion-*` rung), which way it eases (one of the four roles —
 * arrive, leave, move, spring) and what happens under reduced motion. A stock
 * Tailwind `duration-200` or `ease-out` is a number nobody chose, and a bare
 * `transition-colors` inherits Tailwind's default curve and 150 ms without
 * saying so — which is how a product ends up with a dozen near-identical
 * timings that read as noise rather than as a system.
 *
 * Four readings, one rule:
 *
 * - CLASS STRINGS, per string literal, because a class string is where a
 *   transition is declared and where its timing has to sit beside it: a
 *   transition in one literal and its duration in a conditional three lines
 *   down is the shape that drifts. Each needs a rung, a role and a
 *   `motion-reduce:` answer.
 * - INLINE STYLES (`transition: '…'`, `style.transition = '…'`): no raw
 *   time, no keyword curve, no literal `cubic-bezier(` — the values come from
 *   `lib/motion.ts`.
 * - FRAMER-MOTION options: no named curve (`ease: 'easeOut'`) and no literal
 *   duration — `EASE_POINTS` and the `MOTION_*_MS` constants.
 * - STYLESHEETS under `src/styles`: every `transition*` / `animation*`
 *   declaration reads its time and curve from the tokens. One exemption, and
 *   it is documented where it lives: the canvas reveal chain keeps plain
 *   `ease-out`, because its beats run serially and a long-tailed curve makes
 *   each handoff land late.
 *
 * Reduced-motion coverage of stylesheet ANIMATIONS is `lib/motion.test.ts`'s
 * job; the drift test there compares the token values between the two files
 * and nothing more.
 *
 * NOT read: the vendored `ui/` layer, which keeps its upstream timings
 * (vendored primitives stay pristine — a product surface that wants a
 * different feel gets it in its wrapper), and the agent and backend libraries,
 * which hold no presentation.
 */

const PRODUCT: StrippedSource[] = [
  ...strippedSourcesOn('components').filter(
    ({ file }) => !file.startsWith('components/ui/'),
  ),
  ...strippedSourcesOn('hooks'),
  ...strippedSourcesOn('contexts'),
  ...strippedSourcesOn('slices'),
  ...strippedSourcesOn('lib').filter(
    ({ file }) => !file.startsWith('lib/agent/') && !file.startsWith('lib/backend/'),
  ),
  ...strippedSourcesOn('app').filter(({ file }) => file === 'App.tsx'),
]

/** Style config written in JS (the typography plugin's theme). */
const STYLE_SCRIPTS: StrippedSource[] = filesOn('styles', (path) =>
  path.endsWith('.js'),
).map(({ file, text }) => ({ file, code: blankComments(text) }))

/** The four roles, plus the camera's own curve for surfaces that ride it. */
const EASE = /^ease-(arrive|leave|move|spring|camera)$/
const DURATION = /^duration-\(--motion-(micro|fade|fade-stagger|structural|camera)\)$/
/** A transition or an enter/exit animation, i.e. something with a timing. */
const TIMED = /^(transition(-[a-z]+|-\[[^\]]+\])?|animate-(in|out))$/
/** `transition-*` utilities that are not a timing: none, and transition-behavior. */
const UNTIMED = new Set(['transition-none', 'transition-discrete', 'transition-normal'])

/** Numbers and curves nobody chose. */
const FORBIDDEN = [
  /^duration-(\d+|\[[^\]]+\])$/,
  /^delay-(\d+|\[[^\]]+\])$/,
  /^ease-(in|out|in-out|linear|\[[^\]]+\])$/,
  /^ease-structural$/,
]

/** A raw, non-zero time: `200ms`, `.18s`. `${MOTION_FADE_MS}ms` is not one. */
const RAW_TIME = /(?<![\w$}.-])(?:\d+\.?\d*|\.\d+)m?s\b/g
/** A CSS keyword curve, not the `linear()` function. */
const KEYWORD_EASE =
  /(?<![\w-])(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)(?![\w(-])/

const rawTimes = (value: string) =>
  (value.match(RAW_TIME) ?? []).filter((time) => parseFloat(time) !== 0)

const lineOf = (code: string, index: number) =>
  code.slice(0, index).split('\n').length

/** Every string literal in the code (comments already blanked). */
function literals(code: string): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = []
  const pattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const match of code.matchAll(pattern)) {
    found.push({ text: match[0].slice(1, -1), line: lineOf(code, match.index) })
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

/**
 * Does this literal read as a class list rather than as copy? Only asked for
 * the bare word `transition`, which is also an English word: a class list has
 * at least one hyphenated or variant token and no capitals or sentence
 * punctuation.
 */
function looksLikeClasses(words: string[]): boolean {
  return (
    words.some((word) => /[-:]/.test(word)) &&
    words.every((word) => !/[A-Z]|[.,;!?]$/.test(word))
  )
}

/** What is wrong with one class-string literal, if anything. */
function motionFindings(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const tokens = words.map(splitVariant)
  const problems: string[] = []

  for (const { base } of tokens) {
    if (FORBIDDEN.some((rule) => rule.test(base))) {
      problems.push(`\`${base}\` is not a motion token`)
    }
  }

  const timed = tokens.filter(
    ({ variants, base }) =>
      TIMED.test(base) &&
      !UNTIMED.has(base) &&
      !/motion-(reduce|safe)/.test(variants) &&
      (base !== 'transition' || looksLikeClasses(words)),
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

/** What is wrong with one timing VALUE — inline style or stylesheet. */
function valueFindings(value: string, allowKeyword = false): string[] {
  // A zero-length step has no curve to speak of: `visibility 0s linear`.
  const spoken = value.replace(/\b0m?s\s+linear\b/g, '0s')
  const problems: string[] = []
  for (const time of rawTimes(spoken)) {
    problems.push(`raw time \`${time}\` — use a --motion-* rung`)
  }
  const keyword = spoken.match(KEYWORD_EASE)
  if (keyword && !allowKeyword) {
    problems.push(`keyword curve \`${keyword[1]}\` — use an --ease-* role`)
  }
  if (/cubic-bezier\(/.test(spoken)) {
    problems.push('literal `cubic-bezier(` — use an --ease-* role')
  }
  return problems
}

const INLINE =
  /\b(?:transition|animation)(?:Duration|TimingFunction|Delay)?\s*[:=]\s*(['"`])((?:(?!\1)[\s\S])*)\1/g

/** Inline-style and framer-motion timings in one file. */
function scriptFindings(code: string): { line: number; problem: string }[] {
  const found: { line: number; problem: string }[] = []
  for (const match of code.matchAll(INLINE)) {
    for (const problem of valueFindings(match[2])) {
      found.push({ line: lineOf(code, match.index), problem })
    }
  }
  for (const match of code.matchAll(/\bease\s*:\s*(['"])(\w+)\1/g)) {
    found.push({
      line: lineOf(code, match.index),
      problem: `framer curve \`${match[2]}\` — use EASE_POINTS`,
    })
  }
  for (const match of code.matchAll(/\bduration\s*:\s*(\d*\.?\d+)(?![\w.])/g)) {
    if (parseFloat(match[1]) === 0) continue
    found.push({
      line: lineOf(code, match.index),
      problem: `literal duration \`${match[1]}\` — use a MOTION_*_MS constant`,
    })
  }
  return found
}

const TIMING_PROPERTIES = [
  'transition',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'animation',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
]

/** The one documented exemption: the canvas reveal chain's `ease-out`. */
const REVEAL_CHAIN = /\[data-canvas-reveal(?:=[^\]]*)?\]/

describe('the product layer speaks one motion vocabulary', () => {
  it('reads the product layer, and not the vendored one', () => {
    expect(PRODUCT.length).toBeGreaterThan(100)
    expect(PRODUCT.some(({ file }) => file.startsWith('components/ui/'))).toBe(
      false,
    )
    expect(PRODUCT.some(({ file }) => file === 'App.tsx')).toBe(true)
    expect(STYLE_SCRIPTS.length).toBeGreaterThan(0)
  })

  it('flags the class shapes it is meant to', () => {
    expect(motionFindings('transition-colors hover:bg-accent')).toHaveLength(3)
    expect(motionFindings('transition-all duration-200')).toContain(
      '`duration-200` is not a motion token',
    )
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
    // Not timings: none, transition-behavior, and anything gated on motion-safe.
    expect(motionFindings('transition-none')).toEqual([])
    expect(motionFindings('transition-discrete transition-normal')).toEqual([])
    expect(
      motionFindings(
        'motion-safe:transition-opacity motion-safe:duration-(--motion-fade) motion-safe:ease-arrive',
      ),
    ).toEqual([])
    // The bare word in copy is not a class.
    expect(motionFindings('Pick a transition for this step.')).toEqual([])
    expect(motionFindings('a smooth transition')).toEqual([])
    expect(motionFindings('flex transition hover:opacity-50')).toHaveLength(3)
    // Variants are read through, brackets and all.
    expect(
      motionFindings('[@media(pointer:coarse)]:duration-300 group-hover:ease-in'),
    ).toHaveLength(2)
  })

  it('flags inline-style and framer timings', () => {
    const at = (code: string) => scriptFindings(code).map(({ problem }) => problem)
    expect(at("style={{ transition: 'opacity 200ms ease-out' }}")).toHaveLength(2)
    expect(at("el.style.transition = 'transform .18s linear'")).toHaveLength(2)
    expect(at("transition: 'all 0.18s ease'")).toHaveLength(2)
    expect(at('transition: `opacity ${MOTION_FADE_MS}ms ${MOTION_EASE.arrive}`')).toEqual(
      [],
    )
    expect(at("el.style.transition = 'none'")).toEqual([])
    expect(at("transition={{ duration: 0.3, ease: 'easeOut' }}")).toHaveLength(2)
    expect(
      at('transition={{ duration: reduced ? 0 : MOTION_MICRO_MS / 1000, ease: EASE_POINTS.arrive }}'),
    ).toEqual([])
  })

  it('flags stylesheet timings, with the reveal chain as the one exemption', () => {
    expect(valueFindings('opacity var(--motion-fade) ease-out')).toHaveLength(1)
    expect(valueFindings('opacity var(--motion-fade) ease-out', true)).toEqual([])
    expect(valueFindings('x var(--motion-fade) var(--ease-arrive) 300ms')).toHaveLength(1)
    expect(valueFindings('opacity var(--x) ease-out, visibility 0s linear', true)).toEqual([])
    expect(valueFindings('var(--ease-spring)')).toEqual([])
  })

  it('has no hardcoded timing or unreduced transition in a product class string', () => {
    const findings: string[] = []
    for (const { file, code } of PRODUCT) {
      for (const { text, line } of literals(code)) {
        for (const problem of motionFindings(text)) {
          findings.push(`${file}:${line} ${problem}`)
        }
      }
    }
    expect(
      findings,
      'a product transition names a --motion-* duration, a role curve and a reduced-motion path',
    ).toEqual([])
  })

  it('has no raw timing in an inline style or a framer-motion option', () => {
    const findings: string[] = []
    for (const { file, code } of [...PRODUCT, ...STYLE_SCRIPTS]) {
      for (const { line, problem } of scriptFindings(code)) {
        findings.push(`${file}:${line} ${problem}`)
      }
    }
    expect(findings).toEqual([])
  })

  it('has no raw timing in a stylesheet outside the reveal chain', () => {
    const rules = TIMING_PROPERTIES.flatMap((property) => rulesDeclaring(property))
    expect(rules.length, 'the model found the timed rules').toBeGreaterThan(10)
    const findings = rules.flatMap((rule) =>
      valueFindings(rule.value, REVEAL_CHAIN.test(rule.selector)).map(
        (problem) => `${rule.file}:${rule.line} ${rule.selector} ${problem}`,
      ),
    )
    expect(findings).toEqual([])
  })
})
