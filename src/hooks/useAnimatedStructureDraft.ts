import { useLayoutEffect, type RefObject } from 'react'
import { animate, type AnimationPlaybackControls } from 'framer-motion'
import {
  EASE_POINTS,
  MOTION_STRUCTURAL_MS,
  prefersReducedMotion,
} from '@/lib/motion'

export function useAnimatedStructureDraft(
  key: number | undefined,
  board: RefObject<Element | null>,
  ready: boolean,
) {
  useLayoutEffect(() => {
    if (key === undefined) return
    const scope = board.current?.closest<HTMLElement>('[data-focus-slide-id]')
    if (!scope) return
    if (!ready) {
      scope.style.setProperty('--structure-draft-progress', '0')
      return
    }
    const finish = () => {
      scope.style.setProperty('--structure-draft-progress', '1')
      delete document.documentElement.dataset.structureMotion
      document.dispatchEvent(new Event('structure-motion-end'))
    }
    if (prefersReducedMotion()) {
      finish()
      return
    }
    scope.style.setProperty('--structure-draft-progress', '0')
    document.documentElement.dataset.structureMotion = ''
    // Mounting the create panel can occupy the first frame. Start the clock
    // only once the narrow draft track has actually reached the screen.
    let playback: AnimationPlaybackControls | undefined
    let request = requestAnimationFrame(() => {
      request = requestAnimationFrame(() => {
        playback = animate(0, 1, {
          duration: MOTION_STRUCTURAL_MS / 1000,
          ease: EASE_POINTS.move,
          onUpdate: (value) =>
            scope.style.setProperty(
              '--structure-draft-progress',
              String(value),
            ),
          onComplete: finish,
        })
      })
    })
    return () => {
      cancelAnimationFrame(request)
      playback?.stop()
      finish()
    }
  }, [key, board, ready])
}
