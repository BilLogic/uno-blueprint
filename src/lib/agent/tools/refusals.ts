/**
 * The sentences the loop answers a tool call with when it will not run it,
 * the status row it shows when the batch limit bites, and the one limit
 * both quote. Next to the tool definitions because they are the tool
 * layer's other answers: what a call gets back when no definition runs.
 *
 * Each refusal says the second thing only — that the tool does not exist in
 * THIS session, or what to do instead — never the first: a model has no
 * business learning why a deployment narrowed its roster or which provider
 * key a person holds.
 *
 * WHY SOME OF THESE ARE ONE MODULE, AND THE RULE FOR WHICH.
 *
 * A refusal is the prompt an eval case grades a recovery from. Reworded on
 * one side only, the Node eval harness goes on grading a run against words
 * no session says — and it passes while doing it, because the sentence it
 * judges against is its own. So a refusal that BOTH readers' gates can say
 * lives here once and crosses to the harness through its surface entry
 * (`scripts/agent-harness/app-surface.entry.ts`), where it is pinned.
 *
 * THE TEST FOR SHARING, one rule for every sentence below: share it when the
 * harness has a gate of its own whose answer is this same statement, and the
 * statement is TRUE of the harness's session. Otherwise it is APP-ONLY, and
 * says at its definition which half fails — no gate on the far side, or a
 * gate whose session this sentence would lie about. Two things are NOT the
 * test: whether a model could reach the refusal (a model can call any name on
 * the roster, so every refusal is reachable), and what today's cases happen to
 * call (a suite grows). A sentence exported with no gate to say it is a seam
 * no test can guard, because there is no copy to watch for.
 */

/** Writes a model may land in one send before the loop asks it to check in. */
export const WRITE_BATCH_LIMIT = 8

/**
 * Disabled by the deployment's allowlist, or a name the model invented.
 *
 * SHARED with the eval harness, whose dispatch answers a name it maps to
 * nothing with this sentence: the name does not exist in that session either,
 * so the statement is true on both sides. An invented name is the commonest
 * thing a model gets wrong, so it is the refusal a run is most likely to be
 * graded on recovering from.
 *
 * NOT the same sentence as `notOnAllowListRefusal`, and do not merge them:
 * this one answers a name that is nothing here — unknown, or withheld — and
 * says only that. That one answers a name the tool layer KNOWS and the
 * allow-list still refuses, and carries the doctrine that goes with a fixed
 * surface.
 */
export function noSuchToolRefusal(name: string): string {
  return `There is no ${name} tool in this session.`
}

/**
 * A known tool whose definition cannot run in a server context.
 * APP-ONLY: the canvas harness has no server context and cannot reach this ground.
 */
export function serverUnavailableRefusal(name: string): string {
  return `The ${name} tool is not available in this server context.`
}

/**
 * A call the dispatcher resolved to no definition on a session that HAS a
 * database: the surface is fixed, and the commonest name a model reaches for
 * off it is a delete.
 *
 * Lives here rather than inline in `registry.ts` so one module owns the
 * refusals, which is what this file is for. APP-ONLY: the harness's dispatch
 * has no allow-list gate — a name it cannot map falls to `noSuchToolRefusal`
 * — so there is no gate on the far side to say this. See `noSuchToolRefusal`
 * on why the two are different sentences.
 *
 * The wording is pinned by `definitions/writes.test.ts`; it moved bytes
 * intact.
 */
export function notOnAllowListRefusal(name: string): string {
  return `Tool "${name}" is not on the allow-list. Available tools are fixed; deletes do not exist here — removal is human-only.`
}

/**
 * No database: the trial reads the bundled sample and has no write tool at all.
 *
 * APP-ONLY, and not because the harness lacks the trigger — it has one
 * (`HAS_DB`, the same "no database configured" state). The harness derives
 * its offer from `sessionRoster` like the app, and then declares one fact
 * against its environment: it says it is NOT a trial, because its write half
 * rehearses every write as a dry run and a roster narrowed by the missing
 * database would offer no write to rehearse. So the gate this sentence
 * belongs to has no counterpart there — the harness never enters the state
 * it answers — and exporting it would publish a sentence with nothing to say
 * it. The widening is stated beside the harness's own mode, not here. Share
 * this the day the harness stops rehearsing and starts refusing.
 */
export const SAMPLE_TRIAL_REFUSAL =
  'No database is connected — this session reads the bundled sample blueprint and has no write tools. Describe the change instead; authoring needs a connected database.'

/**
 * The mobile shell is view-only for every tier. SHARED: the harness's mobile
 * cases gate on the same roster and the statement is true of that session.
 */
export const MOBILE_SHELL_REFUSAL =
  'The mobile shell is view-only — only the reading and navigation tools exist here. Editing happens on desktop; describe the change instead.'

/**
 * Ranked search is not on this session's roster; the tool "does not exist".
 *
 * SHARED, and only just: the sentence is true exactly where the tool was
 * never put in front of the model, and until the harness derived its offer
 * from `sessionRoster` the harness handed a provider the whole spec table —
 * `search_blueprint` included, with no index behind it. On that session this
 * sentence was a lie, so the harness said a true one of its own and the two
 * readers disagreed about what was OFFERED rather than about wording. The
 * harness now declares `searchOffered: false`, which is the truth of an
 * environment with no deployment index and no embedding key, so the tool is
 * absent from its roster too and this sentence is true on both sides. The
 * steer to the two reads is the part a case grades, and it is now one steer.
 */
export const NO_SEARCH_REFUSAL =
  'There is no search_blueprint tool in this session. Use list_blueprint for what exists at a level, and get_blueprint for one scenario.'

/**
 * A signed-in viewer who is not a service account. SHARED: the harness runs
 * view-only cases and refuses writes on the same ground.
 */
export const VIEW_ONLY_REFUSAL =
  'This session is view-only (not a service account) — no write tools exist here. Describe the change for a service account instead.'

/**
 * The batch etiquette, enforced: after the limit, writes bounce with the
 * check-in instruction. SHARED: the harness enforces the same limit, from the
 * same constant.
 */
export const BATCH_LIMIT_REFUSAL = `Batch limit: ${WRITE_BATCH_LIMIT} writes already landed this turn. Stop now, summarize what you did, and let the user say "continue" before the next batch.`

/**
 * The status row the transcript shows once per round when the batch limit
 * bites. APP-ONLY: it is a row of the transcript, not an answer to a tool
 * call, and the harness renders no transcript — it records a trace and grades
 * the text. No gate on the far side can say it.
 */
export const BATCH_PAUSED_STATUS = `Paused after ${WRITE_BATCH_LIMIT} writes — reply "continue" for the next batch.`

/**
 * The reader pressed Stop, and this call had not been dispatched when the
 * loop next looked.
 *
 * Here rather than inline in the loop because it is an answer to a tool call
 * and this module is where those live; the loop's own business is what it
 * does AROUND the sentence, which is answer every call the round had not
 * reached and only then bail. That matters more than the wording: every
 * provider rejects the next send of a transcript holding an unanswered tool
 * call, so a stop that stranded the parts would poison the session for good.
 *
 * APP-ONLY: the harness has no Stop — it runs a case to its end or fails —
 * so there is no gate on the far side to say this.
 */
export const STOPPED_REFUSAL = 'Stopped by the user before this call ran.'

/**
 * A read whose name and arguments the turn has already dispatched. The
 * result is in the conversation and is deliberately NOT restated: the
 * duplicated payload is half of what a repeat costs — the round it arrives
 * on is already spent — and it is the half this refusal can still save, so
 * the model gets a pointer back to the result rather than a second copy.
 *
 * `args` is the caller's one-line rendering of the arguments. It is there
 * because a turn can hold several reads of one tool at different targets,
 * and a refusal naming only the tool would leave the model to work out
 * WHICH earlier result it is being sent back to. It labels the call; it
 * never carries the payload — and the sentence still says the match was on
 * the exact arguments when the rendering comes back empty.
 *
 * APP-ONLY: the harness implements no repeat-read guard at all, so it has no
 * gate that could answer with this — its header says why it mirrors the gates
 * that shape what a model DOES and not this one, which shapes what a model
 * SEES TWICE. Share it the day the harness grows the guard, not the day a
 * case happens to repeat a read.
 */
export function repeatReadRefusal(name: string, args: string): string {
  return `${name}${args ? ` (${args})` : ''} already ran this turn with these exact arguments — its result is earlier in this conversation and is not repeated here. Read it there, or call with different arguments.`
}

/**
 * How a transcript row marks a repeat the loop answered instead of running.
 * APP-ONLY for the reason `BATCH_PAUSED_STATUS` is: it labels a transcript
 * row rather than answering a tool call, and the harness renders no
 * transcript.
 */
export const REPEAT_READ_SUPPRESSED = 'Suppressed — already run this turn'

/** The fields of a transcript tool row these two read. */
type ToolRowFlags = { isError: boolean; suppressed?: true; summary: string }

/**
 * Whether a tool row is a repeat the loop answered instead of running. A row
 * persisted before the loop said `suppressed` carries only the sentence, and
 * is flagged as a failure; read back, it is the same repeat. APP-ONLY, as
 * `REPEAT_READ_SUPPRESSED` is: it reads transcript rows, and the harness
 * renders no transcript.
 */
export function isSuppressedRow(row: ToolRowFlags): boolean {
  return row.suppressed === true || row.summary === REPEAT_READ_SUPPRESSED
}

/**
 * Whether a tool row is a call that ran and failed — the one reading every
 * place that shows or counts a failure uses, so a suppressed repeat is never
 * one in one place and not in another. APP-ONLY, for the same reason.
 */
export function isFailedRow(row: ToolRowFlags): boolean {
  return row.isError && !isSuppressedRow(row)
}
