---
'uno-blueprint': minor
---

The hierarchy figure returns to its staircase. `data-model-hierarchy` is the v2.4.0 layout again, restyled to the cover art direction: four panels stepping down and to the right — service, phase, scenario, path — each under a tab naming the item it opens, phases and scenarios as fanned decks of cards, and two thin projection lines running from the focused item to the next panel. The stacked redraw lost that zoom, and the zoom is what carries the levelling. The focused item is a teal outline with its halo, the projection lines and the tabs they land on are teal, captions are sentence case at 14.5 units or more, and the path panel is a small mini-blueprint whose cells are outlines in their lanes' colours. The light and dark files differ only in their `<style>` block. The figure is now 880×634, its alt text in `packageCoverFigures` describes the staircase, and the README and guide/01 embeds carry the same alt.

Upgrading a deployment:

- A deployment that overrides `packageCoverFigures.dataModelHierarchy.alt` should rewrite its alt to describe the staircase: four levels stepping down and to the right, each opening the one before it.
- A deployment that overrides its `height` should set 634 (the viewBox is now `0 0 880 634`), or drop the override and take the package's.
- A deployment that uses the figure as the package supplies it needs no change.
