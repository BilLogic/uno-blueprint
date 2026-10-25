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
  let keyboardTarget: Target | null = null
  let keyboardPoint: Point | null = null
  let lastPoint: Point | null = null
  let headerPoint: Point | null = null
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
    board.toggleAttribute(
      'data-structure-insert-hover',
      Boolean(active && lastPoint && contains(active, lastPoint)),
    )
    if (active) {
      board.removeAttribute('data-axis-highlight')
      board
        .querySelectorAll('[data-structure-highlight]')
        .forEach((node) => node.removeAttribute('data-structure-highlight'))
    }
    active?.change(true)
  }
  const schedule = (next: Target | null) => {
    if (next === active) return cancel()
    if (pending === next) return
    cancel()
    pending = next
    if (next) board.setAttribute('data-structure-insert-hover', '')
    timer = setTimeout(() => activate(next), next ? 90 : 75)
  }
  const releaseKeyboard = (point: Point) => {
    if (keyboardTarget && (!keyboardPoint || Math.hypot(point.clientX-keyboardPoint.clientX,point.clientY-keyboardPoint.clientY)>1)) {
      keyboardTarget=null
      keyboardPoint=null
    }
  }
  const move = (point: Point) => {
    lastPoint = point
    // Closing layout can move a hit band under a stationary header pointer.
    // A new insertion needs actual pointer travel, not a layout boundary event.
    if (headerPoint && Math.hypot(point.clientX - headerPoint.clientX, point.clientY - headerPoint.clientY) <= 1) {
      leave()
      return
    }
    headerPoint = null
    board.toggleAttribute(
      'data-structure-insert-hover',
      Boolean(
        (active && contains(active, point)) ||
          (pending && contains(pending, point)),
      ),
    )
    if (
      active &&
      ((keyboardTarget === active && active.element === active.element.ownerDocument.activeElement) ||
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
  const headerAction = (target: EventTarget | null, point: Point) => {
    const element = target instanceof Element ? target : null
    if (element?.closest(
      '[data-canvas-header-opener], [data-blueprint-row-header], [data-structure-reorder], [data-canvas-header-info]',
    )) return true
    const header = element?.closest('[data-structure-header-cell], [data-blueprint-column-header]')
    if (!header) return false
    const box = header.getBoundingClientRect()
    const lane = header.hasAttribute('data-structure-lane-label')
    const coordinate = lane ? point.clientY : point.clientX
    const start = lane ? box.top : box.left
    const size = lane ? box.height : box.width
    // The blank middle is still a header hover. Leave its edge bands usable
    // for insertion, including the side immediately beside a semantic line.
    const edge = Math.min(22, size / 4)
    return coordinate > start + edge + 0.5 &&
      coordinate < start + size - edge - 0.5
  }
  const pointerMove = (event: Event) => {
    const pointer = event as PointerEvent
    if (pointer.pointerType === 'touch') return
    // Real pointer travel takes over from keyboard discovery. Boundary events
    // caused only by a growing track do not revoke the keyboard's ownership.
    releaseKeyboard(pointer)
    if (headerAction(event.target, pointer)) {
      lastPoint = { clientX: pointer.clientX, clientY: pointer.clientY }
      headerPoint = lastPoint
      leave()
      return
    }
    move(pointer)
  }
  const leave = () => {
    board.removeAttribute('data-structure-insert-hover')
    if (
      !active ||
      keyboardTarget !== active ||
      active.element !== active.element.ownerDocument.activeElement
    )
      schedule(null)
  }
  const click = (event: Event) => {
    const pointer = event as MouseEvent
    const clicked = (event.target as Element).closest('[data-structure-seam]')
    if (clicked && headerPoint && Math.hypot(pointer.clientX - headerPoint.clientX, pointer.clientY - headerPoint.clientY) <= 1) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const owner =
      active && contains(active, pointer)
        ? active
        : pending && contains(pending, pointer)
        ? pending
        : null
    if (owner && !headerAction(event.target, pointer) && clicked !== owner.element) {
      event.preventDefault()
      event.stopPropagation()
      owner.create()
    }
  }
  const leaveBoard = () => {
    keyboardTarget=null
    keyboardPoint=null
    headerPoint=null
    leave()
  }
  const dismiss = () => {
    keyboardTarget=null
    keyboardPoint=null
    headerPoint=null
    lastPoint=null
    activate(null)
  }
  const visibility = () => { if (board.ownerDocument.hidden) dismiss() }
  const observePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    releaseKeyboard(event)
    lastPoint={clientX:event.clientX,clientY:event.clientY}
    if (!(event.target instanceof Node) || !board.contains(event.target)) leave()
  }
  const view=board.ownerDocument.defaultView
  view?.addEventListener('blur',dismiss)
  view?.addEventListener('pointermove',observePointerMove,true)
  board.ownerDocument.addEventListener('visibilitychange',visibility)
  board.addEventListener('pointermove', pointerMove, true)
  board.addEventListener('pointerleave', leaveBoard)
  board.addEventListener('click', click, true)
  return {
    add(target: Target) {
      targets.add(target)
      return {
        enter: move,
        leave(event: Point & { relatedTarget?: EventTarget | null }) {
          if (headerAction(event.relatedTarget ?? null, event)) {
            headerPoint = { clientX: event.clientX, clientY: event.clientY }
            leave()
          }
          else move(event)
        },
        focus() {
          if (!target.element.matches(':focus-visible')) return
          keyboardTarget=target
          keyboardPoint=lastPoint
          headerPoint = null
          activate(target)
        },
        blur() {
          if (keyboardTarget===target) {keyboardTarget=null;keyboardPoint=null}
          schedule(null)
        },
        dispose() {
          targets.delete(target)
          if (pending === target) cancel()
          if (active === target) active = null
          if (keyboardTarget===target) {keyboardTarget=null;keyboardPoint=null}
          if (!targets.size) {
            cancel()
            board.removeEventListener('pointermove', pointerMove, true)
            board.removeEventListener('pointerleave', leaveBoard)
            board.removeEventListener('click', click, true)
            view?.removeEventListener('blur',dismiss)
            view?.removeEventListener('pointermove',observePointerMove,true)
            board.ownerDocument.removeEventListener('visibilitychange',visibility)
            board.removeAttribute('data-structure-insert-hover')
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
