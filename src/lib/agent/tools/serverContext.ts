import { readServerSession } from '@/lib/agent/server/history'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ToolSpec } from '@/lib/agent/providers/provider'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import { runTool, toolSpec, type ToolContext, type ToolUi } from '@/lib/agent/tools/definition'
import { sessionRoster, type RosterMode } from '@/lib/agent/tools/roster'
import { admitToolCall } from '@/lib/agent/tools/admission'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { noSuchToolRefusal } from '@/lib/agent/tools/refusals'

function noCanvas(): never {
  throw new Error('There is no canvas in a server tool context.')
}

function noServerWrites(): never {
  throw new Error('Writes are not available on the server yet.')
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
  signal?: AbortSignal
  /** A transport adapter, for a standalone PostgREST without the project prefix. */
  fetch?: typeof fetch
}): ServerToolContext {
  const client = createClient<Database>(options.url, options.publishableKey, {
    accessToken: async () => options.jwt,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: options.fetch },
  })
  const mode: RosterMode = {
    server: true,
    sampleTrial: false, mobileReading: false, allowWrites: false,
    searchOffered: false,
  }
  const roster = sessionRoster(mode)
  const context: ToolContext = {
    client, scope: options.scope,
    session: { id: options.sessionId, attributed: noServerWrites },
    ui: serverUi, offlineBoard: PACKAGE_OFFLINE_BOARD, roster,
    history: { listSessions: noCanvas, getSession: id => readServerSession(client, id) },
    signal: options.signal,
  }
  return {
    roster: roster.map(toolSpec),
    async call(name, args) {
      const tool = findToolDefinition(name)
      const admission = admitToolCall({
        mode, name,
        facts: {
          aborted: options.signal?.aborted ?? false,
          isWrite: tool?.surface === 'write', writesThisSend: 0, repeatRead: false,
        },
      })
      if (!admission.admitted) return admission.refusal
      if (!tool) return noSuchToolRefusal(name)
      return runTool(tool, args, context)
    },
  }
}
