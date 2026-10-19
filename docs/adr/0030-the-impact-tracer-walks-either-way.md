---
summary: The impact tracer takes a `direction` — `downstream` by default, `upstream` on request — because what-if's prioritize step ranks a cell by the `enables` machinery that feeds it, which is a walk against the edges; one walker with a flag keeps the visited set, the depth cap and the key discipline in one prompt, where a second agent or an inline reversed walk would copy them.
---

# 30. The impact tracer walks either way

**Status** Accepted — 2026-10-11.
**Context** `agents/impact-tracer.md`,
`skills/whatif/references/whatif-playbook.md` § 2 (prioritize), the
`Enables` entry in [`CONTEXT.md`](../../CONTEXT.md)

## Context

Both edge kinds read source-first: `A leads_to B` (A makes B happen) and
`A enables B` (A makes B possible). The tracer was written for one question,
what a change breaks, so it walked outgoing edges only, and its Method said
there was nothing to read backwards.

What-if's prioritize step asks a second question: how much backstage
machinery makes this moment possible. That is the set of cells whose `enables`
edges point AT the seed, an incoming walk. The playbook asked the tracer for
it ("reversed") while the tracer's own prompt ruled it out, so every
prioritize run either skipped the signal or improvised a walk without the
visited set and the depth cap that keep a cyclic graph finite.

## Decision

The tracer takes `direction: downstream | upstream`, downstream when the
dispatching prompt names none. Upstream follows incoming edges of either kind;
everything else in the Method holds unchanged — visited set, depth cap 8,
same-path edges, keys that exist. An upstream walk returns `displaced_demand`
empty, since nothing is removed. The output echoes `direction` beside the
seed.

What-if's prioritize step dispatches the tracer with `direction: upstream`.
Every other caller keeps the default.

## What this rejects

**A second agent for the upstream walk.** It would carry the same Method, the
same termination rules and the same output shape, and the two copies would
drift — the failure this change exists to fix.

**Prioritize walking the graph inline.** The main context would re-derive the
cycle handling on each run, and nothing would hold it to the cap.

## Consequences

- A caller that wants the old behaviour passes nothing; existing dispatches
  read the same.
- The tracer's output gained `direction`, and `enables_expressible` beside it:
  an export older than the `enables` kind cannot show an absence, and the
  field is where the tracer says so.
