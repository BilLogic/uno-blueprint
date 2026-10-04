---
'uno-blueprint': minor
---

The six method figures are redrawn to the cover art direction, each with a dark file. `data-model-hierarchy` reads top to bottom, each level opening the one marked above it, down to a path drawn as a grid. `blueprint-anatomy` is one path: lanes as rows, steps as columns, leads-to arrows, and the lines of interaction, visibility and internal interaction falling between the lanes. `cell-anatomy` opens one cell on the board into its record. `slice-concept` shows numbered cells staying on the path while four ordered slides point at them. `slicing-model` draws the five slice types as five cuts through the same grid. `skill-architecture` is a matrix of the four skills against the shared references each links and the agents each hands its reading to. The README and the guide embed all of them through `<picture>`, so GitHub follows its own theme.

Upgrading a deployment:

- A deployment that spreads `packageCoverFigures.blueprintAnatomy`, `cellAnatomy`, `dataModelHierarchy`, `sliceConcept`, `slicingModel` or `skillArchitecture` and overrides `alt` is now describing the old drawings. Rewrite that alt text for the new ones; the package's own alt text says what each now shows.
- Each of the six now carries `srcDark` and new `width`/`height` values. A spread figure takes both with it, so its dark file follows the theme with no other change. A deployment that hard-coded a height for one of them should drop it.
