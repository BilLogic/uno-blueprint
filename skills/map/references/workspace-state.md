# Workspace State: blueprint-workspace.json

The single cross-phase coupling point. Lives at the **workspace root**
(the template clone the org works in), git-tracked, next to the `blueprint/`
IR directory. Enables resume, per-scenario progress, sign-off integrity,
idempotent re-import, and the update loop. The SessionStart hook reads it to
inject a status summary; every phase checks its preconditions against it.

## Contents

- Shape
- Fields
- Service notes

## Shape

```json
{
  "schema_version": "2026.08.26",
  "ir_path": "blueprint/blueprint.json",
  "locales": ["en", "zh"],
  "scenarios": {
    "asset-repair": {
      "status": "signed_off",
      "drafted_at": "2026-07-16T10:12:00Z",
      "notes": "reviewer findings 1-4 resolved",
      "content_hash": "sha256:6c7c…",
      "signed_at": "2026-07-16T11:03:00Z",
      "signed_by": "bill"
    },
    "energy-audit": { "status": "drafted" }
  },
  "targets": {
    "en": {
      "mode": "fallback",
      "last_import": { "content_hash": "sha256:9f2c…", "imported_at": "2026-07-16T11:10:00Z" },
      "deploy_url": "https://acme-blueprint-en.netlify.app"
    },
    "zh": {
      "mode": "supabase",
      "project_ref": "abcdefghijklmnop",
      "last_import": null,
      "deploy_url": null
    }
  }
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `schema_version` | Template schema version of the workspace clone. Import compat-checks the IR's `schema_version` against it; mismatch routes to the upgrade recipe in `references/customization.md` |
| `ir_path` | Workspace-relative path to the IR JSON |
| `locales` | Authored locales; one target per locale |
| `scenarios` | **Per-scenario status map**, keyed by IR scenario key — partial completion is a promise ("2 of 6 now, more later"). Each signed scenario carries its own `content_hash` + `signed_at`/`signed_by` — the hash-bound gate (below) |
| `targets` | Per-locale import target + deploy record |

### Scenario status values

`pending → drafted → reviewed → signed_off → imported`

- `drafted`: IR content exists and `validate_ir.py` exits 0.
- `reviewed`: `blueprint-reviewer` findings resolved.
- `signed_off`: the scenario's stored `content_hash` matches its current
  subtree hash from `scripts/compute_signoff_hash.py`.
- `imported`: read-back verification passed on every locale's target.

Statuses give goal-based loops verifiable criteria ("all 6 scenarios
signed off") — update them the moment a phase's exit condition is met,
never speculatively.

### Sign-off (⚠ REQUIRED semantics)

Sign-off binds **per scenario**, not per file. When the user explicitly
approves a previewed scenario, record that scenario's
`content_hash` (from `scripts/compute_signoff_hash.py <ir> --scenario <key>`)
plus `signed_at`/`signed_by` on its `scenarios` entry, and set its status to
`signed_off`. The hash is a canonical SHA-256 of that scenario's subtree (all
locales inline), so it is stable across machines and re-serializations.

Import must recompute each scenario's hash and **refuse on mismatch** for that
scenario — a hand-edit after approval de-signs only the scenario it touched and
re-gates that scenario's review. Because the hash is per-scenario, appending a
new phase/scenario to the IR leaves every previously signed scenario's hash
unchanged (they stay `signed_off`). Record a hash only on the user's explicit
approval; that approval is the gate.

A template schema bump renames fields **inside** a scenario subtree, so every
recorded hash would stop matching. `scripts/migrate_ir.py <ir> --workspace
blueprint-workspace.json --write` re-anchors each signed scenario's
`content_hash` onto its migrated subtree and keeps `signed_at`/`signed_by` —
sound because a migration step renames field names only. A hash matching
neither side was already stale and is reported, not moved. See
`references/customization.md` § Sign-off across a bump.

The gate is the per-scenario `content_hash`; a top-level `sign_off` object
(whole-IR hash), where one exists, is an optional convenience record.

### Targets

Per locale: `mode` (`fallback` | `supabase`), `project_ref` (Supabase only),
`last_import` (`content_hash` + timestamp of the last verified import — the
baseline for the pre-import read-back diff), `deploy_url` (where this
locale's site lives, once deployed).

## Service notes

- Create the file when scaffolding the workspace, before any IR is written.
- Two authors collaborate via normal git branching; sign-off is per-branch.
- An inherited workspace (state file present, unknown provenance) is read,
  hash-verified, and resumed — full consistency audit is v2.
- `HANDOFF.md` (generated from `assets/HANDOFF.md.template`) is the
  human-readable companion to this machine-readable state.
