# Slice Playbook

Read this before selecting, regenerating, editing, or deleting a slice. The
branch logic below is what keeps a slice an honest *view* of the blueprint
rather than a second, drifting copy of it.

## Contents

- What a slice is
- 0. Preconditions
- 1. Choose the type
- 2. Propose the selection
- 3. Write the prose
- 4. Validate
- 5. Import
- 6. Regenerate, edit, delete
- 7. Storyboard (optional, after the text path)
- Exit conditions

## What a slice is

An ordered one-dimensional selection of cells that **already exist**. It
creates no cells, edits none, deletes none. Everything a slice says must be
traceable to a cell key it cites — that is what makes it safe to throw away
and regenerate.

A **storyboard** is a rendering of a journey slice (illustrations per frame),
not a separate kind of slice.

## 0. Preconditions

- The scenario is imported and its sign-off hash matches the current IR. A
  slice of unsigned IR cites cells that may not survive review.
- You know the locale. Slices are per-locale artifacts, like every other
  import — the same slice key in two locales is two rows.
- For `regenerate`, you know the existing slice's `authorship` (below).

## 1. Choose the type

The question→type table lives in SKILL.md ("The four questions") — one
copy, there. This section carries only the binding selection rules.

**Journey selection is arrow-derived, not adjacency-derived.** A companion
cell joins a frame because the blueprint records a `leads_to` between it and
the actor's cell. Do not add a cell because it "seems related", sits nearby,
or is on a tech lane. If the interaction is real and missing, the fix is a
dependency in the IR (a map-skill edit, re-signed and re-imported) — not a
slice that asserts it.

## 2. Propose the selection

```bash
python3 skills/slice/scripts/slice_tools.py select \
  --ir blueprint/<file>.json --scenario <phase>/<scenario> \
  --path <path> --kind journey --lane <lane> --key <slice-key> --actor "<label>"
```

Emits a slice-file skeleton on stdout: slides already grouped, titles
seeded from step names, caption blank. Redirect it into `slices/<key>.json`
and edit from there. Never hand-assemble cell keys — a typo becomes a UUID
that resolves to nothing, and the app renders it as a missing cell.

Defaults worth knowing: one frame per step; `--path` defaults to the
scenario's first path; a lane's empty intersections are skipped rather than
framed blank.

Done when the user approves the frame list (steps × cells), shown as a table.

## 3. Write the prose

Per frame: a title (the moment) and a caption (what happens, and what it
costs the actor). Per slice: a title and a summary that says who it is
for and what question it answers.

Rules that are not style preferences:

- **Cite, never quote.** Slices land in public-read tables. Reference
  evidence by cell key or title; never paste an interview excerpt or a
  proposition figure into a title, caption, or doc.
- **Personas, not people.** "A first-week field technician", never a participant's name,
  employer, or contact string.
- **No claim without a cell.** If a sentence cannot point at a cell in its own
  frame, delete the sentence or add the cell.

Merge slides when two steps are one moment for the actor; split when one step
hides two. Frame count is an editorial choice — cell membership is not.

## 4. Validate

```bash
python3 skills/slice/scripts/slice_tools.py validate --ir blueprint/<file>.json --slices slices/<key>.json
```

Exit 0 is required before any import. It enforces: every cell key resolves in
the IR; no cell appears twice in one slice; every slice is single-scenario;
kind and authorship are in range; every slide has at least one cell.

An unresolvable key means one of two things, and they are handled
differently:

- The **key was mistyped** → fix the slice file.
- The **IR key was renamed** since the slice was written → the slice is stale.
  Re-run `select` and re-apply the prose. Do not "repair" it by substituting
  the nearest-looking key: that silently re-points a claim at a different
  cell.

## 5. Import

```bash
python3 skills/slice/scripts/slice_tools.py sql --ir blueprint/<file>.json --slices slices/<key>.json \
  --locale <locale> --service-id <services.id>
```

One transaction, delete-then-insert per slice, so a regenerated slice never
leaves stale slides behind. The adapter rules in
`references/adapter-contract.md` apply unchanged: confirm the target before
writing, verify by read-back after.

Read-back check: `slices` row count matches the file, and each slice's
`slides` count matches its frame count.

## 6. Regenerate, edit, delete

| `authorship` | Regeneration |
| --- | --- |
| `generated` | Regenerate freely — this is the point of the authorship field |
| `customized` | **Ask first.** Hand edits are in the row; regeneration discards them |
| `human` | **Never.** Authored in the app; agents do not overwrite it |

Set `authorship: customized` yourself the moment you hand-edit a generated
slice's prose in the file. The field is a promise to the next run.

Deleting: remove the slice from the file *and* delete the row
(`delete from public.slices where id = …` — items cascade). A slice left in
the DB but absent from the file is an orphan the next validate cannot see.

## 7. Storyboard (optional, after the text path)

Frames are complete without images. When illustrations are wanted, read
`skills/slice/references/storyboard-prompts.md` — it carries the character-reference flow,
the style block, the **prompt redaction step**, and the human review gate
before the first upload of a slice.

## Exit conditions

The exit table is `skills/slice/SKILL.md` § Deterministic exit conditions.
