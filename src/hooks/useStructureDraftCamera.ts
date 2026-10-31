import { useEffect, useRef, type RefObject } from 'react'
import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'

/** Assist placement while the draft owns the camera; a user gesture takes it back. */
export function useStructureDraftCamera(
  content: RefObject<HTMLDivElement | null>,
  panBy: (dx: number, dy: number, source?: 'structure-draft') => void,
  active: boolean,
) {
  const context = useEntityDetailOptional()
  const shifted = useRef({ x: 0, y: 0 })
  const session = useRef(false)
  const userOwned = useRef(false)
  const keep = Boolean(
    context?.selection?.draft || context?.selection?.focusNext,
  )
  // Names, property edits and animation ticks do not move the insertion destination.
  const placement = JSON.stringify(context?.preview?.orders ?? [])
  const kind = context?.preview?.kind
  const draftBoard = context?.draftBoard
  useEffect(() => {
    const gesture = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.source === 'structure-draft') return
      const viewport = content.current?.closest('[data-zoom-pan-viewport]')
      if (
        !session.current ||
        !viewport ||
        (event.target !== viewport &&
          !(event.target instanceof Node && viewport.contains(event.target)))
      )
        return
      userOwned.current = true
      shifted.current = { x: 0, y: 0 }
    }
    document.addEventListener('canvas-camera-gesture', gesture)
    document.addEventListener('canvas-camera-change', gesture)
    return () => {
      document.removeEventListener('canvas-camera-gesture', gesture)
      document.removeEventListener('canvas-camera-change', gesture)
    }
  }, [content])
  useEffect(() => {
    if (!active || !keep) {
      if (!userOwned.current && (shifted.current.x || shifted.current.y))
        panBy(-shifted.current.x, -shifted.current.y, 'structure-draft')
      shifted.current = { x: 0, y: 0 }
      session.current = false
      userOwned.current = false
      return
    }
    session.current = true
    if (userOwned.current) return
    let waiting = true
    const measure = () => {
      if (!waiting || userOwned.current) return
      const board = draftBoard?.current
      if (!board || !content.current?.contains(board)) return
      const marker = board.querySelector<HTMLElement>(
        '[data-structure-placeholder]',
      )
      const view = content.current
        .closest('[data-zoom-pan-viewport]')
        ?.getBoundingClientRect()
      const panel = document.querySelector<HTMLElement>(
        '[data-cell-detail-panel]',
      )
      if (!marker || !view || !panel) return
      waiting = false
      const box = marker.getBoundingClientRect()
      const panelInset = Number.parseFloat(getComputedStyle(panel).right) || 0
      const right =
        Math.min(
          panel.getBoundingClientRect().left,
          view.right - panel.offsetWidth - panelInset,
        ) - 16
      const dx = kind === 'step' ? Math.min(0, right - box.right) : 0
      const dy =
        box.top < view.top + 16
          ? view.top + 16 - box.top
          : box.bottom > view.bottom - 16
          ? view.bottom - 16 - box.bottom
          : 0
      if (!dx && !dy) return
      shifted.current.x += dx
      shifted.current.y += dy
      panBy(dx, dy, 'structure-draft')
    }
    const frame = requestAnimationFrame(() => {
      if (!document.documentElement.hasAttribute('data-structure-motion'))
        measure()
    })
    document.addEventListener('structure-motion-end', measure)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('structure-motion-end', measure)
    }
  }, [active, keep, placement, kind, draftBoard, content, panBy])
}
