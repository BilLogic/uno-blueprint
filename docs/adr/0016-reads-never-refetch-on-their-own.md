---
summary: The query cache is staleTime Infinity because nothing outside this app edits the data, which moves the whole burden of freshness onto every mutation.
---

# 16. Reads never refetch on their own

**Status** Accepted — 2026-08-25. Moved into this repository from
BilLogic/plus-uno-blueprint ADR 0006 on 2026-09-10 (#551); the number
here is this repository's.
**Context** `src/lib/queryClient.ts`

## Context

`src/lib/queryClient.ts` sets `staleTime: Infinity`. Nothing refetches on focus,
on reconnect, or on an interval. A read happens once and the answer is kept.

The justification is a fact about who writes, not about performance: **the
app is the only writer.** Local writes go through one authoring session, and
nothing outside this app edits blueprint content. There is no third party to
refetch away from.

## Consequences

**The entire burden of freshness moves onto the writer.** Every mutation must
invalidate, or the screen lies until reload. Scoped writes call
`invalidateQueries(prefix)`; any **structural** write calls
`invalidateStructure()`, which is one canonical key list rather than a
per-call-site subset — hand-rolled subsets drifted five ways before it existed,
and each drift presented as "the canvas did not update", which reads as a render
bug rather than a cache bug.

**A missed invalidation is invisible in review.** Nothing fails; the screen is
simply stale for one user in one session. That is the cost of the trade, and it
is why the invalidation call sits next to the write in every mutation module
rather than being inferred anywhere.

**The module that writes the rows is the one that invalidates** — not the
panel, dialog or agent tool that called it. Callers used to: eight sites
invalidated two keys nothing read, five hand-rolled structural subsets
drifted, and the agent cleared the whole cache after every write. Every key
is built in `src/lib/queryKeys.ts`, which the read hooks and the writers both
use, so a read and a write cannot spell one cache two ways; a test writes
through each module against a recording stand-in and asserts the keys.

**If a second writer ever appears** — a second app surface, a bot that edits, a
webhook — this decision is the first thing to revisit. It is not a tuning
parameter; it is a claim about who writes.
