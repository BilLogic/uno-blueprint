---
summary: For v0, everything stays in the template on next/owner-agent; pilots use their own Supabase projects and operator checkouts, deployments keep importing the template, and a product repository waits until something genuinely business-specific appears.
---

# 32. The owner agent stays in the template for v0

**Status** Accepted — 2026-10-19.
**Context** [The repository decision](https://github.com/BilLogic/uno-blueprint/issues/1152#issuecomment-6269458926),
[ADR 0020](./0020-the-deployment-imports-the-template.md),
[ADR 0021](./0021-the-template-owns-the-agent.md).

## Context

Uno serves a business of any size, so starting another pilot is not by itself
a reason to split the application. The owner-agent work needs a place to
develop and prove the concept while the released template continues to serve
its existing users.

## Decision

For v0, everything stays in the template, following ADR 0021. Development
lands on `next/owner-agent`; the released template stays untouched until the
concept is proven. A separate product repository is created only when
something genuinely business-specific appears.

Each pilot business has its own Supabase project plus a clone. The pilot clone
is an operator's working checkout of this repository, used to run the pilot
against that project's data. It is not source copied into a deployment
repository and does not license vendoring or editing shared application code
there. A deployment still imports the pinned template and supplies its config,
environment and database, as ADR 0020 requires; shared changes go upstream.

## Consequences

Keeping development on `next/owner-agent` costs reconciliation with `main`
while the branches differ; promotion must review and test that accumulated
difference. Operator checkouts can also drift, so pilots must update from the
canonical repository rather than letting local shared-code edits become forks.
Pilot data and project configuration stay with each pilot's own project and
environment.

The tempting undo is to fork a product repository as soon as a pilot starts.
That would create another shared-code copy before there is a business-specific
requirement to justify it, so starting a pilot alone does not change this
decision.
