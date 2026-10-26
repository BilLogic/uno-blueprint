// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
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
})

it.each(
  [1, 0.25].flatMap((scale) =>
    [0, 1].flatMap((source) => [0, 16].map((gap) => ({ scale, source, gap })))
  )
)(
  'keeps unequal lane sizes in the projected order: $scale, source $source, gap $gap',
  ({ scale, source, gap }) => {
    const body = document.createElement('div')
    document.body.append(body)
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400 * scale, (400 + gap * 2) * scale)
    )
    const items = ['tall', 'short', 'last'].map((id, index) => {
      const header = document.createElement('button')
      header.dataset.structureReorder = 'lane'
      header.dataset.structureId = id
      body.append(header)
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(
          0,
          [0, 200 + gap, 300 + gap * 2][index] * scale,
          400 * scale,
          (index === 0 ? 200 : 100) * scale
        )
      )
      return { id, name: id, parts: [header] }
    })
    const save = vi.fn()
    const dispose = registerCanvasStructureReorder(body, {
      items: () => items,
      scale: () => scale,
      save,
    })
    const pointer = (type: string, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 20 * scale,
        clientY: y * scale,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    }
    const from = source === 0 ? 100 : 250 + gap
    const to = source === 0 ? 250 + gap : 100
    items[source].parts[0].dispatchEvent(pointer('pointerdown', from))
    document.dispatchEvent(pointer('pointermove', to))
    const landing = body.querySelector<HTMLElement>('[data-structure-landing]')!
    expect(landing.style.top).toBe(`${source === 0 ? 100 + gap : 0}px`)
    expect(landing.style.height).toBe(`${source === 0 ? 200 : 100}px`)
    expect(items[1 - source].parts[0].style.translate).toBe(
      `0px ${source === 0 ? -200 - gap : 100 + gap}px`
    )
    document.dispatchEvent(pointer('pointerup', to))
    expect(save).toHaveBeenCalledExactlyOnceWith(
      'lane',
      items[source].id,
      ['short', 'tall', 'last'],
      ['tall', 'short', 'last']
    )
    dispose()
  }
)
