# ub — Uno Blueprint service blueprinting skills (agent router)

This repo is the `ub` plugin. In Claude Code it installs as a plugin
(`claude plugin marketplace add <this repo>` → `claude plugin install
ub@ub-marketplace`) and the skills load themselves. Cursor, Codex and other
coding agents discover them under `.agents/skills/`, a copy of `skills/`
walked in `docs/guide/03-the-plugin.md` § 5; any other agent reads this file
as the router — the skills are plain markdown and work anywhere.

Short by design. This file is the whole always-loaded tier, and every routing
item in it is a **pointer** — a trigger word, then the document carrying the
body — or one of the rules that hold for every skill, which stay inline
because they bind before any pointer could fire. Three checks hold that shape:
`scripts/check-router-budget.mjs`, `scripts/check-negation-ratchet.mjs`,
`scripts/check-pointers.mjs`.

## Before the task

- **Vocabulary** — the words this repo fixes, and what each is bound to in the
  schema: `CONTEXT.md`. Definitions only, so it is cheap.
- **Routing** — `INDEX.md` maps task to document. Generated from the docs' own
  frontmatter, so it states the tree as it is.
- **Panel labels** — the word a field shows and the column behind it:
  `references/interface-schema-map.md`. Generated, with a reason on each of the
  twelve that diverge.
- **Running it** — the local stack, and the guard set to run before pushing:
  `SETUP.md` § Before you push.

## Skill routing

| Invocation / intent | Read and follow |
| --- | --- |
| `ub:map` — create, import, translate, present or evolve a service blueprint; a directory holding `blueprint-workspace.json` or a `blueprint/` folder | `skills/map/SKILL.md` |
| `ub:slice` — cut a stakeholder view (actor journey, moment, lane, cell brief) out of an existing blueprint | `skills/slice/SKILL.md` |
| `ub:audit` — run the consistency-check roster, then record and triage findings | `skills/audit/SKILL.md` |
| `ub:whatif` — trace a hypothetical change, promoting only on acceptance | `skills/whatif/SKILL.md` |

## Rules that hold for every skill

- A skill's `SKILL.md` is the contract: its ⚠ hard rules bind, and entry-state
  detection runs FIRST, always.
- `references/`, `agents/` and `scripts/` paths inside a skill resolve against
  this repo root, or against a workspace clone's own copies. They are a
  published interface: a deployment imports them by fixed path from a pinned
  tag, so moving one is a version bump plus a matching consumer change —
  `docs/adr/0004-reference-paths-are-a-published-interface.md`.
- Sub-agent dispatch (auditor, impact-tracer, document-reader,
  blueprint-reviewer, render-checker) runs in a fresh context, which is what
  keeps a review or an audit blind. Where a runtime offers no sub-agent
  primitive, run the prompt in `agents/` yourself in a fresh context and
  return only its structured output.
- Validation is deterministic: `scripts/validate_ir.py` exit 0 gates every
  import, and that exit code is the whole of the verdict.
- Secrets live in a gitignored `.env` and nowhere else — never a tracked file.
  `hooks/secret_guard.py` enforces that automatically in Claude Code alone, so
  enforce it yourself in any other runtime.

## The repo around the skills

- **Editing** anything under `skills/` or `references/` means running
  `npm run sync:skills` afterwards: it refreshes `src/lib/agent/skill/`, the
  vendored copy the app bundles, and `.agents/skills/`, the `SKILL.md` mirror
  other coding agents discover; `npm test` fails on drift in either.
- **Workspaces** scaffolded from here carry their own `skills/`, `references/`,
  `agents/` and `scripts/`, and the routing above resolves against the
  workspace root. Workspace version = template version; the upgrade recipe is
  `references/customization.md`.
- **Template app** — this repo also ships the blueprint app under `src/` and
  its eval harness (`scripts/agent-harness/`, `evals/`); what lives where is
  `docs/overview.md`.

## Agent skills

Config the `mattpocock-skills` engineering skills read. Open the file a skill
names when it asks for it, rather than preloading.

- **Issues** are GitHub Issues; the repository and the workflow are
  `docs/agents/issue-tracker.md`.
- **Labels** are the canonical triage roles and the tracker strings they map
  to: `docs/agents/triage-labels.md`.
- **Domain** docs are single-context — the layout and the consumer rules are
  `docs/agents/domain.md`.
