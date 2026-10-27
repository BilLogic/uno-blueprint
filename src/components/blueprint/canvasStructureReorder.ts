import { animate, type AnimationPlaybackControls } from 'framer-motion'
import {
  EASE_POINTS,
  MOTION_STRUCTURAL_MS,
  prefersReducedMotion,
} from '@/lib/motion'
import { getLaneRole } from '@/lib/laneRoles'
import {
  dividerTranslateForPreview,
  measureStructureParts,
  type StructureDividerKind,
  type StructureLaneRole,
} from './canvasStructureDividerGeometry'

type Kind = 'lane' | 'step'
export type ReorderItem = {
  id: string
  name: string
  parts: HTMLElement[]
  /** Lane role used to derive divider boundaries during a drag preview. */
  role?: StructureLaneRole
}
type Options = {
  busy?: () => boolean
  root?: HTMLElement
  items: (kind: Kind) => ReorderItem[]
  scale: () => number
  save: (kind: Kind, id: string, order: string[], expected: string[]) => void
}

type AxisGeometry = {
  start: (rect: DOMRect) => number
  extent: (rect: DOMRect) => number
  coordinate: (x: number, y: number) => number
  offset: (value: number) => { left: number; top: number }
  translate: (value: number) => string
}
const AXES: Record<Kind, AxisGeometry> = {
  step: {
    start: (rect) => rect.left,
    extent: (rect) => rect.width,
    coordinate: (x) => x,
    offset: (left) => ({ left, top: 0 }),
    translate: (value) => `${value}px 0px`,
  },
  lane: {
    start: (rect) => rect.top,
    extent: (rect) => rect.height,
    coordinate: (_x, y) => y,
    offset: (top) => ({ left: 0, top }),
    translate: (value) => `0px ${value}px`,
  },
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
    axis: AxisGeometry
    ids: string[]
    indexById: Map<string, number>
    offsets: Map<string, number>
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
  const bounds = (parts: HTMLElement[], kind: Kind) =>
    measureStructureParts(parts, kind)
  /** Semantic lines only — not the light swimlane hairlines between rows. */
  const dividerNodes = () =>
    Array.from(
      body.querySelectorAll<HTMLElement>('[data-blueprint-divider]'),
    )
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
      boxes: items.map((item) => bounds(item.parts, kind)),
      axis: AXES[kind],
      ids: items.map((item) => item.id),
      indexById: new Map(items.map((item, index) => [item.id, index])),
      offsets: new Map(items.map((item) => [item.id, 0])),
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
    const axis = g.axis
    const delta = axis.coordinate(event.clientX - g.x, event.clientY - g.y)
    if (!g.lifted && Math.abs(delta) <= 5) return
    event.preventDefault()
    event.stopPropagation()
    g.lifted = true
    const scale = options.scale(),
      box = g.boxes[g.index]
    const origin = body.getBoundingClientRect()
    const motion = {
      duration: prefersReducedMotion() ? 0 : MOTION_STRUCTURAL_MS / 1000,
      ease: EASE_POINTS.move,
    }
    const place = (node: HTMLElement, offset: number, glide = false) => {
      const delta = axis.offset(offset)
      const position = {
        left: `${(box.left - origin.left + delta.left) / scale}px`,
        top: `${(box.top - origin.top + delta.top) / scale}px`,
      }
      node.style.setProperty('--structure-highlight-stroke', `${1 / scale}px`)
      Object.assign(node.style, {
        width: `${box.width / scale}px`,
        height: `${box.height / scale}px`,
      })
      if (glide) {
        moves.get(node)?.stop()
        moves.set(node, animate(node, position, motion))
      } else Object.assign(node.style, position)
    }
    if (!frame) {
      for (const item of g.items)
        for (const part of item.parts) original.set(part, part.style.translate)
      if (g.kind === 'lane') {
        for (const node of dividerNodes())
          original.set(node, node.style.translate)
      }
      frame = document.createElement('div')
      frame.dataset.structureLiftFrame = ''
      slot = document.createElement('div')
      slot.dataset.structureLanding = ''
      body.append(slot, frame)
      place(slot, 0)
      body.dataset.structureReordering = ''
      for (const part of g.items[g.index].parts) part.dataset.structureLift = ''
    }
    const center = axis.start(box) + axis.extent(box) / 2 + delta
    const distance = (rect: DOMRect) =>
      Math.abs(axis.start(rect) + axis.extent(rect) / 2 - center)
    const target = g.boxes.reduce(
      (best, rect, index) =>
        distance(rect) < distance(g.boxes[best]) ? index : best,
      0,
    )
    place(frame, delta)
    for (const part of g.items[g.index].parts)
      part.style.translate = axis.translate(delta / scale)
    if (g.target !== target) {
      g.target = target
      // A target change projects once in linear time. Pointer movement within
      // that slot reuses these offsets and never restarts the neighbour motion.
      const ids = order(g.ids, g.index, target)
      let cursor = axis.start(g.boxes[0])
      for (const [index, id] of ids.entries()) {
        const originalIndex = g.indexById.get(id)!
        g.offsets.set(id, cursor - axis.start(g.boxes[originalIndex]))
        const gap =
          index < ids.length - 1
            ? axis.start(g.boxes[index + 1]) -
              axis.start(g.boxes[index]) -
              axis.extent(g.boxes[index])
            : 0
        cursor += axis.extent(g.boxes[originalIndex]) + gap
      }
      place(slot!, g.offsets.get(g.id)!, true)
      for (const [index, item] of g.items.entries()) {
        if (index === g.index) continue
        const translate = axis.translate(g.offsets.get(item.id)! / scale)
        for (const part of item.parts) {
          moves.get(part)?.stop()
          moves.set(part, animate(part, { translate }, motion))
        }
      }
      if (g.kind === 'lane') {
        const rolesById = new Map(
          g.items.map((item) => [
            item.id,
            getLaneRole({ name: item.name, role: item.role }),
          ]),
        )
        const starts = g.boxes.map((entry) => axis.start(entry))
        const extents = g.boxes.map((entry) => axis.extent(entry))
        const byKind = new Map<StructureDividerKind, number>()
        for (const kind of [
          'interaction',
          'visibility',
          'internal-interaction',
        ] as const) {
          byKind.set(
            kind,
            dividerTranslateForPreview({
              kind,
              ids: g.ids,
              previewIds: ids,
              rolesById,
              starts,
              extents,
              offsets: g.offsets,
            }) / scale,
          )
        }
        for (const node of dividerNodes()) {
          const kind = node.dataset.blueprintDivider as
            | StructureDividerKind
            | undefined
          if (!kind || !byKind.has(kind)) continue
          const translate = axis.translate(byKind.get(kind)!)
          moves.get(node)?.stop()
          moves.set(node, animate(node, { translate }, motion))
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
    if (gesture) {
      if (
        event.altKey &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    const source = header(event)
    if (!source || !event.altKey) return
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
