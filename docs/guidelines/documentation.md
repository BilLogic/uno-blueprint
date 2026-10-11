---
summary: The documentation grammar this repo follows — five root files each answering one question, docs/ for authored protocol, class-named folders, overview.md authored and index.md generated, a summary in every doc's frontmatter, and the one exception the plugin contract holds.
---

# Writing documentation here

**For** anyone adding or moving a document.
**Answers** where does this go, and what has to be in it?

## 1. Five root files, one question each

| File | The question it answers |
| --- | --- |
| `README.md` | What is this, and why would I want it? |
| `CONTEXT.md` | What does this word mean? |
| `SETUP.md` | How do I get it running? |
| `INDEX.md` | Where is the thing I need? *(generated)* |
| `AGENTS.md` | I am an agent — what do I read, and what am I not allowed to do? |

Nothing else lands at the root. A file that wants to is answering one of these
five questions, and belongs inside the one it answers.

## 2. `docs/` holds authored protocol

Folders are named for the class of thing inside them.

| Folder | Holds |
| --- | --- |
| `adr/` | Decisions, numbered, with the context that forced them. Never edited after acceptance — a decision that changed gets a new ADR that supersedes it. |
| `agents/` | Repository-specific configuration consumed by engineering skills. |
| `guide/` | The numbered narrative, for a person reading start to finish. |
| `guidelines/` | How we work: this file, and how to propose a change. `composition/` is the one exception inside it — one document per assembled surface, each claiming the files it documents (`docs/guidelines/composition/overview.md`). |
| `engineering/` | Procedure for whoever runs the repository. |
| `connectors/` | `backend-contract.md`, what any store answers to serve the app live; and `<name>/`, everything about one external system this package talks to. |
| `assets/` | Every figure the README and the guides use. |

`overview.md` is authored and says what a tree holds. `index.md` is generated
and lists what is in it. They are never the same file, and neither is ever
edited by hand into the other's job.

**The guide links into the protocol; it does not restate it.** A rule has one
home. When the guide needs a rule, it names the file the rule lives in.
Two copies of a rule is one rule and one lie, and the guide is where the lie
usually ends up, because it reads well and nobody diffs prose.

## 3. Every doc carries a summary

Every `.md` under `docs/` opens with frontmatter carrying a `summary:` — one
sentence, on one line, saying what the document answers.

```markdown
---
summary: How a release is cut — changesets bump package.json, plugin.json and the CHANGELOG derive from it, and every release ends in an annotated tag.
---
```

A composition document carries one key more — `claims:`, the files it
documents — and nothing else. Both are held by a check: the summary by
`npm run check:docs-index`, the claims by `npm run check:harness`. Keys beyond
those two are not the grammar here, and were dropped when the composition
documents arrived: an unheld `sources:` or `last-reviewed:` is a second list of
the same kind of fact with no guard on it, which goes stale exactly as quietly
as a hand-maintained index does.

It is not decoration. `scripts/generate-docs-index.mjs` builds `INDEX.md` and
`docs/index.md` out of these lines, so the summary is what an agent reads when
deciding whether to open the file. A document without one **fails
`npm run check:docs-index`**, which names the file. Write the summary for
someone deciding whether this is the document they want, not as a title
restated.

## 4. The exceptions

`skills/`, `references/`, `agents/`, `hooks/` and `scripts/` do not follow any
of this. They are resolved by path at runtime through the plugin root, so
their names are a published interface rather than an organising choice, and
`references/` in particular is normative protocol that stays at the root.
The reasoning is [ADR 2](../adr/0002-plugin-contract-folder-names.md); read it
before tidying them.

`guidelines/composition/` is the second, and the only folder under `docs/` that
is one. A deployment's claims check reads those documents out of the package it
installed, to learn which files the package already claims, so their folder and
their filenames are an address somebody else resolves — the same promise
`references/` makes, and the same cost to break. They are listed in
`CONSUMER_IMPORTS` and held by `npm run check:reference-paths`; moving or
renaming one is a release, not a tidy-up. Everything else about them is
ordinary: frontmatter, a summary, and §2's rule that a rule has one home.
