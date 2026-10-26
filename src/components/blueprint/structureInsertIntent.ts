type Point = { clientX: number; clientY: number; buttons?: number }
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

const travel = (a: Point, b: Point) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
function armingDistance(target: Target, point: Point) {
  const box = target.element.getBoundingClientRect()
  const mark = target.element
    .querySelector('[data-structure-hint]')
    ?.getBoundingClientRect()
  const anchor = mark && mark.width && mark.height ? mark : box
  const vertical = target.orientation === 'vertical'
  const cross = vertical ? point.clientY : point.clientX
  if (
    cross < (vertical ? box.top : box.left) ||
    cross > (vertical ? box.bottom : box.right)
  )
    return Infinity
  return Math.abs(
    (vertical ? point.clientX : point.clientY) -
      (vertical
        ? anchor.left + anchor.width / 2
        : anchor.top + anchor.height / 2),
  )
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
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let dwellPoint: Point | null = null
  let suspendedPoint: Point | null = null
  let ready = false
  let handoffFrame = 0
  const cancel = () => {
    clearTimeout(timer)
    pending = undefined
    dwellPoint = null
    ready = false
  }
  const activate = (next: Target | null) => {
    cancel()
    clearTimeout(closeTimer)
    closeTimer = undefined
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
  const finishOpening = () => {
    if (!pending || !ready) return
    if (
      keyboardTarget !== pending &&
      (!lastPoint || armingDistance(pending, lastPoint) > 8)
    )
      return cancel()
    // Never show a new plus over the previous track's closing projection.
    const slot = pending.element
      .querySelector('[data-structure-slot]')
      ?.getBoundingClientRect()
    if (
      board.querySelector('[data-structure-seam-track]') &&
      !(slot && slot.width > 0 && slot.height > 0)
    )
      return
    activate(pending)
  }
  const motionEnd = () => {
    cancelAnimationFrame(handoffFrame)
    handoffFrame = requestAnimationFrame(() => {
      handoffFrame = requestAnimationFrame(finishOpening)
    })
  }
  const schedule = (next: Target | null) => {
    if (next === active && next) {
      cancel()
      clearTimeout(closeTimer)
      closeTimer = undefined
      return
    }
    if (active && closeTimer === undefined)
      closeTimer = setTimeout(() => {
        active?.change(false)
        active = null
        closeTimer = undefined
        if (!pending) board.removeAttribute('data-structure-insert-hover')
      }, 100)
    if (!next) return cancel()
    if (
      pending === next &&
      dwellPoint &&
      lastPoint &&
      travel(dwellPoint, lastPoint) <= 4
    )
      return
    cancel()
    pending = next
    dwellPoint = lastPoint
    board.setAttribute('data-structure-insert-hover', '')
    timer = setTimeout(() => {
      ready = true
      finishOpening()
    }, 350)
  }
  const releaseKeyboard = (point: Point) => {
    if (
      keyboardTarget &&
      (!keyboardPoint ||
        Math.hypot(
          point.clientX - keyboardPoint.clientX,
          point.clientY - keyboardPoint.clientY,
        ) > 1)
    ) {
      keyboardTarget = null
      keyboardPoint = null
    }
  }
  const move = (point: Point) => {
    lastPoint = { clientX: point.clientX, clientY: point.clientY }
    if (
      point.buttons ||
      (suspendedPoint && travel(point, suspendedPoint) <= 4)
    ) {
      suspend(point)
      return
    }
    suspendedPoint = null
    // Closing layout can move a hit band under a stationary header pointer.
    // A new insertion needs actual pointer travel, not a layout boundary event.
    if (
      headerPoint &&
      Math.hypot(
        point.clientX - headerPoint.clientX,
        point.clientY - headerPoint.clientY,
      ) <= 1
    ) {
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
      ((keyboardTarget === active &&
        active.element === active.element.ownerDocument.activeElement) ||
        contains(active, point))
    ) {
      schedule(active)
      return
    }
    if (pending && armingDistance(pending, point) <= 8) {
      schedule(pending)
      return
    }
    const candidates = [...targets].filter(
      (target) => armingDistance(target, point) <= 8,
    )
    candidates.sort(
      (a, b) => armingDistance(a, point) - armingDistance(b, point),
    )
    schedule(candidates[0] ?? null)
  }
  const headerAction = (target: EventTarget | null, point: Point) => {
    const element = target instanceof Element ? target : null
    if (
      element?.closest(
        '[data-canvas-header-opener], [data-blueprint-row-header], [data-structure-reorder], [data-canvas-header-info]',
      )
    )
      return true
    const header = element?.closest(
      '[data-structure-header-cell], [data-blueprint-column-header]',
    )
    if (!header) return false
    const box = header.getBoundingClientRect()
    const lane = header.hasAttribute('data-structure-lane-label')
    const coordinate = lane ? point.clientY : point.clientX
    const start = lane ? box.top : box.left
    const size = lane ? box.height : box.width
    // The blank middle is still a header hover. Leave its edge bands usable
    // for insertion, including the side immediately beside a semantic line.
    const edge = Math.min(22, size / 4)
    return (
      coordinate > start + edge + 0.5 && coordinate < start + size - edge - 0.5
    )
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
    if (
      clicked &&
      headerPoint &&
      Math.hypot(
        pointer.clientX - headerPoint.clientX,
        pointer.clientY - headerPoint.clientY,
      ) <= 1
    ) {
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
    if (
      owner &&
      !headerAction(event.target, pointer) &&
      clicked !== owner.element
    ) {
      event.preventDefault()
      event.stopPropagation()
      owner.create()
    }
  }
  const leaveBoard = () => {
    keyboardTarget = null
    keyboardPoint = null
    headerPoint = null
    leave()
  }
  const dismiss = () => {
    suspendedPoint = lastPoint ?? suspendedPoint
    keyboardTarget = null
    keyboardPoint = null
    headerPoint = null
    lastPoint = null
    activate(null)
  }
  const suspend = (point: Point) => {
    dismiss()
    suspendedPoint = { clientX: point.clientX, clientY: point.clientY }
  }
  const wheel = (event: WheelEvent) => suspend(event)
  const cameraGesture = (event: Event) => suspend((event as CustomEvent<Point|null>).detail ?? lastPoint ?? {clientX:0,clientY:0})
  const pointerDown = (event: PointerEvent) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-structure-seam]')
    )
      suspend(event)
  }
  const visibility = () => {
    if (board.ownerDocument.hidden) dismiss()
  }
  const observePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    if (event.buttons) {
      suspend(event)
      return
    }
    releaseKeyboard(event)
    lastPoint = { clientX: event.clientX, clientY: event.clientY }
    if (!(event.target instanceof Node) || !board.contains(event.target))
      leave()
  }
  const view = board.ownerDocument.defaultView
  document.addEventListener('structure-motion-end', motionEnd)
  board.ownerDocument.addEventListener('canvas-camera-gesture', cameraGesture)
  view?.addEventListener('wheel', wheel, { capture: true, passive: true })
  view?.addEventListener('pointerdown', pointerDown, true)
  view?.addEventListener('blur', dismiss)
  view?.addEventListener('pointermove', observePointerMove, true)
  board.ownerDocument.addEventListener('visibilitychange', visibility)
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
          } else move(event)
        },
        focus() {
          if (!target.element.matches(':focus-visible')) return
          keyboardTarget = target
          keyboardPoint = lastPoint
          headerPoint = null
          suspendedPoint = null
          activate(target)
        },
        blur() {
          if (keyboardTarget === target) {
            keyboardTarget = null
            keyboardPoint = null
          }
          schedule(null)
        },
        dispose() {
          targets.delete(target)
          if (pending === target) cancel()
          if (active === target) active = null
          if (keyboardTarget === target) {
            keyboardTarget = null
            keyboardPoint = null
          }
          if (!targets.size) {
            cancel()
            clearTimeout(closeTimer)
            cancelAnimationFrame(handoffFrame)
            document.removeEventListener('structure-motion-end', motionEnd)
            board.ownerDocument.removeEventListener('canvas-camera-gesture', cameraGesture)
            view?.removeEventListener('wheel', wheel, true)
            view?.removeEventListener('pointerdown', pointerDown, true)
            board.removeEventListener('pointermove', pointerMove, true)
            board.removeEventListener('pointerleave', leaveBoard)
            board.removeEventListener('click', click, true)
            view?.removeEventListener('blur', dismiss)
            view?.removeEventListener('pointermove', observePointerMove, true)
            board.ownerDocument.removeEventListener(
              'visibilitychange',
              visibility,
            )
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
