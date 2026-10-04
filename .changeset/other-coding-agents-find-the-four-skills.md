---
'uno-blueprint': minor
---

Other coding agents find the four skills. Cursor, Codex, Gemini CLI, Copilot and Windsurf discover skills under `.agents/skills/<name>/SKILL.md` and none of them scans a top-level `skills/`, so each skill's `SKILL.md` is now copied, byte for byte, to `.agents/skills/{map,slice,audit,whatif}/SKILL.md`. `skills/` stays the source, because its paths are a published interface; only `SKILL.md` is mirrored, since skill text resolves every path from the repository or workspace root. `scripts/sync-agent-skills.mjs` writes the mirror and, with `--check`, fails on a drifted or missing copy and on any file under the mirror that no skill produced, naming it; it needs no git, so it runs in a workspace. `npm run check:skills` runs that check beside the canvas one, `npm test` runs it first, and `npm run sync:skills` refreshes both copies after a skill edit. A frontmatter `name` that is not a lowercase slug is refused, and an empty folder left under the mirror is an orphan. The four path-root sentences now read correctly outside Claude Code: the plugin root is `${CLAUDE_PLUGIN_ROOT}` there, and the repository or workspace root anywhere else.

Upgrading a deployment: no action. The deployment imports nothing from `.agents/`, and every path it imports is where it was.
