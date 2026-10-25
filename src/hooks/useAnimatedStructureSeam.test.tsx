// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAnimatedStructureSeam } from './useAnimatedStructureSeam'
import type { StructureSeam } from '@/contexts/EntityDetailContext'

const animation = vi.hoisted(() => vi.fn())
vi.mock('framer-motion', () => ({
  animate: (
    from: number,
    to: number,
    options: { onUpdate: (value: number) => void },
  ) => {
    animation(from, to, options)
    options.onUpdate(0.5)
    return { stop: vi.fn() }
  },
}))
afterEach(() => {
  cleanup()
  animation.mockClear()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--structure-seam-progress')
  delete document.documentElement.dataset.structureMotion
})

it.each(['stacked', 'merged'])(
  'keeps %s seam progress on its own scenario',
  (layout) => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const target: StructureSeam = {
      kind: 'lane',
      pathId: 'two',
      centered: true,
      atPosition: 1,
      size: 34,
      key: 'lane:two:1',
    }
    function Projection() {
      useAnimatedStructureSeam(target, false)
      return null
    }
    const view = render(
      <>
        <section data-focus-slide-id="other" />
        <section data-focus-slide-id="active">
          <div
            {...(layout === 'stacked'
              ? { 'data-structure-path': 'two' }
              : { 'data-structure-paths': 'one two' })}
          />
          <Projection />
        </section>
      </>,
    )
    act(() => {
      frames.shift()!(0)
      frames.shift()!(16)
    })
    expect(
      view.container
        .querySelector<HTMLElement>('[data-focus-slide-id="active"]')!
        .style.getPropertyValue('--structure-seam-progress'),
    ).toBe('0.5')
    expect(
      view.container
        .querySelector<HTMLElement>('[data-focus-slide-id="other"]')!
        .style.getPropertyValue('--structure-seam-progress'),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--structure-seam-progress',
      ),
    ).toBe('')
  },
)

function motionFixture() {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const target: StructureSeam = {
    kind: 'lane',
    pathId: 'two',
    centered: true,
    atPosition: 1,
    size: 36,
    key: 'first',
  }
  function Projection({ target }: { target: StructureSeam | null }) {
    const visible = useAnimatedStructureSeam(target, false)
    return <output>{visible?.key}</output>
  }
  const tree = (target: StructureSeam | null) => (
    <section data-focus-slide-id="active">
      <div data-structure-path="two" />
      <Projection target={target} />
    </section>
  )
  const view = render(tree(target))
  const flush = () =>
    act(() => {
      frames.shift()!(0)
      frames.shift()!(16)
    })
  flush()
  return { target, view, tree, flush }
}
it('does not restart the closing clock when the next destination changes', () => {
  const { target, view, tree, flush } = motionFixture()
  view.rerender(tree(null))
  flush()
  const closing = animation.mock.calls[1][2]
  act(() => closing.onUpdate(0.6))
  view.rerender(tree({ ...target, key: 'second', atPosition: 2 }))
  expect(animation).toHaveBeenCalledTimes(2)
  act(() => closing.onComplete())
  flush()
  expect(animation).toHaveBeenCalledTimes(3)
  expect(view.getByRole('status').textContent).toBe('second')
})
it('uses the remaining distance when reversing an unfinished opening', () => {
  const { view, tree, flush } = motionFixture()
  view.rerender(tree(null))
  flush()
  expect(animation.mock.calls[1][0]).toBe(0.5)
  expect(animation.mock.calls[1][2].duration).toBeCloseTo(0.12)
})

it('does not restart an opening for a fresh object with the same seam identity', () => {
  const { target, view, tree } = motionFixture()
  view.rerender(tree({ ...target }))
  expect(animation).toHaveBeenCalledTimes(1)
})
