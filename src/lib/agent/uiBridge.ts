import { requestPanelTransition } from '@/lib/openPanelStore'
import { resolveActiveFocusCells } from '@/lib/canvasFocusCells'
import {
  awaitPublishedJump,
  awaitSelfAnsweringJump,
  verdictOfFlight,
} from '@/lib/canvasJump'
import { namesSelection } from '@/lib/shellContext'

/**
 * The agent's hands on the UI itself — camera and navigation, not data.
 * The shell registers the editor's navigation callbacks here so the tool
 * layer (plain functions, no React) can drive them when the user says
 * "take me to the intake scenario".
 *
 * Deliberately tiny: navigation only. Anything that *changes* data goes
 * through the write tools and the ledger; moving the camera is free.
 */
export type AgentUiBridge = {
  selectPhase: (phaseId: string) => void
  selectScenario: (scenarioId: string) => void
  /** Open the ✦ sidebar surface (used by "Send to the agent" hand-offs). */
  openAgentSurface: () => void
  /**
   * Collapse/expand the sidebar. A shell with no sidebar to drive returns
   * its own honest message instead of letting the default "Sidebar
   * collapsed." claim success for a no-op.
   */
  setSidebarCollapsed: (collapsed: boolean) => void | string
}

let bridge: AgentUiBridge | null = null

export function registerAgentUiBridge(next: AgentUiBridge): () => void {
  bridge = next
  return () => {
    if (bridge === next) bridge = null
  }
}

/**
 * How long the tool polls the shell's reported context for the selection it
 * asked for. Its own number because it waits on its own thing: a shell
 * re-rendering and re-reporting which phase or scenario it holds, which no
 * measurement of the camera's fade-plus-remount-plus-fit says anything about.
 * Held at the value it has always had, so the sentence a model reads when
 * this expires arrives when it always did. Exported so a test can name it
 * rather than borrow the camera's number and prove nothing about which clock
 * this wait is on.
 */
export const SELECTION_POLL_DEADLINE_MS = 1800

/**
 * Selection remains independently verified from the shell context. Camera
 * completion is not inferred from that context: idle is also what a cancelled
 * or superseded flight looks like, so the viewport publishes its exact result
 * and `canvasJump` answers with it.
 */
async function waitForNavigation(
  kind: 'phase' | 'scenario',
  id: string,
): Promise<boolean> {
  const deadline = performance.now() + SELECTION_POLL_DEADLINE_MS
  while (performance.now() < deadline) {
    // Recognised by the module that renders the line, so a shell cannot
    // change how it reports a selection out from under the check that reads
    // it — the drift this used to have its own pattern for.
    if (namesSelection(collectAgentUiContext(), kind, id)) return true
    await new Promise((done) => setTimeout(done, 25))
  }
  return false
}

async function openAndAwaitNavigation(
  kind: 'phase' | 'scenario',
  id: string,
  select: (id: string) => void,
) {
  // The jump owns the ordering: it is listening before `select` runs, because
  // the verdict is published by the fit the selection triggers. The selection
  // poll starts as soon as the commit has happened, so the two halves are
  // still awaited together rather than end to end.
  const jump = awaitPublishedJump(id, () => select(id))
  const [selected, verdict] = await Promise.all([
    waitForNavigation(kind, id),
    jump,
  ])
  const noun = kind === 'phase' ? 'Phase' : 'Scenario'
  if (!selected)
    return `${noun} navigation started, but the selected ${kind} was not verified before timeout.`
  if (verdict === 'unanswered')
    return `${noun} navigation selected the target, but its camera outcome was not verified before timeout.`
  if (verdict !== 'landed')
    return `${noun} navigation was ${verdict}; the camera was not claimed as landed.`
  return cameraSettled(kind)
}

/**
 * The one sentence a landed navigation answers with. A template rather than
 * two constants because the noun is the only difference, and exported because
 * the eval harness rehearses `open_phase` / `open_scenario` without a canvas
 * and must answer in these words rather than in a copy of them.
 */
export function cameraSettled(kind: 'phase' | 'scenario'): string {
  return `Opened the ${kind} and settled its canvas camera.`
}

export async function agentOpenPhase(phaseId: string): Promise<string> {
  if (!bridge) return 'UI navigation is not available right now.'
  return openAndAwaitNavigation('phase', phaseId, bridge.selectPhase)
}

export async function agentOpenScenario(scenarioId: string): Promise<string> {
  if (!bridge) return 'UI navigation is not available right now.'
  return openAndAwaitNavigation('scenario', scenarioId, bridge.selectScenario)
}

export function openAgentSurface(): boolean {
  if (!bridge) return false
  bridge.openAgentSurface()
  return true
}

/** What a landed cell focus answers with — exported for the reason `cameraSettled` is. */
export const CELL_CAMERA_SETTLED = 'Focused the active canvas camera on the cell.'

/**
 * A camera fly resolves from a `requestAnimationFrame` step, and a hidden
 * tab suspends those — the promise would never settle and the agent loop
 * (a bare await, no abort wired to tool execution) would wedge with it.
 * So: no animation when hidden (the fit commits synchronously), and the jump's
 * own deadline regardless. Silence is reported as unverified, never as landed.
 *
 * This focus answers for itself rather than publishing against a target, which
 * is why it takes the self-answering form of the handshake — same deadline,
 * same four verdict words.
 */
export async function agentFocusCell(cellId: string): Promise<string> {
  const focus = resolveActiveFocusCells()
  if (!focus)
    return 'No active canvas camera is available right now — open the scenario first.'
  const jump = await awaitSelfAnsweringJump(
    () => focus([cellId], { animate: !document.hidden }),
    // A cell the board does not hold is a flight that never left, so there is
    // no verdict to give it: `null` says exactly that, where `cancelled` used
    // to say a flight had been taken back from something that never moved.
    (result) => (result.kind === 'miss' ? null : verdictOfFlight(result.completion)),
  )
  // Every branch reads the verdict. Asking the answer whether it is null and
  // calling that silence was the private inference this handshake exists to
  // delete: it was right only for as long as a focus result could not itself
  // be null, which is a promise the focus pipeline never made.
  if (jump.verdict === 'unanswered')
    return 'The camera focus started but was not verified before timeout; the cell was not claimed as landed.'
  if (jump.verdict === null)
    return 'That cell is not on the active canvas — open its scenario first, then retry.'
  if (jump.verdict !== 'landed')
    return `The camera focus was ${jump.verdict}; the cell was not claimed as landed.`
  return CELL_CAMERA_SETTLED
}

export function agentSetSidebar(collapsed: boolean): string {
  if (!bridge) return 'UI control is not available right now.'
  const override = bridge.setSidebarCollapsed(collapsed)
  if (typeof override === 'string') return override
  return collapsed ? 'Sidebar collapsed.' : 'Sidebar expanded.'
}

/**
 * Open the cell detail panel by driving the SAME gesture the human uses:
 * a ⌘-click on the rendered cell (the grammar's "open detail, touch
 * nothing" move, valid in every mode). No parallel code path to drift —
 * and the result is VERIFIED, not assumed: the tool checks the panel
 * actually mounted and says so honestly when it didn't.
 *
 * Sharing the human's handler means sharing its toggle: a bare click on the
 * cell the panel is already showing now CLOSES it. This stays an open, not a
 * toggle, and `detailClickCloses` refuses twice over — ⌘-click is never the
 * close gesture, and the dispatched event's `isTrusted` is false. Opening a
 * cell that is already open must leave it open; an agent asked to show
 * something and hiding it instead is the worst possible reading of the tool.
 */
export async function agentOpenCellPanel(cellId: string): Promise<string> {
  const el = document.querySelector<HTMLElement>(
    `[data-blueprint-cell="${CSS.escape(cellId)}"][data-blueprint-cell-interactive]`,
  )
  if (!el)
    return 'That cell is not clickable on the current canvas — open its scenario first (open_scenario), then retry.'
  // Bring the cell into view first, best-effort: a fly that was superseded
  // (the scenario's landing fit, a resize refit, a user gesture) or timed
  // out is a CAMERA outcome, not a reason to withhold the click — the cell
  // is rendered and clickable either way. The camera note rides along on
  // the result so the agent does not claim a landing that did not happen.
  const focusResult = await agentFocusCell(cellId)
  const cameraNote = focusResult.startsWith('Focused') ? '' : ` Camera: ${focusResult}`
  // ⌘-click is the grammar's "open detail, touch nothing" gesture — it works
  // identically in view and design mode (a bare click PICKS when a picker is
  // armed, and dblclick deliberately does nothing).
  if (!requestPanelTransition(() => el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
  ))) return 'Panel transition is awaiting a draft decision or the editor is busy.'
  // Verify instead of assuming: the cell-detail context registers its
  // selection-scoped `cell-panel` UI-context contributor only while a cell
  // is actually selected, so its presence IS "the panel opened on a cell".
  // The panel's UI *commands* are the wrong probe now that the drawer can
  // be open on the ledger with no selection — they would false-positive.
  // (Headless panes defer the open past document.hidden — don't false-fail
  // there.)
  const deadline = performance.now() + 1000
  while (
    !document.hidden &&
    !hasAgentUiContext('cell-panel') &&
    performance.now() < deadline
  ) {
    await new Promise((done) => setTimeout(done, 25))
  }
  if (document.hidden || hasAgentUiContext('cell-panel'))
    return `Opened the cell detail panel.${cameraNote}`
  return `The click landed but the panel did not open. Likely causes: the hand (pan) tool is active — ask the user to switch tools — or the cell sits in a dimmed phase under focus mode. The panel is NOT open; do not claim it is.${cameraNote}`
}

// The annotator lives with the annotation provider (it owns stroke state
// and colors); registered like the nav bridge.
type AgentAnnotator = (cellIds: string[], note?: string) => string

let annotator: AgentAnnotator | null = null

export function registerAgentAnnotator(next: AgentAnnotator): () => void {
  annotator = next
  return () => {
    if (annotator === next) annotator = null
  }
}

export function agentAnnotateCells(cellIds: string[], note?: string): string {
  if (!annotator)
    return 'No annotatable canvas is open right now — open a scenario first.'
  return annotator(cellIds, note)
}

// ---------------------------------------------------------------------------
// UI context — the read side of the bridge. Scattered surfaces (shell,
// canvas viewport, cell panel, design-mode picker) each register a
// contributor that describes their live state in a line or two; the agent
// panel and the get_ui_state tool collect them all. Same shape as the
// navigation bridge: module registry, so the tool layer needs no React.
// ---------------------------------------------------------------------------

type UiContextContributor = () => string | null

const contributors = new Map<string, UiContextContributor>()

export function registerAgentUiContext(
  key: string,
  contributor: UiContextContributor,
): () => void {
  contributors.set(key, contributor)
  return () => {
    if (contributors.get(key) === contributor) contributors.delete(key)
  }
}

/** Presence probe — contributors register while their surface state exists,
 * so "the `cell-panel` contributor exists" IS "a cell is open in the panel". */
export function hasAgentUiContext(key: string): boolean {
  return contributors.has(key)
}

/** All registered contributors' lines, empty string when nothing reports. */
export function collectAgentUiContext(): string {
  const lines: string[] = []
  for (const contributor of contributors.values()) {
    try {
      const line = contributor()
      if (line) lines.push(line)
    } catch {
      // A broken contributor should never take the send down with it.
    }
  }
  return lines.join('\n')
}
