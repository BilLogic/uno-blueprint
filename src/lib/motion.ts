/**
 * The app's motion vocabulary, in one place.
 *
 * Everything derives from the sidebar collapse — the one motion that was
 * already right — so structural moves, crossfades and camera eases all read
 * as the same system rather than as per-screen inventions.
 *
 * The CSS side of these numbers lives in `styles/animations.css` as the
 * `--motion-*` tokens (plus the `--ease-*` keys in `@theme`); the values here
 * are for the JS that has to wait for them. A drift test pins the two files
 * to each other — change both or the suite fails.
 */

/** A cubic-bezier's two control points, `[x1, y1, x2, y2]`. */
export type BezierPoints = readonly [number, number, number, number]

/**
 * The four curves' control points, by role. When to use each role:
 * the canvas guideline, under Motion.
 */
export const EASE_POINTS = {
  arrive: [0.22, 1, 0.36, 1],
  leave: [0.6, 0, 0.85, 0.25],
  move: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.45, 0.5, 1],
} as const satisfies Record<string, BezierPoints>

export type MotionRole = keyof typeof EASE_POINTS

const bezier = (points: BezierPoints) => `cubic-bezier(${points.join(', ')})`

/** The four curves as CSS timing functions — the `--ease-*` tokens' values. */
export const MOTION_EASE: Record<MotionRole, string> = {
  arrive: bezier(EASE_POINTS.arrive),
  leave: bezier(EASE_POINTS.leave),
  move: bezier(EASE_POINTS.move),
  spring: bezier(EASE_POINTS.spring),
}

/**
 * The spring as a real spring, where the browser has `linear()`: an
 * overshoot, a smaller one back, then rest. A cubic-bezier can only overshoot
 * once; this is what `--ease-spring` becomes inside `@supports`.
 */
export const MOTION_SPRING_LINEAR =
  'linear(0, 0.22 6%, 0.6 14%, 0.9 22%, 1.05 30%, 1.09 36%, 1.06 44%, 1.01 56%, 0.993 68%, 1)'

/**
 * A cubic-bezier as a curve the JS can read both ways: where it is
 * (`value`) and how fast it is going there (`slope`, d value / d progress).
 * Same curve the browser draws for the same four numbers: solve
 * x(t) = progress by Newton's method with a bisection fallback, then read
 * y(t) and y'(t) / x'(t). Clamped to [0, 1] outside the interval.
 */
export type EaseCurve = {
  value: (progress: number) => number
  slope: (progress: number) => number
}

function bezierCurve([x1, y1, x2, y2]: BezierPoints): EaseCurve {
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  const dy = (t: number) => (3 * ay * t + 2 * by) * t + cy

  const solve = (target: number) => {
    let t = target
    for (let i = 0; i < 8; i += 1) {
      const error = x(t) - target
      if (Math.abs(error) < 1e-7) return t
      const slope = dx(t)
      if (Math.abs(slope) < 1e-6) break
      t -= error / slope
    }
    let lo = 0
    let hi = 1
    t = target
    for (let i = 0; i < 40; i += 1) {
      const value = x(t)
      if (Math.abs(value - target) < 1e-7) return t
      if (value < target) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return t
  }

  // The parameter's own slope at an end, where x'(t) can be zero: the
  // handle's direction, or a flat end when the handle sits on the endpoint.
  const endSlope = (hx: number, hy: number) =>
    Math.abs(hx) < 1e-12 ? 0 : hy / hx

  return {
    value(progress) {
      if (progress <= 0) return 0
      if (progress >= 1) return 1
      return y(solve(progress))
    },
    slope(progress) {
      if (progress <= 0) return endSlope(x1, y1)
      if (progress >= 1) return endSlope(1 - x2, 1 - y2)
      const t = solve(progress)
      const run = dx(t)
      return Math.abs(run) < 1e-12 ? 0 : dy(t) / run
    },
  }
}

/**
 * A CSS cubic-bezier as a JS easing function, for motion that runs on frames
 * rather than on a stylesheet (the camera).
 */
export function cubicBezierEase(points: BezierPoints): (
  progress: number,
) => number {
  return bezierCurve(points).value
}

/**
 * A curve that leaves already moving: the same arrival as `points`, with the
 * departure handle turned to `initialSlope` so the curve starts at that
 * speed. This is what keeps a camera flight that is retargeted mid-air from
 * stalling: the new flight starts at the velocity the old one had.
 *
 * The handle keeps its length along x until its height would pass 1, then
 * shortens so it never does. With the arrival handle at height 1 (move,
 * arrive) every control point sits in [0, 1], so the curve neither dips nor
 * overshoots at any slope. A slope of 0 or less is the curve itself.
 */
export function launchedBezierEase(
  points: BezierPoints,
  initialSlope: number,
): EaseCurve {
  const [x1, y1, x2, y2] = points
  if (!(initialSlope > 0)) return bezierCurve(points)
  const run = Math.min(x1 > 0 ? x1 : 1 / 3, 1 / initialSlope)
  const rise = run * initialSlope
  // A curve that already departs faster than asked keeps its own handle.
  if (x1 > 0 && y1 / x1 >= initialSlope) return bezierCurve(points)
  return bezierCurve([run, rise, x2, y2])
}

/** The move curve as a function of progress — what a JS camera rides. */
export const easeMove = cubicBezierEase(EASE_POINTS.move)

/** Move, launched at `initialSlope` — a flight that takes over a moving camera. */
export const easeMoveFrom = (initialSlope: number): EaseCurve =>
  launchedBezierEase(EASE_POINTS.move, initialSlope)

/**
 * Structural width/size changes (sidebar collapse, presentation wipe). The
 * structural ease IS arrive; the name stays because the CSS token does.
 */
export const MOTION_STRUCTURAL_MS = 320
export const MOTION_STRUCTURAL_EASE = MOTION_EASE.arrive

/** Opacity crossfades, and the stagger between an out/in pair. */
export const MOTION_FADE_MS = 200
export const MOTION_FADE_STAGGER_MS = 75

/**
 * Nominal camera reference; actual flights use bounded distance-aware time.
 * The camera IS move: the JS flight rides `easeMoveFrom`, and the CSS that
 * rides it (focus dimming, the compare fade) reads `--ease-camera`, which
 * is `var(--ease-move)`. Kept as its own name so those surfaces say what
 * they are following.
 */
export const MOTION_CAMERA_MS = 420
export const MOTION_CAMERA_EASE = MOTION_EASE.move

/** Micro-interactions: hover, badges, threshold fades. */
export const MOTION_MICRO_MS = 150

/**
 * The step between rungs of the shell's entrance ladder — rail, then panel,
 * then the agent dock, each one beat behind the last.
 *
 * Shorter than {@link MOTION_FADE_STAGGER_MS}, and deliberately so: 75 ms is
 * the gap between an element leaving and its replacement arriving, where the
 * eye needs to read a handover. This is three parts of ONE surface arriving,
 * where the gap only has to be long enough to feel ordered — a ladder, not
 * three separate events.
 */
export const SHELL_ENTRANCE_STEP_MS = 50

/**
 * Read live rather than at mount: the OS setting can change mid-session and
 * every move should honor the current value.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
