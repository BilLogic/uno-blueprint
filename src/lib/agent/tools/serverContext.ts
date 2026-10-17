import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ToolSpec } from '@/lib/agent/providers/provider'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import { runTool, toolSpec, type ToolContext, type ToolUi } from '@/lib/agent/tools/definition'
import { sessionRoster } from '@/lib/agent/tools/roster'
import { UI_SURFACE_READ_TOOLS } from '@/lib/agent/tools/definitions/ui'
import { getChangeHistoryTool, getSessionTool, listSessionsTool } from '@/lib/agent/tools/definitions/sessions'
import { noSuchToolRefusal } from '@/lib/agent/tools/refusals'

/** Browser-backed history stays unavailable until it has a database reader. */
const browserReads = new Set([
  ...UI_SURFACE_READ_TOOLS,
  listSessionsTool.name,
  getSessionTool.name,
  getChangeHistoryTool.name,
])

function noCanvas(): never {
  throw new Error('There is no canvas in a server tool context.')
}

const serverUi: ToolUi = {
  openPhase: noCanvas, openScenario: noCanvas, focusCell: noCanvas,
  openCellPanel: noCanvas, setSidebar: noCanvas, setCanvasMode: noCanvas,
  annotateCells: noCanvas, uiState: noCanvas, listCommands: noCanvas,
  commandMutates: noCanvas, runCommand: noCanvas,
}

export type ServerToolContext = {
  readonly roster: readonly ToolSpec[]
  call: (name: string, args: Record<string, unknown>) => Promise<string>
}

/**
 * One caller's read context, independent of the canvas and browser stores.
 * The public key identifies the project; every database request carries the
 * caller's JWT so the database applies its existing row-level security.
 * Writes remain unavailable until their server attribution path is supplied.
 */
export function createServerToolContext(options: {
  url: string
  publishableKey: string
  jwt: string
  sessionId: string
  scope: ToolContext['scope']
  meaning?: ToolContext['meaning']
  signal?: AbortSignal
}): ServerToolContext {
  const client = createClient<Database>(options.url, options.publishableKey, {
    accessToken: async () => options.jwt,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const roster = sessionRoster({
    sampleTrial: false, mobileReading: false, allowWrites: false,
    searchOffered: options.meaning != null,
  }).filter((tool) => tool.surface === 'read' && !browserReads.has(tool.name))
  const context: ToolContext = {
    client, scope: options.scope,
    session: { id: options.sessionId, attributed: noCanvas },
    ui: serverUi, offlineBoard: PACKAGE_OFFLINE_BOARD, roster,
    meaning: options.meaning, signal: options.signal,
  }
  return {
    roster: roster.map(toolSpec),
    async call(name, args) {
      const tool = roster.find((definition) => definition.name === name)
      if (!tool) return noSuchToolRefusal(name)
      if (options.signal?.aborted) throw options.signal.reason
      return runTool(tool, args, context)
    },
  }
}
