---
summary: The one forked surface — the phone's view-only, scenario-scoped canvas, its chrome, the single-select path control, and the non-goals that are decided rather than deferred.
claims:
  - src/components/mobile/MobileShell.tsx
  - src/components/mobile/MobileScenarioTransition.tsx
  - src/components/mobile/MobileTopBar.tsx
  - src/components/mobile/MobileNavSheet.tsx
  - src/components/mobile/MobilePathSelector.tsx
  - src/components/mobile/usePhoneSettingsAsk.ts
---

# Mobile shell

The one surface that forks. Every other document here describes a tree the
phone and the desktop share; below the 768px gate (`MOBILE_SHELL_QUERY` in
`src/hooks/useMobileShell.ts`, `max-width: 767px`) this shell renders instead of the
desktop one; the `MOBILE_BREAKPOINT` in `use-mobile.ts` is the same number, read only
by the sidebar primitive. Directly above
it the desktop shell renders, with its [sidebar](sidebar.md) collapsed or open
as the reader left it, so the two meet with nothing between them.

The phone shows the **same canvas as desktop** — there is no mobile-specific
reading view. An earlier vertical "reader" existed and was deleted in the
2026-08-17 redesign; the shipped model is desktop parity, scoped.

## What the fork changes

- **View-only for every tier**, including service accounts — the same
  experience site visitors get. No design mode, no cell editing, no structure
  writes; the agent is present (for tiers that have it) but limited to the
  reading toolset. This is a UX gate — the server's RPC tiers remain the real
  wall.
- **One surface: the shared canvas, scoped to ONE SCENARIO.** The phone renders
  a single board rather than the whole service (rendering the whole board is
  what used to jam the main thread). Picking a different scenario replaces that
  spatial world: the outgoing board fades out, the incoming board mounts and
  fits while hidden, then fades in. It is deliberately not a camera flight
  between unrelated coordinate systems, and it never mounts two heavy boards
  at once.

  The scope is a scenario, not a phase, and the difference is load-bearing. A
  phase row is up to seven full boards; drawing the set on a phone took the
  renderer down. It also put sibling scenarios on the canvas as apparent
  destinations, which the phone has no way to reach — there is no phase lane, no
  canvas navigation, and the drawer is the only route between scenarios. So the
  shell must not disclose siblings at all. A phase-only selection (the agent
  bridge and boot links can still produce one) resolves to that phase's first
  scenario rather than falling back to the row.
- **The canvas does not navigate.** Every move between scenarios and between
  phases belongs to the drawer. Scoping the canvas to one scenario removes the
  siblings there were to tap, but that is a statement about what is currently
  rendered; this is a statement about what a tap MEANS, and it is the one that
  survives someone widening the scope later. It also covers the phase frame,
  which is a navigation target in its own right and is not a scenario at all.
  `ServiceOverviewView` passes no navigate handler when `useMobileShell()` is
  true, and `navigable` in `ResizableComparePanel` and `CanvasPhaseSection` is
  gated on the handler existing — so the surfaces are genuinely inert (no
  `role="button"`, no pointer cursor, no aria-label promising a destination)
  rather than buttons that swallow taps. Panning and pinching over them are
  unaffected.

## Chrome

The phone's first screen is the cover. The cover CTA opens the first
scenario of the first phase through `openScenario`, drawer closed. The
drawer does not open on mount.

`MobileTopBar` (menu · title · contextual right slot) up top; `MobileNavSheet` —
a left sheet holding a rail + panel, the same IA and `NavRow` components as the
desktop [sidebar](sidebar.md), with Blueprints/Slices surfaces and the theme
toggle at the rail's foot — as the index. Phase rows are pure accordion headers; only scenarios (and slices)
navigate.

- **Paths are single-select.** The top-bar control (`MobilePathSelector`) picks
  exactly one path through the same PathSelection context the desktop PATHS
  checkboxes drive, defaulting to the last-viewed path per scenario
  (localStorage) or the happy path. A one-path scenario shows a read-only badge
  instead of a menu.
- **The touch canvas is the real `ZoomPanViewport`** under the
  [touch contract](canvas.md#the-touch-contract): slop-gated pending pan,
  tap-to-open, two-finger pinch (with mid-gesture rebase), ghost-pointer reset,
  trailing-click swallow.
- **Reset View** is a mobile-only affordance — bottom-centered under the thumb
  (no scroll wheel, easy to lose the canvas). Desktop reframes on
  double-click/Home instead.
- **Sheets replace side panels:** the agent opens from a floating action button
  into a 60svh bottom sheet ([agent-session.md](agent-session.md)); cell detail
  is a bottom sheet
  ([dialogs-sheets-and-forms.md](dialogs-sheets-and-forms.md) owns the posture
  contract); slices are viewable read-only, with presentation as a full-screen
  takeover.
- **44px touch targets** throughout, as the `size-11` pattern.

## Non-goals — deliberate, not deferred

- **No mobile authoring.** Decided, not pending: mobile is view-only for all
  tiers, and design mode simply does not exist below the gate (absent, never
  disabled).
- **No mobile-specific reading view.** Tried, shipped, deleted (2026-08-17): the
  maintained answer is one canvas with a scenario-scoped camera, not a second
  rendering of the board.
- **No PWA / offline / install.**
- Compare v3 on mobile is a filed follow-up, not a silent gap — the cockpit is
  its own responsive problem.
