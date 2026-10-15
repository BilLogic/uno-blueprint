# Which hosts can carry the agent

Question: what can Cursor (first) and the Claude desktop app each carry for an
agent packaged as `SKILL.md` skills, sub-agents and one MCP tool server over
Supabase? Covered per host: skills and rules, sub-agents, MCP, model
switching, scheduled or background runs, the inputs an owner can hand it, and
how the package is installed and updated.

All sources are first-party docs, read on 2026-10-15. Where a page was silent
the note says so rather than filling the gap from a third-party write-up.

## Comparison

| Capability | Cursor | Claude desktop (chat + Cowork) |
| --- | --- | --- |
| `SKILL.md` skills | Yes. Discovered in `.agents/skills/`, `.cursor/skills/`, and for compatibility `.claude/skills/` (plus user-level twins). `name` must match the folder. [C1] | Yes, in chat, Cowork and Claude Code. Needs code execution on. Arrives by plugin or ZIP upload, not by reading a repo folder. [A1][A3] |
| Rules / always-on instructions | `.cursor/rules/*.mdc` (four apply modes) and `AGENTS.md`, nested. [C2] | Folder instructions in Cowork; no repo-file rule system. [A5] |
| Sub-agents | Yes. `.cursor/agents/` and `.claude/agents/` read; frontmatter `model`, `readonly`, `is_background`; no `tools` field, all parent tools inherited. Parallel, optional worktree isolation. [C3] | Plugin `agents/*.md` load in Cowork and Claude Code; ignored in chat. [A3][A4] |
| Hooks | Own camelCase schema in `.cursor/hooks.json` or a plugin; mentions loading Claude Code hooks via a separate page (not verified). [C8] | Load in Cowork and Claude Code; ignored in chat. [A4] |
| MCP | `.cursor/mcp.json` / `~/.cursor/mcp.json`; stdio, SSE, streamable HTTP; OAuth; tools, prompts, resources, elicitation. [C4] | Remote MCP by URL (custom connector, all plans, Free capped at one) with OAuth or request headers; local MCP only as an MCPB desktop extension or a plugin connector that "runs in each session". [A6][A7] |
| Model switching | Many providers (Anthropic, OpenAI, Google, Cursor's own and others); third-party models need Premium or above; per-sub-agent `model`. [C5][C3] | Claude models only (no doc reviewed lists another provider); manual scheduled tasks let you pick the model. [A2] |
| Scheduled / background | Cloud agents (VM, branch, push) plus Automations: cron schedule, GitHub, Slack, Linear, webhook, Sentry, PagerDuty triggers; MCP and per-automation `MEMORIES.md`. [C6][C7] | Cowork scheduled tasks on paid plans: hourly, daily, weekly, weekdays; run in the cloud with the machine asleep, except tasks needing local files or local MCP. [A2][A8] |
| Inputs an owner can hand it | Workspace files and folders via `@`, images by drag or paste, past chats, terminal, git diffs, built-in browser. PDFs and Office files not documented. [C9] | Uploaded files in chat; connected local folders in Cowork (desktop open); connectors from the directory (Drive, Slack, Figma and the like). [A5][A6] |
| Package install | Plugin: `.cursor-plugin/plugin.json`, repo marketplace at `.cursor-plugin/marketplace.json`, imported from GitHub in Customize; team marketplaces on Teams/Enterprise. [C1][C10][C11] | Plugin: `.claude-plugin/plugin.json`; add a GitHub repo as a marketplace (`owner/repo`), or upload a ZIP. Saved to the account, synced to Claude Code. [A3][A4] |
| Package update | GitHub-imported marketplaces auto-refresh on push to the tracked branch (at most every 10 min, needs the Cursor GitHub App) or manual Refresh. `version` field's role not documented. [C10] | "Check for updates" or "Sync automatically" on a GitHub marketplace; updates arrive with nothing to accept; local edits are flagged before overwrite. [A3][A4] |

## Cursor

- **Skills.** First-class `SKILL.md` support. Cursor reads `.agents/skills/`
  directly, and `.claude/skills/` for compatibility, so a clone of this repo
  already exposes `map`, `slice`, `audit` and `whatif` with no packaging step.
  Invoked automatically by description, or with `/` for one message, or as a
  Custom Mode for a session. Frontmatter adds `paths`,
  `disable-model-invocation`, `metadata`. Skills are not installed on their
  own; distribution goes through a plugin. [C1]
- **Rules.** Separate from skills: `.mdc` files in `.cursor/rules/` with
  Always / file-glob / agent-decides / manual modes, plus nested `AGENTS.md`.
  Team rules are dashboard-managed on paid team plans. [C2] This repo's
  `AGENTS.md` router therefore loads in Cursor as-is.
- **Sub-agents.** Markdown with YAML frontmatter, read from `.cursor/agents/`
  or `.claude/agents/`. `model` can pin a specific model per sub-agent, which
  is the model-switching lever the map cares about. There is no per-agent
  tool allowlist: `readonly: true` is the only restriction. Our `agents/*.md`
  declare a Claude-Code-style `tools:` list, which Cursor will not enforce. [C3]
- **MCP.** Full client: stdio and remote transports, OAuth (with a static
  client fallback), env interpolation (`${env:NAME}`, `${workspaceFolder}`),
  and the prompts/resources/elicitation surface. One tool server over Supabase
  fits either as a local stdio process or a remote HTTP endpoint. [C4]
- **Model switching.** Anthropic, OpenAI, Google and Cursor's own models among
  others; Auto mode routes by cost or intelligence. Third-party models need
  Premium or above; BYOK is documented for Teams and Enterprise. [C5]
- **Background and schedule.** Cloud agents run in an isolated VM against a
  repo, with team MCP servers and dashboard secrets. [C6] Automations add a
  real cron trigger plus event triggers, a "no repository" mode, MCP access
  and per-automation persistent memory. Billing is cloud-agent usage; the
  plan gate is not stated on the page. [C7]
- **Inputs.** Anything that lands in the workspace as a file is readable;
  `@` attaches files, folders, past chats, terminal output, git diffs and the
  browser; images by drag or paste. The docs page names no PDF, Office or
  transcript import, so owner material should be converted to text or
  Markdown in the workspace. Figma arrives through an MCP server. [C9][C4]
- **Hooks.** Cursor's own schema (`sessionStart`, `preToolUse`,
  `afterFileEdit` and so on) in `.cursor/hooks.json`; it keeps exit-code-2
  blocking and a `CLAUDE_PROJECT_DIR` alias for compatibility, and points to a
  separate page on loading Claude Code hooks that this pass did not verify. [C8]
- **Install and update.** A Cursor Plugin bundles rules, skills, agents,
  commands, hooks and MCP under `.cursor-plugin/plugin.json`; a repo
  marketplace is `.cursor-plugin/marketplace.json`. Install from Customize
  (project or user scope); import a GitHub repo as a marketplace; team
  marketplaces can mark a plugin Required. MCP config should use
  `${CURSOR_PLUGIN_ROOT}`; Cursor also expands `${CLAUDE_PLUGIN_ROOT}` in MCP
  config. Neither page says Cursor reads `.claude-plugin/` manifests. [C10][C11]

## Claude desktop (chat and Cowork)

- **Two modes, different loads.** Chat loads a plugin's skills, commands
  (as skills) and remote connectors, and ignores agents, hooks and local MCP.
  Cowork loads all of those, with local MCP only when the session runs on
  the user's machine. Top-level `bin/` makes the plugin uninstallable outside
  Claude Code. [A4]
- **Skills.** Available on every plan including Free, but require code
  execution and file creation turned on. Uploaded as a ZIP or delivered by a
  plugin; enabled skills sync one way into Claude Code. [A1]
- **Sub-agents.** Plugin `agents/*.md` run in Cowork, which also fans work out
  to parallel sub-agents on its own. Not in chat. [A3][A5]
- **MCP.** Remote servers by URL as custom connectors on every plan (Free gets
  one); auth by OAuth (Claude's published client metadata, DCR, or your own
  client) or, in beta, fixed request headers. Local servers ship as MCPB
  desktop extensions installed under Settings > Extensions. A remote server
  must be reachable from Anthropic's side; private-network servers need MCP
  tunnels. [A6][A7]
- **Model switching.** Claude models only. Scheduled tasks set up manually can
  choose a model. [A2]
- **Scheduled tasks.** Cowork, all paid plans: hourly, daily, weekly,
  weekdays or manual, each run its own session with connectors, skills and
  plugins. As of the cloud move (Pro and Max from 2026-10-06; Team and
  Enterprise in beta) tasks run with no device online, except tasks that need
  local files, local MCP, browser or computer use. [A2][A8]
- **Inputs.** File uploads in chat; connected local folders in Cowork while
  the desktop app is open; directory connectors for the owner's existing
  tools. A local folder of transcripts and exports is the richest path, but
  it pins the run to the desktop. [A5][A8]
- **Install and update.** Customize > Plugins: Discover, Add marketplace (a
  GitHub repo, `owner/repo` shorthand, private repos through the Claude GitHub
  App), or Upload plugin (ZIP holding one `.claude-plugin/plugin.json`).
  Installs attach to the account and sync to Claude Code. Updates flow from
  the source automatically or via Check for updates / Sync automatically.
  Limits: 25 marketplaces, 200 MB and 5,000 files per plugin. A connector
  bundled in a plugin is not connected by installing; the owner connects it
  from the plugin's Connectors tab. [A3][A4]

## What this repo already ships for hosts

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (plugin
  `ub`, source `./`): the Claude Code and Claude desktop install path.
- `skills/*/SKILL.md` with folder-matching `name`s, mirrored to
  `.agents/skills/` by `npm run sync:skills`: Cursor reads that mirror
  directly.
- `agents/*.md` with a `tools:` list: loads in Claude Code and Cowork, and as
  Cursor sub-agents only from `.cursor/agents/` or `.claude/agents/`, neither
  of which this repo populates. The `tools:` list is not enforced in Cursor.
- `hooks/hooks.json` in Claude Code's PascalCase schema with
  `${CLAUDE_PLUGIN_ROOT}`: runs in Claude Code and Cowork; not documented to run
  in Cursor.
- No MCP server config and no `.cursor-plugin/` manifest.

## What this means for the package

1. **One source tree, two manifests.** Skills port untouched to both hosts.
   Cursor needs a `.cursor-plugin/plugin.json` and
   `.cursor-plugin/marketplace.json` beside the existing `.claude-plugin/`
   files; both can point at the same `skills/`, `agents/` and MCP config. The
   MCP entry should use `${CLAUDE_PLUGIN_ROOT}`, which both hosts expand.
2. **Make the tool server remote.** A remote streamable-HTTP MCP server with
   OAuth or a header key is the one shape every surface loads: Cursor local
   and cloud, Claude chat, Cowork in the cloud, and scheduled tasks with no
   device online. A local stdio server works in Cursor and in Cowork on the
   desktop only, and would stop the scheduled audit running unattended on
   Claude.
3. **The scheduled audit has a home on both.** Cursor Automations (cron, MCP,
   persistent memory, no-repo mode) and Cowork scheduled tasks (cloud, all
   paid plans) both carry "audit on a real schedule from day one", provided
   the audit reaches the blueprint through the remote tool server rather than
   local files or the `scripts/validate_ir.py` hook path.
4. **Do not rely on hooks for invariants.** Hooks are ignored in Claude chat
   and use a different schema in Cursor. Anything the hooks enforce today
   (IR validation, the secret guard) has to live in the tool server or the
   skill's own steps to hold on every host.
5. **Sub-agents need a per-host copy or a lowest-common frontmatter.** Cursor
   reads sub-agents only from `.cursor/agents/` or `.claude/agents/` (or a
   Cursor Plugin's `agents/`), honours `model` and `readonly` but not
   `tools`. A blind auditor should be marked `readonly: true` for Cursor.
   Claude chat runs none, so a skill must degrade to running the agent prompt
   inline (which the repo's router already prescribes).
6. **Model switching is a Cursor-only lever.** Per-sub-agent `model` pinning
   lets the dogfood host test cheaper models per role; on Claude the package
   must work on Claude models alone.
7. **Owner inputs.** Neither host documents a transcript or chat-export
   importer. Plan for owners to drop files into a workspace (Cursor) or a
   connected folder or upload (Claude), and for Drive, Slack and Figma to come
   through MCP connectors.

## Open points this pass did not settle

- Whether Cursor reads a `.claude-plugin/` manifest or translates Claude Code
  hooks: its docs mention a third-party hooks page and Claude-compat variables
  but not the manifest. A one-off install test answers it.
- The plan gate on Cursor Automations, and how Cursor uses a plugin's
  `version`.
- Whether a Cowork plugin agent can pin its own model.

## Sources (read 2026-10-15)

- [C1] Cursor, Agent Skills — https://cursor.com/docs/context/skills
- [C2] Cursor, Rules — https://cursor.com/docs/context/rules
- [C3] Cursor, Subagents — https://cursor.com/docs/context/subagents
- [C4] Cursor, Model Context Protocol — https://cursor.com/docs/context/mcp
- [C5] Cursor, Models — https://cursor.com/docs/models
- [C6] Cursor, Cloud agents — https://cursor.com/docs/cloud-agent
- [C7] Cursor, Automations — https://cursor.com/docs/cloud-agent/automations
- [C8] Cursor, Hooks — https://cursor.com/docs/agent/hooks
- [C9] Cursor, Mentions and context — https://cursor.com/docs/context/mentions
- [C10] Cursor, Plugins — https://cursor.com/docs/plugins
- [C11] Cursor, Plugins reference — https://cursor.com/docs/reference/plugins
- [A1] Claude Help Center, Using skills in Claude — https://support.claude.com/en/articles/12512180-using-skills-in-claude
- [A2] Claude Help Center, Schedule recurring tasks in Cowork — https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-cowork
- [A3] Claude docs, Plugins — https://claude.com/docs/plugins/overview
- [A4] Claude docs, Plugin feature support across platforms — https://claude.com/docs/plugins/platform-support
- [A5] Claude Help Center, Getting started with Cowork — https://support.claude.com/en/articles/13345190
- [A6] Claude docs, Get started with connectors — https://claude.com/docs/connectors/overview
- [A7] Claude docs, Add a connector that isn't in the directory — https://claude.com/docs/connectors/custom/add-unlisted
- [A8] Claude Help Center, Cowork in the cloud — https://support.claude.com/en/articles/15520349
- Also read: Claude docs, Install plugins in Cowork — https://claude.com/docs/cowork/guide/plugins
