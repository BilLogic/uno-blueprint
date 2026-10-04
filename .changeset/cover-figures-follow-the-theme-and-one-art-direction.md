---
'uno-blueprint': minor
---

Cover figures follow the theme. A figure can now ship a dark file beside its light one (`name.dark.svg`), carried as `srcDark` on its cover figure. The cover shows it in the dark theme and swaps it live with the toggle, and the README embeds it through `<picture>` so GitHub follows its own theme. Figures without a dark file keep their light file in both themes.

The cover-page guideline gains an art direction for the figures, and `why-now` and `when-to-use` are redrawn to it, light and dark. The Overview's four uses are now sentence case ("Stakeholder alignment").

Upgrading a deployment: nothing to do. A deployment that spreads a package figure and overrides `alt` gets `srcDark` with it.
