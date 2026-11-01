import { readServerSession, listServerSessions, readServerChanges } from '@/lib/agent/server/history'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ToolSpec } from '@/lib/agent/providers/provider'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import { runTool, toolSpec, type ToolContext, type ToolUi } from '@/lib/agent/tools/definition'
import { sessionRoster, toolEnabled, type RosterMode } from '@/lib/agent/tools/roster'
import { admitToolCall } from '@/lib/agent/tools/admission'
import { findToolDefinition, TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { noSuchToolRefusal } from '@/lib/agent/tools/refusals'
import { executeServerWrite, namedCells, refuseSecrets } from '@/lib/agent/server/writes'
import { withSharedSliceLink } from '@/lib/agent/server/sharedSlice'

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
  readonly resources: readonly { name: string; uri: string; read: () => Promise<string> }[]
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
  allowWrites?: boolean
  search?: NonNullable<ToolContext['meaning']>
  /** This server's own URL, under which a shared slice's link is made. */
  toolServerUrl?: string
}): ServerToolContext {
  const client = createClient<Database>(options.url, options.publishableKey, {
    accessToken: async () => options.jwt,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: options.fetch },
  })
  const mode: RosterMode = {
    server: true,
    sampleTrial: false, mobileReading: false, allowWrites: options.allowWrites ?? false,
    searchOffered: Boolean(options.search),
  }
  const roster = sessionRoster(mode)
  const context: ToolContext = {
    client, scope: options.scope,
    session: { id: options.sessionId, attributed: noServerWrites },
    ui: serverUi, offlineBoard: PACKAGE_OFFLINE_BOARD, roster,
    history: {
      listSessions: () => listServerSessions(client),
      getSession: id => readServerSession(client, id),
      getChanges: limit => readServerChanges(client, limit),
    },
    meaning: options.search,
    signal: options.signal,
  }
  return {
    resources: TOOL_DEFINITIONS.filter(tool => tool.resource && toolEnabled(tool.name)).flatMap(tool => {
      const resource = tool.resource!
      return resource.names().map(name => ({
        name,
        uri: resource.uriPrefix + encodeURIComponent(name),
        read: () => runTool(tool, { [resource.argument]: name }, context),
      }))
    }),
    roster: roster.map(toolSpec),
    async call(name, args) {
      const tool = findToolDefinition(name)
      if (name === 'approve_suggested_change') {
        const { data, error } = await client.from('suggested_changes')
          .select('tool_name, tool_args, proposed_content').eq('id', String(args.suggested_change_id)).single()
        if (error) throw new Error(error.message)
        if (data.tool_name) {
          const original = findToolDefinition(data.tool_name)
          const raw = data.tool_args as Record<string, unknown>
          refuseSecrets(raw)
          const standing = admitToolCall({ mode, name: data.tool_name,
            facts: { aborted: options.signal?.aborted ?? false, isWrite: true, writesThisSend: 0, repeatRead: false, cellsThisCall: namedCells(raw).size } })
          if (!standing.admitted) return standing.refusal
          if (!original || !original.args.safeParse(raw).success) throw new Error('The proposed arguments no longer fit this tool. Review and propose again; nothing was written.')
        } else refuseSecrets({ content: data.proposed_content })
      }
      if (tool?.surface === 'write') {
        refuseSecrets(args)
        const accepted = new Set([...Object.keys(tool.args.shape), ...Object.keys(tool.aliases ?? {}), 'service_id', 'confirmed'])
        const unknown = Object.keys(args).find(key => !accepted.has(key))
        if (unknown) throw new Error(`Unknown write argument: ${unknown}. Use the fields listed for this tool.`)
        for (const field of ['step_count', 'at_position']) {
          const minimum = field === 'step_count' ? 1 : 0
          if (args[field] !== undefined && (!Number.isInteger(args[field]) || Number(args[field]) < minimum))
            throw new Error(`${field} must be a ${minimum ? 'positive' : 'non-negative'} integer.`)
        }
      }
      const admission = admitToolCall({
        mode, name,
        facts: {
          aborted: options.signal?.aborted ?? false,
          isWrite: tool?.surface === 'write', writesThisSend: 0, repeatRead: false,
          cellsThisCall: namedCells(args).size,
        },
      })
      if (!admission.admitted) return admission.refusal
      if (!tool) return noSuchToolRefusal(name)
      return runTool(tool, args, { ...context,
        serverWrite: async (toolName, parsed, callContext) => withSharedSliceLink(await executeServerWrite(client, toolName, parsed, {
          sessionId: options.sessionId,
          serviceId: typeof args.service_id === 'string' ? args.service_id : undefined,
          confirmed: callContext.confirmed === true,
        }), options.toolServerUrl),
      })
    },
  }
}
