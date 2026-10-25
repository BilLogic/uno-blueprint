import { getCellShellInsetY } from '@/lib/blueprintLayout'

/** The active wash follows layout changes, including a closing insertion track. */
const owners = new WeakMap<Element, { source: HTMLElement; dispose: () => void }>()

export function highlightStructure(
  source: HTMLElement,
  kind: 'lane' | 'step',
  key: string | number,
  active: boolean,
) {
  const board = source.closest<HTMLElement>('[data-structure-board]')
  if (!board || (!active && owners.get(board)?.source !== source)) return
  owners.get(board)?.dispose()
  board.querySelectorAll('[data-structure-highlight]').forEach(node =>
    node.removeAttribute('data-structure-highlight'),
  )
  board.removeAttribute('data-axis-highlight')
  if (!active) {
    owners.delete(board)
    return
  }
  const label = source.closest('[data-structure-header-cell]') ?? source
  label.setAttribute('data-structure-highlight', 'label')
  const scope = source.closest('[data-structure-path]') ?? board
  const selector = kind === 'step'
    ? `[data-step-index="${CSS.escape(String(key))}"]`
    : `[data-blueprint-row][data-lane-name="${CSS.escape(String(key))}"]`
  const inset = getCellShellInsetY(board.dataset.structureDensity === 'compact') / 2
  board.style.setProperty('--structure-highlight-inset', `${inset}px`)
  let observer: ResizeObserver | undefined
  const dispose = () => {
    observer?.disconnect()
    source.ownerDocument.removeEventListener('structure-motion-end', measure)
  }
  const measure = () => {
    if (owners.get(board)?.dispose !== dispose) return
    if (!label.isConnected || !label.hasAttribute('data-structure-highlight')) {
      dispose()
      return
    }
    const origin = board.getBoundingClientRect()
    const scale = board.offsetWidth ? origin.width / board.offsetWidth : 1
    const view = source.ownerDocument.defaultView!
    const nodes = Array.from(scope.querySelectorAll<HTMLElement>(selector))
    const boxes = nodes.filter(node => node !== source).map(node => {
      const box = node.getBoundingClientRect()
      const style = view.getComputedStyle(node)
      const above = kind === 'lane' ? parseFloat(style.getPropertyValue('--structure-row-inset-top')) || 0 : 0
      const below = kind === 'lane' ? parseFloat(style.getPropertyValue('--structure-row-inset-bottom')) || 0 : 0
      return {left: box.left, top: box.top + above * scale, right: box.right, bottom: box.bottom - below * scale, width: box.width, height: box.height}
    }).filter(box => box.width && box.height)
    if (!boxes.length) return
    board.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
    source.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
    const left = Math.min(...boxes.map(box => box.left))
    const top = Math.min(...boxes.map(box => box.top))
    const right = Math.max(...boxes.map(box => box.right))
    const bottom = Math.max(...boxes.map(box => box.bottom))
    for (const [name, value] of Object.entries({
      x: (left - origin.left) / scale + inset,
      y: (top - origin.top) / scale + inset,
      width: Math.max(0, (right - left) / scale - 2 * inset),
      height: Math.max(0, (bottom - top) / scale - 2 * inset),
    })) board.style.setProperty(`--structure-highlight-${name}`, `${value}px`)
    board.dataset.axisHighlight = kind
  }
  owners.set(board, {source, dispose})
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(board)
    for (const node of scope.querySelectorAll(selector)) observer.observe(node)
  }
  source.ownerDocument.addEventListener('structure-motion-end', measure)
}
