// @vitest-environment jsdom
import { useRef } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useStructureDraftCamera } from './useStructureDraftCamera'
const state = vi.hoisted(() => ({
  context: {
    selection: { draft: { kind: 'step' }, draftKey: 'draft' } as {
      draft?: { kind: string }
      draftKey: string
    },
    preview: {
      kind: 'step',
      name: 'New step',
      orders: [{ pathId: 'one', order: ['new', 'one'] }],
    },
    draftBoard: { current: null as HTMLElement | null },
  },
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetailOptional: () => state.context,
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it.each(['canvas-camera-gesture', 'canvas-camera-change'])('does not re-pan for text edits or restore after %s', (eventName) => {
  state.context.selection = {draft: {kind: 'step'}, draftKey: 'draft'}
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.push(fn)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute('data-structure-placeholder')
        ? new DOMRect(850, 100, 200, 100)
        : this.hasAttribute('data-cell-detail-panel')
        ? new DOMRect(800, 0, 300, 800)
        : new DOMRect(0, 0, 1100, 800)
    },
  )
  const pan = vi.fn()
  function Board() {
    const ref = useRef<HTMLDivElement>(null)
    useStructureDraftCamera(ref, pan, true)
    return (
      <div data-zoom-pan-viewport="">
        <div ref={ref}>
          <div
            ref={(el) => {
              state.context.draftBoard.current = el
            }}
          >
            <div data-structure-placeholder="" />
          </div>
        </div>
        <aside data-cell-detail-panel="" />
      </div>
    )
  }
  const view = render(<Board />)
  act(() => frames.splice(0).forEach((fn) => fn(0)))
  expect(pan).toHaveBeenCalledTimes(1)
  state.context.preview = { ...state.context.preview, name: 'Typed letter' }
  view.rerender(<Board />)
  act(() => frames.splice(0).forEach((fn) => fn(16)))
  expect(pan).toHaveBeenCalledTimes(1)
  view.container.querySelector('[data-zoom-pan-viewport]')!.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      detail: { clientX: 600, clientY: 300 },
    }),
  )
  state.context.preview = {
    ...state.context.preview,
    orders: [{ pathId: 'one', order: ['one', 'new'] }],
  }
  view.rerender(<Board />)
  act(() => frames.splice(0).forEach((fn) => fn(24)))
  expect(pan).toHaveBeenCalledTimes(1)
  state.context.selection = { draftKey: 'draft' }
  view.rerender(<Board />)
  act(() => frames.splice(0).forEach((fn) => fn(32)))
  expect(pan).toHaveBeenCalledTimes(1)
})
