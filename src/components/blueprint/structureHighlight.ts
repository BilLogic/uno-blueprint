import { getCellShellInsetY } from '@/lib/blueprintLayout'
/** One continuous axis wash, inset from the boundary and padded around its content. */
const owners = new WeakMap<Element, HTMLElement>()

export function highlightStructure(
  source: HTMLElement,
  kind: 'lane' | 'step',
  key: string | number,
  active: boolean,
) {
  const board = source.closest<HTMLElement>('[data-structure-board]')
  if (!board || (!active && owners.get(board) !== source)) return
  board
    .querySelectorAll('[data-structure-highlight]')
    .forEach((node) => node.removeAttribute('data-structure-highlight'))
  board.removeAttribute('data-axis-highlight')
  if (!active) {
    owners.delete(board)
    return
  }
  owners.set(board, source)
  const label = source.closest('[data-structure-header-cell]') ?? source
  label.setAttribute('data-structure-highlight', 'label')
  const scope = source.closest('[data-structure-path]') ?? board
  const nodes = scope.querySelectorAll<HTMLElement>(
    kind === 'step'
      ? `[data-step-index="${CSS.escape(String(key))}"]`
      : `[data-blueprint-row][data-lane-name="${CSS.escape(String(key))}"]`,
  )
  const boxes = Array.from(nodes)
    .filter((node) => node !== source)
    .map((node) => node.getBoundingClientRect())
    .filter((box) => box.width && box.height)
  if (!boxes.length) return
  const origin = board.getBoundingClientRect()
  const scale = board.offsetWidth ? origin.width / board.offsetWidth : 1
  // Split the shell padding: half outside the wash, half around its content.
  const inset = getCellShellInsetY(board.dataset.structureDensity === 'compact') / 2
  board.style.setProperty('--structure-highlight-inset', `${inset}px`)
  board.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
  source.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  for (const [name, value] of Object.entries({
    x: (left - origin.left) / scale + inset,
    y: (top - origin.top) / scale + inset,
    width: Math.max(0, (right - left) / scale - 2 * inset),
    height: Math.max(0, (bottom - top) / scale - 2 * inset),
  }))
    board.style.setProperty(`--structure-highlight-${name}`, `${value}px`)
  board.dataset.axisHighlight = kind
}
