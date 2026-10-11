---
'uno-blueprint': patch
---

A repository without skills or agents counts zero descriptions, quietly. The description census behind `check:budget` and `check:negation` now finds every `skills/<skill>/SKILL.md` and `agents/<agent>.md` on its own, where a plugin host finds them, instead of through the prose sweep's `sweptDirs`. A repository holding neither folder counts zero descriptions, passes a zero budget and the ratchet over its router alone, and prints no unverified warning about either folder. With the folders present, the count is unchanged.

Upgrading a deployment: take the new copies of the byte-identical `scripts/always-loaded.mjs`, `scripts/check-router-budget.mjs`, `scripts/check-negation-ratchet.mjs`, `scripts/sweep.mjs` (a header comment only) and `scripts/tests/the-router-is-a-router.test.mjs`, and drop `skills` and `agents` from `sweptDirs` in its own `scripts/repo-config.mjs` if they were added only for the description census.
