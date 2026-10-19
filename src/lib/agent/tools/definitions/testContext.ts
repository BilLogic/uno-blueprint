import { listSessions, getSession, getChanges } from '@/lib/agent/tools/browserHistory'
import type { ToolContext, ToolUi } from '@/lib/agent/tools/definition'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import { scopeOf } from '@/lib/agent/tools/serviceScope'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'

/**
 * A context a test builds by hand. Every field has an inert default, so a
 * test names only what its tool touches — a client for a read, a canvas
 * that records for a navigation tool — and nothing else exists to be mocked.
 *
 * Test support, not application code: the app builds its context in the
 * dispatcher from the live shells, and nothing in the app imports this.
 */

/**
 * A canvas that records what it was asked and answers with the record. The
 * controls it reports are fixed; `mutating` names the ones that change data.
 */
export function recordingUi(mutating: ReadonlySet<string> = new Set()): {
  ui: ToolUi
  log: string[]
} {
  const log: string[] = []
  const note = (line: string) => {
    log.push(line)
    return line
  }
  const ui: ToolUi = {
    openPhase: async (id) => note(`openPhase ${id}`),
    openScenario: async (id) => note(`openScenario ${id}`),
    focusCell: async (id) => note(`focusCell ${id}`),
    openCellPanel: async (id) => note(`openCellPanel ${id}`),
    setSidebar: (collapsed) => note(`setSidebar ${collapsed}`),
    setCanvasMode: (mode) => {
      note(`setCanvasMode ${mode}`)
    },
    annotateCells: (ids, text) => note(`annotateCells ${ids.join(',')}${text ? ` "${text}"` : ''}`),
    uiState: () => '',
    listCommands: () => 'zoom_in\nundo_last_change [changes data]',
    commandMutates: (command) => mutating.has(command),
    runCommand: async (command, value) => note(`runCommand ${command}${value ? ` ${value}` : ''}`),
  }
  return { ui, log }
}

/** The service a test's session runs under unless it names another. */
export const TEST_SERVICE = { id: 'svc-1', slug: 'svc-1', name: 'Test service' }

export function fakeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    client: null,
    scope: scopeOf(TEST_SERVICE),
    session: { id: 'test-session', attributed: (work) => work() },
    ui: recordingUi().ui,
    offlineBoard: PACKAGE_OFFLINE_BOARD,
    roster: TOOL_DEFINITIONS,
    history: {
      listSessions: () => { throw new Error('This test must supply conversation history.') },
      getSession: async () => { throw new Error('This test must supply conversation history.') },
    },
    meaning: null,
    history: { listSessions, getSession, getChanges },
    ...overrides,
  }
}
