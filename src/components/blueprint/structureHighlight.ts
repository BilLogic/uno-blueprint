/** One continuous axis wash, with a rounded outline on its header. */
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
  source.setAttribute('data-structure-highlight', 'label')
  const scope =
    kind === 'lane' ? source.closest('[data-structure-path]') ?? board : board
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
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  for (const [name, value] of Object.entries({
    x: (left - origin.left) / scale,
    y: (top - origin.top) / scale,
    width: (right - left) / scale,
    height: (bottom - top) / scale,
  }))
    board.style.setProperty(`--structure-highlight-${name}`, `${value}px`)
  board.dataset.axisHighlight = kind
}
