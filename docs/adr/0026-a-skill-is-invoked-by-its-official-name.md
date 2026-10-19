---
summary: A skill is invoked by its official namespaced name — `/ub:audit`, never `/audit` — and the bare segment after the colon keeps one job, finding the skill in the composer's menu and suggesting it when a reader types it as a token; one canonical spelling invokes, so a transcript, a ticket and a prompt all name a skill the same way, and the alias becomes the near-miss hint the silent-token notice needs.
---

# 26. A skill is invoked by its official name; its alias only finds it

**Status** Accepted — 2026-09-17. Reverses the bare-alias resolution the
composer shipped with.
**Context** `src/lib/agent/skills.ts`,
`src/components/editor/agent/AgentChatView.tsx`, § The agent in
[`CONTEXT.md`](../../CONTEXT.md)

## Context

Every skill has two spellings. The official one is namespaced to match the
plugin invocation exactly — `/ub:audit` in the composer and `/ub:audit` in an
IDE are the same `SKILL.md` — and beside it sat a bare alias, `/audit`,
resolving to the same skill. The comment that introduced the aliases said what
they were for: muscle memory.

Both spellings resolved, and so a skill had no canonical name at the only
moment naming matters. A transcript recorded whichever the reader typed, a
ticket quoted whichever its author remembered, and a reader who learned
`/audit` here found nothing under that name anywhere else the skill is
published.

The cost arrived attached to a different failure. A reader typed a skill name
inside a sentence rather than at its head, the composer recognised no token
there, and the message sent as prose — no skill loaded, and nothing said so.
Fixing the trigger raised the naming question, because a lookup that fires
mid-sentence fires on far more tokens, and every token it resolves is a
message it can silently turn into a skill run. A message that merely
*mentions* `/audit` is a sentence a reader wrote, not an invocation.

## Decision

The official namespaced name invokes a skill. `findSkillByToken` matches ids
and nothing else.

The alias keeps two jobs, both of which stop short of running anything. It
matches in the composer's menu, so a reader still types `aud` and finds
`/ub:audit` without typing the namespace first. And it is the source of the
near-miss suggestion: a token that resolves to no skill but matches an alias
names the canonical skill as the closest match, offered for the reader to
accept rather than run. The wording of that offer belongs to the surface that
makes it.

The division is not novel: the tool this composer mirrors separates the two
acts the same way, matching a typed fragment loosely while dispatching on a
canonical name, and telling the model plainly when a typed token named nothing
available. That is precedent for the shape, not a commitment to its matcher —
what this composer searches on is its own question, settled where the search
lives.

## Consequences

**Muscle memory retrains, once.** A reader who types `/audit` no longer runs
the audit — they are offered it. That is the reversal, and it is deliberate:
the offer is what makes the mid-sentence lookup safe to have at all.

**An alias is half-alive on purpose.** A future reader finds `aliases` in the
skill definition and finds nothing resolving them, which reads like a bug
unless this is written down. It is searched and suggested, never resolved.

**The silent-token notice depends on it.** Without aliases as a near-miss
source, a token that stops resolving stops being recognised, and the notice
that exists to break the silence goes quiet in exactly the case a reader is
most likely to hit. The alias is what keeps the suggestion possible.

**Both spellings stay in the glossary.** § The agent names the official form
as the one that invokes and the bare segment as the one that finds, because a
term spelled two ways in the interface is spelled both ways here.
