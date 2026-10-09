# Whatif Playbook

The whatif skill's operating manual. SKILL.md carries routes and hard
rules; this file carries the three operations and the promote handoff.

## Contents

- §1 The variant discipline
- §2 The three operations
- §3 Findings
- §3.1 Impact and effort
- §4 Accept → change request
- §5 Canvas note

## §1 The variant discipline

A whatif variant is **an IR file in the workspace, never a DB row**:
`whatif/<key>/variant-<scenario>.json`, a copy of the base IR with the
hypothetical applied. The database only ever holds reality plus findings
about it. Comparing variant vs base happens in local dev (side-by-side over the
local files); the deploy-safe artifact
is the **comparison markdown** (`whatif/<key>/comparison.md`), which cites
cell keys from both versions and quotes nothing.

Record at analysis time: the base sign-off hashes, **per scenario**
(workspace-state.md is canonical: sign-off binds per scenario, not per
file). For every scenario in scope, embed its recorded `content_hash`
(from the workspace's `scenarios` entry; recompute with
`scripts/compute_signoff_hash.py <ir> --scenario <key>` when checking)
keyed by scenario key in `base_signoff_hashes`. Legacy workspaces that
predate per-scenario sign-off carry only a whole-file
`sign_off.content_hash` — embed that under `__file__` and flag the
legacy form in the report. Every artifact (findings, comparison doc,
change request) embeds them — that is what makes later promotion
refusable when the base moved.

The zero-verbatim-excerpts exit is a defined grep test: no run of ≥6
consecutive source words (≥8 consecutive CJK characters) from any
in-scope cell may appear in comparison.md.

No-DB route: when no database is reachable, findings rows land in the
workspace's `audit/findings-report.json` (the same row shape and dedupe
rules as audit-playbook §2–§3, `source=whatif`) — that file IS the ledger
on this route, and the findings exit condition is met by it.

## §2 The three operations

**replay** — "run scenario X as if CHANGE were true."
1. Copy base IR → variant; apply the change.
2. Dispatch `impact-tracer` (seed = changed cells) on the BASE export —
   the trace tells you which claims need re-examination. (An IR export
   carries both kinds since 2026.08.26; an export written before that
   carries only `leads_to` edges, and the tracer says so in its output.)
3. Walk the affected chain in the variant: which cells' content is now
   wrong, which dependencies dangle, which lanes gain/lose work.
4. `blueprint-reviewer` (whatif-claim mode) verifies every replay claim
   cites cells that exist in base or variant — unverified claims are cut,
   not hedged.
5. Findings (source=whatif) per broken assumption; comparison.md.

**restage** — "what if this moved frontstage/backstage?" (visibility-line
move). Same pipeline as replay, plus the two named judgements the
comparison MUST address:
- comprehension gain vs etiquette risk (what does the customer now see —
  and should they);
- the reassurance-touchpoint suggestion: when something moves backstage,
  name the EXISTING cell(s) where the customer's residual "is it
  happening?" anxiety must be answered (never invent a new one — that is
  a change-request diff entry, flagged for the human).

**prioritize** — "which 3–5 cells matter most right now?"
Score every cell in scope on three signals, then present the top 3–5 with
per-signal reasoning:
- evidence weight (rows attached; zero rows = assumption — flag it, since
  an assumption-heavy "priority" is really a research task);
- proposition expression (does the cell carry the value the business_models
  claim — value_props where present);
- backstage `enables` chain depth (impact-tracer, reversed: how much
  machinery makes this moment possible).
Quick-win warnings: cells that look cheap but sit on deep `enables` chains
get a "load-bearing" caveat.

## §3 Findings

Same table, `source = 'whatif'`, same fingerprint algorithm as audit
(check_key = `whatif-<operation>-<key>`), same dedupe/triage rules
(audit-playbook §2–§4). Whatif findings never supersede audit findings
and vice versa — fingerprints keep them disjoint by construction.

Every whatif finding carries a severity, an impact and an effort, exactly
as an audit finding does, and one missing either rating fails validation
the same way. The report orders them by the audit's priority groups
(audit-playbook §3.5).

## §3.1 Impact and effort

Rate both on every finding, from the anchors below. Impact is read off the
trace: how many cells the change reaches, which assumptions it breaks, and
where the displaced demand lands. Effort is how much the proposed change
itself takes to carry out — the change the human is weighing, not the
finding's own correction. Pick the level whose anchor the finding matches
most closely; between two, rate impact the lower and effort the higher —
a finding has to earn Do first.

| Level | Impact — the traced blast radius | Effort — what the proposed change takes |
| --- | --- | --- |
| low | The trace reaches one or two cells in one lane, breaks no assumption another cell relies on, and displaces no demand | Rewording or re-sequencing cells that already exist: no new cell, lane, step or touchpoint |
| medium | The trace crosses lanes within one scenario, or breaks one assumption a downstream cell relies on, and the displaced demand lands on an existing cell that can absorb it | New cells, or moving cells across the visibility line, within one scenario |
| high | The trace reaches the customer lane at a moment the customer acts on, crosses scenarios, or displaces demand onto a cell with no capacity for it or onto nothing the blueprint records | A new touchpoint, lane, path or step, or a change that spans scenarios or needs a team outside the blueprint |

## §4 Accept → change request

When the human accepts a whatif's recommendation:
1. Emit `changes/<key>.json` conforming to
   `skills/whatif/references/change-request-schema.json` — the diff (cell-key
   addressed), affected scenario keys, the base sign-off hashes captured
   at analysis time, and the finding fingerprints it supersedes.
2. Then STOP and tell the user to invoke ub:map (map-promote) — never
   chain into promotion in the same turn; the gap between accept and
   promote is a human gate. Map-promote's steps for reference:
   verify hashes → edit IR → de-sign notice → re-sign → re-import →
   `sweep_orphans.py` (planned — if the script is absent, skip the sweep
   and say so in the report) → auto-resolve the superseded whatif
   findings.
3. Whole-request promote only in v1 — no cherry-picking diff entries; a
   partial acceptance is a NEW, smaller whatif.

The staleness guard is absolute, and the comparison is TWO checks per
affected scenario, both against defined targets: (a) each embedded
`base_signoff_hashes[scenario_key]` must equal that scenario's RECORDED
`content_hash` in workspace state, and (b) the recorded hash must equal
a RECOMPUTED `compute_signoff_hash.py <ir> --scenario <key>`. A mismatch
in (a) = the scenario was re-signed since analysis → refuse, offer
re-trace. A mismatch in (b) = the scenario carries unsigned edits →
refuse with "re-sign first" (promoting onto a dirty base is promoting
onto an unreviewed one). Never compare against only the recorded value.
Legacy `__file__` entries get the same two checks against the whole-file
`sign_off.content_hash` and a whole-file recompute.

## §5 Canvas note

Inside the canvas agent whatif is fully live — the
`/ub:whatif` row of `references/canvas-adapter.md` is the ONLY canonical
canvas translation (conversational variant, direct promotion on
acceptance, optimistic-concurrency staleness). Read that row; nothing
here overrides it.
