import { createContext, useContext } from 'react'

/**
 * The shell's `asideHidden`, handed to the docked agent.
 *
 * The cover page, a presentation and a reader's collapse take the aside to
 * zero width without unmounting it, so the docked chat keeps its draft,
 * scroll and run. What it draws inside the aside goes with the aside; what
 * it portals out of the clip does not — the composer's slash menu, which
 * only the draft shuts, was left floating over the cover page. It reads
 * this and stays shut while it is true.
 */
export const AgentAsideHiddenContext = createContext(false)

export const useAgentAsideHidden = () => useContext(AgentAsideHiddenContext)
