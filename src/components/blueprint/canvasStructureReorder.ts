import { animate, type AnimationPlaybackControls } from 'framer-motion'
import {
  EASE_POINTS,
  MOTION_STRUCTURAL_MS,
  STRUCTURE_RETURN_SPRING,
  prefersReducedMotion,
} from '@/lib/motion'
import { getLaneRole } from '@/lib/laneRoles'
import {
  measureStructureParts,
  orderWithinSection,
  sectionRangeForIndex,
  type LaneSectionRange,
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

/**
 * Re-export section splice for callers and tests that reorder without a gesture.
 */
export { orderWithinSection }

/** Longest wait before a stuck settle preview is forced clear. */
const SETTLE_FALLBACK_MS = 5_000
const MAX_OVERDRAG = 24

/** Finger-locked in range; smooth square-root rubber band outside it. */
export function dampenStructureDrag(
  value: number,
  min: number,
  max: number,
  scale: number,
): number {
  const edge = Math.max(min, Math.min(max, value))
  const extra = (value - edge) / scale
  // Offset the root so its slope joins normal dragging at 1, rather than
  // jumping at the edge. The soft ceiling never becomes a hard clamp.
  const stretch = 2 * (Math.sqrt(1 + Math.abs(extra)) - 1)
  return edge + Math.sign(extra) * MAX_OVERDRAG * Math.tanh(stretch / MAX_OVERDRAG) * scale
}

type Options = {
  busy?: () => boolean
  root?: HTMLElement
  items: (kind: Kind) => ReorderItem[]
  scale: () => number
  save: (kind: Kind, id: string, order: string[], expected: string[]) => void
  /**
   * Hold for the drop settle. `release` is written here so the React tree can
   * clear parked translates in `useLayoutEffect` once the board order matches
   * the drop — a fixed timer races the refetch and flashes the old seats.
   */
  settle?: { release: (() => void) | null }
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

/** Roles in display order for section math. */
function rolesForItems(items: ReorderItem[]): StructureLaneRole[] {
  return items.map((item) =>
    getLaneRole({ name: item.name, role: item.role }),
  )
}

/**
 * Pack preview order into the measured slots of one section, preserving each
 * original gap. Same math for steps (whole axis) and lanes (one band between
 * fixed dividers). Outside the section, offsets stay 0.
 */
export function packAxisOffsets(options: {
  ids: readonly string[]
  previewIds: readonly string[]
  starts: readonly number[]
  extents: readonly number[]
  /** The interaction boundary's lower corridor belongs to the seat. */
  seatInsets?: readonly number[]
  section: LaneSectionRange
}): Map<string, number> {
  const { ids, previewIds, starts, extents, section, seatInsets } = options
  const indexById = new Map(ids.map((id, index) => [id, index]))
  const offsets = new Map<string, number>()
  for (const id of ids) offsets.set(id, 0)
  if (section.end < section.start) return offsets

  const previewInSection = previewIds.filter((id) => {
    const original = indexById.get(id)
    return (
      original !== undefined &&
      original >= section.start &&
      original <= section.end
    )
  })

  let cursor = starts[section.start]!
  for (let index = 0; index < previewInSection.length; index++) {
    const id = previewInSection[index]!
    const original = indexById.get(id)!
    const slot = section.start + index
    const from = seatInsets?.[original] ?? 0
    const to = seatInsets?.[slot] ?? 0
    offsets.set(id, cursor - starts[original]!)
    const gap =
      slot < section.end
        ? starts[slot + 1]! - starts[slot]! - extents[slot]!
        : 0
    cursor += extents[original]! - from + to + gap
  }
  return offsets
}

/** Pointer intent belongs to the header; the whole measured axis travels with it. */
export function registerCanvasStructureReorder(
  body: HTMLElement,
  options: Options,
) {
  const root = options.root ?? body
  /** Positioned ancestor for absolute lift/landing chrome. */
  const board =
    body.closest<HTMLElement>('[data-structure-board]') ?? body
  let gesture: {
    source: HTMLElement
    kind: Kind
    id: string
    pointerId: number
    x: number
    y: number
    items: ReorderItem[]
    boxes: DOMRect[]
    seatInsets: number[]
    axis: AxisGeometry
    ids: string[]
    indexById: Map<string, number>
    offsets: Map<string, number>
    dividerStarts: Map<StructureDividerKind, number>
    section: LaneSectionRange
    legalStart: number
    legalEnd: number
    index: number
    target: number
    lifted: boolean
    banned: boolean
  } | null = null
  let suppressClick = false
  let clickReset: ReturnType<typeof setTimeout> | undefined
  const original = new Map<HTMLElement, string>()
  const moves = new Map<HTMLElement, AnimationPlaybackControls>()
  let frame: HTMLDivElement | null = null
  let slot: HTMLDivElement | null = null
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let settling = false
  let returnVersion = 0
  const clearChrome = () => {
    delete body.dataset.structureReordering
    delete board.dataset.structureReordering
    delete body.dataset.structureBan
    delete board.dataset.structureBan
    if (slot) delete slot.dataset.structureLandingBan
    frame?.remove()
    slot?.remove()
    frame = null
    slot = null
  }
  const clearTranslates = () => {
    for (const playback of moves.values()) playback.cancel()
    moves.clear()
    // Always clear to empty — restoring a pre-lift value races a board that
    // already painted the dropped order and can leave a 0px translate ghost.
    // The settling attribute suppresses CSS glides during the DOM handoff;
    // do not leave an inline transition override on the reusable headers.
    for (const node of original.keys()) {
      node.style.translate = ''
      node.removeAttribute('data-structure-lift')
      node.removeAttribute('data-structure-foreign')
    }
    original.clear()
  }
  /**
   * End a parked post-drop preview once the board owns the new order (or the
   * write failed). Safe to call when nothing is settling.
   */
  const releaseSettle = () => {
    if (!settling) return
    settling = false
    returnVersion++
    clearTimeout(settleTimer)
    settleTimer = undefined
    clearTranslates()
    delete body.dataset.structureSettling
    delete board.dataset.structureSettling
    delete document.documentElement.dataset.structureSettling
    document.dispatchEvent(new Event('structure-motion-end'))
  }
  if (options.settle) options.settle.release = releaseSettle
  const reset = () => {
    const captured = gesture
    gesture = null
    if (settling) releaseSettle()
    else {
      clearTimeout(settleTimer)
      clearTranslates()
    }
    if (captured?.source.hasPointerCapture?.(captured.pointerId))
      captured.source.releasePointerCapture(captured.pointerId)
    clearChrome()
    gesture = null
  }
  /** Landing stays visible for every seat — including home — once lifted. */
  const showLanding = () => {
    if (slot) slot.style.opacity = ''
  }
  const dividerNodes = () =>
    Array.from(
      board.querySelectorAll<HTMLElement>('[data-blueprint-divider]'),
    )
  const header = (event: Event) =>
    (event.target as Element).closest<HTMLElement>(
      '[data-structure-reorder][data-structure-id]',
    )
  const markForeign = (g: NonNullable<typeof gesture>) => {
    for (const [index, item] of g.items.entries()) {
      const foreign =
        g.kind === 'lane' &&
        (index < g.section.start || index > g.section.end)
      for (const part of item.parts) {
        if (foreign) part.dataset.structureForeign = ''
        else delete part.dataset.structureForeign
      }
    }
  }
  const setBanned = (banned: boolean) => {
    const g = gesture
    if (g) g.banned = banned
    if (banned) {
      body.dataset.structureBan = ''
      board.dataset.structureBan = ''
      if (slot) slot.dataset.structureLandingBan = ''
    } else {
      delete body.dataset.structureBan
      delete board.dataset.structureBan
      if (slot) delete slot.dataset.structureLandingBan
    }
    // Home seat and refused seats both keep the landing visible — the settle
    // preview is the feedback, including "back where you started".
    if (g?.lifted) showLanding()
  }
  const down = (event: PointerEvent) => {
    const source = header(event)
    if (!source || event.button !== 0 || gesture || options.busy?.()) return
    if (settling) releaseSettle()
    if ((event.target as Element).closest('[data-canvas-header-info]')) return
    const kind = source.dataset.structureReorder as Kind
    const items = options.items(kind),
      index = items.findIndex((item) => item.id === source.dataset.structureId)
    if (index < 0 || items.length < 2) return
    const roles = rolesForItems(items)
    const section =
      kind === 'lane'
        ? sectionRangeForIndex(roles, index)
        : { start: 0, end: items.length - 1 }
    const boxes = items.map((item) => measureStructureParts(item.parts, kind))
    const axis = AXES[kind]
    let legalStart = axis.start(boxes[section.start]!)
    let legalEnd =
      axis.start(boxes[section.end]!) + axis.extent(boxes[section.end]!)
    // Prefer divider edges when present so the ban zone is the line itself,
    // not a fuzzy band past the last lane's content.
    if (kind === 'lane') {
      for (const node of dividerNodes()) {
        const top = axis.start(node.getBoundingClientRect())
        const bottom = top + axis.extent(node.getBoundingClientRect())
        if (top >= legalEnd - 1 && top <= legalEnd + 80) {
          legalEnd = Math.min(legalEnd, top)
        }
        if (bottom <= legalStart + 1 && bottom >= legalStart - 80) {
          legalStart = Math.max(legalStart, bottom)
        }
      }
    }
    suppressClick = false
    gesture = {
      source,
      kind,
      id: items[index]!.id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      items,
      boxes,
      seatInsets: items.map((item) => {
        if (kind !== 'lane') return 0
        const label = item.parts.find((part) => part.hasAttribute('data-structure-lane-label'))
        if (!label) return 0
        const style = getComputedStyle(label)
        // Overhead and in-lane loop corridors belong to the lane. Only the
        // gap below the interaction boundary belongs to its destination seat.
        return options.scale() * (parseFloat(style.getPropertyValue('--structure-row-inset-bottom')) || 0)
      }),
      axis,
      ids: items.map((item) => item.id),
      indexById: new Map(items.map((item, i) => [item.id, i])),
      offsets: new Map(items.map((item) => [item.id, 0])),
      dividerStarts: new Map(),
      section,
      legalStart,
      legalEnd,
      index,
      target: index,
      lifted: false,
      banned: false,
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
    const rawDelta = axis.coordinate(event.clientX - g.x, event.clientY - g.y)
    if (!g.lifted && Math.abs(rawDelta) <= 5) return
    event.preventDefault()
    event.stopPropagation()
    g.lifted = true
    const scale = options.scale(),
      box = g.boxes[g.index]!
    const origin = board.getBoundingClientRect()
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
        for (const node of dividerNodes()) {
          original.set(node, node.style.translate)
          const kind = node.dataset.blueprintDivider as
            | StructureDividerKind
            | undefined
          if (!kind || g.dividerStarts.has(kind)) continue
          g.dividerStarts.set(kind, axis.start(node.getBoundingClientRect()))
        }
      }
      frame = document.createElement('div')
      frame.dataset.structureLiftFrame = g.kind
      slot = document.createElement('div')
      slot.dataset.structureLanding = g.kind
      board.append(slot, frame)
      place(slot, 0)
      showLanding()
      body.dataset.structureReordering = ''
      board.dataset.structureReordering = ''
      for (const part of g.items[g.index]!.parts) part.dataset.structureLift = ''
      markForeign(g)
    }

    const pointer = axis.coordinate(event.clientX, event.clientY)
    const outside = pointer < g.legalStart - 4 || pointer > g.legalEnd + 4
    setBanned(outside)

    // Rest → finger-locked → resistant edge → spring home on invalid release.
    // Use untransformed seats and board-scaled elasticity, never moved nodes.
    const delta = dampenStructureDrag(
      rawDelta,
      Math.min(0, g.legalStart - axis.start(box)),
      Math.max(0, g.legalEnd - axis.start(box) - axis.extent(box)),
      scale,
    )
    for (const part of g.items[g.index]!.parts)
      part.style.translate = axis.translate(delta / scale)
    place(frame, delta)

    if (outside) return

    // Intent follows the legal pointer; resistance only constrains the lift.
    // A tall row must still be able to choose the last, shorter seat.
    const center = axis.start(box) + axis.extent(box) / 2 + rawDelta
    const distance = (rect: DOMRect) =>
      Math.abs(axis.start(rect) + axis.extent(rect) / 2 - center)
    const seed = g.section.start
    const target = g.boxes.reduce((best, rect, index) => {
      if (index < g.section.start || index > g.section.end) return best
      return distance(rect) < distance(g.boxes[best]!) ? index : best
    }, seed)
    if (g.target !== target) {
      g.target = target
      const ids = orderWithinSection(g.ids, g.index, target, g.section)
      const packed = packAxisOffsets({
        ids: g.ids,
        previewIds: ids,
        starts: g.boxes.map((entry) => axis.start(entry)),
        extents: g.boxes.map((entry) => axis.extent(entry)),
        seatInsets: g.seatInsets,
        section: g.section,
      })
      for (const [id, offset] of packed) g.offsets.set(id, offset)
      if (g.kind === 'lane') {
        for (const node of dividerNodes()) {
          const kind = node.dataset.blueprintDivider as
            | StructureDividerKind
            | undefined
          if (!kind || !g.dividerStarts.has(kind)) continue
          moves.get(node)?.stop()
          node.style.translate = axis.translate(0)
        }
      }
      const fromInset = g.seatInsets[g.index]!
      const toInset = g.seatInsets[target]!
      place(slot!, g.offsets.get(g.id)!, true)
      if (g.kind === 'lane') {
        slot!.style.height = `${(box.height - fromInset + toInset) / scale}px`
      }
      showLanding()
      for (const [index, item] of g.items.entries()) {
        if (index === g.index) continue
        // Write translate directly — same path as the lifted item. Framer's
        // `{ translate }` target is not reliable for neighbour slides.
        const translate = axis.translate(g.offsets.get(item.id)! / scale)
        for (const part of item.parts) {
          moves.get(part)?.stop()
          part.style.translate = translate
          if (!prefersReducedMotion()) {
            moves.set(part, animate(part, { translate }, motion))
          }
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
      const release = g.axis.coordinate(event.clientX, event.clientY)
      const outside = release < g.legalStart - 4 || release > g.legalEnd + 4
      const commit = !outside && !g.banned && g.index !== g.target
      if (commit) {
        // Keep the preview in its destination while the query notification
        // is queued. The consumer releases these offsets in a layout effect
        // after the new DOM seats commit, before that frame can paint.
        body.dataset.structureSettling = ''
        board.dataset.structureSettling = ''
        document.documentElement.dataset.structureSettling = ''
        for (const part of g.items[g.index]!.parts)
          delete part.dataset.structureLift
        for (const part of board.querySelectorAll<HTMLElement>(
          '[data-structure-foreign]',
        ))
          delete part.dataset.structureForeign
        for (const playback of moves.values()) playback.cancel()
        moves.clear()
        for (const item of g.items) {
          for (const part of item.parts) {
            part.style.translate = g.axis.translate(g.offsets.get(item.id)! / options.scale())
          }
        }
        clearChrome()
        gesture = null
        settling = true
        if (g.source.hasPointerCapture?.(g.pointerId))
          g.source.releasePointerCapture(g.pointerId)
        clearTimeout(settleTimer)
        settleTimer = setTimeout(
          releaseSettle,
          SETTLE_FALLBACK_MS,
        )
        options.save(
          g.kind,
          g.id,
          orderWithinSection(
            g.items.map((item) => item.id),
            g.index,
            g.target,
            g.section,
          ),
          g.items.map((item) => item.id),
        )
        return
      }
    }
    if (!g.lifted || prefersReducedMotion()) {
      reset()
      return
    }
    // Invalid/no-op drop: one spring clock returns the lift and neighbours.
    // Clearing capture must not route its lost-capture event through cancel.
    gesture = null
    settling = true
    body.dataset.structureSettling = ''
    board.dataset.structureSettling = ''
    document.documentElement.dataset.structureSettling = ''
    if (g.source.hasPointerCapture?.(g.pointerId))
      g.source.releasePointerCapture(g.pointerId)
    // Read the current rendered displacement once. A DOM animation's cached
    // translate can still be zero after the pointer has moved the element.
    const released = Array.from(original.keys(), (part) => {
      const [x = 0, y = 0] = (getComputedStyle(part).translate || part.style.translate || '')
        .split(/\s+/).map(Number.parseFloat)
      return { part, offset: g.axis.coordinate(x || 0, y || 0) }
    })
    clearChrome()
    for (const playback of moves.values()) playback.stop()
    moves.clear()
    const version = ++returnVersion
    moves.set(g.source, animate(0, 1, {
      ...STRUCTURE_RETURN_SPRING,
      onUpdate: (progress) => {
        if (!settling || version !== returnVersion) return
        const weight = 1 - progress
        for (const { part, offset } of released) {
          const value = weight >= 0
            ? offset * weight
            : -Math.sign(offset) * MAX_OVERDRAG * Math.tanh(Math.abs(offset * weight) / MAX_OVERDRAG)
          part.style.translate = g.axis.translate(value)
        }
      },
      onComplete: () => {
        if (version === returnVersion) releaseSettle()
      },
    }))
    clearTimeout(settleTimer)
    settleTimer = setTimeout(releaseSettle, SETTLE_FALLBACK_MS)
  }
  const cancel = () => {
    // Completing a drop releases capture too. Its later lost-capture event
    // must not tear down a preview waiting for the committed DOM order.
    if (!gesture) return
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
      index = items.findIndex((item) => item.id === source.dataset.structureId)
    if (index < 0) return
    const section =
      kind === 'lane'
        ? sectionRangeForIndex(rolesForItems(items), index)
        : { start: 0, end: items.length - 1 }
    const target = index + (direction === 0 ? -1 : 1)
    if (target < section.start || target > section.end) return
    options.save(
      kind,
      items[index]!.id,
      orderWithinSection(
        items.map((item) => item.id),
        index,
        target,
        section,
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
    clearTimeout(settleTimer)
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
