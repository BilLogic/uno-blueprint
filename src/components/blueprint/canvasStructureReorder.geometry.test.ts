// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { animate } from 'framer-motion'
import * as motion from '@/lib/motion'
import { registerCanvasStructureReorder } from './canvasStructureReorder'

vi.mock('framer-motion', () => ({
  animate: vi.fn((node: HTMLElement, values: Record<string, string>) => {
    Object.assign(node.style, values)
    return { stop: vi.fn(), cancel: vi.fn() }
  }),
}))
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it.each(
  [false, true].flatMap((reduced) =>
    (['lane', 'step'] as const).flatMap((kind) =>
      [1, 0.25].flatMap((scale) =>
        [0, 1, 2].flatMap((source) =>
          [0, 16].map((gap) => ({ kind, scale, source, gap, reduced })),
        ),
      ),
    ),
  ),
)(
  'projects unequal $kind extents including the last item: $scale, source $source, gap $gap, reduced $reduced',
  ({ kind, scale, source, gap, reduced }) => {
    vi.spyOn(motion, 'prefersReducedMotion').mockReturnValue(reduced)
    const body = document.createElement('div')
    document.body.append(body)
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, (400 + gap * 2) * scale, (400 + gap * 2) * scale),
    )
    const starts = [0, 200 + gap, 300 + gap * 2]
    const items = ['tall', 'short', 'last'].map((id, index) => {
      const header = document.createElement('button')
      header.dataset.structureReorder = kind
      header.dataset.structureId = id
      body.append(header)
      const start = starts[index] * scale
      const extent = (index === 0 ? 200 : 100) * scale
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(
        kind === 'step'
          ? new DOMRect(start, 0, extent, 400 * scale)
          : new DOMRect(0, start, 400 * scale, extent),
      )
      return { id, name: id, parts: [header] }
    })
    const save = vi.fn()
    const dispose = registerCanvasStructureReorder(body, {
      items: () => items,
      scale: () => scale,
      save,
    })
    const pointer = (type: string, position: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: (kind === 'step' ? position : 20) * scale,
        clientY: (kind === 'lane' ? position : 20) * scale,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    }
    const from = [100, 250 + gap, 350 + gap * 2][source]
    const to = source === 0 ? 350 + gap * 2 : 100
    items[source].parts[0].dispatchEvent(pointer('pointerdown', from))
    document.dispatchEvent(pointer('pointermove', to))
    const lifted = items[source].parts[0].style.translate.split(' ').map(parseFloat)
    const displacement = lifted[kind === 'step' ? 0 : 1]
    const liftedStart = starts[source] + displacement
    const liftedEnd = liftedStart + (source === 0 ? 200 : 100)
    expect(liftedStart).toBeGreaterThanOrEqual(0)
    expect(liftedEnd).toBeLessThanOrEqual(400 + gap * 2)
    const landing = body.querySelector<HTMLElement>('[data-structure-landing]')!
    const position = kind === 'step' ? 'left' : 'top'
    const extent = kind === 'step' ? 'width' : 'height'
    expect(landing.style[position]).toBe(
      `${source === 0 ? 200 + gap * 2 : 0}px`,
    )
    expect(landing.style[extent]).toBe(`${source === 0 ? 200 : 100}px`)
    const offsets =
      source === 0
        ? [200 + gap * 2, -200 - gap, -200 - gap]
        : source === 1
        ? [100 + gap, -200 - gap, 0]
        : [100 + gap, 100 + gap, -300 - gap * 2]
    for (const [index, item] of items.entries()) {
      if (index === source) continue
      expect(item.parts[0].style.translate).toBe(
        kind === 'step' ? `${offsets[index]}px 0px` : `0px ${offsets[index]}px`,
      )
    }
    const calls = vi.mocked(animate).mock.calls
    const glide = calls.find(([node]) => node === landing)!
    expect(glide).toBeDefined()
    expect(glide[2]).toEqual({
      duration: reduced ? 0 : motion.MOTION_STRUCTURAL_MS / 1000,
      ease: motion.EASE_POINTS.move,
    })
    // Staying within one destination must not restart its glide or neighbours.
    const count = calls.length
    document.dispatchEvent(pointer('pointermove', to + 1))
    expect(vi.mocked(animate).mock.calls).toHaveLength(count)
    document.dispatchEvent(pointer('pointerup', to))
    expect(save).toHaveBeenCalledExactlyOnceWith(
      kind,
      items[source].id,
      source === 0
        ? ['short', 'last', 'tall']
        : source === 1
        ? ['short', 'tall', 'last']
        : ['last', 'tall', 'short'],
      ['tall', 'short', 'last'],
    )
    dispose()
  },
)
