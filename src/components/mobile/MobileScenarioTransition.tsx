import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MOTION_EASE, MOTION_FADE_MS, prefersReducedMotion } from '@/lib/motion'

type MobileScenarioTransitionProps = {
  scenarioId: string | null
  children: (
    displayedScenarioId: string | null,
    onIncomingFitReady: () => void,
  ) => ReactNode
}

/**
 * Mobile replaces one spatial world with another. Keep the outgoing board
 * mounted while it fades out, swap while fully transparent, then reveal the
 * incoming board after its mount-time fit has run.
 */
export function MobileScenarioTransition({
  scenarioId,
  children,
}: MobileScenarioTransitionProps) {
  const [displayedScenarioId, setDisplayedScenarioId] = useState(scenarioId)
  const displayedScenarioRef = useRef(displayedScenarioId)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')

  useEffect(() => {
    if (scenarioId === displayedScenarioRef.current) {
      setPhase('idle')
      return
    }
    if (displayedScenarioRef.current === null || prefersReducedMotion()) {
      displayedScenarioRef.current = scenarioId
      setDisplayedScenarioId(scenarioId)
      setPhase('idle')
      return
    }

    setPhase('out')
    const timer = window.setTimeout(() => {
      displayedScenarioRef.current = scenarioId
      setDisplayedScenarioId(scenarioId)
      setPhase('in')
    }, MOTION_FADE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [scenarioId])

  const revealIncoming = useCallback(() => {
    setPhase((current) => (current === 'in' ? 'idle' : current))
  }, [])

  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col"
      data-editor-view
      data-mobile-scenario-swap={phase}
      style={{
        opacity: phase === 'idle' ? 1 : 0,
        transition: `opacity ${MOTION_FADE_MS}ms ${MOTION_EASE.arrive}`,
      }}
    >
      {children(displayedScenarioId, revealIncoming)}
    </div>
  )
}
