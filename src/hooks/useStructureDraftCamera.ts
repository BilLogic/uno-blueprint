import { useEffect, useRef, type RefObject } from 'react'
import { useStructurePreview } from '@/contexts/EntityDetailContext'

/** Keep the new row or column beside the floating inspector, then return the camera. */
export function useStructureDraftCamera(
  content: RefObject<HTMLDivElement | null>,
  panBy: (dx: number, dy: number) => void,
  active: boolean,
) {
  const context = useStructurePreview()
  const shifted = useRef({ x: 0, y: 0 })
  const keep = Boolean(
    context?.selection?.draft || context?.selection?.focusNext,
  )
  useEffect(() => {
    if (!active || !keep) {
      if (shifted.current.x || shifted.current.y) {
        panBy(-shifted.current.x, -shifted.current.y)
        shifted.current = { x: 0, y: 0 }
      }
      return
    }
    const frame = requestAnimationFrame(() => {
      const board = context?.draftBoard.current
      if (!board || !content.current?.contains(board)) return
      const marker = board.querySelector<HTMLElement>(
        '[data-structure-placeholder]',
      )
      const view = content.current
        ?.closest('[data-zoom-pan-viewport]')
        ?.getBoundingClientRect()
      const panel = document.querySelector<HTMLElement>(
        '[data-cell-detail-panel]',
      )
      if (!marker || !view || !panel) return
      const box = marker.getBoundingClientRect()
      const panelInset = Number.parseFloat(getComputedStyle(panel).right) || 0
      const right =
        Math.min(
          panel.getBoundingClientRect().left,
          view.right - panel.offsetWidth - panelInset,
        ) - 16
      const dx =
        context?.preview?.kind === 'step' ? Math.min(0, right - box.right) : 0
      const dy =
        box.top < view.top + 16
          ? view.top + 16 - box.top
          : box.bottom > view.bottom - 16
          ? view.bottom - 16 - box.bottom
          : 0
      if (!dx && !dy) return
      shifted.current.x += dx
      shifted.current.y += dy
      panBy(dx, dy)
    })
    return () => cancelAnimationFrame(frame)
  }, [active, keep, context?.preview, context?.draftBoard, content, panBy])
}
