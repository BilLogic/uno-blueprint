import { useCallback, useEffect, useRef } from 'react'
import type { MobileNavSurface } from '@/components/mobile/MobileNavSheet'
import { onAgentSettingsAsked } from '@/lib/agent/settings'

/**
 * The phone's answer to "show the key settings" — the ask the agent's Add
 * API key… makes without knowing which layout is on screen. The desktop
 * answers with the rail's ⚙ popover; the phone has no rail, and its key
 * fields are the drawer's Settings surface. So the drawer opens there, and
 * the agent sheet steps aside first: two modal sheets stacked would leave
 * the drawer behind the agent's scrim.
 *
 * The ask is an event here, not a state: the drawer's own open state is what
 * stays up, so nothing latches and a second tap asks again. When the reader
 * DISMISSES that drawer they go back to where the ask came from — the agent
 * sheet if it was up, and the surface the drawer was last left on. A drawer
 * closed by navigating (a scenario or slice picked from it) has taken the
 * reader somewhere new, and restores nothing.
 *
 * Returns the drawer's open-change handler, which is where a dismissal is
 * told apart from a close by navigation: only the drawer's own controls go
 * through it.
 */
export function usePhoneSettingsAsk({
  navOpen,
  setNavOpen,
  navSurface,
  setNavSurface,
  agentOpen,
  setAgentOpen,
}: {
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  navSurface: MobileNavSurface
  setNavSurface: (surface: MobileNavSurface) => void
  agentOpen: boolean
  setAgentOpen: (open: boolean) => void
}): (next: boolean) => void {
  const returnTo = useRef<{
    agentOpen: boolean
    surface: MobileNavSurface
  } | null>(null)

  // A close by any other route forgets the way back. Declared BEFORE the
  // subscription, so on mount it runs first and cannot wipe what a pending
  // ask records in the same commit.
  useEffect(() => {
    if (!navOpen) returnTo.current = null
  }, [navOpen])

  // Mirrors for the subscription, which registers once.
  const agentOpenRef = useRef(agentOpen)
  const navSurfaceRef = useRef(navSurface)
  useEffect(() => {
    agentOpenRef.current = agentOpen
    navSurfaceRef.current = navSurface
  }, [agentOpen, navSurface])

  useEffect(
    () =>
      onAgentSettingsAsked(() => {
        returnTo.current ??= {
          agentOpen: agentOpenRef.current,
          surface: navSurfaceRef.current,
        }
        setAgentOpen(false)
        setNavSurface('settings')
        setNavOpen(true)
      }),
    [setAgentOpen, setNavSurface, setNavOpen],
  )

  return useCallback(
    (next: boolean) => {
      setNavOpen(next)
      const back = returnTo.current
      if (next || !back) return
      returnTo.current = null
      setNavSurface(back.surface)
      if (back.agentOpen) setAgentOpen(true)
    },
    [setNavOpen, setNavSurface, setAgentOpen],
  )
}
