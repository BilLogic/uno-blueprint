---
summary: State that must outlive a mount point, or be read by code with no hooks available to it, lives in a module-level store read through useSyncExternalStore rather than in context — two named conditions, not a state-management strategy.
---

# 5. Cross-surface state is a module store, not context

**Status** Accepted — 2026-09-06. Amended 2026-09-10 (#551): the instance
list gained `canvasModeContext.ts` and `canvasChromeResize.ts`, which this
tree already had and the deployment's copy (BilLogic/plus-uno-blueprint
ADR 0005) listed. Amended 2026-09-14 (#802): the list loses
`agent/panelState.ts`, folded with `agent/attachments.ts` into
`agent/sessions.ts` — one store for one thing, not three for the parts of it.
Amended 2026-09-18 ([#921](https://github.com/BilLogic/uno-blueprint/issues/921)):
the list gains `agent/persistenceReadiness.ts`, which answers whether the
persisted agent rows can be read yet — condition 1, because the panel that
asks unmounts and remounts when the chat is dragged between docked and
floating, and which read has been spent must not die in that gap. It takes the
sessions list's own hydration flags with it, so the question has one answer
rather than two. (Hookless code parks work there, but the outstanding answer
is only ever read through a hook, so condition 2 is not what sends it here.)
**Context** [#163](https://github.com/BilLogic/uno-blueprint/issues/163)

## Context

State shared across surfaces that do not share a provider lives in a
module-level store, read through `useSyncExternalStore`. Context is for state
that has a tree.

Two conditions send state here, and either one is sufficient:

1. **It must survive a mount point changing.** The agent chat renders from two
   places — docked in the sidebar, floating over the canvas — and a drag flips
   which one exists *mid-gesture*. Component state dies in that gap, taking the
   drop-target ring, the open session and a half-typed message with it.
2. **Code with no hooks available to it must read it.** The agent's UI-context
   collector is plain functions, and the agent's dispatcher reads the resolved
   active service (`contexts/activeService.ts`) to hand each tool call its
   scope — the service its reads cover and its writes land on. A value both a component and a bare function must
   agree on has nowhere else to live.

The live instances each carry their reason in their own header comment:
`agent/placement.ts`, `agent/settings.ts`, `agent/sessions.ts`,
`agent/persistenceReadiness.ts`,
`contexts/activeService.ts`, `contexts/canvasModeContext.ts`,
`contexts/shellBootStore.ts`, `contexts/sidebarCollapsedContext.ts`,
`lib/canvasChromeResize.ts`,
`lib/compareReviewStore.ts`, `lib/openCellStore.ts`, `lib/authoringSession.ts`,
and `hooks/useMobileShell.ts` (a media query as an external store).

## Consequences

**The snapshot must be reference-stable between writes.** A `getSnapshot` that
builds a fresh object per call loops the render. Every store here caches its
snapshot and bumps it on write; that is not an optimisation, it is the
contract.

**Persistence is decoupled from emission.** A drag emits on every pointermove,
and a synchronous `JSON.stringify` plus a storage write per frame is a real
cost for a value nobody reads until the next boot. Callers flush at the end of
a gesture.

**Default is still derived state and props.** This is the escape hatch for two
named conditions, not a state-management strategy. A store reached for because
prop-drilling felt tedious is a store nobody can find the writer of.

**A deployment inherits the pattern, not the instances.** These stores are
application code: a deployment that mounts this template gets them as they
are, and the rule that decides where a NEW piece of state goes is what this
record is for.
