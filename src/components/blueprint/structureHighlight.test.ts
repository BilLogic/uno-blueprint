// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { highlightStructure } from './structureHighlight'
afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
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
