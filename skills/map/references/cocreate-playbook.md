# Co-create Playbook — nothing (or system-only docs) → IR

For when there is no journey documentation: a founder with nothing written,
or an org whose docs describe the *system* (the ingest playbook's mandatory
pivot lands here, with those docs as reference material — never as source
truth for journey structure).

## Posture

This is a conversation, not a form. The full question script with exact
wording lives in `skills/map/references/elicitation-protocol.md` — follow its order but
keep it dialogic: reflect back what you heard, propose structure, let the
user correct. The user is the source of truth; you are the notation.

## 1. Right-size, then find the spine

Run elicitation Q0 (right-sizing) and Q1 (languages) first, and Q4 (the
spine) at the start of each scenario — each gates everything after it.
Partial completion (2 of 6 scenarios now) is first-class.

## 2. Skeleton preview

Same rule as ingestion: propose the outline (service → phases → scenarios,
then per-scenario: actors/lanes, step columns, path variants) as markdown
and get agreement **before** writing IR. Structure mistakes are cheap here,
expensive later.

## 3. Build one scenario at a time

Per scenario, in this order (mirrors the elicitation protocol):

1. Steps — the columns, in order. Start with the happy path's sequence.
2. Lanes — actors + tech + support; assign roles explicitly
   (`references/lane-roles.md`); reference docs may suggest system names
   for tech lanes.
3. Cells — walk the grid lane by lane; empty cells are fine and normal.
4. Paths — after the happy path exists, ask what goes wrong / what's the
   workaround; variant/exception paths reuse scenario steps via
   `path_steps` and may add their own.
5. Dependencies — "what kicks off what?" — only where arrows genuinely add
   information (same-path only).

Write every language Q1 settled into each cell as you go (locale maps);
flag domain terms for review.

After each scenario: run `scripts/validate_ir.py`, fix to exit 0, mark
`drafted` in `blueprint-workspace.json`, and offer to stop or continue —
respect the right-sizing decision from step 1.

Content elicited from conversation carries no `provenance` (there is no
source doc); if the user cites a document for a specific claim, record it.
Mark genuinely unconfirmed guesses `needs_review: true`.

Then hand off to `skills/map/references/review-import-playbook.md`.

## ⚠ Exit condition (deterministic)

Identical to ingestion: a scenario's co-creation loop ends when
**`scripts/validate_ir.py` exits 0 AND the scenario is marked `drafted` in
`blueprint-workspace.json`**. The phase ends when every scenario the user
committed to in this session meets that condition — not when the
conversation feels finished.

## Canvas note

On the app canvas this playbook's judgment applies unchanged — the
spine question, right-sizing, skeleton preview, one scenario at a time,
provenance tagging. Its mechanics translate per the canvas adapter:
the skeleton preview is the adapter's nod-gated outline; writes go
through the write tools; there is no `validate_ir.py` (the database
constraints are the validator — a rejected call is your validation
error) and no `blueprint-workspace.json` (the human's Save gate and the
change ledger replace drafted-state tracking). The exit condition
becomes: every promised cell exists with content, and the outline's nod
covered them all.
