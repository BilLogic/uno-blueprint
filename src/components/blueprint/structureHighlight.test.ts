// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { highlightStructure } from './structureHighlight'
afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('washes every step track including empty slots', () => {
  vi.stubGlobal('CSS', { escape: (s: string) => s })
  const board = document.createElement('div')
  board.dataset.structureBoard = ''
  document.body.append(board)
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 600, 800),
  )
  const source = document.createElement('div')
  source.dataset.blueprintColumnHeader = ''
  source.dataset.stepIndex = '1'
  board.append(source)
  const track = (top: number, empty: boolean) => {
    const el = document.createElement(empty ? 'button' : 'div')
    if (empty) el.dataset.blueprintEmptySlot = ''
    else el.dataset.structureColumn = ''
    el.dataset.stepIndex = '1'
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, top, 120, 80),
    )
    board.append(el)
    return el
  }
  // First row empty, middle filled, last empty — wash must span all three.
  track(100, true)
  track(200, false)
  track(300, true)
  // Nested cell inside the middle shell must not shrink the union.
  const nested = document.createElement('button')
  nested.dataset.stepIndex = '1'
  nested.dataset.blueprintCell = ''
  vi.spyOn(nested, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(110, 210, 100, 60),
  )
  board.append(nested)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
  highlightStructure(source, 'step', 1, true)
  expect(board.dataset.axisHighlight).toBe('step')
  const height = parseFloat(
    board.style.getPropertyValue('--structure-highlight-height'),
  )
  // 100..380 minus insets — must cover first empty through last empty.
  expect(height).toBeGreaterThan(250)
  highlightStructure(source, 'step', 1, false)
})

it('uses lane identity in merged layouts and observes replacement rows', () => {
  vi.stubGlobal('CSS', { escape: (s: string) => s })
  const board = document.createElement('div')
  board.dataset.structureBoard = ''
  document.body.append(board)
  const source = document.createElement('button')
  board.append(source)
  const row = (id: string, y: number) => {
    const el = document.createElement('div')
    el.dataset.blueprintRow = ''
    el.dataset.laneId = id
    el.dataset.laneName = 'Front desk'
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, y, 400, 100),
    )
    board.append(el)
    return el
  }
  const first = row('one', 100)
  row('two', 500)
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 600, 800),
  )
  const observe = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
  highlightStructure(source, 'lane', 'one', true)
  expect(board.dataset.axisHighlight).toBe('lane')
  expect(
    parseFloat(board.style.getPropertyValue('--structure-highlight-height')),
  ).toBeLessThan(100)
  first.remove()
  const replacement = row('one', 200)
  document.dispatchEvent(new Event('structure-motion-end'))
  expect(observe).toHaveBeenCalledWith(replacement)
  highlightStructure(source, 'lane', 'one', false)
})
