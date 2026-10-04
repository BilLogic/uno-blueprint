---
summary: The icon rail's two groups, the one disclosure vocabulary every twisty in the sidebar obeys, the slices section, where path selection went and what it kept, the single persisted width shared by all three surfaces, and the collapse that never moves the camera.
claims:
  - src/components/editor/EditorRail.tsx
  - src/components/editor/EditorSidebarRail.tsx
  - src/components/editor/SidebarNav.tsx
  - src/components/editor/SlicesSidebarSection.tsx
  - src/components/editor/StructureRowMenu.tsx
---

# Sidebar

An icon rail plus one resizable panel column. Three surfaces share that column —
Blueprints, Slices, Agent — and the whole design is about making three surfaces
read as one place.

## The rail: two groups that mean two different things

Figma's sidebar IA, split:

- **Top — the panel surfaces** (Blueprints, Slices). A radio group: exactly one
  is showing, and the selected one wears the left rail bar, which is this app's
  "you are here" mark.
- **Bottom — the toggles** (Agent chat, Settings, theme). The chat is a
  *companion*, not a surface. Sitting it in the radio group made it look
  mutually exclusive with the panel it actually accompanies, so it moved down
  with the other utilities and wears a filled tint plus a presence dot instead
  of the rail bar.

A rail button takes `selected` **or** `toggled`, never both — that is what keeps
the two vocabularies from blurring, and the props say the same thing one level
up: `onSelectPanel` carries a `SidebarPanel`, which is Blueprints or Slices and
nothing else, while ✦ has its own `onToggleAgent`. The chat was briefly a third
member of that union, which meant every consumer stripped a value the state
could never hold. The one collapse toggle sits in the top
slot, the same corner the floating navbar occupies when collapsed; ⚙ is pinned
under a spacer so keys are reachable from any surface.

> `EditorSidebarRail.tsx` contains no rail despite its name, and neither it nor
> the DS primitive's own `SidebarRail` has a live consumer. Its `w-60` / `15rem`
> constants also contradict the live 288px default, which has one owner:
> `src/lib/layoutTokens.ts`. Treat it as dead code, not as a second rail. The
> primitive's cookie and ⌘B shortcut are likewise not this app's contract — the
> app overrides `--sidebar-width` inline, and the primitive derives rem widths
> from that same owner rather than keeping its own width constants.

## One disclosure vocabulary

`SidebarNav` is the sidebar's single twisty vocabulary, used by the Phases
section header, the phase rows inside it, and the slice type groups —
so every disclosure in the sidebar looks and behaves the same. Three rules,
taken from Figma's layer tree:

1. **The chevron sits to the left of the label**, in a fixed-width slot. A leaf
   row renders that slot empty and keeps its width, so labels at one depth share
   an x.
2. **It points right when collapsed, down when open** — one icon, rotated.
3. **It only appears on hover** (or keyboard focus) of its own row. At rest the
   sidebar is a list of names, not a field of arrows. Coarse pointers get it
   always: an affordance that only exists under a mouse is not an affordance for
   everyone.

Expansion is always available, because **the chevron is its own button**: a row
can be collapsed without first selecting it. The label button navigates, the
chevron button expands, and they are siblings rather than nested — a button
inside a button is invalid markup, and the sibling structure is also what lets
the two actions stay independent.

What makes a row navigate rather than merely disclose is simply whether it was
given open/toggle handlers. `aria-current` goes on the **label** button only.
ArrowRight expands and ArrowLeft collapses without navigating — the keyboard
equivalent of clicking the chevron rather than the row. And there is **one focus
ring for the whole row**: a ring on just the inner button read as highlighting
the wrong box.

`NavRowAction` is the hover-revealed `+` / `⋯` at a row's right edge. It has **no
fill of its own** — a second surface inside a row is the box-in-a-box the
composer taught us to stop drawing — so emphasis comes from the glyph, which
brightens to the rail-bar colour on hover, the only saturated ink in the
sidebar. Its target is deliberately bigger than its mark.

Section headers (`Phases`, `Sessions`, the slice type groups `Journey`, `Step`,
`Lane`, `Cell`, `Custom`) are `Eyebrow`s and follow the sentence-case rule in
[overview](overview.md#small-labels-are-sentence-case): the title is passed in
sentence case and rendered as written. A slice kind is stored lowercase, so the
group heading maps it to its title rather than leaning on CSS to capitalise it.

An `ancestor` prop survives in the type but is **no longer drawn**: the
highlighted scenario one line below already says it, and two markers for one fact
read as two facts. It is kept so call sites keep stating it, which is what guards
against `selected` and `ancestor` ever both being true.

## PATHS ARE NOT IN THE SIDEBAR

They were, and the section is gone. Path selection lives in the **top bar**, in
`PathSelectorMenu` — a compact popover trigger showing overlapping path-colour
dots and a count, mounted beside the compare controls. Paths belong to a
scenario, so the control belongs where the scenario title is, not in a tree of
phases (decided 2026-08-17).

A paths section in the sidebar outlived that decision by some months: it was
never deleted and never mounted, so it compiled, typechecked and rendered
nowhere. It is gone — this paragraph is here so the next reader does not go
looking for a `NavSection title="Paths"` that this document once promised.

Two rules moved with the control and still hold:

- **A filter key is not a row id.** A path option's id is its *identity*
  (`${type}:${name}`), which every authoring RPC would reject as a uuid. The
  option carries the row uuids it was folded from in `pathIds`; anything that
  needs to intersect a selection with what the canvas drew has to go through
  that field. `ServiceOverviewView`'s header does exactly this, and the comment
  there records what matching the two id spaces directly looked like.
- **Selection drives the canvas, and only the FOCUSED scenario obeys it.** A
  phase row is a survey and draws one happy path each; the focused scenario
  draws what the reader picked. One resolver, `resolveDrawnPathIds`, answers
  both — see its doc comment for what happened while there were two.

Slices deliberately have **no** path control: a slice is a fixed selection of
cells, so there is nothing for a path filter to narrow.

## SLICES

The service's slices grouped by type into accordion sections; only non-empty
groups render, all open by default. Rows reuse `NavRow` verbatim — same
component, same states, same indent as the phases tree — so an active tab gets
the selected fill and rail, an open-but-inactive tab gets the marker dot, and
everything else is plain.

**Accordion state is tracked as the collapsed set, not the open one.** A group
the user never touched stays open even when it first appears — slices load late,
new types get created — while an explicit collapse survives the list changing
underneath it. The version this replaced remounted the accordion whenever a
slice was created or deleted, resetting every group.

The context-menu trigger wraps the row rather than merging onto it, because
`NavRow` renders two sibling buttons and there is no single element to merge
onto. Items are Open in new tab and Present, then Rename, Duplicate and Delete
for writers in Edit mode. The empty state names the two real routes — Edit
mode's "Make slice", or the agent's `/ub:slice`.

This section is the precedent to copy for context menus over accordion
groups — it is the one place both patterns are already settled together.

## `StructureRowMenu`

Right-click on a phase, scenario or path row: rename, duplicate, add a sibling,
delete. It replaced a hover-revealed `⋯` button — the row's own hover state is
signal enough, and a per-row button was one more piece of chrome saying what
right-click already says. **There is therefore exactly one place these entries
live, and no second affordance to keep in sync.**

The row's `+` is a *different* action: it creates a **child**, this menu's New
creates a **sibling**. That is why both exist and why they read differently.

One component for three kinds, because the shape is identical and the
differences are facts rather than code paths: Duplicate exists only where a
deep-copy RPC does; a phase gets neither duplicate nor delete, because offering
one without the other would make an accidental copy permanent.

It **renders children unwrapped — no menu at all** — for sessions that cannot
write or surfaces in View mode. And a null id means the caller cannot name one
row, in which case the menu does not open, rather than offering a rename that
would fail at the database.

## Width, collapse, and the camera

**One width for all three surfaces.** Blueprints, Slices and Agent share the
panel column, and a width that jumps on every rail switch reads as layout
instability, not as per-surface tailoring. It is drag-resizable, clamped, and
persisted as a single number; the aside is flush with the window's left edge, so
the pointer's x *is* the aside width. The width transition is disabled during
the drag, because easing against the pointer reads as lag rather than motion,
and the write to storage happens once at the end of the gesture — width memory
is a nicety, and a failed write is tolerated. No handle renders while collapsed:
there is no edge. The numbers live in `src/lib/layoutTokens.ts`, which is the
one home for a layout number the runtime does arithmetic on.

Collapse is one state covering presenting, explicit collapse and the landing
page. The aside animates its width to zero over the structural duration while
the body keeps its fixed width and is clipped, so open/close reads as a **wipe**
rather than a mount/unmount. The remnant is a floating navbar over the canvas
carrying the same single toggle. Selecting a surface while collapsed re-expands
— except ✦, which toggles the chat, so "chat while looking at the nav" is the
default posture rather than a swap away from it.

**Collapsing the sidebar never moves the camera**, and that is enforced rather
than hoped for. The width ease resizes the canvas container for 320 ms; the
canvas watches its container with a `ResizeObserver` so real window resizes
re-center. Chrome resizes carry no navigational intent, so every chrome-driven
resize — the sidebar wipe, the tab strip mounting — announces itself through a
module-level suppression window first. The window is comfortably longer than the
ease (measured overshoot past a 380 ms window on expand) and is re-entrant, the
longer deadline winning.

**The panel pushes; it does not float.** A deployment that wants a narrow band
where the column draws *over* the canvas instead of beside it is adding a
posture, not tuning one: nothing here reads a second breakpoint, and the two
states the sidebar has are open in the flow and collapsed to its remnant. The
alternative was tried and is worth knowing about — between a phone gate and a
comfortable desktop the sidebar and the canvas compete for width that is not
there — but the gate, the restore rule and the Escape that closes an overlaid
column are a surface of their own, and this document claims none of it.

**Outside-click is deliberately not wired.** The surface it would swallow
clicks from is the canvas, where a click selects a cell — losing that first
click to a dismissal is worse than one extra keystroke.

One ownership note: `CanvasModeProvider` wraps the sidebar, not just the canvas.
It used to wrap only the canvas, which left the sidebar unable to answer "are we
editing?" — so its `+` and `⋯` were live in View mode, offering to create and
rename things on a surface whose whole premise is that it changes nothing.
