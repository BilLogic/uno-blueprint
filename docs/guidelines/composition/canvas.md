---
summary: The board and the chrome around it — click grammar, canvas modes, panel-as-selection, the motion vocabulary, camera behaviour, the phase-row height contract and the touch contract.
claims:
  - src/components/blueprint/BlueprintArrowMarkerDefs.tsx
  - src/components/blueprint/BlueprintCellButton.tsx
  - src/components/blueprint/BlueprintColumnHandles.tsx
  - src/components/blueprint/BlueprintDependencyArrows.tsx
  - src/components/blueprint/BlueprintDividerBadge.tsx
  - src/components/blueprint/BlueprintEmptyCellSlot.tsx
  - src/components/blueprint/BlueprintLabelRail.tsx
  - src/components/blueprint/BlueprintLaneHandles.tsx
  - src/components/blueprint/BlueprintPathBand.tsx
  - src/components/blueprint/BlueprintStepStoryboard.tsx
  - src/components/blueprint/BlueprintStoryboardPlayButton.tsx
  - src/components/blueprint/BlueprintTouchpointCell.tsx
  - src/components/blueprint/EntityDefinitionPopover.tsx
  - src/components/blueprint/EntityHeader.tsx
  - src/components/blueprint/IntegratedDependencyArrows.tsx
  - src/components/blueprint/LaneCollapseToggle.tsx
  - src/components/blueprint/PathKindBadge.tsx
  - src/components/blueprint/PathKindColorKey.tsx
  - src/components/blueprint/PathLabelBadge.tsx
  - src/components/blueprint/PathSummaryTooltip.tsx
  - src/components/blueprint/PhaseScenarioOverview.tsx
  - src/components/blueprint/ScenarioBlueprintPanel.tsx
  - src/components/blueprint/ScenarioTitleDefinition.tsx
  - src/components/blueprint/ScenarioTitleBadge.tsx
  - src/components/blueprint/StoryboardStepDetailStack.tsx
  - src/components/blueprint/StoryboardWalkthroughModal.tsx
  - src/components/blueprint/StoryboardWalkthroughShell.tsx
  - src/components/blueprint/TouchpointCellFace.tsx
  - src/components/editor/AnnotationCaptureMenu.tsx
  - src/components/editor/BoardAddressSync.tsx
  - src/components/editor/CanvasAnnotationLayer.tsx
  - src/components/editor/AnnotationStyleBar.tsx
  - src/components/editor/CanvasAnnotationBarChrome.tsx
  - src/components/editor/CanvasAnnotationResizeHandles.tsx
  - src/components/editor/CanvasAnnotationSwatches.tsx
  - src/components/editor/canvasAnnotationChromeStyles.ts
  - src/components/editor/canvasAnnotationGeometry.ts
  - src/components/editor/canvasAnnotationKinds.ts
  - src/components/editor/canvasAnnotationNodeProps.ts
  - src/components/editor/AnnotationMarkNode.tsx
  - src/components/editor/CanvasAnnotationToolbar.tsx
  - src/components/editor/CanvasCellContextMenu.tsx
  - src/components/editor/CanvasDesignTools.tsx
  - src/components/editor/CanvasEmptyState.tsx
  - src/components/editor/CanvasLoadProgress.tsx
  - src/components/editor/CanvasModeProvider.tsx
  - src/components/editor/CanvasPenCursor.tsx
  - src/components/editor/CanvasPhaseSection.tsx
  - src/components/editor/CanvasSelectionProvider.tsx
  - src/components/editor/EditorChrome.tsx
  - src/components/editor/EditorLoadingSkeletons.tsx
  - src/components/editor/EditorSequenceNav.tsx
  - src/components/editor/EditorShell.tsx
  - src/components/editor/EditorZoomIndicator.tsx
  - src/components/editor/IconTooltip.tsx
  - src/components/editor/MarqueeSelection.tsx
  - src/components/editor/OverviewPhaseRowDivider.tsx
  - src/components/editor/PathSelectorMenu.tsx
  - src/components/editor/PhaseMenubarHeader.tsx
  - src/components/editor/PhaseOverviewPhaseLoopArrow.tsx
  - src/components/editor/PhaseSectionFlowArrow.tsx
  - src/components/editor/ScenarioMenubarBreadcrumb.tsx
  - src/components/editor/ScenarioPathSelectionReset.tsx
  - src/components/editor/SegmentedControl.tsx
  - src/components/editor/ServiceOverviewHeader.tsx
  - src/components/editor/ServiceOverviewView.tsx
  - src/components/editor/TabStrip.tsx
  - src/components/editor/JumpToSearch.tsx
  - src/components/editor/ThemeToggle.tsx
  - src/components/editor/ToolFamilyMenu.tsx
  - src/components/editor/WorkspaceServiceSwitcher.tsx
  - src/components/editor/ZoomPanViewport.tsx
  - src/components/editor/canvasPhaseSectionLayout.ts
  - src/components/editor/menubarHeaderLayout.ts
---

# Canvas

The board, the viewport it lives in, and the desktop chrome wrapped around
both. This doc answers "what does this gesture MEAN and why", for every surface
that renders a blueprint. What a *phone* does with the same canvas is
[mobile-shell.md](mobile-shell.md).

The top nav's tab strip opens with the workspace, which is a **permanent tab**
rather than a heading — `WorkspaceServiceSwitcher`, the same chrome as a slice
tab and no close button. The workspace's state badges (`WorkspaceBadges`:
sample data, authoring, edit preview, the simulated tier) sit immediately after
it, inside the tablist. Each of them qualifies the name to its left, so they
belong beside it; they spent a while at the far end of the strip under
`ml-auto`, which put every open tab between a state and its subject. They are
`Badge` on the shared variants rather than hand-rolled spans, so the resting
indicator carries the control edge instead of computing to `border-width: 0` —
and in light mode that edge is the only thing separating it from the nav, which
resolves to the same colour.

The top nav's right cluster includes **Jump to…** (`JumpToSearch`): a labelled
field with a ⌘K hint at desktop widths, collapsing to an icon below `md`. It
opens a command dialog grouped as Scenarios, Cells and Actions. Selecting a
scenario goes through the editor's `openScenario` seam with `closeNav`, so the
phone's drawer shuts behind the move; selecting a cell opens that cell's panel
after the same seam.

The dialog follows Supabase's command menu — the structure is stated in
`ui/command.tsx`'s divergence header. Three behaviours are worth knowing:
the Cells group is empty until the reader has typed, because those rows are a
query per scenario and an unopened palette should cost nothing; Escape empties
the field before it closes the dialog; and ⌘K is ignored while a text field has
focus, so the chord never eats a character.

## The click grammar

One grammar for cells, everywhere (the authoritative comment lives in
`BlueprintCellButton.tsx`):

- **⌘/Ctrl-click opens the cell detail panel.** Always, on every surface.
  Right-click → "View cell detail" is the discoverable route to the same
  place.
- **A bare click picks, when a picker is armed** (slice membership, compare
  selection). No picker armed → a bare click opens the panel — or closes it,
  when the panel already shows that exact cell (click-in, click-out).
- **Double-click deliberately does nothing.** In a toggle grammar, click-in
  click-out _is_ a fast double-click — indistinguishable by construction —
  and every attempt to give the pair its own meaning turned reading a cell
  into flipping its membership. A held modifier cannot be produced by
  clicking fast; that is why "open" is the modifier.

Which non-toggling cases skip the close (⌘-click, the agent's synthetic
clicks, the Differences surface, an open draft) is decided in one place,
`detailClickCloses`, next to the rest of the grammar.

## Canvas modes

`CanvasMode` is `'view' | 'design'` (`src/contexts/canvasModeContext.ts`).
View is reading, navigating, annotating; design turns the same canvas into an
authoring surface — cells become selectable, and the toolbar _swaps_ its
annotation tools for creation ones rather than growing a second row. Scope is
**per surface**, not global: the base canvas and each slice tab hold their own
mode.

**The Edit switch is absent, never disabled.** When a session cannot write
(`available: false`) — and on all mobile — the switch does not render. A
disabled Edit button would advertise a capability the session doesn't have;
discoverability is handled in copy instead — the words tell a reader what they
would need in order to edit, which a greyed control never does.

## The annotation layer, in pieces

`CanvasAnnotationLayer.tsx` is the pointer, drag, resize and selection machine
and the composition — and since v1.44.11 it is only those. Beside it sit the
geometry every piece divides by (`canvasAnnotationGeometry.ts`), the pickers
and grips (`CanvasAnnotationSwatches.tsx`,
`CanvasAnnotationResizeHandles.tsx`), one floating style bar
(`AnnotationStyleBar.tsx`) on a shared plate
(`CanvasAnnotationBarChrome.tsx`, whose class vocabulary — slot, icon slot,
menu surface, menu item — is `canvasAnnotationChromeStyles.ts`), and one mark
(`AnnotationMarkNode.tsx`) over the props contract it takes from the layer
(`canvasAnnotationNodeProps.ts`). Nothing a person does changed: the split is
held upstream by the annotation-drag slice, and `npm run check:render-walk`
drags a box onto a third cell here on every run.

**What differs between a shape, a sticky and a text mark is a row, not a
file.** `canvasAnnotationKinds.ts` says which controls a kind's bar offers, in
what grouping, from which swatch set and under which delete noun, and whether
a press on the mark's own label opens its editor rather than starting a drag.
The bar draws each control once and the mark writes the pointer rule once; a
fourth kind of mark is a row in that table. A kind's own drawing — the label
fitted to a drawn box, the note that is a textarea all the way through, the
type that shows its editor until it holds something — stays a real difference
and is written out, because it is one.

**The floating annotation style bar is the one surface that does not follow
the theme.** `--background-annotation-chrome` stays dark in both modes on
purpose: the plate floats over a board whose cells already carry every hue
in the palette, so a bar that flipped with `.dark` would read as one more
coloured plane rather than a tool over the board. It is declared off the
designers' literal colour export, not a theme dial; the tokens test holds
that value identical under both theme files. The docked pen/eraser toolbar
(`CanvasAnnotationToolbar`) is ordinary chrome (`bg-card`) and does follow
the theme.

## The bottom-right corner stack

Three pieces float over the canvas in the bottom-right corner: the zoom
cluster, the panel error card, and the inspector drawer. They share one
shape (`rounded-lg`) and one shadow (`shadow-md`). The error card sits one
gutter above the zoom cluster (`bottom-16` vs `bottom-4`) so the two never
overlap — a spatial rule, not a z-index fight with the drawer primitive.
The inspector already clears the same band via `CELL_DETAIL_PANEL_BOTTOM_GAP_PX`.

## Panel as selection

The open cell panel IS the selection, and `panelState` is its **single
owner**: the ✕, Escape, a toggling click, and the agent all go through the
same `closePanel`; nothing else holds an "is it open" fact. Any new
affordance that opens or closes the panel calls the owner — a second source
of truth here is the bug class this rule killed.

## The board's address

A board is a place, and the address bar says which one. Phase, scenario, path
selection and view mode ride in the query string beside the service slug in the
path, so a board can be sent to someone, survives a reload, and can be stepped
through with back and forward.

- **Two classes of state, two history calls.** The board **pushes** — back
  steps to the board you came from. The open cell panel **replaces** — a panel
  opens and closes many times while one board is read, and pushing those would
  fill the history with panel opens. The address stays complete either way;
  only the entry is withheld.
- **Absent means "as this board says".** No `view` is the layout the scenario
  remembers, no `paths` is its happy-path default. A param appears only where
  the reader diverged, so a link written before anyone chose anything does not
  overrule an editor who later re-lays the board out.
- **A name that no longer resolves degrades to the nearest valid board** — a
  dead scenario to its phase, a dead phase to the overview, a renamed path to
  the ones that do resolve. Never an error page, never a blank one.

`BoardAddressSync` is the seam and `lib/boardAddress.ts` is the vocabulary.

## Motion

The product layer has one motion vocabulary: four curves named by what the
motion is for, and a short ladder of durations. Pick the role first; the
curve follows from it.

| Role | Curve | Use it when |
| --- | --- | --- |
| **arrive** (`ease-arrive`) | `cubic-bezier(.22,1,.36,1)` | Something enters or is revealed — a panel opening, a popover, a fade-up, hover and focus feedback. Fast off the mark, long settle. |
| **leave** (`ease-leave`) | `cubic-bezier(.6,0,.85,.25)` | Something exits — a panel closing, a dialog's backdrop on its way out. Pair it with a shorter rung than the entry: arriving is an event, leaving is not. |
| **move** (`ease-move`) | `cubic-bezier(.65,0,.35,1)` | Something already on screen goes from A to B — a tab indicator sliding, a chevron rotating, a height or width changing, a progress bar filling. |
| **spring** (`ease-spring`) | `cubic-bezier(.34,1.45,.5,1)`, a `linear()` spring where supported | A small thing pops — a swatch on hover, a button press. Never on anything panel-sized. |

Durations come from the ladder, never a number: `--motion-micro` (150 ms,
hover and small state changes), `--motion-fade` (200 ms, crossfades and
entries), `--motion-fade-stagger` (75 ms, the gap between an out and its in),
`--motion-structural` (320 ms, a whole surface changing size) and
`--motion-camera` (420 ms, camera-adjacent CSS). In a class string that is
`duration-(--motion-micro) ease-arrive motion-reduce:transition-none` — every
product transition names its rung, its role and its reduced-motion answer in
the same string.

- `--ease-structural` remains as an alias of arrive for stylesheets that
  already read it; product classes use the role names.
- `--ease-camera` (`ease-camera`) is still the camera's own curve, kept for
  CSS that rides a camera flight (focus dimming, the compare fade) so it
  matches the JS flight. The camera becomes a move when the flight and this
  token switch together.
- The vendored `ui/` primitives keep their upstream timings. A product surface
  that needs a different feel sets it on its own wrapper's classes.
- The canvas reveal ladder keeps the plain `ease-out` it documents in
  `blueprint.css`: its beats run serially, and a long-tailed arrive curve
  makes each handoff land late. It is a separate clock from the shell's.
- `lib/motion.ts` carries the curves for JS that animates on frames
  (`EASE_POINTS`, `cubicBezierEase`, `easeMove`). The camera flight does not
  use them yet: it still eases on its own hermite curve in
  `lib/cameraTransition.ts`.

`lib/motion.ts` and `styles/animations.css` hold the two halves, and a drift
test compares their token values. What the product layer may not write is
enforced, and listed, by `components/motionVocabulary.test.ts`.

## Camera

The full action-by-action table lives in the 2026-07-30 motion plan; the
contract in short:

- Navigation **fits**: phase/scenario clicks, prev/next, and re-clicking the
  selected row (recenter) all fly as one distance-aware camera flight
  (240–650 ms). `--motion-camera` (420 ms) remains the token for
  camera-*adjacent* CSS, not the flight duration.
- **Escape / Home / breadcrumb all animate to the overview identically** —
  same destination, same feel, no jump-cut variant.
- First fit after any mount **jumps**; deep-link restores jump.
- Path toggles in overview, sidebar collapse, and chrome-driven resizes **never
  move the camera**. A path toggle inside a focused comparison changes the
  target's geometry, so it gets one normal camera ease to the new fit.
  Wheel/trackpad input follows instantly — no smoothing, no momentum, and no
  snapping of any kind.
- Exactly one camera animation per intent; reduced motion makes every fit a
  jump. What holds that up — one writer per navigation, geometric scale
  interpolation, and a fit that takes off once the named target exists and
  retargets while live — is the camera's own contract, and
  `src/lib/canvasCameraPolicy.ts` and `src/lib/cameraTransition.ts` are where
  it is written down.
  Automatic travel follows a bounded distance-aware camera flight: zoom is
  geometric, screen-space travel is monotonic, and compatible velocity carries
  across superseding destinations. A zoom-in from the blocks tier keeps that
  encoding and reveals only the named destination, so overview → scenario
  does not paint the whole board on takeoff. Focus emphasis reads the same
  flight's
  progress. Manual wheel, pinch, drag, and keyboard input remains immediate
  and cancels the automatic flight.
- Wheel and trackpad zoom preserve the world point beneath the cursor. A
  two-finger pinch maps its previous midpoint directly to its current midpoint,
  combining scale and finger drift in one transform instead of applying drift
  twice.
- A wheel notch means the same thing everywhere: deltas are normalised to
  pixels at the point of entry from the mode the event reports (Firefox sends
  lines, Chromium pixels), and a single event's zoom step is capped so a
  mouse notch cannot jump the scale nearly threefold. The Mac trackpad is the
  baseline and is unchanged by both.
- Arrow keys pan the camera while focus is inside the viewport (Shift for a
  stride), through the same `panBy` primitive the pointer and the agent use.
  Focusing a cell by keyboard moves the camera until that cell is on screen —
  the viewport is transform-based and hides its overflow, so the browser's own
  scroll-into-view cannot help, and the container's scroll offsets are held at
  zero because the camera's maths assumes them. A focus move never interrupts
  a fit already in flight.
- Focused phase and scenario boards are centered in the canvas. Floating
  sequence controls use equal top and bottom clearance so avoiding the controls
  never shifts the selected board off the visual center.
- Camera time begins on the first drawable animation frame. React/layout work
  may delay the start, but it cannot consume the ease before the browser paints.
- Focus mode dims non-selected phase/scenario cards to 30%, then lifts them to
  70% on hover or keyboard focus. They remain navigation targets so a reader
  can switch focus directly; cell-level actions inside them remain inactive.

## The phase-row height contract

Scenario panels in one phase row share a height so the row reads as one
object: the step header row and the lane rail sit at the same height in every
panel. Two rules keep that true.

**Boards top-align inside their panel, always.** Never centred. Centring each
board independently inside its own container is precisely what breaks the
row — shorter boards drift down and their headers no longer line up with
their neighbours'. It also makes the padding above a board appear to change
as the measurement settles.

**The row height is MEASURED, and the estimate is only a placeholder.** The
estimate exists to size panels in the commit before anything has been
measured; the moment a measurement lands it replaces the estimate outright,
in both directions. Treating it as a floor put **84px of dead gray under
every board on the canvas** — the same 84px on all six phase rows, which is
the signature of an arithmetic error, not a measurement one. A `Math.max`
against a prediction that is always high can never correct itself. Two
independent terms produced it: 64px because the panel-height estimates
called `getComparePanelScrollPaddingY()` with no options and so budgeted for
the *unlocked* scroll chrome — resize-handle inset plus artboard buffer — on
panels that are height-locked and have no handle, while the measuring pass
and `ResizableComparePanel` both correctly passed `{ lockHeight: true }`;
and 20px for a path-section bottom inset the stacked board does not render.
The estimates take the chrome as an argument now, so the placeholder is
close — but nothing depends on it being right any more, which is the point.
A future drift shows up as one wrong pre-paint frame instead of permanent
gray.

**A panel leaves the row's height input only when it is EXPANDED, never
merely because it is focused.** The exclusion exists for one case: a
comparison opened inside a focused scenario reaching its dimmed neighbours.
Gating it on focus instead made invariant 1 unsatisfiable — excluding a
panel changes the row height, and the focused panel went down with it (the
Application row read 1766px at overview and 1730px once Discovery was
focused; that 36px was the container padding appearing to jump between the
phase view and the scenario view). Gated on the expansion, a plain focus
leaves every number in the row exactly where it was, and an expanded panel
is still bucketed rather than dropped — `resolveScenarioPanelHeight` hands
it `max(rowHeight, itsOwn)` so excluding it can never shrink it.

The marker is an explicit `data-row-height-excluded` attribute, not a
reading of `data-canvas-focus-active`. That attribute is set on the phase
SECTION as well as the panel, so a `closest()` for it matched *every* panel
in a focused row rather than the focused one — which silently disabled the
row measurement altogether and dropped the row to its estimate.

Panel content is measured in a **layout** effect, not a passive one. The
panel answers growth in the commit that causes it (the estimate rises
immediately) but can only answer shrinkage once a new measurement arrives —
measure a paint late and the two directions stop behaving alike: adding a
path resizes at once, removing one holds the old size for a frame and then
snaps. The camera fit, which waits on this size, inherits that asymmetry
exactly.

## The touch contract

Owned by the native-capture boundary in `useZoomPanViewport.ts` — its
`handlePointerDown` is where ownership of a gesture is actually decided, and
there is no second copy of that decision to consult. This contract governs the
canvas on any touch screen; on a phone the canvas is the whole surface:

- **Tap opens.** A finger that lifts inside the slop is a tap and behaves as
  a (bare) click.
- **10px slop, then drag pans — from anywhere, including cells.** A touch
  goes "pending" on contact; crossing `TOUCH_PAN_SLOP` commits it to a pan,
  so starting a drag on a cell pans the board rather than opening the cell.
- **Two fingers pinch, always** — pinch-zoom about the midpoint regardless of
  what the fingers landed on. A pinch is never a tap.
- **Ghost-pointer reset on primary contact**: a fresh first touch clears any
  pointers stranded by a died stream, so a cancelled pinch can't wedge the
  gesture state.
- **A drag's trailing click is swallowed** — the synthetic click browsers
  fire after a pan must not also open a cell.
- **A finger inside a scrolling region scrolls it, not the board.** The board
  does contain scrollable regions (an overflowing band), and
  the wheel path has always handed them their deltas; touch does the same, off
  the same determination (`canvasScrollRegions.ts`). Two fingers are still a
  pinch wherever they land — a region gets `touch-action: pan-x pan-y`, never
  `auto`.

**The gesture is claimed twice over: declared in CSS, then taken in JS.**
`touch-action: none` is set on the viewport, on the transformed content
wrapper, and on every descendant of it (`blueprint.css`) — but that property
is a *declaration* the compositor consults before deciding whether a touch
belongs to the page, and `[data-zoom-pan-content]` is a composited layer that
WebKit does not dependably resolve it across. When it resolves to `auto` the
browser takes the touch and answers with `pointercancel`: a finger on empty
canvas pans, the identical finger on a cell does nothing, and two fingers
zoom the page instead of the board. So the viewport also holds non-passive
`touchmove` and `touchstart` listeners that call `preventDefault` — no layer
boundary sits between an event already delivered and its default action.
`touchstart` is claimed only from the second finger: preventing the first
would suppress the click a tap depends on, while multi-touch synthesizes no
click and is where WebKit's page pinch-zoom starts, which `touch-action`
cannot reach at all. Chromium resolves the declaration correctly and never
showed any of this, which is why `src/lib/canvasTouchContract.test.tsx` pins both
halves — no amount of checking in a Chromium pane can catch a regression
here.

The viewport observes pointer streams in native capture, before populated
lanes, cells, or controls can stop bubbling. Desktop adds two temporary pan
overrides without changing the selected tool: hold Space and primary-drag, or
drag with the middle mouse button. Editable fields retain Space and shortcuts.

Desktop wheel/keyboard paths are untouched by all of this, and an
interaction test pins the pinch path. macOS Safari's trackpad pinch is a
third mechanism again — WebKit `gesture*` events, with no touch pointers and
no synthesised ctrl+wheel behind them — so the canvas reads their cumulative
`scale` and zooms from it, gated on the touch-pointer count being zero so
that iOS, where the pointer map already pinches, never applies scale twice.
What exists on a phone at all is a question for
[mobile-shell.md](mobile-shell.md), not for this surface: below the gate this
canvas is not what renders.
