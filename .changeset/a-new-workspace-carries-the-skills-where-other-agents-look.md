---
'uno-blueprint': patch
---

A new workspace carries the skills where other coding agents look for them, and CI proves it. The initialiser already wrote `.agents/skills/` into every workspace, since it writes every path the release tarball holds; nothing held it to that. The workspace job now runs `node scripts/sync-agent-skills.mjs --check` inside the workspace it wrote, so a missing or drifted copy of any skill fails the build, and the initialiser's tests pin that a folder whose name starts with a dot arrives whole. The template upgrade recipe in `references/customization.md` now names `.agents/` beside `skills/`, `references/`, `agents/` and `scripts/`, because a copy by glob skips it.

**Upgrading a deployment**

- Nothing to do. A workspace upgraded by copying the template forward takes `.agents/` with the rest, and `node scripts/sync-agent-skills.mjs --check` confirms the copies.
