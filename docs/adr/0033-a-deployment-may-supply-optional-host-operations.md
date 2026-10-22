---
summary: The portable core remains the minimum every deployment runs; a deployment may install optional named host operations with exact contracts, while the template owns their guarded client code so deployments do not fork the application.
---

# 33. A deployment may supply optional host operations

**Status** Accepted — 2026-10-22.

## Decision

The portable core stays the minimum every deployment runs. A deployment may
install optional host operations: named RPCs with an exact argument, result
and failure contract. The template ships their guarded client side, including
identity and expected-value checks, an inverse captured from the call, and a
required durable record. A missing operation or malformed receipt fails;
the client never claims success merely because the request returned.

The host owns authorization, database constraints and atomic recording of
these operations. The template's wrappers require a matching row identity
and durable change ID, and construct a known session inverse from the guarded
call rather than trust arbitrary JSON returned by the server. Backend
contracts live in [the backend contract](../connectors/backend-contract.md#optional-host-authoring-operations).

## Context

Ranked search is already supplied by a deployment through its configured
search RPC. Optional authoring operations extend that same boundary to
writes without making each deployment's capability a portable-core promise.
A deployment that has not installed an operation must be able to run the
core application without it.

[ADR 0020](0020-the-deployment-imports-the-template.md) keeps application code
in the template, imported by deployments. [ADR 0021](0021-the-template-owns-the-agent.md)
keeps the agent there too: a deployment configures it rather than forks it.
Placing guarded authoring wrappers downstream would reverse those decisions
as soon as a shared canvas or agent needed to call one.

## Consequences

The template carries client code with no in-template caller until the canvas
or agent uses it. That is an explicit cost of keeping the application shared,
not a claim that every host implements the optional operations.

Each operation's exact contract must stay in step with every deployment that
installs it. Hosts must prove their authorization, transaction, inverse and
read-back behavior; client fixture tests cannot establish those properties.
Changes to either side require coordination and a reviewable template upgrade.

The tempting undo is to move these wrappers into a deployment because it is
the only current caller. That means forking `src/` and recreating the drift
ADRs 0020 and 0021 prevent. Add an explicit host contract and keep its guarded
client in the template instead.
