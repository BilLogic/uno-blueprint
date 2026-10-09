# Audit Playbook

The audit skill's operating manual. The SKILL.md carries the routes and the
hard rules; this file carries the mechanics.

## Contents

- §1 Run semantics
- §1.5 Roster & skips
- §2 Fingerprint
- §3 Dedupe decision table
- §3.5 Priority order
- §4 Triage route
- §5 Check-authoring template (its Question / Read / Finding shape / Non-findings headings are the template itself)
- §6 Canvas note

## §1 Run semantics

- **One `run_id` per run** (a fresh UUID, minted at dispatch time). It is
  identity for reporting only — there is deliberately no runs table.
- **The export** the auditors share: `audit/export-<scenario>.json` (or
  `export-all.json` for whole-blueprint runs) — a read-only JSON subset of
  the IR scoped to the run, written once at dispatch, deleted or ignored
  after. Auditors read it, never the live IR, so mid-run edits cannot
  split the checks across two realities.
- **Route substrate.** DB reachable (credentials present AND the target
  answers) → findings are DB rows and the partial unique index is the
  backstop. No DB → `audit/findings-report.json` is the ledger: same row
  shape, same dedupe table (§3) applied against the file, and the
  idempotence exit is judged against it. Entry-state precedence follows
  the same test: reachable target = imported-blueprint route, else
  IR-only — a scenario's `drafted`/pending-sign-off status never changes
  the route, it only gets flagged in the report as a staleness note.
- **Per-check atomic supersede.** When check C completes and its deduped
  findings are ready: in ONE transaction, resolve-or-delete C's previous
  `open` findings that this run did not re-detect, and insert/update the
  rest. Prefer flipping undetected-this-run rows to `resolved` over
  deleting them — resolution history is signal. A check that failed or was
  skipped touches nothing.
- **Scoped runs** ("audit Map your service only"): the cell universe is that
  scenario's keys. Supersede is then ALSO scoped — only previous findings
  whose `cell_keys` all fall inside the scope are eligible; a scoped run
  must never resolve a finding it could not have re-detected.

## §1.5 Roster & skips

The roster stage ALONE decides which checks run — a dispatched auditor
never re-decides (it may only report that the export contradicts the
dispatch). Wave 1 always runs. Wave-2 rules:

- `kpi-alignment`: skip when no lane in scope carries `kpis`/`tools`.
- `perceived-owner`: skip when no cell carries the owner pair.
- `value-ledger`: skip when no cell carries `value_props`.
- `fee-visibility`: a CONTENT SCAN, not a column test — skip only when no
  money mention exists anywhere in scope (beware substring false
  positives: "fee" in "feedback", 收 as receive, 款 inside 条款).
- `obsolete-source`: wave 1, but CONDITIONAL on source access (a repo
  checkout, reachable URLs). Without any verifiable source its canonical
  outcome is **unverifiable** — neither ran-with-findings nor skipped:
  record it as a scope-keyed zero-cell finding with the canonical scope
  form `all:no-verifiable-source`, i.e. fingerprint
  `obsolete-source:scope:all:no-verifiable-source`, so "we could not
  check" is a triageable row rather than a silent skip or a false clean.

Every skip is reported with its reason; a silent skip reads as coverage
that never happened.

## §2 Fingerprint

```
fingerprint = check_key + ':' + sha256(join(sort(cell_keys), '\n')) + ':' + <reason-slug>
```

EVERY finding carries a short reason slug — cell-bearing findings included,
not only zero-cell ones. Without it, two distinct findings from one check
over the same cells (e.g. a jargon warn and a permissions info citing the
same three cells) collide on one fingerprint and dedupe silently destroys
one of them.

`skills/audit/scripts/audit_tools.py fingerprint` is the reference implementation —
execute it rather than hand-computing (two hand-rolled implementations
that disagree on a separator split the finding history).

- Sorted, so cell order never changes identity.
- `cell_keys` use the qualified key convention
  `<service>/<phase>/<scenario>/<path>/<lane>/<step>` (the same
  convention slice-schema.json defines; IR cells carry lane+step — the
  rest of the path comes from their position in the tree). On a live
  canvas, cell ids stand in for keys (separate dedupe space, by design).
- The note is NOT part of the fingerprint, and neither are severity,
  impact and effort — rewording or re-rating a finding updates the open row
  rather than duplicating it.
- Zero-cell findings (e.g. "no scenario covers onboarding at all") use a
  scope key instead of cell keys, WITH the same reason-slug discipline:
  `check_key + ':scope:' + scenario_key + ':' + <reason-slug>`
  (e.g. `gap-sweep:scope:sample-service:orphan-step-inspection`).
- **Migration note (existing ledgers).** Rows written before the reason
  slug was extended to cell-bearing findings carry old-form fingerprints
  (`check_key + ':' + sha256(cell_keys)`, no slug). They remain valid
  rows — dedupe compares exact fingerprint strings, so old rows simply
  never match new-form incoming findings and NO ledger rewrite is needed.
  New writes always use the new form; per-check supersede retires the
  old-form open rows the next time their check completes.
- **Batch discipline.** A duplicate fingerprint WITHIN one incoming batch
  is a reported error, never a second insert — `audit_tools.py`
  dedupe/report refuse the batch and name the colliding fingerprint;
  give each finding a distinct reason slug and re-run.
- The DB backstop: `findings_open_fingerprint_idx` — unique on
  `(service_id, fingerprint) where status = 'open'`. An insert
  conflict means the dedupe logic missed; treat it as update-in-place,
  never as "insert with a tweaked fingerprint". On the no-DB route,
  `report --apply` mirrors the same backstop: it refuses to write a ledger
  holding two open rows with one fingerprint.

## §3 Dedupe decision table

`skills/audit/scripts/audit_tools.py dedupe` (plan) / `report --apply` (no-DB ledger)
implement this table — execute, never improvise.

| Incoming fingerprint matches… | Action |
| --- | --- |
| nothing | insert `open` |
| an `open` row | update its note/severity/impact/effort/run_id in place |
| a `dismissed` row | drop silently — a human said no; re-detection does not overrule them |
| a `resolved` row | reopen it (status → `open`, new run_id) — it came back |

## §3.5 Priority order

Every finding carries three ratings, assigned by its auditor from the check
doc: **severity** (`info | warn | critical`) says how wrong something is;
**impact** (`low | medium | high`) says how much fixing it matters to the
service; **effort** (`low | medium | high`) says how much work the fix
takes. Impact and effort decide what to fix first; severity breaks ties.

The report prints the open findings in four groups, in this order:

| Group | Impact | Effort |
| --- | --- | --- |
| Do first | high | low |
| Plan | high | medium or high |
| Quick wins | medium or low | low |
| Later | everything else | |

Within a group: impact descending, then effort ascending, then severity
descending. A finding recorded before the ratings existed has neither: it
reads as **unrated**, falls in Later, and sorts after every rated finding
there. Nothing guesses a rating it was never given.

`skills/audit/scripts/audit_tools.py rank` prints this order for the file
ledger; on the canvas, `list_findings` returns it.

## §4 Triage route

"Dismiss finding X" / "resolve finding X" / "reopen finding X":

1. Identify the row (by id if given; else by check + cell keys — confirm
   when ambiguous).
2. Update `status` only. Never note, severity, impact, effort, or cells —
   a triage is a human judgement about an agent statement, not an edit of
   the statement.
3. Confirm back: check, cells, old → new status.
4. Never run checks, never write anything else. If the user ALSO wants the
   underlying issue fixed, that is the `ub:map` skill, after.

Status vocabulary is closed: `open | resolved | dismissed`. `dismissed`
means "true but accepted — do not show me again"; `resolved` means "was
true, fixed — reopen if re-detected".

## §5 Check-authoring template

A check doc is an interrogation an auditor can run blind. Required
sections, in order:

```markdown
# check: <name>
wave: 1|2            # 2 = list the columns it needs; skip-if-empty
severity-default: info|warn|critical

## Question
One sentence, from the customer's or operator's point of view.

## Read
What to read in the export, in what order. Wave-2: name the columns and
the skip condition.

## Finding shape
When to emit; what the cell_keys set is; what the summary must contain
(cite keys/titles — never excerpt text); when to raise/lower severity.

## Impact and effort
One concrete anchor per level, for each: what a low, medium and high
impact finding of THIS check looks like, and what a low, medium and high
effort fix looks like. Anchors drawn from the check's own subject matter
are what make two runs rate the same finding the same way.

## Non-findings
The false positives this check is known to attract, spelled out.
```

Run a new check alone once, read its findings for false-positive rate,
then add it to the roster.

## §6 Canvas note

Inside this template's in-app canvas agent the audit is fully live — the
`/ub:audit` row of `references/canvas-adapter.md` is the ONLY canonical
canvas translation (tools, dedupe wiring, pacing, cell-id fingerprints).
Read that row; nothing here overrides it.
