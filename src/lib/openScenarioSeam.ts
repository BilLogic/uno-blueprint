/**
 * Pointers the scenario-open seam reads without subscribing to the path
 * store, the tab store, or the mobile drawer. Those three providers register
 * here; the editor context calls through. None of the providers import one
 * another — the same reason `BoardAddressSync` is a bridge rather than a
 * method on any of them.
 */

type ActivateTab = (key: null) => void
type SelectDefaultPath = (scenarioId: string, alsoPathId?: string) => void
type CloseNav = () => void

let activateTabImpl: ActivateTab | null = null
let selectDefaultPathImpl: SelectDefaultPath | null = null
let closeNavImpl: CloseNav | null = null

/**
 * Register the tab store's "return to the base blueprint view" action.
 *
 * @param activateTab - `activateTab(null)`, or `null` on unmount.
 */
export function registerOpenScenarioActivateTab(
  activateTab: ActivateTab | null,
): void {
  activateTabImpl = activateTab
}

/**
 * Register the path store's default-path apply.
 *
 * @param selectDefaultPath - Opens a scenario on its default path, or `null` on unmount.
 */
export function registerOpenScenarioDefaultPath(
  selectDefaultPath: SelectDefaultPath | null,
): void {
  selectDefaultPathImpl = selectDefaultPath
}

/**
 * Register the mobile drawer closer so `openScenario(..., { closeNav: true })`
 * can shut it. Desktop never registers one, so the flag is a no-op there.
 *
 * @param closeNav - Function that closes the nav drawer, or `null` on unmount.
 */
export function registerOpenScenarioCloseNav(closeNav: CloseNav | null): void {
  closeNavImpl = closeNav
}

/**
 * Drop the closer only if it is still the one that registered. A stale
 * unmount must not clear a closer a newer mount already put in the slot.
 *
 * @param closeNav - The closer this caller registered.
 */
export function unregisterOpenScenarioCloseNav(closeNav: CloseNav): void {
  if (closeNavImpl === closeNav) closeNavImpl = null
}

/**
 * Leave any slice/present tab so the opened scenario is visible.
 */
export function activateBaseView(): void {
  activateTabImpl?.(null)
}

/**
 * Select the scenario's default path (last-viewed if it still exists, else
 * the happy path). No-op when the path store is not mounted.
 *
 * @param scenarioId - Scenario whose default path should become the filter.
 * @param alsoPathId - A path to show beside the default.
 */
export function selectOpenScenarioDefaultPath(
  scenarioId: string,
  alsoPathId?: string,
): void {
  selectDefaultPathImpl?.(scenarioId, alsoPathId)
}

/**
 * Close the mobile nav drawer when a caller asked `openScenario` to. No-op
 * when nothing has registered.
 */
export function closeOpenScenarioNav(): void {
  closeNavImpl?.()
}
