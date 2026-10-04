import { describe, expect, it } from 'vitest'
import {
  createCameraFlightPlan,
  createCameraTransitionClock,
  interpolateCameraTransform,
  resolveCameraFlightDuration,
  transformCameraAroundPoint,
} from '@/lib/cameraTransition'
import { easeMoveFrom } from '@/lib/motion'

const viewport = { width: 1200, height: 800 }
const from = { pan: { x: -100, y: -50 }, zoom: 0.5 }
const to = { pan: { x: 240, y: 160 }, zoom: 1.4 }

describe('camera transition', () => {
  it('lands on exact endpoints', () => {
    expect(interpolateCameraTransform(from, to, viewport, 0)).toEqual(from)
    expect(interpolateCameraTransform(from, to, viewport, 1)).toEqual(to)
  })

  /*
    The regression this file exists to hold. Scale used to be derived from a
    LINEARLY interpolated rect width, and zoom is width's reciprocal — so the
    perceived rate of change was hyperbolic, not eased. Measured on a real
    zoom-out before the fix: 78% of the perceived travel was done by the
    halfway frame, 98% by 74% of the duration. The camera appeared to
    overshoot and then hang.
  */
  it('spends equal time on equal ratios of zoom', () => {
    const zoomAt = (t: number) =>
      interpolateCameraTransform(from, to, viewport, t).zoom

    // Each quarter of the transition multiplies the scale by the same factor.
    const q1 = zoomAt(0.25) / from.zoom
    const q2 = zoomAt(0.5) / zoomAt(0.25)
    const q3 = zoomAt(0.75) / zoomAt(0.5)
    const q4 = to.zoom / zoomAt(0.75)
    expect(q2).toBeCloseTo(q1, 6)
    expect(q3).toBeCloseTo(q1, 6)
    expect(q4).toBeCloseTo(q1, 6)

    // Stated as the measurement that caught it: at the halfway point, half
    // the perceived (log-scale) travel is done — not 78% of it.
    const perceived =
      Math.log(zoomAt(0.5) / from.zoom) / Math.log(to.zoom / from.zoom)
    expect(perceived).toBeCloseTo(0.5, 6)
  })

  it('is symmetric — zooming out mirrors zooming in', () => {
    const outward = interpolateCameraTransform(to, from, viewport, 0.5).zoom
    const inward = interpolateCameraTransform(from, to, viewport, 0.5).zoom
    // Same midpoint scale whichever way the camera travels. Linear width gave
    // two different answers, which is why one direction felt front-loaded and
    // the other back-loaded.
    expect(outward).toBeCloseTo(inward, 6)
  })

  it('moves the destination monotonically toward its final screen position', () => {
    const origin = { pan: { x: 105, y: 48 }, zoom: 0.05 }
    const destination = { pan: { x: -1560, y: -920 }, zoom: 0.7 }
    const finalWorldCenter = {
      x: (viewport.width / 2 - destination.pan.x) / destination.zoom,
      y: (viewport.height / 2 - destination.pan.y) / destination.zoom,
    }
    const distanceAt = (progress: number) => {
      const transform = interpolateCameraTransform(
        origin,
        destination,
        viewport,
        progress,
      )
      const screen = {
        x: transform.pan.x + finalWorldCenter.x * transform.zoom,
        y: transform.pan.y + finalWorldCenter.y * transform.zoom,
      }
      return Math.hypot(
        screen.x - viewport.width / 2,
        screen.y - viewport.height / 2,
      )
    }

    const distances = Array.from({ length: 41 }, (_, index) =>
      distanceAt(index / 40),
    )
    for (let index = 1; index < distances.length; index += 1) {
      expect(distances[index]).toBeLessThanOrEqual(distances[index - 1] + 1e-6)
    }
    expect(distances.at(-1)).toBeCloseTo(0, 6)
  })

  it('paces flights by visible travel inside one bounded timing family', () => {
    const near = resolveCameraFlightDuration(
      from,
      { pan: { x: -120, y: -55 }, zoom: 0.52 },
      viewport,
    )
    const far = resolveCameraFlightDuration(
      from,
      { pan: { x: -2400, y: 1700 }, zoom: 3.5 },
      viewport,
    )

    expect(near).toBeGreaterThanOrEqual(240)
    expect(far).toBeLessThanOrEqual(650)
    expect(far).toBeGreaterThan(near)
  })

  it('keeps monotonic screen-space approach across direction and scale', () => {
    const journeys = [
      { pan: { x: -1800, y: -900 }, zoom: 2.8 },
      { pan: { x: 1400, y: -700 }, zoom: 0.12 },
      { pan: { x: -900, y: 1300 }, zoom: 1 },
      { pan: { x: 1200, y: 900 }, zoom: 0.35 },
    ]

    for (const destination of journeys) {
      const finalWorldCenter = {
        x: (viewport.width / 2 - destination.pan.x) / destination.zoom,
        y: (viewport.height / 2 - destination.pan.y) / destination.zoom,
      }
      const distances = Array.from({ length: 81 }, (_, index) => {
        const transform = interpolateCameraTransform(
          from,
          destination,
          viewport,
          index / 80,
        )
        return Math.hypot(
          transform.pan.x +
            finalWorldCenter.x * transform.zoom -
            viewport.width / 2,
          transform.pan.y +
            finalWorldCenter.y * transform.zoom -
            viewport.height / 2,
        )
      })
      for (let index = 1; index < distances.length; index += 1) {
        expect(distances[index]).toBeLessThanOrEqual(
          distances[index - 1] + 1e-6,
        )
      }
    }
  })

  it('preserves compatible momentum but drops motion away from the new intent', () => {
    const origin = { pan: { x: 0, y: 0 }, zoom: 1 }
    const destination = { pan: { x: -500, y: 0 }, zoom: 1 }
    const resting = createCameraFlightPlan({
      from: origin,
      to: destination,
      viewport,
      durationMs: 400,
    })
    const compatible = createCameraFlightPlan({
      from: origin,
      to: destination,
      viewport,
      durationMs: 400,
      initialVelocity: { pan: { x: -1, y: 0 }, zoomPerMs: 0 },
    })
    const opposing = createCameraFlightPlan({
      from: origin,
      to: destination,
      viewport,
      durationMs: 400,
      initialVelocity: { pan: { x: 1, y: 0 }, zoomPerMs: 0 },
    })

    expect(compatible.sample(16).progress).toBeGreaterThan(
      resting.sample(16).progress,
    )
    expect(opposing.sample(16).progress).toBeCloseTo(
      resting.sample(16).progress,
    )
    expect(opposing.sample(16).progress).toBeGreaterThan(0)
    expect(compatible.sample(400).transform).toEqual(destination)
    // A rest takeoff still moves in the first beat — move-from-zero
    // spent that beat almost still, which a large zoom-in reads as lag.
    expect(resting.sample(40).progress).toBeGreaterThan(0.05)
  })

  it('stays finite for pure pan and nearly equal zoom', () => {
    const value = interpolateCameraTransform(
      { pan: { x: 0, y: 0 }, zoom: 1 },
      { pan: { x: 300, y: -90 }, zoom: 1.0000001 },
      viewport,
      0.5,
    )
    expect(Number.isFinite(value.pan.x)).toBe(true)
    expect(Number.isFinite(value.pan.y)).toBe(true)
    expect(Number.isFinite(value.zoom)).toBe(true)
  })

  it('rides the shared move curve, launched at the incoming speed', () => {
    const origin = { pan: { x: 0, y: 0 }, zoom: 1 }
    const destination = { pan: { x: -500, y: 0 }, zoom: 1 }
    // 1 px/ms toward a target 500 px away over 400 ms: a slope of 0.8.
    const plan = createCameraFlightPlan({
      from: origin,
      to: destination,
      viewport,
      durationMs: 400,
      initialVelocity: { pan: { x: -1, y: 0 }, zoomPerMs: 0 },
    })
    const curve = easeMoveFrom(0.8)
    for (let elapsed = 20; elapsed < 400; elapsed += 20) {
      expect(plan.sample(elapsed).progress).toBeCloseTo(
        curve.value(elapsed / 400),
        6,
      )
    }
    // Settles: the last beat is move's arrival, not a hard stop.
    expect(Math.abs(plan.sample(399).velocity.pan.x)).toBeLessThan(0.01)
  })

  it('hands its velocity to a flight that retargets it mid-air', () => {
    const origin = { pan: { x: 0, y: 0 }, zoom: 1 }
    const first = createCameraFlightPlan({
      from: origin,
      to: { pan: { x: -500, y: 0 }, zoom: 1 },
      viewport,
      durationMs: 400,
    })
    // Late enough that the old flight is moving faster than a resting
    // takeoff; below that, the new flight leaves at the resting slope (see
    // the next assertion) rather than slower.
    for (const at of [120, 200]) {
      const handoff = first.sample(at)
      expect(handoff.velocity.pan.x).toBeLessThan(0)
      // A new destination farther along the same line.
      const second = createCameraFlightPlan({
        from: handoff.transform,
        to: { pan: { x: -900, y: 0 }, zoom: 1 },
        viewport,
        durationMs: 450,
        initialVelocity: handoff.velocity,
      })
      const takeoff = second.sample(0.01)
      expect(takeoff.velocity.pan.x).toBeCloseTo(handoff.velocity.pan.x, 4)
      expect(takeoff.transform.pan.x).toBeCloseTo(handoff.transform.pan.x, 1)
    }

    const early = first.sample(60)
    const fromEarly = createCameraFlightPlan({
      from: early.transform,
      to: { pan: { x: -900, y: 0 }, zoom: 1 },
      viewport,
      durationMs: 450,
      initialVelocity: early.velocity,
    })
    expect(fromEarly.sample(0.01).velocity.pan.x).toBeLessThanOrEqual(
      early.velocity.pan.x,
    )
  })

  it('hands zoom velocity across a retarget too', () => {
    const center = { x: viewport.width / 2, y: viewport.height / 2 }
    const zoomAboutCenter = (zoom: number) => ({
      pan: { x: center.x - center.x * zoom, y: center.y - center.y * zoom },
      zoom,
    })
    const first = createCameraFlightPlan({
      from: zoomAboutCenter(0.2),
      to: zoomAboutCenter(1),
      viewport,
      durationMs: 500,
    })
    const handoff = first.sample(180)
    expect(handoff.velocity.zoomPerMs).toBeGreaterThan(0)
    const second = createCameraFlightPlan({
      from: handoff.transform,
      to: zoomAboutCenter(2.5),
      viewport,
      durationMs: 500,
      initialVelocity: handoff.velocity,
    })
    const takeoff = second.sample(0.01)
    expect(takeoff.velocity.zoomPerMs / handoff.velocity.zoomPerMs).toBeCloseTo(
      1,
      3,
    )
  })

  it('starts elapsed time on the first drawable frame', () => {
    const progressAt = createCameraTransitionClock(420)

    // React may occupy the main thread for most of the nominal duration
    // before requestAnimationFrame can draw. That delay must not consume the
    // animation: the first frame is still the exact starting transform.
    expect(progressAt(338)).toBe(0)
    expect(progressAt(548)).toBeCloseTo(0.5)
    expect(progressAt(758)).toBe(1)
  })

  it('keeps the world point beneath a wheel cursor stationary', () => {
    const cursor = { x: 320, y: 240 }
    const next = transformCameraAroundPoint(from, cursor, cursor, 0.8)
    const world = {
      x: (cursor.x - from.pan.x) / from.zoom,
      y: (cursor.y - from.pan.y) / from.zoom,
    }

    expect(next.pan.x + world.x * next.zoom).toBeCloseTo(cursor.x)
    expect(next.pan.y + world.y * next.zoom).toBeCloseTo(cursor.y)
  })

  it('maps the old pinch midpoint directly to the moving midpoint', () => {
    const previousMidpoint = { x: 280, y: 210 }
    const currentMidpoint = { x: 340, y: 250 }
    const next = transformCameraAroundPoint(
      from,
      previousMidpoint,
      currentMidpoint,
      0.75,
    )
    const world = {
      x: (previousMidpoint.x - from.pan.x) / from.zoom,
      y: (previousMidpoint.y - from.pan.y) / from.zoom,
    }

    expect(next.pan.x + world.x * next.zoom).toBeCloseTo(currentMidpoint.x)
    expect(next.pan.y + world.y * next.zoom).toBeCloseTo(currentMidpoint.y)
  })
})
