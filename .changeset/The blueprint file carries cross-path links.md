---
"uno-blueprint": minor
---

A blueprint file can now carry a link to a cell on another path or scenario of the same service. Either end of a dependency takes an optional `path`, and `scenario` with it, to name a cell away from the path that lists the link; an end without them is on that path, as before. `scripts/validate_ir.py` checks that the named scenario, path and cell exist, that one end sits on the listing path, and that a link is not listed twice on its two paths, and it still refuses a link with no cell at an unqualified end. There is no way to name another service. The seed and the no-database fallback both carry such a link: one into another scenario is inserted after every scenario's replace, and its id is the same whichever path lists it. A journey slice leaves a companion cell on another path out and prints a note naming it. The IR schema version is now `2026.09.12`.

Upgrading a deployment: run `python3 scripts/migrate_ir.py <ir-file> --to 2026.09.12 --write` on each IR in the workspace (add `--workspace blueprint-workspace.json` to re-anchor sign-off hashes), as `references/customization.md` § Template upgrade recipe describes. The step only changes the stamp. Regenerate any committed seed or fallback module afterwards. No migration and no database-type change are needed.
