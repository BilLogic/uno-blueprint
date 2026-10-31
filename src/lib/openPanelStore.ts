/**
 * Which panel owns the drawer — one fact, one owner.
 *
 * The cell panel and the entity panels (lane, phase, scenario) are separate
 * React contexts rendering separate drawers, and only one may be open: they
 * occupy the same screen position, and each portals its Save/Cancel row into a
 * global DOM id. Two providers cannot see each other's state, so the exclusion
 * lives here instead of in either of them.
 *
 * Deliberately NOT a second boolean beside each panel's own open state. Each
 * panel still owns "am I open"; this owns "who is allowed to be", and a panel
 * that loses the claim closes itself. The alternative — each provider setting
 * the other's state — is two owners of one fact reconciled asynchronously,
 * which is the bug class the cell panel's own `open` had to be rewritten to
 * escape.
 */
export type PanelOwner = 'cell' | 'entity'

let owner: PanelOwner | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function getPanelOwner(): PanelOwner | null {
  return owner
}

export function subscribePanelOwner(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Take the drawer. Whoever held it hears about it and closes. */
export function claimPanel(next: PanelOwner): void {
  if (owner === next) return
  owner = next
  emit()
}

/**
 * Give the drawer back — only if you still hold it. The guard matters: a
 * closing panel runs its own teardown *after* the new panel has claimed, and
 * an unguarded release would hand the drawer back to nobody and close the
 * panel that just opened.
 */
export function releasePanel(which: PanelOwner): void {
  if (owner !== which) return
  owner = null
  emit()
}

/** The active editor owns the decision; callers submit the entire transition. */
type PanelTransitionGuard = (action: () => void) => boolean
let transitionGuard: PanelTransitionGuard | null = null
export function registerPanelTransitionGuard(guard: PanelTransitionGuard): () => void {
  transitionGuard = guard
  return () => { if (transitionGuard === guard) transitionGuard = null }
}
export function requestPanelTransition(action: () => void): boolean {
  let ran = false
  const once = () => { if (!ran) { ran = true; action() } }
  if (transitionGuard) return transitionGuard(once)
  once()
  return true
}
