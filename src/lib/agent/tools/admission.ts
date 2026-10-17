import {
  toolStanding,
  type RosterMode,
  type WithholdGround,
} from '@/lib/agent/tools/roster'
import {
  BATCH_LIMIT_REFUSAL,
  MOBILE_SHELL_REFUSAL,
  NO_SEARCH_REFUSAL,
  SAMPLE_TRIAL_REFUSAL,
  STOPPED_REFUSAL,
  VIEW_ONLY_REFUSAL,
  WRITE_BATCH_LIMIT,
  noSuchToolRefusal,
  repeatReadRefusal,
  serverUnavailableRefusal,
} from '@/lib/agent/tools/refusals'

/**
 * ONE ANSWER PER TOOL CALL: run it, or refuse it with this sentence.
 *
 * The seam between what a session was OFFERED and what one of its calls is
 * ADMITTED to do. The loop used to ask that question in eight near-identical
 * blocks, five of which re-stated conditions `roster.ts` had already applied
 * to build the offer — so the two could disagree about a fact either of them
 * could have derived, and did: a call tripping two conditions read back
 * whichever sentence the cascade reached first, which made the order of the
 * blocks part of the contract with nothing but a prose note holding it.
 *
 * WHAT IS DERIVED AND WHAT IS AN INPUT, because the split is the whole point.
 * The declarable half is `toolStanding` — the deployment's allow-list, the
 * search offer, the two availability fields, and the write gate's PLACE in
 * the order. This module adds the sentences, and nothing else: it holds no
 * condition the offer does not hold. The live half arrives as `facts`, four
 * things no description of a tool can carry, each named at its field below.
 *
 * WHY THE SENTENCES LIVE HERE rather than on the grounds themselves:
 * `roster.ts` decides membership and must stay sayable without a refusal
 * vocabulary, and `refusals.ts` owns the words. This is the one mapping from
 * a ground to its sentence, so a reworded refusal moves in one file and both
 * readers of the roster follow.
 */

/**
 * The facts only the run holds. Each is live in a way a tool definition is
 * not: re-read per call, or per round, from something that moves.
 */
export type CallFacts = {
  /**
   * The run's abort signal has fired. Run-local by construction — it rests on
   * no definition at all — so it can only ever be an input.
   */
  aborted: boolean
  /**
   * Whether THIS call writes, from the loop's own argument-aware predicate.
   * The offer asks the definition's surface; a `ui_command` call is a write
   * exactly when its `command` argument names a mutating one (undo reverts
   * through the delete RPCs), and an argument is not a fact a roster can
   * hold. One predicate answers this and the batch count below, so the
   * refusal a viewer reads and the budget a batch spends cannot disagree
   * about what counted as a write.
   */
  isWrite: boolean
  /** Writes that have landed in this send, for the batch etiquette. */
  writesThisSend: number
  /**
   * `false`, or the one-line rendering of the arguments that matched a read
   * this turn already dispatched. The label rides WITH the fact because it is
   * only ever wanted with it: a turn can hold several reads of one tool at
   * different targets, and a refusal naming only the tool leaves the model to
   * work out which earlier result it is being sent back to.
   */
  repeatRead: false | { args: string }
}

/** Why a call was refused. The withholding grounds, plus the live three. */
export type AdmissionGround = 'stopped' | WithholdGround | 'batch-limit' | 'repeat-read'

/**
 * The answer. `ground` is there because three refusals have a consequence
 * beyond the sentence — a stop has to answer the rest of the round and end
 * the turn, a batch pause shows one status row however many calls bounced,
 * and a suppressed repeat leaves a tool row in the transcript — and the loop
 * cannot tell them apart by reading the sentence.
 */
export type Admission =
  | { readonly admitted: true }
  | {
      readonly admitted: false
      readonly ground: AdmissionGround
      readonly refusal: string
    }

/**
 * The one "yes", handed to every caller rather than built per call — hence
 * frozen, and `readonly` above. A shared literal a caller can write through
 * is a caller that can turn every later call's answer into a refusal, from
 * anywhere, with nothing in this module to say where it happened.
 */
const ADMITTED: Admission = Object.freeze({ admitted: true as const })

/** The sentence each withholding ground answers a call with. */
function withholdRefusal(ground: WithholdGround, name: string): string {
  switch (ground) {
    case 'server-unavailable':
      return serverUnavailableRefusal(name)
    case 'not-enabled':
      // An ALLOW-LIST the deployment set does not list this name: the tool
      // exists in the template and not in this session, so the refusal says
      // the second thing only — a model has no business learning that a
      // deployment narrowed its roster. It is not the answer to a name no
      // definition declares: with no allow-list such a name is admitted and
      // answered by the dispatcher, which is the reader that can tell an
      // unknown name from a withheld one.
      return noSuchToolRefusal(name)
    case 'no-search':
      return NO_SEARCH_REFUSAL
    case 'sample-trial':
      return SAMPLE_TRIAL_REFUSAL
    case 'mobile-reading':
      return MOBILE_SHELL_REFUSAL
    case 'view-only':
      return VIEW_ONLY_REFUSAL
  }
}

/**
 * Whether one call may run, and what to answer if not.
 *
 * The three live refusals are ordered after the declarable ones on purpose,
 * and the order is now a statement rather than an accident. A stop comes
 * first because it is a fact about the RUN and not about the call: once the
 * reader has pressed Stop, nothing else is worth telling the model. The
 * declarable grounds come next, in the roster's own order, so a call is
 * always refused in the words the offer would have used. The batch count and
 * the repeat record come last because they are budgets, and a tool this
 * session does not have spends neither.
 *
 * These three phases are CODE order here, as the five gates are code order in
 * `toolStanding`. What one-sourcing bought is that no second reader states
 * them again: which sentence a call tripping two conditions reads back is a
 * function of those two descriptions, not of which cascade ran first. Adding
 * a ground still means choosing its place, in one of these two functions,
 * with the rest of them in front of you.
 */
export function admitToolCall(input: {
  mode: RosterMode
  /** The name the model emitted; `toolStanding` resolves what it declares. */
  name: string
  facts: CallFacts
}): Admission {
  const { mode, name, facts } = input
  if (facts.aborted) return { admitted: false, ground: 'stopped', refusal: STOPPED_REFUSAL }
  const standing = toolStanding(mode, name, facts.isWrite)
  if (!standing.offered)
    return {
      admitted: false,
      ground: standing.ground,
      refusal: withholdRefusal(standing.ground, name),
    }
  if (facts.isWrite && facts.writesThisSend >= WRITE_BATCH_LIMIT)
    return { admitted: false, ground: 'batch-limit', refusal: BATCH_LIMIT_REFUSAL }
  if (facts.repeatRead)
    return {
      admitted: false,
      ground: 'repeat-read',
      refusal: repeatReadRefusal(name, facts.repeatRead.args),
    }
  return ADMITTED
}
