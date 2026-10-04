import { easeMoveFrom } from '@/lib/motion'

export type CameraTransform = {
  pan: { x: number; y: number }
  zoom: number
}

export type CameraTransitionResult =
  | { kind: 'completed'; transform: CameraTransform }
  | { kind: 'cancelled'; transform: CameraTransform }
  | { kind: 'superseded'; transform: CameraTransform }

export type CameraVelocity = {
  pan: { x: number; y: number }
  zoomPerMs: number
}

export type CameraFlightSample = {
  transform: CameraTransform
  velocity: CameraVelocity
  progress: number
  done: boolean
}

export type CameraFlightPlan = {
  durationMs: number
  sample: (elapsedMs: number) => CameraFlightSample
}

export const CAMERA_FLIGHT_MIN_MS = 240
export const CAMERA_FLIGHT_MAX_MS = 650

/**
 * Changes camera scale while mapping one viewport point to another.
 *
 * A wheel zoom passes the same point twice, keeping the world beneath the
 * cursor stationary. A pinch passes the previous and current midpoint, so
 * midpoint drift and scale are solved in one transform instead of applying
 * the finger movement twice.
 */
export function transformCameraAroundPoint(
  from: CameraTransform,
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  nextZoom: number,
): CameraTransform {
  const fromZoom = Math.max(0.0001, from.zoom)
  const safeNextZoom = Math.max(0.0001, nextZoom)
  const world = {
    x: (fromPoint.x - from.pan.x) / fromZoom,
    y: (fromPoint.y - from.pan.y) / fromZoom,
  }

  return {
    pan: {
      x: toPoint.x - world.x * safeNextZoom,
      y: toPoint.y - world.y * safeNextZoom,
    },
    zoom: safeNextZoom,
  }
}

/**
 * Resting flights still leave with a little speed. Move from a dead stop
 * spends the first beat of a large zoom-in almost still — overview to a
 * scenario reads as lag, even though the duration itself is fine. The
 * launched curve keeps move's arrival for any start slope, so arrivals still
 * settle rather than hitting the destination at speed.
 */
const RESTING_FLIGHT_SLOPE = 0.55

/**
 * The steepest departure a flight takes over. Beyond it, incoming speed is
 * shed rather than carried: a flick of momentum should not turn a short
 * retarget into a lunge.
 */
const MAX_FLIGHT_SLOPE = 3

/**
 * Returns transition progress measured from the first frame the browser can
 * actually draw. Work scheduled before requestAnimationFrame (notably React
 * reconciliation for a large canvas) may block the main thread; counting
 * that blocked time makes the first visible frame jump toward the target.
 */
export function createCameraTransitionClock(durationMs: number) {
  // `Math.max(1, NaN)` is NaN, so the clamp alone is not a clamp. A NaN
  // duration makes every progress NaN, and `t < 1` is false for NaN — so the
  // loop writes NaN into the transform, reports `completed`, and every later
  // pan, zoom and fit reads that NaN. The canvas vanishes and cannot recover
  // without a remount. Unreachable today; silent and unrecoverable if it ever
  // is.
  const duration = Number.isFinite(durationMs) ? Math.max(1, durationMs) : 420
  let firstFrameAt: number | null = null

  return (frameAt: number): number => {
    firstFrameAt ??= frameAt
    return Math.min(1, Math.max(0, (frameAt - firstFrameAt) / duration))
  }
}

/**
 * Move the FINAL viewport centre along a straight SCREEN path while changing
 * scale geometrically, then derive the transform. The final centre is the
 * point the reader is navigating toward; keeping its screen-space approach
 * monotonic prevents a large zoom-in from sending it farther away first.
 *
 * The geometric half is the part that matters, and it is not a refinement.
 * This used to interpolate the visible rectangle's WIDTH linearly and derive
 * `zoom = viewportWidth / width`. Zoom is the RECIPROCAL of width, so a
 * straight line in width is a hyperbola in zoom, and the visible rate of
 * change is wildly uneven at both ends of it. Measured on a real zoom-out
 * (0.157 → 0.051 over 455 ms): 78% of the perceived travel was over by the
 * halfway frame and 98% by 74% of the duration, leaving the last quarter of
 * the animation to deliver 2% of the visible change. What that looks like is
 * the camera flying past the destination and then hanging — the "overshoot
 * and settle back" it was reported as. Zooming IN is the same defect
 * mirrored: almost nothing happens, then it rushes at the end.
 *
 * Scale is perceived as a ratio, so equal time must buy an equal RATIO of
 * change: `z(t) = z0 · (z1/z0)^t`. That makes the ease curve mean what it
 * says — the eased progress IS the perceived progress — and it makes the
 * two directions symmetric, which linear width can never be.
 *
 * This intentionally gives up a straight WORLD-space path for the current
 * viewport centre. A world-straight centre multiplied by a rapidly growing
 * zoom can reverse the destination's visible travel even though the world
 * coordinates themselves are perfectly linear.
 */
export function interpolateCameraTransform(
  from: CameraTransform,
  to: CameraTransform,
  viewport: { width: number; height: number },
  t: number,
): CameraTransform {
  const progress = Math.min(1, Math.max(0, t))
  if (progress === 0) return from
  if (progress === 1) return to
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const fromZoom = Math.max(0.0001, from.zoom)
  const toZoom = Math.max(0.0001, to.zoom)

  const zoom = fromZoom * Math.pow(toZoom / fromZoom, progress)

  // The world point that will sit under the viewport centre on arrival.
  const destinationWorldCenter = {
    x: (width / 2 - to.pan.x) / toZoom,
    y: (height / 2 - to.pan.y) / toZoom,
  }
  const destinationStartScreen = {
    x: from.pan.x + destinationWorldCenter.x * fromZoom,
    y: from.pan.y + destinationWorldCenter.y * fromZoom,
  }
  const destinationScreen = {
    x:
      destinationStartScreen.x +
      (width / 2 - destinationStartScreen.x) * progress,
    y:
      destinationStartScreen.y +
      (height / 2 - destinationStartScreen.y) * progress,
  }

  return {
    pan: {
      x: destinationScreen.x - destinationWorldCenter.x * zoom,
      y: destinationScreen.y - destinationWorldCenter.y * zoom,
    },
    zoom,
  }
}

/**
 * One timing family whose duration reflects what the reader can see moving.
 * Pan is measured as the arrival centre's initial screen distance; zoom is
 * measured logarithmically because scale is perceived as a ratio.
 */
export function resolveCameraFlightDuration(
  from: CameraTransform,
  to: CameraTransform,
  viewport: { width: number; height: number },
): number {
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const fromZoom = Math.max(0.0001, from.zoom)
  const toZoom = Math.max(0.0001, to.zoom)
  const destinationWorldCenter = {
    x: (width / 2 - to.pan.x) / toZoom,
    y: (height / 2 - to.pan.y) / toZoom,
  }
  const destinationStartScreen = {
    x: from.pan.x + destinationWorldCenter.x * fromZoom,
    y: from.pan.y + destinationWorldCenter.y * fromZoom,
  }
  const panDistance = Math.hypot(
    destinationStartScreen.x - width / 2,
    destinationStartScreen.y - height / 2,
  )
  const zoomDistance = Math.abs(Math.log(toZoom / fromZoom))
  const duration = CAMERA_FLIGHT_MIN_MS + panDistance * 0.08 + zoomDistance * 70
  return Math.round(
    Math.min(CAMERA_FLIGHT_MAX_MS, Math.max(CAMERA_FLIGHT_MIN_MS, duration)),
  )
}

/**
 * Plans one automatic camera flight. Compatible incoming momentum is
 * projected onto the new journey; sideways or opposing momentum is dropped
 * so preserving an obsolete vector can never make the new destination recede.
 */
export function createCameraFlightPlan({
  from,
  to,
  viewport,
  durationMs = resolveCameraFlightDuration(from, to, viewport),
  initialVelocity,
}: {
  from: CameraTransform
  to: CameraTransform
  viewport: { width: number; height: number }
  durationMs?: number
  initialVelocity?: CameraVelocity
}): CameraFlightPlan {
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const fromZoom = Math.max(0.0001, from.zoom)
  const toZoom = Math.max(0.0001, to.zoom)
  const safeDuration = Number.isFinite(durationMs)
    ? Math.max(1, durationMs)
    : 420
  const destinationWorldCenter = {
    x: (width / 2 - to.pan.x) / toZoom,
    y: (height / 2 - to.pan.y) / toZoom,
  }
  const startScreen = {
    x: from.pan.x + destinationWorldCenter.x * fromZoom,
    y: from.pan.y + destinationWorldCenter.y * fromZoom,
  }
  const screenDelta = {
    x: width / 2 - startScreen.x,
    y: height / 2 - startScreen.y,
  }
  const screenDistance = Math.hypot(screenDelta.x, screenDelta.y)
  const screenDirection =
    screenDistance > 0
      ? { x: screenDelta.x / screenDistance, y: screenDelta.y / screenDistance }
      : { x: 0, y: 0 }
  const incomingScreenVelocity = initialVelocity
    ? {
        x:
          initialVelocity.pan.x +
          destinationWorldCenter.x * initialVelocity.zoomPerMs,
        y:
          initialVelocity.pan.y +
          destinationWorldCenter.y * initialVelocity.zoomPerMs,
      }
    : { x: 0, y: 0 }
  const screenSpeedToward = Math.max(
    0,
    incomingScreenVelocity.x * screenDirection.x +
      incomingScreenVelocity.y * screenDirection.y,
  )
  const screenInitialSlope =
    screenDistance > 0
      ? Math.min(
          MAX_FLIGHT_SLOPE,
          Math.max(
            RESTING_FLIGHT_SLOPE,
            (screenSpeedToward * safeDuration) / screenDistance,
          ),
        )
      : 0

  const logZoomDelta = Math.log(toZoom / fromZoom)
  const incomingLogZoomVelocity = initialVelocity
    ? initialVelocity.zoomPerMs / fromZoom
    : 0
  const logSpeedToward =
    logZoomDelta === 0
      ? 0
      : Math.max(0, incomingLogZoomVelocity * Math.sign(logZoomDelta))
  const zoomInitialSlope =
    logZoomDelta === 0
      ? 0
      : Math.min(
          MAX_FLIGHT_SLOPE,
          Math.max(
            RESTING_FLIGHT_SLOPE,
            (logSpeedToward * safeDuration) / Math.abs(logZoomDelta),
          ),
        )

  // Both channels ride move, each launched at the speed it already has, so a
  // retarget mid-air starts at the velocity the last flight left it with.
  const screenCurve = easeMoveFrom(screenInitialSlope)
  const zoomCurve = easeMoveFrom(zoomInitialSlope)

  return {
    durationMs: safeDuration,
    sample(elapsedMs) {
      const time = Math.min(1, Math.max(0, elapsedMs / safeDuration))
      if (time === 0) {
        return {
          transform: from,
          velocity: initialVelocity ?? {
            pan: { x: 0, y: 0 },
            zoomPerMs: 0,
          },
          progress: 0,
          done: false,
        }
      }
      if (time === 1) {
        return {
          transform: to,
          velocity: { pan: { x: 0, y: 0 }, zoomPerMs: 0 },
          progress: 1,
          done: true,
        }
      }

      const screenProgress = screenCurve.value(time)
      const zoomProgress = zoomCurve.value(time)
      const screenDerivative = screenCurve.slope(time) / safeDuration
      const zoomDerivative = zoomCurve.slope(time) / safeDuration
      const zoom = fromZoom * Math.exp(logZoomDelta * zoomProgress)
      const destinationScreen = {
        x: startScreen.x + screenDelta.x * screenProgress,
        y: startScreen.y + screenDelta.y * screenProgress,
      }
      const screenVelocity = {
        x: screenDelta.x * screenDerivative,
        y: screenDelta.y * screenDerivative,
      }
      const zoomPerMs = zoom * logZoomDelta * zoomDerivative
      const transform = {
        pan: {
          x: destinationScreen.x - destinationWorldCenter.x * zoom,
          y: destinationScreen.y - destinationWorldCenter.y * zoom,
        },
        zoom,
      }

      return {
        transform,
        velocity: {
          pan: {
            x: screenVelocity.x - destinationWorldCenter.x * zoomPerMs,
            y: screenVelocity.y - destinationWorldCenter.y * zoomPerMs,
          },
          zoomPerMs,
        },
        progress: screenProgress,
        done: false,
      }
    },
  }
}
