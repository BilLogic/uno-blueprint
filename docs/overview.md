---
summary: What lives under docs/ and what each folder is for — protocol that is always true, a queue that is deliberately not here, and where the normative rulebook sits instead.
---

# What is in `docs/`

**For** anyone looking for a document and not finding it.
**Answers** what is here, what is deliberately not, and where each is instead?

[`index.md`](./index.md) lists every document with its summary, and is
generated. This file says what the folders mean, and is authored.

## Protocol here, queue elsewhere

**Protocol — living, always true.** Everything below. If it is here, it
describes how the package behaves today, and a statement in it that is wrong
is a bug. There is no folder of superseded thinking to check a document
against: what a decision was and why is [`adr/`](./adr/), and what shipped is
the git history.

**The queue — not in this repository.** Work in flight is
[GitHub issues](https://github.com/BilLogic/uno-blueprint/issues),
so a contributor can see what is already being worked on without cloning
anything.

## The folders

| Folder | What is in it |
| --- | --- |
| [`adr/`](./adr/) | The decisions, numbered. The list and the mapping from records that moved in are [`adr/overview.md`](./adr/overview.md). |
| [`agents/`](./agents/) | Repository-specific configuration for engineering skills: issue tracker, triage labels, and domain-doc layout. Also the skeleton of a deployment's agent-facing schema account, filled by `npm run agent-account` when a database is connected and left unregistered otherwise. |
| [`guide/`](./guide/) | Four numbered parts, for a person reading start to finish: the model, using it, the plugin, operations. The guide links into the protocol rather than restating it. |
| [`guidelines/`](./guidelines/) | How we work — writing documentation, and proposing a change. |
| [`engineering/`](./engineering/) | Procedure for whoever runs the repository: cutting a release, and the guard set behind every red build. |
| [`connectors/`](./connectors/) | `backend-contract.md`, what any store answers to serve the app live, and one folder per external system this package talks to. Today that is `supabase/`, the reference recipe: the operated database, its row-level security, and the migration desync runbook. |
| [`assets/`](./assets/) | Every figure the README and the guides use. Authored here; the cover build copies what it needs. |
| [`erd.mmd`](./erd.mmd) | The attribute-level entity relationship diagram. |

## What is not here, and why

**The rulebook.** `references/` at the repository root is normative protocol
and by the grammar it would live under `docs/` — but skill text resolves
`${CLAUDE_PLUGIN_ROOT}/references/<name>.md` at runtime on other people's
machines, so its path is a published interface. Same for `skills/`, `agents/`,
`hooks/` and `scripts/`. That is
[ADR 2](./adr/0002-plugin-contract-folder-names.md), and it is a decision
rather than an oversight.

**The domain language.** `CONTEXT.md` at the root, because every reader needs
it and no folder owns it.
