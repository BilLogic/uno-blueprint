---
summary: For v0, Uno's skills, tools, schema and canvas stay in the template on next/owner-agent; each pilot business has its own Supabase project and clone, and a separate product repository waits for business-specific requirements.
---

# 32. The owner agent stays in the template for v0

**Status** Accepted — 2026-10-19.
**Context** [The repository decision](https://github.com/BilLogic/uno-blueprint/issues/1152#issuecomment-6269458926),
[ADR 0021](./0021-the-template-owns-the-agent.md).

## Context

Uno's skills, tools, schema and canvas form one application. The owner-agent
work needs a place to develop and prove that application while the released
template continues to serve its existing users.

## Decision

For v0, everything stays in the template, following ADR 0021. Development
lands on `next/owner-agent`; the released template stays untouched until the
concept is proven. Uno serves a business of any size.

Each pilot business has its own Supabase project and a clone. A separate
product repository is deferred until a business-specific requirement appears.

## Consequences

The template keeps one canonical agent and application. Pilot data and project
configuration belong to each deployment. Moving to a product repository needs
a concrete business-specific requirement; starting a pilot alone is not that
requirement.
