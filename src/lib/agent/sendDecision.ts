import {
  completeSkillToken,
  draftWithoutSkillTokens,
  findSkillNearMisses,
  skillsInDraft,
  type AgentSkillCommand,
  type SkillNearMiss,
} from '@/lib/agent/skills'

/**
 * WHAT A DRAFT SENDS, given what the reader has already been asked.
 *
 * The composer used to hold this as an ordering contract written nowhere and
 * spread over three closures: ask about the first near miss, rewrite the
 * draft on accept, re-check the REWRITTEN draft, dispatch with the misses
 * that remain, and pass the draft text as an argument rather than reading it
 * back from a state setter that has not committed yet. Every step of that was
 * a caller's obligation, and the one a caller dropped was the re-check —
 * accepting an offer sent straight out, so a second near miss in the same
 * message rode along in silence, which is the exact silence the offer exists
 * to close.
 *
 * Here the re-check is not a step anybody can skip: accepting is an ANSWER
 * handed to this function, and the answer comes back as another question when
 * the rewrite leaves one standing. A caller that renders what it gets back
 * cannot get the sequence wrong, because there is no sequence left to get
 * wrong.
 *
 * The answer is CONSENT AND NOTHING ELSE. It used to carry the near misses
 * the reader had been shown, and that handed the caller the one invariant
 * this module actually depends on — that those spans were measured against
 * THIS draft — with nothing to enforce it. A caller that answered twice off
 * one question fed a span measured against `/audit` into the rewritten
 * `/ub:audit ` and got `/ub:audit dit `; a caller that answered `declared`
 * with a list from a previous draft told the model in one breath that
 * `/ub:audit` had run and that `/audit` was a near miss that had not. Both
 * are unreachable now, because the list is not an input: every arm below
 * walks the draft it was handed, and the answer only says whether that walk's
 * result is a question, a declaration, or a rewrite.
 *
 * `skills.ts` keeps the token grammar — the regexes, the span arithmetic, the
 * lookahead that stops a path segment resolving as a skill. This is the state
 * machine over that grammar and nothing more.
 */

/** What the reader has said about the near misses in this draft, if asked. */
export type SendAnswer =
  /**
   * Nothing has been asked yet — the ordinary first press of Send. An arm of
   * its own rather than an empty list, because "not asked" and "asked, and
   * nothing is pending" are different states and a list conflates them.
   */
  | { kind: 'unasked' }
  /**
   * The message goes as it is typed, and every miss in it is declared to the
   * model. EVERY one, not the first: a message carries as many skills as its
   * text names, so one declared and the rest left out reads to the model as
   * the rest having run.
   */
  | { kind: 'declared' }
  /**
   * The reader takes the offer on the FIRST miss — spell it properly and run
   * it. One at a time, because each rewrite moves the offsets of everything
   * behind it in the draft, and because a reader agreeing to one token has
   * not agreed to the others.
   */
  | { kind: 'accepted' }

/** What the model is told about a miss going as prose, flattened. */
export type DeclaredMiss = {
  /** The token as typed, without its slash. */
  token: string
  /** The official name of the skill it nearly spelled. */
  label: string
}

/** One message the reader commits: its text, and the skills it names. */
export type Send = {
  /**
   * What goes to the model from this module's side. The resolved tokens stay
   * in it, because they are what the reader wrote; a draft that is NOTHING
   * but tokens becomes the instruction they stand for, since a bare token is
   * not a sentence. It is not the last word on what the model reads — an
   * empty draft with an annotation on the shelf gets its sentence from the
   * panel, which is the only place that knows the shelf exists.
   */
  text: string
  /** One per resolved token, in the order the tokens appear, deduped. */
  skills: readonly AgentSkillCommand[]
}

/**
 * A DECISION about a Send, not a Send: either the question the draft still
 * owes the reader, or the Send to commit and what must be declared alongside
 * it.
 */
export type SendDecision =
  | {
      kind: 'ask'
      /**
       * The draft the question is about — rewritten when an accepted offer
       * got this far, so the field shows the reader the token they agreed to
       * before it asks them about the next one. It is load-bearing ONLY here:
       * the committing arm carries no draft, because a caller holding both a
       * `draft` and a `text` that are equal for every ordinary message and
       * differ only for a token-only one has the perfect shape for a
       * wrong-string bug that passes every hand test.
       */
      draft: string
      /**
       * Where the caret belongs in that rewritten draft: just past the name
       * the reader accepted and the space after it. Null when nothing was
       * rewritten — the first press of Send asks about a draft it did not
       * touch, and moving the caret of a draft nobody edited would take the
       * reader out of their own sentence for nothing.
       *
       * It travels with the draft rather than being derived by the caller,
       * for the reason the draft does: this is the arm that knows WHICH
       * token was rewritten, and a caller recomputing the offset from the
       * text it got back would be guessing at that.
       */
      caret: number | null
      misses: readonly SkillNearMiss[]
    }
  | {
      kind: 'send'
      send: Send
      /** The misses going as prose, in the order their tokens appear. */
      declaredMisses: readonly DeclaredMiss[]
    }

/** The Send, once nothing in the draft is still an open question. */
function commit(
  draft: string,
  declared: readonly SkillNearMiss[],
): SendDecision {
  const skills = skillsInDraft(draft)
  const prose = draftWithoutSkillTokens(draft)
  // Tokens and no words is a complete instruction — and with several of them,
  // the order is the instruction, so it is spelled out rather than left for
  // the loop to infer from a list.
  const text =
    skills.length > 0 && !prose
      ? skills.length === 1
        ? `Run ${skills[0].label} from the top of its flow.`
        : `Run ${skills.map((skill) => skill.label).join(', then ')} — each from the top of its flow, in that order.`
      : draft.trim()
  return {
    kind: 'send',
    send: { text, skills },
    declaredMisses: declared.map((miss) => ({
      token: miss.token,
      label: miss.command.label,
    })),
  }
}

/**
 * The whole decision, in one call: this text and this answer give either the
 * question left to ask or the Send to commit.
 *
 * The walk happens FIRST and on every path, including the declaration. The
 * draft is the record of what the message says, so the misses it declares are
 * read off the draft being committed rather than off whatever the reader was
 * looking at when they answered — the two diverge the moment an accepted
 * rewrite lands, and a declaration built from the older list names a skill as
 * unrun in the same message that runs it.
 *
 * The recursion is the re-check, and it is why no caller has to perform one.
 * An accepted offer rewrites one token and asks this same function about the
 * draft it produced — so a rewrite leaving a second near miss standing comes
 * back as `ask`, and one leaving none comes back as the Send. It terminates
 * structurally: `accepted` is the only recursing arm and it recurses as
 * `unasked`, which cannot recurse, so depth is at most two whatever the draft
 * says. (The reader's own accept-ask-accept loop is bounded separately, and
 * for a different reason: each rewrite turns a bare alias into an official
 * name, and an official name is never a near miss.)
 */
export function decideSend(draft: string, answer: SendAnswer): SendDecision {
  const misses = findSkillNearMisses(draft)
  const [first] = misses
  if (answer.kind === 'accepted' && first) {
    const completed = completeSkillToken(draft, first, first.command)
    const next = decideSend(completed.text, { kind: 'unasked' })
    // The rewrite's caret survives the re-check, because the re-check is
    // about the NEXT token and says nothing about where the reader is. When
    // the recursion commits instead there is no draft left to put a caret
    // in — the field is cleared by the send.
    return next.kind === 'ask' ? { ...next, caret: completed.caret } : next
  }
  // An accept with nothing left to accept falls through to the walk below:
  // the draft may have moved under a stale answer, and the draft is the
  // record.
  if (answer.kind === 'declared') return commit(draft, misses)
  if (first) return { kind: 'ask', draft, caret: null, misses }
  return commit(draft, [])
}
