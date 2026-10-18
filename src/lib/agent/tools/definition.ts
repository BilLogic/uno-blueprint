import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/types/database'
import type { ToolSpec } from '@/lib/agent/providers/provider'
import type { AgentSearchIndex } from '@/deploymentConfig'
import type { ServiceScope } from '@/lib/agent/tools/serviceScope'
import type { OfflineBoard } from '@/data/blueprintFallbacks'

/**
 * A Tool is one module: what it is called, which surface it belongs to, the
 * arguments it takes, where it may run, and what it does. Everything a
 * session derives from a tool — the schema the model receives, the roster it
 * is offered on, the dispatch that runs it — reads this one definition, so
 * a tool is added by writing one and nowhere else.
 *
 * The arguments are a zod schema, and that is the whole reason this shape
 * exists. Before it, the schema a model was shown and the keys a handler
 * read were two string lists in two files that no compiler compared, held
 * together by a script that read both by regex. Here `run` receives the
 * inferred type, a key the schema does not declare is a type error in the
 * handler, and a call that does not fit the schema is refused at the seam
 * with a message that names the argument — instead of an `undefined` that
 * travels on into a write.
 */

type Client = SupabaseClient<Database>

/** Read, interface, write — the three surfaces the canvas adapter states. */
export type ToolSurface = 'read' | 'interface' | 'write'

/**
 * Where a tool may run. `sample`: the no-database trial, where `ctx.client`
 * is null and a read answers from the bundled sample. `mobile`: the mobile
 * shell, which is view-only for every tier.
 *
 * Stated here AND, until the roster derives from definitions, in the name
 * sets the spec table still keeps — as `surface` is. A test holds each
 * definition equal to the sets, so neither statement can drift while both
 * exist; the sets go when the roster reads the definitions.
 */
export type ToolAvailability = {
  sample: boolean
  mobile: boolean
}

/**
 * The canvas, as a tool reaches it. The shells provide this; a tool never
 * imports a bridge, a registry or a store of its own, so a test builds one
 * by hand and a navigation tool runs without a document.
 */
export type ToolUi = {
  openPhase: (phaseId: string) => Promise<string>
  openScenario: (scenarioId: string) => Promise<string>
  focusCell: (cellId: string) => Promise<string>
  openCellPanel: (cellId: string) => Promise<string>
  setSidebar: (collapsed: boolean) => string
  setCanvasMode: (mode: 'view' | 'design') => void
  annotateCells: (cellIds: string[], note?: string) => string
  /** The live UI state the shells report, as text; empty when nothing is. */
  uiState: () => string
  /** The controls the open surfaces have registered, as text. */
  listCommands: () => string
  /** Whether a registered control changes data, and so runs attributed. */
  commandMutates: (command: string) => boolean
  runCommand: (command: string, arg?: string) => Promise<string>
}

/**
 * The agent session a tool call belongs to. `attributed` runs a piece of
 * work as this session's on the authoring ledger — the ✦ badge, and how a
 * scoped revert knows which entries are its own. A tool never sets
 * attribution itself, and never refetches: the write module it calls
 * invalidates what it changed, under the decision that reads never refetch
 * on their own.
 */
export type ToolSession = {
  id: string
  attributed: <T>(work: () => Promise<T>) => Promise<T>
}

/**
 * Everything a tool touches, handed in. A tool that needs the database and
 * gets `null` was offered on a roster it should not have been on — the
 * roster is where availability is enforced, not here.
 */
export type ToolContext = {
  client: Client | null
  /**
   * The scope the session runs under: the resolved active service — what a
   * read covers unless its `service` argument says otherwise, and what a
   * write that creates under the service lands on — or `null` when none is
   * active (a slug no service carries; a bare script). The active service,
   * or nothing: a call under `null` names its scope or is refused, never
   * widened to the deployment on its own. Resolved once, at the surface
   * root, and handed here; a tool never resolves a slug.
   */
  scope: ServiceScope | null
  session: ToolSession
  ui: ToolUi
  /**
   * The offline board this session reads when there is no database: the
   * deployment's when it supplied one on `sample.blueprints`, the package's
   * otherwise. Handed down from the surface that started the run, the way the
   * scope and the roster are, because a tool is a plain function with no
   * context above it — and because the board a session answers from has to be
   * the one the canvas beside it is drawing.
   */
  offlineBoard: OfflineBoard
  /** Conversation reads supplied by the host, without importing its stores. */
  history?: {
    listSessions: (currentSessionId: string) => string | Promise<string>
    getSession: (sessionId: string) => Promise<string>
    getChanges?: (limit: number | undefined, currentSessionId: string) => string | Promise<string>
  }
  /**
   * The roster this call was offered from: what the canvas adapter lists
   * when it is served, so the agent reads exactly the tools it can call.
   */
  roster: readonly ToolDefinition[]
  /** Ranked search: the index this person's key can embed against, or null. */
  meaning?: { index: AgentSearchIndex; apiKey: string; fetch?: typeof fetch } | null
  /** The run's abort signal, so Stop reaches a call waiting on a network. */
  signal?: AbortSignal
}

export type ToolDefinition<Args extends z.ZodObject = z.ZodObject> = {
  name: string
  /**
   * What the model reads. A function when the words depend on the
   * deployment — `get_reference` names the documents it serves — resolved
   * whenever a spec is derived: per round in a live session, and once, with
   * the template's own words, in the spec table's import-time projection.
   */
  description: string | (() => string)
  surface: ToolSurface
  /** Reads must explicitly declare false to run on a server; absent fails closed. */
  browserBacked?: boolean
  /** Served as MCP resources rather than callable tools on the server. */
  resourceOnly?: boolean
  resource?: { uriPrefix: string; argument: string; names: () => readonly string[] }
  args: Args
  availability: ToolAvailability
  /**
   * Names a caller may still send for an argument, and the schema no longer
   * advertises: `{ description: 'summary' }` reads a `description` the model
   * was once taught as today's `summary`. Read before validation, so the
   * schema stays the one the model sees. An alias only ever goes this way —
   * a name the schema knows and the handler does not is the silent drop a
   * zod schema exists to prevent.
   */
  aliases?: Record<string, string>
  run: (args: z.infer<Args>, ctx: ToolContext) => Promise<string>
}

/** Identity with inference: the one place a definition's shape is checked. */
export function defineTool<Args extends z.ZodObject>(
  definition: ToolDefinition<Args>,
): ToolDefinition<Args> {
  return definition
}

/** A context whose client is known to be there: what every write runs in. */
export type WriteContext = ToolContext & { client: Client }

/**
 * A write is a definition with three facts fixed by its being one: it is on
 * the write surface, it is offered neither to the no-database trial nor to
 * the view-only mobile shell, and it runs attributed to the session — the
 * ledger's ✦ badge, and how a scoped revert knows which entries are its own.
 * Stated here once, so a write tool is its schema, its mutation and its
 * reply, and cannot forget any of the three.
 */
export function defineWriteTool<Args extends z.ZodObject>(definition: {
  name: string
  description: string
  args: Args
  aliases?: Record<string, string>
  run: (args: z.infer<Args>, ctx: WriteContext) => Promise<string>
}): ToolDefinition<Args> {
  return {
    name: definition.name,
    description: definition.description,
    surface: 'write',
    args: definition.args,
    availability: { sample: false, mobile: false },
    aliases: definition.aliases,
    run: (args, ctx) =>
      ctx.session.attributed(() => definition.run(args, { ...ctx, client: requireClient(ctx) })),
  }
}

/**
 * The client a database tool needs. The roster keeps such a tool off a
 * session without one, so this is the type's word for what the roster already
 * promised, not a second gate — and if it ever fires, the roster is wrong.
 */
export function requireClient(ctx: ToolContext): Client {
  if (!ctx.client) throw new Error('No database in this session.')
  return ctx.client
}

/**
 * The active service's id for a write that creates under the service, or the
 * sentence a caller can show when none is active. A tool never falls back to
 * the first service by `created_at` — that fallback is how a row landed on a
 * service nobody was looking at.
 */
export function requireActiveService(ctx: ToolContext): string {
  const scope = requireScope(ctx)
  if (scope.kind === 'service') return scope.serviceId
  throw new Error('No service is active — open a service before creating under it.')
}

/**
 * The session's scope for a read of a service-owned table with no `service`
 * argument of its own. `null` — no service active — is refused with the
 * sentence a model can act on, rather than widened to every service: the
 * interface reads nothing in that state, and the agent matches it.
 */
export function requireScope(ctx: ToolContext): ServiceScope {
  if (ctx.scope) return ctx.scope
  throw new Error('No service is active — open a service, or pass service:"all" for the whole deployment.')
}

/**
 * The argument shapes the tools share, so the rule each one encodes is
 * written once. `text` is what the dispatcher's `need()` enforced by hand: a
 * required string, and an empty one refused rather than looked up — the
 * schema says so, as `minLength`. `optionalText` is its `s()`: a blank reads
 * as absent. That one stays out of the schema, because it is a courtesy to
 * the caller and not a rule for the model to learn.
 */
export const arg = {
  text: (description: string) => z.string().min(1).describe(description),
  optionalText: (description: string) =>
    z
      .string()
      .describe(description)
      .optional()
      .transform((value) => (value && value.trim() !== '' ? value : undefined)),
  strings: (description: string) => z.array(z.string()).describe(description),
  number: (description: string) => z.number().describe(description),
}

/**
 * The spec the model receives, derived from the definition. Plain JSON
 * Schema of the INPUT side — what a caller sends, before any transform — with
 * no `$schema` and no `additionalProperties` at the root: the provider
 * adapters expect the object shape and nothing else, and one of them strips
 * both anyway.
 */
export function toolSpec(definition: ToolDefinition): ToolSpec {
  const {
    $schema: _schema,
    additionalProperties: _additional,
    ...parameters
  } = z.toJSONSchema(definition.args, { io: 'input' }) as Record<string, unknown>
  return {
    name: definition.name,
    description:
      typeof definition.description === 'function'
        ? definition.description()
        : definition.description,
    parameters,
  }
}

/**
 * Run one tool call: validate at the seam, then hand the typed arguments to
 * `run`. A call that does not fit is refused with the issues spelled out
 * per argument, which the loop reports to the model as a tool error.
 */
export async function runTool(
  definition: ToolDefinition,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const parsed = definition.args.safeParse(withAliases(rawArgs, definition.aliases))
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(arguments)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`${definition.name}: invalid arguments — ${issues}.`)
  }
  return definition.run(parsed.data, ctx)
}

/** The call as sent, with each accepted alias read as the argument it names. */
function withAliases(
  rawArgs: Record<string, unknown>,
  aliases: Record<string, string> | undefined,
): Record<string, unknown> {
  if (!aliases) return rawArgs
  const args = { ...rawArgs }
  for (const [alias, name] of Object.entries(aliases)) {
    if (args[name] === undefined && args[alias] !== undefined) args[name] = args[alias]
    delete args[alias]
  }
  return args
}
