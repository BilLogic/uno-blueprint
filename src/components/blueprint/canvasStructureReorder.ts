import { animate, type AnimationPlaybackControls } from 'framer-motion'
import {
  EASE_POINTS,
  MOTION_STRUCTURAL_MS,
  prefersReducedMotion,
} from '@/lib/motion'

type Kind = 'lane' | 'step'
export type ReorderItem = { id: string; name: string; parts: HTMLElement[] }
type Options = {
  busy?: () => boolean
  root?: HTMLElement
  items: (kind: Kind) => ReorderItem[]
  scale: () => number
  save: (kind: Kind, id: string, order: string[], expected: string[]) => void
}

/** Pointer intent belongs to the header; the whole measured axis travels with it. */
export function registerCanvasStructureReorder(
  body: HTMLElement,
  options: Options,
) {
  const root = options.root ?? body
  let gesture: {
    source: HTMLElement
    kind: Kind
    id: string
    pointerId: number
    x: number
    y: number
    items: ReorderItem[]
    boxes: DOMRect[]
    index: number
    target: number
    lifted: boolean
  } | null = null
  let suppressClick = false
  let clickReset: ReturnType<typeof setTimeout> | undefined
  const original = new Map<HTMLElement, string>()
  const moves = new Map<HTMLElement, AnimationPlaybackControls>()
  let frame: HTMLDivElement | null = null
  let slot: HTMLDivElement | null = null
  const reset = () => {
    const captured = gesture
    gesture = null
    if (captured?.source.hasPointerCapture?.(captured.pointerId))
      captured.source.releasePointerCapture(captured.pointerId)
    for (const playback of moves.values()) playback.cancel()
    moves.clear()
    for (const [node, value] of original) {
      node.style.translate = value
      node.removeAttribute('data-structure-lift')
    }
    original.clear()
    delete body.dataset.structureReordering
    frame?.remove()
    slot?.remove()
    frame = null
    slot = null
    gesture = null
  }
  const order = (ids: string[], from: number, to: number) => {
    const next = [...ids]
    next.splice(to, 0, ...next.splice(from, 1))
    return next
  }
  const bounds = (parts: HTMLElement[]) => {
    const boxes = parts
      .map((part) => part.getBoundingClientRect())
      .filter((box) => box.width && box.height)
    const left = Math.min(...boxes.map((box) => box.left)),
      top = Math.min(...boxes.map((box) => box.top))
    return new DOMRect(
      left,
      top,
      Math.max(...boxes.map((box) => box.right)) - left,
      Math.max(...boxes.map((box) => box.bottom)) - top,
    )
  }
  const header = (event: Event) =>
    (event.target as Element).closest<HTMLElement>(
      '[data-structure-reorder][data-structure-id]',
    )
  const down = (event: PointerEvent) => {
    const source = header(event)
    if (!source || event.button !== 0 || gesture || options.busy?.()) return
    if ((event.target as Element).closest('[data-canvas-header-info]')) return
    const kind = source.dataset.structureReorder as Kind
    const items = options.items(kind),
      index = items.findIndex((item) => item.id === source.dataset.structureId)
    if (index < 0 || items.length < 2) return
    suppressClick = false
    gesture = {
      source,
      kind,
      id: items[index].id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      items,
      boxes: items.map((item) => bounds(item.parts)),
      index,
      target: index,
      lifted: false,
    }
    try {
      source.setPointerCapture?.(event.pointerId)
    } catch {
      reset()
      return
    }
    event.stopPropagation()
  }
  const move = (event: PointerEvent) => {
    const g = gesture
    if (!g || event.pointerId !== g.pointerId) return
    const delta = g.kind === 'step' ? event.clientX - g.x : event.clientY - g.y
    if (!g.lifted && Math.abs(delta) <= 5) return
    event.preventDefault()
    event.stopPropagation()
    g.lifted = true
    const scale = options.scale(),
      box = g.boxes[g.index]
    if (!frame) {
      for (const item of g.items)
        for (const part of item.parts) original.set(part, part.style.translate)
      frame = document.createElement('div')
      frame.dataset.structureLiftFrame = ''
      slot = document.createElement('div')
      slot.dataset.structureLanding = ''
      body.append(slot, frame)
      body.dataset.structureReordering = ''
      for (const part of g.items[g.index].parts) part.dataset.structureLift = ''
    }
    const center =
      g.kind === 'step'
        ? box.left + box.width / 2 + delta
        : box.top + box.height / 2 + delta
    const target = g.boxes.reduce(
      (best, item, index) =>
        Math.abs(
          (g.kind === 'step'
            ? item.left + item.width / 2
            : item.top + item.height / 2) - center,
        ) <
        Math.abs(
          (g.kind === 'step'
            ? g.boxes[best].left + g.boxes[best].width / 2
            : g.boxes[best].top + g.boxes[best].height / 2) - center,
        )
          ? index
          : best,
      0,
    )
    const ids = order(
      g.items.map((item) => item.id),
      g.index,
      target,
    )
    const origin = body.getBoundingClientRect()
    const place = (node: HTMLElement, b: DOMRect, offset: number) => {
      node.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
      Object.assign(node.style, {
        left: `${
          (b.left - origin.left + (g.kind === 'step' ? offset : 0)) / scale
        }px`,
        top: `${
          (b.top - origin.top + (g.kind === 'lane' ? offset : 0)) / scale
        }px`,
        width: `${b.width / scale}px`,
        height: `${b.height / scale}px`,
      })
    }
    place(frame, box, delta)
    const destination = g.boxes[target]
    place(
      slot!,
      box,
      g.kind === 'step'
        ? destination.left - box.left
        : destination.top - box.top,
    )
    for (const part of g.items[g.index].parts)
      part.style.translate =
        g.kind === 'step' ? `${delta / scale}px 0` : `0 ${delta / scale}px`
    if (g.target !== target) {
      g.target = target
      for (const [index, item] of g.items.entries()) {
        if (index === g.index) continue
        const to = g.boxes[ids.indexOf(item.id)],
          from = g.boxes[index]
        const shift =
          (g.kind === 'step' ? to.left - from.left : to.top - from.top) / scale
        for (const part of item.parts) {
          moves.get(part)?.stop()
          moves.set(
            part,
            animate(
              part,
              {
                translate:
                  g.kind === 'step' ? `${shift}px 0px` : `0px ${shift}px`,
              },
              {
                duration: prefersReducedMotion()
                  ? 0
                  : MOTION_STRUCTURAL_MS / 1000,
                ease: EASE_POINTS.move,
              },
            ),
          )
        }
      }
    }
  }
  const up = (event: PointerEvent) => {
    const g = gesture
    if (!g || event.pointerId !== g.pointerId) return
    if (g.lifted) {
      event.preventDefault()
      event.stopPropagation()
      suppressClick = true
      clearTimeout(clickReset)
      clickReset = setTimeout(() => {
        suppressClick = false
      }, 0)
      if (g.index !== g.target)
        options.save(
          g.kind,
          g.id,
          order(
            g.items.map((item) => item.id),
            g.index,
            g.target,
          ),
          g.items.map((item) => item.id),
        )
    }
    reset()
  }
  const cancel = () => {
    if (gesture?.lifted) {
      suppressClick = true
      clearTimeout(clickReset)
    }
    reset()
  }
  const click = (event: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false
      if (event.detail === 0) return
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && gesture) {
      event.preventDefault()
      cancel()
      return
    }
    const source = header(event)
    if (gesture || !source || !event.altKey) return
    const kind = source.dataset.structureReorder as Kind
    const directions =
      kind === 'step' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    const direction = directions.indexOf(event.key)
    if (direction < 0) return
    event.preventDefault()
    event.stopPropagation()
    if (options.busy?.()) return
    const items = options.items(kind),
      index = items.findIndex((item) => item.id === source.dataset.structureId),
      target = index + (direction === 0 ? -1 : 1)
    if (index >= 0 && target >= 0 && target < items.length)
      options.save(
        kind,
        items[index].id,
        order(
          items.map((item) => item.id),
          index,
          target,
        ),
        items.map((item) => item.id),
      )
  }
  const view = body.ownerDocument.defaultView
  const hidden = () => {
    if (body.ownerDocument.hidden) reset()
  }
  const freshPointer = () => {
    suppressClick = false
    clearTimeout(clickReset)
  }
  document.addEventListener('pointerdown', freshPointer, true)
  root.addEventListener('lostpointercapture', cancel)
  view?.addEventListener('blur', cancel)
  body.ownerDocument.addEventListener('visibilitychange', hidden)
  root.addEventListener('pointerdown', down)
  document.addEventListener('click', click, true)
  root.addEventListener('keydown', key)
  document.addEventListener('pointermove', move, {
    passive: false,
    capture: true,
  })
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', cancel)
  return () => {
    reset()
    document.removeEventListener('pointerdown', freshPointer, true)
    root.removeEventListener('lostpointercapture', cancel)
    view?.removeEventListener('blur', cancel)
    body.ownerDocument.removeEventListener('visibilitychange', hidden)
    root.removeEventListener('pointerdown', down)
    clearTimeout(clickReset)
    document.removeEventListener('click', click, true)
    root.removeEventListener('keydown', key)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', up, true)
    document.removeEventListener('pointercancel', cancel)
  }
}
