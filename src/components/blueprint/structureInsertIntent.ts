type Point = { clientX: number; clientY: number }
type Target = {
  element: HTMLButtonElement
  orientation: 'horizontal' | 'vertical'
  change: (open: boolean) => void
  create: () => void
}
type Intent = ReturnType<typeof createIntent>
const intents = new WeakMap<Element, Intent>()

function contains(target: Target, point: Point) {
  const inside = (box: DOMRect) =>
    box.width > 0 &&
    box.height > 0 &&
    point.clientX >= box.left &&
    point.clientX <= box.right &&
    point.clientY >= box.top &&
    point.clientY <= box.bottom
  if (inside(target.element.getBoundingClientRect())) return true
  // Edge slots open beside the boundary and can extend beyond the hit band.
  const slot = target.element.hasAttribute('data-open')
    ? target.element.querySelector('[data-structure-slot]')
    : null
  return slot ? inside(slot.getBoundingClientRect()) : false
}

/** One hover owner per board: a crossing cannot steal an already open axis. */
function createIntent(board: Element) {
  const targets = new Set<Target>()
  let active: Target | null = null
  let pending: Target | null | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    pending = undefined
  }
  const activate = (next: Target | null) => {
    cancel()
    if (next === active) return
    active?.change(false)
    active = next
    active?.change(true)
  }
  const schedule = (next: Target | null) => {
    if (next === active) return cancel()
    if (pending === next) return
    cancel()
    pending = next
    timer = setTimeout(() => activate(next), next ? 90 : 140)
  }
  const move = (point: Point) => {
    if (
      active &&
      (active.element === active.element.ownerDocument.activeElement ||
        contains(active, point))
    ) {
      schedule(active)
      return
    }
    if (pending && contains(pending, point)) return
    const candidates = [...targets].filter((target) => contains(target, point))
    candidates.sort((a, b) => {
      const distance = (target: Target) => {
        const box = target.element.getBoundingClientRect()
        return target.orientation === 'vertical'
          ? Math.abs(point.clientX - (box.left + box.width / 2))
          : Math.abs(point.clientY - (box.top + box.height / 2))
      }
      return distance(a) - distance(b)
    })
    schedule(candidates[0] ?? null)
  }
  const pointerMove = (event: Event) => {
    const pointer = event as PointerEvent
    if (pointer.pointerType === 'touch') return
    if (
      (event.target as Element).closest('button:not([data-structure-seam])')
    ) {
      leave()
      return
    }
    move(pointer)
  }
  const leave = () => {
    if (
      !active ||
      active.element !== active.element.ownerDocument.activeElement
    )
      schedule(null)
  }
  const click = (event: Event) => {
    const pointer = event as MouseEvent
    const clicked = (event.target as Element).closest('[data-structure-seam]')
    if (
      active &&
      clicked &&
      clicked !== active.element &&
      contains(active, pointer)
    ) {
      event.preventDefault()
      event.stopPropagation()
      active.create()
    }
  }
  board.addEventListener('pointermove', pointerMove, true)
  board.addEventListener('pointerleave', leave)
  board.addEventListener('click', click, true)
  return {
    add(target: Target) {
      targets.add(target)
      return {
        enter: move,
        leave: move,
        focus() {
          activate(target)
        },
        blur() {
          schedule(null)
        },
        dispose() {
          targets.delete(target)
          if (pending === target) cancel()
          if (active === target) active = null
          if (!targets.size) {
            cancel()
            board.removeEventListener('pointermove', pointerMove, true)
            board.removeEventListener('pointerleave', leave)
            board.removeEventListener('click', click, true)
            intents.delete(board)
          }
        },
      }
    },
  }
}

export function registerStructureInsert(target: Target) {
  const board =
    target.element.closest('[data-structure-board]') ??
    target.element.parentElement!
  let intent = intents.get(board)
  if (!intent) {
    intent = createIntent(board)
    intents.set(board, intent)
  }
  return intent.add(target)
}
