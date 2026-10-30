// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { registerCanvasStructureReorder } from './canvasStructureReorder'

const springs = vi.hoisted(() => [] as Array<{ onUpdate: (value: number) => void; onComplete: () => void }>)
vi.mock('framer-motion', () => ({
  animate: (subject: HTMLElement | number, target: Record<string, string> | number, options: { onUpdate: (value: number) => void; onComplete: () => void }) => {
    if (typeof subject === 'number') springs.push(options)
    else Object.assign(subject.style, target)
    return { stop: vi.fn(), cancel: vi.fn() }
  },
}))
afterEach(() => { document.body.replaceChildren(); springs.length = 0; vi.restoreAllMocks() })

it.each(['lane', 'step'] as const)('returns repeated %s pulls from their real released position on one spring', (kind) => {
  const body = document.createElement('div')
  document.body.append(body)
  const items = ['one', 'two'].map((id, i) => {
    const node = document.createElement('button')
    node.dataset.structureReorder = kind
    node.dataset.structureId = id
    body.append(node)
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(kind === 'step' ? i * 100 : 0, kind === 'lane' ? i * 100 : 0, 100, 100))
    return { id, name: id, parts: [node] }
  })
  const save = vi.fn()
  const dispose = registerCanvasStructureReorder(body, { items: () => items, scale: () => 1, save })
  const pointer = (type: string, at: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: kind === 'step' ? at : 25, clientY: kind === 'lane' ? at : 25 })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    return event
  }
  const offset = () => Number.parseFloat(items[0].parts[0].style.translate.split(' ')[kind === 'step' ? 0 : 1])
  for (const end of [400, 700]) {
    items[0].parts[0].dispatchEvent(pointer('pointerdown', 25))
    document.dispatchEvent(pointer('pointermove', end))
    const released = offset()
    document.dispatchEvent(pointer('pointerup', end))
    expect(springs).toHaveLength(end === 400 ? 1 : 2)
    const spring = springs.at(-1)!
    spring.onUpdate(0)
    if (end === 700) {
      springs[0].onUpdate(1)
      springs[0].onComplete()
      expect(body.dataset.structureSettling).toBe('')
    }
    expect(offset()).toBeCloseTo(released)
    spring.onUpdate(0.5)
    expect(offset()).toBeCloseTo(released / 2)
    spring.onUpdate(1)
    expect(offset()).toBe(0)
    spring.onComplete()
    expect(items[0].parts[0].style.translate).toBe('')
    expect(body.dataset.structureSettling).toBeUndefined()
  }
  expect(save).not.toHaveBeenCalled()
  dispose()
})
