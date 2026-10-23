---
summary: The three compare arrangements over one shared axis, the merged view's per-slot membership encoding, the resizable panel's measurement contract, and the differences ledger's two grains.
claims:
  - src/components/blueprint/CompareCellBlock.tsx
  - src/components/blueprint/CompareDifferencesSurface.tsx
  - src/components/blueprint/CompareLaneRowShell.tsx
  - src/components/blueprint/ComparePathSectionFrame.tsx
  - src/components/blueprint/CompareTrackDecorations.tsx
  - src/components/blueprint/StructureDraftZones.tsx
  - src/components/blueprint/MergedCompareGrid.tsx
  - src/components/blueprint/ResizableComparePanel.tsx
  - src/components/blueprint/StackedCompareGrid.tsx
---

# Compare

Comparing paths is the cockpit: three arrangements of the same cells over one
canonical axis, plus a ledger that enumerates every difference. The model is
built **once** — in `ScenarioBlueprintPanel`, distributed by props — and gated
null until every selected blueprint has loaded, because a half-refreshed pair
fabricates flash divergences.

## One axis, three arrangements

The column and lane axis is derived from the compare model, never from the DOM,
and one derivation serves every arrangement so the modes cannot drift apart in
two copies. `gridTemplateColumns` is never animated.

- **Side-by-side** is the general primitive: any set of labelled variants as
  columns, in the caller's order. "Designed vs reality" is one possible
  labelling, not an assumption — no path id, path name or fixed pair is
  hardcoded. Overview rows keep it for the shared-row-height contract. *It has
  no live mount point today; treat it as the primitive the service grid's docs
  point at.*
- **Stacked** is the focused-scenario arrangement and the fallback whenever
  there is no model: every compared path as a full-width band, one below the
  other, on one canonical step axis owned by the parent grid. Bands take their
  column tracks via `gridTemplateColumns: subgrid`; columns a path lacks hold
  inert spacers. **No `position: sticky` in here** — the grid lives inside the
  zoom-transformed canvas, where sticky both misbehaves and has nothing to stick
  to. Authoring stays in Stacked.
- **Merged** is the compared paths combined into *one* blueprint: one lane set,
  labels rendered once, one canonical step axis, and then per slot (lane ×
  column) either one drawn cell where the paths agree or a vertical stack where
  they disagree. **The slot grows only where the paths disagree, and that
  vertical swell IS the diff signal.** Every sub-cell keeps its own real cell
  id, so selection, focus, pulse and the agent's cell tools work with no
  disambiguation. Merged is a **reading** view: no edit-mode drop targets (an
  N-path empty slot has no single sensible target) and no resize handles (a
  merged column stands for N paths' steps).

Merged renders only once the model exists — it *is* a comparison, so a single
path or a half-loaded pair has nothing to merge and falls back to the stacked
bands, which read fine with one band. Entering Merged also opens the Differences
ledger: one gesture lands in review posture, from the menubar toggle and from
the agent's view command alike.

Shared chrome, so the arrangements agree by construction: `CompareLaneRowShell`
(row anatomy is a property of the **lane**, not of any path, so stacked and
merged share it and differ only in the cells they put inside),
`CompareTrackDecorations` (the step-name header row belongs to the column axis
rather than to any one path), `ComparePathSectionFrame` (the Figma-style
path-type outline), and `CompareCellBlock` — the same cell face in every
arrangement, down to its `data-blueprint-cell` anchor, so selection, focus and
arrow geometry behave identically wherever it is drawn.

## The membership outline

In merged, a cell has to say which paths it stands for **without repainting its
lane fill**. The encoding is a thin rounded outline on the cell edge:

- one member → a flat colour;
- N members → equal perimeter segments, one per path, drawn as a conic gradient
  and painted through a mask-composite ring that inherits the cell's radius;
- hover or keyboard focus discloses the full path names.

A shared slot therefore **shows every selected path** rather than encoding
"shared" as an unexplained absence. `mergedMembershipRailContract.test.ts` pins
the negative half: no whole-cell path wash, lane fills preserved.

What counts as agreement is content-only, on purpose. A detail-only difference —
summary, resources or touchpoints — must not fork the canvas; it lives in the
ledger. Equal signatures collapse into one drawn cell whatever the slot kind,
with the rest hidden and their arrow ids aliased onto the drawn one. Sub-cell
order follows the sidebar's selection order.

Worth knowing: the per-slot merge is independent of any long shared *run* of
columns. The measured median spine coverage was 13%, which is why agreement is
asked slot by slot rather than run by run.

## `ResizableComparePanel`

A scenario panel on the overview canvas, resizable from its corner by pointer or
keyboard, growing to fit measured content unless the user overrides the size or
the row locks it.

- **The panel never scrolls internally.** It lives on a zoomable, pannable
  canvas, and that camera *is* the scrolling. A height lock still sets the
  shared floor across a phase row, but it is a floor, not a ceiling.
- **Measurement is a layout effect over a `ResizeObserver`**, on layout size
  rather than `scrollHeight`. Growth is answered in the commit that causes it;
  shrinkage can only be answered once a new measurement arrives, and measuring a
  paint late is what makes adding a path resize at once while removing one holds
  and then snaps.
- **Boards top-align inside the panel, always.** Never centred — see the
  phase-row height contract in [canvas.md](canvas.md#the-phase-row-height-contract).
- A locked panel renders **no resize handle**.
- **`navigable` is gated on the handler existing.** No handler, no affordance: a
  surface that renders `role="button"`, a pointer cursor and an aria-label and
  then does nothing when tapped is worse than an inert one. Mobile deliberately
  passes no handler, because every move between scenarios and phases there
  belongs to the drawer.
- Row-height exclusion is an explicit attribute keyed on **expansion**, never on
  focus. Gating it on focus made the row height change when a panel was merely
  focused, which is the thing the exclusion exists to prevent.

## The differences ledger

Compare v3's ledger is the authoritative enumeration of every difference between
the compared paths. One accordion group **per step** that has a canvas
difference, in canonical order, one open at a time, with detail-only diffs in a
trailing unnumbered group. A single step group with nothing after it renders
flat — accordion chrome around one group is furniture.

Opening a group flies the camera to that step's cells: **accordion plus fly is
one gesture**, through the same active-step cursor compare navigation reads.

Counts: exactly one per group, at the **end** of its header row, post-filter.
There is no total anywhere on this surface — the menubar Diff count owns that
number, and app-wide the two of them are the only difference counts.

**Two grains, and they are not the same thing.** *Zones* are divergence runs,
numbered ①②③; they are topology, and the divergence strip is the only surface
that draws them. *Step groups* are one canonical column each; they are the
ledger's grain and what `jump_divergence` walks. "Steps 3–8" as one accordion
group was a wall; six per-step groups are readable.

Rows carry a lane cell, one quote per path, and a ghost ⇱ that hands off to the
cell panel's Details surface. Verdict badges are `+` ("present in only one path")
and `≠` ("paths diverge here"). Filters cover lanes, verdicts and steps, empty
meaning all, and the header carries no zone badge — it already says "Step N".

## Cross-surface state

`compareReviewStore` is a module store because the model's consumers are
scattered across React trees that share no provider: the menubar Diff count, the
portalled ledger drawer, the divergence strip on the canvas, and the agent's
`get_ui_state` contributor. Module store plus `useSyncExternalStore` is the
house pattern for exactly this shape.

It holds four things and no more: the registration (slide id — which is also the
focus-cells registry key — scenario and phase names, view mode, model,
selection-ordered blueprints), the active step key, the filters, and whether the
ledger is open.

The active step key is **the one navigation cursor**, shared by the ledger's open
group, the strip's highlighted segment and `jump_divergence`. It is finer than
the old zone index: a run of six divergent steps is six stops, not one. There is
a single write path for it. Active step and filters reset only on scenario
change — they are per-comparison state, not preferences — and the last
registered slide id survives unregistration so a mode switch or a refetch
re-registering the same scenario does not wipe it.

## Fly-to

One gesture, one function: every caller that flies to compare cells — ledger
rows, zone jumps, agent commands — goes through `compareZoneNavigation`. It
resolves the viewport by slide id, marks the step active in the store, and
flies. Nothing else is involved.

> **Fold is retired (2026-08-17).** Pleats, pinned columns, the `[⇤ Fold]`
> toggle and the `collapse_shared` / `toggle_pleat` commands are gone —
> agent-only canvas state with no human toggle. `ComparePleatCell`,
> `compareFold` and `computePinnedColumns` have zero hits in `src/`. The fly is
> a straight fly because no target is hidden any more, and the axis is always
> the full canonical column set. The `kind: 'column'` discriminant on a grid
> track is a deliberate vestige so track consumers keep the same shape — not an
> invitation to add a second track kind back.

`StructureDraftZones` keeps a draft lane destination visible across its whole row. The step-header axis carries the matching column zone. Both use the real projected grid, so frames, labels, dividers and arrows keep their coordinates. Semantic divider anchors come from saved lanes until the draft is committed.
