# Ingest Playbook — docs → IR

For when the org **has documentation** (prose, research, guides, manuals in
md/text/docx/pdf/xlsx, FigJam/Figma via MCP). Goal: a validated IR with
per-cell provenance, one scenario at a time. If the docs turn out to be a
*structured blueprint already*, switch to `skills/map/references/translate-playbook.md`;
if they describe the system rather than a journey, switch to
`skills/map/references/cocreate-playbook.md` (see the critical branch below).

## Contents

- 1. Triage + exclusion (before reading anything at depth)
- 2. Format handling
- 3. ⚠ REQUIRED — the system-vs-journey branch
- 4. Cheap skeleton preview before IR
- 5. Deep read + draft, one scenario at a time
- 6. Journey-stage images (`storyboard` rows)
- ⚠ Exit condition (deterministic)

## 1. Triage + exclusion (before reading anything at depth)

Large corpora blow up context (real example: 900+ files). So:

1. List candidate files; **ask the user which describe journeys** rather
   than reading everything.
2. **Exclude sensitive files explicitly** — credentials (`passwords.txt`-style
   account files), DB dumps, media. Sensitive content must never enter the
   IR, and remember imports may eventually be publicly deployed.
3. For corpora too big to ask file-by-file, dispatch `document-reader` in
   **corpus survey mode** (parallel fan-out) to classify: journey / system /
   sensitive-exclude. Pilot on a few documents before running the whole
   corpus.

## 2. Format handling

| Format | Path |
| --- | --- |
| md / text | Read natively |
| docx / pdf | Convert (pandoc / pdf tooling). Scanned PDFs: unsupported in v1 — say so |
| FigJam / Figma | Via MCP when connected — but fetch **per frame**, not the whole board: get the target frame's node id from board metadata / a screenshot first, then pull that one frame. A whole-board extraction blows the MCP tool token limit (a real 12-phase board hit ~87k chars and failed). **Without MCP**: CSV/table export or text extraction only — a PDF of a spatial board is effectively a whiteboard image, which is out of scope v1; say so rather than pretend |
| xlsx / CSV | Tabular extraction |
| Whiteboard photos | Out of scope v1 — decline and suggest co-creation from the same knowledge |

## 3. ⚠ REQUIRED — the system-vs-journey branch

Before drafting anything, classify what the docs actually describe:

- **Journey docs** (who does what, in what order, through which touchpoints)
  → proceed with ingestion.
- **System docs** (manuals, feature inventories, architecture docs) →
  **do not fabricate a blueprint from them.** A blueprint hallucinated from
  a user manual is plausible, wrong, and presented as parsed truth — the
  worst failure mode. Tell the user what you found, then pivot to
  `skills/map/references/cocreate-playbook.md` using the docs as reference material.

## 4. Cheap skeleton preview before IR

Propose the service → phases → scenarios outline as plain markdown FIRST
and get a nod. A wrong parse costs one message here; after IR drafting it
costs a rebuild. Also settle right-sizing now (single flow? skip service
ceremony — see `skills/map/references/elicitation-protocol.md`).

## 5. Deep read + draft, one scenario at a time

For each scenario the user picked:

1. Dispatch `document-reader` in **single-doc deep-read mode** on its source
   docs — returns structured journey content with per-claim provenance
   (source + section).
2. Draft that scenario's IR section per `references/ir-schema.json`:
   - Set `provenance` on every cell extracted from a doc.
   - Set `needs_review: true` wherever confidence is low — flags, not guesses
     presented as facts.
   - Assign lane roles explicitly (`references/lane-roles.md`); ask
     "whose journey is the spine?" if ambiguous.
   - Locale maps for all text; keep source-language text verbatim where the
     doc provides it, don't machine-round-trip.
3. Run `scripts/validate_ir.py`; fix until exit 0.
4. Mark the scenario `drafted` in `blueprint-workspace.json`.

Then hand off to `skills/map/references/review-import-playbook.md` for preview, review,
sign-off, and import.

## 6. Journey-stage images (`storyboard` rows)

The `storyboard` role renders a cell's
`frame` (an image URL / storage ref) and ignores its text. Most orgs have no
ready screenshots when they first blueprint, so **an empty storyboard row is the
default and is fine** — leave `frame` null and the row renders as an empty
stage band; it does not block validation, sign-off, or import. Leave `frame`
null until a real image exists.

When the org does want stage imagery, source it (cheapest first):

- **Manual screenshots** of the real product/app at each stage — the org
  captures them; you reference the uploaded URL/storage path in `frame`.
- **FigJam / Figma frame exports** — if the journey already lives on a board,
  export each stage frame as an image (per-frame, per §2) and use those.
- **Photos** of physical touchpoints (kiosks, signage, forms) for offline
  stages.

Store images the adapter can serve (e.g. Supabase Storage for live-DB, or a
`public/` asset path for the fallback build) and put the resolved URL in
`frame`. Add images incrementally — a text-complete blueprint with empty
storyboard rows is a valid, shippable deliverable.

## ⚠ Exit condition (deterministic)

A scenario's ingestion loop ends when **`scripts/validate_ir.py` exits 0 AND
the scenario is marked `drafted` in `blueprint-workspace.json`** — not when
the draft "looks done". The whole ingest phase ends when every scenario the
user selected in triage meets that condition.
