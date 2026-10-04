---
'uno-blueprint': minor
---

Cover figures follow the theme. A figure can now ship a dark file beside its light one (`name.dark.svg`), carried as `srcDark` on its cover figure. The cover shows it in the dark theme and swaps it live with the toggle, and the README embeds it through `<picture>` so GitHub follows its own theme. Figures without a dark file keep their light file in both themes.

The cover-page guideline gains an art direction for the figures, and `why-now` and `when-to-use` are redrawn to it, light and dark. The Overview's four uses are now sentence case ("Stakeholder alignment").

Upgrading a deployment:

- A deployment that spreads `packageCoverFigures.whyNow` or `packageCoverFigures.whenToUse` and overrides `alt` is now describing the old drawings. Rewrite that alt text for the new ones: a year of weekly reads against the board as it stands in December, and one mini-blueprint read four ways.
- A spread figure carries `srcDark` with it, so its dark file follows the theme with no other change.
