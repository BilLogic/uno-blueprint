// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAnimatedStructureSeam } from './useAnimatedStructureSeam'
import type { StructureSeam } from '@/contexts/EntityDetailContext'

vi.mock('framer-motion', () => ({
  animate: (_from: number, _to: number, options: { onUpdate: (value: number) => void }) => {
    options.onUpdate(0.5)
    return { stop: vi.fn() }
  },
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--structure-seam-progress')
  delete document.documentElement.dataset.structureMotion
})

it.each(['stacked', 'merged'])('keeps %s seam progress on its own scenario', (layout) => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('CSS', {escape: (value: string) => value})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const target: StructureSeam = {kind:'lane', pathId:'two', centered:true, atPosition:1, size:34, key:'lane:two:1'}
  function Projection() {
    useAnimatedStructureSeam(target, false)
    return null
  }
  const view = render(<>
    <section data-focus-slide-id="other" />
    <section data-focus-slide-id="active">
      <div {...(layout === 'stacked' ? {'data-structure-path':'two'} : {'data-structure-paths':'one two'})} />
      <Projection />
    </section>
  </>)
  act(() => {
    frames.shift()!(0)
    frames.shift()!(16)
  })
  expect(view.container.querySelector<HTMLElement>('[data-focus-slide-id="active"]')!.style.getPropertyValue('--structure-seam-progress')).toBe('0.5')
  expect(view.container.querySelector<HTMLElement>('[data-focus-slide-id="other"]')!.style.getPropertyValue('--structure-seam-progress')).toBe('')
  expect(document.documentElement.style.getPropertyValue('--structure-seam-progress')).toBe('')
})
