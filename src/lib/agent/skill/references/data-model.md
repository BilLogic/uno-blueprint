# Data Model

The template's blueprint data model. Source of truth:
`supabase/migrations/20260716200000_template_schema.sql` plus the
migrations that add the records about the board — filenames keep the
spelling they shipped with (`20260729120000_derived_layer.sql`,
`20260730090000_derived_layer_grants_hardening.sql`,
`20260803001000_slices_origin_allows_human.sql`) and the authoring
migrations (`20260818000000_authoring_foundation.sql` — provenance
`origin` columns, `cells.cell_key` identity, `position`,
the deletion archive, direct-column grants;
`20260818001000_authoring_operations.sql` — the `SECURITY DEFINER` RPCs
that are the only sanctioned write path for structure;
`20260818002000_service_account_tier.sql` — OPTIONAL recipe splitting
`authenticated` into service/regular tiers via RESTRICTIVE policies;
`20260819000000_agent_surface.sql` — `agent_sessions`/`agent_messages`
chat persistence plus the findings write path for in-app runs) (portable
core: `supabase/generated/portable-core.generated.sql`, diagram:
`docs/erd.mmd`). The IR
(`references/ir-schema.json`) mirrors this shape one-to-one with locale maps
and stable keys in place of UUIDs.

## Contents

- Hierarchy
- ERD
- Tables in brief
- Enums
- Integrity trigger (why import order matters)
- ⚠ REQUIRED: import order
- Re-import semantics
- Ordering fields
- Working precedent
- Cell slots (`position`)
- Records about the board: slices, slides, findings, evidence
- Service spec: business_models
- Spec fields on IR-owned tables

## Hierarchy

```
services → phases → scenarios → paths → {lanes, cells, cell_dependencies}
                                                → steps (scenario-scoped)
                                        paths ⇄ steps via path_steps (column order)
```

## ERD

```mermaid
erDiagram
  services ||--o{ phases : "has many"
  phases ||--o{ scenarios : "has many"
  phases |o--o| phases : "loops_to_phase_id"
  scenarios ||--o{ paths : "has many"
  scenarios ||--o{ steps : "has many"
  paths ||--o{ path_steps : "has many"
  steps ||--o{ path_steps : "has many"
  paths ||--o{ lanes : "has many"
  paths ||--o{ cells : "has many"
  lanes ||--o{ cells : "has many"
  stakeholders |o--o{ lanes : "names its actor"
  stakeholders |o--o{ touchpoints : "owns"
  steps ||--o{ cells : "has many"
  cells ||--o{ cell_dependencies : "source"
  cells ||--o{ cell_dependencies : "target"
  touchpoints ||--o{ cell_touchpoints : "placed as"
  cells ||--o{ cell_touchpoints : "places"
  cells ||--o{ resources : "points at"
  cell_touchpoints ||--o{ resources : "points at"

  services { uuid id PK  text name  text slug "the route slug — unique across the deployment; null falls back to the name-derived one"  text summary  jsonb entity_examples "one free-text example per core kind (service, phase, scenario, path, step, lane), shown under each kind's definition" }
  business_models { uuid service_id PK_FK  text funding  text pricing  text delivery_cost  text revenue_model  text partners }
  phases { uuid id PK  uuid service_id FK  text name  text summary  text business_impact  text operational_requirements  int position  uuid loops_to_phase_id FK "optional self-reference" }
  scenarios { uuid id PK  uuid phase_id FK  text name  text summary  text note "the aside beside the summary — most often what else may run at the same time; held once here rather than copied onto each of its paths"  int position  text layout "stacked | merged — what the scenario opens as" }
  paths { uuid id PK  uuid scenario_id FK  text name "the CONDITION that routes you here, never the activity — the scenario already said that"  text summary "when this route applies"  text note "the author's aside: open questions, provenance, working state"  text kind "happy | variant | exception"  entity_status status }
  steps { uuid id PK  uuid scenario_id FK "columns are scenario-scoped, shared across paths"  text name  text summary "what this moment is, across every lane — the caption on the storyboard frame" }
  path_steps { uuid path_id PK_FK  uuid step_id PK_FK  int position "unique per (path_id, position)" }
  lanes { uuid id PK  uuid path_id FK  text name "display label - free-form, any language"  text lane_role "semantic role key; null = generic swimlane"  int position  text owner_team "from the closed list in lane-vocabulary.md; NULL on actor and storyboard lanes"  text kpis  text tools  uuid stakeholder_id FK }
  stakeholders { uuid id PK  text name "the identity — unique across the deployment; no service owns one"  text kind "recipient | staff | partner | provider | team"  text summary "who this actor IS, for the deployment"  text[] aliases "other spellings this blueprint used for the same actor" }
  cells { uuid id PK  uuid path_id FK  uuid lane_id FK  uuid step_id FK  int position "a slot holds a LIST — unique (lane_id, step_id, position)"  text content "Cell Label - primary grid text"  text frame "one image for one cell; a step's frames across the lanes are its strip"  text summary "the tl;dr the detail fields add up to"  text function  text form  text value_props  text owner  text perceived_owner "who the reader THINKS owns it, when that differs"  entity_status status }
  touchpoints { uuid id PK  text name "the identity — unique across the deployment; no service owns one"  text kind "app | document | physical | channel | service | other"  text summary "what this touchpoint IS, for the deployment"  text url  text icon_url "a stable URL for its stock icon or logo; null draws nothing"  text tone "the palette family its face is drawn in — the deployment's own choice; null means no preference and the renderer falls back deterministically"  text[] aliases "the other spellings that mean this row; null means none considered"  uuid stakeholder_id FK "the actor who owns it, or null — nobody has said yet; on delete set null"  text origin }
  cell_touchpoints { uuid id PK  uuid cell_id FK  uuid touchpoint_id FK "the registry entry, or null for a name-only placement"  text name "set only when the registry lacks it — exactly one of touchpoint_id and name; matches a line of cells.content where the grid draws it as a pill"  int position  text summary "prose about this touchpoint at THIS moment"  text role "core | peripheral — or null, nobody has judged it"  text origin }
  resources { uuid id PK  uuid cell_id FK "always — every resource knows its cell"  uuid cell_touchpoint_id FK "set as well when a placement owns it; (cell_touchpoint_id, cell_id) references the placement in its cell"  text kind "link | attachment"  text name  text url  bool featured "the one its owner leads with"  int position  text origin }
  cell_dependencies { uuid id PK  uuid source_cell_id FK "unique pair; source != target"  uuid target_cell_id FK  text kind "leads_to = makes the other happen, drawn | enables = makes the other possible, never drawn"  text label  text note }
```

## Tables in brief

| Table | Purpose | Notes |
| --- | --- | --- |
| `services` | Top container (one per blueprint deployment, usually) | `slug` is the service's own route identity — `unique (slug)` across the deployment, so `/<slug>` opens it and a rename does not move the URL. Nullable: a null slug falls back to the name-derived one (`src/lib/serviceSlug.ts`, mirroring `public.key_slug`) |
| `phases` | Service stages, ordered by `position` | `loops_to_phase_id` self-reference renders the service loop |
| `scenarios` | The unit users navigate; owns steps and paths | `layout` enum below. `note` is the aside beside the `summary` — most often what else may be running at the same time — held once on the scenario rather than copied onto each of its paths through `paths.note`. Free prose in the author's language, not a structured flag the renderer composes a sentence from |
| `paths` | A journey variant within a scenario | `kind` enum below; optional `note` |
| `steps` | Scenario-scoped step columns, SHARED across paths | A step exists once per scenario; paths select/ordr via `path_steps`. `summary` is the moment's one sentence across every lane, rendered as the storyboard caption |
| `path_steps` | Which steps a path uses and in what column order | `position` unique per path |
| `lanes` | Swimlanes, per PATH (each path carries its own lane rows) | `name` free-form any language; `lane_role` semantic key (see `references/lane-roles.md`) |
| `cells` | Grid content at (lane × step) on a path | `unique (lane_id, step_id)`; `content` newline-separated items render as pills on pill-role lanes |
| `touchpoints` | The deployment's touchpoint registry — the apps, documents, channels and things a moment happens through | One pool, unique by `name` across the whole deployment; no `service_id` — a service "has" a touchpoint exactly when one of its cells places it, so there is no palette to author and the name is the identity. The import mints a row for every placement name it meets and links the placement; `kind`, `summary` and `url` are the touchpoint's own, once, not per cell. `stakeholder_id` names the actor who owns it, null until somebody says; an actor leaving the cast un-names its touchpoints rather than being refused. `tone` is the palette family its face is drawn in and `aliases` the other spellings that mean the row — the pair `src/lib/touchpointColors.ts` resolves a label through, so a deployment's own tools and colours are rows rather than a literal every adopter would have to fork. Both are nullable and mean "nobody has said": an unchosen tone falls back deterministically, and `aliases` is nullable where `stakeholders.aliases` is `NOT NULL DEFAULT '{}'` because null distinguishes "not considered" from "considered, and there are none" |
| `stakeholders` | The deployment's cast list — the actors a lane picks from | One pool, unique by `name` across the whole deployment; no `service_id` — a service "has" an actor exactly when one of its lanes names it, so the cast is shared the way the tools are and the name is the identity. `kind` is `recipient` \| `staff` \| `partner` \| `provider` \| `team`. A lane names its actor by `stakeholder_id`, null on a structural lane, and a touchpoint names its owner the same way; both `on delete set null`, so removing an actor un-names rather than pins |
| `cell_touchpoints` | One touchpoint, used at one cell | Owns the summary and role for THIS moment — the same tool describes a different screen at a different step. What it points at (its design link, its screenshots) are `resources` rows carrying `cell_touchpoint_id`; `21000119000000` moved the two URL columns there. Names its touchpoint one of two ways and exactly one (`cell_touchpoints_one_identity`): `touchpoint_id` into the registry, or `name` alone when the registry lacks it — a **name-only placement**, drawn dashed, offered "Link to registry" in the panel. `sync_cell_touchpoints` follows a cell's text: a new line mints a registry row, a line that left keeps its writing as a name-only row or goes |
| `resources` | What a cell points at | Every row carries `cell_id`; a row a touchpoint placement owns carries `cell_touchpoint_id` as well, and the composite key `(cell_touchpoint_id, cell_id)` holds the two to one row. `kind` is `link` \| `attachment`; both carry a url. `featured` marks the one its owner leads with — one featured attachment per cell and per placement (a partial unique index), any number of featured links. The cell's list (`sync_cell_resources`) reconciles by id and refuses a placement's rows; the placement's list (`sync_placement_resources`) is theirs; `set_featured_resource` clears the previous preview in the same transaction |
| `cell_dependencies` | Directed arrows cell → cell. `kind` is `leads_to` (this cell makes the other happen — drawn) or `enables` (this cell makes the other possible — recorded, never drawn). Not inverses: "follows" is `leads_to` read from the other end, and making something possible causes nothing | Unique pair, `source != target`, both cells must be on the same path |

## Enums

- `scenarios.layout`: `stacked` \| `merged` — ONE vocabulary. The
  stored token is the token the UI names, and the header toggle writes it
  through `update_scenario_layout`, so a scenario left merged opens merged.
  (It used to store `single | side-by-side | integrated` with a translation
  module; all rows held `side-by-side` and the other two were unused, so
  `21000116000000` folded both into `stacked` and the translation was
  deleted. `21000117000000` then folded `single` into `stacked` — one path
  stacked is one band — and made `merged` storable.)
  - `stacked`: one full band per path on a shared step axis — any labeled
    variants ("as designed" vs "reality" is just the default labeling)
  - `merged`: the paths combined into one blueprint — one lane rail, one
    step axis, cells the paths agree on drawn once, divergent slots stacking
    each path's version. Needs two visible paths; with one, the canvas draws
    stacked and the row keeps its value.
- `touchpoints.kind`: `app` \| `document` \| `physical` \| `channel` \|
  `service` \| `other`. What sort of thing a registry touchpoint is; `other`
  by default, judged later, never guessed from a name.
- `cell_touchpoints.role`: `core` \| `peripheral`, or null. Whether the
  moment happens THROUGH this touchpoint or the touchpoint is merely present
  at it. On the placement, not the tool: a poster is core at recruitment and
  incidental three phases later. Null is the common state — nobody has judged
  this placement — and renders nothing; it is not a quiet `peripheral`.
- `resources.kind`: `link` \| `attachment`. A link is a place on the web;
  an attachment is a file the cell points at — an object in Storage, its
  public URL the row's url (`21000121000000`). Both carry a URL, never a path
  inside the deploying site (`resources_url_absolute`); host and file type
  are read at render, never stored. `other` became `attachment` in
  `21000118000000`; it had named nothing.
- `cell_dependencies.kind`: `leads_to` \| `enables`. `leads_to` means the
  source makes the target HAPPEN, and it is the kind the canvas DRAWS as an
  arrow. `enables` means the source makes the target POSSIBLE without causing
  it, and renders in the cell panel only. Both read source-first and
  upstream-first, so an edge's direction can be read without checking its
  kind — which is why 21000114000000 turned the older functional edges
  around rather than renaming them where they lay.
- `paths.kind`: `happy` \| `variant` \| `exception`. Exactly one `happy`
  per scenario — the route things take when nothing intervenes. An `exception`
  is a route taken because something went wrong; a `variant` is a different but
  equally valid way through. Colour follows type (`happy` green, `exception`
  red), so **the name must carry the condition**, not the type: `A critical
  finding reopens`, not `Exception path`. A scenario with only one route names
  it `Standard`.
- `stakeholders.kind`: `recipient` \| `staff` \| `partner` \| `provider` \|
  `team`. Who this actor is to the service. `team` is a kind of its own
  because a team is a group a lane can be, while `staff` are the people in it
  — and they are actors too.
- `status` (the `entity_status` domain, shared by `cells.status` and
  `paths.status`): `proposed` \| `planned` \| `built` \| `live` \| `at_risk` \|
  `deprecated`. Anything other than `live` is not what happens today — say so
  when you report it. Default `live`. There is no `maturity` column and no
  `(Planned)` name prefix — a file that carries either predates this
  vocabulary, and the status belongs in the column.

## Integrity trigger (why import order matters)

The DB trigger `cells_validate_path_match` enforces, on every cell insert:

1. `cells.path_id` must equal its lane's `lanes.path_id`, and
2. `(path_id, step_id)` must already exist in `path_steps`.

A cell referencing a step the path never registered **aborts the import
mid-transaction**. This is exactly what `scripts/validate_ir.py` catches
before any adapter runs.

## ⚠ REQUIRED: import order

```
paths → steps → path_steps → lanes → cells → cell_dependencies
```

(with `services → phases → scenarios` before all of the
above). Any other order violates FKs or the integrity trigger.

## Re-import semantics

Scenario-scoped **delete-and-reinsert in one transaction**: delete the
scenario's paths/steps (FK cascades remove path_steps, lanes, cells,
dependencies), then insert fresh rows in the order above. Never
`on conflict do update` — rows removed from the IR must not survive as
orphans. IDs are UUIDv5 from IR keys + locale (NFC-normalized), so identical
IR re-imports produce identical rows. See `references/adapter-contract.md`.

## Ordering fields

All sibling order is explicit integers: `phases.position`,
`scenarios.position`, `path_steps.position` (per path),
`lanes.position` (per path). The frontend sorts by these — gaps are
harmless, duplicates are not (validator checks).

## Working precedent

`scripts/generate_sample_blueprint.mjs` generates the template's sample
content (`src/data/sampleBlueprint.ts` + `supabase/seed.sql`) from one source
of truth with deterministic IDs and correct insert order — it is the pattern
the IR generators follow.

## Cell slots (`position`)

`cells.position int not null default 0` is a first-class column
(since `20260818000000_authoring_foundation.sql`): a (lane, step) slot may
hold several cells — one touchpoint per row in tech-role lanes — ordered
by `position`, with uniqueness widened to
`(lane_id, step_id, position)` (constraint
`cells_lane_step_slot_unique`). The slot contract: single-cell slots sit
at 0; tech-lane touchpoints occupy 0..n; the interactive `upsert_cell` RPC
always addresses slot 0, so siblings are created only by dedicated
touchpoint operations (and the migration's one-time split, where the
original row keeps the first item — preserving its id, `cell_key`, arrows,
slice references and evidence — and each further item becomes a sibling
with the parent's key plus an ordinal suffix). Tools and the IR never
expose slot management directly — treat "the" cell of a slot as slot 0.

**Two granularities carry the word "touchpoint", and they are not rivals.** A
slot sibling is a CELL — one row of a tech-role lane, drawn as its own box. A
`cell_touchpoints` row is a PLACEMENT — one of the pill labels inside a cell's
`content`, with the summary and role for that pill at that moment, and the
resources it points at hanging off it. The touchpoint itself — its kind, its
summary, where it lives — is one `touchpoints` row per name across the whole
deployment, and a placement names it by `touchpoint_id`, or by `name` alone
when the registry lacks it. A cell holding three pills is one cell and three placements; splitting
it into three cells is a slot operation and leaves each with one placement.

## Records about the board: slices, slides, findings, evidence

The skills' outputs land in four tables plus one view
(DDL: `supabase/migrations/20260729120000_derived_layer.sql`).
Workspaces provisioned before that migration must route through the
upgrade recipe rather than failing mid-import.

Design invariant: these records reference cells SOFTLY wherever they
reference them at all, so the importer's scenario-scoped
delete-and-reinsert never cascades into user-authored rows. `evidence` uses a
paired `cell_id` / `cell_key`; `audit_findings` and `slides` use `cell_ids
uuid[]` paired 1:1 with `cell_keys text[]`; `slices` reaches those references
through its `slides`. None has a cell FK. `evidence`, `audit_findings`, and
`slices` carry a hard `service_id` FK (cascade), while `slides` carries a
hard `slice_id` FK. Services are upserted, never deleted, by the importer, and
for `evidence` the service FK is the retention/deletion story for whatever
interview content its notes hold.
"Assumption" is a derived state — a cell with zero evidence rows —
deliberately never stored.

| Table | What it is | Notes |
|---|---|---|
| `slices` | A saved 1D cut through the grid that REFERENCES cells (never copies them) | `title`, `summary`, `kind` (`journey`\|`step`\|`lane`\|`cell`\|`custom`), `actor`, `locale`, `position`, `authorship` (`generated` = safe to regenerate \| `customized` = skill output human-edited, regeneration must confirm \| `human` = authored in the app, never the skill's to regenerate) |
| `slides` | One slide of a slice | `position` (unique per slice, deferrable), `cell_ids`/`cell_keys` (equal cardinality enforced; empty = title-only divider slide), `title`, `caption`, `shows_all_images` (untouched default: every cited cell's frames). Full-replacement semantics on rework |
| `slide_images` | One member of a slide's authored image set | Exactly one of `cell_id` or `image_url`; unique `(slide_id, position)`. Replaced as a set, not patched. Empty with `shows_all_images` false means show nothing. Changing `slides.cell_ids` deletes members whose `cell_id` is no longer cited; remaining positions stay put |
| `audit_findings` | One triageable audit/whatif finding | `source` (`audit`\|`whatif`\|`import-sweep`), `check_key`, `severity` (`info`\|`warn`\|`critical`), `impact` and `effort` (each `low`\|`medium`\|`high`; null on a finding recorded before the ratings existed, which reads as unrated and sorts last — audit-playbook §3.5), `summary`, `cell_ids`/`cell_keys`, `status` (`open`\|`resolved`\|`dismissed`), `run_id` (FK-less by design — no runs table), `fingerprint` (check_key + sorted-cell_keys hash + reason slug — audit-playbook §2) |
| `evidence` | One provenance row for a cell OR a proposition question | Exactly one of `cell_id` / `proposition_question_key` (`understand`\|`value`\|`usability`); `cell_id` ⇄ `cell_key` always paired; `kind` (`interview`\|`survey`\|`analytics`\|`doc`\|`meeting`\|`decision`\|`observation`\|`other`); `observed_at` is date-only by design (timestamps could re-identify participants); one general-purpose `note` — a quotation, an observation, or a URL, which renders as a link; restricted SELECT — a note may hold interview content |

**Findings dedupe is DB-backed**: the partial unique index
`findings_open_fingerprint_idx` on `(service_id, fingerprint)
where status = 'open'` allows at most one OPEN finding per fingerprint.
Skill-side rule it backstops: open updates in place, dismissed stays
dismissed, resolved reopens as a new row (a reopen collision surfaces as
23505 by design).

**Public count surface**: the `evidence_counts` view (`cell_id → n`)
exposes evidence row counts — never content — to anonymous readers; it
powers the assumption lens on public deploys.

## Service spec: business_models

`business_models` is the service-level spec row, and not one of the records
about the board.
It has no cell reference of any kind; its primary key is the hard
`service_id` FK. It carries `funding`, `pricing`, `delivery_cost`,
`revenue_model`, and `partners`, with restricted SELECT.

## Spec fields on IR-owned tables

The same migration also adds human-editable spec columns to
three IR-owned tables (writable via column-scoped grants; the content
columns stay import-owned):

- `cells`: `function` (role/responsibility — what it must do), `form`
  (communication/look/feel — what it must convey), `value_props` (JSONB
  array of `{for, value}`), `owner`, `perceived_owner` (mismatch =
  deception risk)
- `lanes`: `owner_team`, `kpis` (string array), `tools` (string array)
- `phases`: `business_impact`, `operational_requirements`
