---
summary: The nine assembled surfaces, why they are cut by name rather than by source folder, the declared claim mapping the build enforces, and which side of the package seam owns each claim.
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

## Small labels are sentence case

One rule across every surface below. A badge, a tag, an eyebrow, a phase
marker, a divider caption, a group heading: **12px sans, muted ink,
letter-spacing 0, never under 11px, in the case the string was written in.**
This overrides the earlier capitals-and-wide-tracking label style everywhere it
appeared.

- **The case lives in the string.** Write `Line of interaction`, not
  `LINE OF INTERACTION`; nothing in CSS rewrites it. An acronym stays as typed
  for the same reason — no transform flattens it.
- **No `uppercase`, no wide tracking.** `tracking-wide`, `tracking-wider`,
  `tracking-widest`, a positive arbitrary `tracking-[…]`, an inline
  `textTransform` or a positive `letterSpacing` are all out.
- **Sans, unless the label is literally code.** Mono stays for identifiers and
  stored values (register 1) and aligned numerals (register 2); a label is
  neither.
- **The vendored primitives are not edited.** Where one capitalises — the
  command group heading does — the wrapper that renders it restates the rule.

`src/components/sentenceCaseLabels.test.ts` holds this across the authored
components, the dev pages and the stylesheets, and fails naming the line.

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
