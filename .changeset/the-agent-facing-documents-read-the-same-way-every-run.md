---
'uno-blueprint': patch
---

The agent-facing documents read the same way every run.

What every turn loads is small and stays small. The four skill descriptions and five agent descriptions lead with when to reach for each, one trigger per case, and fall from 5,322 to 3,295 chars. A plugin host loads them on every turn, so they are now counted beside the router: `check:budget` holds them to their own downward-only budget (`descriptions` in `scripts/repo-config.mjs`), and `check:negation` sweeps them. The router drops its self-description and hand-listed agent names, and points at the glossary only for writing a domain word. The canvas adapter states its read and write surface once and loses its no-ops and stacked prohibitions.

Upgrading a deployment: mirror the canvas adapter edits into the deployment's own override, then bump the pin. A deployment holding `scripts/always-loaded.mjs`, `check-router-budget.mjs`, `check-negation-ratchet.mjs` and the router test byte-identical takes the new copies and adds a `descriptions: { budget, slack }` entry to its own `scripts/repo-config.mjs` (zero budget when it holds no skills or agents of its own), and re-records `router.prohibitions.files` as one plus its description count.
