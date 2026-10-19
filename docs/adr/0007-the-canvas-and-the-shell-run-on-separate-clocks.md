---
summary: The shell's entrance stagger and the canvas's reveal ladder are two clocks on purpose, joined by reads that run one way only — so a surface owning its own query takes its own hold session and reads the shell's boot layer for nothing but when that session may end, and arriving together becomes a decision somebody makes rather than something the machinery guarantees.
---

# 7. The canvas and the shell run on separate clocks

**Status** Accepted — 2026-09-08. Two clocks still hold. The assumption that
the canvas remounts whenever another view covers it is superseded by
[ADR 0010](./0010-open-views-stay-mounted.md). Diffed against
BilLogic/plus-uno-blueprint ADR 0010 on 2026-09-10 (#551): that copy still
assumed uncover remounts; this copy already carried the supersession, so it
stands.
**Context** `src/components/editor/EditorShell.tsx`,
`src/contexts/canvasRevealContext.ts`, `src/contexts/shellBootStore.ts`,
`src/components/ui/deferred-skeleton.tsx`

## Context

The shell stages its own arrival: the aside commits its width in one go, then
the parts of the sidebar fade in behind one another. The canvas runs a separate
ladder of reveal rungs and reports which rung it is on. The two meet only by
READING — the shell reads that rung to decide when to lift the sidebar's boot
layer, and an identity bar above the canvas reads the layer to decide when its own
skeleton may end. Every link points the same way, and nothing reads back.

The words for the phases of arrival are defined in
[CONTEXT.md](../../CONTEXT.md) § Five words for arrival. How each half is wired
is written where it is wired — the shell's in `EditorShell.tsx`, the rungs in
`canvasRevealContext.ts`, the published layer in `shellBootStore.ts` — and is
deliberately not repeated here. Two copies of a rule is one rule and one lie,
and a record that restated those comments would be that hazard rather than an
account of it. What this holds is the shape, and what the shape costs anything
new that arrives on screen.

## Why two

They are driven by different things. The shell's stagger runs on frames and
waits on nothing; it is choreography over space that is already reserved. The
canvas's ladder waits on a board being laid out and painted, and it starts over
whenever that canvas remounts. When this record was written, uncover was a
remount. That assumption is superseded by
[ADR 0010](./0010-open-views-stay-mounted.md). The ladder still restarts on a
real remount.

One clock would have to be the canvas's, because it is the one that can be slow.
It is also the one that restarts, and a shell driven by it re-runs its whole
arrival over a screen the reader has already loaded. The sidebar's once-per-entry
latch exists so that the shell's half fires exactly once per entry; folding the
two together hands that back.

## The two designs this rejects

Both look like straightforward reuse, and both have been proposed.

**Hoisting `data-shell-entrance` to a common ancestor** of the aside and the
canvas, so that a bar above the canvas can join the sidebar's stagger. The
attribute sits one level away from covering the bar, and the stagger is already
written. What it actually buys is two staggers in one subtree: the delays are
carried by descendant selectors, which do not stop at the aside's edge, and the
canvas below is already running rungs of its own. Two ladders over the same
pixels, and the shell's finishes first whether or not the board is ready.

**Sharing `EDITOR_BOOT_HOLD_KEY`** between such a bar and the sidebar, so that
the two resolve on one beat. A shared hold key is ONE session with one hold and
one fade, which is the right tool for a waterfall whose stages render from
different components and genuinely wait on each other. Two surfaces each waiting
on something different are not that waterfall. A bar that owns a query is
usually holding the fastest answer on the screen, so the shared key parks an
answer that has already arrived behind a sidebar that has not, and calls the
delay consistency.

## Consequences

**A surface that owns its own query takes its own hold session.** Share a hold
key along a waterfall, where the stages are genuinely waiting on each other;
keep the sessions apart across two surfaces waiting on different things.
`EntityHeader` is the worked example, and its own comment says which key it
declines and why.

**The read is one-directional, and must stay that way.** The shell may wait on
the canvas's rung. The canvas may not wait on the shell: it reports where it is
and is never told when to be there. A rung that waited on a shell state would
put the two clocks in a cycle, and the canvas is the half a reader is actually
watching.

**Owning a session is not the same as choosing a beat.** A surface decides for
itself what to draw while it waits; when it may stop waiting is a question about
the screen it is part of. An identity bar answers the first with its own hold
session and the second by reading the shell's boot layer, and it needs both — a
bar released by the layer alone would show a name it does not have yet.

**Arriving together stops being automatic, and that is the price.** Two clocks
mean the beat a new surface lands on is something somebody decides rather than
something the machinery supplies. The alternative supplies it by making every
arrival wait on the slowest and most restartable thing on the screen, which is
the trade this record declines.

**The reads chain, and every link points the same way.** A new surface may join
the chain at its end. It may not ask anything upstream to wait for it, which is
what would close the loop.

**The plausible "fix" that would undo this:** driving the sidebar's stagger from
the canvas's reveal rung, on the reasoning that one screen should have one
clock. It removes a state machine and reintroduces the remount — every return
from a tab replays the shell's arrival over a sidebar that never left.
