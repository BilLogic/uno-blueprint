---
summary: This template owns the agent's canonical baseline — its loop, its tools, and a default doctrine — and a deployment tunes it through the typed DeploymentConfig the same way it tunes the UI, never by editing template code; the live instance, being the prototype that defines the product, contributes its agent into the canonical default rather than carrying a per-deployment override.
---

# 21. The template owns the agent, and a deployment configures it like the UI

**Status** Accepted — 2026-09-04. Moved into this repository from
BilLogic/plus-uno-blueprint ADR 0015 on 2026-09-10 (#551); the number
here is this repository's.
**Context** `src/lib/agent/`, `src/deploymentConfig.ts`,
[ADR 0020](./0020-the-deployment-imports-the-template.md)

## Context

[ADR 0020](./0020-the-deployment-imports-the-template.md) (BilLogic/plus-uno-blueprint
ADR 0013 at the time it was written) settled that this template exports a
mountable application — "root, routing, data layer, **agent**, auth wiring" —
and that the live instance mounts it through a typed `DeploymentConfig`. It
did not settle what a deployment may say to that agent. This is that record.
The agent is the template's, and a deployment reaches it only through the
config — but the agent is a **configurable** surface, the same as the UI,
because this template is meant to be published and run by deployments other
than the live instance it was generalised from. Five choices, each downstream
of the last.

1. **The agent is the template's, whole.** This template's `App` owns the
   canonical agent — the loop, the tool registry, and a **default doctrine**
   (the canvas adapter). A deployment ships no agent code. This template
   already has this agent today (`src/lib/agent/`), so the convergence is a
   reconcile, not a new build.

2. **A deployment configures its agent the way it configures its UI.** The
   agent's doctrine and config — which tools are enabled, guidance a
   deployment adds, the display words for a concept — are a **first-class
   part of `DeploymentConfig`**, peer to brand and content. A published
   deployment *tunes* its agent through typed, reviewable config; it does not
   fork it and it does not edit template code
   ([ADR 0020](./0020-the-deployment-imports-the-template.md)'s
   import-not-overlay stands). The agent is not a closed surface — it is a
   configured one.

3. **The canonical default is what the prototype defines.** The live instance
   is the **prototype** that defines the product, so its agent features — its
   tool surface, its canvas doctrine, its vocabulary — bake into this template
   as the **canonical default** every deployment starts from. That instance's
   `src/lib/agent/canvas-adapter.md` override is therefore not a deployment's
   per-instance config: it is the prototype authoring the default, and it only
   *reads* as a deployment override because that instance was the sole canvas
   app while the package still spoke to an IDE
   ([BilLogic/plus-uno-blueprint#115](https://github.com/BilLogic/plus-uno-blueprint/issues/115)).
   It folds into this template's canonical doctrine, and the live instance
   then runs on that default with **no agent-config delta of its own**. The
   override **file is deleted at the flip** because its content *became the
   default*, not because configuring an agent is forbidden.

4. **The tool surface is the generalized superset — available, and
   configurable.** The canonical tools are this template's concepts: the live
   instance's larger set (stakeholders, evidence, sessions) are this
   template's domain concepts ([CONTEXT.md](../../CONTEXT.md),
   [ADR 0003](./0003-a-service-owns-its-journey-and-shares-the-catalog.md),
   which was BilLogic/plus-uno-blueprint ADR 0014 when this record was
   written), so this template carries them for every deployment. A deployment
   enables or narrows them through config and its session/role model — never
   by omitting tools from a hand-written roster that drifts from the code,
   which is the failure
   [BilLogic/plus-uno-blueprint#115](https://github.com/BilLogic/plus-uno-blueprint/issues/115)
   was.

5. **The data model is canonical; its words travel with the config.**
   `cell_dependencies.kind` is `leads_to` / `enables` in every deployment's
   database — one canonical model. What the agent and the UI *call* it —
   display copy, prompt phrasing — is deployment-configurable, the same as
   any UI label. This template's internal names that still read *trigger*
   (`BlueprintCellTrigger`, `BlueprintTriggerArrows`, the adapter's
   `trigger-vs-needs` prose) are **unconverged naming**, inconsistent with
   the template's own enum, and are reconciled to the canonical word — the
   default the config starts from, not a per-deployment dialect baked into
   code.

## Consequences

**For the live instance, now:** no override and no agent-config delta — it
runs the canonical default it authored as the prototype. The two guards that
exist only to hold that prototype override honest against the package —
`scripts/check-write-surface.mjs` and the
[BilLogic/plus-uno-blueprint#319](https://github.com/BilLogic/plus-uno-blueprint/issues/319)
reconciled-files drift gate over the shared agent files — retire at the flip
([BilLogic/plus-uno-blueprint#333](https://github.com/BilLogic/plus-uno-blueprint/issues/333)),
because once that instance's doctrine *is* the canonical default there is
nothing left to hold honest.

**For a published template, later:** a deployment customizes its agent — its
doctrine additions, its enabled tools, its display words — through
`DeploymentConfig`, typed and reviewed like the rest of the config, exactly
as it customizes brand and content. The configurable seam is the config; the
code stays the template's.

**The line this draws:** baking a feature into the canonical default (what
the live instance, the prototype, does) and configuring it per deployment
(what a published deployment does) are two different acts on the same
surface. The prototype's agent arrives as canonical because it is defining
the product; a later deployment's arrives as config because it is adopting
one. What neither does is edit the template's agent code in place.
