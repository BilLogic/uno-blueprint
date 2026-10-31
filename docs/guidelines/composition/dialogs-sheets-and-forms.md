---
summary: The drawer/sheet posture contract (single owner), the create and delete dialogs, the slice sheet, the session-changes sheet, the shared image viewer, and the field primitives that keep a vocabulary from becoming free text.
claims:
  - src/components/blueprint/OptionSelect.tsx
  - src/components/blueprint/OwnerTagSelect.tsx
  - src/components/blueprint/PathMultiSelect.tsx
  - src/components/blueprint/RoleSelect.tsx
  - src/components/blueprint/StakeholderBadge.tsx
  - src/components/blueprint/StakeholderSelect.tsx
  - src/components/blueprint/StatusBadge.tsx
  - src/components/blueprint/StatusSelect.tsx
  - src/components/blueprint/statusOptions.ts
  - src/components/blueprint/WalkthroughPathSelect.tsx
  - src/components/blueprint/ZoomableImage.tsx
  - src/components/editor/CreateBlueprintDialog.tsx
  - src/components/editor/CreatePhaseDialog.tsx
  - src/components/editor/CreateSliceSheet.tsx
  - src/components/editor/CreateVersionDialog.tsx
  - src/components/editor/DeleteStructureDialog.tsx
  - src/components/editor/SlideRemovalDialog.tsx
  - src/components/editor/SessionChangesSheet.tsx
  - src/components/editor/WriteFailureNotices.tsx
---

# Dialogs, sheets and forms

## Drawer and sheet postures — owned here

One component, two postures, keyed remount on the flip. The mechanism lives in
the shared shell `src/components/blueprint/panelShell.tsx`; the cell detail
panel is its most-read consumer, not its home. **This document is the single
owner of the contract** — it belongs here rather than with the primitives,
because a posture is a composition rule wearing a components label:

- **Desktop ≥ breakpoint**: a right-pinned floating *card* (not a full sheet) at
  `--width-cell-panel`, expanding to `--width-cell-panel-expanded`;
  `modal={false}` so the canvas stays live; swipe direction `right`. Its motion
  is an inspector's — it expands out of the selection, it does not arrive from
  off-screen (see the block comment in `animations.css`).
- **Mobile < breakpoint**: a bottom sheet, full width, swipe `down`, view-only
  content, with a grab handle — a bottom sheet says how to dismiss itself; the
  desktop inspector has its ✕. It rests on **two snap points, `40svh` and
  `70svh`**, opens on the lower one, and remembers which for the session. It
  sets no height of its own: `!h-auto` is `height: auto !important` and beats
  the `--drawer-content-height: 100dvh` that snap points need.
- The drawer is **keyed on posture** (`key={mobile ? 'mobile' : 'desktop'}`) so
  a resize across the breakpoint remounts clean instead of reinterpreting an
  in-flight swipe against the wrong axis.
- The posture is published as `data-cell-detail-posture`, which is what the
  motion keys off.
- Surface switches inside an open drawer are content swaps at the same tree
  position — never close-reopen.
- **Snap points reach base-ui through `...props`, not through the wrapper.**
  `src/components/ui/drawer.tsx` destructures `snapPoints` alone; `snapPoint`
  and `onSnapPointChange` arrive via `...props`, which is how `PanelDrawerShell`
  passes them.
- **THE PRIMITIVE CAPS THE SHEET AND OUR CLASSES CANNOT LIFT IT.** On the y axis
  the vendored popup carries
  `--drawer-content-max-height: calc(100dvh - 6rem)`, so the element is 96px
  shorter than the viewport no matter what the consumer sets. A snap point of
  `1` therefore asks for a height that cannot render: the drag travels the whole
  way and the sheet stops 96px short. Measured at 812px: 716. Stops must sit
  under that ceiling — `src/lib/panelSheetSnap.ts` holds them and
  `src/lib/panelSheetSnapContract.test.ts` asserts the headroom.
- **No full stop, for a second and independent reason.** `MobileAgentSheet`
  records "92svh read as a full-screen takeover", and the mobile shell's model
  is a live canvas under non-modal sheets. A sheet that covers the board stops
  being an inspector.

The agent dock's docked/floating pair is the same one-component-two-postures
precedent — see [agent-session.md](agent-session.md).

## Which channel says a failure

There are two, and the rule is about **whether the control is still on screen**:

- A path that still has its form or dialog up reports **inline**, in an `Alert`
  next to the control that caused it. Every create dialog does this.
- A path whose control is already gone reports through `reportWriteFailure` into
  `WriteFailureNotices` — a cell delete closes its own menu on success, and ⌘Z
  has no control at all. Both used to reach the console and stop there, which
  reads exactly like success: the spinner clears, the cell is still there, and
  nothing is said.

`WriteFailureNotices` is mounted **outside** the editor's
`EditorErrorBoundary` in `App.tsx`, deliberately: a write can fail as the shell
falls over, and the notice is what says so. It sits above the bottom-centre canvas toolbar and is dismissed by
hand rather than timed out — a write that silently failed is not a thing to take
away while the user is still looking for what happened — and
the alert's assertive announcement corrects a belief the user already holds. Success uses the same Alert surface with a polite status announcement, and its message, Undo and Dismiss share one flex row so the actions remain inside it. Only the latest success offers Undo; older changes remain in the session, and failed-write notices remain visible. At most three notices stack; a report that grows
without limit buries the canvas under the report of its own trouble.

The shared notice layer sits above non-modal panel drawers. In a narrow canvas
the centred notice can overlap the panel footer; its Undo and Dismiss controls
must remain clickable while the panel stays open.

## The create dialogs

Each asks for the decisions that cannot be made later, and no more.

**`CreatePhaseDialog`** appends a phase and asks only for a name. **No position
picker**: a phase is a column of the whole canvas, so inserting one mid-sequence
re-lays-out every scenario to its right — that is a reorder, with its own
consequences. Appending is always safe. It does not ask for a summary either;
demanding one up front is how placeholder text ends up in a blueprint.

**`CreateBlueprintDialog`** creates a scenario: where it lives, what it is
called, which lanes it starts with, how many columns. Columns are created empty
and named `Step 1…n` — naming them here would be five text fields answering a
question nobody can answer before they have seen the grid. **The lane set is the
decision worth making up front**, because lanes are what a scenario is compared
along, and lane sources are read from existing scenarios rather than typed: the
whole point of copying is to land on the vocabulary that already exists. When
the dialog is opened from a phase row the phase becomes a label, not a picker —
asking again invites answering differently from the row that was clicked.

**`CreateVersionDialog`** covers blank and copy in one dialog, because the
choice between them is the same decision and splitting it into "New" and
"Duplicate" makes people pick before they know. Its outcome sentence is not
decoration: copying arrows is the part people get wrong, and "with the arrows
repointed onto the copies" is the only way to say the copy will not draw lines
back into the original.

Shared idioms worth copying: clear the error on close; gate on busy and ready;
validate through a `lib/*Validation` module that returns a `problems` list; and
call `invalidateStructure()` after every structural create, because cascades
cannot be mirrored client-side.

## `DeleteStructureDialog` — confirm by naming what is destroyed

**This is the only confirmation UI for deleting anything structural, slices
included.** A second, lighter dialog for one kind is how a product teaches that
some deletes are casual, and none of these are.

The impact is **read before the dialog can be confirmed, never estimated in the
client**. A step delete cascades to every cell in that step across every path,
and then to the arrows on both ends of each; a dialog that counted what it could
see would undercount by design. Nothing may be confirmed before that read
lands — the numbers are the whole reason to ask.

What it shows comes from one `ImpactSummary`:

- **facts** — count-plus-noun tiles, set apart from prose. The number *is* the
  consequence; buried mid-sentence it reads as decoration, which is how a
  confirm dialog ends up being clicked through.
- **warnings** and **reassurances** — relayed **verbatim**. Every sentence is
  composed in `src/lib/deletionSafety.ts`; the dialog re-words nothing.
  Rewording them is how the "nothing is destroyed" over-promise returns on a
  second surface.

That over-promise is worth understanding before touching this copy. "Nothing is
destroyed without a copy behind it" printed directly under "these slices cannot
be restored by undo" is a dialog contradicting itself in adjacent lines, and the
sentence people believe is the reassuring one. So the reassurance is
**qualified, not merely softened**, when unrecoverable slice frames are in
scope: the blueprint rows come back, the frames pointing at them do not. Note
also that *no* recovery keys at all counts as unrecoverable, not as nothing to
worry about — which is exactly what a plain `.some()` on an empty array gets
wrong.

Typing the name is the gate, matched exact-after-trim and **case-sensitively**:
a case-insensitive match would let `happy path` delete `Happy Path`, which is
most of the way to not asking. Two error kinds get two recoveries — a failed
*read* replaces Delete with `Try again` (a disabled Delete there is a dead end,
and the failure was the read), a failed *write* keeps the gate open. And session
state resets **in render**, because opening the dialog on a second target must
not paint one frame carrying the first target's counts.

Slices are the asymmetry: they have no archive, the copy says so, and a slice
must never become a structural deletion kind. The impact read itself
(`readDeletionImpact`) is shared with the agent's `measure_deletion_impact`, so
the numbers the agent quotes and the numbers the dialog shows cannot drift.
Where no archive exists the delete affordance is **hidden, not disabled** — a
disabled delete invites someone to go looking for how to enable it, and there is
no safe way to.

## `SessionChangesSheet` — review, then commit

What has changed since Edit was turned on, and the way to keep it. It appears
only once something has changed: a permanent Save on a canvas that has already
saved everything is a control that lies at rest.

**It replaces undo and redo rather than joining them. Undo is positional; this
is addressable.** Having added a step, a lane and a cell, wanting the lane back
should not mean undoing two things you meant to keep.

- **Save is not a write.** Those writes already landed; Save is the moment the
  way back closes. The header says "Already saved — Save just clears the list."
  A session containing deletes arms a confirm first.
- **One control, not two.** The flag counter and the Save button used to sit
  side by side — the same fact wearing two faces. `Save changes` *is* the
  trigger that opens the list, so **saving requires seeing what is being kept**.
- **Per-row revert**, plus a crosshair that flies to the cell. Agent-authored
  rows carry ✦ and nothing else differs — same revert, same Save gate; the badge
  is the entire distinction.
- **Revert all** runs sequentially, newest first, through the same inverse the
  row and ⌘Z use — these inverses are ordered, so a cell added into a lane added
  in the same session has to go first. Entries with no captured inverse (a slice
  delete has no archive) are **not reverted and not dropped**: they stay in the
  list and are named underneath it, with the reason travelling along, because
  "had no inverse" and "had one and it threw" are different facts about what to
  do next.
- The list is re-read from the store on every iteration rather than captured
  once. Reverting two edits to one cell from a stale snapshot writes an
  intermediate value nobody chose, with an empty ledger and no way back.

Three triggers can start a revert — the row button, Revert all, and ⌘Z — and
they share **one** in-flight gate. They did not always: the per-entry set could
not answer "is anything reverting?", so ⌘Z was right by accident while the row
button asked only its own local flag and walked straight through the middle of a
run. Related: `'already-in-flight'` is not success — the entry was neither
reverted nor removed, and a caller reading it as done leaves the user believing
a change was taken back that is still there.

⌘Z is scoped away from text fields (inside an input, the browser's own undo is
the one people mean) and skips entries with no inverse rather than silently
doing nothing forever.

## `CreateSliceSheet`

A sheet hanging off its button, **not a modal**. The picked cells are the
subject, and a scrim dims the one thing you need to look at while deciding
whether the selection is right — so the canvas stays lit and the sheet sits
beside it. **Closing it does not clear the picks; the selection outlives the
sheet.**

Two steps, because they are two different jobs: shaping the screens is done
against the canvas, naming is done afterwards, once you know what you have made.
Asking for a title first asks for it at the moment you are least able to give
it. There is no type picker and no quick-group preset — the type is read off the
selection, and grouping is a drag.

A live selection change **merges** into the composed screens rather than
reseeding them. Reseeding on any change used to throw away minutes of
drag-composed grouping for one stray pick.

## `ZoomableImage` — the image viewer, owned here

One component for every image in the app worth looking at closely. An adopter
renders it in place of a bare image and gets the trigger, the popup and the
whole gesture set. The adopters are the cover figure, the cover section's
`framed` illustration, the featured attachment preview, a cell's frame
screenshots, and the storyboard detail stack in the side panel.

**Some pictures deliberately do not open, and each has a reason.** Touchpoint
logos are iconography rather than content: there is nothing inside a brand mark
to read closer, and opening one fullscreen teaches the reader that the
affordance is decorative. A cover section's `badge` logomark is the same
argument on the same grounds. Storyboard frames drawn inside a canvas cell keep
selecting that cell, because the board already binds click, drag, marquee, pan
and context menu to that surface. And any frame drawn inside a **deck** is left
alone — the slice presentation's stage media, and the storyboard detail stack in
its `horizontal` orientation, which is only ever rendered inside
`StoryboardWalkthroughModal`. A deck binds the arrow keys and Escape on the
window, and a viewer inside it would want all three for itself, so one press
would drive both. Every excluded picture is reachable in adopted form
somewhere else, so nothing becomes unviewable.

**Siblings are passed in, never discovered.** An adopter renders one
`ZoomableImage` per member of the group and hands each of them the same ordered
array plus its own index. A DOM scan of the container was rejected: the order
carries meaning — a step panel's frames are ordered by lane, so stepping is "the
same moment, the next actor" — and a scan would preserve that only until a
wrapper element or a CSS reorder quietly broke it. Past two members the viewer
draws a counter and two step buttons; the arrow keys and a horizontal swipe step
as well. **Stepping returns to fit**, so every sibling opens the same way and
nobody is handed the next picture already scrolled into a corner of the last
one; it takes the hook's `reset` rather than its `measure`, because two frames
of one step are usually the same size and a measurement-driven refit would do
nothing exactly when it is needed. Stepping **wraps** at both ends, the same
rule the zoom follows at its ceiling: no control in this viewer is a dead end.

**The swipe is gated on `canPanImage`, and that is the scale test, not an
approximation of one.** Pan limits are zero on both axes precisely when the
image overflows neither, which is true at or below fit and false above it — so
"there is no pan to steal here" and "this is fit" are one sentence. Above fit
the same sideways press is the pan.

**On touch the gesture set is pinch, drag and swipe — and not tap.** Every
fullscreen image on a phone has taught the reader that a tap dismisses, and a
viewer that zoomed instead would spend that habit on the one gesture it cannot
afford to surprise anyone with; the tap is left meaning nothing rather than made
to mean two things. The input class is read off `pointerType` at the press, not
off a media query, so a tablet with a mouse keeps click-to-zoom. Adding the
two-finger pinch is also what finally made Safari's `gesture*` events need
`shouldApplyGestureZoom`: on iOS one pinch is both mechanisms at once, and
applying both would square every step. That is the same gate, and the same
reason, the canvas found.

**Once open, the image is operated rather than dismissed.** The wheel and a
trackpad pinch zoom toward the pointer, continuously and free of any stop; a
drag pans once past fit; and **a click toggles between two stops and nothing
in between** — fit, and `max(natural size, twice fit)`. A click from anywhere
that is not fit returns to fit, so no gesture is a dead end.

The stop above fit is stated that way because natural size is the meaningful
place to stop — it is the scale a screenshot's text was captured at — while
fit is whatever the viewport makes it, and on a wide display the two cross:
880px of artwork fits at 2.18 there, and a stop fixed at natural size would
sit below the scale the viewer opened at. Taking whichever is higher keeps the
meaning where it can be had and keeps the gesture visible everywhere else.
Three stops is what this replaced, and the pairing of a relative first stop
with an absolute second one produced three separate defects before it was
removed; a free gesture is still guarded at three times natural size, but that
guard is not where a click goes. The cursor is the viewer's running
explanation of which gesture is next — zoom-in at fit, grab and grabbing while
panning, zoom-out at the stop and above it — and it is derived by asking the
click where it would go rather than by restating the rule, which is how one of
those three defects got in.

**Names come from the site that renders the picture.** A lane name, a resource
name, an illustration's own alt text — every adopter had one to hand except a
cell's frame screenshots, which take **the cell's own content sentence**. That
is what the frame depicts, and it is already in scope where they render. A
caption field on the record was considered and rejected: a schema change in
service of a label.

**Three exits, and the image is not one of them.** A click on the surrounding
margin closes, Escape closes, and a corner button closes; the button sits
outside the box that clips the image, so it is reachable at every scale, which
is exactly when a reader is most likely to want it. A click on the image zooms,
because the image is the subject now. This reverses the cover figure's earlier
contract, where the opened figure was inert and every click closed the popup —
see `cover-page.md` for why that stopped being right.

**The wheel is bound to the popup, not the image**, so a pointer that has
drifted into the empty margin still zooms; a gesture that dies over part of the
surface reads as broken. The popup is `modal`, which both inerts and
scroll-locks the page behind it for as long as the viewer is open.

**Motion splits by input class.** Discrete steps — the click-zoom and the snap
back to fit — tween over `--motion-micro`. Continuous gestures do not,
because a tween on a gesture the hand is still making reads as lag. Reduced
motion drops the tween in both cases. No duration was minted for any of this.

**Click versus drag is a distance, not a timer**: a press that stayed within
four pixels of where it went down is a click, so a shaky press still zooms. A
timer punishes a slow deliberate click and forces a fake clock into every test.

Every decision about scale and offset is arithmetic in `src/lib/imageZoomReducer.ts`
and is tested without a DOM; `useImageZoom` measures two boxes, turns events
into anchors, and writes the answer onto the element. The board's own camera is
deliberately not reused — it is wired to artboards, focus cells, an annotation
layer and a semantic-zoom threshold, none of which an image has — but the two
hard cross-platform parts underneath it are, so the surfaces cannot disagree
about what a wheel notch is worth.

One implementation note that will look like a mistake and is not: the opened
image is sized by an **inline pixel width and height** read from `naturalWidth`,
not by a utility class. Cover SVGs are authored with a `viewBox` and no root
`width`/`height`, so intrinsic-size detection reports the UA default inside the
popup and CSS `auto` follows *that*, not the HTML attributes. Stating the
authored size is the one deterministic route, and it is also what the transform
scales against.

## Field primitives

**`OwnerTagSelect` is the pattern.** Owner as a tag, not free text — free text
is how a blueprint ends up with `Blueprint Owner`, `BlueprintOwner` and
`blueprint owner` as three different people. The anatomy is worth copying wholesale: trigger showing value
or placeholder → autofocused "Find or create…" filter → matching rows with a
check on the current value → an explicit `Create "x"` row (one visible row, not
a silent save) → a Clear row when a value is set. Enter picks the exact match or
creates; never a silent no-op.

Its rename is the interesting part: the pencil renames a tag **everywhere it is
used**, owner and perceived owner both, because a tag is one fact about the
organisation rather than a per-cell string. It refuses renaming *onto* an
existing tag — that would silently merge two vocabularies, and the recorded
revert would then rename every cell of the target tag back, corrupting cells
that were never touched.

The relatives differ on purpose:

| Primitive | Shape | Why not `OwnerTagSelect` |
|---|---|---|
| `StakeholderSelect` | same geometry, **read-only over the registry** | creating or renaming a stakeholder is an agent tool with a ledger entry, not something to do by typing into a lane. "Nobody" is a first-class choice, not an empty state. |
| `StakeholderBadge` | not a picker — the **owner badge**, one line of `PanelKindBadge` | it is the value, not the control. `StakeholderSelect` renders it wherever the field is read-only, and it carries `stakeholders.summary` on its hover so the registry's definition of that party has somewhere to arrive. Where the field IS editable there is no badge to hover, so the same sentence is printed under the picker instead — the two never appear together, which is what keeps it from being two mechanisms for one fact. |
| `OptionSelect` | a Base UI `Select` over a **fixed vocabulary**, wearing `PANEL_SELECT_TRIGGER_CLASS` — the one trigger `OwnerTagSelect` wears too | no filter and no create row: the options *are* the constraint. Keyboard, touch and typeahead come from the primitive. An option is two nodes — the name, and beneath it in caption grey what the name means — so the meaning is quoted from the module that owns it rather than authored a second time into the label. The trigger is column-width and names its value, and the row does not re-size under the pointer that just changed it. Three selects in one column read as one design because they share one class, in one place. |
| `StatusSelect` | `OptionSelect` over the six statuses, from `statusOptions.ts` | six fixed options, no search, no multi-select. Each option is the status name over the line `ENTITY_STATUS_MEANING` already gives the badge's hover, so the dropdown and the badge explain a status in the same sentence; the definitions sweep reads that exported option list, not a rebuild of it. |
| `RoleSelect` | `OptionSelect`, three options for a two-value column | the column is nullable and the null is the common case, so the control has one more option than the constraint has values. Unmarked is FIRST and is a real choice, not an unselectable prompt: a placement that nobody has judged is not a placement missing a value, and an author who marks one by mistake has to be able to get back. Its label says "nobody has judged this" so choosing it is not choosing a third degree of importance. |
| `PathMultiSelect` | a multi-select **filter**, five layouts | not a picker at all. Its `id` is a filter key (`type:name`), never a uuid — anything that writes to a path row wants `pathIds`. |
| `WalkthroughPathSelect` | a radio menu | degenerates to a static badge when there is one path. Shares its label formatter with `PathMultiSelect`. |

**`StatusBadge`** renders **every** status, `live` included. It was hidden at
first on the argument that the default covers most of the board — but that only
holds in a dense list; in a properties block, a labelled field with no value
reads as broken. Three treatments: `live` quiet and solid; the unbuilt three
muted and **dashed**, echoing the dashed border those cells already carry on the
canvas, so there is one vocabulary for "this does not exist yet" in the panel
and on the board; `at_risk` and `deprecated` in warning tint, the one case worth
a colour. The definition hovers off the word itself — no ⓘ.

The vocabulary is `src/lib/entityStatus.ts`, and its history is the argument
against inventing a second one. It began as two values on cells, `planned` and
`prototype`, and the boundary did not order: the one case labelled `planned` was
a card already merged and sitting in QA. It was renamed off `maturity` to `status` because
that word promised a ladder — three rungs below shipped, two qualifying it, and
shipped itself unrepresented, so `deprecated` was not "further along" than
`at_risk`. `live` removes the double duty NULL was doing across 879 cells: "how
it works today" and "nobody has assessed this" at once. Paths share the
vocabulary deliberately; a second vocabulary for the same question drifts from
the first within a month.
