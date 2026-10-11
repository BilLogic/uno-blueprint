---
summary: Skill and agent frontmatter descriptions are always-loaded context — a plugin host puts every one in front of the session on every turn — so they are counted as a second census beside the router, with their own downward-only char budget, and the negation ratchet sweeps them; the router's budget is not widened to hold them, because one number over both would let a cut in one hide growth in the other.
---

# 30. A description is always loaded, and is budgeted like the router

**Status** Accepted — 2026-10-11.
**Context** `scripts/always-loaded.mjs`, `scripts/check-router-budget.mjs`,
`scripts/check-negation-ratchet.mjs`, `scripts/repo-config.mjs`, the
`description` field of every `skills/<skill>/SKILL.md` and `agents/<agent>.md`.

## Context

The router's three checks held `AGENTS.md` to a char budget, a prohibition
ratchet and a pointer sweep, on the stated ground that `AGENTS.md` was the
whole of what a session is handed before it decides anything. The module that
names that tier said a skill's frontmatter loads because the session invoked
the skill.

That is false for a plugin host that loads skills and agents. Claude Code puts
every skill's and every agent's `description` in context on every turn, so the
session can choose to reach for one. The four skill descriptions and five
agent descriptions came to about 5,300 chars, more than the router they sat
beside, and nothing counted them. They had grown the way an uncounted tier
grows: synonyms for one case, the sample service named as a trigger, and
bodies restated in the pointer.

## Decision

**Descriptions are counted, as a second census.** `always-loaded.mjs` names
the files whose `description` is always loaded — one per skill, one per
agent — and reads the field alone; the body below it loads when the
description fires.

**They carry their own budget, and it only falls.** `descriptions.budget` and
`descriptions.slack` in `repo-config.mjs` work exactly as the router's: over
the ceiling fails, and more than the slack under it fails too, asking for the
ceiling to come down. The baseline is the size after the rewrite that
introduced the census.

**The negation ratchet sweeps them.** A description scores under its file's
name and counts as one file measured, so a description that leaves also trips
the ratchet's shrink rule.

## Consequences

- A description that grows is a red build until it is cut or the budget is
  raised deliberately, in the pull request that says why.
- A repository holding no skills or agents of its own counts none, and sets
  `descriptions.budget` to zero.
- The plausible fix that would undo this is folding the descriptions into the
  router's budget, for one number. It hides exactly what the second census is
  for: a router cut paying for description growth, or the reverse.
