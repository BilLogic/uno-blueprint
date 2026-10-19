import { listSessions, getSession } from '@/lib/agent/tools/browserHistory'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { scopeOf } from '@/lib/agent/tools/serviceScope'
import { getActiveService } from '@/contexts/activeService'
import type { AgentSearchIndex } from '@/deploymentConfig'
import { PACKAGE_OFFLINE_BOARD, type OfflineBoard } from '@/data/blueprintFallbacks'
import { runTool, type ToolContext, type ToolDefinition } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS, findToolDefinition } from '@/lib/agent/tools/definitions'
import { liveSession, liveUi } from '@/lib/agent/tools/liveContext'
import { notOnAllowListRefusal } from '@/lib/agent/tools/refusals'
import { sessionRoster } from '@/lib/agent/tools/roster'

type Client = SupabaseClient<Database>

// The spec table is `specs.ts` and the session roster is `roster.ts`, both
// derived from the definitions; this module owns only dispatch.

/**
 * What one session may reach that another may not.
 *
 * Only ranked search needs this today, and it needs it because the capability
 * is not a property of the deployment alone: it is the deployment's index list
 * MET BY the person's own provider key, which lives in their browser and is
 * known only to the caller. So the loop resolves it once per send and hands it
 * down, rather than this module reaching for a key.
 */
export type DispatchContext = {
  /**
   * The index this person's key can embed against, and that key — or `null`
   * for a keyword-and-structural run. Absent means the same as `null`.
   */
  meaning?: { index: AgentSearchIndex; apiKey: string } | null
  /**
   * The run's abort signal. Pressing Stop must reach a call that is waiting
   * on somebody else's network, not just the gap between calls.
   */
  signal?: AbortSignal
  /**
   * The offline board the surface that started this run is drawing — the
   * deployment's when it supplied one, the package's otherwise. The agent
   * panel reads it from the provider above it and hands it down here, the way
   * it hands down the roster.
   *
   * OPTIONAL on the same terms as `roster`, and with the same default rule: a
   * caller with no surface — a test, a script — gets the package's own board,
   * which is the board a clone with no deployment config draws. It is not a
   * guess at what the caller meant; it is the one board that exists when
   * nobody has said otherwise.
   */
  offlineBoard?: OfflineBoard
  /**
   * The roster this session was offered, so a served document lists exactly
   * it. The loop hands its own down; a caller with no session — a test, a
   * script — gets the whole roster for the mode the client implies.
   */
  roster?: readonly ToolDefinition[]
}

/**
 * The context a defined tool runs in, built from what the dispatcher already
 * holds. The scope is the resolved active service, read from the store here
 * because the dispatcher is the agent session's surface root — the same
 * default the interface has. The UI and the session are the live ones. A
 * test builds its own.
 */
function toolContext(
  client: Client | null,
  agentSessionId: string,
  context: DispatchContext,
): ToolContext {
  return {
    client,
    // The agent session is a surface root: it reads the resolved store the
    // shell wrote, once per call, and hands the answer down. No tool
    // resolves a slug.
    scope: scopeOf(getActiveService()),
    session: liveSession(agentSessionId),
    history: { listSessions, getSession },
    ui: liveUi,
    offlineBoard: context.offlineBoard ?? PACKAGE_OFFLINE_BOARD,
    roster:
      context.roster ??
      sessionRoster({
        sampleTrial: client === null,
        mobileReading: false,
        allowWrites: true,
        searchOffered: true,
      }),
    meaning: context.meaning ?? null,
    signal: context.signal,
  }
}

/**
 * Execute one tool call. Returns the text the model sees.
 *
 * A lookup, not a switch: every tool is a definition, and the definition
 * branches on `ctx.client` itself. A write runs attributed to the session
 * through `ctx.session`, so the ledger's ✦ badge and the canvas repaint are
 * the session's doing and not this module's. The one thing decided here is
 * the no-database trial: a definition the trial does not offer falls
 * through to the trial's refusal rather than running with no client.
 */
export async function dispatchTool(
  client: Client | null,
  agentSessionId: string,
  name: string,
  args: Record<string, unknown>,
  context: DispatchContext = {},
): Promise<string> {
  const definition = findToolDefinition(name)
  if (definition && (client !== null || definition.availability.sample)) {
    return runTool(definition, args, toolContext(client, agentSessionId, context))
  }
  if (client === null) return sampleRefusal(name)
  return notOnAllowListRefusal(name)
}

/**
 * The trial's refusal. Every tool is a definition and decides for itself
 * whether it answers without a database; a name that reaches here in the
 * no-database trial is one the trial does not offer — a write, a desktop
 * control, or a read the bundled sample cannot answer (it is a board, not a
 * deployment: no cast, no provenance, no business model). Saying so is the
 * honest answer; an invented one would teach the model the tables are empty.
 */
function sampleRefusal(name: string): string {
  const available = TOOL_DEFINITIONS.filter((tool) => tool.availability.sample).map((tool) => tool.name)
  return `This session is running on the bundled SAMPLE blueprint with no database connected, so "${name}" does not exist here. Available: ${available.join(', ')}. Connect a database to author.`
}
