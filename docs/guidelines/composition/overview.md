---
summary: The nine assembled surfaces, why they are cut by name rather than by source folder, the declared claim mapping the build enforces, which side of the package seam owns each claim, and the shape, edge, elevation and dashed-versus-solid rules every surface shares.
---

# Composition

Everything this application assembles out of the primitives — the files under
`src/components/{blueprint,editor,cover,mobile}` — documented as **the surfaces
a person can name**, one document each:

| Doc | Covers |
|---|---|
| [canvas](canvas.md) | click grammar, canvas modes, panel-as-selection, camera behaviour, the phase-row height contract, the touch contract, and the desktop chrome around all of it |
| [entity-panels](entity-panels.md) | the generic detail panel and the six entity panels, the shared shell, the term label, the textarea field, the loading state |
| [sidebar](sidebar.md) | the nav, both rails, the paths and slices sections |
| [agent-session](agent-session.md) | the agent panel, dock, markdown, settings fields, mobile sheet and fab, session persistence |
| [dialogs-sheets-and-forms](dialogs-sheets-and-forms.md) | the posture contract, the create and delete dialogs, the slice sheet, the session-changes sheet, field primitives |
| [compare](compare.md) | side-by-side, stacked and merged grids, the resizable panel, the review ledger |
| [slice-view](slice-view.md) | the view, presentation, screen composer, frame editor, storyboard, slide mode |
| [cover-page](cover-page.md) | the shell's landing view and its content model |
| [mobile-shell](mobile-shell.md) | the mobile shell and its chrome — the one forked surface |

## Shape, edge and elevation

Four rules every surface shares, so they live here rather than in any one
surface's document. They follow the marketing site, and each is carried by a
token rather than by a value typed at the call site.

### Radius ladder

Multiplicative on `--radius` (8px in the template), declared in
`src/styles/theme.css`:

| Rung | Value | Job |
|---|---|---|
| `rounded-sm` | 4px | a corner nested one padding step inside a control |
| `rounded-md` | 6px | controls: buttons, inputs, menu items, badges |
| `rounded-lg` | 8px | canvas cells, popovers, small tiles, canvas corner chrome, boxes inline in a surface |
| `rounded-xl` | 16px | surfaces: cards, panels, dialogs, sheets, cover figure frames |

In short: cells 8, controls 6, surfaces 16, and a nested corner is the outer
radius minus the padding between them. A segment inside a `p-1` `rounded-lg`
track is `rounded-sm`. When the padding is not a rung, spell it from the
outer rung, for example `rounded-[calc(var(--radius-lg)-5px)]`, rather than
picking the nearest rung by eye.

Controls stay at 6px rather than following the site's buttons up to 8. The
vendored menus, selects, command lists and tabs wrap md items in a `p-1`
`rounded-lg` box, and an 8px item would meet that box's corner square-on.

`xl` is for surfaces, not small tiles. A 40px toolbar, a load-progress tile
or a zoom button at 16px reads as fully rounded, so those stay on `lg`. The canvas's
bottom-right corner stack (zoom cluster, panel error card, inspector) shares
one shape, and because the zoom cluster is small buttons that shape is `lg`
([canvas](canvas.md)).

### Border steps

A neutral edge is ink laid translucently over whatever it sits on, in three
steps. Each step is a per-theme dial in the theme files (`--border-alpha-*`),
stated at `--contrast: 0.5`, and `semantic.css` scales it with the contrast
knob along the same ramp as the other neutral rungs. At the shipped contrast
the steps render at:

| Token | Utility | Light | Dark | Job |
|---|---|---|---|---|
| `--border` | `border-border`, bare `border` | 9% | 8% | resting: the edge every surface and cell sits behind |
| `--border-strong` | `border-strong` | 17% | 15% | hover, and any mark drawn on the canvas ground itself |
| `--border-stronger` | `border-stronger` | 42% | 45% | hot: the thing being acted on, a checked toggle |

The ladder stays in order at every contrast from 0 to 1:
`border-muted` < `border` < `input` and `border-overlay` < `border-strong` <
`border-stronger`. `src/styles/tokens.test.ts` sweeps the knob and holds it.

The softer `border-muted` divider, the `border-overlay` edge of a floating
plane and the `border-input` / `border-control-hover` pair on form controls
keep their own rungs. Selection is not a border step: it takes the primary
or role ring.

### Elevation

A resting surface separates from its ground by its border, not by a shadow.
Cards, panels, sticky headers, toolbars that sit in the layout, and the
buttons this application styles itself carry no shadow.

There are two named exceptions:

- **Outline buttons** keep the vendored hairline `shadow-sm` (and its
  `hover:shadow`). `src/components/ui/` stays pristine, so the primitive's own
  treatment stands.
- **The segmented control's pressed segment** keeps its `shadow-sm`. It is a
  raised selection inside its track, a state cue rather than elevation.

A shadow means *this floats*. It goes on popovers, menus, tooltips, sheets,
dialogs, the floating agent dock and cell panel, chrome pinned over the canvas,
and anything mid-drag. Use `shadow-md` (also `shadow-floating`) for chrome and
popovers and `shadow-lg` for sheets and dialogs. Dark mode restates both with a
one-pixel inset highlight along the top edge, which is how a floating plane
catches the light on a dark ground. Keep that inset when overriding a shadow.

### Dashed versus solid

Dashed means *not yet, missing, or off the happy path*. Solid means *it
exists*. The canvas already speaks this vocabulary, and new chrome must too:

- an unbuilt cell is dashed, and so
  is its status badge (`BlueprintCellButton`, `StatusBadge`);
- a touchpoint placement the registry lacks is dashed (`TouchpointCellFace`);
- a path's section frame is solid for the happy path and dashed for every
  other path (`pathColorTheme`, `pathKindTheme`);
- an empty slot, an add target or a drop zone is dashed, because the thing it
  stands for does not exist yet.

So a deprecated cell stays solid, because it still exists and is only fading.
Do not use a dashed edge for decoration, and do not draw something that
exists with one.

## Why not one doc per source folder

Because folder names are not stable and the boundaries are not the ones a
reader has. `editor/` alone spans the canvas, the sidebar, slices, the agent and
the dialogs; `blueprint/` holds the grid, the panels and the compare cockpit.
The `layer`→`lane` rename is the standing demonstration that a folder name can
change under a doc that was named after it.

What folder-derivation would have bought — nothing silently undocumented — is
bought instead by a check.

## The claim mapping

Each document's frontmatter carries a `claims:` list naming every file it
documents. `npm run check:harness` (`scripts/check-harness-claims.mjs`) holds
the two sides to each other in both directions and fails on:

- a source file no document claims, naming the file;
- a claim pointing at a file that is no longer there, naming both;
- a file two documents claim, naming both documents.

So a new surface that nobody documented turns the build red, and an obsoleted
surface shows up as a red build rather than as rot. Co-located `*.test.*` files
are a companion to the file they test, not a surface anyone documents, and are
excluded from the source set.

The count is the check's business rather than the reader's. If you are adding a
component, add its path to whichever document's `claims:` list already describes
the surface it belongs to — and if none does, that is the signal that you are
building a *tenth* nameable surface, which is a conversation, not a paste.

## Which repository writes the claim

These documents ship with the package, and the claim for a file is written
where the file lives. A deployment that mounts this application holds neither
the components nor their prose, so a release that adds a module adds the claim
here, in the repository that added the module — and a deployment's own claims
check reads these documents out of the package it installed and stays green
across the pin bump.

What a deployment still claims is its own: the assembled files it holds outside
this application, in the trees its `repo-config.mjs` names. Those are files this
package has never seen and cannot document, so each of them needs a claim in a
composition document of the deployment's own.

Prose is overridden by name. A deployment's composition folder is laid over this
one, document for document — the rule the application already resolves per path
— so a deployment that disagrees with a surface's account writes a document
under the same filename and takes that surface over, claims included. One it
does not name, it inherits.
