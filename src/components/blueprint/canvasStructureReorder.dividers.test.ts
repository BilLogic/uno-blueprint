// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
} from '@/lib/laneRoles'
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

type LaneSpec = {
  id: string
  role: string
  top: number
  height: number
}

/**
 * Stacked lanes with semantic divider rows between bands. Divider tops sit
 * immediately after the preceding lane's measured box.
 */
function mountBoard(
  lanes: LaneSpec[],
  dividers: { kind: string; top: number }[],
) {
  const body = document.createElement('div')
  document.body.append(body)
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 800),
  )
  const items = lanes.map((lane) => {
    const header = document.createElement('button')
    header.dataset.structureReorder = 'lane'
    header.dataset.structureId = lane.id
    const row = document.createElement('div')
    row.dataset.blueprintRow = ''
    row.dataset.laneId = lane.id
    body.append(header, row)
    const box = new DOMRect(0, lane.top, 400, lane.height)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(box)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(box)
    return {
      id: lane.id,
      name: lane.id,
      role: lane.role,
      parts: [header, row],
    }
  })
  const nodes = dividers.map((divider) => {
    const node = document.createElement('div')
    node.dataset.blueprintDivider = divider.kind
    node.setAttribute('role', 'separator')
    body.append(node)
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, divider.top, 400, 28),
    )
    return node
  })
  return { body, items, nodes }
}

/** @param y Pointer Y in the same coordinate space as the mounted boxes. */
function pointer(type: string, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 20,
    clientY: y,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

it('keeps both lines fixed when two recipient lanes swap', () => {
  const { body, items, nodes } = mountBoard(
    [
      { id: 'r1', role: CUSTOMER_ACTIONS_ROLE, top: 0, height: 100 },
      { id: 'r2', role: CUSTOMER_ACTIONS_ROLE, top: 100, height: 100 },
      { id: 'r3', role: CUSTOMER_ACTIONS_ROLE, top: 200, height: 100 },
      { id: 'f1', role: FRONTSTAGE_ACTIONS_ROLE, top: 328, height: 100 },
      { id: 'b1', role: BACKSTAGE_ACTIONS_ROLE, top: 456, height: 100 },
    ],
    [
      { kind: 'interaction', top: 300 },
      { kind: 'visibility', top: 428 },
    ],
  )
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    scale: () => 1,
    save: vi.fn(),
  })
  items[1]!.parts[0]!.dispatchEvent(pointer('pointerdown', 150))
  document.dispatchEvent(pointer('pointermove', 250))
  expect(nodes[0]!.style.translate).toBe('0px 0px')
  expect(nodes[1]!.style.translate).toBe('0px 0px')
  dispose()
})

it('keeps the line fixed when the pointer tries to cross it', () => {
  const { body, items, nodes } = mountBoard(
    [
      { id: 'r1', role: CUSTOMER_ACTIONS_ROLE, top: 0, height: 100 },
      { id: 'r2', role: CUSTOMER_ACTIONS_ROLE, top: 100, height: 100 },
      { id: 'r3', role: CUSTOMER_ACTIONS_ROLE, top: 200, height: 100 },
      { id: 'f1', role: FRONTSTAGE_ACTIONS_ROLE, top: 328, height: 100 },
    ],
    [{ kind: 'interaction', top: 300 }],
  )
  const save = vi.fn()
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    scale: () => 1,
    save,
  })
  items[2]!.parts[0]!.dispatchEvent(pointer('pointerdown', 250))
  document.dispatchEvent(pointer('pointermove', 380))
  expect(nodes[0]!.style.translate).toBe('')
  expect(body.dataset.structureBan).toBe('')
  expect(
    items[3]!.parts.some((part) => part.dataset.structureForeign !== undefined),
  ).toBe(true)
  // The row resists at the divider instead of following into another section.
  const liftTranslate = items[2]!.parts[0]!.style.translate
  const liftY = Number.parseFloat(liftTranslate.replace(/^0px\s+/, '')) || 0
  expect(liftY).toBeGreaterThan(0)
  expect(liftY).toBeLessThan(16)
  const landing = body.querySelector<HTMLElement>('[data-structure-landing]')
  expect(landing?.dataset.structureLandingBan).toBe('')
  expect(landing?.style.opacity).not.toBe('0')
  document.dispatchEvent(pointer('pointerup', 380))
  expect(save).not.toHaveBeenCalled()
  dispose()
})

it('leaves the line fixed when the last recipient lane moves up within its band', () => {
  const { body, items, nodes } = mountBoard(
    [
      { id: 'r1', role: CUSTOMER_ACTIONS_ROLE, top: 0, height: 100 },
      { id: 'r2', role: CUSTOMER_ACTIONS_ROLE, top: 100, height: 100 },
      { id: 'r3', role: CUSTOMER_ACTIONS_ROLE, top: 200, height: 100 },
      { id: 'f1', role: FRONTSTAGE_ACTIONS_ROLE, top: 328, height: 100 },
    ],
    [{ kind: 'interaction', top: 300 }],
  )
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    scale: () => 1,
    save: vi.fn(),
  })
  items[2]!.parts[0]!.dispatchEvent(pointer('pointerdown', 250))
  document.dispatchEvent(pointer('pointermove', 150))
  expect(nodes[0]!.style.translate).toBe('0px 0px')
  expect(body.dataset.structureBan).toBeUndefined()
  dispose()
})

it('restores divider start positions on cancel', () => {
  const { body, items, nodes } = mountBoard(
    [
      { id: 'r1', role: CUSTOMER_ACTIONS_ROLE, top: 0, height: 100 },
      { id: 'r2', role: CUSTOMER_ACTIONS_ROLE, top: 100, height: 100 },
      { id: 'r3', role: CUSTOMER_ACTIONS_ROLE, top: 200, height: 100 },
      { id: 'f1', role: FRONTSTAGE_ACTIONS_ROLE, top: 328, height: 100 },
    ],
    [{ kind: 'interaction', top: 300 }],
  )
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    scale: () => 1,
    save: vi.fn(),
  })
  items[2]!.parts[0]!.dispatchEvent(pointer('pointerdown', 250))
  document.dispatchEvent(pointer('pointermove', 150))
  expect(nodes[0]!.style.translate).toBe('0px 0px')
  items[2]!.parts[0]!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  expect(nodes[0]!.style.translate).toBe('')
  dispose()
})

it('does not move divider nodes when reordering steps', () => {
  const body = document.createElement('div')
  document.body.append(body)
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 100),
  )
  const divider = document.createElement('div')
  divider.dataset.blueprintDivider = 'interaction'
  body.append(divider)
  const items = ['one', 'two'].map((id, index) => {
    const header = document.createElement('button')
    header.dataset.structureReorder = 'step'
    header.dataset.structureId = id
    const column = document.createElement('div')
    body.append(header, column)
    const box = new DOMRect(index * 100, 0, 100, 80)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(box)
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(box)
    return { id, name: id, parts: [header, column] }
  })
  const dispose = registerCanvasStructureReorder(body, {
    items: (kind) => (kind === 'step' ? items : []),
    scale: () => 1,
    save: vi.fn(),
  })
  items[0]!.parts[0]!.dispatchEvent(
    (() => {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 20,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    })(),
  )
  document.dispatchEvent(
    (() => {
      const event = new MouseEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: 140,
        clientY: 20,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    })(),
  )
  expect(divider.style.translate).toBe('')
  dispose()
})
