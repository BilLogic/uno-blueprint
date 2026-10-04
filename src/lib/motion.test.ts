import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sourceOf } from '@/lib/sourceTree'
import { rulesDeclaring } from '@/lib/tokenModel'
import {
  CANVAS_REVEAL_ARROWS,
  CANVAS_REVEAL_DONE,
} from '@/contexts/canvasRevealContext'
import {
  EASE_POINTS,
  MOTION_EASE,
  MOTION_SPRING_LINEAR,
  cubicBezierEase,
  easeMove,
  easeMoveFrom,
  MOTION_CAMERA_EASE,
  MOTION_CAMERA_MS,
  MOTION_FADE_MS,
  MOTION_FADE_STAGGER_MS,
  MOTION_MICRO_MS,
  MOTION_STRUCTURAL_MS,
  MOTION_STRUCTURAL_EASE,
} from './motion'

/**
 * The motion vocabulary exists twice by necessity — TypeScript constants for
 * the JS that waits on animations, `--motion-*` custom properties for the CSS
 * that runs them. This test is the seam: it reads animations.css off disk and
 * asserts both sides carry the same numbers, the same way palette.test.ts
 * pins the TypeScript palette to colors.css.
 */
const css = sourceOf('styles/animations.css')

function cssToken(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`))
  assert.ok(match, `animations.css declares ${name}`)
  return match![1].trim()
}

test('motion durations match between motion.ts and animations.css', () => {
  assert.equal(cssToken('--motion-structural'), `${MOTION_STRUCTURAL_MS}ms`)
  assert.equal(cssToken('--motion-fade'), `${MOTION_FADE_MS}ms`)
  assert.equal(cssToken('--motion-fade-stagger'), `${MOTION_FADE_STAGGER_MS}ms`)
  assert.equal(cssToken('--motion-camera'), `${MOTION_CAMERA_MS}ms`)
  assert.equal(cssToken('--motion-micro'), `${MOTION_MICRO_MS}ms`)
})

/** Whitespace-insensitive: Prettier formats the cubic-bezier args in CSS. */
const squash = (value: string) => value.replace(/\s+/g, ' ')

const ROLES = ['arrive', 'leave', 'move', 'spring'] as const

test('the four role curves match between motion.ts and the @theme keys', () => {
  for (const role of ROLES) {
    assert.equal(
      squash(cssToken(`--ease-${role}`)),
      squash(MOTION_EASE[role]),
      `--ease-${role}`,
    )
    assert.equal(
      MOTION_EASE[role],
      `cubic-bezier(${EASE_POINTS[role].join(', ')})`,
      `MOTION_EASE.${role} is written from its control points`,
    )
  }
})

test("the site's four curves, by role", () => {
  assert.deepEqual(EASE_POINTS, {
    arrive: [0.22, 1, 0.36, 1],
    leave: [0.6, 0, 0.85, 0.25],
    move: [0.65, 0, 0.35, 1],
    spring: [0.34, 1.45, 0.5, 1],
  })
})

test('structural is arrive, in both files', () => {
  assert.equal(MOTION_STRUCTURAL_EASE, MOTION_EASE.arrive)
  assert.equal(cssToken('--ease-structural'), 'var(--ease-arrive)')
})

test('the camera eases on move, in both files', () => {
  assert.equal(MOTION_CAMERA_EASE, MOTION_EASE.move)
  assert.equal(cssToken('--ease-camera'), 'var(--ease-move)')
})

test('the spring upgrades to linear() only where the browser has it', () => {
  const block = css.match(
    /@supports\s*\(transition-timing-function:\s*linear\(0,\s*1\)\)\s*\{([\s\S]*?)\n\}/,
  )
  assert.ok(block, 'animations.css gates the linear() spring behind @supports')
  const declared = block![1].match(/--ease-spring:\s*([^;]+);/)
  assert.ok(declared, 'the @supports block redeclares --ease-spring')
  assert.equal(squash(declared![1].trim()), squash(MOTION_SPRING_LINEAR))
  // A spring overshoots past 1 and settles on it.
  assert.match(MOTION_SPRING_LINEAR, /^linear\(0,[\s\S]*\b1\)$/)
  assert.match(MOTION_SPRING_LINEAR, /\b1\.0\d/)
})

test('cubicBezierEase lands on its endpoints and follows the curve', () => {
  for (const role of ROLES) {
    const ease = cubicBezierEase(EASE_POINTS[role])
    assert.equal(ease(0), 0, `${role}(0)`)
    assert.equal(ease(1), 1, `${role}(1)`)
    assert.equal(ease(-1), 0, `${role} clamps below`)
    assert.equal(ease(2), 1, `${role} clamps above`)
  }
  // move is symmetric about its midpoint.
  assert.ok(Math.abs(easeMove(0.5) - 0.5) < 1e-6)
  assert.ok(Math.abs(easeMove(0.2) + easeMove(0.8) - 1) < 1e-6)
  // arrive is front-loaded, leave is back-loaded.
  assert.ok(cubicBezierEase(EASE_POINTS.arrive)(0.25) > 0.6)
  assert.ok(cubicBezierEase(EASE_POINTS.leave)(0.5) < 0.2)
  // The spring overshoots.
  const spring = cubicBezierEase(EASE_POINTS.spring)
  const peak = Math.max(
    ...Array.from({ length: 101 }, (_, i) => spring(i / 100)),
  )
  assert.ok(peak > 1.05, 'spring overshoots past 1')
  // A straight-line curve is the identity.
  assert.ok(Math.abs(cubicBezierEase([0.25, 0.25, 0.75, 0.75])(0.3) - 0.3) < 1e-6)
})

test('move is monotonic, so a camera riding it never backtracks', () => {
  let last = 0
  for (let i = 1; i <= 200; i += 1) {
    const value = easeMove(i / 200)
    assert.ok(value >= last, `easeMove dips at ${i / 200}`)
    last = value
  }
})

/**
 * A camera retargeted mid-flight is already moving. The launched curve is
 * move with its departure handle bent to the incoming slope, so the new
 * flight leaves at the speed the old one had and still lands on move's
 * settle.
 */
test('a launched move starts at its slope and lands on move', () => {
  const zero = easeMoveFrom(0)
  for (let i = 0; i <= 20; i += 1) {
    const p = i / 20
    assert.ok(Math.abs(zero.value(p) - easeMove(p)) < 1e-6, `rest is move at ${p}`)
  }

  for (const slope of [0, 0.3, 0.55, 1, 2, 3, 8]) {
    const curve = easeMoveFrom(slope)
    assert.equal(curve.value(0), 0, `value(0) at slope ${slope}`)
    assert.equal(curve.value(1), 1, `value(1) at slope ${slope}`)
    assert.ok(
      Math.abs(curve.slope(0) - slope) < 1e-6,
      `slope(0) is ${curve.slope(0)}, wanted ${slope}`,
    )
    assert.ok(Math.abs(curve.slope(1)) < 1e-6, `settles at slope ${slope}`)

    // Monotonic, never past 1, and its slope is the derivative of its value.
    let last = 0
    for (let i = 1; i < 200; i += 1) {
      const p = i / 200
      const value = curve.value(p)
      assert.ok(value >= last - 1e-9, `dips at ${p}, slope ${slope}`)
      assert.ok(value <= 1, `overshoots at ${p}, slope ${slope}`)
      last = value
      const h = 1e-5
      const numeric = (curve.value(p + h) - curve.value(p - h)) / (2 * h)
      assert.ok(
        Math.abs(numeric - curve.slope(p)) < 1e-3,
        `slope(${p}) ${curve.slope(p)} vs numeric ${numeric}, slope ${slope}`,
      )
    }
  }

  // Negative slopes are a stop, not a reversal.
  assert.ok(Math.abs(easeMoveFrom(-2).value(0.3) - easeMove(0.3)) < 1e-6)
})

/**
 * Every animated surface has a reduced-motion answer — in every stylesheet.
 *
 * This assertion used to read `animations.css` only, then `animations.css` and
 * `blueprint.css`. `utilities.css` declares an `animation:` too, on the
 * `delayed-appear` utility, and had no reduced-motion branch at all: a guard
 * that names its own files names the ones where its property holds. It asks
 * the model now, which reads every stylesheet the entry imports, so the next
 * animated surface is covered wherever someone puts it.
 */
test('every animation is disabled under reduced motion, in every stylesheet', () => {
  const rules = rulesDeclaring('animation')
  assert.ok(rules.length > 5, 'the model found the animated rules')

  const reduced = (rule: (typeof rules)[number]) =>
    rule.context.some((at) => /prefers-reduced-motion:\s*reduce/.test(at))

  // `@utility x` compiles to `.x`, which is what a reduced-motion rule targets.
  const key = (selector: string) =>
    selector.startsWith('@utility ')
      ? `.${selector.slice('@utility '.length).trim()}`
      : // Attribute-selector chains: the reduced-motion block lists ancestors,
        // so match on the leading data attribute. The value is part of it —
        // `[data-slot='skeleton']` is a different surface from `[data-slot]`.
        (selector.match(/\[data-[a-z-]+(?:=[^\]]*)?\]/)?.[0] ?? selector)

  const covered = rules
    .filter(reduced)
    .map((rule) => rule.selector)
    .join('\n')

  for (const rule of rules.filter((entry) => !reduced(entry))) {
    assert.ok(
      covered.includes(key(rule.selector)),
      `${rule.file}:${rule.line} ${rule.selector} has no reduced-motion branch`,
    )
  }
})

/**
 * The reveal's stage ladder exists in TypeScript (canvasRevealContext) and
 * in blueprint.css as `[data-canvas-reveal='N']`. Nothing else links them:
 * inserting a stage means correct edits in both, and three-of-four correct
 * edits leave the suite green while a layer reveals on the wrong beat.
 */
const blueprintCss = sourceOf('styles/blueprint.css')

test('reveal stages match between canvasRevealContext and blueprint.css', () => {
  const stages = [
    ...blueprintCss.matchAll(/\[data-canvas-reveal='(\d+)'\]/g),
  ].map((match) => Number(match[1]))
  assert.ok(stages.length > 0, 'blueprint.css keys rules on reveal stages')
  // The attribute is removed at DONE, so the highest stage any rule can
  // match is the last layer.
  assert.equal(Math.max(...stages), CANVAS_REVEAL_ARROWS)
  assert.equal(CANVAS_REVEAL_ARROWS + 1, CANVAS_REVEAL_DONE)
})

/**
 * Each reveal beat runs inside the chain's per-stage watchdog. The beats are
 * CSS (`--reveal-beat-*`, derived from `--motion-fade`); the watchdog is TS.
 * If a beat ever grew past it, the watchdog would advance the chain out from
 * under a layer still animating — and nothing else would notice.
 */
test('every reveal beat fits inside the stage watchdog', () => {
  const beats = [
    ...blueprintCss.matchAll(
      /--reveal-beat-\d+:\s*(?:var\(--motion-fade\)|calc\(var\(--motion-fade\)\s*\*\s*([\d.]+)\))/g,
    ),
  ].map((match) => MOTION_FADE_MS * (match[1] ? Number(match[1]) : 1))
  assert.equal(beats.length, 4, 'four beats, each derived from --motion-fade')
  assert.ok(
    Math.max(...beats) < MOTION_STRUCTURAL_MS * 2,
    'longest beat must finish before the stage watchdog fires',
  )
})
