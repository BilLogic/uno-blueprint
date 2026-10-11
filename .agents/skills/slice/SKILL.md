---
name: slice
description: Cuts a stakeholder-ready view out of an existing service blueprint — one actor's journey, one moment across every lane, one lane end to end, or one cell read closely — and writes it back as a slice the app can present. Use when the user asks to "pull out the customer's journey", "show what everyone is doing at check-in", "make a storyboard from the blueprint", "what does the support team own", "turn this blueprint into something I can show the client/exec/team", or mentions a slice, journey summary, lane spec, cell brief, or storyboard of a blueprint that already exists. Requires an imported, signed-off blueprint — for creating or importing the blueprint itself, use the ub:map skill instead.
---

# Blueprint Slices

A blueprint answers "how does the whole service work". Nobody reads that in a
meeting. A **slice** answers one question for one audience — *what is this
like for the technician*, *what happens at the greeting*, *what does this lane
own* — by selecting cells that already exist and putting them in order.

The discipline that makes slices worth trusting: **a slice never invents.**
It selects, orders, captions, and cites. Every claim points at a cell key.
Regenerating a slice is therefore cheap and safe, which is the whole reason
a slice is worth storing separately from the board at all.

Paths resolve against the plugin root (`${CLAUDE_PLUGIN_ROOT}` in Claude Code) or the workspace root, per `AGENTS.md`.

## Entry-state detection (do this first)

Slices are derived from an imported blueprint. Establish what exists before
selecting anything:

| Entry state | Route |
| --- | --- |
| No workspace / no IR | Stop. This is the `ub:map` skill's job — a slice of nothing is a fabrication |
| Workspace DB predates slices (`relation public.slices does not exist`) | Stop before any insert: apply the migrations that add the records about the board (`supabase/migrations/20260729120000_derived_layer.sql` onward — the filename keeps the spelling it shipped with) to the target, then resume — never hand-create the tables |
| IR exists, scenario not signed off | Finish review first: a slice of unsigned IR cites cells review may still change |
| Signed off, not imported | Import the scenario, then slice |
| Imported, no slices yet | Select |
| Slices exist, user wants another | Select; reuse the existing slice keys' naming conventions |
| Slices exist, user wants this one changed | Check `authorship` before touching it (playbook §6) |
| Slice cites keys that no longer resolve | Stale after a key rename — re-select, re-apply prose. Never substitute a lookalike key |
| Text slices exist, user wants pictures | Storyboard sub-flow — `skills/slice/references/storyboard-prompts.md` |

Read `skills/slice/references/slice-playbook.md` before executing any route; it carries the gates.

## Hard rules

Everything else here is guidance you may adapt. These are where the system
actually breaks:

- ⚠ **REQUIRED — never write cells.** Slices write `slices` and
  `slides`, nothing else. If a slice needs a cell that does not exist,
  or an interaction the blueprint does not record, that is a blueprint edit:
  hand it to the `ub:map` skill, re-sign, re-import, then
  slice. A slice that asserts an unrecorded interaction is an invention
  wearing a citation.
- ⚠ **REQUIRED — every claim traces to a cited cell.** Titles and
  captions may only say what the cells in that slide support. This is the
  single check `blueprint-reviewer` slice mode exists to run.
- ⚠ **REQUIRED — no verbatim excerpts, ever.** Slices are written to
  public-read tables and to docs that get shared. Reference evidence and
  business_models by cell key or title; never paste excerpt text or figures.
  Personas, never participants ("a first-week field technician", not a name).
- ⚠ **REQUIRED — validate before import.** `skills/slice/scripts/slice_tools.py validate`
  must exit 0. It catches unresolvable cell keys, duplicate cells, and
  multi-scenario slices — each of which renders as silently wrong rather
  than as an error.
- ⚠ **REQUIRED — regenerate per `authorship`** — playbook §6.
- ⚠ **REQUIRED — confirm the import target** (project ref / service id)
  before any write; `references/adapter-contract.md` §1 applies to slices
  unchanged.
- ⚠ **REQUIRED — secrets**, image-model keys included, follow
  `references/adapter-contract.md` §7.

## The pipeline

```
imported + signed scenario
  → select   (slice_tools.py select → slices/<key>.json)
  → write    (titles, captions — cite, never quote)
  → validate (slice_tools.py validate, exit 0 required)
  → review   (blueprint-reviewer, slice mode)
  → import   (slice_tools.py sql → adapter → read-back)
  → present  (render-checker on ?slice=<id>)
  → storyboard (optional, text path complete first)
```

Correctness-critical logic — cell-id derivation, selection rules, validation,
SQL emission — lives in `skills/slice/scripts/slice_tools.py`. **Execute it; never
reimplement its logic in-context.** Its cell-id derivation must agree
byte-for-byte with the blueprint import, or the slice points at rows that do
not exist.

## The four questions, and their types

| Question | Type |
| --- | --- |
| What is this like for X? | `journey` — X's lane plus what their cells exchange arrows with |
| What happens at this moment? | `step` — one column, every lane, top to bottom |
| What does this lane own? | `lane` — one lane, left to right |
| What is really going on in this cell? | `cell` — one cell, placed in its journey |
| These, in this order | `custom` |

`journey` is the default reading of an ambiguous ask. A **storyboard** is a
journey slice with illustrations — not a sixth type.

## Deterministic exit conditions

Never "looks done":

| Phase | Exit condition |
| --- | --- |
| Selection | `slice_tools.py validate` exit 0 |
| Review | `blueprint-reviewer` slice mode passes; grep confirms no excerpt text in the file or doc |
| Import | Transaction committed; `slices` rows = file slices, `slides` rows = frame count |
| Present | `render-checker` confirms every frame renders at `?slice=<id>` |
| Storyboard | Every frame has an illustration, or the slice is explicitly text-only |

## Agents

- `blueprint-reviewer` (slice mode) — fresh-context adversarial read before
  import: does every claim trace to a cited cell, is any interaction
  asserted that the blueprint does not record, is any excerpt quoted, is the
  persona consistent across slides.
- `render-checker` — walks `?slice=<id>` after import; screenshots plus
  console-error report.
- `document-reader` — only if the slice's prose needs source material the
  blueprint does not carry. Its output is reference material for writing,
  never a licence to add cells.

## References

| Read when | File |
| --- | --- |
| Doing anything in this skill | `skills/slice/references/slice-playbook.md` |
| Writing or checking a slice file | `skills/slice/references/slice-schema.json` |
| Structuring the markdown companion | `skills/slice/references/slice-templates.md` |
| Generating illustrations | `skills/slice/references/storyboard-prompts.md` |
| Naming lanes and actors consistently across slices | `references/lane-vocabulary.md` |
| Anything touching an import target | `references/adapter-contract.md` |
| Understanding the underlying tables | `references/data-model.md` |
