---
summary: One shell, six subjects — the drawer chrome every entity panel is made of, what the six panels share, where they legitimately differ, and the invariants a well-meaning edit breaks.
claims:
  - src/components/blueprint/BlueprintCellDetailPanel.tsx
  - src/components/blueprint/cellDetailCrumbs.ts
  - src/components/blueprint/CellDetailDifferencesSurface.tsx
  - src/components/blueprint/CellDetailDraftSurface.tsx
  - src/components/blueprint/CellDetailEmptySurface.tsx
  - src/components/blueprint/CellDetailOverview.tsx
  - src/components/blueprint/CellDetailTabs.tsx
  - src/components/blueprint/PanelSurfaceSwitcher.tsx
  - src/components/blueprint/cellDetailAgentCommands.ts
  - src/components/blueprint/cellDetailFacts.ts
  - src/components/blueprint/CellContentSection.tsx
  - src/components/blueprint/CellDependencyEditor.tsx
  - src/components/blueprint/CellDependencySections.tsx
  - src/components/blueprint/CellEvidenceTab.tsx
  - src/components/blueprint/CellInSlicesFooter.tsx
  - src/components/blueprint/CellOverviewSpec.tsx
  - src/components/blueprint/CellPanelEditor.tsx
  - src/components/blueprint/CellResourcesTab.tsx
  - src/components/blueprint/DefinitionCard.tsx
  - src/components/blueprint/EntityDetailPanel.tsx
  - src/components/blueprint/EntityPropertiesButton.tsx
  - src/components/blueprint/EntityTitleAffordance.tsx
  - src/components/blueprint/Eyebrow.tsx
  - src/components/blueprint/FeaturedResources.tsx
  - src/components/blueprint/RegistryLink.tsx
  - src/components/blueprint/LaneHeaderAffordance.tsx
  - src/components/blueprint/LanePanel.tsx
  - src/components/blueprint/NotionPropertyRow.tsx
  - src/components/blueprint/PanelSectionLabel.tsx
  - src/components/blueprint/PlacementResourcesList.tsx
  - src/components/blueprint/PanelTextareaField.tsx
  - src/components/blueprint/PhasePanel.tsx
  - src/components/blueprint/ResourcesList.tsx
  - src/components/blueprint/ScenarioPanel.tsx
  - src/components/blueprint/ServicePanel.tsx
  - src/components/blueprint/StepHeaderAffordance.tsx
  - src/components/blueprint/StepPanel.tsx
  - src/components/blueprint/TouchpointField.tsx
  - src/components/blueprint/panelLoading.tsx
  - src/components/blueprint/panelShell.tsx
---

# Entity panels

Six subjects — service, phase, scenario, lane, step, cell — over **one shell**.
That is the whole design, and it is worth saying why it is one shell: all of the
chrome was written for the cell panel and lived inside it, and four levels of
the blueprint tree own spec fields while only one had a surface. Copying a
ninety-line drawer four times is how two of them end up with different close
behaviour. `panelShell.tsx` is that drawer, lifted rather than duplicated.

## What the shell owns

`src/components/blueprint/panelShell.tsx` owns posture, keying, the footer host,
the field label, the header, the close control, the kind badge, the empty state
and the Save/Cancel row. Two panels sit on it: `EntityDetailPanel` (the five
non-cell subjects) and `BlueprintCellDetailPanel`.

- **Posture** is the drawer/sheet contract, owned by
  [dialogs-sheets-and-forms.md](dialogs-sheets-and-forms.md): a right-pinned
  inspector card on desktop, a bottom sheet below the gate, keyed on posture so
  a resize across the breakpoint remounts clean.
- **`data-cell-detail-panel` keeps its name** even though it is now the shell's
  attribute, not the cell panel's. It is a DOM contract in twenty places —
  every entry/exit animation in `animations.css`, the pan-exempt selector in
  `ServiceOverviewView`, `MarqueeSelection`, `SliceView`, `print.css`. Renaming
  it is a twenty-site change that will present as "the panel stopped animating".
- **One tree position.** Every render branch — details, draft, placeholder,
  differences — returns the shell at the same tree position, so React
  reconciles them as the same drawer. A surface switch is a content swap inside
  an open drawer, never a close-reopen.
- **One footer host per panel.** `CELL_PANEL_FOOTER_ID` and its four siblings
  are global DOM ids a form portals its Save/Cancel row into. Only one panel is
  open at a time today; separate ids make that a design choice rather than the
  only thing standing between us and the lane panel's buttons appearing under
  the cell panel's fields.
- **Exit timing is a timer, not only a callback.** `PANEL_EXIT_MS` must stay ≥
  the exit transition in `animations.css`. The drawer's own
  `onOpenChangeComplete(false)` was measured not to fire; it stays wired, and
  whichever arrives first wins.
- **Save is disabled until something differs** from the frozen baseline, and
  closing is blocked only while a save is in flight (`panelEditorBusy()`, which
  reads `data-panel-editor[data-busy]` — deliberately not a cell-specific
  attribute, or it would have guarded exactly one panel).

**One header, and one ✕.** `PanelHeader` draws the drawer header for all six
subjects: the class list of the header row, the crumb trail, the title and
description — read out or shown — and the close button. The cell's four
surfaces wore copies of all of it, which is how a trail that truncates a name
ended up with no way to read the whole name back. Four knobs, each naming a
difference a surface actually has: `titleShown` and `descriptionShown` draw
the words instead of reading them out (the draft's "New cell" and its
placement line), `banded` is the differences surface's bordered band rather
than the plain header, `lead` puts the surface switcher in the header row
itself rather than in the block the crumbs sit in, and `actions` is the row
the cell panel's widen toggle shares with ✕ — a panel that HAS that row keeps
it even when the toggle is null on a phone, which is why the row follows a
passed `null` and not a prop nobody passed. A crumb is a name, or a name
collapsed to an ellipsis: the cell's trail is four names and only the step is
the one the reader came for.

**Four states, not three.** Loading and error were there; a lane with no owner,
no KPIs and no tools rendered a full form of blank fields, which reads as a
loaded form the reader has to inspect to discover is empty. `PanelEmpty` is the
fourth — **view mode only**. In edit mode a blank form is correct.

## Loading is shaped, not generic

One generic placeholder stood in for four structurally different panels, and no
panel has two equal full-width boxes, so the swap read as a re-flow rather than
a fill-in. `panelLoading.tsx` exports one placeholder per panel, with heights
derived from the real field count, and counts that are **free**: the step
placeholder reads the frame count off the canvas store, the scenario one counts
the paths already displayed. A request issued to improve a placeholder would
invert the whole point.

`panelLoadingContract.test.ts` pins that structurally: the phase and step
placeholders must carry the same field-row count as their panels, and nothing
may reintroduce a generic `<PanelLoading />`. Change a panel's field count
without touching its placeholder and the suite says so.

## What the six share

Every panel is `PanelHeader` → one scroll region → `PanelFooterHost`, and every
one edits the same way:

- `canEdit` is design mode **and** write capability, never one of them.
- The form's baseline is **frozen at mount** with a `useState` initializer. The
  query keeps tracking the database, and a revert landing mid-edit would
  otherwise let Save write the reverted values straight back.
- The body is keyed by entity id, so switching subjects inside the open drawer
  starts a clean form.
- Save writes only what differs, records one ledger entry **per row that
  moved**, invalidates, and closes. Cancel is close.
- The meta line says only what the canvas cannot. Counts and relationships —
  never a restatement of the title.

**There is no dirty-close confirmation.** Closing a panel with unsaved edits
discards them silently; the only thing guarded is closing mid-save. If that
should change, it changes in the shell, once.

## Where they legitimately differ

| Panel | Difference, and why |
|---|---|
| Service | No breadcrumbs, and a third branch for "resolved, no service row" — without it the panel falls through to the skeleton and animates forever. Two rows, two mutations, two ledger entries, so the summary and the business model revert separately. |
| Phase | Hints lifted verbatim from the column comments, so the panel and the schema cannot drift. |
| Lane | No evidence, resources or dependency tabs: those all key on a **cell**, and a lane has no link to any of them. The only panel with `PanelEmpty` gating and the fan-out alert. |
| Scenario | A paths accordion opening `multiple`, first path open — comparing two routes is the reason to read this panel, and an accordion that closes one to open the next makes that impossible. |
| Step | The one panel whose save invalidates the canvas grid, because `summary` is also the storyboard caption. |
| Cell | Tabs, two surfaces, an expand toggle, agent commands and the in-slices footer. |

### The lane panel's fan-out

A lane row belongs to one path, so the "same" lane exists once per path. Saving
the lane panel writes **all** of its siblings — the save passes
`lane.siblingLaneIds`, not `lane.id`. The panel says so inline, as an `Alert`
above the fields, and that placement is the rule rather than a preference: this
is a consequence the reader would be surprised by, and something that must be
read is always visible. A hover can be missed by never hovering; an ⓘ can be
missed by never clicking.

Scale check from the delete path: a lane delete addressed by (scenario, name)
removes 93 rows where an older impact function reported 11.

## The cell panel

Two **surfaces** — Details and Differences — are siblings of the whole panel,
switched by one component rendered from two call sites (two verbatim copies
drifted apart once already). The Differences tab carries no count: counts live
in exactly two places app-wide, the menubar Diff count and each ledger group's
trailing number.

Inside Details, **Overview is not a tab.** It always renders inline at the top;
the tab row (Dependencies, Evidence, Resources) sits below it and both share one
scroll area. A new cell always opens on Dependencies, reset during render — and
the arrow editor closes with it, because a half-typed arrow carried onto a
different cell points away from somewhere nobody is looking. The tab body
reserves `min-h-56`, which is cheaper and steadier than easing a panel that
otherwise jumped a couple of hundred pixels per switch.

Three rules the overview follows and new fields should too: the title yields to
the touchpoint when they are identical; the description paragraph is suppressed
when it repeats the title or the content; and the touchpoint is a labelled
field, not a second badge. Printing the same word twice as two facts is the
failure each of them prevents.

What answers "what is there to show" is `cellDetailFacts.ts` — one module,
asked once. `useSelectedCell` is the whole of the looking-up: the path's board,
the cell in it, the lane it sits in and the dependencies that reach it,
resolved once per selection rather than re-derived per question. Three readings
hang off that resolution, one per reader — the drawer's position and dependency
endpoints, the overview's placement and featured links, the tab row's
dependencies and lists — and each takes the resolution and nothing else, so a
reading cannot reach past it into the selection and no reader is handed the
whole set. `CellDetailOverview.tsx` renders the
top of Details from its own reading, `CellDetailTabs.tsx` owns the three tabs and
`cellDetailCrumbs.ts` says where the cell sits — as crumbs for the shared
header, not a second trail of its own; the draft, differences
and nothing-selected surfaces are modules of their own
(`CellDetailDraftSurface.tsx`, `CellDetailDifferencesSurface.tsx`,
`CellDetailEmptySurface.tsx`) behind `PanelSurfaceSwitcher.tsx`, and the
panel's agent commands sit in `cellDetailAgentCommands.ts`. What stayed in
`BlueprintCellDetailPanel.tsx` is the drawer: which surface shows, how wide it
is, what closes it, and the one footer every Save portals into.

**Only outgoing arrows are editable here.** An incoming arrow belongs to the
cell at the other end and is edited from there. Candidates are version-scoped,
because the RPC refuses a cross-version dependency and offering one would only
be a way to reach that refusal.

**Creating a cell writes nothing until Save.** The draft branch opens the panel
on an empty slot's target; ✕, Escape and Cancel discard it entirely. A cancelled
cell never existed — which is the fix for creation feeling broken, back when the
row was written first and filled in later.

**A clicked touchpoint brings its own two fields, under the same Save.** The
panel is showing one cell *and* one of its placements, so `CellPanelEditor`
takes the placement as a prop and its summary and
role join the form — enclosed and headed with the touchpoint's name,
because two fields called Summary on one screen need a border to say whose is
whose. They sit directly under Text, which is the list that names them, rather
than at the bottom: an author reached this panel by clicking that touchpoint, and
making them scroll past six of the cell's fields to reach it is how an editor
teaches people it is not for them. One Save, for the same reason there is one
Save at all — the editor this replaced had four buttons for one cell and a Save
that only saved half of what was on screen.

**A name-only placement carries its own way out.** A placement whose
touchpoint the registry lacks — the seven the queue held, or one whose name
left the cell's text while it still carried writing — is drawn dashed on the
board and opens this same panel; its group shows a dashed `RegistryLink` block
under Role with a **Registry** select and "Link to registry", and "Remove from
this cell". Both write at once with an inverse in the ledger, and neither is a
field of the placement, so neither waits for Save. Nothing here matches the
name to the entry it resembles: the choice is the author's.

**The resource list is one component with two owners.**
`ResourcesList` is the list itself; `PlacementResourcesList` and the Resources
tab's editor are the two owners that hand it rows and a pair of writes, and
nothing else about them differs. It draws the preview and the buttons its owner
leads with on top, each with an unset control — and no drag handle, because
there is at most one preview and the buttons follow the main list's order, so
that block has no order of its own. Under it sits every resource in order, each
row carrying a drag handle (`Reorder` from `framer-motion`, with the arrow keys
on that same handle because the drag is pointer-only) and a row menu that sets
a preview (an attachment), a button (a link) or unsets one, renames the row in
place, or drops it. A paste field adds a link named by its host and an upload
puts a file in the `cell-attachments` bucket before it becomes an attachment row
carrying the object's public URL — "Replace…" on the preview uploads the same
way and swaps that row's file. **Nobody is ever required to type a
name**: a link arrives as its host and a file as its own filename, and the
rename is a second, optional act. The upload is on screen the whole way — the
row present and dimmed while the bucket is written, and a `Retry` in its place
if the write is refused. The URL names the cell's id and a minted one, so
renaming the placement or the cell moves nothing; a cell owns a preview and
buttons the way a placement does, because the partial unique index already
indexes a cell-owned preview and `set_featured_resource` scopes its clear to
the placement-less owner. The list saves on its own button because a reorder
is a whole-list fact written in one transaction, and featuring is one row's
flag the database settles at once — clearing the previous preview in the same
transaction — so folding either into the four-field Save would make that
button write things it cannot show as unsaved.

Two orderings inside that Save are load-bearing. The placement is written
**after** the cell, because saving the cell's text runs
`sync_cell_touchpoints`, and a save that removed this touchpoint's name from
the text deletes its placement along with everything written about it. And the
write is **skipped** when the name is gone, rather than left to fail on zero
rows: the author asked for exactly that, and reporting it as an error about a
missing placement would be the editor blaming them for it.

The placement editor only ever **updates**, and never inserts. Which cells may
hold a placement is decided in one place — `sync_cell_touchpoints`, which
admits only touchpoint-bearing cells — and an editor that could create one
would be a second answer to that question. `placementGateContract.test.ts`
holds it; the grants hold the other half, since `cell_id` and `touchpoint_id`
are not updatable by a client. A fallback board's placements carry no row id,
so the fields do not appear there at all: there would be nothing to save into.

## A definition hangs off a badge, never off a label

`PanelTermLabel` began as the answer to a dozen section headings that named a
concept and said nothing about it. It over-corrected: eleven labels ended up
carrying a definition, and nine of them — `Status`, `Summary`, `Position`,
`Paths`, `Dependencies`, `Resources` — were ordinary English on a form. A
definition on every label teaches a reader that hovering is not worth doing
about eleven times before it teaches anything, and the words that genuinely
needed explaining were what got lost in it.

The definitions were narrowed to two words a reader could not guess — a
STORYBOARD is not a story, a TOUCHPOINT is not a point — and rendered each as an
outline badge. **That was reopened for exactly these two.** Stacked among a
cell's value badges, the caption read as a mystery tag rather than a field
label, so both became plain `Field` labels beside Summary, Status and Owner, and
`PanelTermLabel` was retired. The definition did not vanish: it moved onto the
label's own hint popover — the touch/press affordance every other field label
already uses. `src/lib/panelTerms.ts` still holds the two entries, now as that
hint text.

**Two shapes now, and which one a word gets is decided by the word.** A word a
reader could not guess is a `Field` label carrying its definition as a hint;
`PanelSectionLabel` is plain text with nothing behind it, deliberately inert.

The rule stays checkable rather than tasteful. "Is this word jargon" is a
judgement that drifts on the next term somebody adds;
`scripts/tests/a-definition-hangs-off-a-badge.test.mjs` asks what a definition
is attached to, which does not. Its subject is the raw `DefinitionPopover`, and
it exempts nothing by name: a component that composes caller-supplied children
is a container — it explains whatever it is handed rather than a word it knows —
and both `EntityDefinitionPopover` and `Field` reach that exemption by the same
sentence.

**`Field`'s `hint` is exempt, and these two lean on that exemption on purpose.**
Most hints tell an author what to type — "an app image path starting with / or
an https link" — a fact about the input, not about a word, which is why the
check does not govern them. The two made-up words ride the same shape: the
check sees a field explaining its own input, not a definition pinned to ordinary
form English, so a definition may hang off these two labels where it may not off
`Status` or `Summary`.

**One card everywhere.** `Field`'s `hint`, `PanelKindBadge`'s description,
`StatusBadge`, `EntityDefinitionPopover` and the divider rail labels all render
`DefinitionCard`: sections, each a term above its body, identically set. One
definition card, wherever a definition is shown.

**The term is sentence case, and it is not an `Eyebrow`.** An eyebrow labels a
region of chrome — a menu group, a comparison column — where the label is
furniture and the content beside it is the subject. In a definition card the
word IS the subject: the reader hovered a badge reading `Frontstage` and came
for an answer about that word. Caps and letterspacing there printed a third
spelling of a term the badge, the panel and the board all write in sentence
case. Weight, not ink, separates the term from its sentence — a muted term
would sit quieter than the prose defining it. The section eyebrows elsewhere —
the sidebar, the path selector, the compare columns, the annotation bar — are
labels on regions, which is what `Eyebrow` is for; they are sentence case too,
under the rule in [overview](overview.md#small-labels-are-sentence-case).

## A definition never repeats its term

The card prints the term already. A body that opens `Storyboard — the frames
for each step` says the word twice at two sizes in one popover, and the reader
spends the first three words of every definition confirming what they just
hovered rather than learning anything. The same goes for `This is…`, `These
are…` and `The storyboard is…`: all three are a run-up to a sentence that
could have started at the sentence.

So a definition body starts with its meaning. `Storyboard` above, `The frames
for each step, not text.` below. A module that holds definitions holds the
label and the body as two fields — never one string a reader splits on an em
dash, which makes the badge's word a parsing result and renames it the day
somebody writes a dash into a sentence.

`src/lib/definitionsSayItOnce.test.ts` holds every module that feeds a
definition — lane roles, entity status, panel terms, entity kinds, touchpoint
roles, stakeholder kinds, the divider meanings and the cover's definition
tables — and fails when a body opens with its own label, with `<label> —` or
`<label>:`, with `This is` or `These are`, or with `The <label> is/are`. A new
definition module joins that roster the day it is written; a module that is not
in it is a module where this rule is a hope.

`PanelTextareaField` is a bare `<textarea>` with the cell panel's treatment,
deliberately not `input-group` (which the inventory reserves for the composer).
Read-only renders **prose, not a disabled input** — a disabled textarea reads as
a broken input. Its ring is `ring-inset`, and that is load-bearing: the field
lives inside an accordion panel whose `overflow-hidden` drives the height
animation, and an outset ring gets sheared by the clip.

## Getting in

`EntityPropertiesButton` is one ⓘ for every level. On a lane it is revealed on
hover — a lane label already means two different things depending on where it is
drawn — but **revealed is not absent**: it is transparent at rest and always in
the tab order. It stops propagation, because opening a panel is not a selection,
not a navigation and not a pan.

The header affordances carry a two-flag invariant worth stating plainly:
interactivity is the provider's flag **and** the board being in scope. With the
provider flag alone, 176 lane headers and 125 step headers across every mounted
board wear hover, a focus ring and a pointer. Where a header is not interactive
it renders as inert prose, not a disabled button.

## Invariants a well-meaning edit breaks

1. Renaming `data-cell-detail-panel` — twenty external selectors.
2. Giving two panels the same footer id.
3. Rendering the shell unconditionally instead of returning `null` when closed —
   breaks `@starting-style` entry and strands an invisible drawer.
4. Trusting `onOpenChangeComplete(false)` alone.
5. Keying the canvas top-offset on `open` rather than `open || closing` — the
   panel teleports up before sliding out.
6. OR-ing a second boolean into the cell drawer's `open`. `panelState` is the
   single owner of "is it open", full stop.
7. Dropping the posture key on the drawer.
8. Re-deriving a form from the live query instead of the frozen baseline.
9. Renaming `data-panel-editor` to something cell-specific.
10. Changing a panel's field count without its placeholder.
11. An outset focus ring inside the scenario accordion or the lane rail.
12. Setting the kind badge's colour with a raw value or a utility class. The badge
    this replaced tried `backgroundColor: style.lane`, and `style.lane` is a
    role key — the declaration was invalid, the browser dropped it, and the
    badge rendered as plain text from the day it shipped.
13. Adding `PanelEmpty` to edit mode.
14. Saving the lane panel against `lane.id`, or dropping the fan-out alert.
15. Dropping the canvas invalidation from the step save.
16. A second ⓘ beside a term label, a tab or a status badge.
17. Dropping `actions` from a panel that has an action row, or passing crumbs
    that all resolve empty. The row follows a passed `null` and not a prop
    nobody passed, because the widen toggle is desktop-only; and a trail with
    nothing left in it draws no landmark, because a landmark that tells the
    reader nothing is worse than no landmark.

> `NotionPropertyRow`'s docstring says it belongs to the cell detail panel. It
> does not — its only consumer is `ScenarioSlideHeader`. The docstring is stale;
> the component is a plain label/value row.
