---
'uno-blueprint': patch
---

The docs say how other coding agents call the skills. The README's "The plugin" section gains an "In other coding agents" entry: Cursor, Codex, Gemini CLI, Copilot and Windsurf find the four skills under `.agents/skills/` with no plugin install, they keep their `ub:` names, and a skill is `ub:map` in Cursor and `$ub:map` in Codex. Guide 03 gains a section on the mirror: why `skills/` stays the source (its paths are a published interface, and only `SKILL.md` needs copying because every path a skill names resolves from the repository or workspace root), why it is a copy rather than a link, and that `npm run sync:skills` is the step after a skill edit. The AGENTS.md intro names `.agents/skills/` as how other agents discover the skills and points at that section.

Upgrading a deployment: no action. Only documentation changed.
