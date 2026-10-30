import { getCellShellInsetY } from '@/lib/blueprintLayout'

/** The active wash follows layout changes, including a closing insertion track. */
const owners = new WeakMap<
  Element,
  { source: HTMLElement; dispose: () => void }
>()

export function highlightStructure(
  source: HTMLElement,
  kind: 'lane' | 'step',
  key: string | number,
  active: boolean,
) {
  const board = source.closest<HTMLElement>('[data-structure-board]')
  if (!board || (!active && owners.get(board)?.source !== source)) return
  owners.get(board)?.dispose()
  board
    .querySelectorAll('[data-structure-highlight]')
    .forEach((node) => node.removeAttribute('data-structure-highlight'))
  board.removeAttribute('data-axis-highlight')
  if (!active) {
    owners.delete(board)
    return
  }
  const label = source.closest('[data-structure-header-cell]') ?? source
  label.setAttribute('data-structure-highlight', 'label')
  const scope = source.closest('[data-structure-path]') ?? board
  // Inserting or removing a preview changes rendered column indexes. Follow
  // the hovered header's current index instead of retaining its old neighbour.
  const stepIndex = CSS.escape(
    source.closest('[data-step-index]')?.getAttribute('data-step-index') ??
      String(key),
  )
  /**
   * Step wash must cover every row track — empty slots and filled shells —
   * not nested cell buttons (those are inset and punch visual holes).
   */
  const selector = () =>
    kind === 'step'
      ? `[data-step-index="${stepIndex}"]:is([data-structure-column], [data-blueprint-empty-slot])`
      : `[data-blueprint-row][data-lane-id="${CSS.escape(String(key))}"]`
  const inset =
    getCellShellInsetY(board.dataset.structureDensity === 'compact') / 2
  board.style.setProperty('--structure-highlight-inset', `${inset}px`)
  let observer: ResizeObserver | undefined
  const observed = new Set<HTMLElement>()
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
    let nodes = Array.from(scope.querySelectorAll<HTMLElement>(selector()))
    // Fall back if a layout omits the track markers — still paint a column.
    if (kind === 'step' && nodes.length === 0) {
      nodes = Array.from(
        scope.querySelectorAll<HTMLElement>(
          `[data-step-index="${stepIndex}"]`,
        ),
      ).filter((node) => node !== source && !node.closest('[data-structure-lift-frame]'))
    }
    for (const node of nodes) {
      if (!observed.has(node)) {
        observer?.observe(node)
        observed.add(node)
      }
    }
    for (const node of observed) {
      if (!nodes.includes(node)) {
        observer?.unobserve(node)
        observed.delete(node)
      }
    }
    const boxes = nodes
      .filter((node) => (kind === 'step' ? true : node !== source))
      .map((node) => {
        const box = node.getBoundingClientRect()
        const style = view.getComputedStyle(node)
        const above =
          kind === 'lane'
            ? parseFloat(style.getPropertyValue('--structure-row-inset-top')) ||
              0
            : 0
        const below =
          kind === 'lane'
            ? parseFloat(
                style.getPropertyValue('--structure-row-inset-bottom'),
              ) || 0
            : 0
        return {
          left: box.left,
          top: box.top + above * scale,
          right: box.right,
          bottom: box.bottom - below * scale,
          width: box.width,
          height: box.height,
        }
      })
      .filter((box) => box.width && box.height)
    if (!boxes.length) return
    board.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
    source.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
    let left = Math.min(...boxes.map((box) => box.left))
    const top = Math.min(...boxes.map((box) => box.top))
    const right = Math.max(...boxes.map((box) => box.right))
    const bottom = Math.max(...boxes.map((box) => box.bottom))
    // Lane rows span under the sticky label rail. The rail already paints its
    // own content-band ::before — if the axis wash starts under that
    // transparent cell, the two 5% fills stack into the nested double wash.
    if (kind === 'lane') {
      const railRight = label.getBoundingClientRect().right
      left = Math.max(left, railRight)
    }
    for (const [name, value] of Object.entries({
      x: (left - origin.left) / scale + inset,
      y: (top - origin.top) / scale + inset,
      width: Math.max(0, (right - left) / scale - 2 * inset),
      height: Math.max(0, (bottom - top) / scale - 2 * inset),
    }))
      board.style.setProperty(`--structure-highlight-${name}`, `${value}px`)
    board.dataset.axisHighlight = kind
  }
  owners.set(board, { source, dispose })
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(board)
    for (const node of scope.querySelectorAll<HTMLElement>(selector())) {
      observer.observe(node)
      observed.add(node)
    }
  }
  source.ownerDocument.addEventListener('structure-motion-end', measure)
}
