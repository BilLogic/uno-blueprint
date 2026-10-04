---
name: whatif
description: Traces the consequences of a hypothetical change to an existing service blueprint before anyone commits to it — replays a scenario as if the change were made, restages a moment across the visibility line (frontstage/backstage), or prioritizes which cells matter most right now. Use when the user asks "what if we removed/automated/moved X", "what breaks if…", "what's the impact of…", "should this be customer-visible", "which cells should we focus on", or wants an accepted analysis promoted into an actual blueprint change. Requires an imported blueprint — for building one use ub:map; for finding present-tense inconsistencies use ub:audit.
---

# Blueprint Whatif

The audit asks "what is wrong now"; whatif asks **"what would happen if"**.
It builds a hypothetical variant, walks the consequences through the
dependency graph, and reports what breaks, what improves, and where the
displaced work lands — without the database ever learning about a change
nobody has agreed to make.

All paths are relative to the plugin root, which is the repository or
workspace root (Claude Code names it `${CLAUDE_PLUGIN_ROOT}`): this
skill's own materials (playbook, change-request schema) live under
`skills/whatif/`, the shared core under `references/`, `scripts/`, and
`agents/`; a scaffolded workspace carries the same files
(workspaces scaffolded before this skill shipped may lack them — fall back
to the plugin root, and suggest the upgrade recipe in
`references/customization.md`).

## Entry-state detection (do this first)

| Entry state | Route |
| --- | --- |
| No workspace / no IR | Stop — nothing to hypothesize against; `ub:map` first |
| Imported blueprint, hypothetical named | Pick the operation: replay / restage / prioritize (playbook §2) |
| "What if we removed/changed/automated X" | **replay** |
| "Should X be customer-visible / hidden?" | **restage** |
| "Where should we focus / what matters most?" | **prioritize** |
| Whatif exists, user accepts the recommendation | **Accept route** — emit a change request (playbook §4), then STOP and tell the user to invoke ub:map for map-promote. Never edit the IR from here, never chain into promotion in the same turn |
| Whatif exists, base blueprint has changed since | Stale — the embedded sign-off hashes say so. Offer re-trace; never promote stale analysis |
| "Dismiss / resolve whatif finding X" | Triage route — identical to audit (audit-playbook §4) |

**Playbook gating**: read `skills/whatif/references/whatif-playbook.md` before executing
any route. It carries the variant discipline, the three operations, and
the change-request handoff.

## Hard rules

- ⚠ **REQUIRED — whatif never writes cells or DB variants.** The variant
  is an IR file in the workspace (`whatif/<key>/`), full stop. The only DB
  rows whatif may write are `audit_findings` (source=whatif). The blueprint the
  team shares always describes reality.
- ⚠ **REQUIRED — analysis is not promotion.** Changing the actual
  blueprint happens ONLY via the change-request → map-promote handoff
  (playbook §4), which re-verifies the base sign-off hashes and refuses on
  drift. Whatif itself never edits the IR, however small the change.
- ⚠ **REQUIRED — capture base sign-off hashes at analysis time** and embed
  them in every artifact. An analysis that cannot prove which blueprint it
  analyzed cannot be promoted, only re-run.
- ⚠ **REQUIRED — claims are traced, then verified.** Consequence claims
  come from `impact-tracer` output plus the variant walk, and
  `blueprint-reviewer` (whatif-claim mode) checks every one cites cells
  that exist in base or variant before results reach the user. Unverified
  claims are cut, not hedged.
- ⚠ **REQUIRED — displaced demand lands on existing cells only.** Naming
  a destination the blueprint does not record is invention; if the
  analysis needs a new touchpoint, that is a change-request diff entry
  flagged for the human, not a fact.
- ⚠ **REQUIRED — findings discipline is the audit's.** Same fingerprint
  algorithm, same dedupe, same triage, same no-verbatim-excerpts rule
  (audit-playbook §2–§4).
- ⚠ **REQUIRED — confirm the import target** before writing findings;
  `references/adapter-contract.md` applies unchanged — wrong-project
  protection: findings written into someone else's database are pollution
  you cannot easily unwind.

## The pipeline

```
imported blueprint + a hypothetical
  → frame     (operation, scope, base sign-off hashes captured)
  → variant   (IR copy in whatif/<key>/ — replay/restage only)
  → trace     (impact-tracer: affected cells, strained assumptions,
               displaced demand; visited set + depth cap — cycles legal)
  → judge     (operation-specific reasoning, playbook §2)
  → verify    (blueprint-reviewer, whatif-claim mode — cut what fails)
  → record    (findings rows source=whatif; comparison.md, cites only)
  → [accept]  (change request → map-promote; staleness guard absolute)
```

## Deterministic exit conditions

| Phase | Exit condition |
| --- | --- |
| Variant | Variant IR passes `validate_ir.py` (a hypothetical still has to be a legal blueprint) |
| Trace | impact-tracer returned with `truncated: false`, or the truncation is reported in the results |
| Verify | Every surviving claim carries cell keys the reviewer confirmed exist |
| Record | Findings rows land deduped under one run_id; comparison.md contains zero verbatim excerpts (grep test) |
| Accept | `changes/<key>.json` validates against `change-request-schema.json`; embedded per-scenario hashes pass playbook §4's double check (recorded AND recomputed) — any mismatch refuses |
| Report | Printed checklist: operation, scope, findings count, artifact paths, promote status — never silent |

## Agents

- `impact-tracer` — the graph walk: affected cells, strained assumptions,
  displaced demand. Read-only, visited set, depth cap 8.
- `blueprint-reviewer` (whatif-claim mode) — adversarial pass over the
  claims before they surface; anything untraceable dies here.

## References

| Read when | File |
| --- | --- |
| Doing anything in this skill | `skills/whatif/references/whatif-playbook.md` |
| Emitting or validating a change request | `skills/whatif/references/change-request-schema.json` |
| Findings mechanics (shared with audit) | `references/audit-playbook.md` §2–§4 |
| Anything touching an import target | `references/adapter-contract.md` |
| Understanding the underlying tables | `references/data-model.md` |
| How the same whatif behaves on the app canvas | `references/canvas-adapter.md` |
