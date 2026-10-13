import { createContext, useContext } from 'react'

/**
 * Whether the agent is mounted but off screen.
 *
 * The docked agent lives in the sidebar, and the sidebar does not unmount
 * when it hides — the cover page, a presentation and a reader's collapse all
 * take the aside to zero width and fade its body, so the chat (draft,
 * scroll, a run in flight) is still there when the reader comes back. What
 * is drawn INSIDE the aside goes with it. What is portalled out of it does
 * not: the composer's slash menu is anchored to the composer but rendered on
 * the body, and is shut by the draft rather than by an outside press, so a
 * hidden aside left it floating over whatever replaced the workspace.
 *
 * Portalled surfaces the reader cannot dismiss by pressing elsewhere read
 * this and stay shut while it is true.
 */
export const AgentConcealedContext = createContext(false)

export const useAgentConcealed = () => useContext(AgentConcealedContext)
