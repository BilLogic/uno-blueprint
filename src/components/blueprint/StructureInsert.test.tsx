// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StructureInsert } from './StructureInsert'
beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.spyOn(
    HTMLButtonElement.prototype,
    'getBoundingClientRect',
  ).mockImplementation(function (this: HTMLButtonElement) {
    return this.getAttribute('aria-label') === 'Add a lane'
      ? new DOMRect(0, 78, 300, 44)
      : new DOMRect(78, 0, 44, 300)
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('opens the whole seam after its hover delay and closes after the leave delay', () => {
  vi.useFakeTimers()
  const part = vi.fn()
  const create = vi.fn()
  render(
    <StructureInsert
      orientation="vertical"
      label="Add a step after Review"
      onClick={create}
      onOpenChange={part}
    />,
  )
  const seam = screen.getByRole('button', { name: 'Add a step after Review' })
  fireEvent.pointerEnter(seam, { clientX: 100, clientY: 40 })
  act(() => vi.advanceTimersByTime(89))
  expect(seam.getAttribute('data-open')).toBeNull()
  act(() => vi.advanceTimersByTime(1))
  expect(seam.hasAttribute('data-open')).toBe(true)
  expect(part).toHaveBeenLastCalledWith(true)
  fireEvent.click(seam)
  expect(create).toHaveBeenCalledWith(seam)
  fireEvent.pointerLeave(seam)
  act(() => vi.advanceTimersByTime(74))
  expect(seam.hasAttribute('data-open')).toBe(true)
  act(() => vi.advanceTimersByTime(1))
  expect(seam.getAttribute('data-open')).toBeNull()
})

it('scales the visible slot with the board while retaining a usable detection band', () => {
  render(
    <StructureInsert
      orientation="vertical"
      label="Add a step"
      scale={0.25}
      style={{ left: 120 }}
      onClick={() => {}}
    />,
  )
  const seam = screen.getByRole('button', { name: 'Add a step' })
  expect(seam.style.width).toBe('176px')
  fireEvent.focus(seam)
  expect(seam.style.left).toBe('120px')
  expect(seam.style.width).toBe('176px')
  expect(
    seam.querySelector<HTMLElement>('[data-structure-slot]')?.style.width,
  ).toBe('28px')
  expect(seam.className).not.toContain('-translate-x-1/2')
})

it('keeps a keyboard-focused slot open when revealing it moves the pointer outside', () => {
  vi.useFakeTimers()
  render(
    <StructureInsert
      orientation="vertical"
      label="Add a step"
      onClick={() => {}}
    />,
  )
  const seam = screen.getByRole('button', { name: 'Add a step' })
  act(() => seam.focus())
  fireEvent.pointerLeave(seam)
  act(() => vi.advanceTimersByTime(200))
  expect(seam.hasAttribute('data-open')).toBe(true)
})

it.each(['vertical', 'horizontal'] as const)(
  'keeps the %s seam in control while crossing the other axis',
  (orientation) => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', MouseEvent)
    const createStep = vi.fn()
    const createLane = vi.fn()
    const { container } = render(
      <div data-structure-board="">
        <StructureInsert
          orientation="vertical"
          label="Add a step"
          onClick={createStep}
        />
        <StructureInsert
          orientation="horizontal"
          label="Add a lane"
          onClick={createLane}
        />
      </div>,
    )
    const step = screen.getByRole('button', { name: 'Add a step' })
    const lane = screen.getByRole('button', { name: 'Add a lane' })
    const active = orientation === 'vertical' ? step : lane
    const crossing = orientation === 'vertical' ? lane : step
    const create = orientation === 'vertical' ? createStep : createLane
    fireEvent.pointerEnter(
      active,
      orientation === 'vertical'
        ? { clientX: 100, clientY: 40 }
        : { clientX: 40, clientY: 100 },
    )
    act(() => vi.advanceTimersByTime(90))
    fireEvent.pointerLeave(active, { clientX: 100, clientY: 100 })
    fireEvent.pointerEnter(crossing, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container.firstElementChild!, {
      clientX: 100,
      clientY: 100,
    })
    act(() => vi.advanceTimersByTime(300))
    expect(active.hasAttribute('data-open')).toBe(true)
    expect(crossing.hasAttribute('data-open')).toBe(false)
    fireEvent.click(crossing, { clientX: 100, clientY: 100 })
    expect(create).toHaveBeenCalledWith(active)
    const outside =
      orientation === 'vertical'
        ? { clientX: 150, clientY: 100 }
        : { clientX: 100, clientY: 150 }
    fireEvent.pointerMove(container.firstElementChild!, outside)
    act(() => vi.advanceTimersByTime(90))
    expect(active.hasAttribute('data-open')).toBe(false)
    expect(crossing.hasAttribute('data-open')).toBe(true)
    vi.unstubAllGlobals()
  },
)

it('chooses the nearest boundary at a fresh crossing instead of the painted target', () => {
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', MouseEvent)
  render(
    <div data-structure-board="">
      <StructureInsert
        orientation="vertical"
        label="Add a step"
        onClick={() => {}}
      />
      <StructureInsert
        orientation="horizontal"
        label="Add a lane"
        onClick={() => {}}
      />
    </div>,
  )
  const step = screen.getByRole('button', { name: 'Add a step' })
  const lane = screen.getByRole('button', { name: 'Add a lane' })
  fireEvent.pointerEnter(lane, { clientX: 100, clientY: 116 })
  act(() => vi.advanceTimersByTime(90))
  expect(step.hasAttribute('data-open')).toBe(true)
  expect(lane.hasAttribute('data-open')).toBe(false)
})

it('leaves a header button usable inside the larger detection band', () => {
  vi.useFakeTimers()
  render(
    <div data-structure-board="">
      <StructureInsert
        orientation="vertical"
        label="Add a step"
        onClick={() => {}}
      />
      <button type="button" data-canvas-header-opener="">
        Review
      </button>
    </div>,
  )
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Add a step' }), {
    clientX: 100,
    clientY: 40,
  })
  act(() => vi.advanceTimersByTime(40))
  fireEvent.pointerMove(screen.getByRole('button', { name: 'Review' }), {
    clientX: 100,
    clientY: 40,
  })
  act(() => vi.advanceTimersByTime(100))
  expect(
    screen
      .getByRole('button', { name: 'Add a step' })
      .hasAttribute('data-open'),
  ).toBe(false)
})

it('keeps an edge slot open across its visible extension', () => {
  vi.useFakeTimers()
  const { container } = render(
    <div data-structure-board="">
      <StructureInsert
        edge
        orientation="vertical"
        label="Add a step"
        onClick={() => {}}
      />
    </div>,
  )
  const seam = screen.getByRole('button', { name: 'Add a step' })
  const slot = seam.querySelector('[data-structure-slot]')!
  vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 0, 34, 300),
  )
  fireEvent.pointerEnter(seam, { clientX: 100, clientY: 40 })
  act(() => vi.advanceTimersByTime(90))
  fireEvent.pointerMove(container.firstElementChild!, {
    clientX: 130,
    clientY: 40,
  })
  act(() => vi.advanceTimersByTime(200))
  expect(seam.hasAttribute('data-open')).toBe(true)
})

it('keeps the entry axis while its opening delay is still running', () => {
  vi.useFakeTimers()
  const { container } = render(
    <div data-structure-board="">
      <StructureInsert
        orientation="vertical"
        label="Add a step"
        onClick={() => {}}
      />
      <StructureInsert
        orientation="horizontal"
        label="Add a lane"
        onClick={() => {}}
      />
    </div>,
  )
  const lane = screen.getByRole('button', { name: 'Add a lane' })
  fireEvent.pointerEnter(lane, { clientX: 40, clientY: 100 })
  act(() => vi.advanceTimersByTime(40))
  fireEvent.pointerMove(container.firstElementChild!, {
    clientX: 100,
    clientY: 100,
  })
  act(() => vi.advanceTimersByTime(50))
  expect(lane.hasAttribute('data-open')).toBe(true)
  expect(
    screen
      .getByRole('button', { name: 'Add a step' })
      .hasAttribute('data-open'),
  ).toBe(false)
})

it.each([0, 90])(
  'leaves canvas cell controls available after %ims outside the header detection band',
  (delay) => {
    vi.useFakeTimers()
    vi.mocked(HTMLButtonElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLButtonElement) {
      return this.hasAttribute('data-structure-seam')
        ? new DOMRect(78, 0, 44, 40)
        : new DOMRect(78, 40, 44, 260)
    })
    const create = vi.fn(),
      cell = vi.fn()
    render(
      <div data-structure-board="">
        <StructureInsert
          orientation="vertical"
          label="Add a step"
          onClick={create}
        />
        <button type="button" onClick={cell}>
          Add a cell
        </button>
      </div>,
    )
    const control = screen.getByRole('button', { name: 'Add a cell' })
    fireEvent.pointerMove(control, { clientX: 100, clientY: 100 })
    expect(
      control.parentElement!.hasAttribute('data-structure-insert-hover'),
    ).toBe(false)
    act(() => vi.advanceTimersByTime(delay))
    const seam = screen.getByRole('button', { name: 'Add a step' })
    expect(seam.hasAttribute('data-open')).toBe(false)
    fireEvent.click(control, { clientX: 100, clientY: 100 })
    expect(create).not.toHaveBeenCalled()
    expect(cell).toHaveBeenCalledOnce()
  },
)

it.each(['horizontal', 'vertical'] as const)('keeps the %s preview and its icon proportional at different zoom levels', orientation => {
  for (const scale of [0.25, 0.5, 1]) {
    const {unmount}=render(<StructureInsert orientation={orientation} scale={scale} label="Add an item" onClick={() => {}} />)
    const target=screen.getByRole('button',{name:'Add an item'})
    fireEvent.focus(target)
    const axis=orientation === 'horizontal' ? 'height' : 'width'
    expect(target.style[axis]).toBe(`${44 / scale}px`)
    expect(target.querySelector<HTMLElement>('[data-structure-slot]')!.style[axis]).toBe('28px')
    expect(target.querySelector<SVGElement>('svg')!.style.width).toBe('16px')
    unmount()
  }
})

it.each([
  { orientation: 'horizontal', coordinate: 128, opens: false },
  { orientation: 'horizontal', coordinate: 88, opens: true },
  { orientation: 'vertical', coordinate: 128, opens: false },
  { orientation: 'vertical', coordinate: 88, opens: true },
] as const)(
  'protects $orientation header interiors while preserving the edge band at $coordinate', ({ orientation, coordinate, opens }) => {
    vi.useFakeTimers()
    const lane = orientation === 'horizontal'
    render(<div data-structure-board="" data-axis-highlight="lane">
      <StructureInsert orientation={orientation} label="Add an item" onClick={() => {}} />
      <div data-structure-header-cell={lane ? '' : undefined} data-structure-lane-label={lane ? '' : undefined} data-blueprint-column-header={lane ? undefined : ''}><span>Header background</span></div>
    </div>)
    const target = screen.getByRole('button', { name: 'Add an item' })
    const background = screen.getByText('Header background')
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(lane ? new DOMRect(0, 78, 300, 88) : new DOMRect(78, 0, 88, 300))
    vi.spyOn(background.parentElement!, 'getBoundingClientRect').mockReturnValue(lane ? new DOMRect(0, 78, 300, 100) : new DOMRect(78, 0, 100, 300))
    const point = lane ? { clientX: 40, clientY: coordinate } : { clientX: coordinate, clientY: 40 }
    fireEvent.pointerEnter(target, point)
    act(() => vi.advanceTimersByTime(40))
    fireEvent.pointerMove(background, point)
    act(() => vi.advanceTimersByTime(120))
    expect(target.hasAttribute('data-open')).toBe(opens)
    expect(background.closest('[data-structure-board]')?.getAttribute('data-axis-highlight')).toBe(opens ? null : 'lane')
  },
)
