/** Moves the board's own cells and labels, without changing saved data or the camera. */
export function partStructureBoard(
  body: HTMLElement | null,
  axis: 'horizontal' | 'vertical',
  position: number,
  open: boolean,
) {
  if (!body) return
  const key = `${axis}:${position}`
  if (!open && body.dataset.openStructureSeam !== key) return
  if (open) {
    body
      .querySelectorAll<HTMLElement>('.structure-seam-motion')
      .forEach((node) => {
        node.style.translate = ''
      })
    body.dataset.openStructureSeam = key
  } else delete body.dataset.openStructureSeam
  const board = body.closest('[data-structure-board]') ?? body
  const nodes =
    axis === 'vertical'
      ? [...body.querySelectorAll<HTMLElement>('[data-step-index]')].filter(
          (node) =>
            Number(node.dataset.stepIndex) >= position &&
            !node.parentElement?.closest('[data-step-index]'),
        )
      : [...body.children].filter(
          (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            Number(node.style.gridRow.split(' ')[0]) >= position,
        )
  if (axis === 'vertical')
    nodes.push(
      ...[
        ...board.querySelectorAll<HTMLElement>(
          '[data-blueprint-column-header][data-step-index]',
        ),
      ].filter((node) => Number(node.dataset.stepIndex) >= position),
    )
  for (const node of nodes) {
    node.classList.add('structure-seam-motion')
    node.style.translate = open
      ? axis === 'vertical'
        ? '34px 0'
        : '0 34px'
      : ''
  }
}
