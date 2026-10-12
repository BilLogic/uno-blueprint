import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database } from '@/types/database'
import { PACKAGE_OFFLINE_BOARD } from '@/data/blueprintFallbacks'
import type { ToolContext, ToolDefinition } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { recordingUi } from '@/lib/agent/tools/definitions/testContext'
import { scopeOf } from '@/lib/agent/tools/serviceScope'

/**
 * A rehearsal: everything a write tool touches, standing in for a database
 * that must not be written to. The eval harness runs a write tool's own
 * `run(args, ctx)` against this, so the sentence the model reads back in a
 * rehearsal is the sentence the tool says — not one the harness composed in
 * the tool's name and had to keep in step by hand.
 *
 * Application-side for the same reason `testContext.ts` is: the rehearsal's
 * whole point is that it runs the app's own `run`, so the seam belongs beside
 * the definitions rather than in a script that would import across the wall.
 * Nothing in the app imports it — the harness does, through the surface
 * entry, and a test of this file holds every write tool to it.
 *
 * The client answers by the operations it was chained, never by the tool that
 * chained them: a policy a new write tool falls under without being named
 * here is the only kind that cannot go stale.
 */

type Client = SupabaseClient<Database>

/** One `from(table)` chain: the table, and the operations asked of it in order. */
export type RehearsalCall = { table: string; ops: Array<[string, ...unknown[]]> }

/** One `rpc(fn, args)`: the function asked for, and the arguments sent. */
export type RehearsalRpc = { fn: string; args: Record<string, unknown> }

/**
 * WHAT A PLACEHOLDER IS, exactly: the string `dry-N` and nothing else.
 *
 * It stands in for an id a real write would have minted — `dry-1`, `dry-1.2`,
 * `dry-1.3` within one call — and it is a plain string, so a tool that reads
 * one into its sentence (`Created phase (dry-1).`) prints it, and a tool that
 * compares or slices it gets a string's answers. It is NOT a stand-in for a
 * value of some other type: a column that holds a list is answered with a
 * list, and a column that holds text with text — see `columnAnswer`. An
 * earlier version of this file had one value pretend to be both at once (a
 * String wrapper whose `.map` answered `[]`), which meant `.length` was 5,
 * `.filter` threw and `Array.isArray` said no: a value that lies differently
 * to every reader, and a rehearsal that passed for reasons no write shares.
 */
type Placeholder = string

/**
 * What an RPC hands back in a rehearsal: one object, for every RPC.
 *
 * The app's RPC callers read an answer in two shapes. Most structural
 * functions return the id they minted and the caller uses it as a string
 * (`create_phase`, `add_step`, `create_path`, the duplicates); two of them
 * (`upsert_cell`, `set_cell_dependency`) return an upsert's report and their
 * callers destructure `id`, `inserted` and `previous` off it
 * (`authoringRpc.ts`, `CellWrite` / `CellDependencyWrite`); a third shape
 * (`sync_cell_touchpoints`) reads one array field and guards it with
 * `Array.isArray`, so an answer that lacks it is read as "none".
 *
 * So the answer is an object carrying those fields, with `toString` giving
 * the placeholder — the object IS the report, and its string form is the id
 * the report is about. Keyed by nothing: no RPC name and no tool name appears
 * here, because a table of those is exactly the hand-kept thing this module
 * exists to abolish. `inserted` is true because a rehearsal creates and never
 * overwrites, so the upsert callers never read `previous`; it is an empty
 * list because the one caller that does read it, the slide replace, reads it
 * as the slides it wrote over — none, the honest answer for a write that did
 * not happen — and refuses a reply that carries no list at all.
 */
function rpcAnswer(ref: Placeholder): unknown {
  return { id: ref, inserted: true, previous: [], toString: () => ref }
}

/**
 * The zod type behind an argument, through the wrappers that do not change
 * what a value of it looks like.
 *
 * zod v4 keeps a schema's shape under `_zod.def`: `type` names it, and
 * `optional`/`nullable`/`default` carry the real one under `innerType`. Read
 * rather than matched on a class, because that is the only stable reading
 * across a schema built by `z.object({...})` and one built by the cell-field
 * list.
 *
 * `pipe` is here for a reason worth stating: `arg.optionalText` ends in a
 * `.transform` that reads a blank as absent, and a transform is a pipe whose
 * INPUT side is the schema the argument is written in. Without this the
 * commonest optional text argument in the surface reads as "no such type",
 * every before-read of a text column answers `null`, and a patch that trims
 * the name it read back throws on nothing — which is how this was found.
 */
function argumentType(field: unknown): string | null {
  let node = field
  for (let depth = 0; node !== undefined && node !== null && depth < 8; depth += 1) {
    const def = (
      node as { _zod?: { def?: { type?: string; innerType?: unknown; in?: unknown } } }
    )._zod?.def
    if (!def?.type) return null
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') {
      node = def.innerType
      continue
    }
    if (def.type === 'pipe') {
      node = def.in
      continue
    }
    return def.type
  }
  return null
}

/**
 * A supabase-js-shaped client that records what it was asked and answers with
 * placeholders. A Proxy rather than a listed builder, so a write that chains
 * one more PostgREST verb keeps working here without this file learning it.
 *
 * What a table answers is decided by the operations chained onto it:
 *
 * - an `insert` or `upsert` yields the row it would have written, under a
 *   placeholder id — so a tool can report the thing it just created;
 * - an `update` or `delete` yields the row it addressed, which is the id its
 *   own `eq('id', …)` named when it named one — so a concurrency-token patch
 *   sees its row come back rather than reading as a lost race;
 * - a plain select yields nothing for a list and a row for a `single` — so a
 *   before-read finds its row and a dedupe query finds no twin, which are the
 *   two shapes the writes read with;
 * - except a list select that names its rows by `in('id', […])`, which yields
 *   one row per id named — so an existence check finds the rows it asked
 *   after. A rehearsal cannot refuse what only real rows could refuse, and
 *   answering "none of those exist" would be exactly that refusal.
 */
export function rehearsalClient(
  placeholder: () => Placeholder,
  rehearsed: { definition?: ToolDefinition; args?: Record<string, unknown> } = {},
): {
  client: Client
  calls: RehearsalCall[]
  rpcs: RehearsalRpc[]
} {
  /**
   * What one selected column answers with, from the SCHEMA and the CALL —
   * the two things a rehearsal actually knows.
   *
   * A write that patches reads the row first and carries the fields it was
   * not asked to change, so a before-read answering with an id alone hands
   * that write an `undefined` where it expects a value: `update_stakeholder`
   * trims the name it read back, `update_cell` refuses a cell whose content
   * came back empty, and `update_cell` maps over the value props beside it.
   * The KIND of value each column holds is a thing the tool already declares
   * — it declares it for the argument of the same name — so that is what is
   * read here, unwrapped through the wrappers that do not change the kind:
   *
   *   array → `[]`   number → `0`   boolean → `false`
   *   string → A PLACEHOLDER, which is a string
   *   no such argument → whatever the CALL sent under that name, else `null`
   *
   * Two of those deserve their reason said out loud.
   *
   * A text column answers with `dry-N` rather than `''` because the value it
   * stands in for is a row's EXISTING text, which a rehearsal does not know
   * and which is not empty: answering `''` makes `update_cell` reject the
   * cell it was about to edit ("a cell needs text"), which is a refusal about
   * the rehearsal wearing the tool's voice.
   *
   * And the call's own value is the FALLBACK, not the first answer. Answering
   * a before-read with what the call is about to write asserts that the write
   * already happened: `update_cell` compares the row it read against the
   * fields it was asked to set, finds them equal, and reports "Nothing
   * changed" — the one sentence a rehearsal must never put in a tool's mouth.
   * It stays as the fallback because it is the best answer left for a column
   * the schema says nothing about (an enum argument, or a chain rehearsed
   * with no definition at all).
   */
  const columnAnswer = (column: string): unknown => {
    const shape = rehearsed.definition?.args.shape as Record<string, z.ZodType> | undefined
    switch (argumentType(shape?.[column])) {
      case 'array':
        return []
      case 'string':
        return placeholder()
      case 'number':
        return 0
      case 'boolean':
        return false
      default:
        return rehearsed.args?.[column] ?? null
    }
  }
  const calls: RehearsalCall[] = []
  const rpcs: RehearsalRpc[] = []

  const builder = (table: string) => {
    const call: RehearsalCall = { table, ops: [] }
    calls.push(call)
    const has = (...names: string[]) => call.ops.some(([op]) => names.includes(op))
    /** The `eq('id', …)` this chain addressed, when it addressed one. */
    const addressed = () => {
      const eq = call.ops.filter(([op, column]) => op === 'eq' && column === 'id').at(-1)
      return typeof eq?.[2] === 'string' ? eq[2] : placeholder()
    }
    /** The ids a list select named with `in('id', […])`, when it named them. */
    const named = () => {
      const list = call.ops.filter(([op, column]) => op === 'in' && column === 'id').at(-1)?.[2]
      return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : null
    }
    /** The row a write would have produced: its payload, under an id. */
    const written = () => {
      const payload = call.ops.find(([op]) => op === 'insert' || op === 'upsert')?.[1]
      const first = Array.isArray(payload) ? payload[0] : payload
      return {
        id: placeholder(),
        ...(first && typeof first === 'object' ? (first as Record<string, unknown>) : {}),
      }
    }
    /**
     * The columns a plain select asked for, each answered by `columnAnswer`.
     *
     * The chain says WHICH columns; the call and the tool's schema say what a
     * value of each looks like. Keeping those two apart is what lets the
     * policy stay about the chain rather than about which tool made it.
     */
    const selected = () => {
      const list = call.ops.find(([op]) => op === 'select')?.[1]
      if (typeof list !== 'string') return {}
      return Object.fromEntries(
        list
          .split(',')
          .map((column) => column.trim())
          .filter((column) => column !== '' && column !== '*' && !column.includes('('))
          .map((column) => [column, columnAnswer(column)]),
      )
    }
    /** The one row a `single`/`maybeSingle` reads: what was written, or what was addressed. */
    const row = () =>
      has('insert', 'upsert')
        ? written()
        : has('update', 'delete')
          ? { id: addressed() }
          : { ...selected(), id: addressed() }
    const settle = (single: boolean) => {
      const data = single
        ? row()
        : has('insert', 'upsert')
          ? has('select')
            ? [written()]
            : null
          : has('update', 'delete')
            ? [{ id: addressed() }]
            : (named() ?? []).map((id) => ({ ...selected(), id }))
      return Promise.resolve({ data, error: null })
    }
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then')
            return (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
              settle(false).then(onFulfilled, onRejected)
          // Recorded like every other verb before it answers: a chain that
          // ends in `single` is a chain whose log should say so, and the
          // harness's assertions read the log.
          if (prop === 'single' || prop === 'maybeSingle')
            return () => {
              call.ops.push([String(prop)])
              return settle(true)
            }
          return (...args: unknown[]) => {
            call.ops.push([String(prop), ...args])
            return proxy
          }
        },
      },
    )
    return proxy
  }

  const client = {
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return Promise.resolve({ data: rpcAnswer(placeholder()), error: null })
    },
  } as unknown as Client

  return { client, calls, rpcs }
}

/** The service a rehearsal runs under: named, so a sentence quoting it reads. */
export const REHEARSAL_SERVICE = {
  id: 'rehearsal-service',
  slug: 'rehearsal-service',
  name: 'Rehearsal service',
}

/**
 * The context a rehearsed write runs in, AND the log of what it did: the
 * recording client, a session that runs the work without a ledger of its own
 * to keep, the recording canvas, the whole roster, and the scope of one named
 * service — everything `defineWriteTool` requires, and nothing that reaches a
 * real database.
 *
 * `definition` and `args` are the call being rehearsed: the client answers a
 * selected column from what the call itself carries and, failing that, from
 * the tool's own schema (`columnAnswer`). Both are optional so a caller can
 * rehearse a bare chain, and a rehearsal without them answers every column
 * `null`.
 *
 * `placeholder` is what the ids in the answers read as; the harness hands one
 * that spells the dry run it belongs to.
 *
 * `calls` and `rpcs` come back with the context so a test can assert WHICH
 * write a tool reached — a sentence alone cannot tell a tool that wrote the
 * right row from one that wrote nothing and said so.
 */
export function rehearsalContext(
  overrides: Partial<ToolContext> & {
    definition?: ToolDefinition
    args?: Record<string, unknown>
    placeholder?: () => Placeholder
  } = {},
): { ctx: ToolContext; calls: RehearsalCall[]; rpcs: RehearsalRpc[] } {
  const { definition, args, placeholder, ...context } = overrides
  let issued = 0
  const ref = placeholder ?? (() => `dry-${(issued += 1)}`)
  const { client, calls, rpcs } = rehearsalClient(ref, { definition, args })
  return {
    ctx: {
      client,
      scope: scopeOf(REHEARSAL_SERVICE),
      session: { id: 'rehearsal-session', attributed: (work) => work() },
      ui: recordingUi().ui,
      offlineBoard: PACKAGE_OFFLINE_BOARD,
      roster: TOOL_DEFINITIONS,
      meaning: null,
      ...context,
    },
    calls,
    rpcs,
  }
}
