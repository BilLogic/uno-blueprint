import type { ToolDefinition } from '@/lib/agent/tools/definition'
import { TOOL_DEFINITIONS, findToolDefinition } from '@/lib/agent/tools/definitions'

/**
 * The Roster: which tools one session is offered. Derived, never listed —
 * the definition list filtered by the deployment's allowlist and by each
 * tool's own availability for the mode the session is in. A tool reaches a
 * roster by being a definition that says it may run there, and a
 * deployment narrows the roster through its config rather than by editing
 * the template's tool files.
 */

/**
 * `agent.enabledTools` from the deployment config: an allowlist of tool
 * names, or absent for every tool. Set once at boot by the config provider,
 * the way the cell budget and the search plan are; a name it lists that no
 * definition declares is simply not there, and is not an error — a
 * deployment pinned to an older roster keeps working when a tool is renamed.
 */
let enabledTools: ReadonlySet<string> | null = null

export function configureAgentTools(next: readonly string[] | undefined): void {
  enabledTools = next ? new Set(next) : null
}

/**
 * Whether the deployment allows a tool at all. The roster applies this once;
 * the loop applies it again per call, because a model can emit a name it
 * remembered from another deployment, and a tool the config disabled must be
 * refused there rather than run.
 */
export function toolEnabled(name: string): boolean {
  return !enabledTools || enabledTools.has(name)
}

/** The session facts a roster is derived from. */
export type RosterMode = {
  /** No canvas or browser state exists in this process. */
  server?: boolean
  /** No Supabase configured: reads answer from the bundled sample. */
  sampleTrial: boolean
  /** The mobile shell is up — view-only for every tier. */
  mobileReading: boolean
  /** A service account. Viewers get no write tools at all. */
  allowWrites: boolean
  /** Does ranked search exist for this session? `searchPlan.ts` decides. */
  searchOffered: boolean
}

/**
 * Why one session is not offered a tool: the ground its refusal is chosen
 * by. `admission.ts` is what turns each of these into the sentence the model
 * reads back, so nothing here spells a sentence.
 */
export type WithholdGround =
  | 'server-unavailable'
  | 'not-enabled'
  | 'no-search'
  | 'sample-trial'
  | 'mobile-reading'
  | 'view-only'

/** One session's answer about one tool. */
export type ToolStanding =
  | { readonly offered: true }
  | { readonly offered: false; readonly ground: WithholdGround }

/**
 * The one "yes", handed to every caller rather than built per call — so it is
 * frozen and its fields are `readonly`. A shared literal a caller can write
 * through is a caller that can turn every later session's answer into a
 * refusal, from anywhere, with nothing to say where it happened.
 */
const OFFERED: ToolStanding = Object.freeze({ offered: true as const })

/**
 * One session's standing on one tool — and THE one place the gates'
 * membership, and the order they answer in, are written down.
 *
 * Two readers walk this: `sessionRoster` below walks every definition
 * through it to build the offer, and the loop's admission answer walks one
 * call through it to decide whether that call may run. They used to spell
 * the same five conditions separately, in different orders, agreeing only by
 * a prose note asking the next editor to keep them in step. The failure that
 * bought was not a tool running when it should not — both readers refused
 * the same set — it was the WORDS: a `search_blueprint` call on a
 * no-database trial trips the search gate and the trial gate at once, and
 * the call read back the trial's sentence while the roster had withheld the
 * tool for the search plan. Whichever reader was written first won, which
 * made the order of eight near-identical blocks load-bearing and invisible.
 *
 * THE GATES ARE APPLIED IN SEQUENCE, each on top of the last, rather than
 * one mode gate returning for all of them. The earlier shape leaned on a
 * subsumption — a tool the trial may run is a read or a navigation, so it is
 * one mobile may run, so it is not a write — which holds in the definitions
 * today and is nothing a reader of this function can see. Applying each gate
 * costs a comparison and stops the offer from depending on a claim about a
 * list somewhere else. It also makes the offer strictly narrower in
 * principle: a tool BOTH trial-or-mobile-available AND a write would now
 * reach the write gate instead of being offered by the mode gate above it.
 * That is a no-op only because `defineWriteTool` fixes every write's
 * availability to neither, which `definition.test.ts` pins for this reason.
 *
 * WHAT IS SINGLE-SOURCED HERE, and what is not. Both readers now ask ONE
 * function, so which sentence a call tripping two conditions reads back is a
 * function of this description rather than of which cascade was written
 * first. The order itself is still CODE — five sequential `if`s — so WHERE a
 * new gate goes is an edit a reader makes here, with the others in front of
 * them, and no data list will make that choice for them. The claim is that
 * the order has one home, not that it stopped mattering.
 *
 * `isWrite` is an ARGUMENT rather than a field read off the definition, and
 * it is the one input the two readers do not share. The offer asks the
 * definition (`surface === 'write'`), because a list of tools is all an offer
 * has. The admission asks its own predicate, because `ui_command` is a write
 * exactly when its `command` argument names a mutating one, and no roster can
 * hold an argument. Same gate, same place in the order, two inputs.
 *
 * The definition is RESOLVED HERE from the name, rather than handed in beside
 * it: a name and a definition are two views of one thing, and the two callers
 * reached them from different places — one walking the definition list, one
 * holding a name a model emitted — so a mismatched pair would have split the
 * gates silently, availability read off one tool and the allow-list asked
 * about another.
 *
 * A NAME NO DEFINITION DECLARES — invented, or remembered from another
 * deployment — resolves to nothing, and that is not a ground of its own. With
 * no allow-list narrowing the session it passes the first gate, and the mode
 * gates only fire on a trial or a phone, where a tool with no availability to
 * show is withheld. So on a desktop session such a name is ADMITTED here and
 * answered by the dispatcher, which is the reader that knows a name resolving
 * to nothing and has a sentence for it.
 */
export function toolStanding(
  mode: RosterMode,
  name: string,
  isWrite: boolean,
): ToolStanding {
  if (!toolEnabled(name)) return { offered: false, ground: 'not-enabled' }
  const tool = findToolDefinition(name)
  // Ranked search sits FIRST among the mode gates, not inside their order:
  // whether the deployment has a search function and whether this person's
  // key can reach its index are questions none of the others ask, and a
  // session told "no database" about a tool it was never offered for want of
  // an index has been told the wrong thing.
  if (name === 'search_blueprint' && !mode.searchOffered)
    return { offered: false, ground: 'no-search' }
  if (mode.server && (tool?.resourceOnly || tool?.surface === 'interface' ||
    (tool?.surface === 'read' && tool.browserBacked !== false)))
    return { offered: false, ground: 'server-unavailable' }
  if (mode.sampleTrial && !tool?.availability.sample)
    return { offered: false, ground: 'sample-trial' }
  if (mode.mobileReading && !tool?.availability.mobile)
    return { offered: false, ground: 'mobile-reading' }
  if (isWrite && !mode.allowWrites) return { offered: false, ground: 'view-only' }
  return OFFERED
}

/**
 * The tools one session may see, in the order the model is offered them:
 * every definition whose standing above is `offered`. Nothing is filtered
 * here — the conditions live in `toolStanding`, because a call's admission
 * has to apply the same ones in the same order and a second copy of them is
 * exactly what this module exists to prevent.
 */
export function sessionRoster(mode: RosterMode): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter(
    (tool) => toolStanding(mode, tool.name, tool.surface === 'write').offered,
  )
}
