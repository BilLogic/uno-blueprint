/** Highlight the rendered axis within this board, including every path's cells. */
export function highlightStructure(
  source: HTMLElement,
  kind: 'lane' | 'step',
  key: string | number,
  active: boolean,
) {
  const board = source.closest('[data-structure-board]')
  if (!board) return
  board
    .querySelectorAll('[data-structure-highlight]')
    .forEach((node) => node.removeAttribute('data-structure-highlight'))
  if (!active) return
  source.setAttribute('data-structure-highlight', 'label')
  const nodes =
    kind === 'step'
      ? board.querySelectorAll<HTMLElement>(
          `[data-step-index="${CSS.escape(String(key))}"]`,
        )
      : board.querySelectorAll<HTMLElement>(
          `[data-blueprint-row][data-lane-name="${CSS.escape(String(key))}"]`,
        )
  nodes.forEach((node) => {
    if (node !== source) node.setAttribute('data-structure-highlight', 'cells')
  })
}
