// @vitest-environment jsdom
/* eslint-disable react-hooks/globals, react-hooks/immutability -- the harness deliberately exposes and stamps an imperative camera surface */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useZoomPanViewport } from '@/hooks/useZoomPanViewport'
import type { CameraTransitionResult } from '@/lib/cameraTransition'
import { awaitPublishedJump } from '@/lib/canvasJump'
import { MOBILE_MIN_FIT_ZOOM } from '@/lib/canvasCameraPolicy'
import { getCanvasFocusFitInsets } from '@/lib/canvasFocus'
import type { FocusCellsResult } from '@/lib/canvasFocusCells'
import { FOCUS_DIM_OPACITY } from '@/lib/canvasFocusDim'

type Rect = { left: number; top: number; width: number; height: number }

let nextFrameId = 1
let frames = new Map<number, FrameRequestCallback>()
const resizeObservers: Array<() => void> = []

function flushFrame(at: number) {
  const queued = [...frames.values()]
  frames.clear()
  for (const callback of queued) callback(at)
}

function stampBox(
  element: HTMLElement,
  size: { width: number; height: number },
) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: size.width },
    clientHeight: { configurable: true, value: size.height },
    offsetWidth: { configurable: true, value: size.width },
    offsetHeight: { configurable: true, value: size.height },
    scrollWidth: { configurable: true, value: size.width },
    scrollHeight: { configurable: true, value: size.height },
  })
}

function rect(value: Rect): DOMRect {
  return {
    ...value,
    x: value.left,
    y: value.top,
    right: value.left + value.width,
    bottom: value.top + value.height,
    toJSON: () => value,
  }
}

let cameraState: () => {
  moving: boolean
  zoom: number
  pan: { x: number; y: number }
}
let panCamera: (dx: number, dy: number) => void
let refitCamera: () => false | Promise<CameraTransitionResult>
let focusCamera: (
  ids: string[],
  opts?: { animate?: boolean },
) => Promise<FocusCellsResult>

function Harness({
  resetKey,
  target,
  cameraStateKey,
  cameraDestinationKey,
  cameraDestinationResolved,
  cameraOutcomeKey,
  onFitReady,
  containerSize = { width: 1000, height: 600 },
  mountBoard = true,
  fitBottomInset = 0,
  fitTopInset = 0,
  fitMargin = 0,
  minFitZoom,
}: {
  resetKey: string
  target: Rect
  cameraStateKey?: string
  cameraDestinationKey?: string
  cameraDestinationResolved?: boolean
  cameraOutcomeKey?: string
  onFitReady?: () => void
  containerSize?: { width: number; height: number }
  /** False omits the board node so a sized viewport cannot measure it. */
  mountBoard?: boolean
  /** Height of a surface occluding the bottom edge (the phone's agent sheet). */
  fitBottomInset?: number
  /** Clearance the fit reserves at the top edge, above `fitMargin`. */
  fitTopInset?: number
  /** Breathing room the fit keeps on every edge. */
  fitMargin?: number
  /** Fit-zoom floor. Left unset, the fit is always the true fit. */
  minFitZoom?: number
}) {
  const camera = useZoomPanViewport({
    resetKey,
    fitSelector: '[data-target]',
    fitMargin,
    fitTopInset,
    fitBottomInset,
    minFitZoom,
    maxFitZoom: 4,
    animateFit: true,
    refitOnResize: false,
    cameraStateKey,
    cameraDestinationKey,
    cameraDestinationResolved,
    cameraOutcomeKey,
    onFitReady,
  })
  cameraState = camera.getCameraState
  panCamera = camera.panBy
  refitCamera = () => camera.fitToView({ animate: true })
  focusCamera = camera.focusCells

  return (
    <div
      ref={(node) => {
        if (node) {
          stampBox(node, containerSize)
          node.getBoundingClientRect = () =>
            rect({ left: 0, top: 0, ...containerSize })
        }
        camera.containerRef(node)
      }}
    >
      <div
        data-zoom-pan-ground=""
        ref={(node) => {
          camera.groundRef.current = node
        }}
      />
      {mountBoard ? (
        <div
          data-zoom-pan-content=""
          ref={(node) => {
            camera.contentRef.current = node
            if (node) {
              stampBox(node, { width: 1200, height: 600 })
              node.getBoundingClientRect = () => {
                const camera = cameraState()
                return rect({
                  left: camera.pan.x,
                  top: camera.pan.y,
                  width: 1200 * camera.zoom,
                  height: 600 * camera.zoom,
                })
              }
            }
          }}
        >
          <div
            data-target=""
            data-blueprint-cell="cell-1"
            ref={(node) => {
              if (!node) return
              stampBox(node, target)
              node.getBoundingClientRect = () => {
                const camera = cameraState()
                return rect({
                  left: camera.pan.x + target.left * camera.zoom,
                  top: camera.pan.y + target.top * camera.zoom,
                  width: target.width * camera.zoom,
                  height: target.height * camera.zoom,
                })
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function FocusHarness({ selected }: { selected: 'a' | 'b' | 'c' }) {
  const camera = useZoomPanViewport({
    resetKey: selected,
    fitSelector: `[data-focus-slide-id="${selected}"]`,
    fitMargin: 0,
    fitTopInset: 0,
    maxFitZoom: 4,
    animateFit: true,
    refitOnResize: false,
  })
  cameraState = camera.getCameraState
  panCamera = camera.panBy

  return (
    <div
      ref={(node) => {
        if (node) stampBox(node, { width: 1000, height: 600 })
        camera.containerRef(node)
      }}
    >
      <div
        ref={(node) => {
          camera.contentRef.current = node
          if (node) {
            stampBox(node, { width: 2000, height: 600 })
            node.getBoundingClientRect = () => {
              const camera = cameraState()
              return rect({
                left: camera.pan.x,
                top: camera.pan.y,
                width: 2000 * camera.zoom,
                height: 600 * camera.zoom,
              })
            }
          }
        }}
      >
        {(['a', 'b', 'c'] as const).map((id, index) => (
          <div
            key={id}
            data-focus-slide-id={id}
            data-canvas-focus-dimmed={selected === id ? undefined : ''}
            ref={(node) => {
              if (!node) return
              stampBox(node, { width: 800, height: 500 })
              node.getBoundingClientRect = () => {
                const camera = cameraState()
                return rect({
                  left: camera.pan.x + index * 1000 * camera.zoom,
                  top: camera.pan.y,
                  width: 800 * camera.zoom,
                  height: 500 * camera.zoom,
                })
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

beforeEach(() => {
  frames = new Map()
  nextFrameId = 1
  resizeObservers.length = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push(() => {
          callback([], this as unknown as ResizeObserver)
        })
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the canvas ground under the camera', () => {
  const ground = () =>
    document.querySelector<HTMLElement>('[data-zoom-pan-ground]')!

  it('keeps the dot grid hidden until the first fit has framed the board', () => {
    render(
      <Harness
        resetKey="initial"
        target={{ left: 0, top: 0, width: 500, height: 300 }}
      />,
    )
    // Laid out at the unfitted camera, but not shown there.
    expect(ground().style.transform).toContain('translate3d(')
    expect(ground().dataset.groundReady).toBeUndefined()

    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    expect(cameraState().zoom).not.toBe(1)
    expect(ground().dataset.groundReady).toBe('')
  })

  it('starts a fresh mount hidden again, whatever the last one showed', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    expect(ground().dataset.groundReady).toBe('')
    first.unmount()

    render(<Harness resetKey="initial" target={target} />)
    expect(ground().dataset.groundReady).toBeUndefined()
  })

  it('moves the grid in the same write that moves the board', () => {
    render(
      <Harness
        resetKey="initial"
        target={{ left: 0, top: 0, width: 1000, height: 600 }}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    const before = ground().style.transform
    act(() => panCamera(7, -3))
    const after = ground().style.transform
    expect(after).not.toBe(before)
    expect(after).toMatch(/^translate3d\([\d.]+px, [\d.]+px, 0\) scale\([\d.]+\)$/)
    // A pan leaves the tile size alone: only a zoom repaints the layer.
    const size = ground().style.backgroundSize
    act(() => panCamera(11, 5))
    expect(ground().style.backgroundSize).toBe(size)
  })
})

describe('viewport camera flights', () => {
  it('reports readiness from the viewport that consumed the fit', async () => {
    const onFitReady = vi.fn()
    render(
      <Harness
        resetKey="initial"
        target={{ left: 0, top: 0, width: 1000, height: 600 }}
        onFitReady={onFitReady}
      />,
    )
    await act(async () => {
      flushFrame(0)
      flushFrame(16)
      await Promise.resolve()
    })
    expect(onFitReady).toHaveBeenCalledTimes(1)
  })

  /*
    The phone keeps its agent sheet open across a jump, so the lower 60% of
    the screen is opaque. Both camera moves have to frame inside what is left:
    a fit already reads the inset, and a focus centred on the raw container
    until this pair pinned it.
  */
  it('fits inside the strip a bottom-occluding surface leaves visible', () => {
    render(
      <Harness
        resetKey="occluded"
        target={{ left: 0, top: 0, width: 1000, height: 100 }}
        fitBottomInset={300}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const camera = cameraState()
    expect(camera.zoom).toBeCloseTo(1)
    // Centred in the visible 300px, not in the 600px container (which would
    // have put the target's middle at y=300 — exactly on the sheet's edge).
    expect(camera.pan.y).toBeCloseTo(100)
    expect(camera.pan.y + 100 * camera.zoom).toBeLessThan(300)
  })

  it('flies a focused cell above a bottom-occluding surface', async () => {
    render(
      <Harness
        resetKey="occluded"
        target={{ left: 0, top: 0, width: 100, height: 100 }}
        fitBottomInset={300}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    act(() => panCamera(0, -250))
    expect(cameraState().pan.y).toBeCloseTo(-250)

    await act(async () => {
      await focusCamera(['cell-1'], { animate: false })
    })

    const camera = cameraState()
    // The cell's centre lands at 150 — the middle of the visible strip —
    // rather than at 300, which is behind the surface.
    expect(camera.pan.y).toBeCloseTo(0)
    expect(camera.pan.y + 50 * camera.zoom).toBeCloseTo(150)
  })

  /*
    THE FLOOR, AND WHAT THE BOTTOM INSET IS WORTH UNDER IT.

    The pair above runs with no fit floor, so the true fit always wins and the
    bottom inset always reads through `fitHeight`. The phone is not that
    viewport: it floors its fit zoom (`MOBILE_MIN_FIT_ZOOM`), and a real
    scenario board is far wider than 375px, so the floor wins — and on an axis
    the floor pushed off screen the framing is ANCHORED, solving for
    `insets.top` alone. The bottom inset is out of that solution entirely.

    These two cases are the difference between "the sheet's height reached the
    fit" and "the sheet's height moved the camera". That gap is not academic:
    the phone slice asserts the measured height reaches the camera, which is
    true and is not a framing, and the two claims were read as one through a
    review, a browser verification and a render walk — during which mutating
    the inset produced a pixel-identical destination box. Here the camera
    itself is read, on both sides of the line the inset draws.

    The framing is DELIBERATE, and these cases are where that is written down.
    The anchored axis ignores the bottom inset because the edge worth keeping
    on a board too big for the strip is the one it begins at. The reasoning
    lives over that branch in `useZoomPanViewport`, which owns it rather than
    having it restated here.

    Where the bottom inset does bite is the other case: a board the floor
    binds by WIDTH while it still fits the strip vertically centres inside the
    strip, and dropping the inset there puts the whole board behind the sheet.
    It also decides which of these two branches a given board lands in, since
    `overflowsY` is measured against the strip and not against the container
    — so "inert on a floored fit" would itself be too strong a claim.
  */
  const PHONE = { width: 375, height: 812 }
  /** The agent sheet's 60svh on that screen, and so the sheet's own top. */
  const SHEET_OCCLUDED = Math.round(PHONE.height * 0.6)
  const SHEET_TOP = PHONE.height - SHEET_OCCLUDED
  /*
    The insets are DERIVED, not chosen. Every number below comes out of the
    helper the phone's detail canvas really calls, so the margin (20) and the
    top inset (56 — the bottom-navigation clearance mirrored to the top to
    hold the board's visual centre, not a bar over the canvas; the phone's top
    bar sits outside this container) are the shipped ones rather than a pair
    picked to make an assertion land. Asking it for 0 occlusion is also the
    honest "sheet closed" reading: the helper floors the bottom inset at its
    own 56, which a raw 0 would not.
  */
  const SHEET_UP = getCanvasFocusFitInsets('detail', SHEET_OCCLUDED)
  const SHEET_AWAY = getCanvasFocusFitInsets('detail', 0)

  it('frames a short board inside the strip even when the floor binds its width, which is the framing the bottom inset buys', () => {
    render(
      <Harness
        resetKey="floored-short"
        // Wider than the phone by enough that the floor binds — and short
        // enough that it still fits the strip the sheet leaves.
        target={{ left: 0, top: 0, width: 1000, height: 200 }}
        containerSize={PHONE}
        fitMargin={SHEET_UP.margin}
        fitTopInset={SHEET_UP.topInset}
        fitBottomInset={SHEET_UP.bottomInset}
        minFitZoom={MOBILE_MIN_FIT_ZOOM}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const camera = cameraState()
    // The floor won on width; the vertical axis still fits, so it centres —
    // inside the 229px strip, not inside the 660px the container leaves with
    // the sheet away.
    expect(camera.zoom).toBeCloseTo(MOBILE_MIN_FIT_ZOOM)
    expect(camera.pan.y).toBeCloseTo(145.5)
    expect(camera.pan.y + 200 * camera.zoom).toBeLessThan(SHEET_TOP)
  })

  it('leaves a board taller than the strip anchored to the top inset, where the bottom inset cannot help it', () => {
    const framing = (insets: {
      margin: number
      topInset: number
      bottomInset: number
    }) => {
      const view = render(
        <Harness
          resetKey="floored-tall"
          // The ordinary phone destination: a scenario board wider than the
          // screen and tall enough to overflow the strip at the floor
          // whether or not the sheet is up, which is what puts both readings
          // in the anchored branch and makes the comparison below fair.
          target={{ left: 0, top: 0, width: 705, height: 2000 }}
          containerSize={PHONE}
          fitMargin={insets.margin}
          fitTopInset={insets.topInset}
          fitBottomInset={insets.bottomInset}
          minFitZoom={MOBILE_MIN_FIT_ZOOM}
        />,
      )
      act(() => {
        flushFrame(0)
        flushFrame(16)
      })
      const camera = cameraState()
      view.unmount()
      return camera
    }

    const withSheet = framing(SHEET_UP)
    const withoutSheet = framing(SHEET_AWAY)

    // Anchored to the top inset: the board starts at the top of the frame
    // the fit reserves, which is the reader's answer to "where does this
    // board begin".
    expect(withSheet.zoom).toBeCloseTo(MOBILE_MIN_FIT_ZOOM)
    expect(withSheet.pan.y).toBeCloseTo(SHEET_UP.margin + SHEET_UP.topInset)
    // And it reaches BEHIND the sheet, because at the floor it cannot not:
    // 2000px of board at 0.45 is 900px against a 229px strip. Saying this
    // out loud is the point of the case — the sheet's height is what the
    // camera is TOLD, and on this board it is not what frames it.
    expect(withSheet.pan.y + 2000 * withSheet.zoom).toBeGreaterThan(SHEET_TOP)
    // Identical with the sheet up and with it away: the inset is inert
    // here by design, and a change that made it bite on this axis would buy
    // clearance at an edge already off screen by pushing the board's
    // beginning up out of the frame the fit reserves — see the anchoring
    // note in `useZoomPanViewport`, which owns that argument.
    expect(withoutSheet.zoom).toBeCloseTo(withSheet.zoom)
    expect(withoutSheet.pan.y).toBeCloseTo(withSheet.pan.y)
    expect(withoutSheet.pan.x).toBeCloseTo(withSheet.pan.x)
  })

  it('finishes a nearby recenter inside the distance-aware timing floor', () => {
    const view = render(
      <Harness
        resetKey="initial"
        target={{ left: 0, top: 0, width: 1000, height: 600 }}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    expect(cameraState().moving).toBe(false)

    view.rerender(
      <Harness
        resetKey="nearby"
        target={{ left: 10, top: 0, width: 1000, height: 600 }}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })
    expect(cameraState().moving).toBe(true)

    act(() => flushFrame(364))
    expect(cameraState().moving).toBe(false)
    expect(cameraState().pan.x).toBeCloseTo(-10)
  })

  it('supersedes the active flight as soon as a newer intent is accepted', () => {
    const view = render(
      <Harness
        resetKey="initial"
        target={{ left: 0, top: 0, width: 1000, height: 600 }}
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    view.rerender(
      <Harness
        resetKey="first"
        target={{ left: 800, top: 0, width: 1000, height: 600 }}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
      flushFrame(164)
    })
    expect(cameraState().moving).toBe(true)

    view.rerender(
      <Harness
        resetKey="second"
        target={{ left: -400, top: 0, width: 1000, height: 600 }}
      />,
    )

    expect(cameraState().moving).toBe(false)
  })

  it('takes off once the named target is measurable, even if it is still moving', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    view.rerender(<Harness resetKey="moving" target={target} />)
    act(() => flushFrame(32))
    target.left = 300
    act(() => flushFrame(48))

    expect(cameraState().moving).toBe(true)

    act(() => {
      flushFrame(64)
      flushFrame(900)
    })
    expect(cameraState().moving).toBe(false)
    expect(cameraState().pan.x).toBeCloseTo(-300)
  })

  it('keeps the blocks tier on a zoom-in and reveals only the named target', () => {
    const overview = { left: 0, top: 0, width: 5000, height: 3000 }
    const focused = { left: 0, top: 0, width: 1800, height: 1080 }
    const view = render(<Harness resetKey="overview" target={overview} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const content = view.container.querySelector<HTMLElement>(
      '[data-zoom-pan-content]',
    )!
    const named = view.container.querySelector<HTMLElement>('[data-target]')!
    expect(cameraState().zoom).toBeLessThan(0.25)
    expect(content.dataset.semanticTier).toBe('blocks')
    expect(named.hasAttribute('data-camera-flight-reveal')).toBe(false)

    view.rerender(<Harness resetKey="scenario" target={focused} />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
      flushFrame(80)
    })

    expect(cameraState().moving).toBe(true)
    expect(cameraState().zoom).toBeGreaterThan(0.05)
    expect(content.dataset.semanticTier).toBe('blocks')
    expect(named.hasAttribute('data-camera-flight-reveal')).toBe(true)

    act(() => flushFrame(900))
    expect(cameraState().moving).toBe(false)
    expect(cameraState().zoom).toBeGreaterThan(0.25)
    expect(content.dataset.semanticTier).toBe('blocks')
    expect(named.hasAttribute('data-camera-flight-reveal')).toBe(true)
  })

  it('stamps blocks on the first frame of a zoom-out that crosses the threshold', () => {
    const focused = { left: 0, top: 0, width: 1000, height: 600 }
    const overview = { left: 0, top: 0, width: 5000, height: 3000 }
    const view = render(<Harness resetKey="scenario" target={focused} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const content = view.container.querySelector<HTMLElement>(
      '[data-zoom-pan-content]',
    )!
    expect(cameraState().zoom).toBeGreaterThanOrEqual(0.25)
    expect(content.dataset.semanticTier).not.toBe('blocks')

    view.rerender(<Harness resetKey="overview" target={overview} />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })

    expect(content.dataset.semanticTier).toBe('blocks')
    expect(
      view.container
        .querySelector('[data-target]')
        ?.hasAttribute('data-camera-flight-reveal'),
    ).toBe(false)

    act(() => flushFrame(900))
    expect(cameraState().moving).toBe(false)
    expect(cameraState().zoom).toBeLessThan(0.25)
    expect(content.dataset.semanticTier).toBe('blocks')
  })

  it('retargets a live flight from its current transform without a snap', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    target.left = 800
    view.rerender(<Harness resetKey="far" target={target} />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
      flushFrame(164)
    })
    const beforeRetarget = cameraState().pan.x

    target.left = 400
    act(() => flushFrame(180))
    expect(cameraState().pan.x).toBe(beforeRetarget)
    expect(cameraState().moving).toBe(true)

    act(() => {
      flushFrame(900)
    })
    expect(cameraState().moving).toBe(false)
    expect(cameraState().pan.x).toBeCloseTo(-400)
  })

  it('yields to a wheel mid-flight from the interpolated position, with no snap', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    target.left = 800
    view.rerender(<Harness resetKey="far" target={target} />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
      flushFrame(164)
    })
    const midFlight = cameraState()
    expect(midFlight.moving).toBe(true)
    expect(midFlight.pan.x).toBeLessThan(0)
    expect(midFlight.pan.x).toBeGreaterThan(-800)

    const content = view.container.querySelector('[data-zoom-pan-content]')!
    act(() => {
      content.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: 12,
          deltaY: 0,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    // The wheel lands on the frame the flight last drew, not on the target.
    expect(cameraState().pan.x).toBeCloseTo(midFlight.pan.x - 12)
    expect(cameraState().pan.y).toBeCloseTo(midFlight.pan.y)
    expect(cameraState().moving).toBe(false)

    // And the flight does not come back for it.
    const afterWheel = cameraState().pan.x
    act(() => {
      flushFrame(300)
      flushFrame(900)
    })
    expect(cameraState().pan.x).toBe(afterWheel)
  })

  it('keeps advancing while the live target moves on consecutive frames', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    target.left = 700
    view.rerender(<Harness resetKey="moving" target={target} />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })
    const startedAt = cameraState().pan.x
    for (const at of [80, 96, 112, 128, 144, 160]) {
      target.left += 8
      act(() => flushFrame(at))
    }

    expect(cameraState().pan.x).not.toBeCloseTo(startedAt)
    expect(cameraState().moving).toBe(true)
  })

  it('restores the live transform before a returning canvas schedules a fit', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:camera-flight-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    expect(cameraState().pan).toEqual({ x: 125, y: -40 })
    first.unmount()

    render(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:camera-flight-test"
        cameraDestinationKey="scenario-a"
      />,
    )

    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 125, y: -40 },
      zoom: 1,
    })
    act(() => flushFrame(32))
    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 125, y: -40 },
      zoom: 1,
    })
  })

  /*
    The return that actually happens.

    A canvas coming back to a still-open tab does not remount straight onto
    its board: it boots on a skeleton, under a destination that names the
    wait, and the real board only replaces it a beat after readiness renames
    the destination. Each of those three commits is exercised here, with a
    placeholder whose box is deliberately NOT the board's — so the framing
    can only survive by having been held rather than compared against a
    stand-in.
  */
  it('keeps the framing when the return boots through a loading destination', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:loading-remount-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    expect(cameraState().pan).toEqual({ x: 125, y: -40 })
    first.unmount()

    // A: the skeleton stands in, under a destination that means "not ready".
    target.width = 400
    target.height = 300
    const second = render(
      <Harness
        resetKey="loading"
        target={target}
        cameraStateKey="desktop:slice:loading-remount-test"
        cameraDestinationKey="loading"
        cameraDestinationResolved={false}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })
    // The placeholder was framed, as it always is — that is not the question.
    expect(cameraState().zoom).toBeGreaterThan(1)

    // B: readiness names the real destination, the skeleton is still on
    // screen. Nothing about the board can be measured yet.
    second.rerender(
      <Harness
        resetKey="ready"
        target={target}
        cameraStateKey="desktop:slice:loading-remount-test"
        cameraDestinationKey="scenario-a"
        cameraDestinationResolved={false}
      />,
    )
    act(() => {
      flushFrame(80)
      flushFrame(96)
      flushFrame(400)
    })

    // C: the board arrives.
    target.width = 1000
    target.height = 600
    second.rerender(
      <Harness
        resetKey="ready"
        target={target}
        cameraStateKey="desktop:slice:loading-remount-test"
        cameraDestinationKey="scenario-a"
        cameraDestinationResolved
      />,
    )

    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 125, y: -40 },
      zoom: 1,
    })
    act(() => {
      flushFrame(432)
      flushFrame(448)
    })
    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 125, y: -40 },
      zoom: 1,
    })
  })

  it('waits to restore framing when the viewport has no layout yet', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:zero-size-restore-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()

    const second = render(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:zero-size-restore-test"
        cameraDestinationKey="scenario-a"
        containerSize={{ width: 0, height: 0 }}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })
    expect(cameraState()).toMatchObject({
      pan: { x: 125, y: -40 },
      zoom: 1,
    })

    second.rerender(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:zero-size-restore-test"
        cameraDestinationKey="scenario-a"
        containerSize={{ width: 1000, height: 600 }}
      />,
    )
    act(() => {
      for (const notify of resizeObservers) notify()
    })
    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 125, y: -40 },
      zoom: 1,
    })
  })

  it('falls back to the default fit when a measurable viewport has no board', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:missing-board-restore-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()

    render(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:missing-board-restore-test"
        cameraDestinationKey="scenario-a"
        mountBoard={false}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
    })
    expect(cameraState()).toMatchObject({
      pan: { x: 0, y: 0 },
      zoom: 1,
    })
  })

  // Holding the framing across the wait must not become a way of keeping a
  // framing that names another board. The two rejections below are the same
  // two the immediate return already refuses, put through the loading hop.
  it('still rejects a different destination reached through a loading hop', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:loading-destination-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()

    target.width = 400
    target.height = 300
    const second = render(
      <Harness
        resetKey="loading"
        target={target}
        cameraStateKey="desktop:slice:loading-destination-test"
        cameraDestinationKey="loading"
        cameraDestinationResolved={false}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })

    target.width = 1000
    target.height = 600
    second.rerender(
      <Harness
        resetKey="ready"
        target={target}
        cameraStateKey="desktop:slice:loading-destination-test"
        cameraDestinationKey="scenario-b"
        cameraDestinationResolved
      />,
    )
    act(() => {
      flushFrame(80)
      flushFrame(96)
      flushFrame(500)
    })

    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 0, y: 0 },
      zoom: 1,
    })
  })

  it('still rejects a moved fit target reached through a loading hop', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:loading-geometry-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()

    target.width = 400
    target.height = 300
    const second = render(
      <Harness
        resetKey="loading"
        target={target}
        cameraStateKey="desktop:slice:loading-geometry-test"
        cameraDestinationKey="loading"
        cameraDestinationResolved={false}
      />,
    )
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })

    // Same destination, board genuinely somewhere else.
    target.width = 1000
    target.height = 600
    target.left = 250
    second.rerender(
      <Harness
        resetKey="ready"
        target={target}
        cameraStateKey="desktop:slice:loading-geometry-test"
        cameraDestinationKey="scenario-a"
        cameraDestinationResolved
      />,
    )
    act(() => {
      flushFrame(80)
      flushFrame(96)
      flushFrame(112)
      flushFrame(600)
      flushFrame(1200)
    })

    expect(cameraState().moving).toBe(false)
    expect(cameraState().pan).not.toEqual({ x: 125, y: -40 })
    expect(cameraState().pan.x).toBeCloseTo(-250)
  })

  it('rejects a stored transform for a different semantic destination', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:destination-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()

    render(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:destination-test"
        cameraDestinationKey="scenario-b"
      />,
    )

    expect(cameraState().pan).toEqual({ x: 0, y: 0 })
    act(() => {
      flushFrame(32)
      flushFrame(48)
    })
    expect(cameraState().pan).toEqual({ x: 0, y: 0 })
  })

  it('rejects a stored transform when the destination geometry changed', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const first = render(
      <Harness
        resetKey="initial"
        target={target}
        cameraStateKey="desktop:slice:geometry-test"
        cameraDestinationKey="scenario-a"
      />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
      panCamera(125, -40)
    })
    first.unmount()
    target.left = 250

    render(
      <Harness
        resetKey="return"
        target={target}
        cameraStateKey="desktop:slice:geometry-test"
        cameraDestinationKey="scenario-a"
      />,
    )

    expect(cameraState().pan).toEqual({ x: 0, y: 0 })
  })

  it('keeps a manual pan made while a new destination is still settling', () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    target.left = 500
    const navigation = awaitPublishedJump('next', () =>
      view.rerender(
        <Harness resetKey="next" target={target} cameraOutcomeKey="next" />,
      ),
    )
    act(() => panCamera(75, 20))
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })

    expect(cameraState()).toMatchObject({
      moving: false,
      pan: { x: 75, y: 20 },
    })
    return expect(navigation).resolves.toBe('cancelled')
  })

  it('reports a pending semantic destination as superseded', async () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const first = awaitPublishedJump('first', () =>
      view.rerender(
        <Harness resetKey="first" target={target} cameraOutcomeKey="first" />,
      ),
    )
    view.rerender(
      <Harness resetKey="second" target={target} cameraOutcomeKey="second" />,
    )

    await expect(first).resolves.toBe('superseded')
  })

  /*
    The one ordering this ticket exists for. A viewport can leave the tree
    mid-flight while the destination the reader asked for has not changed —
    the freshly opened scenario's path filter arrives a beat after the
    selection, the board falls to its no-paths state, and the canvas remounts
    and refits the SAME target. The dying mount used to answer every waiter
    with `cancelled`, so the agent was told its navigation failed and the
    phone's sheet washed back over a canvas still in the air; the landing that
    followed reached nobody. An unmount is not a verdict: it lets go, and the
    mount that takes the camera over is what answers.

    THIS IS THE ONLY GUARD ON THAT HAND-OFF. The jump module's own unit suite
    cannot reach it — from there, letting go is indistinguishable from any
    other silence, because it IS the absence of a call — so this case must not
    be retired on the strength of a unit test that reads like it.
  */
  it('hands a flight to the next mount instead of cancelling it on unmount', async () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    const view = render(
      <Harness resetKey="initial" target={target} cameraOutcomeKey="scen-1" />,
    )
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    const waiting = awaitPublishedJump('scen-1', () =>
      view.rerender(
        <Harness resetKey="flight" target={target} cameraOutcomeKey="scen-1" />,
      ),
    )
    let outcome: unknown
    void waiting.then((result) => {
      outcome = result
    })
    act(() => view.unmount())
    await act(async () => {
      await Promise.resolve()
    })
    expect(outcome).toBeUndefined()

    render(
      <Harness resetKey="remount" target={target} cameraOutcomeKey="scen-1" />,
    )
    await act(async () => {
      flushFrame(32)
      flushFrame(48)
      await Promise.resolve()
    })

    await expect(waiting).resolves.toBe('landed')
  })

  it('reports cancellation to a caller waiting on a camera fit', async () => {
    const target = { left: 0, top: 0, width: 1000, height: 600 }
    render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    target.left = 600
    const outcome = refitCamera()
    expect(outcome).not.toBe(false)
    act(() => flushFrame(32))
    act(() => panCamera(10, 0))

    await expect(outcome).resolves.toMatchObject({ kind: 'cancelled' })
  })

  it('does not pulse a cell after its focus flight is cancelled', async () => {
    const target = { left: 0, top: 0, width: 100, height: 100 }
    const view = render(<Harness resetKey="initial" target={target} />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    target.left = 800
    const outcome = focusCamera(['cell-1'])
    act(() => flushFrame(32))
    act(() => panCamera(10, 0))

    await expect(outcome).resolves.toMatchObject({
      kind: 'flown',
      completion: 'cancelled',
    })
    expect(
      view.container.querySelector('[data-blueprint-cell-pulse]'),
    ).toBeNull()
  })

  it('transfers visible focus using the flight sample instead of a second clock', () => {
    const view = render(<FocusHarness selected="a" />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    view.rerender(<FocusHarness selected="b" />)
    const focus = (id: string) =>
      view.container.querySelector<HTMLElement>(
        `[data-focus-slide-id="${id}"]`,
      )!
    expect(Number(focus('a').style.opacity)).toBe(1)
    expect(Number(focus('b').style.opacity)).toBeCloseTo(FOCUS_DIM_OPACITY)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
    })
    expect(Number(focus('a').style.opacity)).toBe(1)
    expect(Number(focus('b').style.opacity)).toBeCloseTo(FOCUS_DIM_OPACITY)

    act(() => flushFrame(220))
    const originOpacity = Number(focus('a').style.opacity)
    const destinationOpacity = Number(focus('b').style.opacity)
    expect(originOpacity).toBeGreaterThan(FOCUS_DIM_OPACITY)
    expect(originOpacity).toBeLessThan(1)
    expect(destinationOpacity).toBeGreaterThan(FOCUS_DIM_OPACITY)
    expect(destinationOpacity).toBeLessThan(1)
    expect(originOpacity + destinationOpacity).toBeCloseTo(1 + FOCUS_DIM_OPACITY)

    act(() => flushFrame(800))
    expect(cameraState().moving).toBe(false)
    expect(focus('a').dataset.canvasFocusDimmed).toBe('')
    expect(focus('a').style.opacity).toBe('')
    expect(focus('b').style.opacity).toBe('')
  })

  it('clears the superseded emphasis before transferring the newer intent', () => {
    const view = render(<FocusHarness selected="a" />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })

    view.rerender(<FocusHarness selected="b" />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
      flushFrame(64)
      flushFrame(180)
    })
    view.rerender(<FocusHarness selected="a" />)
    act(() => {
      flushFrame(196)
      flushFrame(212)
      flushFrame(228)
    })

    const focus = (id: string) =>
      view.container.querySelector<HTMLElement>(
        `[data-focus-slide-id="${id}"]`,
      )!
    expect(Number(focus('b').style.opacity)).toBe(1)
    expect(Number(focus('a').style.opacity)).toBeCloseTo(FOCUS_DIM_OPACITY)

    act(() => flushFrame(900))
    expect(focus('b').style.opacity).toBe('')
    expect(focus('a').style.opacity).toBe('')
  })

  it('restores pending focus paint across a three-target supersession and manual cancel', () => {
    const view = render(<FocusHarness selected="a" />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    const focus = (id: string) =>
      view.container.querySelector<HTMLElement>(
        `[data-focus-slide-id="${id}"]`,
      )!

    view.rerender(<FocusHarness selected="b" />)
    expect(focus('a').style.opacity).toBe('1')
    view.rerender(<FocusHarness selected="c" />)
    expect(focus('a').style.opacity).toBe('')
    expect(focus('b').style.opacity).toBe('1')
    expect(focus('c').style.opacity).toBe(String(FOCUS_DIM_OPACITY))

    act(() => panCamera(12, 0))
    expect(focus('a').style.opacity).toBe('')
    expect(focus('b').style.opacity).toBe('')
    expect(focus('c').style.opacity).toBe('')
  })

  it('clears imperative focus paint when reduced motion commits immediately', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const view = render(<FocusHarness selected="a" />)
    act(() => {
      flushFrame(0)
      flushFrame(16)
    })
    view.rerender(<FocusHarness selected="b" />)
    act(() => {
      flushFrame(32)
      flushFrame(48)
    })
    const focus = (id: string) =>
      view.container.querySelector<HTMLElement>(
        `[data-focus-slide-id="${id}"]`,
      )!
    expect(focus('a').style.opacity).toBe('')
    expect(focus('b').style.opacity).toBe('')
    expect(cameraState().moving).toBe(false)
  })
})
