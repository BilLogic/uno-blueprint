import mapSkill from '@/lib/agent/skill/skills/map.md?raw'
import sliceSkill from '@/lib/agent/skill/skills/slice.md?raw'
import auditSkill from '@/lib/agent/skill/skills/audit.md?raw'
import whatifSkill from '@/lib/agent/skill/skills/whatif.md?raw'

/**
 * The four-skill architecture, in the composer. These are the SAME SKILL.md
 * files IDE humans run from this repo's skills/ tree — vendored by
 * scripts/sync-canvas-skills.mjs, never authored here. A /command loads its
 * skill into the system prompt for that message only.
 *
 * Commands are namespaced `ub:` to match the plugin invocation exactly —
 * /ub:audit here and /ub:audit in the IDE are the same skill. The official
 * name is the ONLY spelling that invokes one; a bare alias is a search term
 * and a near-miss hint, and resolves nothing.
 */
export type AgentSkillCommand = {
  /** The canonical /command token, without the slash. */
  id: 'ub:map' | 'ub:slice' | 'ub:audit' | 'ub:whatif'
  /**
   * Bare spellings a reader reaches for. Deliberately half-alive: they match
   * in the menu and they name the closest skill when a token resolves to
   * none, and they invoke nothing — a message that merely mentions /audit is
   * a sentence, not an invocation.
   */
  aliases: string[]
  label: string
  summary: string
  /** SKILL.md content; null while the skill has not shipped. */
  content: string | null
}

export const AGENT_SKILL_COMMANDS: AgentSkillCommand[] = [
  {
    id: 'ub:map',
    aliases: ['map'],
    label: '/ub:map',
    summary: 'Create or evolve a blueprint from notes and conversation',
    content: mapSkill,
  },
  {
    id: 'ub:slice',
    aliases: ['slice'],
    label: '/ub:slice',
    summary: 'Cut a stakeholder view out of the blueprint',
    content: sliceSkill,
  },
  {
    id: 'ub:audit',
    aliases: ['audit'],
    label: '/ub:audit',
    summary: 'Run the check roster — findings recorded for triage',
    content: auditSkill,
  },
  {
    id: 'ub:whatif',
    aliases: ['whatif'],
    label: '/ub:whatif',
    summary: 'Trace a hypothetical change — promote it only on acceptance',
    content: whatifSkill,
  },
]

/** True when `query` is a prefix of the command's id or any alias. */
export function skillMatchesQuery(
  command: AgentSkillCommand,
  query: string,
): boolean {
  const q = query.toLowerCase()
  return (
    command.id.startsWith(q) ||
    command.aliases.some((alias) => alias.startsWith(q))
  )
}

/**
 * The one place a typed token turns into a skill that will actually run.
 * Ids only, because one canonical spelling invokes: with a lookup that fires
 * mid-sentence, every token this resolves is a message it can silently turn
 * into a skill run, and `/audit` in prose is far more often a word than a
 * command.
 */
export function findSkillByToken(token: string): AgentSkillCommand | undefined {
  const t = token.toLowerCase()
  return AGENT_SKILL_COMMANDS.find((entry) => entry.id === t)
}

/**
 * Where a lookup sits in the draft: the query to match skills against, and
 * the half-open span of the `/token` itself, so accepting can rewrite that
 * span and leave the prose around it exactly where it was.
 */
export type SkillLookup = { query: string; start: number; end: number }

/**
 * A slash opens a lookup when it OPENS A WORD — at the head of the draft, or
 * directly after whitespace (the CJK sentence marks included, since a reader
 * typing Japanese gets no space before the slash). Everything else a slash
 * appears in is text: a reference path, a URL, `and/or`, a date.
 *
 * THE LOOKUP FOLLOWS THE CARET. It is the token the caret sits at the end of,
 * wherever that is in the draft, so a reader who moves back into a sentence
 * and types `/au` between two words gets the same menu as one typing at the
 * tail. The tail is the default and the commonest case: with the caret at the
 * end of the draft this reads exactly what a tail-only rule did. It used to
 * be tail-only, to keep the lookup derived from the text alone, and the cost
 * was that the gesture of editing back into a sentence offered nothing.
 *
 * At the END of the token, not merely inside it: the text before the caret
 * has to finish on the slash and its token characters, and the character at
 * the caret has to be one the token cannot continue with — the end of the
 * draft, whitespace, punctuation outside the grammar. A caret in the middle
 * of `/audit` is a reader editing a word, and a menu there would complete
 * half of it. A second slash at the caret counts as a continuation for the
 * same reason the token walk below refuses one: `/ub:audit/notes.md` is a
 * path, wherever the caret stands in it.
 *
 * A space after the token closes it, because the space is not in the token's
 * character class and the token has to reach the caret. That is also why a
 * completion writes one and puts the caret past it.
 *
 * A DRAFT THAT OPENS WITH A RESOLVED SKILL still gets a lookup on its later
 * tokens. A guard used to refuse one — a head command owns its arguments in
 * the tool this composer mirrors, so a slash inside them is argument text —
 * and it was deleted, because a message here carries as many skills as its
 * text names: with the guard, `/ub:map notes then /ub:au` offered nothing and
 * the second skill had to be typed out in full, which is the feature refusing
 * itself. What the guard was protecting costs little without it: a path typed
 * for a skill to read opens a lookup whose query matches no skill, and a
 * lookup with no matches opens no menu.
 *
 * ONE SPELLING of the token grammar, `SKILL_TOKEN_CHARS`, used by every
 * pattern below. Two spellings of it drift, and the drift shows up as a
 * trigger that fires on a string the tests next door swear it refuses.
 */
// The trailing `-` stays last: anywhere else in a class it is a range.
const SKILL_TOKEN_INNER = 'a-zA-Z0-9._:-'
const SKILL_TOKEN_CHARS = `[${SKILL_TOKEN_INNER}]`
/**
 * A token stops where neither a token character nor a slash follows. Shared
 * by the lookup, which asks it of the character at the caret, and by the
 * walk over the whole draft further down.
 */
const TOKEN_ENDS_HERE = `(?![/${SKILL_TOKEN_INNER}])`
const LOOKUP_BEFORE_CARET = new RegExp(
  `(?:^|[\\s。、？！])/(${SKILL_TOKEN_CHARS}*)$`,
)
const TOKEN_ENDS_AT_CARET = new RegExp(`^${TOKEN_ENDS_HERE}`)

export function findSkillLookup(
  draft: string,
  caret: number = draft.length,
): SkillLookup | null {
  const at = Math.max(0, Math.min(caret, draft.length))
  if (!TOKEN_ENDS_AT_CARET.test(draft.slice(at))) return null
  const match = LOOKUP_BEFORE_CARET.exec(draft.slice(0, at))
  if (!match) return null
  const token = match[1]
  // The span starts at the slash rather than at the whitespace that
  // qualified it, so the space the reader typed survives the pick.
  return { query: token.toLowerCase(), start: at - token.length - 1, end: at }
}

/**
 * Accepting from the menu COMPLETES the token where it sits, the way a shell
 * completion does: `Hey can u /ub:aud` becomes `Hey can u /ub:audit `, and the
 * prose either side of the span is not read, moved or trimmed.
 *
 * It does not remove the token, and that is the reversal. Accepting used to
 * lift the span out of the prose and render the skill as a badge in a row
 * above the field, which moved the reader's word to the front of the message
 * and lost the position they had typed it in — `asdasd /ub:audit` became
 * `[/ub:audit] asdasd`. The token IS the invocation now, so it stays in the
 * sentence and takes a colour instead.
 *
 * The trailing space earns its place twice: it closes the lookup, because a
 * token has to end at the caret to be one and a space is outside the token
 * grammar, and it leaves the reader mid-sentence rather than mid-word.
 * Without it the menu reopens on the completed token and the next Enter
 * picks the same skill again instead of sending.
 *
 * A span the prose continues after keeps the space it already has rather than
 * gaining a second: a pick made mid-sentence and the near-miss offer both
 * rewrite a token with prose behind it, and "then /audit the intake" would
 * otherwise come back as "then /ub:audit  the intake" — a visible hole in the
 * reader's own sentence.
 *
 * THE CARET COMES BACK WITH THE TEXT, past the completed name and its gap —
 * the space this wrote, or the one the prose already had. Past the gap and
 * not before it, because the lookup follows the caret: a caret left between
 * the name and the space sits at the end of a token, and the menu would
 * reopen on the name just written. It is returned rather than left to the
 * field because assigning a textarea's `value` puts the caret at the end of
 * the new text, and "the end" is the right answer only while the span
 * reaches it; for a span with prose behind it the reader who accepted would
 * be thrown to the end of their sentence.
 *
 * One return value rather than a caret function beside this one: the offset
 * is `span.start` plus the name and the gap, and a second function deriving
 * it would have to spell the gap rule again and could come to disagree with
 * the string it is describing.
 */
export function completeSkillToken(
  draft: string,
  span: { start: number; end: number },
  command: AgentSkillCommand,
): { text: string; caret: number } {
  const after = draft.slice(span.end)
  const gap = /^\s/.test(after) ? '' : ' '
  return {
    text: `${draft.slice(0, span.start)}${command.label}${gap}${after}`,
    // One past the name either way: over the space written here, or over the
    // one the prose already had.
    caret: span.start + command.label.length + 1,
  }
}

/** A token that resolves to a skill: which skill, and where in the draft. */
export type SkillTokenSpan = {
  command: AgentSkillCommand
  /** Half-open, over the `/token` including its slash. */
  start: number
  end: number
}

/**
 * Every word-start slash token in the draft, wherever it sits. Like the
 * lookup above, which asks the same of the character at the caret, this walk
 * has to say where a token stops: without the lookahead, "check
 * /ub:audit/notes.md" stops the token at the slash, resolves it, and colours a
 * path segment as a skill that will run.
 *
 * The lookahead forbids a token character as well as a slash, and that is
 * load-bearing rather than belt-and-braces: forbidding only the slash lets
 * the match BACKTRACK to a shorter token — "ub:audi" — which satisfies it and
 * leaves the walk reading tokens the reader never typed.
 *
 * Both readers of the draft go through here — the spans that get coloured and
 * run, and the near-miss offer at the foot of this file — so a token grammar
 * one of them accepts is a token grammar the other accepts too.
 */
const SKILL_TOKEN_ANYWHERE = new RegExp(
  `(?:^|[\\s。、？！])/(${SKILL_TOKEN_CHARS}+)${TOKEN_ENDS_HERE}`,
  'g',
)

function* wordStartTokens(
  draft: string,
): Generator<{ token: string; start: number; end: number }> {
  for (const match of draft.matchAll(SKILL_TOKEN_ANYWHERE)) {
    const token = match[1]
    // The match opens on the whitespace that qualified the slash, except at
    // the head of the draft where there is none.
    const start = match.index + match[0].length - token.length - 1
    yield { token, start, end: start + token.length + 1 }
  }
}

/**
 * Every token in the draft that names a skill, in the order they appear.
 *
 * THE TEXT IS THE ONLY RECORD of the skills a message carries — no badge, no
 * draft field and no component state holds a pick any more — so this one walk
 * answers both questions the composer asks of a draft: which spans to colour,
 * and which skills the send runs. One source cannot disagree with itself, and
 * the pair that preceded it did: a badge could outlive the token that made it
 * and a token could sit in the prose with no badge beside it.
 */
export function findSkillTokens(draft: string): SkillTokenSpan[] {
  const spans: SkillTokenSpan[] = []
  for (const { token, start, end } of wordStartTokens(draft)) {
    const command = findSkillByToken(token)
    if (command?.content) spans.push({ command, start, end })
  }
  return spans
}

/**
 * The skills a draft RUNS: one per resolved token, in the order the tokens
 * appear, each skill once however many times it is named.
 *
 * Ordered, because the order is the instruction — "/ub:map my notes then
 * /ub:audit it" is two steps in a sequence, and the loop is told to work
 * through them in that sequence rather than blend them. Deduped, because a
 * reader who names a skill twice in one sentence means it once, and a second
 * copy of a multi-kilobyte SKILL.md buys nothing but prompt. UNCAPPED: there
 * are four skills, and a limit would be a rule with no failure behind it.
 *
 * The send reads this and nothing else. There is no second record to consult
 * and none to keep in step.
 */
export function skillsInDraft(draft: string): AgentSkillCommand[] {
  const skills: AgentSkillCommand[] = []
  for (const { command } of findSkillTokens(draft))
    if (!skills.includes(command)) skills.push(command)
  return skills
}

/**
 * What the message says BESIDES the skills it names — the draft with every
 * resolved token taken out. Not what sends: the token stays in the text that
 * goes to the model, because that is what the reader wrote. This answers the
 * narrower question of whether a draft is a sentence at all, so that a draft
 * which is nothing but a skill name can be sent as a plain instruction
 * instead of as the bare token.
 *
 * Backwards through the spans, so each slice is taken at an offset the
 * earlier ones have not moved yet.
 */
export function draftWithoutSkillTokens(draft: string): string {
  return findSkillTokens(draft)
    .reduceRight(
      (text, span) => text.slice(0, span.start) + text.slice(span.end),
      draft,
    )
    .trim()
}

/** The bare spelling a token missed by: never resolved, only suggested. */
function findSkillByAlias(token: string): AgentSkillCommand | undefined {
  const t = token.toLowerCase()
  return AGENT_SKILL_COMMANDS.find((entry) => entry.aliases.includes(t))
}

/**
 * A near miss: the token as typed and the skill it nearly named, with the
 * span to rewrite if the reader takes the offer.
 */
export type SkillNearMiss = {
  /** The token as typed, without its slash. */
  token: string
  /** The closest skill — the one whose bare alias the token spelled. */
  command: AgentSkillCommand
  /** Half-open, over the `/token` including its slash. */
  start: number
  end: number
}

/**
 * EVERY token in the draft that nearly names a skill and therefore runs
 * nothing, in the order they appear: a word-start token matching a skill's
 * bare alias and no skill's official name. `/audit` is the case — it looks
 * like an invocation, it is not one, and a message carrying it would
 * otherwise send as prose with nobody told, which is the failure this exists
 * for. One real session spent four rounds re-reading the same scenario while
 * the agent improvised the flow it had never been given.
 *
 * ALL of them, not the first: several skills per message is normal here, so
 * "check /audit then /map this" holds two near misses, and a walk that
 * stopped at the first asked about `/audit`, completed it, and sent with
 * `/map` still silent — the exact silence this walk exists to close, reopened
 * one token to the right.
 *
 * A token that DOES resolve is not a near miss and never comes back from
 * here. It is coloured in the field and it runs — that is the whole of the
 * promise the colour makes, and a prompt asking a reader to confirm what
 * they can already see would be asking them to read it twice.
 */
export function findSkillNearMisses(draft: string): SkillNearMiss[] {
  const misses: SkillNearMiss[] = []
  for (const { token, start, end } of wordStartTokens(draft)) {
    if (findSkillByToken(token)) continue
    const command = findSkillByAlias(token)
    if (!command?.content) continue
    misses.push({ token, command, start, end })
  }
  return misses
}
