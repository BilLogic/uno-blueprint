import { createContext, useContext } from 'react'
import { requestPanelTransition } from '@/lib/openPanelStore'

/**
 * What the canvas is for right now.
 *
 * `view` is reading, navigating and annotating — the app as it has always
 * behaved. `design` turns the same canvas into an authoring surface: cells
 * become selectable, and the toolbar swaps its annotation tools for creation
 * ones rather than growing a second row.
 *
 * Scope is **one mode for the whole session**, held in the module store below.
 * It was per-surface once — the base canvas and each slice tab holding their
 * own mode — and that is what this comment used to say long after it stopped
 * being true.
 */
export type CanvasMode = 'view' | 'design'

export type CanvasModeContextValue = {
  mode: CanvasMode
  setMode: (mode: CanvasMode) => void
  /** False when this session cannot write; the switch is hidden, not disabled. */
  available: boolean
}

export const CanvasModeContext = createContext<CanvasModeContextValue | null>(
  null,
)

/*
  The shared mode store lives here (not in the provider component file) so
  non-React code — the agent's UI-context collector — can read it too.
*/
let sharedMode: CanvasMode = 'view'
let listeners: Array<() => void> = []

/**
 * Whether this session may enter design mode at all.
 *
 * The provider guards its own `setMode`, but the provider is not the only
 * caller: the agent tool `set_canvas_mode` reaches this setter directly, and
 * it is not a write tool, so nothing else stops it. A view-only session could
 * park `'design'` here and every surface would snap into Edit the moment
 * write access returned — the exact bug the provider guard was added to close.
 * The permission has to live with the state, not with one of its callers.
 */
let sharedModeAvailable = false

export function setSharedCanvasModeAvailable(available: boolean) {
  sharedModeAvailable = available
  if (!available) { sharedMode = 'view'; for (const listener of listeners) listener() }
}

export function setSharedCanvasMode(mode: CanvasMode) {
  const next = sharedModeAvailable ? mode : 'view'
  if (next === sharedMode) return true
  return requestPanelTransition(() => {
    sharedMode = next
    for (const listener of listeners) listener()
  })
}

export function subscribeSharedCanvasMode(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

export function getSharedCanvasMode(): CanvasMode {
  return sharedMode
}

/**
 * Null outside a provider — surfaces that never author (presentation, the
 * landing page) simply do not supply one, and the toolbar reads that as
 * "view only" rather than needing its own flag.
 */
export function useCanvasMode(): CanvasModeContextValue | null {
  return useContext(CanvasModeContext)
}

/** The mode, defaulting to `view` wherever no provider exists. */
export function useCanvasModeValue(): CanvasMode {
  return useContext(CanvasModeContext)?.mode ?? 'view'
}
