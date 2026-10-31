---
summary: What earns an ADR here, the numbering and template, the current set, and the mapping from the deployment records that moved in.
---

# Decision records

An ADR here records a choice that is **surprising without context** or **hard
to reverse** — the two together, usually. Not every decision: most of what
this codebase does is ordinary and belongs in the files it lives in, which
describe rather than justify.

The test is a future reader's question. If someone six months from now will
look at the code and think *"that is the wrong way round, I'll fix it"* — and
be wrong — the reasoning owes them a record. If they would simply nod, it
does not.

## Shape

`NNNN-a-sentence-in-the-imperative-or-the-present.md`, numbered in the order
they were accepted, never renumbered. Frontmatter carries a `summary` (which
is what the generated index shows). The body states the decision, then why,
then a **Consequences** section that names what the decision costs and —
where there is one — the plausible "fix" that would undo it.

A superseded record keeps its number and its file, and says what replaced
it. A deleted ADR is a decision nobody can find the reasoning for.

After #551, a number that could be read from
[BilLogic/plus-uno-blueprint](https://github.com/BilLogic/plus-uno-blueprint)
is written with the repository as well as the number. The two folders do not
share a sequence: this folder's 0013 is TypeScript owning layout numbers;
that repository's 0013 is the import decision, which lives here as 0020.

## The set

| # | Decision |
|---|---|
| [0001](0001-two-contract-tiers-and-a-frozen-identifier-layer.md) | Two contract tiers, and a frozen identifier layer |
| [0002](0002-plugin-contract-folder-names.md) | Plugin-contract folder names stay as they are |
| [0003](0003-a-service-owns-its-journey-and-shares-the-catalog.md) | A service owns its journey and shares the catalog |
| [0004](0004-reference-paths-are-a-published-interface.md) | Reference paths are a published interface |
| [0005](0005-cross-surface-state-is-a-module-store.md) | Cross-surface state is a module store, not context |
| [0006](0006-one-token-model-is-the-single-style-seam.md) | One token model is the single seam for style enforcement |
| [0007](0007-the-canvas-and-the-shell-run-on-separate-clocks.md) | The canvas and the shell run on separate clocks |
| [0008](0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md) | A primitive is a hue; a semantic token is a job |
| [0009](0009-the-queue-is-issues-and-a-durable-decision-is-an-adr.md) | The queue is issues; a durable decision is an ADR |
| [0010](0010-open-views-stay-mounted.md) | Open views stay mounted |
| [0011](0011-one-question-a-surface-may-ask.md) | One question a surface may ask |
| [0012](0012-a-rung-owns-size-and-leading.md) | A rung owns size and leading |
| [0013](0013-typescript-owns-layout-numbers.md) | TypeScript owns every layout number; CSS receives them |
| [0014](0014-vendored-primitives-stay-pristine.md) | Vendored primitives stay pristine |
| [0015](0015-the-board-is-always-fully-mounted.md) | The board is always fully mounted |
| [0016](0016-reads-never-refetch-on-their-own.md) | Reads never refetch on their own |
| [0017](0017-large-component-splits-wait-for-an-end-to-end-round.md) | Large component splits wait for an end-to-end round |
| [0018](0018-featured-is-one-column-two-verbs.md) | Featured is one column, two verbs |
| [0019](0019-the-deployment-is-a-deployment-of-the-template.md) | The deployment is a deployment of the template, not a fork of it |
| [0020](0020-the-deployment-imports-the-template.md) | The deployment imports the template, and never edits it |
| [0021](0021-the-template-owns-the-agent.md) | The template owns the agent; a deployment configures it like the UI |
| [0022](0022-the-deployment-overlays-the-package-per-path.md) | The deployment overlays the package per path, and a residents list is the gate |
| [0023](0023-a-document-a-deployment-resolves-is-a-published-path.md) | A document a deployment resolves by name is a published path, wherever it lives |
| [0024](0024-an-installations-offline-board-is-a-value-on-a-tree.md) | An installation's offline board is a value on a tree, not a store |
| [0025](0025-brand-derives-from-primary-with-one-dial-per-channel.md) | Brand derives from primary, with one dial per channel — superseding the brand mechanism of [0008](0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md) |
| [0026](0026-a-skill-is-invoked-by-its-official-name.md) | A skill is invoked by its official name; its alias only finds it |
| [0027](0027-a-skill-token-lives-in-the-prose.md) | A skill token lives in the prose, and the text is the only record |
| [0028](0028-a-jump-is-awaited-through-one-module.md) | A jump is awaited through one module, and answers in one jump verdict |
| [0029](0029-the-script-policy-stays-strict-and-jitless-makes-it-free.md) | The script policy stays strict, and `jitless` makes that free |
| [0030](0030-the-impact-tracer-walks-either-way.md) | The impact tracer walks either way |
| [0031](0031-a-description-is-always-loaded-and-budgeted.md) | A description is always loaded, and is budgeted like the router |
| [0032](0032-the-owner-agent-stays-in-the-template-for-v0.md) | The owner agent stays in the template for v0 |
| [0033](0033-a-deployment-may-supply-optional-host-operations.md) | A deployment may supply optional host operations |
| [0034](0034-the-server-validator-is-guarded-by-python-parity.md) | The server validator is guarded by Python parity |

## Moved here from BilLogic/plus-uno-blueprint (#551)

Nine records moved, renumbered after 0012 (reserved for the type system).
Companion BilLogic/plus-uno-blueprint#617 turns the deployment copies into
pointers and needs this mapping:

| BilLogic/plus-uno-blueprint | This folder |
|---|---|
| 0002 | [0013](0013-typescript-owns-layout-numbers.md) |
| 0003 | [0014](0014-vendored-primitives-stay-pristine.md) |
| 0004 | [0015](0015-the-board-is-always-fully-mounted.md) |
| 0006 | [0016](0016-reads-never-refetch-on-their-own.md) |
| 0008 | [0017](0017-large-component-splits-wait-for-an-end-to-end-round.md) |
| 0011 | [0018](0018-featured-is-one-column-two-verbs.md) |
| 0012 | [0019](0019-the-deployment-is-a-deployment-of-the-template.md) |
| 0013 | [0020](0020-the-deployment-imports-the-template.md) |
| 0015 | [0021](0021-the-template-owns-the-agent.md) |

Five pairs were already mirrored. Where they disagreed, the schema or the
code in this tree decided:

| BilLogic/plus-uno-blueprint | This folder | Resolution |
|---|---|---|
| 0001 | [0006](0006-one-token-model-is-the-single-style-seam.md) | This copy stands. The compiled artifact is not in the model (`tokenModel.ts`). |
| 0005 | [0005](0005-cross-surface-state-is-a-module-store.md) | Union of instance lists against the tree: `canvasModeContext.ts` and `canvasChromeResize.ts` added. |
| 0010 | [0007](0007-the-canvas-and-the-shell-run-on-separate-clocks.md) | This copy stands. It already carried the supersession by [0010](0010-open-views-stay-mounted.md). |
| 0014 | [0003](0003-a-service-owns-its-journey-and-shares-the-catalog.md) | This copy gained slice on the journey boundary (`slices.service_id` is `NOT NULL`). |
| 0016 | [0009](0009-the-queue-is-issues-and-a-durable-decision-is-an-adr.md) | This copy stands. This tree never held the folders that copy retired. |

Two records stay in the deployment alone: its advisor warnings, and its
migration history.
