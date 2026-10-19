---
summary: When a deployment holds more than one service, the journey entities (phase, scenario, path, step, lane, cell, slice) are a hard per-service boundary while the catalog of nouns a journey references — touchpoints and stakeholders both — is one deployment-level pool where the name is the identity and a service's membership is implicit in what its journey references, so a tool or actor is recorded once and reused across services without a palette to author or keep in sync.
---

# 3. A service owns its journey and shares the catalog

**Status** Accepted — 2026-09-04. Amended 2026-09-10 (#551): slices named as
a per-service boundary, matching `slices.service_id uuid NOT NULL` in
`supabase/generated/portable-core.schema.sql`. The deployment's copy
(BilLogic/plus-uno-blueprint ADR 0014) already had that wording; this
copy omitted it.
**Context** `supabase/migrations/21000125000000_an_entity_has_a_status_and_a_lane_names_its_actor.sql`,
which lands the first half; the deployment this template was generalised from
made the decision first and holds both halves.

## Context

A deployment can hold more than one service. That forces a domain question the
single-service model never had to answer: when there are two services, what is
each service's own, and what do they share?

The catalog holds two kinds of noun. **Touchpoints** — the tools, documents and
channels a moment happens through — are a registry this core already carries,
scoped `unique (service_id, name)`. **Stakeholders** — the actors whose work a
lane holds — arrive with the migration above. Both are reference data a journey
points at: a cell places a touchpoint, a lane picks a stakeholder. The question
is whether that reference data is a service's or the deployment's.

## Decision

**A service owns its journey; the catalog of nouns its journey references is the
deployment's.**

- The **journey** — phase, scenario, path, step, lane, cell, slice — is a
  **hard** boundary: mutually exclusive per service, never crossing. Two
  services' boards do not share a phase or a lane, and a slice stays within
  one service.
- The **catalog** — the nouns a journey points at — is **soft**: one
  deployment-level pool holding both touchpoints (the tools) and stakeholders
  (the actors). A cell references a shared touchpoint; a lane references a
  shared stakeholder; the references are per-service, the referents are the
  deployment's.

Two rules give the catalog its shape: the **name is the identity** (one pool,
unique by name across the deployment), and a service's **membership is
implicit** (a service "has" a catalog entry exactly when its journey references
it — there is no palette to author).

### Why the catalog holds actors too, and not just tools

The tools are obviously shareable — the same Zoom touches several of an org's
services. The open question was the actors: a stakeholder attaches to a lane,
and lanes are journey (hard), so it was tempting to leave stakeholders
per-service. Three things settle it the other way.

First, **coherence**: a touchpoint will carry a `stakeholder_id` — its owner. If
touchpoints were a deployment-level pool but stakeholders stayed per-service, a
shared touchpoint's owner would have to be *one* service's actor — which one?
The split is the incoherent option, not the safe one.

Second, **the model already reads this way**: a lane does not define its actor,
it **picks one from a shared cast**. The stakeholder registry is a pool of
reference data a lane selects from, exactly the shared-catalog shape. Making the
pool deployment-wide is what the picker already wants.

Third, **cost is symmetric**: a per-service `stakeholders` and a per-service
`touchpoints` would be structural twins — a registry with `unique (service_id,
name)`, referenced by a journey entity. Sharing an actor is the same reshape as
sharing a tool, not a larger one, so the choice is domain merit, not effort —
and the same actor ("the student") does recur across an org's services just as
the same tool does.

### Why the name is the identity

A touchpoint is minted by name — a cell's text names a tool and the catalog gets
a row. In one pool, a **deployment-unique name** is how a second service reuses
an entry: it names the same tool the same way and references the row that
already exists. If two services run *different* tools, they carry *different*
names — "Gmail" and "Outlook", not two rows both called "Email". Distinct nouns
take distinct names; an identical name means the identical thing.

The rejected alternative was independent identity — each service keeps its own
"Email" and any sharing is declared explicitly. That defeats the reason the
catalog exists (record a tool once, reference it everywhere) and puts the burden
of sharing on an authoring step instead of on the name.

### Why membership is implicit

A service "has" a catalog entry exactly when its journey references it — a
touchpoint when one of its cells places it, a stakeholder when one of its lanes
picks it. There is **no `service_touchpoints` / `service_stakeholders` link
table**, no authored palette.

- Touchpoints are **created inline** — minted from a cell's text by the sync
  function, with no "add a tool to this service" gesture anywhere. Implicit is
  the only model coherent with how a touchpoint is born.
- Stakeholders are **picked from the pool** by a lane, which is implicit by
  definition — a curated per-service cast list would be a second thing to keep
  in step with what the lanes actually use.
- Implicit is **divergence-free**. An explicit palette can drift from reality —
  an entry "in the palette" no journey uses, or the reverse. Implicit makes a
  service's set exactly its usage.

The one thing implicit gives up is picker scoping: authoring a service shows the
whole deployment catalog rather than a curated subset. At the expected scale
(the common case is a single service; multi-service is a handful) that is fine,
and "this service's already-used entries first" is a read-side sort, not a
table. An explicit palette stays a **clean additive step** for later — it can be
added over the shared catalog without reshaping it — so implicit now is the
deferral, not a corner.

## Consequences

- **`stakeholders` is born deployment-level.** It never carries a `service_id`;
  `stakeholders_name_key` is `unique (name)` across the whole deployment. A lane
  names its actor by a nullable `lanes.stakeholder_id`; a structural lane names
  nobody.
- **`touchpoints` made the same move in `21000131000000`**, dropping its
  `service_id`, re-uniquing on `(name)`, and folding two services' rows of one
  name into one on the way. That migration carries the argument, the touchpoint
  sync mints `on conflict (name)` after it, and `CONTEXT.md`'s touchpoint entry
  reversed with it.
- **`touchpoints.stakeholder_id` was waiting for that move.** A link from a
  service-scoped tool to a deployment-scoped actor is the incoherence the first
  argument above names; both ends are the deployment's from `21000131000000`
  onwards, so the column is free to be added.
- The **registry becomes a deployment-level library**: a catalog can hold a tool
  or actor no current journey uses, which at deployment scope is a feature (a
  shelf of the org's tools), not an accidental accumulation.
- An agent's per-service search scope derives a service's catalog from its
  journey's references, since membership is implicit — a join, not a membership
  lookup.

## Still open

- **An explicit per-service palette** is deferred by design — additive over the
  shared catalog if a large deployment ever finds the picker noisy, and recorded
  here only so a future reader knows it was a deliberate deferral, not an
  oversight.
- **The name-collision authoring nicety** — guiding an author who names a new
  tool with a name the deployment already uses for a different one — is UX, not
  model, and needs no record until it is built.

## How a shared file cites this

`src/hooks/useStakeholders.ts` is shared byte-for-byte with the deployment
this template is imported into, and each repository numbers its own ADRs — the
same decision is a different number on each side. A shared file therefore
**names the decision and never numbers it**: "the decision that a service owns
its journey and shares the catalog", not an ADR number that is right in at most
one of the two copies. The rule holds for every ADR citation that reaches a
shared file, not only this one.
