// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAnimatedStructureDraft } from './useAnimatedStructureDraft'

const playback = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
vi.mock('framer-motion', () => ({
  animate: (
    _from: number,
    _to: number,
    options: { onUpdate: (value: number) => void },
  ) => {
    playback.start()
    options.onUpdate(0.5)
    return { stop: playback.stop }
  },
}))
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  delete document.documentElement.dataset.structureMotion
})
function fixture() {
  const scope = document.createElement('section')
  scope.dataset.focusSlideId = 'active'
  const board = document.createElement('div')
  scope.append(board)
  document.body.append(scope)
  return { scope, board: { current: board } }
}
it('waits for path metadata and committed layout, then confines draft progress to its scenario', () => {
  const { scope, board } = fixture(),
    frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  function Projection({ ready }: { ready: boolean }) {
    useAnimatedStructureDraft(1, board, ready)
    return null
  }
  const view = render(<Projection ready={false} />)
  expect(playback.start).not.toHaveBeenCalled()
  expect(scope.style.getPropertyValue('--structure-draft-progress')).toBe('0')
  view.rerender(<Projection ready />)
  expect(playback.start).not.toHaveBeenCalled()
  act(() => {
    frames.shift()!(0)
    frames.shift()!(16)
  })
  expect(scope.style.getPropertyValue('--structure-draft-progress')).toBe('0.5')
  expect(
    document.documentElement.style.getPropertyValue(
      '--structure-draft-progress',
    ),
  ).toBe('')
  view.unmount()
  expect(playback.stop).toHaveBeenCalledOnce()
  expect(document.documentElement.hasAttribute('data-structure-motion')).toBe(
    false,
  )
})
it('honours reduced motion without leaving a partial draft or motion lock', () => {
  const { scope, board } = fixture()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  function Projection() {
    useAnimatedStructureDraft(1, board, true)
    return null
  }
  render(<Projection />)
  expect(scope.style.getPropertyValue('--structure-draft-progress')).toBe('1')
  expect(playback.start).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-structure-motion')).toBe(
    false,
  )
})
