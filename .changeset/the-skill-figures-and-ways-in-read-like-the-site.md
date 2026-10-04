---
'uno-blueprint': minor
---

The four skill figures and the ways-in figure are redrawn to the cover's art direction, light and dark, and now read as kin to the site's own illustrations. Each skill figure runs left to right — what you have, the skill, what you get — with the skill named in a dark term chip, and makes one claim taken from the skill's own contract:

- `ub-map`: what it finds in your documents lands in cells, held as a draft until you sign it off.
- `ub-slice`: one cut of the blueprint (here a lane) becomes slides in order, each citing the cell it shows.
- `ub-audit`: findings — a step with no cell, two cells competing for one channel, a recorded owner and a perceived owner that differ — point at cells and wait for your triage; the blueprint is left as it was.
- `ub-whatif`: a change is traced on a copy, and reaches the blueprint only after you accept it, through `ub:map`.
- `four-ways-in`: the app, the in-app agent and agentic tools read and write one shared context; a Slack bot you build only reads it.

Each now ships a dark file, carried as `srcDark`, and the README and the guide embed them through `<picture>`. Their heights changed, so a page reserving their box uses the new `height` from `packageCoverFigures`.

Upgrading a deployment:

- A deployment that spreads `packageCoverFigures.fourWaysIn`, `ubMap`, `ubSlice`, `ubAudit` or `ubWhatif` and overrides `alt` is now describing the old drawings. Rewrite that alt text for the new ones, or drop the override to take the package's.
- A spread figure carries `srcDark` and the new `height` with it, so it follows the theme with no other change. A deployment that restated `height` by hand should take the new value.
