---
name: map
description: Creates, imports, translates, presents, and evolves service blueprints end-to-end. Use whenever the user mentions a service blueprint, journey map, customer journey, user journey documentation, service design, frontstage/backstage, swimlane service diagram, Shostack blueprint, or asks to "map how our service works", "map how customers actually experience X", document a service process, compare a designed process against reality, import a FigJam/Figma/Miro/spreadsheet blueprint into an app or database (e.g. "get our FigJam service map into Supabase"), turn service docs or discovery research into a blueprint, or update/redeploy an existing blueprint workspace. Also use when a directory contains blueprint-workspace.json or a blueprint/ IR directory. For checking an already-imported blueprint for inconsistencies use ub:audit; for tracing a hypothetical change before committing to it use ub:whatif.
---

# Service Blueprinting

Takes an org from scattered service documentation (or nothing at all) to a
**deployed, evolving service blueprint**: ingest docs, co-create from
conversation, translate foreign blueprints, review with hash-bound sign-off,
import via a backend adapter (no-DB fallback or Supabase), present with the
bundled React template, and update in place. A blueprint touched once is a
failure; touched monthly is the product.

All paths below are relative to the plugin root — Claude Code's
`${CLAUDE_PLUGIN_ROOT}`; anywhere else, the repository or workspace root:
this skill's own materials live under `skills/map/references/`, while the
shared core (`references/`, `scripts/`, `agents/`, `assets/`) sits at the
root because every skill uses it. A scaffolded workspace carries the same
files in its template clone.

## The workspace

Everything revolves around one canonical artifact and one state file, both
git-tracked in the org's **workspace** (a clone of this template):

- `blueprint/*.json` — the **IR**: human-editable JSON mirroring the data
  model, validated by `references/ir-schema.json`. JSON is the supported
  authoring format (the scripts are stdlib-only; `.yaml`/`.yml` is read only
  if PyYAML happens to be installed). Text fields are locale maps
  (`{en: …, zh: …}`); every entity has a stable key that UUIDs derive from,
  so re-imports are idempotent.
- `blueprint-workspace.json` — per-scenario status + sign-off hash,
  per-locale targets, schema_version. Spec: `skills/map/references/workspace-state.md`.

Pipeline: `sources → IR → validate → review/sign-off → import (adapter) →
build check → deploy`, then the update loop re-enters at ingest or import.

## Entry-state detection (do this first)

Inspect the target directory before doing anything: does
`blueprint-workspace.json` exist? A `blueprint/` dir? A template clone? What
do the statuses say? (The SessionStart hook summarizes this when present.)
Then route:

| Entry state | Route | Read first |
| --- | --- | --- |
| Nothing — no docs, no workspace | Scaffold workspace (confirm directory!), co-create | `skills/map/references/cocreate-playbook.md` |
| Prose/service docs exist | Scaffold, then ingest | `skills/map/references/ingest-playbook.md` |
| Foreign structured blueprint (FigJam/xlsx/Shostack/Miro export) | Scaffold, then translate via crosswalk | `skills/map/references/translate-playbook.md` |
| Existing template clone, no IR yet | Ask: ingest or co-create | playbook per answer |
| Stale clone (schema_version mismatch vs plugin/template) | Upgrade recipe before any content work | `references/customization.md` |
| Mid-pipeline (workspace state shows drafted/unreviewed scenarios) | Resume at the first unmet exit condition | `skills/map/references/review-import-playbook.md` |
| Deployed, needs update | Delta edits/docs → IR → re-sign-off → re-import → redeploy | playbook for the delta + `skills/map/references/review-import-playbook.md`, `skills/map/references/deploy-notes.md` |
| Inherited workspace (state file present, unknown provenance) | Read state + `HANDOFF.md`, verify sign-off hash, resume | `skills/map/references/workspace-state.md` |

**Playbook gating**: before executing a phase, READ its playbook — do not
improvise the phase from memory. Before ingesting, read
`skills/map/references/ingest-playbook.md`; before co-creating,
`skills/map/references/cocreate-playbook.md`; before translating,
`skills/map/references/translate-playbook.md`; before reviewing or importing,
`skills/map/references/review-import-playbook.md`. The playbooks carry the branch
logic and gates this skill's correctness depends on.

Decline early what this isn't for: org charts, gantt charts, non-journey
diagrams, real-time multi-user editing — point elsewhere rather than bend
the model.

## Hard rules

Everything in this skill is guidance you may adapt to the org — **except
these, which are where the system actually breaks**:

- ⚠ **REQUIRED — validate before import.** Run `scripts/validate_ir.py` and
  require exit 0 before any adapter runs. It catches what the DB trigger
  would abort mid-import (cells without path_steps, cross-path dependencies,
  duplicate columns, a lane role outside the closed eight).
- ⚠ **REQUIRED — never import unsigned IR.** The sign-off content hash in
  `blueprint-workspace.json` must match the current IR file; on mismatch,
  refuse and re-enter review. Never record the hash without explicit user
  approval of the previewed content.
- ⚠ **REQUIRED — never fabricate a blueprint from system-only docs.**
  Manuals and feature inventories describe the system, not the journey.
  Detect this and pivot to co-creation with the docs as reference material
  (the ingest playbook's critical branch). Plausible-but-invented journeys
  presented as parsed truth are the worst failure mode.
- ⚠ **REQUIRED — secrets.** Never write secrets to committable files. Anon
  key: only in a verified-gitignored `.env`. Service-role key: never on
  disk, never through chat (a pre-write hook also enforces this).
- ⚠ **REQUIRED — confirm the target directory before writing anything**
  (scaffolding, IR files, generated artifacts), and the import target
  (project ref / output paths) before any import.
- ⚠ **REQUIRED — backend choice is the user's.** Present the no-DB fallback
  and live-DB modes as co-equal options and ASK. Never default-assume
  Supabase. (Live-DB requires Supabase or a PostgREST-compatible read API;
  the fallback runs anywhere — `references/adapter-contract.md`.)

## Deterministic exit conditions

Every phase ends at a quantitative stop condition — never "looks done".
Check them against `blueprint-workspace.json`, which is also what makes
long unattended runs ("all 6 scenarios signed off") verifiable:

| Phase loop | Exit condition |
| --- | --- |
| Ingest / co-create / translate a scenario | `scripts/validate_ir.py` exit 0 + scenario marked `drafted` in workspace state |
| Review | `blueprint-reviewer` findings resolved + sign-off hash recorded |
| Import | Transaction committed + read-back verification counts match the IR |
| Present | `tsc --noEmit` + `vite build` exit 0 + `render-checker` confirms every scenario renders |

## Agents

- `document-reader` — sources → structure; three modes (corpus survey /
  deep read with provenance / foreign-blueprint extraction). Fan out in
  parallel; pilot on a few docs before a whole corpus.
- `blueprint-reviewer` — fresh-context adversarial IR review before
  sign-off; a context that never saw the parsing catches what the drafting
  context is anchored on.
- `render-checker` — walks every scenario × view in the running app after
  import/deploy; screenshots + console-error report.

Per-scenario locale translation fans out to generic subagents — no bespoke
definition needed.

## References

| Read when | File |
| --- | --- |
| Executing a phase | `skills/map/references/ingest-playbook.md` / `cocreate-playbook.md` / `translate-playbook.md` / `review-import-playbook.md` |
| Running the co-creation conversation | `skills/map/references/elicitation-protocol.md` (question script + right-sizing branches) |
| Writing or checking IR structure | `references/ir-schema.json`; model background in `references/data-model.md` |
| Assigning swimlane roles / divider lines | `references/lane-roles.md` |
| Drafting multiple phases consistently (customer spine per phase, shared actor labels) | `references/lane-vocabulary.md` |
| Building a translation mapping | `skills/map/references/crosswalk-schema.json` |
| Anything touching an import target | `references/adapter-contract.md` |
| Reading/writing workspace state or sign-off | `skills/map/references/workspace-state.md` |
| Before anything goes public; deploy gotchas | `skills/map/references/deploy-notes.md` (⚠ public-exposure warning lives here) |
| Theming, lane roles, portfolio/client conventions, template upgrades | `references/customization.md` |
| Generating the workspace handoff doc | `assets/HANDOFF.md.template` |

Correctness-critical steps (validation, seed-SQL/fallback generation,
UUIDv5 derivation) live in `scripts/` — execute them, never improvise their
logic in-context.
