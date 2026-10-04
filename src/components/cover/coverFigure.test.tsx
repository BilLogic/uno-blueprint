// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CoverFigure } from '@/components/cover/CoverFigure'
import { setTheme } from '@/lib/theme'

/*
  The lightbox contract, REVERSED where it used to say "inert".

  This file used to pin the opposite of most of what it now pins: that the
  opened figure ignored pointer events, that a click anywhere — the diagram
  included — closed the popup, and that there was deliberately no second zoom
  step. That was the right contract while fit-to-viewport was everything the
  popup had to offer. Fit is also the scale at which a figure authored at
  880px still hides its smallest labels, which is what made the popup being
  the end of the interaction a defect rather than a decision.

  So the opened figure is now a viewer, and the assertions below say what it
  does: zoom toward the pointer on the wheel, a toggle between two stops on a
  click, pan past fit, and a cursor that says which of those is next. What
  survives unchanged is the CLOSED state — a plain pointer on the trigger,
  the corner expand hint — because that reasoning was about a different
  question and is still correct.

  This is also the one component test the whole viewer gets. `ZoomableImage`
  is exercised through its first adopter rather than through a bare harness,
  and the arithmetic it delegates to is pinned in `imageZoomReducer.test.ts`
  without a DOM. What is asserted here is the wiring: that a gesture reaches
  the reducer and that its answer reaches the element.
*/

afterEach(cleanup)

const TRIGGER = 'Expand: An example diagram'

/** Fits at 0.5, so every assertion below has room to zoom in both directions. */
const VIEWPORT = { width: 1000, height: 800 }
const NATURAL = { width: 2000, height: 1600 }

/**
 * The size the figure was AUTHORED at, which is the one that counts.
 *
 * A cover figure is a `viewBox`-only SVG with no intrinsic size, so a browser
 * answers `naturalWidth` with its own default box — 300 wide, whatever the
 * diagram — and a viewer that believed it would fit the wrong picture. The
 * stub below is that default, left deliberately wrong.
 */
const figure = {
  src: '/cover/example.svg',
  alt: 'An example diagram',
  width: NATURAL.width,
  height: NATURAL.height,
}
const BROWSER_DEFAULT_BOX = { width: 300, height: 128 }
const CENTRE = { clientX: 500, clientY: 400 }
const OFF_CENTRE = { clientX: 700, clientY: 600 }

/** jsdom lays nothing out, so both boxes are stated rather than measured. */
function stub(element: Element, values: Record<string, number>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { value, configurable: true })
  }
}

function open() {
  render(<CoverFigure figure={figure} />)
  fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
  const dialog = screen.getByRole('dialog')
  const image = within(dialog).getByRole('img', { name: figure.alt })
  const box = dialog.querySelector('[data-image-zoom-viewport]')
  const margin = dialog.querySelector('[data-image-zoom-margin]')
  if (!(box instanceof HTMLElement) || !(margin instanceof HTMLElement)) {
    throw new Error('the viewer is missing its viewport box or its margin')
  }
  stub(box, { clientWidth: VIEWPORT.width, clientHeight: VIEWPORT.height })
  stub(image, {
    naturalWidth: BROWSER_DEFAULT_BOX.width,
    naturalHeight: BROWSER_DEFAULT_BOX.height,
  })
  // The image's own `load` is what tells the viewer its natural size.
  fireEvent.load(image)
  return { dialog, image, box, margin }
}

/** Scale and offset, read back off the element the way a reader sees them. */
function viewport(image: HTMLElement) {
  const match =
    /translate\((-?[\d.]+)px, *(-?[\d.]+)px\) *scale\((-?[\d.]+)\)/.exec(
      image.style.transform,
    )
  if (!match) throw new Error(`unreadable transform: ${image.style.transform}`)
  return {
    offset: { x: Number(match[1]), y: Number(match[2]) },
    scale: Number(match[3]),
  }
}

/**
 * A real double click, which is three events and not one.
 *
 * The browser sends both clicks and then `dblclick`; `fireEvent.doubleClick`
 * sends only the last of them. Spelling the sequence out is the only way to
 * exercise the part that is actually interesting — that the second click of
 * the pair does not undo the first.
 */
function doubleClick(image: HTMLElement, at: typeof CENTRE) {
  fireEvent.click(image, { ...at, detail: 1 })
  fireEvent.click(image, { ...at, detail: 2 })
  fireEvent.doubleClick(image, { ...at, detail: 2 })
}

/** A press, a travel and a release, as a pointer actually delivers them. */
function drag(image: HTMLElement, from: typeof CENTRE, to: typeof CENTRE) {
  fireEvent.pointerDown(image, { ...from, button: 0, pointerId: 1 })
  fireEvent.pointerMove(image, { ...to, pointerId: 1 })
  fireEvent.pointerUp(image, { ...to, button: 0, pointerId: 1 })
  // The browser's click follows the release; whether the viewer acts on it
  // is the whole question.
  fireEvent.click(image, { ...to, detail: 1 })
}

describe('CoverFigure, closed', () => {
  it('opens on a plain pointer, not a zoom cursor — the corner hint is the only expand signal', () => {
    render(<CoverFigure figure={figure} />)
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger.className).toContain('cursor-pointer')
    expect(trigger.className).not.toContain('cursor-zoom-in')
  })

  it('makes the whole image the hit target, and keeps the corner expand hint', () => {
    render(<CoverFigure figure={figure} />)
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(within(trigger).getByRole('img', { name: figure.alt })).toBeDefined()
    expect(trigger.querySelector('svg.lucide-expand')).not.toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})

describe('CoverFigure, open', () => {
  it('opens fit to the viewport, centred', () => {
    const { image } = open()
    expect(viewport(image)).toEqual({ scale: 0.5, offset: { x: 0, y: 0 } })
    /*
      `origin-top-left` is part of that centring and not decoration, which is
      why it is asserted here rather than left to look at. The transform does
      its own centring; the default `50% 50%` origin centres it a second time,
      at the unscaled half-size, and the image lands off-centre by a distance
      that grows with the scale. jsdom lays nothing out, so this class is the
      only place that mistake is visible without a browser — it was found in
      one, and this is what keeps it found.
    */
    expect(image.className).toContain('origin-top-left')
  })

  it('fits the size the figure was authored at, not the browser default box', () => {
    const { image } = open()
    // Believing `naturalWidth` here would fit a 300px picture — and, since
    // fitting one blows past the guard, hold it there three times too small.
    expect(image.style.width).toBe(`${NATURAL.width}px`)
    expect(image.style.height).toBe(`${NATURAL.height}px`)
    expect(viewport(image).scale).toBe(0.5)
  })

  it('zooms to the stop above fit on a click, anchored where the click landed', () => {
    const { image } = open()
    fireEvent.click(image, { ...OFF_CENTRE, detail: 1 })
    const { scale, offset } = viewport(image)
    expect(scale).toBe(1)
    // The point under the pointer stayed put, so the image moved away from
    // the corner that was clicked rather than growing about its centre.
    expect(offset.x).toBeLessThan(0)
    expect(offset.y).toBeLessThan(0)
  })

  it('returns to fit on the next click, so no gesture is a dead end', () => {
    const { image } = open()
    // Two stops and nothing between them: 0.5 and, since natural size here
    // is exactly twice fit, natural size.
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(viewport(image).scale).toBe(1)

    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(viewport(image)).toEqual({ scale: 0.5, offset: { x: 0, y: 0 } })
  })

  it('lands a double click on the same stop a single click does, rather than undoing it', () => {
    const { image } = open()
    doubleClick(image, CENTRE)
    // The second click of the pair is stepped over; with one stop above fit
    // it could only take the reader back where they started.
    expect(viewport(image).scale).toBe(1)

    doubleClick(image, CENTRE)
    expect(viewport(image).scale).toBe(0.5)
  })

  it('zooms toward the pointer on the wheel', () => {
    const { image } = open()
    fireEvent.wheel(image, { deltaY: -10, deltaMode: 0, ...OFF_CENTRE })
    const { scale, offset } = viewport(image)
    expect(scale).toBeGreaterThan(0.5)
    expect(offset.x).toBeLessThan(0)
    expect(offset.y).toBeLessThan(0)
  })

  it('zooms on the wheel over the margin too, not only over the image', () => {
    const { image, margin } = open()
    fireEvent.wheel(margin, { deltaY: -40, deltaMode: 0, ...CENTRE })
    expect(viewport(image).scale).toBeGreaterThan(0.5)
  })

  it('pans on a drag once past fit, and not at fit', () => {
    const { image } = open()
    drag(image, CENTRE, { clientX: 400, clientY: 300 })
    // At fit the image overflows nothing, so there is nowhere to pan to.
    expect(viewport(image).offset).toEqual({ x: 0, y: 0 })

    fireEvent.click(image, { ...CENTRE, detail: 1 })
    drag(image, CENTRE, { clientX: 400, clientY: 300 })
    expect(viewport(image).offset).toEqual({ x: -100, y: -100 })
  })

  it('does not also zoom on the click that ends a drag', () => {
    const { image } = open()
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(viewport(image).scale).toBe(1)

    drag(image, CENTRE, { clientX: 400, clientY: 300 })
    expect(viewport(image).scale).toBe(1)
  })

  it('still counts a press that wobbled under four pixels as a click', () => {
    const { image } = open()
    drag(image, CENTRE, { clientX: 502, clientY: 401 })
    expect(viewport(image).scale).toBe(1)
  })

  it('says which gesture is available through the cursor', () => {
    const { image } = open()
    expect(image.className).toContain('cursor-zoom-in')

    // Between the two stops, which is where only a wheel can leave a reader.
    fireEvent.wheel(image, { deltaY: -40, deltaMode: 0, ...CENTRE })
    const between = viewport(image).scale
    expect(between).toBeGreaterThan(0.5)
    expect(between).toBeLessThan(1)
    expect(image.className).toContain('cursor-grab')

    fireEvent.pointerDown(image, { ...CENTRE, button: 0, pointerId: 1 })
    fireEvent.pointerMove(image, { clientX: 400, clientY: 300, pointerId: 1 })
    expect(image.className).toContain('cursor-grabbing')
    fireEvent.pointerUp(image, { clientX: 400, clientY: 300, pointerId: 1 })
    // The browser's click after a release, which a drag has spent.
    fireEvent.click(image, { ...CENTRE, detail: 1 })

    // Back to fit, then up to the stop, where the click is the way back and
    // is the thing worth advertising.
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(viewport(image).scale).toBe(1)
    expect(image.className).toContain('cursor-zoom-out')
  })
})

describe('CoverFigure, leaving', () => {
  it('closes on a click on the surrounding margin', () => {
    const { margin } = open()
    fireEvent.click(margin)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', () => {
    const { dialog } = open()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on the corner button, which is the only Close a reader can reach', () => {
    const { dialog } = open()
    const close = within(dialog).getAllByRole('button', { name: 'Close' })
    // The margin catcher is a button too, but it is `aria-hidden` and
    // unfocusable — announcing "Close" twice helps nobody.
    expect(close).toHaveLength(1)
    fireEvent.click(close[0]!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the corner button reachable at every scale, including the guard', () => {
    const { dialog, image, box } = open()
    // The wheel, not the click: the click has two stops and the top of the
    // range is above both of them.
    for (let push = 0; push < 40; push += 1) {
      fireEvent.wheel(image, { deltaY: -100, deltaMode: 0, ...CENTRE })
    }
    expect(viewport(image).scale).toBe(3)

    const close = within(dialog).getByRole('button', { name: 'Close' })
    // Outside the one box that clips, so a fully zoomed image cannot cover
    // it and no scale can scroll it away.
    expect(box.contains(close)).toBe(false)
    expect(close.className).not.toContain('opacity-0')
  })

  it('never closes on a click on the diagram itself', () => {
    const { image } = open()
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(screen.getByRole('dialog')).toBeDefined()
    doubleClick(image, CENTRE)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('reopens at fit rather than remembering the last zoom', () => {
    const { image, dialog } = open()
    fireEvent.click(image, { ...OFF_CENTRE, detail: 1 })
    expect(viewport(image).scale).toBe(1)
    expect(viewport(image).offset).not.toEqual({ x: 0, y: 0 })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    const reopened = within(screen.getByRole('dialog')).getByRole('img', {
      name: figure.alt,
    })
    // An unmeasured box fits at 1, which is the point: the scale and the pan
    // the reader had built up are gone, not carried over.
    expect(viewport(reopened)).toEqual({ scale: 1, offset: { x: 0, y: 0 } })
  })

  it('holds the page behind inert while the viewer is open', () => {
    const behind = document.createElement('main')
    document.body.append(behind)
    try {
      const { dialog } = open()
      /*
        `modal` is one flag with two effects in base-ui: it inerts everything
        outside the portal and it locks the page's scroll. jsdom lays nothing
        out, so the scroll lock has nothing to act on and only the inert half
        is observable — this asserts the flag through the half that is.
      */
      expect(behind.hasAttribute('data-base-ui-inert')).toBe(true)
      fireEvent.keyDown(dialog, { key: 'Escape' })
      expect(behind.hasAttribute('data-base-ui-inert')).toBe(false)
    } finally {
      behind.remove()
    }
  })
})

describe('CoverFigure motion', () => {
  it('tweens a discrete step over the existing micro token, and mints no new one', () => {
    const { image } = open()
    fireEvent.click(image, { ...CENTRE, detail: 1 })
    expect(image.className).toContain('transition-transform')
    // The token that already exists, not a sibling of it.
    expect(image.className).toContain('duration-(--motion-micro)')
    expect(image.className).not.toMatch(/duration-\[\d/)
  })

  it('does not tween a continuous gesture, because a tween there reads as lag', () => {
    const { image } = open()
    fireEvent.wheel(image, { deltaY: -40, deltaMode: 0, ...CENTRE })
    expect(image.className).not.toContain('transition-transform')
  })

  it('is instant under reduced motion, gesture or step', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const { image } = open()
      fireEvent.click(image, { ...CENTRE, detail: 1 })
      expect(viewport(image).scale).toBe(1)
      expect(image.className).not.toContain('transition-transform')
    } finally {
      window.matchMedia = matchMedia
    }
  })
})

describe('CoverFigure, by theme', () => {
  afterEach(() => {
    act(() => setTheme('light'))
  })

  const themed = { ...figure, srcDark: '/cover/example.dark.svg' }
  const shown = () =>
    screen
      .getByRole('button', { name: TRIGGER })
      .querySelector('img')
      ?.getAttribute('src')

  it('shows the light file in the light theme', () => {
    act(() => setTheme('light'))
    render(<CoverFigure figure={themed} />)
    expect(shown()).toBe('/cover/example.svg')
  })

  it('swaps to the dark file when the theme flips, and back', () => {
    act(() => setTheme('light'))
    render(<CoverFigure figure={themed} />)
    act(() => setTheme('dark'))
    expect(shown()).toBe('/cover/example.dark.svg')
    act(() => setTheme('light'))
    expect(shown()).toBe('/cover/example.svg')
  })

  it('opens the viewer on the file the page is showing', () => {
    act(() => setTheme('dark'))
    render(<CoverFigure figure={themed} />)
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    const opened = within(screen.getByRole('dialog')).getByRole('img', {
      name: figure.alt,
    })
    expect(opened.getAttribute('src')).toBe('/cover/example.dark.svg')
  })

  it('keeps the light file in the dark theme when no dark file exists yet', () => {
    act(() => setTheme('dark'))
    render(<CoverFigure figure={figure} />)
    expect(shown()).toBe('/cover/example.svg')
  })
})
