---
'uno-blueprint': patch
---

The docs say how other coding agents call the skills. The README's "The plugin" section gains an "In other coding agents" entry: the invocation per tool as checked by hand (`ub:map` in Cursor, `$ub:map` in Codex, under their `ub:` names), and a link to the guide for the rest; Gemini CLI, Copilot and Windsurf are named as tools that document the same `.agents/skills/` convention, not as checked. Guide 03 gains a section on the mirror: why `skills/` stays the source (its paths are a published interface, and only `SKILL.md` needs copying because every path a skill names resolves from the repository or workspace root), why it is a copy rather than a link, and that `npm run sync:skills` is the step after a skill edit. The AGENTS.md intro names `.agents/skills/` as how other agents discover the skills and points at that section by its heading.

Upgrading a deployment: no action. Only documentation changed.
