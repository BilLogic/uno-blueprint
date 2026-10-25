import { animate, type AnimationPlaybackControls } from 'framer-motion'
import { useLayoutEffect, useRef, useState } from 'react'
import type { StructureSeam } from '@/contexts/EntityDetailContext'
import {
  EASE_POINTS,
  MOTION_STRUCTURAL_MS,
  prefersReducedMotion,
} from '@/lib/motion'

/** Commit the track before starting its clock; React's board projection is not an animation frame. */
export function useAnimatedStructureSeam(
  target: StructureSeam | null,
  immediate: boolean,
) {
  const [visible, setVisible] = useState<StructureSeam | null>(null)
  const progress = useRef(0)
  const key = useRef<string | null>(null)
  const instant = immediate || prefersReducedMotion()
  const latestTarget = useRef(target)
  useLayoutEffect(() => {
    latestTarget.current = target
  }, [target])
  const next = immediate ? null : target
  if (instant && visible !== next) setVisible(next)
  else if (!instant && target && !visible) setVisible(target)
  const opening = Boolean(visible && target?.key === visible.key)
  useLayoutEffect(() => {
    if (!visible) return
    if (key.current !== visible.key) {
      progress.current = 0
      key.current = visible.key
    }
    const scope =
      document
        .querySelector<HTMLElement>(
          `[data-structure-path="${CSS.escape(
            visible.pathId,
          )}"], [data-structure-paths~="${CSS.escape(visible.pathId)}"]`,
        )
        ?.closest<HTMLElement>('[data-focus-slide-id]') ??
      document.documentElement
    const style = scope.style
    const frame = (value: number) => {
      progress.current = value
      style.setProperty('--structure-seam-progress', String(value))
    }
    if (instant) {
      frame(1)
      return
    }
    const from = progress.current
    frame(from)
    document.documentElement.dataset.structureMotion = ''
    let playback: AnimationPlaybackControls | undefined
    let request = requestAnimationFrame(() => {
      request = requestAnimationFrame(() => {
        playback = animate(from, opening ? 1 : 0, {
          // A short insertion gap uses three quarters of the structural duration.
          duration:
            (MOTION_STRUCTURAL_MS * 0.75 * Math.abs((opening ? 1 : 0) - from)) /
            1000,
          ease: EASE_POINTS.move,
          onUpdate: frame,
          onComplete: () => {
            if (!opening) {
              progress.current = 0
              key.current = latestTarget.current?.key ?? null
              setVisible(latestTarget.current)
            }
            delete document.documentElement.dataset.structureMotion
            document.dispatchEvent(new Event('structure-motion-end'))
          },
        })
      })
    })
    return () => {
      cancelAnimationFrame(request)
      playback?.stop()
      delete document.documentElement.dataset.structureMotion
    }
  }, [opening, visible, instant])
  return immediate ? null : visible
}
