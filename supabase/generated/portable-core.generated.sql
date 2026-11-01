-- The portable Postgres core.
--
-- ⚠ GENERATED FILE — DO NOT EDIT. Every line below was emitted from the
-- partition marks in supabase/migrations/. Edit the migration, then run
-- `npm run generate:portable-core`. A hand-edit is reverted by CI, which
-- regenerates this file and fails on any difference.
--
-- This is the contract. It is the tables, columns, constraints, indexes,
-- views, triggers and function bodies a backend has to carry to hold a
-- service blueprint, and it applies to a stock `postgres:17` with nothing
-- in front of it — no Supabase, no shim, no roles that do not ship with
-- Postgres. CI proves that on every pull request.
--
-- What is NOT here is everything that names a Supabase primitive: the
-- `auth.uid()` column defaults, the anon / authenticated / service_role
-- grants, the RLS policies, the storage bucket. Those are the recipe, and
-- another host re-expresses them with its own auth and authorization —
-- keeping the semantics, replacing the primitives.
--
-- SECURITY DEFINER stays here on purpose. It is plain Postgres, and the
-- write RPCs need it wherever they run: they are the sanctioned write path
-- precisely because they perform one complete valid edit with the owner's
-- rights. What Supabase supplies is the caller classes those functions are
-- granted to, not the definer semantics.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 20260716200000_template_schema.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Service Blueprint template schema (consolidated).
--
-- Single schema migration for the Uno Blueprint template,
-- replacing the original instance's 700+ migration history: hierarchy
-- tables, blueprint grid,
-- path_steps ordering, cell metadata, layer_role, integrity trigger,
-- updated_at triggers, and read-only RLS. Content comes from seeds
-- (supabase/seed.sql) or the import pipeline — this file contains no content.

-- ---------------------------------------------------------------------------
-- Legacy cleanup: databases created from the original instance carried an
-- unused `services` catalog table (never dropped). Remove it if present.
-- ---------------------------------------------------------------------------

-- Note: only the table drop — DROP TRIGGER/POLICY IF EXISTS still 42P01s
-- when the TABLE is absent, which aborted this whole migration on a fresh
-- database. CASCADE removes the trigger and policies with the table.
drop table if exists public.services cascade;

-- ---------------------------------------------------------------------------
-- Core hierarchy: service_lifecycles → phases → service_scenarios → paths
-- ---------------------------------------------------------------------------

create table public.service_lifecycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_lifecycles is 'End-to-end service journey';

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  service_lifecycle_id uuid not null references public.service_lifecycles (id) on delete cascade,
  name text not null,
  description text,
  order_position integer not null default 0,
  loops_to_phase_id uuid references public.phases (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.phases is 'Ordered phase within a service lifecycle';
comment on column public.phases.loops_to_phase_id is
  'When set, UI shows a return transition from this phase to the target phase';

create index phases_service_lifecycle_id_idx on public.phases (service_lifecycle_id);
create index phases_lifecycle_order_idx on public.phases (service_lifecycle_id, order_position);
create index phases_loops_to_phase_id_idx on public.phases (loops_to_phase_id);

create table public.service_scenarios (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases (id) on delete cascade,
  name text not null,
  description text,
  order_position integer not null default 0,
  view_type text not null default 'single',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_scenarios_view_type_check check (
    view_type in ('single', 'side-by-side', 'integrated')
  )
);

comment on table public.service_scenarios is 'Scenario within a phase';
comment on column public.service_scenarios.view_type is
  'Blueprint layout: single path, side-by-side compare, or integrated merge.';

create index service_scenarios_phase_id_idx on public.service_scenarios (phase_id);
create index service_scenarios_phase_order_idx on public.service_scenarios (phase_id, order_position);

create table public.paths (
  id uuid primary key default gen_random_uuid(),
  service_scenario_id uuid not null references public.service_scenarios (id) on delete cascade,
  name text not null,
  description text,
  note text,
  path_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paths_path_type_check check (
    path_type in ('happy', 'unhappy', 'exception', 'alternative')
  )
);

comment on table public.paths is 'Service blueprint path (happy, unhappy, exception, alternative)';
comment on column public.paths.path_type is 'Path variant: happy, unhappy, exception, alternative';
comment on column public.paths.description is 'Optional summary of what this path variant represents';
comment on column public.paths.note is
  'Optional path note shown alongside path metadata (e.g. parallel scenario context)';

create index paths_service_scenario_id_idx on public.paths (service_scenario_id);

-- ---------------------------------------------------------------------------
-- Blueprint grid: layers (rows, per path) × steps (columns, per scenario)
-- ---------------------------------------------------------------------------

create table public.layers (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.paths (id) on delete cascade,
  name text not null,
  layer_role text,
  row_position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.layers is 'Blueprint row (swimlane) within a path';
comment on column public.layers.layer_role is
  'Semantic role key that drives rendering (pill cells, visual rows, divider-line anchoring); the display name stays in layers.name and is free-form in any language. Canonical values: customer_actions, frontstage_actions, backstage_actions, frontstage_tech, backstage_tech, support_systems, visual, step_visual. The vocabulary is extensible — org-defined custom roles are allowed and render as generic swimlanes. Null = generic swimlane (e.g. actor lanes).';

create index layers_path_id_idx on public.layers (path_id);
create index layers_path_row_idx on public.layers (path_id, row_position);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  service_scenario_id uuid not null references public.service_scenarios (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.steps is 'Blueprint column (journey step) scoped to a service scenario';
comment on column public.steps.service_scenario_id is 'Scenario that owns this canonical step';

create index steps_service_scenario_id_idx on public.steps (service_scenario_id);

create table public.path_steps (
  path_id uuid not null references public.paths (id) on delete cascade,
  step_id uuid not null references public.steps (id) on delete cascade,
  column_position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint path_steps_pkey primary key (path_id, step_id),
  constraint path_steps_path_column_unique unique (path_id, column_position)
);

comment on table public.path_steps is 'Steps included on a path and their column order';
comment on column public.path_steps.column_position is 'Blueprint column index for this step on this path';

create index path_steps_step_id_idx on public.path_steps (step_id);
create index path_steps_path_column_idx on public.path_steps (path_id, column_position);

create table public.cells (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.paths (id) on delete cascade,
  layer_id uuid not null references public.layers (id) on delete cascade,
  step_id uuid not null references public.steps (id) on delete cascade,
  content text not null default '',
  picture text,
  description text,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cells_layer_step_unique unique (layer_id, step_id),
  constraint cells_links_is_array check (jsonb_typeof(links) = 'array')
);

comment on table public.cells is 'Content at layer × step intersection';
comment on column public.cells.content is
  'Cell Label — primary blueprint text entered in the grid';
comment on column public.cells.picture is
  'Optional image URL or storage reference';
comment on column public.cells.description is
  'Optional longer cell description (detail panel, not grid label)';
comment on column public.cells.links is
  'Optional JSON array of link objects: { "type": string, "label": string, "url"?: string }';

create index cells_path_id_idx on public.cells (path_id);
create index cells_layer_id_idx on public.cells (layer_id);
create index cells_step_id_idx on public.cells (step_id);

create table public.cell_triggers (
  id uuid primary key default gen_random_uuid(),
  source_cell_id uuid not null references public.cells (id) on delete cascade,
  target_cell_id uuid not null references public.cells (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cell_triggers_source_target_unique unique (source_cell_id, target_cell_id),
  constraint cell_triggers_no_self_reference check (source_cell_id <> target_cell_id)
);

comment on table public.cell_triggers is 'Dependency from one cell to another';

create index cell_triggers_source_cell_id_idx on public.cell_triggers (source_cell_id);
create index cell_triggers_target_cell_id_idx on public.cell_triggers (target_cell_id);

-- ---------------------------------------------------------------------------
-- Integrity: a cell's layer must belong to the cell's path, and the cell's
-- step must be linked to that path via path_steps.
-- ---------------------------------------------------------------------------

create or replace function public.cells_validate_path_match()
returns trigger
language plpgsql
as $$
declare
  layer_path uuid;
  step_on_path boolean;
begin
  select path_id into layer_path from public.layers where id = new.layer_id;

  select exists (
    select 1
    from public.path_steps ps
    where ps.path_id = new.path_id
      and ps.step_id = new.step_id
  ) into step_on_path;

  if layer_path is null then
    raise exception 'cells: layer_id does not exist';
  end if;

  if layer_path <> new.path_id then
    raise exception 'cells.path_id must match layers.path_id';
  end if;

  if not step_on_path then
    raise exception 'cells.step_id must be linked to cells.path_id in path_steps';
  end if;

  return new;
end;
$$;

create trigger cells_validate_path_match
  before insert or update on public.cells
  for each row execute function public.cells_validate_path_match();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_service_lifecycles_updated_at
  before update on public.service_lifecycles
  for each row execute function public.set_updated_at();

create trigger set_phases_updated_at
  before update on public.phases
  for each row execute function public.set_updated_at();

create trigger set_service_scenarios_updated_at
  before update on public.service_scenarios
  for each row execute function public.set_updated_at();

create trigger set_paths_updated_at
  before update on public.paths
  for each row execute function public.set_updated_at();

create trigger set_layers_updated_at
  before update on public.layers
  for each row execute function public.set_updated_at();

create trigger set_steps_updated_at
  before update on public.steps
  for each row execute function public.set_updated_at();

create trigger set_path_steps_updated_at
  before update on public.path_steps
  for each row execute function public.set_updated_at();

create trigger set_cells_updated_at
  before update on public.cells
  for each row execute function public.set_updated_at();

create trigger set_cell_triggers_updated_at
  before update on public.cell_triggers
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 20260729120000_derived_layer.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Derived layer: slices, findings, evidence, propositions + cell/lane/phase spec fields.
--
-- Design invariants encoded here:
--   * Derived tables reference cells SOFTLY (uuid / uuid[], no FK) — the importer's
--     scenario-scoped delete-and-reinsert must never cascade into user-authored
--     slices/evidence/findings. cell_keys columns carry IR key-paths for recovery.
--   * evidence gets a HARD lifecycle FK: lifecycles are upserted, never deleted, by the
--     importer, and the FK is the retention/deletion story for interview excerpts.
--   * "Assumption" is a derived state (zero evidence rows) — deliberately not stored.
--   * Human-editable columns are scoped with column-level GRANTs; RLS alone cannot
--     restrict columns.

-- ============================================================
-- 1. Spec columns on existing tables
-- ============================================================

alter table public.cells
  add column function text,
  add column form text,
  add column value_props jsonb not null default '[]'
    constraint cells_value_props_is_array check (jsonb_typeof(value_props) = 'array'),
  add column owner text,
  add column perceived_owner text;

comment on column public.cells.function is 'Spec: role/responsibility/requirements of this cell (what it must do).';
comment on column public.cells.form is 'Spec: communication/look/feel/sound (what it must convey).';
comment on column public.cells.value_props is 'Array of {for, value} — value generated per beneficiary (user, business, actor).';
comment on column public.cells.owner is 'Actual owning team/party for this cell.';
comment on column public.cells.perceived_owner is 'Who the customer believes owns this moment (mismatch = deception risk).';

alter table public.layers
  add column owner_team text,
  add column kpis jsonb not null default '[]'
    constraint layers_kpis_is_array check (jsonb_typeof(kpis) = 'array'),
  add column tools jsonb not null default '[]'
    constraint layers_tools_is_array check (jsonb_typeof(tools) = 'array');

comment on column public.layers.owner_team is 'Team that staffs/owns this lane (feeds KPI-alignment audit).';
comment on column public.layers.kpis is 'String array: metrics this lane''s team is measured on.';
comment on column public.layers.tools is 'String array: systems/tools this lane''s actors use.';

alter table public.phases
  add column business_impact text,
  add column operational_requirements text;

comment on column public.phases.business_impact is 'Commercial impact notes: opex, NPS, brand, retention, growth.';
comment on column public.phases.operational_requirements is 'Process / system / people / legal requirements for this phase.';

-- cell_triggers becomes the general cell-link table (no rename: importer, arrow
-- rendering, and fallback modules all name it). One atomic ALTER: no window without
-- uniqueness.
alter table public.cell_triggers
  add column kind text not null default 'trigger'
    constraint cell_triggers_kind_check check (kind in ('trigger','needs')),
  add column label text,
  add column note text,
  drop constraint if exists cell_triggers_source_target_unique,
  add constraint cell_triggers_source_target_kind_unique
    unique (source_cell_id, target_cell_id, kind);

comment on column public.cell_triggers.kind is 'trigger = temporal (sets off); needs = functional (source requires target). needs renders in the panel only.';
comment on column public.cell_triggers.label is 'Short edge label, e.g. a channel tag like "Email".';
comment on column public.cell_triggers.note is 'The why-line shown in the cell panel dependencies tab.';

-- ============================================================
-- 2. New tables
-- ============================================================

create table public.slices (
  id uuid primary key default gen_random_uuid(),
  service_lifecycle_id uuid not null references public.service_lifecycles(id) on delete cascade,
  slice_type text not null
    constraint slices_slice_type_check check (slice_type in ('journey','step','lane','cell','custom')),
  title text not null,
  description text,
  actor text,
  locale text not null default 'en',
  origin text not null default 'generated'
    constraint slices_origin_check check (origin in ('generated','customized')),
  position int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.slices is 'Saved 1D cuts through the blueprint grid. Reference cells only — never copy or create them.';
comment on column public.slices.slice_type is 'How the cut was made: journey (experience closure for an actor) | step (one column) | lane (one lane over lifecycle) | cell (single-cell spec) | custom.';
comment on column public.slices.origin is 'generated = safe to regenerate; customized = human-edited, regeneration must confirm.';

create index slices_service_lifecycle_id_idx on public.slices (service_lifecycle_id);

create table public.slice_items (
  id uuid primary key default gen_random_uuid(),
  slice_id uuid not null references public.slices(id) on delete cascade,
  position int not null,
  cell_ids uuid[] not null default '{}',
  cell_keys text[] not null default '{}',
  caption text,
  narrative text,
  illustration jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slice_items_position_unique unique (slice_id, position)
    deferrable initially deferred,
  constraint slice_items_keys_match_ids
    check (cardinality(cell_ids) = cardinality(cell_keys))
);

comment on table public.slice_items is 'Frames: consecutive slice cells grouped (default one frame per phase). Empty cell_ids = title-only divider frame.';
comment on column public.slice_items.cell_ids is 'SOFT refs to cells (no FK — must survive scenario re-import). Same order as cell_keys.';
comment on column public.slice_items.cell_keys is 'IR key-paths paired with cell_ids for orphan recovery after key renames.';
comment on column public.slice_items.illustration is '{src, alt, source: generated|uploaded|external, updated_at} — src validated https/storage-host on write and render.';

create index slice_items_slice_id_idx on public.slice_items (slice_id);
create index slice_items_cell_ids_idx on public.slice_items using gin (cell_ids);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  service_lifecycle_id uuid not null references public.service_lifecycles(id) on delete cascade,
  run_id uuid not null,
  source text not null
    constraint findings_source_check check (source in ('audit','whatif','import-sweep')),
  check_name text not null,
  severity text not null
    constraint findings_severity_check check (severity in ('info','warn','critical')),
  cell_ids uuid[] not null default '{}',
  cell_keys text[] not null default '{}',
  note text,
  fingerprint text not null,
  status text not null default 'open'
    constraint findings_status_check check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint findings_keys_match_ids
    check (cardinality(cell_ids) = cardinality(cell_keys))
);

comment on table public.findings is 'Audit / whatif / import-sweep outputs. Never hand-created; humans may only change status.';
comment on column public.findings.run_id is 'Audit-run identity. Intentionally FK-less — no runs table by design.';
comment on column public.findings.fingerprint is 'check_name + sorted cell_keys hash. Dedupe/reopen identity across runs.';

create index findings_service_lifecycle_id_idx on public.findings (service_lifecycle_id);
create index findings_cell_ids_idx on public.findings using gin (cell_ids);
-- DB backstop for skill-side dedupe: at most one OPEN finding per fingerprint.
create unique index findings_open_fingerprint_idx
  on public.findings (service_lifecycle_id, fingerprint) where status = 'open';

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  service_lifecycle_id uuid not null references public.service_lifecycles(id) on delete cascade,
  cell_id uuid,
  cell_key text,
  proposition_question_key text
    constraint evidence_question_key_check check (
      proposition_question_key is null
      or proposition_question_key in ('understand','value','usability')),
  kind text not null
    constraint evidence_kind_check check (kind in
      ('interview','survey','analytics','doc','meeting','decision','observation','other')),
  title text not null,
  ref text,
  excerpt text,
  note text,
  observed_at date,
  added_by text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_exactly_one_target
    check (num_nonnulls(cell_id, proposition_question_key) = 1),
  constraint evidence_cell_key_paired
    check (cell_id is null or cell_key is not null)
);

comment on table public.evidence is 'Provenance rows for cells and proposition questions. A cell with zero rows is an ASSUMPTION (derived, never stored). Restricted SELECT: excerpts may hold interview content.';
comment on column public.evidence.observed_at is 'Date-only by design (timestamps could re-identify participants).';
comment on column public.evidence.added_by is 'Agent name or participant-coded author. Never the interviewee.';

create index evidence_service_lifecycle_id_idx on public.evidence (service_lifecycle_id);
create index evidence_cell_id_idx on public.evidence (cell_id);

create table public.propositions (
  service_lifecycle_id uuid primary key
    references public.service_lifecycles(id) on delete cascade,
  funding text,
  pricing text,
  delivery_cost text,
  revenue_model text,
  partners text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.propositions is 'One business-model record per lifecycle. The three validation questions live as evidence rows keyed understand|value|usability. Restricted SELECT.';

-- Public count-only surface for the assumption lens: anonymous viewers may know HOW MANY
-- evidence rows a cell has, never their content. View owner bypasses evidence RLS
-- deliberately — counts only.
create view public.evidence_counts as
  select cell_id, count(*)::int as n
  from public.evidence
  where cell_id is not null
  group by cell_id;

comment on view public.evidence_counts is 'cell_id -> evidence row count. Public: powers the assumption lens without exposing evidence content.';

-- ============================================================
-- 3. updated_at triggers (template convention)
-- ============================================================

create trigger set_slices_updated_at
  before update on public.slices
  for each row execute function public.set_updated_at();
create trigger set_slice_items_updated_at
  before update on public.slice_items
  for each row execute function public.set_updated_at();
create trigger set_findings_updated_at
  before update on public.findings
  for each row execute function public.set_updated_at();
create trigger set_evidence_updated_at
  before update on public.evidence
  for each row execute function public.set_updated_at();
create trigger set_propositions_updated_at
  before update on public.propositions
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 20260730090000_derived_layer_grants_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Derived-layer follow-up hardening (data-integrity review findings F1, F3, F4, F5).
-- F1: explicit Data API grants (plan 002 §1d) — stop relying on legacy default ACLs
--     that also left anon holding write privileges RLS was silently covering for.
-- F3: pin search_path on trigger/util functions (advisor WARN).
-- F4: attribution columns missed on slice_items/propositions.
-- F5: evidence cell_key XOR tightened to bidirectional pairing.

-- ---- F3: pinned search_path on functions ----
alter function public.set_updated_at() set search_path = pg_catalog, pg_temp;
alter function public.cells_validate_path_match() set search_path = public, pg_catalog, pg_temp;

-- ---- F4: attribution on the remaining human-writable derived tables ----
alter table public.slice_items add column created_by uuid;
alter table public.propositions add column created_by uuid;
comment on column public.slice_items.created_by is 'The caller at insert; null for service-key writes.';
comment on column public.propositions.created_by is 'The caller at insert; null for service-key writes.';


-- ---- F5: evidence cell_key pairing is bidirectional ----
update public.evidence set cell_key = null where cell_id is null and cell_key is not null;
alter table public.evidence
  drop constraint evidence_cell_key_paired,
  add constraint evidence_cell_key_paired check ((cell_id is null) = (cell_key is null));

-- Accepted-by-design (documented, no change): evidence_counts is an owner-rights view
-- (advisor ERROR) — deliberately bypasses evidence RLS to expose counts only; making it
-- security_invoker would break the anonymous assumption-lens read. Public-bucket SELECT
-- policy on storage.objects is required for upsert overwrites. Findings reopen
-- collisions surface as 23505 by design (partial unique index).

-- ─────────────────────────────────────────────────────────────────────────
-- 20260803001000_slices_origin_allows_human.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The app's origin vocabulary is three-valued and the constraint predated
-- the third: 'generated' (skill output), 'customized' (skill output edited
-- by hand), 'human' (authored in the app, never the skill's to regenerate).
-- createSlice sends 'human'; the constraint bounced every in-app slice.
-- This never surfaced before because permission denial masked it — the
-- insert failed earlier for sessions without write access.
alter table public.slices drop constraint slices_origin_check;
alter table public.slices add constraint slices_origin_check
  check (origin = any (array['generated'::text, 'customized'::text, 'human'::text]));

-- ─────────────────────────────────────────────────────────────────────────
-- 20260818000000_authoring_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Blueprint authoring foundation (part 1 of 2): provenance, cell identity,
-- delete-safety, direct-column grants, and read-surface fixes.
--
-- Consolidated from a proving-ground deployment, where the authoring
-- foundation and its follow-up fixes landed one migration at a time. Each
-- object appears ONCE here, in its FINAL corrected form — the fixes are
-- folded in, not replayed.
--
-- Part 2 (20260818001000) adds the RPCs that are the only sanctioned write
-- path for structure. Nothing here grants table-level INSERT or DELETE: the
-- functions in part 2 are `security definer`, so the app gets operations
-- rather than tables.
--
-- Additive only. The consolidated template schema (20260716200000) and the
-- derived layer (20260729120000) are never rewritten — live downstream
-- databases replay from where they are.

-- ---------------------------------------------------------------------------
-- Provenance. Without it nothing can tell an app-created row from an imported
-- one, and therefore nothing can protect either appropriately. Phases carry
-- it too: create_phase (part 2) makes them creatable from the app.
-- ---------------------------------------------------------------------------
alter table public.phases
  add column if not exists origin text not null default 'import'
    constraint phases_origin_check check (origin in ('import', 'app'));
alter table public.service_scenarios
  add column if not exists origin text not null default 'import'
    constraint service_scenarios_origin_check check (origin in ('import', 'app'));
alter table public.paths
  add column if not exists origin text not null default 'import'
    constraint paths_origin_check check (origin in ('import', 'app'));
alter table public.steps
  add column if not exists origin text not null default 'import'
    constraint steps_origin_check check (origin in ('import', 'app'));
alter table public.layers
  add column if not exists origin text not null default 'import'
    constraint layers_origin_check check (origin in ('import', 'app'));
alter table public.cells
  add column if not exists origin text not null default 'import'
    constraint cells_origin_check check (origin in ('import', 'app'));

-- ---------------------------------------------------------------------------
-- The cell's authored key, stored rather than derived.
--
-- Slices bind to cells through `slice_items.cell_keys` because a scenario
-- re-import deletes and recreates every `cells` row — the id changes, the key
-- does not. That only works if the key can actually be recovered from a cell.
-- The key is *authored* in the IR (`lifecycle/scenario/path/layer/step`, per
-- the slice tooling's cell_key convention), not computed from display names,
-- so no SQL function can reconstruct it for imported rows.
--
-- Nullable on purpose. Imported rows are written by the import pipeline,
-- which is the only thing that knows the authored keys; app-created rows get
-- one minted by `upsert_cell` (part 2). A null key means "not recoverable" —
-- visible, rather than silently wrong.
-- ---------------------------------------------------------------------------
alter table public.cells add column if not exists cell_key text;

create unique index if not exists cells_cell_key_unique
  on public.cells (cell_key) where cell_key is not null;

comment on column public.cells.cell_key is
  'Authored key: lifecycle/scenario/path/layer/step. Written by the import pipeline for origin=import, minted by upsert_cell for origin=app. Survives re-import; slice_items.cell_keys matches against it.';

-- ---------------------------------------------------------------------------
-- Slot position: a (layer, step) slot may hold several cells — one touchpoint
-- per row in tech lanes — ordered by slot_position. Every existing cell is 0,
-- so nothing changes until slots gain siblings (the split below, or the app).
-- ---------------------------------------------------------------------------
alter table public.cells add column if not exists slot_position int not null default 0;

alter table public.cells
  drop constraint if exists cells_layer_step_unique;
alter table public.cells
  drop constraint if exists cells_layer_step_slot_unique;
alter table public.cells
  add constraint cells_layer_step_slot_unique
    unique (layer_id, step_id, slot_position);

comment on column public.cells.slot_position is
  'Ordering within one (layer, step) slot. 0 for single-cell slots; tech-lane touchpoints occupy 0..n.';

-- One touchpoint, one row: any multi-item cell in a tech-role lane splits.
-- The ORIGINAL row keeps the first item — so its id, cell_key, arrows, slice
-- references and evidence stay attached to something real — and each further
-- item becomes a sibling row in the same slot at the next slot_position.
-- Sibling keys are the parent's key with an ordinal suffix ('-2', '-3').
-- Generic: operates on whatever rows exist (seed or adopter data); a fresh
-- database with single-item cells is untouched. Effectively idempotent —
-- split rows carry no separators, so a re-run finds nothing to split.
do $$
declare
  rec record;
  items text[];
  i int;
begin
  for rec in
    select c.id, c.path_id, c.layer_id, c.step_id, c.content, c.cell_key
    from public.cells c
    join public.layers l on l.id = c.layer_id
    where l.layer_role in ('frontstage_tech', 'backstage_tech', 'support_systems')
      and c.content ~ '[\n,]'
  loop
    select array_agg(part) into items
    from (
      select trim(part) as part
      from regexp_split_to_table(rec.content, '\r?\n|,') as part
    ) parts
    where part <> '';

    if items is null or array_length(items, 1) < 2 then
      continue;
    end if;

    update public.cells set content = items[1] where id = rec.id;

    for i in 2 .. array_length(items, 1) loop
      insert into public.cells
        (path_id, layer_id, step_id, slot_position, content, origin, cell_key)
      values
        (rec.path_id, rec.layer_id, rec.step_id, i - 1, items[i], 'app',
         case when rec.cell_key is null then null
              else rec.cell_key || '-' || i::text end);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Column ordering. `slice_items` was built DEFERRABLE INITIALLY DEFERRED so
-- its editor could renumber in one batch; path_steps was not, which makes any
-- multi-row shift collide with itself midway. The RPCs do the shifting in one
-- transaction, and a deferrable constraint makes that safe rather than lucky.
-- ---------------------------------------------------------------------------
alter table public.path_steps
  drop constraint if exists path_steps_path_column_unique;
alter table public.path_steps
  add constraint path_steps_path_column_unique
    unique (path_id, column_position) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Delete safety. Nothing is destroyed until its payload is archived, in the
-- same transaction as the cascade that destroys it (part 2's delete RPCs).
-- ---------------------------------------------------------------------------
create table if not exists public.deleted_structure (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  kind text not null check (kind in ('scenario', 'path', 'lane', 'step', 'cell')),
  -- Human name, for the undo toast and the recovery list.
  label text not null,
  -- Every deleted row, natural-keyed and in dependency order, so restore can
  -- replay it through the ordinary create path.
  payload jsonb not null,
  -- [{slice_id, title, cell_keys:[…]}] — which slices lost frames to this.
  affected_slices jsonb not null default '[]'::jsonb
);

create index if not exists deleted_structure_deleted_at_idx
  on public.deleted_structure (deleted_at desc);

comment on table public.findings is
  'Audit / whatif / import-sweep outputs. Written by skills (IDE service key or canvas authenticated agent); humans triage by status.';

-- ─────────────────────────────────────────────────────────────────────────
-- 20260818001000_authoring_operations.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Blueprint authoring (part 2 of 2): the operations.
--
-- Consolidated from a proving-ground deployment, where these functions and
-- the dozen follow-up fixes to them were written one at a time. Every
-- function appears ONCE here, in its final corrected form — the fixes are
-- folded in, not replayed.
--
-- The app gets *operations*, not tables. Every function here performs one
-- complete, valid edit in one transaction, which is what makes three things
-- true that raw table writes could not:
--
--   1. The `cells_validate_path_match` trigger's ordering requirement (layer →
--      step → path_steps → cell) lives here once, instead of being re-derived
--      by every caller.
--   2. Column renumbering happens inside a transaction, so the non-deferrable
--      collision window that made client-side shifting unsafe never opens.
--   3. Lanes are written to *every* path of a scenario — a lane on only one
--      path renders as a hole in the integrated view.
--
-- All writes are `security definer` with a pinned search_path, and each is
-- scoped to one operation: none takes a table name or free SQL.
--
-- Four hard-won rules, encoded throughout:
--
--   * EXECUTE is revoked from PUBLIC on every write. Postgres grants EXECUTE
--     to PUBLIC by default at CREATE time, and these are definer functions
--     that bypass RLS — without the revoke, anyone holding the anon key
--     (which ships in the client bundle by design) could call
--     delete_scenario. The revoke is the operative statement; the grant
--     merely names the one role supposed to hold it.
--   * RESTRICTIVE policies never bind inside SECURITY DEFINER functions (the
--     owner has table rights and RLS does not apply), so the tier check is
--     asserted IN THE BODY of every write — the only place it can be.
--   * `on conflict` targets are named constraints, not column lists: bare
--     column names in a conflict target cannot be table-qualified, so a
--     parameter sharing a column's name makes the target unresolvable (42702).
--   * SQL-language functions use positional parameter references ($1): an
--     unqualified name matching an in-scope column binds to the COLUMN,
--     silently returning wrong answers.

-- ---------------------------------------------------------------------------
-- The tier seam.
--
-- Every write RPC below asserts `public.is_service_account()` in its body.
-- This default implementation makes the seam a no-op: every authenticated
-- session may edit (single-tier deployment, the template default).
--
-- The OPTIONAL service-account tier recipe (20260818002000) replaces this
-- function with one that reads the caller's JWT, splitting `authenticated`
-- into service (edit) and viewer (read + chat) without touching any RPC.
-- Guarded with create-if-absent so re-running migrations never downgrades a
-- deployed tier function back to the permissive default.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_service_account()') is null then
    create function public.is_service_account()
    returns boolean
    language sql
    stable
    set search_path = pg_catalog, pg_temp
    as $fn$ select true $fn$;

    comment on function public.is_service_account() is
      'Tier seam asserted inside every write RPC. Default: true (every authenticated session edits). The optional tier recipe migration replaces this to read the JWT app_metadata role.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Helpers (read-only; deliberately open to anon — they are stable/immutable,
-- write nothing, and only describe data already readable through the SELECT
-- policies; deletion_impact is what the confirm dialog reads BEFORE anything
-- is destroyed).
-- ---------------------------------------------------------------------------

/**
 * Slug for one key segment: lowercase, ASCII, hyphen-joined.
 *
 * Matches what the IR authors write by hand ("Check In" is keyed `check-in`).
 * Used only when *minting* a key for an app-created cell — never to guess an
 * imported cell's key, which is authored and cannot be derived.
 */
create or replace function public.key_slug(value text)
returns text
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  -- Non-ASCII names (CJK lanes, Cyrillic steps) slug to nothing under the
  -- [a-z0-9] filter; returning null there made concat_ws silently DROP the
  -- segment, so two differently-named lanes could mint the same cell key.
  -- Deterministic fallback: an md5 fragment of the raw name keeps the
  -- segment present, stable, and distinct per name. Truly empty input
  -- still yields null.
  select case
    when coalesce(value, '') = '' then null
    else coalesce(
      nullif(
        trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'x' || substr(md5(value), 1, 8)
    )
  end;
$$;

/**
 * A cell's authored key — read, not computed.
 *
 * The key is authored in the IR for imported cells, so it cannot be
 * reconstructed: deriving it from display names collides wherever names
 * repeat and would produce keys matching nothing a slice was bound by,
 * silently breaking the recovery path that deletion safety depends on.
 *
 * Returns null for a cell whose key was never written. Callers must treat
 * null as "not recoverable" rather than substituting a guess.
 */
create or replace function public.cell_natural_key(cell_id uuid)
returns text
language sql stable
set search_path = public, pg_catalog, pg_temp
as $$
  select c.cell_key from public.cells c where c.id = $1;
$$;

/**
 * Mint a key for an app-created cell.
 *
 * Slugs the display names, which is correct here and only here: an
 * app-created cell has no IR entry, so its names *are* its authored source.
 * The path segment is the path's NAME (falling back to path_type): several
 * paths of one journey routinely share a type, so keying on type collides
 * where keying on name does not.
 *
 * Positional references throughout: in a `language sql` function an
 * unqualified parameter name that matches a column of an in-scope table
 * binds to the column, silently. `$1` cannot resolve to a column, so that
 * class of bug cannot come back through a rename.
 */
create or replace function public.mint_cell_key(
  path_id uuid,
  layer_id uuid,
  step_id uuid
)
returns text
language sql stable
set search_path = public, pg_catalog, pg_temp
as $fn$
  select concat_ws('/',
    public.key_slug(sl.name),
    public.key_slug(sc.name),
    coalesce(public.key_slug(p.name), public.key_slug(p.path_type)),
    public.key_slug(l.name),
    public.key_slug(s.name)
  )
  from public.paths p
  join public.service_scenarios sc on sc.id = p.service_scenario_id
  join public.phases ph on ph.id = sc.phase_id
  join public.service_lifecycles sl on sl.id = ph.service_lifecycle_id
  join public.layers l on l.id = $2
  join public.steps s on s.id = $3
  where p.id = $1;
$fn$;

/**
 * Which slices reference any of these cells, and exactly which keys they lose.
 *
 * The keys are the point. A slice that quietly loses cells stays renderable
 * and simply says less than it did — the worst outcome here, because nothing
 * surfaces. Undo re-points by matching these keys back to the restored cells,
 * so a delete that cannot name them cannot be undone.
 *
 * A lost key that is null (a cell that never had one written) still appears,
 * as null, so the confirm dialog can say how many frames it cannot promise to
 * restore instead of implying it can restore them all.
 */
create or replace function public.slices_referencing(cell_ids uuid[])
returns jsonb
language sql stable
set search_path = public, pg_catalog, pg_temp
as $fn$
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'slice_id', s.id,
      'title', s.title,
      'cell_keys', (
        select coalesce(jsonb_agg(to_jsonb(c.cell_key)), '[]'::jsonb)
        from public.cells c
        where c.id = any($1)
          and exists (
            select 1 from public.slice_items i2
            where i2.slice_id = s.id and c.id = any(i2.cell_ids)
          )
      )
    ) as entry
    from public.slices s
    where exists (
      select 1 from public.slice_items i
      where i.slice_id = s.id and i.cell_ids && $1
    )
  ) rows;
$fn$;

/**
 * What a delete would destroy. Read by the confirm dialog so the numbers it
 * shows are the numbers that die, and so it can name the slices that lose
 * frames.
 */
create or replace function public.deletion_impact(kind text, target_id uuid)
returns jsonb
language plpgsql stable
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected uuid[];
  label text;
begin
  if kind = 'scenario' then
    select array_agg(c.id), max(sc.name) into affected, label
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.service_scenarios sc on sc.id = p.service_scenario_id
    where sc.id = target_id;
  elsif kind = 'path' then
    select array_agg(c.id), max(p.name) into affected, label
    from public.cells c join public.paths p on p.id = c.path_id
    where p.id = target_id;
  elsif kind = 'step' then
    select array_agg(c.id), max(s.name) into affected, label
    from public.cells c join public.steps s on s.id = c.step_id
    where s.id = target_id;
  elsif kind = 'lane' then
    select array_agg(c.id), max(l.name) into affected, label
    from public.cells c join public.layers l on l.id = c.layer_id
    where l.id = target_id;
  else
    raise exception 'Unknown kind %', kind;
  end if;

  affected := coalesce(affected, array[]::uuid[]);

  return jsonb_build_object(
    'label', coalesce(label, ''),
    'cell_count', cardinality(affected),
    'dependency_count', (
      select count(*) from public.cell_triggers t
      where t.source_cell_id = any(affected) or t.target_cell_id = any(affected)
    ),
    'affected_slices', public.slices_referencing(affected)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Scenario creation
-- ---------------------------------------------------------------------------

/**
 * Create a scenario with one path, a lane set, and empty columns.
 *
 * `lane_source_path_id` copies lanes from an existing path — the default in
 * the UI, because lane vocabulary drifting between scenarios is the single
 * most common blueprint defect. `lane_set` is the explicit alternative:
 * [{name, layer_role, row_position}].
 */
create or replace function public.create_scenario(
  phase_id uuid,
  name text,
  view_type text default 'single',
  lane_source_path_id uuid default null,
  lane_set jsonb default '[]'::jsonb,
  step_count int default 5,
  path_name text default 'Happy Path'
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  scenario_id uuid;
  new_path_id uuid;
  next_order int;
  lane jsonb;
  step_id uuid;
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(name), '') = '' then
    raise exception 'A blueprint needs a name';
  end if;
  if view_type not in ('single', 'side-by-side', 'integrated') then
    raise exception 'Unknown view type %', view_type;
  end if;

  select coalesce(max(order_position), -1) + 1 into next_order
  from public.service_scenarios where service_scenarios.phase_id = create_scenario.phase_id;

  insert into public.service_scenarios (phase_id, name, order_position, view_type, origin)
  values (create_scenario.phase_id, create_scenario.name, next_order, create_scenario.view_type, 'app')
  returning id into scenario_id;

  insert into public.paths (service_scenario_id, name, path_type, origin)
  values (scenario_id, path_name, 'happy', 'app')
  returning id into new_path_id;

  -- Lanes: copied from a source path, or taken from the explicit set.
  if lane_source_path_id is not null then
    insert into public.layers (path_id, name, layer_role, row_position, origin)
    select new_path_id, l.name, l.layer_role, l.row_position, 'app'
    from public.layers l where l.path_id = lane_source_path_id;
  else
    for lane in select * from jsonb_array_elements(lane_set) loop
      insert into public.layers (path_id, name, layer_role, row_position, origin)
      values (
        new_path_id,
        lane ->> 'name',
        nullif(lane ->> 'layer_role', ''),
        coalesce((lane ->> 'row_position')::int, 0),
        'app'
      );
    end loop;
  end if;

  -- Columns start unnamed; naming them is the first thing you do on the grid.
  for i in 0 .. greatest(step_count, 1) - 1 loop
    insert into public.steps (service_scenario_id, name, origin)
    values (scenario_id, 'Step ' || (i + 1), 'app')
    returning id into step_id;
    insert into public.path_steps (path_id, step_id, column_position)
    values (new_path_id, step_id, i);
  end loop;

  return jsonb_build_object('scenario_id', scenario_id, 'path_id', new_path_id);
end;
$$;

/**
 * Duplicate a scenario, whole: description, view type, columns (copied ONCE —
 * steps are scenario-scoped, so every copied path points at the same new
 * set), every path with its lanes and cells (all spec fields, slot_position
 * included), and every arrow whose BOTH endpoints live inside the source
 * scenario, remapped onto the copies via (path, layer, step, slot) — the
 * cell's actual identity.
 *
 * NOT copied: `cell_key`. Keys are AUTHORED — they cannot be derived for
 * imported cells, and minting one here would collide wherever a scenario has
 * two same-named steps. Copies get a null key, the same as every app-created
 * cell; a duplicated cell is not addressable by a slice binding until it is
 * given one.
 */
create or replace function public.duplicate_scenario(
  source_scenario_id uuid,
  name text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  source_phase_id uuid;
  new_scenario_id uuid;
  next_order int;
  -- old id → new id, as jsonb rather than temp tables: these functions run
  -- inside one PostgREST statement and a temp table would outlive it.
  step_map jsonb := '{}'::jsonb;
  layer_map jsonb := '{}'::jsonb;
  path_map jsonb := '{}'::jsonb;
  src_step record;
  src_path record;
  src_lane record;
  new_step_id uuid;
  new_path_id uuid;
  new_lane_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(name), '') = '' then
    raise exception 'A blueprint needs a name';
  end if;

  select sc.phase_id into source_phase_id
  from public.service_scenarios sc
  where sc.id = source_scenario_id;

  if source_phase_id is null then
    raise exception 'Unknown blueprint';
  end if;

  -- The copy lands at the end of its phase. Same rule as create_scenario:
  -- inserting mid-sequence is a reorder, and reordering is a different
  -- operation.
  select coalesce(max(sc.order_position), -1) + 1 into next_order
  from public.service_scenarios sc
  where sc.phase_id = source_phase_id;

  insert into public.service_scenarios
    (phase_id, name, description, order_position, view_type, origin)
  select source_phase_id, duplicate_scenario.name, sc.description,
         next_order, sc.view_type, 'app'
  from public.service_scenarios sc
  where sc.id = source_scenario_id
  returning id into new_scenario_id;

  -- Columns first: they belong to the scenario, not to a path, so they are
  -- copied once and every path below points at this one new set.
  for src_step in
    select s.id, s.name
    from public.steps s
    where s.service_scenario_id = source_scenario_id
    order by s.created_at
  loop
    insert into public.steps (service_scenario_id, name, origin)
    values (new_scenario_id, src_step.name, 'app')
    returning id into new_step_id;
    step_map := step_map || jsonb_build_object(src_step.id::text, new_step_id);
  end loop;

  -- Then each path, in the order the `cells_validate_path_match` trigger
  -- requires: lanes → path_steps → cells.
  for src_path in
    select p.id, p.name, p.path_type, p.description, p.note
    from public.paths p
    where p.service_scenario_id = source_scenario_id
    order by p.created_at
  loop
    insert into public.paths
      (service_scenario_id, name, path_type, description, note, origin)
    values (new_scenario_id, src_path.name, src_path.path_type,
            src_path.description, src_path.note, 'app')
    returning id into new_path_id;
    path_map := path_map || jsonb_build_object(src_path.id::text, new_path_id);

    for src_lane in
      select l.id, l.name, l.layer_role, l.row_position,
             l.owner_team, l.kpis, l.tools
      from public.layers l
      where l.path_id = src_path.id
      order by l.row_position
    loop
      insert into public.layers
        (path_id, name, layer_role, row_position, owner_team, kpis, tools, origin)
      values (new_path_id, src_lane.name, src_lane.layer_role,
              src_lane.row_position, src_lane.owner_team, src_lane.kpis,
              src_lane.tools, 'app')
      returning id into new_lane_id;
      layer_map := layer_map || jsonb_build_object(src_lane.id::text, new_lane_id);
    end loop;

    insert into public.path_steps (path_id, step_id, column_position)
    select new_path_id, (step_map ->> ps.step_id::text)::uuid, ps.column_position
    from public.path_steps ps
    where ps.path_id = src_path.id;

    insert into public.cells
      (path_id, layer_id, step_id, slot_position, content, description,
       picture, links, function, form, value_props, owner, perceived_owner,
       origin)
    select new_path_id,
           (layer_map ->> c.layer_id::text)::uuid,
           (step_map ->> c.step_id::text)::uuid,
           c.slot_position, c.content, c.description,
           c.picture, c.links, c.function, c.form, c.value_props,
           c.owner, c.perceived_owner, 'app'
    from public.cells c
    where c.path_id = src_path.id;
  end loop;

  -- Arrows last, once every cell they could point at exists. Only arrows
  -- with BOTH endpoints inside the source scenario are copied: an arrow with
  -- one foot outside would render as a line leaving the blueprint it belongs
  -- to. Cross-scenario arrows are left pointing at the original, which is
  -- where they still belong.
  insert into public.cell_triggers (source_cell_id, target_cell_id, kind, label, note)
  select ns.id, nt.id, t.kind, t.label, t.note
  from public.cell_triggers t
  join public.cells os on os.id = t.source_cell_id
  join public.cells ot on ot.id = t.target_cell_id
  join public.cells ns
    on ns.path_id = (path_map ->> os.path_id::text)::uuid
   and ns.layer_id = (layer_map ->> os.layer_id::text)::uuid
   and ns.step_id = (step_map ->> os.step_id::text)::uuid
   and ns.slot_position is not distinct from os.slot_position
  join public.cells nt
    on nt.path_id = (path_map ->> ot.path_id::text)::uuid
   and nt.layer_id = (layer_map ->> ot.layer_id::text)::uuid
   and nt.step_id = (step_map ->> ot.step_id::text)::uuid
   and nt.slot_position is not distinct from ot.slot_position
  where path_map ? os.path_id::text
    and path_map ? ot.path_id::text
  on conflict do nothing;

  return new_scenario_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phases
-- ---------------------------------------------------------------------------

/**
 * Create a phase at the end of a lifecycle.
 *
 * Appends rather than taking a position. A phase is a column of the whole
 * canvas, so inserting one in the middle re-lays-out every blueprint to its
 * right — that is a reorder, and reordering is its own operation with its own
 * confirmation. Appending is always safe.
 *
 * `loops_to_phase_id` starts null. A loop back to an earlier phase is a claim
 * about the service, and guessing it for a phase that has no content yet
 * would be inventing a fact.
 */
create or replace function public.create_phase(
  lifecycle_id uuid,
  name text,
  description text default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  new_phase_id uuid;
  next_order int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(name), '') = '' then
    raise exception 'A phase needs a name';
  end if;

  if not exists (
    select 1 from public.service_lifecycles sl where sl.id = lifecycle_id
  ) then
    raise exception 'Unknown service';
  end if;

  -- Names are how a phase is read in the sidebar and in every cell key, so
  -- two phases sharing one is a genuine ambiguity rather than a cosmetic
  -- clash: `mint_cell_key` would produce the same key for cells in both.
  if exists (
    select 1 from public.phases p
    where p.service_lifecycle_id = lifecycle_id
      and lower(trim(p.name)) = lower(trim(create_phase.name))
  ) then
    raise exception 'This service already has a phase called %', trim(name);
  end if;

  select coalesce(max(p.order_position), -1) + 1 into next_order
  from public.phases p where p.service_lifecycle_id = lifecycle_id;

  insert into public.phases (
    service_lifecycle_id, name, description, order_position, origin
  )
  values (
    lifecycle_id, trim(create_phase.name),
    nullif(trim(create_phase.description), ''), next_order, 'app'
  )
  returning id into new_phase_id;

  return new_phase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns (steps)
-- ---------------------------------------------------------------------------

/** Insert a column at `at_position`, shifting everything after it right. */
create or replace function public.add_step(
  path_id uuid,
  name text,
  at_position int default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  scenario_id uuid;
  new_step_id uuid;
  target int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select service_scenario_id into scenario_id from public.paths where id = add_step.path_id;
  if scenario_id is null then
    raise exception 'Unknown path';
  end if;

  select coalesce(max(column_position) + 1, 0) into target
  from public.path_steps where path_steps.path_id = add_step.path_id;
  target := coalesce(at_position, target);

  -- Deferred unique constraint makes the shift and the insert one safe step.
  update public.path_steps
    set column_position = column_position + 1
    where path_steps.path_id = add_step.path_id and column_position >= target;

  insert into public.steps (service_scenario_id, name, origin)
  values (scenario_id, coalesce(nullif(trim(name), ''), 'Untitled step'), 'app')
  returning id into new_step_id;

  insert into public.path_steps (path_id, step_id, column_position)
  values (add_step.path_id, new_step_id, target);

  return new_step_id;
end;
$$;

/** Set the whole column order for one path, renumbered contiguously. */
create or replace function public.reorder_steps(path_id uuid, step_ids uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  for i in 1 .. array_length(step_ids, 1) loop
    update public.path_steps
      set column_position = i - 1
      where path_steps.path_id = reorder_steps.path_id
        and path_steps.step_id = step_ids[i];
  end loop;
end;
$$;

/**
 * Which columns a path uses. Takes the whole desired set and reconciles —
 * inserts what is new, removes what is gone, renumbers what remains. One
 * call, one transaction; a client-side version of this is what the
 * non-deferrable constraint made unsafe.
 */
create or replace function public.set_path_steps(path_id uuid, step_ids uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  delete from public.path_steps ps
    where ps.path_id = set_path_steps.path_id
      and not (ps.step_id = any(set_path_steps.step_ids));

  for i in 1 .. coalesce(array_length(set_path_steps.step_ids, 1), 0) loop
    insert into public.path_steps (path_id, step_id, column_position)
    values (set_path_steps.path_id, set_path_steps.step_ids[i], i - 1)
    on conflict on constraint path_steps_pkey
      do update set column_position = excluded.column_position;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lanes (layers) — scenario-wide, because layers rows belong to a path
-- ---------------------------------------------------------------------------

-- A pre-existing add_lane with a different return type would block the
-- create; harmless when absent (the template lineage never shipped one).
drop function if exists public.add_lane(uuid, text, text, int);

/**
 * Add a lane to EVERY path of a scenario, at the given row.
 *
 * Returns the created `layers` ids — one per path, which is why it is an
 * array — so the caller can invert by identity: an inverse keyed by the name
 * that was just typed deletes the wrong lane the moment anything is renamed,
 * and `remove_lane` matches by name across every path, so the blast radius
 * of a wrong match is the whole blueprint's worth of that lane.
 */
create or replace function public.add_lane(
  scenario_id uuid,
  name text,
  layer_role text default null,
  at_row int default null
)
returns uuid[]
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  target int;
  created uuid[];
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(name), '') = '' then
    raise exception 'A lane needs a name';
  end if;

  select coalesce(max(l.row_position) + 1, 0) into target
  from public.layers l
  join public.paths p on p.id = l.path_id
  where p.service_scenario_id = add_lane.scenario_id;
  target := coalesce(at_row, target);

  update public.layers l
    set row_position = l.row_position + 1
    from public.paths p
    where p.id = l.path_id
      and p.service_scenario_id = add_lane.scenario_id
      and l.row_position >= target;

  with inserted as (
    insert into public.layers (path_id, name, layer_role, row_position, origin)
    select p.id, add_lane.name, nullif(add_lane.layer_role, ''), target, 'app'
    from public.paths p
    where p.service_scenario_id = add_lane.scenario_id
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into created from inserted;

  return created;
end;
$$;

/** Reorder lanes across every path at once; lanes are matched by name. */
create or replace function public.reorder_lanes(scenario_id uuid, lane_names text[])
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  for i in 1 .. array_length(lane_names, 1) loop
    update public.layers l
      set row_position = i - 1
      from public.paths p
      where p.id = l.path_id
        and p.service_scenario_id = reorder_lanes.scenario_id
        and l.name = lane_names[i];
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cells
-- ---------------------------------------------------------------------------

/**
 * Create or update the cell at (layer, step), always addressing slot 0 —
 * create on empty, update on click. Sibling touchpoints at higher slots are
 * created only by dedicated operations, never here.
 *
 * The trigger requires `path_steps` to already link this step to this path;
 * rather than letting the caller discover that as a raised exception, the
 * link is ensured here first.
 *
 * The conflict target is the NAMED constraint: `on conflict (col, …)` takes
 * bare column names that cannot be qualified, and the parameters share the
 * columns' names, which made the column-list form unresolvable (42702).
 */
create or replace function public.upsert_cell(
  path_id uuid,
  layer_id uuid,
  step_id uuid,
  content text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  cell_id uuid;
  next_column int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.path_steps ps
    where ps.path_id = upsert_cell.path_id and ps.step_id = upsert_cell.step_id
  ) then
    select coalesce(max(column_position) + 1, 0) into next_column
    from public.path_steps where path_steps.path_id = upsert_cell.path_id;
    insert into public.path_steps (path_id, step_id, column_position)
    values (upsert_cell.path_id, upsert_cell.step_id, next_column);
  end if;

  -- Minted on insert, never on update: a cell's key is its identity for slice
  -- recovery, so renaming a lane must not silently repoint every slice that
  -- referenced the cells in it.
  insert into public.cells (path_id, layer_id, step_id, slot_position, content, origin, cell_key)
  values (upsert_cell.path_id, upsert_cell.layer_id, upsert_cell.step_id, 0,
          coalesce(content, ''), 'app',
          public.mint_cell_key(upsert_cell.path_id, upsert_cell.layer_id,
                               upsert_cell.step_id))
  on conflict on constraint cells_layer_step_slot_unique
    do update set content = excluded.content
  returning id into cell_id;

  return cell_id;
end;
$$;

/** Add or update one dependency between two cells on the same path. */
create or replace function public.set_cell_dependency(
  source_cell_id uuid,
  target_cell_id uuid,
  kind text default 'trigger',
  label text default null,
  note text default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  dependency_id uuid;
  source_path uuid;
  target_path uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if set_cell_dependency.source_cell_id = set_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;
  if set_cell_dependency.kind not in ('trigger', 'needs') then
    raise exception 'Unknown dependency kind %', set_cell_dependency.kind;
  end if;

  select c.path_id into source_path from public.cells c
    where c.id = set_cell_dependency.source_cell_id;
  select c.path_id into target_path from public.cells c
    where c.id = set_cell_dependency.target_cell_id;
  if source_path is null or target_path is null then
    raise exception 'Both cells must exist';
  end if;
  -- Arrows are drawn within one path's grid; a cross-path arrow has nowhere
  -- to render and is what validate_ir.py rejects on import.
  if source_path <> target_path then
    raise exception 'Both cells must be in the same path of the journey';
  end if;

  insert into public.cell_triggers (source_cell_id, target_cell_id, kind, label, note)
  values (set_cell_dependency.source_cell_id, set_cell_dependency.target_cell_id,
          set_cell_dependency.kind,
          nullif(trim(set_cell_dependency.label), ''),
          nullif(trim(set_cell_dependency.note), ''))
  on conflict on constraint cell_triggers_source_target_kind_unique
    do update set label = excluded.label, note = excluded.note
  returning id into dependency_id;

  return dependency_id;
end;
$$;

create or replace function public.clear_cell_dependency(dependency_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  delete from public.cell_triggers where id = dependency_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paths
-- ---------------------------------------------------------------------------

/** A new, empty path: lanes and columns copied, no cells. */
create or replace function public.create_path(
  scenario_id uuid,
  name text,
  path_type text default 'alternative',
  lane_source_path_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  new_path_id uuid;
  source_path_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  source_path_id := coalesce(
    lane_source_path_id,
    (select id from public.paths where service_scenario_id = scenario_id order by created_at limit 1)
  );

  insert into public.paths (service_scenario_id, name, path_type, origin)
  values (scenario_id, name, path_type, 'app')
  returning id into new_path_id;

  insert into public.layers (path_id, name, layer_role, row_position, origin)
  select new_path_id, l.name, l.layer_role, l.row_position, 'app'
  from public.layers l where l.path_id = source_path_id;

  insert into public.path_steps (path_id, step_id, column_position)
  select new_path_id, ps.step_id, ps.column_position
  from public.path_steps ps where ps.path_id = source_path_id;

  return new_path_id;
end;
$$;

/**
 * Copy a whole path, cells and arrows included — slot-aware.
 *
 * An explicit old-lane-id → new-lane-id map makes the arrow remap exact:
 * matching lanes by name cannot build an id map and is ambiguous for a path
 * carrying two same-named lanes. The cell copy carries `slot_position`, and
 * the arrow remap joins on (path, layer, step, slot) — the cell's actual
 * identity — so a multi-cell slot neither collides on insert nor fans one
 * arrow out into a copy per sibling.
 *
 * Lanes carry `owner_team`, `kpis` and `tools` across (a copied lane that
 * forgot its owner reads as an unowned lane), and the path's own
 * `description` and `note` are copied too. `cell_key` is NOT copied — keys
 * are authored (see cell_natural_key).
 */
create or replace function public.duplicate_path(
  source_path_id uuid,
  name text,
  path_type text default 'alternative',
  copy_cells boolean default true,
  copy_dependencies boolean default true
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  scenario_id uuid;
  new_path_id uuid;
  -- old lane id → new lane id, as jsonb rather than a temp table: this runs
  -- inside one PostgREST statement and a temp table would outlive it.
  layer_map jsonb := '{}'::jsonb;
  src_lane record;
  new_lane_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select p.service_scenario_id into scenario_id
  from public.paths p
  where p.id = duplicate_path.source_path_id;

  if scenario_id is null then
    raise exception 'Unknown path';
  end if;

  insert into public.paths
    (service_scenario_id, name, path_type, description, note, origin)
  select scenario_id, duplicate_path.name, duplicate_path.path_type,
         p.description, p.note, 'app'
  from public.paths p
  where p.id = duplicate_path.source_path_id
  returning id into new_path_id;

  -- Lanes first, then path_steps, then cells: the order the
  -- `cells_validate_path_match` trigger requires.
  for src_lane in
    select l.id, l.name, l.layer_role, l.row_position,
           l.owner_team, l.kpis, l.tools
    from public.layers l
    where l.path_id = duplicate_path.source_path_id
    order by l.row_position
  loop
    insert into public.layers
      (path_id, name, layer_role, row_position, owner_team, kpis, tools, origin)
    values (new_path_id, src_lane.name, src_lane.layer_role,
            src_lane.row_position, src_lane.owner_team, src_lane.kpis,
            src_lane.tools, 'app')
    returning id into new_lane_id;
    layer_map := layer_map || jsonb_build_object(src_lane.id::text, new_lane_id);
  end loop;

  -- Columns are scenario-scoped, so the copy points at the very same `steps`
  -- rows in the same order — exactly as the source does.
  insert into public.path_steps (path_id, step_id, column_position)
  select new_path_id, ps.step_id, ps.column_position
  from public.path_steps ps
  where ps.path_id = duplicate_path.source_path_id;

  if copy_cells then
    insert into public.cells
      (path_id, layer_id, step_id, slot_position, content, description,
       picture, links, function, form, value_props, owner, perceived_owner,
       origin)
    select new_path_id,
           (layer_map ->> c.layer_id::text)::uuid,
           c.step_id, c.slot_position, c.content, c.description,
           c.picture, c.links, c.function, c.form, c.value_props,
           c.owner, c.perceived_owner, 'app'
    from public.cells c
    where c.path_id = duplicate_path.source_path_id;

    if copy_dependencies then
      -- The join is (path, layer, step, slot). The slot term is what stops a
      -- multi-cell slot from fanning one arrow out into a copy per sibling.
      insert into public.cell_triggers
        (source_cell_id, target_cell_id, kind, label, note)
      select ns.id, nt.id, t.kind, t.label, t.note
      from public.cell_triggers t
      join public.cells os
        on os.id = t.source_cell_id
       and os.path_id = duplicate_path.source_path_id
      join public.cells ot
        on ot.id = t.target_cell_id
       and ot.path_id = duplicate_path.source_path_id
      join public.cells ns
        on ns.path_id = new_path_id
       and ns.layer_id = (layer_map ->> os.layer_id::text)::uuid
       and ns.step_id = os.step_id
       and ns.slot_position is not distinct from os.slot_position
      join public.cells nt
        on nt.path_id = new_path_id
       and nt.layer_id = (layer_map ->> ot.layer_id::text)::uuid
       and nt.step_id = ot.step_id
       and nt.slot_position is not distinct from ot.slot_position
      on conflict do nothing;
    end if;
  end if;

  return new_path_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renames — deliberately their own operations rather than a generic update:
-- an RPC that can only change a name cannot be talked into changing anything
-- else. Names trimmed and required; duplicates within the same parent refused
-- with a message a person can act on.
-- ---------------------------------------------------------------------------

create or replace function public.rename_phase(phase_id uuid, new_name text)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(new_name), '') = '' then
    raise exception 'A phase needs a name';
  end if;

  if exists (
    select 1 from public.phases p
    where p.service_lifecycle_id = (
        select service_lifecycle_id from public.phases where id = phase_id
      )
      and p.id <> phase_id
      and lower(trim(p.name)) = lower(trim(new_name))
  ) then
    raise exception 'This service already has a phase called %', trim(new_name);
  end if;

  update public.phases set name = trim(new_name) where id = phase_id;
  if not found then
    raise exception 'Unknown phase';
  end if;
end;
$$;

create or replace function public.rename_scenario(scenario_id uuid, new_name text)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(new_name), '') = '' then
    raise exception 'A scenario needs a name';
  end if;

  if exists (
    select 1 from public.service_scenarios s
    where s.phase_id = (
        select phase_id from public.service_scenarios where id = scenario_id
      )
      and s.id <> scenario_id
      and lower(trim(s.name)) = lower(trim(new_name))
  ) then
    raise exception 'This phase already has a scenario called %', trim(new_name);
  end if;

  update public.service_scenarios set name = trim(new_name)
  where id = scenario_id;
  if not found then
    raise exception 'Unknown scenario';
  end if;
end;
$$;

create or replace function public.rename_path(path_id uuid, new_name text)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(new_name), '') = '' then
    raise exception 'A path needs a name';
  end if;

  if exists (
    select 1 from public.paths p
    where p.service_scenario_id = (
        select service_scenario_id from public.paths where id = path_id
      )
      and p.id <> path_id
      and lower(trim(p.name)) = lower(trim(new_name))
  ) then
    raise exception 'This scenario already has a path called %', trim(new_name);
  end if;

  update public.paths set name = trim(new_name) where id = path_id;
  if not found then
    raise exception 'Unknown path';
  end if;
end;
$$;

/**
 * Rename an owner tag everywhere it appears, atomically.
 *
 * Two independent client-side UPDATEs (owner, then perceived_owner) can fail
 * between them and split the vocabulary in half — the exact drift the tag
 * dropdown exists to prevent. Returns the ids of every cell touched so a
 * session log can record an id-precise revert instead of a name-based bulk
 * update that would also rewrite cells legitimately carrying the new name.
 */
create or replace function public.rename_owner_tag(
  from_name text,
  to_name text
)
returns uuid[]
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected uuid[];
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(from_name), '') = '' or coalesce(trim(to_name), '') = '' then
    raise exception 'Both the current and the new tag name are required.';
  end if;
  if trim(from_name) = trim(to_name) then
    raise exception 'The new name is the same as the current one.';
  end if;

  select coalesce(array_agg(id), '{}') into affected
  from public.cells
  where owner = from_name or perceived_owner = from_name;

  update public.cells set owner = trim(to_name) where owner = from_name;
  update public.cells
     set perceived_owner = trim(to_name)
   where perceived_owner = from_name;

  return affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion — archive first, always. The archive write and the cascade are
-- one transaction: nothing is destroyed without a payload behind it, ever.
-- ---------------------------------------------------------------------------

/** Delete a scenario, archiving everything first. */
create or replace function public.delete_scenario(scenario_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  impact := public.deletion_impact('scenario', scenario_id);

  select jsonb_build_object(
    'scenario', to_jsonb(sc),
    'paths', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
              from public.paths p where p.service_scenario_id = sc.id),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from public.steps s where s.service_scenario_id = sc.id),
    'path_steps', (select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
                   from public.path_steps ps
                   join public.paths p on p.id = ps.path_id
                   where p.service_scenario_id = sc.id),
    'layers', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.layers l
               join public.paths p on p.id = l.path_id
               where p.service_scenario_id = sc.id),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c
              join public.paths p on p.id = c.path_id
              where p.service_scenario_id = sc.id),
    'dependencies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     from public.cell_triggers t
                     join public.cells c on c.id = t.source_cell_id
                     join public.paths p on p.id = c.path_id
                     where p.service_scenario_id = sc.id)
  ) into payload
  from public.service_scenarios sc where sc.id = scenario_id;

  if payload is null then
    raise exception 'Unknown blueprint';
  end if;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('scenario', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.service_scenarios where id = scenario_id;

  return archive_id;
end;
$$;

/** Delete one path of a journey, archiving it first. */
create or replace function public.delete_path(path_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if (select count(*) from public.paths p
      where p.service_scenario_id =
        (select service_scenario_id from public.paths where id = path_id)) <= 1 then
    raise exception 'A blueprint needs at least one path — delete the blueprint instead';
  end if;

  impact := public.deletion_impact('path', path_id);

  select jsonb_build_object(
    'path', to_jsonb(p),
    'layers', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.layers l where l.path_id = p.id),
    'path_steps', (select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
                   from public.path_steps ps where ps.path_id = p.id),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.path_id = p.id),
    'dependencies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     from public.cell_triggers t
                     join public.cells c on c.id = t.source_cell_id
                     where c.path_id = p.id)
  ) into payload
  from public.paths p where p.id = path_id;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('path', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.paths where id = path_id;
  return archive_id;
end;
$$;

/** Delete a column from one path; the step row goes when no path uses it. */
create or replace function public.remove_step(path_id uuid, step_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  impact := public.deletion_impact('step', step_id);

  select jsonb_build_object(
    'step', to_jsonb(s),
    'path_id', remove_step.path_id,
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c
              where c.step_id = s.id and c.path_id = remove_step.path_id)
  ) into payload
  from public.steps s where s.id = step_id;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('step', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.cells
    where cells.step_id = remove_step.step_id and cells.path_id = remove_step.path_id;
  delete from public.path_steps
    where path_steps.step_id = remove_step.step_id and path_steps.path_id = remove_step.path_id;

  -- Orphaned step rows serve nothing; the scenario keeps only columns in use.
  delete from public.steps s
    where s.id = remove_step.step_id
      and not exists (select 1 from public.path_steps ps where ps.step_id = s.id);

  -- Renumber what is left so positions stay contiguous.
  with ordered as (
    select ps.step_id, row_number() over (order by ps.column_position) - 1 as position
    from public.path_steps ps where ps.path_id = remove_step.path_id
  )
  update public.path_steps ps
    set column_position = ordered.position
    from ordered
    where ps.path_id = remove_step.path_id and ps.step_id = ordered.step_id;

  return archive_id;
end;
$$;

/**
 * Delete a lane from EVERY path of its scenario, by name.
 *
 * This is what the delete dialog calls, where the user is naming a lane and
 * means every version of it. Undo of add_lane goes through remove_lanes.
 */
create or replace function public.remove_lane(scenario_id uuid, lane_name text)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  affected uuid[];
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select array_agg(c.id) into affected
  from public.cells c
  join public.layers l on l.id = c.layer_id
  join public.paths p on p.id = l.path_id
  where p.service_scenario_id = remove_lane.scenario_id and l.name = lane_name;
  affected := coalesce(affected, array[]::uuid[]);

  select jsonb_build_object(
    'scenario_id', remove_lane.scenario_id,
    'lane_name', lane_name,
    'layers', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.layers l
               join public.paths p on p.id = l.path_id
               where p.service_scenario_id = remove_lane.scenario_id and l.name = lane_name),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.id = any(affected))
  ) into payload;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('lane', lane_name, payload, public.slices_referencing(affected))
  returning id into archive_id;

  delete from public.layers l
    using public.paths p
    where p.id = l.path_id
      and p.service_scenario_id = remove_lane.scenario_id
      and l.name = lane_name;

  return archive_id;
end;
$$;

/**
 * Delete exactly these lanes, archiving them first.
 *
 * The undo of `add_lane`. Unlike `remove_lane` it matches nothing by name, so
 * a lane renamed since it was added is still the lane this takes back — and a
 * different lane that has since been renamed *into* that name is not.
 */
create or replace function public.remove_lanes(lane_ids uuid[])
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  affected uuid[];
  payload jsonb;
  label text;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if lane_ids is null or array_length(lane_ids, 1) is null then
    raise exception 'No lanes named';
  end if;

  -- Zero surviving rows is a real answer, and a hard one: the lane is already
  -- gone, so the caller must not be told its undo succeeded.
  if not exists (select 1 from public.layers where id = any(lane_ids)) then
    raise exception 'Those lanes no longer exist';
  end if;

  select min(l.name) into label
  from public.layers l where l.id = any(lane_ids);

  select coalesce(array_agg(c.id), array[]::uuid[]) into affected
  from public.cells c where c.layer_id = any(lane_ids);

  select jsonb_build_object(
    'lane_ids', to_jsonb(lane_ids),
    'lane_name', label,
    'layers', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.layers l where l.id = any(lane_ids)),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.id = any(affected))
  ) into payload;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('lane', coalesce(label, 'lane'), payload,
          public.slices_referencing(affected))
  returning id into archive_id;

  delete from public.layers where id = any(lane_ids);

  return archive_id;
end;
$$;

create or replace function public.delete_cell(cell_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  archive_id uuid;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select jsonb_build_object('cell', to_jsonb(c)) into payload
  from public.cells c where c.id = cell_id;
  if payload is null then
    raise exception 'Unknown cell';
  end if;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('cell', coalesce(public.cell_natural_key(cell_id), 'cell'), payload,
          public.slices_referencing(array[cell_id]))
  returning id into archive_id;

  delete from public.cells where id = cell_id;
  return archive_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, part 1: the PUBLIC default, revoked.
--
-- This half is portable Postgres and belongs to every backend. Postgres
-- grants EXECUTE to PUBLIC at CREATE time, and these are definer functions
-- that bypass row security: without the revoke, anyone who can reach the
-- database can call delete_scenario. Naming a role instead would leave the
-- PUBLIC grant standing and change nothing.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_scenario(uuid, text, text, uuid, jsonb, int, text) from public;
revoke execute on function public.duplicate_scenario(uuid, text) from public;
revoke execute on function public.create_phase(uuid, text, text) from public;
revoke execute on function public.create_path(uuid, text, text, uuid) from public;
revoke execute on function public.duplicate_path(uuid, text, text, boolean, boolean) from public;
revoke execute on function public.add_step(uuid, text, int) from public;
revoke execute on function public.add_lane(uuid, text, text, int) from public;
revoke execute on function public.reorder_steps(uuid, uuid[]) from public;
revoke execute on function public.set_path_steps(uuid, uuid[]) from public;
revoke execute on function public.reorder_lanes(uuid, text[]) from public;
revoke execute on function public.upsert_cell(uuid, uuid, uuid, text) from public;
revoke execute on function public.set_cell_dependency(uuid, uuid, text, text, text) from public;
revoke execute on function public.clear_cell_dependency(uuid) from public;
revoke execute on function public.rename_phase(uuid, text) from public;
revoke execute on function public.rename_scenario(uuid, text) from public;
revoke execute on function public.rename_path(uuid, text) from public;
revoke execute on function public.rename_owner_tag(text, text) from public;
revoke execute on function public.delete_scenario(uuid) from public;
revoke execute on function public.delete_path(uuid) from public;
revoke execute on function public.remove_step(uuid, uuid) from public;
revoke execute on function public.remove_lane(uuid, text) from public;
revoke execute on function public.remove_lanes(uuid[]) from public;
revoke execute on function public.delete_cell(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260818002000_service_account_tier.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- OPTIONAL RECIPE: the service-account tier.
--
-- Skip or delete this file if every signed-in user of your deployment should
-- be able to edit — the template default. With this migration applied,
-- `authenticated` splits into two tiers:
--
--   * service accounts — edit everything (structure RPCs, spec columns,
--     slices, evidence, storage uploads);
--   * regular accounts — view + any chat/agent surfaces you add, but no
--     blueprint or derived-layer writes.
--
-- anon is untouched: the deployed site stays read-only either way.
--
-- Consolidated from a proving-ground deployment (the tier, its RPC
-- enforcement, and the advisor hardening that followed), PARAMETERIZED:
-- no hard-coded account emails — membership comes from the
-- `service_account_emails` config table below and/or app_metadata you set
-- yourself.
--
-- HOW THE TIER IS CARRIED (the app_metadata convention):
--   A session is a service account when its JWT carries
--     app_metadata.role = 'service'
--   app_metadata is written via auth.users.raw_app_meta_data — settable only
--   with the service role or the dashboard. Users cannot self-assign it
--   (user_metadata is ignored on purpose: users CAN write that).
--
-- HOW TO ENROLL ACCOUNTS (two adopter-configurable paths):
--   1. Future sign-ups: insert your editors' emails into
--      public.service_account_emails (service-role only); the trigger below
--      stamps the role at account creation.
--        insert into public.service_account_emails (email)
--        values ('you@example.com');
--   2. Existing accounts: stamp them directly (service role / SQL editor):
--        update auth.users
--        set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--          || '{"role":"service"}'::jsonb
--        where email = 'you@example.com';
--
-- TWO ENFORCEMENT LAYERS, both required:
--   * RESTRICTIVE policies (below) AND with the existing permissive ones and
--     gate DIRECT table writes by authenticated sessions.
--   * The write RPCs are SECURITY DEFINER and owned by a role that bypasses
--     RLS, so RESTRICTIVE policies NEVER run for them. Each RPC asserts
--     public.is_service_account() in its own body (20260818001000) — the
--     only place it can be asserted for a definer function. This migration
--     merely swaps the seam's implementation from "always true" to the JWT
--     read; the asserts are already there.
-- ═══════════════════════════════════════════════════════════════════════════

-- a plain table. What stamps rows from it is the recipe's business.
create table if not exists public.service_account_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.service_account_emails is
  'Adopter-configured allowlist: accounts created with these emails are stamped app_metadata.role=service by the flag_service_accounts trigger. Operator-only (service role). Existing accounts are stamped directly on auth.users — see the header of this migration.';

-- ─────────────────────────────────────────────────────────────────────────
-- 20260819000000_agent_surface.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Agent surface: chat persistence + the findings write path for in-app runs.
--
-- 1. agent_sessions / agent_messages — the in-app agent panel's transcript
--    store, PER USER: every session row carries created_by (defaulted to
--    auth.uid() so the app never sets it) and the policies scope both tables
--    to the owning user. Reachable only by the authenticated role; anon
--    deployments never see the agent surface and every persistence call
--    degrades quietly to localStorage. Payload rows are the panel's
--    TranscriptEvent JSON, append-only per (session, seq). seq is bigint
--    because the app writes a per-boot epoch base (Date.now()*1000 + index)
--    so two tabs on one session land in disjoint ranges instead of upserting
--    over each other's rows.
--
-- 2. findings grants — the derived-layer migration revoked authenticated
--    INSERT on findings ("skills write via service key"). The in-app agent's
--    record_finding tool writes through the signed-in session, so the grant
--    comes back here in the same hardened form as the authoring foundation:
--    insert-as-open only, update narrowed to the columns record-finding
--    actually touches. The tier recipe's RESTRICTIVE *_service_only policies
--    from 20260818002000 still AND with these where applied.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.agent_sessions (
  id uuid primary key,
  title text not null default 'New session',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_sessions is
  'One in-app agent conversation (the agent panel''s session list). Owned by created_by; RLS keeps transcripts per-user.';

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions (id) on delete cascade,
  seq bigint not null,
  kind text not null check (kind in ('user', 'assistant', 'tool', 'status')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

comment on table public.agent_messages is
  'Transcript events of an agent session, ordered by seq. Payload mirrors the app''s TranscriptEvent.';

create index agent_messages_session_idx
  on public.agent_messages (session_id, seq);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000101000000_schema_version_is_a_table.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The schema says what version it is, in the database, where a target can be
-- asked. Written 2026-08-25; the version number is a band allocation.
--
-- `references/adapter-contract.md` § 2 requires that a target carry the
-- template schema "at a compatible schema_version". The value existed in the
-- IR and in blueprint-workspace.json and NOWHERE IN THE DATABASE, so the
-- compatibility clause compared a file against a file. A live target could not
-- be interrogated at all — the one thing the clause is about.
--
-- This is PORTABLE CORE, not Supabase recipe. Every backend answers the same
-- question the same way, which is the whole point of asking it: an adapter
-- that cannot say what schema it carries cannot be checked against an IR.
--
-- One row, enforced. A history table was the alternative and is a different
-- feature: "what has been applied" is what supabase_migrations.schema_migrations
-- already answers, and it answers it per-migration. This answers "what shape am
-- I", which has exactly one current value.

create table public.schema_version (
  singleton boolean primary key default true,
  version text not null,
  applied_at timestamptz not null default now(),
  constraint schema_version_is_singleton check (singleton),
  constraint schema_version_format check (version ~ '^\d{4}\.\d{2}\.\d{2}$')
);

comment on table public.schema_version is
  'The template schema version this database carries. Exactly one row. Read by the adapter contract''s compatibility check (references/adapter-contract.md § 2); bumped by the migration that changes the shape.';
comment on column public.schema_version.version is
  'Date-stamped template schema version, e.g. 2026.07.16 — the same value an IR carries in its schema_version field.';

-- The shape as it stands before the vocabulary migrations in this band.
insert into public.schema_version (version) values ('2026.07.16');

-- ─────────────────────────────────────────────────────────────────────────
-- 21000102000000_a_rewriter_for_function_bodies.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A rewriter for function bodies, used by the seven vocabulary migrations that
-- follow it. Written 2026-08-25; the version number is a band allocation.
--
-- THE TRAP THIS EXISTS FOR: `alter table ... rename` moves the table and none
-- of the plpgsql that names it. Function bodies are stored as text and
-- resolved at call time, so a renamed table or column leaves every function
-- naming it DEPLOYABLE AND BROKEN until something calls it. This database has
-- 32 of them, including `mint_cell_key` — the write path for every cell, from
-- the panel editor and the agent alike. An assertion against
-- information_schema.columns cannot see inside a function body, so the obvious
-- check passes while the writes are landmines.
--
-- The second trap is in the repair. Postgres refuses to rename an input
-- parameter through CREATE OR REPLACE, so a function whose SIGNATURE changes
-- has to be dropped and recreated — and a recreated function comes back with
-- Postgres's default EXECUTE granted to PUBLIC, wider than it was. Capturing
-- the old ACL and re-granting it is not enough: the repair has to REVOKE what
-- the original had revoked, not only grant what it had granted. Upstream this
-- widened four ACLs on two SECURITY DEFINER writes before anyone noticed.
--
-- Both are handled once, here, instead of seven times by hand.
--
-- The expected count is asserted rather than reported. A sweep that silently
-- rewrites fewer bodies than the migration author counted is the landmine
-- again, shipped by a green migration.
--
-- Dropped by the last migration in this series: it is scaffolding for one
-- vocabulary change, not a permanent part of the schema.

create or replace function public.__rewrite_function_bodies(
  patterns text[],
  replacements text[],
  expected integer
) returns integer
language plpgsql
as $rewriter$
declare
  target record;
  before text;
  after text;
  after_args text;
  grantee text;
  entry text;
  i integer;
  rewritten integer := 0;
begin
  if array_length(patterns, 1) is distinct from array_length(replacements, 1) then
    raise exception 'patterns and replacements must be the same length';
  end if;

  for target in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           pg_get_function_arguments(p.oid) as args,
           p.proacl::text[] as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not like '\_\_%'
    order by p.proname
  loop
    before := pg_get_functiondef(target.oid);
    after := before;
    after_args := target.args;

    for i in 1 .. array_length(patterns, 1) loop
      after := regexp_replace(after, patterns[i], replacements[i], 'g');
      after_args := regexp_replace(after_args, patterns[i], replacements[i], 'g');
    end loop;

    if after = before then
      continue;
    end if;

    if after_args is distinct from target.args then
      execute format('drop function public.%I(%s)', target.proname, target.identity_args);
      execute after;

      -- pg_get_function_identity_arguments is types only, so it still names
      -- the recreated function.
      if target.acl is not null then
        -- It had an explicit ACL, which the drop threw away and the recreate
        -- replaced with Postgres's default grant to PUBLIC.
        execute format('revoke execute on function public.%I(%s) from public',
                       target.proname, target.identity_args);
        foreach entry in array target.acl loop
          grantee := split_part(entry, '=', 1);
          if grantee = '' then
            execute format('grant execute on function public.%I(%s) to public',
                           target.proname, target.identity_args);
          else
            execute format('grant execute on function public.%I(%s) to %I',
                           target.proname, target.identity_args, grantee);
          end if;
        end loop;
      end if;
    else
      execute after;
    end if;

    rewritten := rewritten + 1;
  end loop;

  if rewritten <> expected then
    raise exception
      'expected % function bodies to change, rewrote % — the sweep and the migration disagree',
      expected, rewritten;
  end if;

  return rewritten;
end;
$rewriter$;

comment on function public.__rewrite_function_bodies(text[], text[], integer) is
  'Scaffolding for the lane-vocabulary rename. Rewrites plpgsql bodies that a table or column rename left naming the old identifier, restoring ACLs when the signature change forces a drop. Dropped by the migration that ends the series.';

revoke execute on function public.__rewrite_function_bodies(text[], text[], integer) from public;

-- ---------------------------------------------------------------------------
-- The second thing a rename does not move: everything hanging off the table.
--
-- `alter table ... rename to` renames the table and leaves its constraints,
-- indexes, policies and triggers carrying the old word forever. Upstream
-- renamed eleven by hand on one table, plus two more on `cells` that named the
-- old COLUMN. Hand-listing them is how you miss the ones a later migration
-- created — this schema builds its RESTRICTIVE write policies in a loop over a
-- table array, so their names exist nowhere in the source as literals.
--
-- Reading the catalog instead cannot miss them. Constraints go first: renaming
-- a unique or primary-key constraint renames the index behind it, so the index
-- pass would otherwise find a name that is already correct.
-- ---------------------------------------------------------------------------

create or replace function public.__rename_schema_objects(
  old_word text,
  new_word text
) returns integer
language plpgsql
as $renamer$
declare
  target record;
  renamed integer := 0;
begin
  for target in
    select con.conname as name, cls.relname as rel
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and strpos(con.conname, old_word) > 0
    order by con.conname
  loop
    execute format('alter table public.%I rename constraint %I to %I',
                   target.rel, target.name, replace(target.name, old_word, new_word));
    renamed := renamed + 1;
  end loop;

  for target in
    select idx.relname as name
    from pg_class idx
    join pg_namespace nsp on nsp.oid = idx.relnamespace
    where nsp.nspname = 'public' and idx.relkind = 'i'
      and strpos(idx.relname, old_word) > 0
      and not exists (select 1 from pg_constraint con where con.conindid = idx.oid)
    order by idx.relname
  loop
    execute format('alter index public.%I rename to %I',
                   target.name, replace(target.name, old_word, new_word));
    renamed := renamed + 1;
  end loop;

  for target in
    select pol.polname as name, cls.relname as rel
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and strpos(pol.polname, old_word) > 0
    order by pol.polname
  loop
    execute format('alter policy %I on public.%I rename to %I',
                   target.name, target.rel, replace(target.name, old_word, new_word));
    renamed := renamed + 1;
  end loop;

  for target in
    select tg.tgname as name, cls.relname as rel
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and not tg.tgisinternal
      and strpos(tg.tgname, old_word) > 0
    order by tg.tgname
  loop
    execute format('alter trigger %I on public.%I rename to %I',
                   target.name, target.rel, replace(target.name, old_word, new_word));
    renamed := renamed + 1;
  end loop;

  raise notice 'renamed % objects carrying %', renamed, old_word;
  return renamed;
end;
$renamer$;

revoke execute on function public.__rename_schema_objects(text, text) from public;

-- ---------------------------------------------------------------------------
-- The post-condition, which is the check the counting never was.
--
-- An assertion against information_schema.columns cannot see inside a function
-- body, so it passes while the writes are broken. This looks everywhere the old
-- word can still be hiding — table and column names, constraint, index, policy
-- and trigger names, and every plpgsql body — and names what it found.
-- ---------------------------------------------------------------------------

create or replace function public.__assert_vocabulary_gone(
  stems text[],
  identifiers text[],
  kept_columns text[] default '{}'
) returns void
language plpgsql
as $assert$
declare
  stem text;
  identifier text;
  found text[] := '{}';
begin
  foreach stem in array stems loop
    found := found || array(
      select 'table ' || cls.relname
      from pg_class cls join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public' and cls.relkind in ('r', 'v', 'm')
        and strpos(cls.relname, stem) > 0);
    found := found || array(
      select 'constraint ' || con.conname
      from pg_constraint con join pg_namespace nsp on nsp.oid = con.connamespace
      where nsp.nspname = 'public' and strpos(con.conname, stem) > 0);
    found := found || array(
      select 'index ' || idx.relname
      from pg_class idx join pg_namespace nsp on nsp.oid = idx.relnamespace
      where nsp.nspname = 'public' and idx.relkind = 'i'
        and strpos(idx.relname, stem) > 0);
    found := found || array(
      select 'policy ' || pol.polname
      from pg_policy pol
      join pg_class cls on cls.oid = pol.polrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public' and strpos(pol.polname, stem) > 0);
    found := found || array(
      select 'trigger ' || tg.tgname
      from pg_trigger tg
      join pg_class cls on cls.oid = tg.tgrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public' and not tg.tgisinternal
        and strpos(tg.tgname, stem) > 0);
  end loop;

  foreach identifier in array identifiers loop
    found := found || array(
      select 'column ' || cls.relname || '.' || att.attname
      from pg_attribute att
      join pg_class cls on cls.oid = att.attrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public' and cls.relkind = 'r'
        and att.attnum > 0 and not att.attisdropped
        and att.attname = identifier
        and not (cls.relname || '.' || att.attname = any(kept_columns)));
    found := found || array(
      select 'function ' || pro.proname
      from pg_proc pro join pg_namespace nsp on nsp.oid = pro.pronamespace
      where nsp.nspname = 'public' and pro.prokind = 'f'
        and pro.proname not like '\_\_%'
        and pg_get_functiondef(pro.oid) ~ ('\m' || identifier || '\M'));
  end loop;

  if array_length(found, 1) > 0 then
    raise exception 'the old vocabulary is still here: %', array_to_string(found, ', ');
  end if;
end;
$assert$;

revoke execute on function public.__assert_vocabulary_gone(text[], text[], text[]) from public;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000103000000_cell_triggers_are_cell_dependencies.sql
-- ─────────────────────────────────────────────────────────────────────────

-- cell_triggers → cell_dependencies. Written 2026-08-25.
--
-- Everything except the table already said dependency:
--
--   public.set_cell_dependency · public.clear_cell_dependency   the RPCs
--   'dependency_count'                                          deletion_impact
--   copy_dependencies                                           duplicate_path
--
-- WHAT DOES NOT CHANGE: the `kind` column keeps ('trigger', 'needs').
-- "trigger" there is not the container — it is one of two KINDS of dependency,
-- temporal ("sets this off") against functional ("must exist first"). Renaming
-- it would give kind in ('dependency', 'needs'), which is incoherent: `needs`
-- is a dependency too. A genus cannot also be one of its own species.
--
-- The FK constraint names are the load-bearing ones. PostgREST embed hints
-- name them as STRINGS, where nothing type-checks them on either side.

alter table public.cell_triggers rename to cell_dependencies;

select public.__rename_schema_objects('cell_triggers', 'cell_dependencies');

-- `cell_triggers` is an unambiguous identifier, so a word-boundary sweep is
-- safe here in a way it is not for `description`.
select public.__rewrite_function_bodies(
  array['\mcell_triggers\M'],
  array['cell_dependencies'],
  7
);

comment on table public.cell_dependencies is
  'Dependency from one cell to another. kind: trigger (temporal) | needs (functional).';

select public.__assert_vocabulary_gone(
  array['cell_trigger'],
  array['cell_triggers']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000104000000_layers_are_lanes.sql
-- ─────────────────────────────────────────────────────────────────────────

-- layers → lanes, and the two columns that carried the word. Written 2026-08-25.
--
-- The package was already half-renamed and contradicting itself in one
-- statement: `create or replace function public.add_lane` inserts into
-- `public.layers`. The rulebook this package ships — lane-roles.md,
-- data-model.md — is 100% the new vocabulary, so the canvas agent is taught a
-- schema its own backend does not have.
--
-- `CanvasAnnotationLayer` in the frontend is a RENDERING layer and is not
-- touched by any of this: four occurrences, one identifier, unrelated concept.
--
-- The dependent objects are renamed from the catalog rather than by hand. The
-- RESTRICTIVE write policies are built in a loop over a table array, so their
-- names appear nowhere in the source as literals and a hand-written list
-- misses them.

alter table public.layers rename to lanes;
alter table public.lanes  rename column layer_role to lane_role;
alter table public.cells  rename column layer_id   to lane_id;

select public.__rename_schema_objects('layer', 'lane');

-- `cells_layer_step_slot_unique` is named INSIDE upsert_cell's body, as the
-- conflict target. It has no word boundary at `layer`, so it needs its own
-- pattern and has to come before the shorter ones.
select public.__rewrite_function_bodies(
  array[
    '\mcells_layer_step_slot_unique\M',
    '\mlayers\M',
    '\mlayer_id\M',
    '\mlayer_role\M',
    '\mlayer_path\M',
    '\mlayer_map\M'
  ],
  array[
    'cells_lane_step_slot_unique',
    'lanes',
    'lane_id',
    'lane_role',
    'lane_path',
    'lane_map'
  ],
  14
);

-- Comments are attached to the object and survive a rename. Their TEXT does
-- not, and this one is what an adopter reads first.
comment on table public.lanes is 'Blueprint row (swimlane) within a path';
comment on column public.lanes.lane_role is
  'Semantic role key that drives rendering (pill cells, visual rows, divider-line anchoring); the display name stays in lanes.name and is free-form in any language. Canonical values: customer_actions, frontstage_actions, backstage_actions, frontstage_tech, backstage_tech, support_systems, visual, step_visual. The vocabulary is extensible — org-defined custom roles are allowed and render as generic swimlanes. Null = generic swimlane (e.g. actor lanes).';
comment on table public.cells is 'Content at lane × step intersection';
comment on column public.cells.cell_key is
  'Authored key: service/scenario/path/lane/step. Written by the import pipeline for origin=import, minted by upsert_cell for origin=app. Survives re-import; slice_items.cell_keys matches against it.';

select public.__assert_vocabulary_gone(
  array['layer'],
  array['layers', 'layer_id', 'layer_role', 'layer_path', 'layer_map']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000105000000_position_columns_one_name.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Every ordered table calls its ordering column `position`. Written 2026-08-25.
--
--   lanes.row_position               → lanes.position
--   path_steps.column_position       → path_steps.position
--   cells.slot_position              → cells.position
--   phases.order_position            → phases.position
--   service_scenarios.order_position → service_scenarios.position
--   add_lane(at_row)                 → add_lane(at_position)
--
-- `row` and `column` name how a lane and a step happen to be DRAWN today. The
-- compare view already draws the same lanes in a different geometry, so the
-- axis is a rendering fact and not a domain one. `order_` and `slot_` were
-- noise in front of the same idea.
--
-- Plain `position` rather than `lane_position`: `slices.position` and
-- `slice_items.position` already spell it that way, so this makes every
-- ordered table agree instead of inventing a sixth spelling. `position` is not
-- reserved in Postgres — those two columns have worked since they shipped.
--
-- `at_row` fed row_position and named the same rendering. add_step already
-- takes `at_position`.
--
-- Index and constraint names are left alone: `cells_lane_step_slot_unique` and
-- `path_steps_path_column_unique` describe the join they enforce, and renaming
-- them would churn a PostgREST-visible string for no reader's benefit.

alter table public.lanes             rename column row_position    to position;
alter table public.path_steps        rename column column_position to position;
alter table public.cells             rename column slot_position   to position;
alter table public.phases            rename column order_position  to position;
alter table public.service_scenarios rename column order_position  to position;

select public.__rewrite_function_bodies(
  array[
    '\mrow_position\M',
    '\mcolumn_position\M',
    '\mslot_position\M',
    '\morder_position\M',
    '\mat_row\M'
  ],
  array['position', 'position', 'position', 'position', 'at_position'],
  12
);

comment on column public.path_steps.position is 'Blueprint column index for this step on this path';

select public.__assert_vocabulary_gone(
  array[]::text[],
  array['row_position', 'column_position', 'slot_position', 'order_position', 'at_row']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000106000000_service_lifecycles_are_services.sql
-- ─────────────────────────────────────────────────────────────────────────

-- service_lifecycles → services. Written 2026-08-25.
--
-- The table holds one service. "Lifecycle" was the journey THROUGH it, which
-- is what phases already are, so the name described the children.
--
-- `public.services` was a different table once — an unused catalog dropped by
-- the consolidated template schema, seven migrations before this one. Nothing
-- reuses its shape; the name is simply free.
--
-- The rename runs in two passes because two different spellings carry the same
-- idea, and the longer one has to go first or `service_lifecycle` becomes
-- `service_service`.

alter table public.service_lifecycles rename to services;

alter table public.phases       rename column service_lifecycle_id to service_id;
alter table public.slices       rename column service_lifecycle_id to service_id;
alter table public.findings     rename column service_lifecycle_id to service_id;
alter table public.evidence     rename column service_lifecycle_id to service_id;
alter table public.propositions rename column service_lifecycle_id to service_id;

select public.__rename_schema_objects('service_lifecycle', 'service');
select public.__rename_schema_objects('lifecycle', 'service');

select public.__rewrite_function_bodies(
  array['\mservice_lifecycles\M', '\mservice_lifecycle_id\M', '\mlifecycle_id\M'],
  array['services', 'service_id', 'service_id'],
  3
);

comment on table public.services is 'The service this blueprint describes, end to end';

select public.__assert_vocabulary_gone(
  array['lifecycle'],
  array['service_lifecycles', 'service_lifecycle_id', 'lifecycle_id']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000107000000_service_scenarios_are_scenarios.sql
-- ─────────────────────────────────────────────────────────────────────────

-- service_scenarios → scenarios. Written 2026-08-25.
--
-- `service_` prefixed a table that lives two levels below the service, under a
-- phase. Every RPC that touches one already drops it: create_scenario,
-- duplicate_scenario, rename_scenario, delete_scenario, and the
-- `scenario_id` parameter on six more.

alter table public.service_scenarios rename to scenarios;

alter table public.paths rename column service_scenario_id to scenario_id;
alter table public.steps rename column service_scenario_id to scenario_id;

select public.__rename_schema_objects('service_scenario', 'scenario');

select public.__rewrite_function_bodies(
  array['\mservice_scenarios\M', '\mservice_scenario_id\M'],
  array['scenarios', 'scenario_id'],
  14
);

comment on table public.scenarios is 'Scenario within a phase';
comment on column public.steps.scenario_id is 'Scenario that owns this canonical step';

select public.__assert_vocabulary_gone(
  array['service_scenario'],
  array['service_scenarios', 'service_scenario_id']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000108000000_description_is_a_summary.sql
-- ─────────────────────────────────────────────────────────────────────────

-- description → summary, on the five tables that carry one. Written 2026-08-25.
--
--   services.summary · phases.summary · scenarios.summary
--   paths.summary    · cells.summary
--
-- The field answers "what is this, in one line", which is a summary. The panel
-- editor already labels it "Summary" above a column called `description`.
--
-- `slices.description` KEEPS ITS NAME and is asserted to keep it below. A
-- slice's description is prose the author writes about the slice, not a
-- one-line gloss of a row, and collapsing the two words would lose that.
--
-- THE AMBIGUITY: `description` is a word, not an identifier — five tables had
-- one, a sixth still does, and `tech_description` is a link TYPE inside
-- cells.links. Upstream replaced each fragment by name for exactly this
-- reason. Here a word-boundary sweep is provably safe instead, and the proof
-- is cheap: three function bodies name a description, every fragment in them
-- belongs to one of the five renamed columns, and `\mdescription\M` cannot
-- match inside `tech_description` because an underscore is a word character.
-- The count below is the assertion that this stayed true.

alter table public.services  rename column description to summary;
alter table public.phases    rename column description to summary;
alter table public.scenarios rename column description to summary;
alter table public.paths     rename column description to summary;
alter table public.cells     rename column description to summary;

select public.__rewrite_function_bodies(
  array['\mdescription\M'],
  array['summary'],
  3
);

comment on column public.paths.summary is 'Optional summary of what this path variant represents';
comment on column public.cells.summary is
  'Optional longer cell summary (detail panel, not grid label)';

select public.__assert_vocabulary_gone(
  array[]::text[],
  array['description'],
  array['slices.description']
);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000109000000_the_lane_vocabulary_is_a_schema_version.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The shape changed, so the number changes. Written 2026-08-25.
--
-- Ten renames landed above. A target carrying 2026.07.16 and a target carrying
-- this one disagree about the name of nearly every table an IR touches, and
-- the adapter contract's compatibility check is the thing that has to notice.
-- src/lib/backend/schemaVersion.ts holds the matching supported list.
--
-- The scaffolding goes with them. __rewrite_function_bodies and its two
-- companions exist for one vocabulary change; leaving a catalog-rewriting
-- SECURITY INVOKER function in the schema afterwards would be leaving a loaded
-- tool on the bench.

update public.schema_version
set version = '2026.08.25',
    applied_at = now();

do $do$
begin
  if not exists (select 1 from public.schema_version where version = '2026.08.25') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$do$;

drop function public.__rewrite_function_bodies(text[], text[], integer);
drop function public.__rename_schema_objects(text, text);
drop function public.__assert_vocabulary_gone(text[], text[], text[]);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000110000000_the_ir_can_author_a_needs_edge.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The IR can finally say `needs`, so the number changes. Written 2026-08-26.
--
-- NO DDL, deliberately. `cell_dependencies.kind check (kind in
-- ('trigger','needs'))` has been in this schema since 20260729120000 and the
-- app has read both kinds ever since. The half that could not express a needs
-- edge was the IR: `$defs.trigger` carried only `source` and `target` under
-- `additionalProperties: false`, so a needs edge was dropped on export and
-- could not survive a re-import. references/ir-schema.json 2026.08.26 gives
-- the edge an optional `kind`.
--
-- The number still moves here, because `schema_version` is ONE contract
-- version across both halves — an IR file, a workspace, and a live target all
-- state the same string, and src/lib/backend/schemaVersion.ts speaks a list of
-- them, not a range. A target left at 2026.08.25 stays supported and stays
-- correct: the columns are identical either way.

update public.schema_version
set version = '2026.08.26',
    applied_at = now();

do $do$
begin
  if not exists (select 1 from public.schema_version where version = '2026.08.26') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$do$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000111000000_propositions_are_the_business_model.sql
-- ─────────────────────────────────────────────────────────────────────────

-- propositions → business_model. Written 2026-08-27.
--
-- The last row of the vocabulary map that still applies here (#84). Five rows
-- landed in the 2100 series on 2026-08-25; `sets_off` and `cells.maturity`
-- never existed in this package, so this is the remainder.
--
-- WHY THE WORD HAD TO GO. The table holds one business-model record per
-- service — funding, pricing, delivery cost, revenue model. "Proposition"
-- already means something else one level down: a CELL's value proposition,
-- carried in `cells.value_props`. One word for two concepts at two altitudes
-- is the collision, and the table is the one wearing the borrowed name.
--
-- THE COLUMN THAT KEEPS THE WORD, PERMANENTLY. `evidence.proposition_question_key`
-- records which of the three validation questions an evidence row answers —
-- `understand`, `value`, `usability`. Those three ARE propositions in the
-- ordinary sense: claims the service is betting on. The rename moves the
-- container, not the concept, so the column stays and is asserted below rather
-- than merely left alone. Note it is not an accident that the catalog sweep
-- cannot reach it: the sweep keys on the PLURAL `propositions`, the column is
-- singular, and its check constraint was explicitly named
-- `evidence_question_key_check` with no `proposition` in it.
--
-- NO SCAFFOLDING IS RE-ERECTED. `21000109` dropped `__rename_schema_objects`
-- and its two companions on the stated grounds that leaving a catalog-rewriting
-- SECURITY INVOKER function in the schema is "leaving a loaded tool on the
-- bench". That reasoning holds, so this migration does not bring them back for
-- one more use: the object sweep is inlined as an anonymous block, which never
-- exists as a callable object at all.
--
-- The rewriter is not needed either, and that was checked rather than assumed:
-- no persistent plpgsql body in the series names `propositions`. The only
-- source occurrence inside a function-shaped construct is the table array in
-- `20260818002000_service_account_tier.sql`, which is itself an anonymous `do`
-- block and leaves no body behind. The policies it builds in that loop are
-- exactly why the sweep below reads the catalog instead of a hand-written list
-- — their names appear nowhere in the source as literals.

alter table public.propositions rename to business_model;

-- ---------------------------------------------------------------------------
-- Everything hanging off the table, which the rename above does not move.
--
-- Constraints first: renaming a unique or primary-key constraint renames the
-- index behind it, so an index pass run first would find a name that is already
-- correct and a second pass would miss it. Same order as
-- `__rename_schema_objects` used, for the same reason.
--
-- The sweep keys on `propositions` and not on `proposition`. With the singular
-- it would rename `propositions_select_auth` to `business_models_select_auth`
-- and leave a plural `s` welded to a singular noun on every object it touched.
-- ---------------------------------------------------------------------------

do $sweep$
declare
  target record;
  renamed integer := 0;
begin
  for target in
    select con.conname as name, cls.relname as rel
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and strpos(con.conname, 'propositions') > 0
    order by con.conname
  loop
    execute format('alter table public.%I rename constraint %I to %I',
                   target.rel, target.name,
                   replace(target.name, 'propositions', 'business_model'));
    renamed := renamed + 1;
  end loop;

  for target in
    select idx.relname as name
    from pg_class idx
    join pg_namespace nsp on nsp.oid = idx.relnamespace
    where nsp.nspname = 'public' and idx.relkind = 'i'
      and strpos(idx.relname, 'propositions') > 0
      and not exists (select 1 from pg_constraint con where con.conindid = idx.oid)
    order by idx.relname
  loop
    execute format('alter index public.%I rename to %I',
                   target.name, replace(target.name, 'propositions', 'business_model'));
    renamed := renamed + 1;
  end loop;

  for target in
    select pol.polname as name, cls.relname as rel
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and strpos(pol.polname, 'propositions') > 0
    order by pol.polname
  loop
    execute format('alter policy %I on public.%I rename to %I',
                   target.name, target.rel,
                   replace(target.name, 'propositions', 'business_model'));
    renamed := renamed + 1;
  end loop;

  for target in
    select tg.tgname as name, cls.relname as rel
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and not tg.tgisinternal
      and strpos(tg.tgname, 'propositions') > 0
    order by tg.tgname
  loop
    execute format('alter trigger %I on public.%I rename to %I',
                   target.name, target.rel,
                   replace(target.name, 'propositions', 'business_model'));
    renamed := renamed + 1;
  end loop;

  raise notice 'renamed % objects carrying propositions', renamed;
end
$sweep$;

comment on table public.business_model is
  'One business-model record per service. The three validation questions live as evidence rows keyed understand|value|usability. Restricted SELECT.';

comment on column public.business_model.created_by is
  'The caller at insert; null for service-key writes.';

-- ---------------------------------------------------------------------------
-- The post-condition. Counting how many objects were renamed proves only that
-- the loop ran; asking the catalog what is left proves the thing the migration
-- claims.
-- ---------------------------------------------------------------------------

do $assert$
declare
  found text[] := '{}';
begin
  found := found || array(
    select 'table ' || cls.relname
    from pg_class cls join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and cls.relkind in ('r', 'v', 'm')
      and strpos(cls.relname, 'propositions') > 0);
  found := found || array(
    select 'column ' || cls.relname || '.' || att.attname
    from pg_attribute att
    join pg_class cls on cls.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and att.attnum > 0 and not att.attisdropped
      and strpos(att.attname, 'propositions') > 0);
  found := found || array(
    select 'constraint ' || con.conname
    from pg_constraint con join pg_namespace nsp on nsp.oid = con.connamespace
    where nsp.nspname = 'public' and strpos(con.conname, 'propositions') > 0);
  found := found || array(
    select 'index ' || idx.relname
    from pg_class idx join pg_namespace nsp on nsp.oid = idx.relnamespace
    where nsp.nspname = 'public' and idx.relkind = 'i'
      and strpos(idx.relname, 'propositions') > 0);
  found := found || array(
    select 'policy ' || pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and strpos(pol.polname, 'propositions') > 0);
  found := found || array(
    select 'trigger ' || tg.tgname
    from pg_trigger tg
    join pg_class cls on cls.oid = tg.tgrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and not tg.tgisinternal
      and strpos(tg.tgname, 'propositions') > 0);
  found := found || array(
    select 'function ' || pro.proname
    from pg_proc pro join pg_namespace nsp on nsp.oid = pro.pronamespace
    where nsp.nspname = 'public' and pro.prokind = 'f'
      and strpos(coalesce(pro.prosrc, ''), 'propositions') > 0);

  if array_length(found, 1) > 0 then
    raise exception 'propositions survives the rename in: %', array_to_string(found, ', ');
  end if;

  -- The table arrived under its new name, rather than the word merely leaving.
  if to_regclass('public.business_model') is null then
    raise exception 'business_model does not exist — the rename removed a table instead of moving it';
  end if;

  -- And the one occurrence that is meant to survive, asserted so a later sweep
  -- that removes it fails here instead of silently narrowing the evidence model.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'evidence'
      and column_name = 'proposition_question_key'
  ) then
    raise exception
      'evidence.proposition_question_key is gone — it is a permanent exemption, not residue (#84)';
  end if;
end
$assert$;

-- ---------------------------------------------------------------------------
-- The shape changed, so the number changes — `21000109`'s rule, and
-- `21000110` applied it even for a change with no DDL at all, on the grounds
-- that `schema_version` is ONE contract. A renamed table is the loudest kind of
-- shape change: a target at 2026.08.26 answers to `propositions` and a target
-- at this number does not.
--
-- Older numbers are NOT evicted from the supported list, following the
-- precedent this series set rather than a fresh judgement: `21000104` renamed
-- `layers` to `lanes` and 2026.07.16 stayed listed. A version leaves that list
-- when the migration that would carry it forward stops existing, which is a
-- deliberate act. That migration still exists — it is this file.
--
-- src/lib/backend/schemaVersion.ts carries the matching entry; `check:version`
-- fails if the two disagree.
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.08.27',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.08.27') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000112000000_the_word_boundary_left_five_behind.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 21000112000000 — what `\m…\M` could not reach.
--
-- FOUND BY THE SWEEP, ON ITS FIRST RUN AGAINST A REAL DATABASE. Five objects
-- still carrying retired vocabulary, four of them prose and one of them a
-- dangling reference that breaks an RPC the app and the agent both call.
--
-- THE ONE THAT MATTERS. `set_cell_dependency` ends with
--
--   on conflict on constraint cell_triggers_source_target_kind_unique
--
-- and no such constraint exists. `21000103` renamed the table with a catalogue
-- sweep — `strpos` and `replace`, no word boundaries — so the constraint became
-- `cell_dependencies_source_target_kind_unique`. It rewrote function bodies
-- with a different tool and a different pattern:
--
--   select public.__rewrite_function_bodies(array['\mcell_triggers\M'], …)
--
-- `\M` asserts a word END, `_` is a word CONSTITUENT in Postgres regex, and so
-- `\mcell_triggers\M` cannot match inside `cell_triggers_source_target_kind_unique`.
-- The table reference in the same body was rewritten; the constraint name three
-- lines below it was not. `on conflict on constraint` resolves at execution, so
-- nothing failed at migration time and nothing has failed since — the function
-- raises the first time a user connects two cells on an instance built from
-- this series.
--
-- This is the identical failure the vocabulary guards were ported to catch, and
-- it is written down in two places in this repository already: `21000104`'s
-- header records having to give `cells_layer_step_slot_unique` its own pattern
-- for the same reason, and `scripts/retired-vocabulary.mjs` says the enforced
-- fragments are SUBSTRINGS because a word-boundary pattern is what lets a name
-- like this survive. Both were written from an upstream incident. This one is
-- ours, and it was here the whole time.
--
-- THE OTHER FOUR are prose: three comments and one `--` line inside a function
-- body. A comment is read by the next person and by an agent reading the
-- schema, so a stale one is a wrong answer with a citation.
--
-- NO SCHEMA VERSION BUMP, deliberately. `schema_version` records the SHAPE the
-- app codes against, and nothing here moves it: no table, column, signature or
-- IR field changes, and the app's call to `set_cell_dependency` is byte for
-- byte the call it was already making. A bump would tell every instance its
-- target is incompatible in order to ship a repair, and this series has
-- precedent for not doing that — `21000103` through `21000108` were six
-- migrations under one version. What the bump would buy is the ability to tell
-- a repaired database from a broken one by its stamp, which is worth wanting
-- and is not what a compatibility stamp is for.
--
-- NO SCAFFOLDING COMES BACK. `21000102`'s three helpers were dropped by
-- `21000109` and stay dropped, following `21000111`: the body rewrite is an
-- anonymous block and never exists as a callable object.

-- ---------------------------------------------------------------------------
-- Function bodies. Plain `replace` on the full definition — the reason this
-- migration exists is a pattern that was too clever, so this one is not.
-- ---------------------------------------------------------------------------

do $bodies$
declare
  target record;
  -- An array, not a record: `foreach … slice 1` hands back a text[] row of the
  -- 2-D literal below, and plpgsql rejects a record variable for it outright.
  edit text[];
  rewritten integer := 0;
  edits constant text[][] := array[
    -- The dangling constraint reference.
    array['cell_triggers_source_target_kind_unique',
          'cell_dependencies_source_target_kind_unique'],
    -- Prose inside `duplicate_path`, describing the join it is about to write.
    array['(path, layer, step, slot)', '(path, lane, step, slot)']
  ];
begin
  foreach edit slice 1 in array edits loop
    for target in
      select pro.oid, pro.proname, pg_get_functiondef(pro.oid) as body
      from pg_proc pro
      join pg_namespace nsp on nsp.oid = pro.pronamespace
      where nsp.nspname = 'public' and pro.prokind = 'f'
        and strpos(pg_get_functiondef(pro.oid), edit[1]) > 0
      order by pro.proname
    loop
      execute replace(target.body, edit[1], edit[2]);
      rewritten := rewritten + 1;
    end loop;
  end loop;

  -- Two edits, one function each. A zero here means an earlier migration
  -- already fixed one and this file is stale; a larger number means the
  -- literal is less distinctive than it looks. Either way, look before you
  -- lower it.
  if rewritten <> 2 then
    raise exception 'expected 2 function bodies to rewrite, rewrote %', rewritten;
  end if;
end
$bodies$;

-- ---------------------------------------------------------------------------
-- Comments. Rewritten in full rather than patched, so the text this schema
-- carries is the text in this file.
-- ---------------------------------------------------------------------------

comment on table public.phases is 'Ordered phase within a service';

comment on column public.cells.position is
  'Ordering within one (lane, step) slot. 0 for single-cell slots; tech-lane touchpoints occupy 0..n.';

comment on column public.slices.slice_type is
  'How the cut was made: journey (experience closure for an actor) | step (one column) | lane (one lane over the service) | cell (single-cell spec) | custom.';

-- ---------------------------------------------------------------------------
-- The post-condition, and the one this series did not have.
-- ---------------------------------------------------------------------------

do $assert$
declare
  found text[] := '{}';
  word text;
  words constant text[] := array['layer', 'lifecycle', 'cell_trigger',
                                 'service_scenario', 'propositions'];
begin
  -- What `scripts/check-retired-identifiers.mjs` sweeps, for the two kinds no
  -- rename moves: prose in a comment, and anything inside a function body.
  foreach word in array words loop
    found := found || array(
      select 'comment on ' || cls.relname ||
             coalesce('.' || att.attname, '') || ' — "' || word || '"'
      from pg_description des
      join pg_class cls on cls.oid = des.objoid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      left join pg_attribute att
             on att.attrelid = des.objoid and att.attnum = des.objsubid
                                          and des.objsubid > 0
      where nsp.nspname = 'public' and strpos(des.description, word) > 0);
    found := found || array(
      select 'function body ' || pro.proname || ' — "' || word || '"'
      from pg_proc pro
      join pg_namespace nsp on nsp.oid = pro.pronamespace
      where nsp.nspname = 'public' and pro.prokind = 'f'
        and strpos(coalesce(pro.prosrc, ''), word) > 0);
  end loop;

  if array_length(found, 1) > 0 then
    raise exception 'retired vocabulary survives: %', array_to_string(found, ', ');
  end if;
end
$assert$;

-- The reference the rewrite now names has to be real. Without this the edit
-- above could swap one dangling constraint name for another and every check in
-- this file would still pass — which is exactly how the original defect went
-- unnoticed: nothing asserted that the name in the body resolves.
do $resolves$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public' and cls.relname = 'cell_dependencies'
      and con.conname = 'cell_dependencies_source_target_kind_unique'
  ) then
    raise exception
      'set_cell_dependency now names cell_dependencies_source_target_kind_unique, which does not exist';
  end if;
end
$resolves$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000113000000_one_column_held_two_unrelated_things.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 21000113000000 — `cells.links` held two concepts, and was named after
-- neither.
--
-- The column stores a jsonb array of `{type, label, url?, description?,
-- picture?, pictures?}`. Two shapes live in it, and the IR schema admits
-- exactly those two:
--
--   type = 'url'               a thing the cell points at. The Resources tab
--                              lists these and nothing else.
--   type = 'tech_description'  prose, a screenshot and a design link about ONE
--                              touchpoint used at this cell, found again by
--                              matching `label` against a line of
--                              `cells.content`.
--
-- One column, two concepts, and no label can be its name: `Links` over the tab
-- would promise both and show one, `Resources` on the column would be wrong
-- for half its rows. CONTEXT.md's interface→schema map has carried that as a
-- recorded divergence since the map was written, and said the fix would be a
-- schema change rather than a naming one. This is that change, and the map row
-- it was holding open goes with it.
--
-- ── The join that is only a string ─────────────────────────────────────────
--
-- A `tech_description` entry finds its touchpoint by comparing its `label` to
-- a line of the cell's own `content`. There is no join but the string, so when
-- the two stop agreeing the prose is not found and nothing says so — a rename
-- in the grid silently orphans the paragraph behind it. Moving the prose onto
-- a row of its own gives it an identity that a rename cannot break.
--
-- ── Two tables, and what each is for ───────────────────────────────────────
--
-- `cell_touchpoints` is the PLACEMENT: this touchpoint, used at this cell,
-- this way. It owns the per-moment `summary`, `screenshots` and `url`, because
-- those are what differ between two uses of the same tool — the second use
-- describes a different screen and points at a different design file.
--
-- `resources` is what a cell — or one placement — points at. A link is one
-- kind of resource, so the table is named for the parent concept and `kind`
-- carries the subtype.
--
-- ── Four decisions inside those two tables ─────────────────────────────────
--
-- 1. A resource attaches to a cell OR to one placement, never both and never
--    neither, enforced by `num_nonnulls(...) = 1` in the schema rather than by
--    agreement in the client — the construction `evidence_exactly_one_target`
--    already uses here. That constraint is what lets a design link belong to
--    the tool it documents rather than to the cell at large.
--
--    NOTHING IS ATTACHED TO A PLACEMENT BY THIS FILE, and nothing in the app
--    writes one yet. Deciding which of a cell's resources really documents one
--    of its touchpoints is an authoring act, and doing it by pattern-matching
--    labels here would be a guess per row. The capability and its constraint
--    ship; the attaching does not. That is stated here rather than left to be
--    found, because a column with no writer is the shape this whole ticket is
--    about — and the constraint is exercised below against the real table, in
--    both directions, so it is a rule rather than a hope.
--
-- 2. `kind` admits `link` and `other`, and the short list is the decision
--    rather than an omission. Every row this file writes is a link, and
--    `other` is the residual every kind column in this schema carries. A value
--    nothing can produce is a vocabulary nobody can check, so the list grows
--    when something produces a second kind.
--
-- 3. `name`, not `label`. This vocabulary gives a NAME to a thing a reader
--    navigates to and a TITLE to authored content a reader reads. A resource
--    is the first: the text names whatever is on the other end of the url.
--    `label` survives on `cell_dependencies` because an edge label genuinely
--    is a tag on a line and not a name for anything.
--
-- 4. `screenshots text[]`, not one `screenshot`. The link shape carries BOTH
--    `picture` and `pictures`, with `pictures` winning where both are set, and
--    `resolveCellDetailPictures` already returns an array to its caller. One
--    array column is what those two fields were always describing, and a
--    single-valued column would silently drop every entry after the first the
--    day an author used the plural field — the loss this file exists to stop.
--
-- ── Provenance goes to `evidence` ──────────────────────────────────────────
--
-- `evidence` exists, has exactly the right columns, and is where a citation
-- belongs. The IR admits two link types and neither is a citation, so a
-- well-formed board has none to move — but the column is jsonb and has
-- accepted anything since it was created, and this file DROPS it, which
-- turns anything left behind from unreachable into gone. So a `ref`-typed
-- entry is carried into `evidence` rather than destroyed, `kind` is `other`
-- because sorting one-line citations into eight buckets by pattern-matching
-- their text is the guess this ticket exists to stop making, and `added_by`
-- records where they came from so the next person can sort them deliberately.
--
-- Anything that is none of the three shapes stops this migration. A fourth
-- shape dropped in silence is how a column comes to hold three things.
--
-- ── One question, one answer: the name of an unnamed resource ──────────────
--
-- Every `url` entry the IR admits carries a label, so the fallback below moves
-- nothing on a well-formed board. It is here because `name` is not null and an
-- entry can arrive without one, and it is the SAME RULE the app applies, in
-- the same characters: `RESOURCE_NAME_FROM_URL` in `src/lib/cellResources.ts`
-- carries this pattern verbatim, and `scripts/tests/one-name-for-an-unnamed-
-- resource.test.ts` fails when the two texts differ. Two answers to "what is
-- this called when nobody said" is how a board starts disagreeing with itself
-- about its own contents.

-- ---------------------------------------------------------------------------
-- The placement
-- ---------------------------------------------------------------------------

create table public.cell_touchpoints (
  id          uuid primary key default gen_random_uuid(),
  cell_id     uuid not null references public.cells (id) on delete cascade,
  -- The touchpoint's name AT THIS CELL. Free text rather than a foreign key
  -- into a catalog: this schema has no catalog of touchpoints, a touchpoint
  -- being a line of `cells.content` today, and inventing one here would mean
  -- deciding for every name whether two spellings are one tool — a guess per
  -- name, in a file whose whole purpose is to stop guessing. A catalog, when
  -- it comes, replaces this column with a reference and moves every placement
  -- at once; until then the placement carries the name it was authored with.
  name        text not null,
  position    int  not null,
  summary     text,
  -- See decision 4. Empty array rather than null: "no screenshots" is one
  -- state, and a reader that has to check for two of them checks for one.
  screenshots text[] not null default '{}'::text[],
  url         text,
  origin      text not null check (origin in ('import', 'app')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A cell names a touchpoint once. Two placements of one name at one moment
  -- are two paragraphs about the same thing with no way to tell them apart,
  -- which is the string join's failure wearing different clothes.
  constraint cell_touchpoints_cell_name_unique unique (cell_id, name),
  -- Deferrable: a reorder swaps two positions inside one transaction and an
  -- immediate check fails halfway through the swap.
  constraint cell_touchpoints_cell_position_unique
    unique (cell_id, position) deferrable initially deferred
);

comment on table public.cell_touchpoints is
  'One touchpoint, used at one cell. Owns the summary, screenshots and design '
  'link for THIS moment, which is what differs between two uses of the same '
  'tool. Replaces the tech_description entries of the old cells.links column, '
  'which found their touchpoint by matching a string.';
comment on column public.cell_touchpoints.name is
  'What the touchpoint is called at this cell. There is no catalog yet; a '
  'catalog replaces this column with a reference.';
comment on column public.cell_touchpoints.screenshots is
  'Screenshots or illustrations for this moment, in author order.';
comment on column public.cell_touchpoints.url is
  'The design file or external reference for THIS moment, not for the tool.';

-- ---------------------------------------------------------------------------
-- The resources
-- ---------------------------------------------------------------------------

create table public.resources (
  id                 uuid primary key default gen_random_uuid(),
  -- Exactly one of these two is set. `cascade` on both: a resource is a
  -- property of the thing it hangs off and outlives neither.
  cell_id            uuid references public.cells (id) on delete cascade,
  cell_touchpoint_id uuid references public.cell_touchpoints (id) on delete cascade,
  kind               text not null default 'link'
                       check (kind in ('link', 'other')),
  name               text not null,
  url                text,
  position           int  not null,
  origin             text not null check (origin in ('import', 'app')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Decision 1, in the schema rather than in the client.
  constraint resources_one_owner
    check (num_nonnulls(cell_id, cell_touchpoint_id) = 1),
  -- A link with no url renders nowhere, which is what a misfiled citation was.
  constraint resources_link_has_url
    check (kind <> 'link' or nullif(btrim(url), '') is not null),
  -- Deferrable for the reason the placement's is.
  constraint resources_cell_position_unique
    unique (cell_id, position) deferrable initially deferred,
  constraint resources_touchpoint_position_unique
    unique (cell_touchpoint_id, position) deferrable initially deferred
);

comment on table public.resources is
  'Things a cell, or one touchpoint placement, points at. A link is one kind '
  'of resource and `kind` carries the subtype. Exactly one of cell_id and '
  'cell_touchpoint_id is set, so a design link can belong to the tool it '
  'documents rather than to the cell at large.';
comment on column public.resources.name is
  'What the thing on the other end is called. `name`, not `label`: a reader '
  'navigates to it.';

-- No separate foreign-key indexes on either table: each unique constraint
-- above leads with its owning column, so `where cell_id = ?` and
-- `where cell_touchpoint_id = ?` are already served by one.

create trigger set_cell_touchpoints_updated_at
  before update on public.cell_touchpoints
  for each row execute function public.set_updated_at();

create trigger set_resources_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Prove the owner constraint, both ways
--
-- A CHECK that was written and never exercised is indistinguishable from one
-- that was written wrong, and this is the one design point the ticket is firm
-- on. So both halves of `num_nonnulls(...) = 1` are attempted against the real
-- constraint. Neither insert leaves a row: either the constraint refuses it,
-- or it does not and this migration stops.
--
-- The first needs nothing to exist, so it runs on an empty database too. The
-- second needs a placement to point at — there is none yet at this point in
-- the file, so it is deferred until after the data has moved, at the bottom.
-- ---------------------------------------------------------------------------

do $probe$
begin
  begin
    insert into public.resources (kind, name, url, position, origin)
    values ('link', 'ZZ Probe', 'https://example.invalid/', 1, 'app');
    raise exception
      'a resource owned by neither a cell nor a placement was accepted';
  exception
    when check_violation then null;
  end;
end
$probe$;

-- ---------------------------------------------------------------------------
-- The touchpoint prose
--
-- Every `tech_description` entry becomes a placement on the cell that carried
-- it, whether or not its label still matches a line of that cell's content. A
-- label that matches nothing is exactly the orphan the string join produced,
-- and dropping those to a "resolves today" filter would destroy the authored
-- paragraph on the way past. The name it was authored with is preserved, and
-- reattaching an orphan is an edit somebody can now make to a row.
--
-- `with ordinality` keeps the order the author typed. `pictures` wins over
-- `picture` where an entry carries both, which is what the reader already
-- does.
-- ---------------------------------------------------------------------------

insert into public.cell_touchpoints
  (cell_id, name, position, summary, screenshots, url, origin)
select
  c.id,
  btrim(item.link ->> 'label'),
  row_number() over (partition by c.id order by item.ord)::int,
  nullif(btrim(coalesce(item.link ->> 'description', '')), ''),
  coalesce(
    (select array_agg(btrim(picture.value #>> '{}') order by picture.ord)
     from jsonb_array_elements(
            case
              when jsonb_typeof(item.link -> 'pictures') = 'array'
                then item.link -> 'pictures'
              else '[]'::jsonb
            end)
          with ordinality as picture(value, ord)
     where nullif(btrim(picture.value #>> '{}'), '') is not null),
    case
      when nullif(btrim(coalesce(item.link ->> 'picture', '')), '') is not null
        then array[btrim(item.link ->> 'picture')]
      else '{}'::text[]
    end),
  nullif(btrim(coalesce(item.link ->> 'url', '')), ''),
  'import'
from public.cells c
cross join lateral
  jsonb_array_elements(c.links) with ordinality as item(link, ord)
where item.link ->> 'type' = 'tech_description'
  and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- The resources
--
-- `row_number` makes the position 1-based and contiguous per cell, which is
-- what the position constraint and the sync function below both assume. A cell
-- may hold the same url twice — that is the author's business, and there is
-- deliberately no unique on url.
-- ---------------------------------------------------------------------------

insert into public.resources (cell_id, kind, name, url, position, origin)
select
  c.id,
  'link',
  coalesce(
    nullif(btrim(coalesce(item.link ->> 'label', '')), ''),
    nullif(
      regexp_replace(
        lower(btrim(item.link ->> 'url')),
        '^https?://(?:[^@/?#]*@)?(?:www\.)?([^/?#:]+).*$',
        '\1'),
      lower(btrim(item.link ->> 'url'))),
    'Link'),
  btrim(item.link ->> 'url'),
  row_number() over (partition by c.id order by item.ord)::int,
  'import'
from public.cells c
cross join lateral
  jsonb_array_elements(c.links) with ordinality as item(link, ord)
where item.link ->> 'type' = 'url'
  and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- The citations
-- ---------------------------------------------------------------------------

insert into public.evidence
  (service_id, cell_id, cell_key, kind, title, ref, added_by)
select
  ph.service_id,
  c.id,
  -- `evidence_cell_key_paired` demands a key whenever `cell_id` is set, and
  -- `cells.cell_key` is nullable. `mint_cell_key` answers with the key the
  -- import pipeline would have given that cell, which is a derivation rather
  -- than a guess.
  coalesce(c.cell_key, public.mint_cell_key(c.path_id, c.lane_id, c.step_id)),
  'other',
  btrim(item.link ->> 'label'),
  nullif(
    btrim(coalesce(item.link ->> 'ref', item.link ->> 'url', '')),
    ''),
  'cells-links-split'
from public.cells c
join public.paths p on p.id = c.path_id
join public.scenarios s on s.id = p.scenario_id
join public.phases ph on ph.id = s.phase_id
cross join lateral jsonb_array_elements(c.links) as item(link)
where item.link ->> 'type' = 'ref'
  and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- Rewriting a cell's resources is one transaction
--
-- The resources tab replaces a whole list. PostgREST gives every statement its
-- own transaction, and a deferred position constraint only forgives a
-- collision until COMMIT — so a delete followed by an insert over the wire is
-- two transactions and a window where the cell has no resources at all.
--
-- Delete-and-reinsert rather than a diff, and the difference from a placement
-- is the point: a placement carries a per-moment summary and screenshots that
-- a delete would destroy, while a resource carries nothing that is not in the
-- list being written. The simpler operation is also the correct one.
--
-- Placement-attached resources are untouched. This is the CELL's editor, and
-- it reaches only rows whose `cell_id` is this cell.
-- ---------------------------------------------------------------------------

create or replace function public.sync_cell_resources(
  p_cell_id uuid,
  p_rows    jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_nameless int;
begin
  if not exists (select 1 from public.cells c where c.id = p_cell_id) then
    raise exception 'cell % does not exist', p_cell_id;
  end if;

  -- Refused rather than defaulted. The editor already falls back to the url's
  -- host, so a nameless row arriving here means a caller skipped that, and
  -- inventing a name on its behalf hides the bug and adds a second answer to
  -- the question this file's header settles.
  select count(*) into v_nameless
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(kind text, name text, url text)
  where nullif(btrim(coalesce(r.name, '')), '') is null;
  if v_nameless <> 0 then
    raise exception '% resource(s) arrived with no name', v_nameless;
  end if;

  delete from public.resources where cell_id = p_cell_id;

  insert into public.resources (cell_id, kind, name, url, position, origin)
  select p_cell_id,
         coalesce(nullif(btrim(coalesce(r.kind, '')), ''), 'link'),
         btrim(r.name),
         nullif(btrim(coalesce(r.url, '')), ''),
         r.ord::int,
         'app'
  -- `rows from (... as (...)) with ordinality`, not
  -- `jsonb_to_recordset(...) with ordinality as r(...)`. Postgres refuses the
  -- second outright — "WITH ORDINALITY cannot be used with a column definition
  -- list" — and nothing static would catch it: the file parses, a replay
  -- against an empty database never calls the function, and a unit test that
  -- stubs the RPC never reaches it. It takes running the real function against
  -- a real server, which is why this one was.
  from rows from (
    jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as (kind text, name text, url text)
  ) with ordinality as r(kind, name, url, ord);
end
$function$;

comment on function public.sync_cell_resources(uuid, jsonb) is
  'Replace one cell''s resources in a single transaction, in list order. '
  'Placement-attached resources are not this function''s business.';


-- ---------------------------------------------------------------------------
-- The functions that read the column, before it goes
--
-- Two read `cells.links`: `duplicate_path` and `duplicate_scenario`, which
-- copy every authored column of a cell.
--
-- They are rewritten from the definition the DATABASE holds rather than from
-- the file that created them, and that is deliberate. The rename band
-- 21000103..21000112 rewrote these bodies in place, so the newest FILE
-- defining them still says `layers`, `slot_position`, `description` and
-- `service_scenario_id` while the database says none of those. Re-creating
-- from a file that has drifted resurrects whatever it drifted from, and
-- nothing would report it. Reading the catalogue cannot drift by construction.
--
-- Every substitution is asserted to have matched, and a sweep at the bottom of
-- this file proves the rewrite reached both — because a `replace` that
-- silently matched nothing is how a rename comes to look applied while a
-- function still carries the old word, which is what 21000112 was written to
-- clean up.
--
-- The copy carries the new tables rather than losing them. Before this file, a
-- duplicated path carried its resources and its touchpoint prose because both
-- were columns of the row being copied; splitting them into tables would take
-- that away silently. The join onto the copies is (path, lane, step, slot) —
-- the same one the arrows below already use, and for the same reason.
--
-- The `links` anchors name the column AND THE ONE AFTER IT rather than the one
-- before. `picture, links, function,` would be the obvious anchor and is the
-- fragile one: it stops matching the day a neighbour is renamed, and this
-- schema renames neighbours.
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  v_def    text;
  v_next   text;
  v_carry  text;
  v_hits   int := 0;
begin
  -- The two inserts appended to each copy. Written once, with the source
  -- cell's filter left as a token the two substitutions below fill in, so the
  -- copy rule exists in one place rather than twice.
  v_carry := $carry$

    -- The placements and the resources the copied cells carry. Matched to
    -- their copies on (path, lane, step, slot), which is the join the arrows
    -- below use and stops a multi-cell slot from fanning one row out into a
    -- copy per sibling.
    insert into public.cell_touchpoints
      (cell_id, name, position, summary, screenshots, url, origin)
    select nc.id, ct.name, ct.position, ct.summary, ct.screenshots, ct.url, 'app'
    from public.cell_touchpoints ct
    join public.cells c on c.id = ct.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position;

    insert into public.resources
      (cell_id, kind, name, url, position, origin)
    select nc.id, r.kind, r.name, r.url, r.position, 'app'
    from public.resources r
    join public.cells c on c.id = r.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position;

    -- Placement-attached resources, keyed through the placement's name on the
    -- copied cell. Nothing writes one today; carrying them anyway is what
    -- stops the first one that is written from being lost by a copy.
    insert into public.resources
      (cell_touchpoint_id, kind, name, url, position, origin)
    select nct.id, r.kind, r.name, r.url, r.position, 'app'
    from public.resources r
    join public.cell_touchpoints ct on ct.id = r.cell_touchpoint_id
    join public.cells c on c.id = ct.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position
    join public.cell_touchpoints nct
      on nct.cell_id = nc.id and nct.name = ct.name;
$carry$;

  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '\mc\.links\M'
    order by pg_get_functiondef(p.oid)
  loop
    v_next := v_def;

    -- The column list and the projection of the cells copy.
    v_next := replace(v_next, ', links, function,', ', function,');
    v_next := replace(v_next, ', c.links, c.function,', ', c.function,');

    -- `duplicate_path` copies one path into the same scenario, so the copy
    -- points at the very same `steps` rows.
    v_next := replace(
      v_next,
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = duplicate_path.source_path_id;' || E'\n',
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = duplicate_path.source_path_id;' || E'\n' ||
      replace(
        replace(v_carry,
                '@SOURCE@', 'c.path_id = duplicate_path.source_path_id'),
        '@STEP@', 'c.step_id'));

    -- `duplicate_scenario` mints new steps, so the copy is found through the
    -- step map its own loop built.
    v_next := replace(
      v_next,
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = src_path.id;' || E'\n',
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = src_path.id;' || E'\n' ||
      replace(
        replace(v_carry, '@SOURCE@', 'c.path_id = src_path.id'),
        '@STEP@', '(step_map ->> c.step_id::text)::uuid'));

    if v_next = v_def then
      raise exception
        'a function reads cells.links in a shape this migration does not know: %',
        left(v_def, 200);
    end if;
    if v_next ~ '@SOURCE@|@STEP@' then
      raise exception 'the carry-forward block was spliced in unfilled';
    end if;

    execute v_next;
    v_hits := v_hits + 1;
  end loop;

  if v_hits <> 2 then
    raise exception
      'expected to rewrite duplicate_path and duplicate_scenario, rewrote %',
      v_hits;
  end if;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- Nothing may be left in the column
--
-- Invariants, not a census. This file has to replay against an empty database,
-- so asserting a row count would fail every empty replay forever. Asserting
-- that the column holds nothing this file did not carry across is vacuously
-- true on an empty table and exactly as strong on a full one.
-- ---------------------------------------------------------------------------

do $left$
declare
  v_lost_detail   int;
  v_lost_resource int;
  v_lost_citation int;
  v_stray         int;
  v_both_owners   int;
begin
  select count(*) into v_lost_detail
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'tech_description'
    and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null
    and not exists (
      select 1 from public.cell_touchpoints ct
      where ct.cell_id = c.id and ct.name = btrim(item.link ->> 'label')
    );
  if v_lost_detail <> 0 then
    raise exception '% touchpoint details did not reach a placement', v_lost_detail;
  end if;

  select count(*) into v_lost_resource
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'url'
    and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is not null
    and not exists (
      select 1 from public.resources r
      where r.cell_id = c.id and r.url = btrim(item.link ->> 'url')
    );
  if v_lost_resource <> 0 then
    raise exception '% resources did not reach the table', v_lost_resource;
  end if;

  select count(*) into v_lost_citation
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'ref'
    and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null
    and not exists (
      select 1 from public.evidence e
      where e.cell_id = c.id
        and e.title = btrim(item.link ->> 'label')
        and e.ref is not distinct from nullif(
          btrim(coalesce(item.link ->> 'ref', item.link ->> 'url', '')),
          '')
    );
  if v_lost_citation <> 0 then
    raise exception '% provenance citations did not reach evidence', v_lost_citation;
  end if;

  -- Anything the three clauses above did not name — including an entry of a
  -- known type with nothing in the field that carries its content. A fourth
  -- shape would otherwise be dropped in silence, which is how this column came
  -- to hold two things in the first place.
  select count(*) into v_stray
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where coalesce(item.link ->> 'type', '')
          not in ('url', 'ref', 'tech_description')
     or (item.link ->> 'type' = 'url'
         and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is null)
     or (item.link ->> 'type' in ('ref', 'tech_description')
         and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is null);
  if v_stray <> 0 then
    raise exception
      '% link entries are of a shape this migration does not know', v_stray
      using hint = 'Give the entry the field its type needs, or remove it — '
                   'dropping the column destroys whatever is left in it.';
  end if;

  -- The constraint says this cannot happen. Asserted anyway, for the reason
  -- the probes above exist.
  select count(*) into v_both_owners
  from public.resources
  where num_nonnulls(cell_id, cell_touchpoint_id) <> 1;
  if v_both_owners <> 0 then
    raise exception '% resources name a cell and a placement', v_both_owners;
  end if;
end
$left$;

-- The second half of the owner proof, now that a placement may exist to point
-- at. It says so when there is none rather than passing quietly, so an empty
-- replay cannot be mistaken for a database where the constraint was tested.

do $probe$
declare
  v_cell      uuid;
  v_placement uuid;
begin
  select ct.cell_id, ct.id into v_cell, v_placement
  from public.cell_touchpoints ct limit 1;

  if v_placement is null then
    raise notice
      'no placement exists, so the both-owners proof has nothing to run against';
    return;
  end if;

  begin
    insert into public.resources
      (cell_id, cell_touchpoint_id, kind, name, url, position, origin)
    values (v_cell, v_placement, 'link', 'ZZ Probe',
            'https://example.invalid/', 1, 'app');
    raise exception 'a resource owned by a cell AND a placement was accepted';
  exception
    when check_violation then null;
  end;
end
$probe$;

-- ---------------------------------------------------------------------------
-- And the column goes
-- ---------------------------------------------------------------------------

alter table public.cells drop constraint cells_links_is_array;
alter table public.cells drop column links;

-- The grant that named it is amended at its source, in
-- `20260818000000_authoring_foundation.sql`, and the reason is written there.
-- A superseding grant here would not have worked: the recipe is applied on
-- top of the core in one pass, so by the time any recipe statement runs the
-- column is already gone and the earlier grant has already failed.

-- Nothing in `public` may still read it. `drop column` refuses when a view or
-- an index depends on the column and says nothing at all about a function
-- body, which is the whole reason the rewrite above had to be explicit.

do $sweep$
declare
  v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ~ '(\mc\.links\M|[ (]links,)';
  if v_left is not null then
    raise exception 'these functions still read cells.links: %', v_left;
  end if;
end
$sweep$;

-- ---------------------------------------------------------------------------
-- The compatibility stamp
--
-- Two new tables and a dropped column is the loudest kind of shape change: a
-- target at 2026.08.27 answers to `cells.links` and a target at this number
-- does not. `src/lib/backend/schemaVersion.ts` carries the matching entry, and
-- `check:version` fails if the two disagree.
--
-- Older numbers are not evicted from the supported list, following this
-- series' precedent: a version leaves that list when the migration that would
-- carry it forward stops existing, and that migration is this file.
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.08.31',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.08.31') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000114000000_leads_to_and_enables.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The two dependency kinds get the words the product uses, pointing the same way.
--
--   trigger  →  leads_to
--   needs    →  enables      (AND THE EDGE TURNS AROUND — see below)
--
-- 21000103000000 renamed the table and argued, correctly for its moment, that
-- the KIND column should keep `trigger`: a genus cannot also be one of its own
-- species. That argument was about the word `dependency`, and it still holds.
-- What it did not settle is whether `trigger` and `needs` were the right two
-- species, and the downstream instance has since found that they are not.
--
-- ── Why `trigger` becomes `leads_to` ──────────────────────────────────────
--
-- The panel groups these as "Set off by" / "Sets off" while the column stores
-- `trigger`. Product word and stored value disagree, which is the same class
-- of gap that made `links` ambiguous. `leads_to` IS the label, minus the
-- underscore, and it reads as one moment handing to the next rather than as an
-- alarm going off.
--
-- ── Why `needs` becomes `enables`, and why the rows must turn around ──────
--
-- This is the half that is not a rename. The two words put the source cell at
-- OPPOSITE ends of the same relationship:
--
--     A needs   B   →  B comes first, B is required by A
--     A enables B   →  A comes first, A makes B possible
--
-- So a `needs` row rewritten in place would claim the exact reverse of what it
-- was authored to say. `enables` is chosen because it puts BOTH kinds
-- source-first and upstream-first — makes it HAPPEN versus makes it POSSIBLE —
-- so an edge's direction can be read without first checking its kind:
--
--     "Creates breakout rooms"  --leads to--> "Reminds tutors to check them"
--     "generate_sample_blueprint.mjs" --enables--> "npm run dev with no .env"
--
-- The second is one of the 18 `needs` edges in the bundled sample, before and
-- after. Read it the old way — "the dev run needs the generator" — and the
-- meaning is identical; the words that carry it swap ends.
--
-- ── What could go wrong, and what stops it ────────────────────────────────
--
-- `cell_dependencies_source_target_kind_unique` covers (source, target, kind).
-- Turning a `needs` edge around cannot collide: the turned row's kind is
-- `enables`, which no row carries before this file runs (the old CHECK allowed
-- only `trigger` and `needs`), and a mutual pair (A,B,needs) + (B,A,needs)
-- turns into (B,A,enables) + (A,B,enables) — two distinct keys. An earlier
-- draft asserted against exactly that pair, which would have stranded a legal
-- database at 2026.08.31 over a collision that cannot happen.
--
-- The words "temporal" and "functional" go with the rename. They named the
-- distinction without ever making it usable.

alter table public.cell_dependencies
  drop constraint if exists cell_dependencies_kind_check;
alter table public.cell_dependencies
  alter column kind drop default;

update public.cell_dependencies
   set kind = 'leads_to'
 where kind = 'trigger';

-- The turn. Source and target swap in the same statement that renames the
-- kind, so no row is ever readable as "A enables B" while still meaning
-- "A needs B".
update public.cell_dependencies
   set source_cell_id = target_cell_id,
       target_cell_id = source_cell_id,
       kind = 'enables'
 where kind = 'needs';

alter table public.cell_dependencies
  add constraint cell_dependencies_kind_check
  check (kind in ('leads_to', 'enables'));
alter table public.cell_dependencies
  alter column kind set default 'leads_to';

comment on table public.cell_dependencies is
  'Dependency from one cell to another. kind: leads_to (makes it happen) | enables (makes it possible). Both read source-first and upstream-first.';
-- The column comment was set by 20260729120000 and followed the column through
-- the table rename; left alone it would keep teaching the retired words and
-- the retired direction to every schema reader.
comment on column public.cell_dependencies.kind is
  'leads_to = makes it happen (draws an arrow) | enables = makes it possible (panel only). Both read source-first.';

-- The literals inside `set_cell_dependency` — its `kind` default and the
-- guard that rejects an unknown kind.
--
-- Done here rather than through `__rewrite_function_bodies`, which
-- 21000109000000 dropped along with the other two vocabulary helpers once the
-- lane renames were finished. One function is one function; a helper that
-- sweeps every routine in the schema is what the wide renames needed and this
-- does not.
--
-- The patterns are QUOTED, so this cannot reach the word `trigger` where it
-- means a database trigger, and the grants ride through `create or replace`
-- untouched — a drop would take the ACL with it and the recreate would land on
-- EXECUTE TO PUBLIC.
do $rewrite$
declare
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(p.oid) into v_before
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_cell_dependency';

  if v_before is null then
    raise exception 'set_cell_dependency is missing; nothing to rewrite';
  end if;

  v_after := replace(replace(v_before, '''trigger''', '''leads_to'''),
                     '''needs''', '''enables''');

  if v_after = v_before then
    raise exception
      'set_cell_dependency names neither retired kind, so this migration is '
      'either already applied or reading a function it does not recognise';
  end if;

  execute v_after;
end
$rewrite$;

do $$
declare
  v_left int;
  v_default text;
begin
  select count(*) into v_left
    from public.cell_dependencies where kind in ('trigger', 'needs');
  if v_left > 0 then
    raise exception '% dependency row(s) still carry a retired kind', v_left;
  end if;

  select pg_get_expr(d.adbin, d.adrelid) into v_default
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.cell_dependencies'::regclass and a.attname = 'kind';
  if v_default is null or v_default not like '%leads_to%' then
    raise exception 'the kind default is %, not leads_to', coalesce(v_default, 'absent');
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_cell_dependency'
      and p.prosrc ~ '''(trigger|needs)'''
  ) then
    raise exception 'set_cell_dependency still names a retired kind';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The bump. This file changes the shape — the CHECK, the default, the
-- direction of every `needs` row — so the target has to say so, or a database
-- that has not run this file is indistinguishable from one that has, and the
-- 2026.09.01 app draws its `needs` rows the wrong way round without a word.
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.01',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.01') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000115000000_a_slide_a_frame_and_a_title.sql
-- ─────────────────────────────────────────────────────────────────────────

-- "Frame" meant two things and "storyboard" meant two more.
--
-- The vocabulary the instance settled, and this template did not:
--
--   storyboard  the LANE. A row of the board like any other, a role rather
--               than a medium.
--   frame       ONE image on ONE cell.
--   strip       a step's frames across the lanes — the script for that moment.
--   slide       one screen of a slice.
--
-- Against that, this schema said `slice_items` for a slide and commented the
-- table "Frames: consecutive slice cells grouped… Empty cell_ids = title-only
-- divider frame" — the word `frame` used for a slide, in the schema's own
-- prose, which is where the collision was hiding. And `cells.picture` named
-- the thing that IS a frame.
--
-- So, three renames:
--
--   slice_items          → slides
--   slice_items.caption  → slides.title
--   cells.picture        → cells.frame
--
-- `caption` becomes `title` under the rule the summary/name renames settled:
-- `name` is for structure a reader navigates, `title` is for authored content
-- a reader reads. A slide is something somebody wrote, like the slice above it.
--
-- ── What this does NOT do ─────────────────────────────────────────────────
--
-- `slides.illustration` stays. The instance dropped its equivalent because no
-- row had ever set it and it REPLACED the strip rather than joining it. Here
-- `SliceStoryboardField` writes it, so dropping it would delete a working
-- feature to match a decision taken where the feature did not exist. If it
-- should later become an append to the strip rather than a substitute, that
-- is a change with its own reasoning and its own migration.
--
-- ── The dependent names, longhand ────────────────────────────────────────
--
-- `alter table … rename` does not move the names of constraints, indexes,
-- policies or triggers. `__rename_schema_objects` did that in one call, and
-- 21000109000000 dropped it along with the other two vocabulary helpers once
-- the lane renames were finished.
--
-- Longhand rather than a `do` block over the catalog, for the reason the
-- helper's own successor documented: a name moved inside dynamic SQL is a name
-- the static readers cannot see, and a retired word nothing can see is a
-- retired word nothing forbids. Every name below was minted by
-- 20260729120000 and is verified present by applying the generated core to a
-- stock Postgres, so there is no guesswork in writing them out.

alter table public.cells rename column picture to frame;

comment on column public.cells.frame is
  'The frame: one image on this cell. A step''s frames across the lanes are its strip.';

-- `duplicate_path` and `duplicate_scenario` copy the column by name. A body is
-- text, so the rename above does not reach inside one: the function keeps
-- being created successfully and raises 42703 the first time it is called.
--
-- Scoped to those two functions BY NAME. A bare sweep would also reach
-- `sync_cell_resources`, where `picture` is a JSONB KEY from the retired
-- `links` shape — a value on the wire, not this column, and renaming it would
-- break the migration of data that still carries it.
do $rewrite$
declare
  target record;
  after text;
  rewritten int := 0;
begin
  for target in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('duplicate_path', 'duplicate_scenario')
  loop
    after := regexp_replace(target.def, '\mpicture\M', 'frame', 'g');
    if after <> target.def then
      execute after;
      rewritten := rewritten + 1;
    end if;
  end loop;

  if rewritten = 0 then
    raise exception
      'neither duplicate_path nor duplicate_scenario names the column this '
      'migration renamed, so either it has already run or these functions are '
      'not the ones it was written against';
  end if;
end
$rewrite$;

alter table public.slice_items rename column caption to title;
alter table public.slice_items rename to slides;

alter table public.slides rename constraint slice_items_pkey            to slides_pkey;
alter table public.slides rename constraint slice_items_slice_id_fkey   to slides_slice_id_fkey;
alter table public.slides rename constraint slice_items_position_unique to slides_position_unique;
alter table public.slides rename constraint slice_items_keys_match_ids  to slides_keys_match_ids;

-- The primary-key and unique constraints carry an index of the same name, and
-- renaming the constraint renamed it with them. These two are the plain
-- indexes, which nothing renames for.
alter index public.slice_items_slice_id_idx rename to slides_slice_id_idx;
alter index public.slice_items_cell_ids_idx rename to slides_cell_ids_idx;

alter trigger set_slice_items_updated_at on public.slides
  rename to set_slides_updated_at;

comment on table public.slides is
  'One slide of a slice. It shows the frames of the cells it references — that strip is what the slide shows, so the two cannot disagree — and carries the words written over them. Empty cell_ids = a title-only divider slide.';

comment on column public.slides.title is
  'The words over this slide. A title rather than a name: it is authored content a reader reads, not structure a reader navigates.';

comment on column public.slides.cell_ids is
  'SOFT refs to cells (no FK — must survive scenario re-import). Same order as cell_keys.';

comment on column public.slides.cell_keys is
  'IR key-paths paired with cell_ids for orphan recovery after key renames.';

-- `cells.cell_key`'s comment names the table its keys are matched against, and
-- that name moved.
comment on column public.cells.cell_key is
  'Authored key: service/scenario/path/lane/step. Written by the import pipeline for origin=import, minted by upsert_cell for origin=app. Survives re-import; slides.cell_keys matches against it.';


do $$
declare
  v_left text;
begin
  -- Invariants, never censuses: each is vacuously true on an empty database
  -- and says something real on a populated one.
  if to_regclass('public.slice_items') is not null then
    raise exception 'slice_items survived the rename';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cells' and column_name = 'picture'
  ) then
    raise exception 'cells.picture survived the rename';
  end if;

  select string_agg(name, ', ' order by name) into v_left
    from (
      select conname as name from pg_constraint
       where conrelid = 'public.slides'::regclass and conname like 'slice_item%'
      union all
      select indexname from pg_indexes
       where schemaname = 'public' and tablename = 'slides' and indexname like 'slice_item%'
      union all
      select tgname from pg_trigger
       where tgrelid = 'public.slides'::regclass and not tgisinternal
         and tgname like '%slice_item%'
    ) left_behind;

  if v_left is not null then
    raise exception 'dependent objects still carry the retired name: %', v_left;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('duplicate_path', 'duplicate_scenario')
     and p.prosrc ~ '\mpicture\M';

  if v_left is not null then
    raise exception 'a copy function still names the retired column: %', v_left;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000116000000_one_spelling_each.sql
-- ─────────────────────────────────────────────────────────────────────────

-- One spelling each, for ten columns that had two words between them.
--
-- Ten renames, and every one of them is the same complaint: this schema spells
-- a single idea more than one way, so a reader has to learn the table before
-- they can read the column.
--
--   findings                   → audit_findings
--   findings.check_name        → audit_findings.check_key
--   findings.note              → audit_findings.summary
--   cell_dependencies.label    → cell_dependencies.name
--   slices.description         → slices.summary
--   slices.slice_type          → slices.kind
--   slices.origin              → slices.authorship
--   paths.path_type            → paths.kind
--   scenarios.view_type        → scenarios.layout
--   business_model             → business_models
--
-- ── The two rules underneath ──────────────────────────────────────────────
--
-- **`_type` is not a name, it is a suffix apologising for one.** `path_type`,
-- `slice_type` and `view_type` all say "the kind of thing this is" in a column
-- that could just say `kind` — and `kind` is already the word on
-- `cell_dependencies`. Three spellings of one idea is two too many.
--
-- **One word per meaning: name, title, summary, note.** A `name` is what you
-- navigate by, a `title` is authored content, a `summary` is the sentence that
-- describes the thing, and a `note` is an aside. `findings.note` was never an
-- aside — it is the finding's own sentence, which is a summary. Same for
-- `slices.description`, which was a summary wearing the longer word.
-- `cell_dependencies.label` is the edge's name.
--
-- ── Two VALUE migrations, not just names ─────────────────────────────────
--
-- `paths.path_type` accepted four values where three will do: `unhappy` and
-- `alternative` are two words for the same thing, and neither says what it
-- means. Both become `variant`. Nothing is lost — `exception` already carries
-- "this went wrong", so `unhappy` was only ever a second spelling of `variant`
-- with a mood attached.
--
-- `scenarios.view_type` accepted `single | side-by-side | integrated`. The
-- client has ALREADY collapsed the last two: `viewTypeVocabulary.ts` maps both
-- to `stacked` on read and refuses to persist `stacked`. That seam existed to
-- let the data catch up, and this is the migration it was waiting for — the
-- rows move, the constraint becomes `single | stacked`, and the translation
-- module goes with them. A seam kept after its migration lands is a second
-- vocabulary that nothing forces to agree.
--
-- ── What this deliberately does NOT do ───────────────────────────────────
--
-- It does not drop `cell_dependencies.note` or `evidence.note`, though both
-- are the same `note`-versus-`summary` question the renames above answer. The
-- difference is that these two are WRITTEN here: `CellDependencyEditor.tsx`
-- writes the first, `CellEvidenceTab.tsx` reads and writes the second. A
-- column with a live editor behind it is a feature, and a vocabulary sweep
-- that deletes features has stopped being a vocabulary sweep. Same reasoning
-- that kept `slides.illustration` in `21000115000000`.
--
-- They stay as `note` rather than becoming `summary` because on those two the
-- word is honest: an edge's note and a piece of evidence's note are asides
-- beside the thing, not the thing's own sentence.
--
-- `paths.note` stays in both: a path's note genuinely IS an aside.
--
-- ── The dependent names, longhand ────────────────────────────────────────
--
-- `alter table … rename` moves neither constraints, indexes, triggers nor
-- policies. `__rename_schema_objects` did that in one call and
-- `21000109000000` dropped it. Every name below was read out of a live
-- catalog after applying `portable-core.generated.sql` to a stock Postgres 17,
-- so none of them is a guess — and they are written out rather than swept,
-- for the reason `21000115000000` gave: a name moved inside dynamic SQL is a
-- name the static readers cannot see, and a retired word nothing can see is a
-- retired word nothing forbids.

-- ---------------------------------------------------------------------------
-- 1. findings → audit_findings
-- ---------------------------------------------------------------------------

alter table public.findings rename column check_name to check_key;
alter table public.findings rename column note to summary;
alter table public.findings rename to audit_findings;

alter table public.audit_findings rename constraint findings_pkey             to audit_findings_pkey;
alter table public.audit_findings rename constraint findings_service_id_fkey  to audit_findings_service_id_fkey;
alter table public.audit_findings rename constraint findings_source_check     to audit_findings_source_check;
alter table public.audit_findings rename constraint findings_severity_check   to audit_findings_severity_check;
alter table public.audit_findings rename constraint findings_status_check     to audit_findings_status_check;
alter table public.audit_findings rename constraint findings_keys_match_ids   to audit_findings_keys_match_ids;

-- The pkey's index moved with its constraint; these three are the plain ones.
alter index public.findings_service_id_idx       rename to audit_findings_service_id_idx;
alter index public.findings_cell_ids_idx         rename to audit_findings_cell_ids_idx;
alter index public.findings_open_fingerprint_idx rename to audit_findings_open_fingerprint_idx;

alter trigger set_findings_updated_at on public.audit_findings
  rename to set_audit_findings_updated_at;

comment on table public.audit_findings is
  'Audit / whatif / import-sweep outputs. Never hand-created; humans may only change status.';
comment on column public.audit_findings.check_key is
  'Which check raised this. A key, not a sentence: it is matched against, not read.';
comment on column public.audit_findings.summary is
  'The finding''s own sentence — what is wrong. A summary rather than a note: it is the point of the row, not an aside beside it.';
comment on column public.audit_findings.fingerprint is
  'check_key + sorted cell_keys hash. Dedupe/reopen identity across runs.';

-- ---------------------------------------------------------------------------
-- 2. The single-column renames
-- ---------------------------------------------------------------------------

alter table public.cell_dependencies rename column label to name;

comment on column public.cell_dependencies.name is
  'What this edge is called on the canvas. A name, not a label: it is what a reader navigates by.';

alter table public.slices rename column description to summary;
alter table public.slices rename column slice_type  to kind;
alter table public.slices rename column origin      to authorship;

alter table public.slices rename constraint slices_slice_type_check to slices_kind_check;

comment on column public.slices.summary is
  'What this slice is for, in a sentence.';
comment on column public.slices.kind is
  'Which cut through the grid this is: journey, step, lane, cell or custom.';
comment on column public.slices.authorship is
  'Who wrote it: generated, customized or human. Named for the act, not the source, because a human may author a slice outright.';

-- ---------------------------------------------------------------------------
-- 3. paths.path_type → paths.kind, four values becoming three
-- ---------------------------------------------------------------------------

alter table public.paths drop constraint paths_path_type_check;
alter table public.paths rename column path_type to kind;

update public.paths
   set kind = 'variant'
 where kind in ('unhappy', 'alternative');

alter table public.paths add constraint paths_kind_check
  check (kind in ('happy', 'variant', 'exception'));

comment on column public.paths.kind is
  'happy, variant or exception. `variant` replaced `unhappy` and `alternative`, which were two spellings of the same thing; `exception` already carries "this went wrong".';

-- ---------------------------------------------------------------------------
-- 4. scenarios.view_type → scenarios.layout, and the client seam it retires
-- ---------------------------------------------------------------------------

alter table public.scenarios drop constraint scenarios_view_type_check;
alter table public.scenarios alter column view_type drop default;
alter table public.scenarios rename column view_type to layout;

update public.scenarios
   set layout = 'stacked'
 where layout in ('side-by-side', 'integrated');

alter table public.scenarios alter column layout set default 'single';
alter table public.scenarios add constraint scenarios_layout_check
  check (layout in ('single', 'stacked'));

comment on column public.scenarios.layout is
  'How this scenario''s paths are laid out: single, or stacked. `merged` is a display state the client holds and never persists.';

-- ---------------------------------------------------------------------------
-- 5. business_model → business_models
-- ---------------------------------------------------------------------------
--
-- Plural, like every other table. It was singular because it was renamed from
-- `propositions` by `21000111000000`, which took the singular from the noun
-- rather than from the convention around it.

alter table public.business_model rename to business_models;

alter table public.business_models rename constraint business_model_pkey            to business_models_pkey;
alter table public.business_models rename constraint business_model_service_id_fkey to business_models_service_id_fkey;

alter trigger set_business_model_updated_at on public.business_models
  rename to set_business_models_updated_at;

-- ---------------------------------------------------------------------------
-- 6. The four functions whose ARGUMENT names carry a retired word
-- ---------------------------------------------------------------------------
--
-- PostgREST sends RPC arguments by name, so an argument name is wire contract
-- and not decoration. `create or replace function` refuses to change one, so
-- each of these has to be dropped and recreated.
--
-- A drop discards the function's ACL and Postgres hands the recreated one the
-- default grant to PUBLIC. On a schema whose whole authoring posture is
-- "revoke from anon, grant to authenticated", silently widening four RPCs to
-- PUBLIC would be the worst possible way to land a rename — so the ACL is
-- captured first and replayed after, and the proof block at the end asserts
-- that anon still cannot execute them.
--
-- Scoped to four functions BY NAME. A catalog-wide sweep would also rewrite
-- `origin` inside `upsert_cell`, `add_lane` and four others, where `origin`
-- is the import-provenance column on cells and phases — a different column,
-- not renamed here, and renaming it would break the importer.

do $rewrite$
declare
  target record;
  after text;
  after_args text;
  entry text;
  grantee text;
  rewritten int := 0;
begin
  for target in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           p.proargtypes as arg_types,
           p.proacl as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_path', 'create_scenario', 'duplicate_path',
                         'set_cell_dependency')
  loop
    after := pg_get_functiondef(target.oid);
    after := regexp_replace(after, '\mpath_type\M', 'kind', 'g');
    after := regexp_replace(after, '\mview_type\M', 'layout', 'g');
    after := regexp_replace(after, '\mp_label\M',   'p_name', 'g');
    after := regexp_replace(after, '\mlabel\M',     'name',   'g');

    after_args := regexp_replace(target.identity_args, '\mpath_type\M', 'kind', 'g');

    execute format('drop function public.%I(%s)', target.proname, target.identity_args);
    execute after;

    -- Identity arguments are TYPES only, so the signature that named the old
    -- function names the new one too, and the grants below land on it.
    --
    -- The recreated function's ACL is whatever the HOST's default privileges
    -- say, and that is not only PUBLIC: a hosted Supabase project created in
    -- 2026 carries `alter default privileges for role postgres in schema
    -- public grant all on functions to anon, authenticated, service_role`, so
    -- the recreate hands anon its own grant, which a `revoke … from public`
    -- does not take away. Every grantee the recreate landed on is revoked,
    -- whoever it is, and only then is the captured ACL replayed — so the
    -- result is the ACL this function had, on any host. Where the captured
    -- ACL already matched this database's defaults the end state is the one
    -- this file always produced; where it did not, this file used to stop at
    -- the proof below and roll back, so no database ever applied it in the
    -- shape this block now changes.
    for grantee in
      select distinct a.grantee::regrole::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace,
             aclexplode(p.proacl) a
       where n.nspname = 'public'
         and p.proname = target.proname
         and p.proargtypes = target.arg_types
         and a.grantee <> 0
         and a.grantee <> p.proowner
    loop
      execute format('revoke execute on function public.%I(%s) from %s',
                     target.proname, target.identity_args, grantee);
    end loop;

    if target.acl is not null then
      execute format('revoke execute on function public.%I(%s) from public',
                     target.proname, target.identity_args);
      foreach entry in array target.acl loop
        grantee := split_part(entry, '=', 1);
        if grantee = '' then
          execute format('grant execute on function public.%I(%s) to public',
                         target.proname, target.identity_args);
        else
          execute format('grant execute on function public.%I(%s) to %I',
                         target.proname, target.identity_args, grantee);
        end if;
      end loop;
    end if;

    rewritten := rewritten + 1;
  end loop;

  if rewritten <> 4 then
    raise exception
      'expected to rewrite 4 functions, rewrote % — the argument names this '
      'migration was written against are not the ones in this database', rewritten;
  end if;
end
$rewrite$;

-- The bodies of everything else that reads a renamed column. Scoped by the
-- WORDS, which appear in no other sense inside these bodies: `findings` as a
-- relation, `business_model` as a relation, and the three `_type` columns.
do $bodies$
declare
  target record;
  after text;
begin
  for target in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~
           '\mfindings\M|\mbusiness_model\M|\mcheck_name\M|\mslice_type\M|\mpath_type\M|\mview_type\M'
  loop
    after := target.def;
    after := regexp_replace(after, '\mfindings\M',       'audit_findings', 'g');
    after := regexp_replace(after, '\mbusiness_model\M', 'business_models', 'g');
    after := regexp_replace(after, '\mcheck_name\M',     'check_key', 'g');
    after := regexp_replace(after, '\mslice_type\M',     'kind', 'g');
    after := regexp_replace(after, '\mpath_type\M',      'kind', 'g');
    after := regexp_replace(after, '\mview_type\M',      'layout', 'g');
    if after <> target.def then
      execute after;
    end if;
  end loop;
end
$bodies$;


do $$
declare
  v_left text;
begin
  -- Invariants, never censuses: each is vacuously true on an empty database
  -- and says something real on a populated one.
  if to_regclass('public.findings') is not null then
    raise exception 'findings survived the rename';
  end if;
  if to_regclass('public.business_model') is not null then
    raise exception 'business_model survived the rename';
  end if;

  select string_agg(table_name || '.' || column_name, ', ' order by table_name)
    into v_left
    from information_schema.columns
   where table_schema = 'public'
     and (   (table_name = 'audit_findings'    and column_name in ('check_name', 'note'))
          or (table_name = 'cell_dependencies' and column_name = 'label')
          or (table_name = 'slices'            and column_name in ('description', 'slice_type', 'origin'))
          or (table_name = 'paths'             and column_name = 'path_type')
          or (table_name = 'scenarios'         and column_name = 'view_type'));
  if v_left is not null then
    raise exception 'a retired column name survived: %', v_left;
  end if;

  -- The two value migrations. Vacuous on an empty database, and the only
  -- honest check on a populated one: not how many rows moved, but that none
  -- was left behind.
  if exists (select 1 from public.paths where kind not in ('happy', 'variant', 'exception')) then
    raise exception 'a path kept a retired kind';
  end if;
  if exists (select 1 from public.scenarios where layout not in ('single', 'stacked')) then
    raise exception 'a scenario kept a retired layout';
  end if;

  select string_agg(name, ', ' order by name) into v_left
    from (
      select conname as name from pg_constraint
       where conrelid in ('public.audit_findings'::regclass, 'public.business_models'::regclass,
                          'public.paths'::regclass, 'public.scenarios'::regclass,
                          'public.slices'::regclass)
         and conname ~ '^(findings|business_model)_|_(path_type|view_type|slice_type)_'
      union all
      select indexname from pg_indexes
       where schemaname = 'public' and indexname ~ '^(findings|business_model)_'
      union all
      select tgname from pg_trigger
       where not tgisinternal and tgname ~ '(findings|business_model)_updated_at'
         and tgname !~ 'audit_findings|business_models'
    ) left_behind;
  if v_left is not null then
    raise exception 'a dependent object still carries the retired name: %', v_left;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind in ('f', 'p')
     and p.prosrc ~ '\mfindings\M|\mbusiness_model\M|\mcheck_name\M|\mslice_type\M|\mview_type\M';
  if v_left is not null then
    raise exception 'a function body still names a retired column: %', v_left;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000117000000_a_scenario_left_merged_opens_merged.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A scenario left merged opens merged.
--
-- `scenarios.layout` held `single | stacked`, and the canvas drew three
-- things: single (one path at a time), stacked (one full band per path on a
-- shared step axis) and merged (the paths combined into ONE blueprint). The
-- third was the one a reader reached for most and the only one the row could
-- not say — it lived in a session-local override, so a scenario a reviewer
-- left merged opened stacked for the next person, every time.
--
-- The first was a layout nobody chose. Stacked with one path selected IS one
-- path drawn in full; `single` only ever changed which grid component drew
-- it. A value that changes the component and not the picture is not a
-- layout, so it goes, and its rows move to `stacked`.
--
--   single  →  stacked      one path stacked is one band; nothing to see
--   (session merged)  →  merged   what the row could not say, it now says
--
-- The toggle's write is `update_scenario_layout`. SECURITY DEFINER behind
-- `is_service_account()`, like every other authoring write: `authenticated`
-- holds no UPDATE on the column, and a viewer's choice stays a session
-- choice by construction, not by convention.
--
-- `create_scenario` still checked the three values `21000116000000` retired
-- and defaulted to the one this migration retires. It is `create or replace`d
-- with the same argument names — PostgREST sends them by name — so its ACL
-- survives untouched.


update public.scenarios set layout = 'stacked' where layout = 'single';

alter table public.scenarios
  drop constraint scenarios_layout_check,
  add constraint scenarios_layout_check check (layout in ('stacked', 'merged')),
  alter column layout set default 'stacked';

comment on column public.scenarios.layout is
  'How this scenario opens: stacked = one full band per path on a shared '
  'step axis; merged = the paths combined into one blueprint. The header '
  'toggle writes it, so a scenario left merged opens merged.';

-- ---------------------------------------------------------------------------
-- create_scenario: the same function, two layouts, the right default
-- ---------------------------------------------------------------------------

create or replace function public.create_scenario(
  phase_id uuid,
  name text,
  layout text default 'stacked',
  lane_source_path_id uuid default null,
  lane_set jsonb default '[]'::jsonb,
  step_count int default 5,
  path_name text default 'Happy Path'
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  scenario_id uuid;
  new_path_id uuid;
  next_order int;
  lane jsonb;
  step_id uuid;
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(name), '') = '' then
    raise exception 'A blueprint needs a name';
  end if;
  if layout not in ('stacked', 'merged') then
    raise exception 'Unknown layout %', layout
      using hint = 'One of: stacked, merged.';
  end if;

  select coalesce(max(position), -1) + 1 into next_order
  from public.scenarios where scenarios.phase_id = create_scenario.phase_id;

  insert into public.scenarios (phase_id, name, position, layout, origin)
  values (create_scenario.phase_id, create_scenario.name, next_order, create_scenario.layout, 'app')
  returning id into scenario_id;

  insert into public.paths (scenario_id, name, kind, origin)
  values (scenario_id, path_name, 'happy', 'app')
  returning id into new_path_id;

  -- Lanes: copied from a source path, or taken from the explicit set.
  if lane_source_path_id is not null then
    insert into public.lanes (path_id, name, lane_role, position, origin)
    select new_path_id, l.name, l.lane_role, l.position, 'app'
    from public.lanes l where l.path_id = lane_source_path_id;
  else
    for lane in select * from jsonb_array_elements(lane_set) loop
      insert into public.lanes (path_id, name, lane_role, position, origin)
      values (
        new_path_id,
        lane ->> 'name',
        nullif(lane ->> 'lane_role', ''),
        coalesce((lane ->> 'position')::int, 0),
        'app'
      );
    end loop;
  end if;

  -- Columns start unnamed; naming them is the first thing you do on the grid.
  for i in 0 .. greatest(step_count, 1) - 1 loop
    insert into public.steps (scenario_id, name, origin)
    values (scenario_id, 'Step ' || (i + 1), 'app')
    returning id into step_id;
    insert into public.path_steps (path_id, step_id, position)
    values (new_path_id, step_id, i);
  end loop;

  return jsonb_build_object('scenario_id', scenario_id, 'path_id', new_path_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_scenario_layout: the toggle's write
-- ---------------------------------------------------------------------------

create or replace function public.update_scenario_layout(scenario_id uuid, layout text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if layout not in ('stacked', 'merged') then
    raise exception 'Unknown layout %', layout
      using hint = 'One of: stacked, merged.';
  end if;

  update public.scenarios s set layout = update_scenario_layout.layout
  where s.id = update_scenario_layout.scenario_id;
  if not found then
    raise exception 'Unknown scenario';
  end if;
end;
$$;

comment on function public.update_scenario_layout(uuid, text) is
  'The header toggle''s write: how this scenario''s board is drawn, stacked '
  'or merged. Its inverse is itself with the previous value.';


-- ---------------------------------------------------------------------------
-- The IR revision this shape is
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.04',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.04') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  def text;
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.scenarios'::regclass
     and c.conname = 'scenarios_layout_check';
  if def is null or def !~ '''stacked''' or def !~ '''merged''' or def ~ '''single''' then
    raise exception 'scenarios_layout_check is not stacked | merged: %', def;
  end if;

  select column_default into def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'scenarios' and column_name = 'layout';
  if def !~ '''stacked''' then
    raise exception 'scenarios.layout does not default to stacked: %', def;
  end if;

  -- Vacuous on an empty database; on a populated one, that no row was left behind.
  if exists (select 1 from public.scenarios where layout not in ('stacked', 'merged')) then
    raise exception 'a scenario kept a retired layout';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_scenario'
       and (p.prosrc ~ '''single''' or p.prosrc ~ 'side-by-side' or p.prosrc ~ 'integrated')
  ) then
    raise exception 'create_scenario still admits a retired layout';
  end if;

  if to_regprocedure('public.update_scenario_layout(uuid, text)') is null then
    raise exception 'update_scenario_layout is missing';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000118000000_a_resource_keeps_its_id_and_knows_its_cell.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A resource keeps its id, knows its cell, and one of them is featured.
--
-- Three things `resources` could not say, and one it said wrong:
--
--   * A save churned every id. `sync_cell_resources` replaced a cell's list
--     by deleting the rows and inserting the list again, so a reorder — or
--     a save that changed nothing — gave every resource a fresh id. Nothing
--     minded while a resource was only a name and a url; the moment anything
--     hangs off a row (featuring it, below) a churned id is a lost reference.
--     Now the list is RECONCILED: a row that arrives with its id is updated
--     in place, a row without one is inserted, a row the list no longer
--     names is deleted. An id that is not one of this cell's rows is refused
--     rather than adopted.
--
--   * A placement's resource was invisible to the cell. `resources_one_owner`
--     said a row picks ONE of `cell_id` and `cell_touchpoint_id`, so every
--     reader that asks "what does this cell point at?" — the board embed, the
--     Resources tab — missed a placement's rows, which had no `cell_id`. A
--     placement is one touchpoint used at one cell, so what the placement
--     points at is what the cell points at, through that touchpoint. Every
--     resource carries its cell; a placement-owned one carries its placement
--     as well, and a COMPOSITE key `(cell_touchpoint_id, cell_id)` onto
--     `cell_touchpoints (id, cell_id)` holds the two to one row. MATCH
--     SIMPLE: a row with no placement is not checked against the placement
--     table at all.
--
--   * Nothing was featured. `featured` marks the resource its owner leads
--     with: one featured attachment per owner (the image a cell or a
--     placement shows), any number of featured links. A partial unique index
--     per owner shape is what makes "one" a rule rather than an intention.
--
--   * `kind` said `link | other`. `other` named nothing; an attachment is a
--     file the cell points at — a shipped image today, an object in Storage
--     once #113 lands — and it carries a url like a link does, so the
--     link-only url check becomes a check on every row.
--
-- The position rule moves with the ownership. `resources_cell_position_unique`
-- was `unique (cell_id, position)`, written when every row with a `cell_id`
-- was one of the cell's own list. Once a placement's rows carry the cell
-- too, a placement's position 0 collides with the cell's own position 0.
-- The rule was never about placement rows — their order is
-- `(cell_touchpoint_id, position)`, which stays — so the cell's rule is
-- re-issued as an EXCLUDE constraint over the same pair, restricted to the
-- cell's own rows, still DEFERRABLE: a unique index could carry the
-- predicate but not the deferral, and the deferral is what lets one
-- statement write a reorder without colliding with itself halfway through.
--
-- Four functions, all SECURITY DEFINER behind `is_service_account()`:
--
--   sync_cell_resources(p_cell_id, p_rows)       the cell's OWN list
--   sync_placement_resources(p_placement_id, p_rows)   one placement's list
--   set_featured_resource(p_resource_id, p_featured)
--   restore_featured_resources(p_rows)           the inverse of the last
--
-- The cell's list refuses a placement's ids — those are the touchpoint's to
-- write, and a cell list that quietly rewrote them would turn a featured
-- attachment into a link. Neither sync writes `kind` or `featured` on a kept
-- row: kind is decided when a row is made, and featuring is its own write.
-- Featuring an attachment clears the owner's previous featured attachment IN
-- THE SAME TRANSACTION, under the index that would otherwise refuse the
-- second, and returns the before-values of every row it touched — which is
-- the inverse, and what `restore_featured_resources` writes back with no
-- clearing rule.
--
-- A placement's `url` and `screenshots` columns are NOT read here. #111
-- copies them onto the placement as featured resources and drops them.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Every statement is a schema change or an UPDATE that touches zero rows on
-- an empty database. The proof asserts invariants — no row without a cell, a
-- placement's row in its cell, the constraints and indexes present, the
-- functions definer-guarded — vacuous on zero rows and real on a populated
-- instance.


-- ---------------------------------------------------------------------------
-- The columns and the rules
-- ---------------------------------------------------------------------------

alter table public.resources
  add column featured boolean not null default false;

update public.resources r
   set cell_id = ct.cell_id
  from public.cell_touchpoints ct
 where r.cell_touchpoint_id = ct.id
   and r.cell_id is null;

alter table public.resources drop constraint resources_one_owner;
alter table public.resources alter column cell_id set not null;

alter table public.cell_touchpoints
  add constraint cell_touchpoints_id_cell_id_key unique (id, cell_id);

alter table public.resources drop constraint resources_cell_touchpoint_id_fkey;
alter table public.resources
  add constraint resources_placement_in_cell_fkey
  foreign key (cell_touchpoint_id, cell_id)
  references public.cell_touchpoints (id, cell_id)
  on delete cascade;

alter table public.resources drop constraint resources_cell_position_unique;
alter table public.resources
  add constraint resources_cell_position_unique
  exclude using btree (cell_id with =, position with =)
  where (cell_touchpoint_id is null)
  deferrable initially deferred;

update public.resources set kind = 'attachment' where kind = 'other';
alter table public.resources drop constraint resources_kind_check;
alter table public.resources
  add constraint resources_kind_check check (kind in ('link', 'attachment'));

alter table public.resources drop constraint resources_link_has_url;
alter table public.resources
  add constraint resources_has_url check (nullif(btrim(url), '') is not null);

create unique index resources_one_featured_attachment_per_placement
  on public.resources (cell_touchpoint_id)
  where featured and kind = 'attachment' and cell_touchpoint_id is not null;

create unique index resources_one_featured_attachment_per_cell
  on public.resources (cell_id)
  where featured and kind = 'attachment' and cell_touchpoint_id is null;

comment on table public.resources is
  'Things a cell points at. Every row carries its cell; a row a touchpoint '
  'placement owns carries the placement as well, and the composite key holds '
  'the two to one row. A link is one kind of resource and `kind` carries the '
  'subtype.';

comment on column public.resources.cell_id is
  'The cell this resource belongs to — always. A placement-owned resource '
  'carries its placement in cell_touchpoint_id as well.';

comment on column public.resources.cell_touchpoint_id is
  'The touchpoint placement this resource belongs to, when it is a '
  'placement''s: a link or the image a touchpoint shows at this cell. Still '
  'the cell''s row; edited from the touchpoint.';

comment on column public.resources.kind is
  'link = a place on the web; attachment = a file the cell points at, today '
  'a site-relative image path, after #113 an object in Storage. Both carry a '
  'url. Host and file type are read at render, never stored.';

comment on column public.resources.featured is
  'The resource its owner leads with. One featured attachment per placement '
  'or per cell (the image it shows); any number of featured links.';

-- ---------------------------------------------------------------------------
-- The cell's list writes the cell's own rows, and keeps their ids
-- ---------------------------------------------------------------------------

create or replace function public.sync_cell_resources(
  p_cell_id uuid,
  p_rows    jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_nameless  int;
  v_foreign   int;
  v_placement int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cells c where c.id = p_cell_id) then
    raise exception 'cell % does not exist', p_cell_id;
  end if;

  -- Refused rather than defaulted. The editor already falls back to the
  -- url's host, so a nameless row reaching here means a caller skipped that,
  -- and inventing a name on its behalf hides the bug.
  select count(*) into v_nameless
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(id uuid, kind text, name text, url text)
  where nullif(btrim(coalesce(r.name, '')), '') is null;
  if v_nameless <> 0 then
    raise exception '% resource(s) arrived with no name', v_nameless;
  end if;

  -- An id has to be one of this cell's own rows.
  select count(*) into v_foreign
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid)
  where r.id is not null
    and not exists (
      select 1 from public.resources x
       where x.id = r.id and x.cell_id = p_cell_id
    );
  if v_foreign <> 0 then
    raise exception '% resource id(s) are not rows of cell %', v_foreign, p_cell_id;
  end if;

  -- And not one of a placement's. Those are the cell's to READ, and the
  -- touchpoint's list to write; a cell list rewriting them would turn a
  -- featured attachment into a link.
  select count(*) into v_placement
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid)
  join public.resources x on x.id = r.id
  where x.cell_touchpoint_id is not null;
  if v_placement <> 0 then
    raise exception '% resource(s) belong to a touchpoint placement and are edited from it', v_placement;
  end if;

  -- Rows the list no longer names — the cell's own only.
  delete from public.resources x
   where x.cell_id = p_cell_id
     and x.cell_touchpoint_id is null
     and x.id not in (
       select r.id
         from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid)
        where r.id is not null
     );

  -- Kept rows, updated in place — position included, kind left alone.
  update public.resources x
     set name       = btrim(r.name),
         url        = nullif(btrim(coalesce(r.url, '')), ''),
         position   = r.ord::int,
         updated_at = now()
    from rows from (
           jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as (id uuid, kind text, name text, url text)
         ) with ordinality as r(id, kind, name, url, ord)
   where x.id = r.id
     and x.cell_id = p_cell_id;

  -- New rows.
  insert into public.resources (cell_id, kind, name, url, position, origin)
  select p_cell_id,
         coalesce(nullif(btrim(coalesce(r.kind, '')), ''), 'link'),
         btrim(r.name),
         nullif(btrim(coalesce(r.url, '')), ''),
         r.ord::int,
         'app'
    from rows from (
           jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as (id uuid, kind text, name text, url text)
         ) with ordinality as r(id, kind, name, url, ord)
   where r.id is null;
end
$function$;

comment on function public.sync_cell_resources(uuid, jsonb) is
  'The cell''s own list, reconciled in order: delete the rows not named, '
  'update the named ones in place (name, url, position — never kind or '
  'featured), insert the rest. Refuses another cell''s id and a placement''s.';

-- ---------------------------------------------------------------------------
-- One list edits everything a placement points at
-- ---------------------------------------------------------------------------

create or replace function public.sync_placement_resources(
  p_placement_id uuid,
  p_rows         jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_cell_id  uuid;
  v_nameless int;
  v_foreign  int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select ct.cell_id into v_cell_id
    from public.cell_touchpoints ct
   where ct.id = p_placement_id;
  if v_cell_id is null then
    raise exception 'touchpoint placement % does not exist', p_placement_id;
  end if;

  select count(*) into v_nameless
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(id uuid, kind text, name text, url text)
  where nullif(btrim(coalesce(r.name, '')), '') is null
     or nullif(btrim(coalesce(r.url, '')), '') is null;
  if v_nameless <> 0 then
    raise exception '% resource(s) arrived with no name or no url', v_nameless;
  end if;

  -- An id has to be one of THIS placement's rows.
  select count(*) into v_foreign
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid)
  where r.id is not null
    and not exists (
      select 1 from public.resources x
       where x.id = r.id and x.cell_touchpoint_id = p_placement_id
    );
  if v_foreign <> 0 then
    raise exception '% resource id(s) are not rows of placement %', v_foreign, p_placement_id;
  end if;

  delete from public.resources x
   where x.cell_touchpoint_id = p_placement_id
     and x.id not in (
       select r.id
         from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid)
        where r.id is not null
     );

  -- Kept rows: name, url, position. Not kind, not featured.
  update public.resources x
     set name       = btrim(r.name),
         url        = btrim(r.url),
         position   = r.ord::int,
         updated_at = now()
    from rows from (
           jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as (id uuid, kind text, name text, url text)
         ) with ordinality as r(id, kind, name, url, ord)
   where x.id = r.id
     and x.cell_touchpoint_id = p_placement_id;

  insert into public.resources
    (cell_id, cell_touchpoint_id, kind, name, url, position, origin)
  select v_cell_id, p_placement_id,
         coalesce(nullif(btrim(coalesce(r.kind, '')), ''), 'link'),
         btrim(r.name),
         btrim(r.url),
         r.ord::int,
         'app'
    from rows from (
           jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as (id uuid, kind text, name text, url text)
         ) with ordinality as r(id, kind, name, url, ord)
   where r.id is null;
end
$function$;

create or replace function public.set_featured_resource(
  p_resource_id uuid,
  p_featured    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_row      public.resources;
  v_previous jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select * into v_row from public.resources where id = p_resource_id for update;
  if v_row.id is null then
    raise exception 'resource % does not exist', p_resource_id;
  end if;

  -- What this call changes, as it was. The row itself, and — when a
  -- preview is being set — the previous preview of the same owner.
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'featured', x.featured)), '[]'::jsonb)
    into v_previous
    from public.resources x
   where x.id = p_resource_id
      or (p_featured and v_row.kind = 'attachment'
          and x.featured and x.kind = 'attachment' and x.id <> p_resource_id
          and x.cell_touchpoint_id is not distinct from v_row.cell_touchpoint_id
          and x.cell_id = v_row.cell_id);

  if p_featured and v_row.kind = 'attachment' then
    update public.resources x
       set featured = false, updated_at = now()
     where x.featured and x.kind = 'attachment' and x.id <> p_resource_id
       and x.cell_touchpoint_id is not distinct from v_row.cell_touchpoint_id
       and x.cell_id = v_row.cell_id;
  end if;

  update public.resources
     set featured = p_featured, updated_at = now()
   where id = p_resource_id;

  return jsonb_build_object('previous', v_previous);
end
$function$;

create or replace function public.restore_featured_resources(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_expected int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select count(*) into v_expected
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid, featured boolean);
  if v_expected = 0 then
    raise exception 'nothing to restore';
  end if;

  if (select count(*) from public.resources x
        join jsonb_to_recordset(p_rows) as r(id uuid, featured boolean) on r.id = x.id)
     <> v_expected then
    raise exception 'some of the % resources to restore no longer exist', v_expected;
  end if;

  -- Clears first, then sets. The partial unique index behind "one preview
  -- per owner" is checked row by row, not at commit, so restoring
  -- {old: true, new: false} in one statement can meet a moment where both
  -- are true and be refused — the capture, run backwards.
  update public.resources x
     set featured = false, updated_at = now()
    from jsonb_to_recordset(p_rows) as r(id uuid, featured boolean)
   where x.id = r.id and not r.featured;
  update public.resources x
     set featured = true, updated_at = now()
    from jsonb_to_recordset(p_rows) as r(id uuid, featured boolean)
   where x.id = r.id and r.featured;
end
$function$;

comment on function public.sync_placement_resources(uuid, jsonb) is
  'The touchpoint''s list at one cell, replaced in order: delete the rows not '
  'named, update the named ones (name, url, position — never kind or '
  'featured), insert the rest. Refuses another placement''s id and a '
  'placement that is gone.';
comment on function public.set_featured_resource(uuid, boolean) is
  'One row''s featured flag. Featuring an attachment clears the owner''s '
  'previous featured attachment in the same transaction and returns both '
  'before-states, which is the inverse.';
comment on function public.restore_featured_resources(jsonb) is
  'The inverse of set_featured_resource: each {id, featured} written back '
  'as captured, no clearing rule.';


-- ---------------------------------------------------------------------------
-- The IR revision this shape is
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.05',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.05') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  bad int;
  fn  text;
begin
  -- 1. NO RESOURCE IS WITHOUT A CELL, AND A PLACEMENT'S SITS IN ITS CELL.
  select count(*) into bad from public.resources where cell_id is null;
  if bad <> 0 then raise exception '% resources have no cell', bad; end if;
  select count(*) into bad
    from public.resources r
    join public.cell_touchpoints ct on ct.id = r.cell_touchpoint_id
   where ct.cell_id <> r.cell_id;
  if bad <> 0 then
    raise exception '% resources name a placement in another cell', bad;
  end if;
  if exists (select 1 from public.resources where kind not in ('link', 'attachment')) then
    raise exception 'a resource kept a retired kind';
  end if;

  -- 2. THE CONSTRAINTS AND INDEXES ARE THERE.
  if not exists (select 1 from pg_constraint
                  where conname = 'resources_placement_in_cell_fkey') then
    raise exception 'resources_placement_in_cell_fkey is missing';
  end if;
  if exists (select 1 from pg_constraint where conname = 'resources_one_owner') then
    raise exception 'resources_one_owner survived';
  end if;
  if (select count(*) from pg_indexes
       where tablename = 'resources'
         and indexname in ('resources_one_featured_attachment_per_placement',
                           'resources_one_featured_attachment_per_cell')) <> 2 then
    raise exception 'the featured-attachment indexes are missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'resources_cell_position_unique'
                    and contype = 'x' and condeferrable) then
    raise exception 'the cell position rule is not a deferrable exclusion over the cell''s own rows';
  end if;

  -- 3. THE FOUR WRITES ARE DEFINER-GUARDED. Which roles may call them is
  --    the recipe's business, proved under its own mark below.
  foreach fn in array array[
    'public.sync_cell_resources(uuid, jsonb)',
    'public.sync_placement_resources(uuid, jsonb)',
    'public.set_featured_resource(uuid, boolean)',
    'public.restore_featured_resources(jsonb)'
  ] loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
  end loop;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000119000000_a_placement_says_what_a_tool_does_here.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A placement says what a tool does here, and nothing else.
--
-- `cell_touchpoints` carried three things about one touchpoint at one cell:
-- its words (`summary`) and two URL columns — `screenshots[]` and `url` —
-- that say what the placement POINTS AT. 21000118000000 gave `resources`
-- everything a pointer needs: a placement owner, a kind (`attachment` for an
-- image, `link` for a place on the web) and a `featured` flag for the one
-- the owner leads with. Two homes for one fact is one too many: the panel
-- read the column, the Resources tab read the row, and a screenshot added
-- one way was invisible the other.
--
-- So a placement becomes summary + role, and everything it points at is a
-- resource on it:
--
--   * `role` — `core | peripheral | null`. Whether the moment happens
--     THROUGH this touchpoint or the touchpoint is merely present at it. It
--     sits on the placement and not on the touchpoint: a poster is core at
--     recruitment and incidental three phases later. Null is the common
--     state — nobody has judged this placement — and renders nothing.
--   * `url` — copied onto the placement as a featured link, idempotently:
--     a url the placement already has as a resource is not copied twice.
--   * `screenshots[i]` — each copied as an attachment on the placement in
--     author order; the first becomes the featured one unless the placement
--     already leads with an attachment.
--   * then the two columns go. Postgres drops their column grants with them.
--
-- The two copy functions (`duplicate_path`, `duplicate_scenario`) named the
-- columns in their placement INSERT, and their placement-resource INSERT
-- predates 21000118000000's `cell_id NOT NULL`, so it would have failed the
-- first time a copied placement carried a resource. Both are rewritten
-- from their current definitions — the column lists and one reference — so
-- a copy carries role, featured and the placement's cell.
--
-- The one reference: `duplicate_path` has raised "column reference
-- scenario_id is ambiguous" on every call since 21000107000000 renamed
-- `paths.service_scenario_id` to `scenario_id`, the name of the function's
-- own local. Found by calling it on the replayed core while proving this
-- file; the local is renamed `v_scenario_id`, out of the column's way.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Every statement is a schema change, an idempotent copy over whatever rows
-- exist, or a function rewrite. The proof before the drop is an INVARIANT —
-- every url and screenshot a placement still holds is carried by a resource
-- on it — vacuous on zero placements; the proof at the foot asserts the
-- columns are gone and no function in `public` still reads them.


-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------

alter table public.cell_touchpoints
  add column role text
  constraint cell_touchpoints_role_check check (role in ('core', 'peripheral'));

comment on column public.cell_touchpoints.role is
  'core = the moment happens through this touchpoint; peripheral = present '
  'at it but not what it turns on. Null = nobody has judged this placement, '
  'which is the common state and renders nothing.';

-- ---------------------------------------------------------------------------
-- 2. Copy what the two columns hold onto the placement, as resources
-- ---------------------------------------------------------------------------

insert into public.resources
  (cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
select ct.cell_id, ct.id, 'link', ct.name, btrim(ct.url),
       coalesce((select max(r.position) + 1 from public.resources r
                  where r.cell_touchpoint_id = ct.id), 0),
       not exists (
         select 1 from public.resources f
          where f.cell_touchpoint_id = ct.id and f.kind = 'link' and f.featured
       ),
       'import'
  from public.cell_touchpoints ct
 where nullif(btrim(ct.url), '') is not null
   and not exists (
     select 1 from public.resources r
      where r.cell_touchpoint_id = ct.id and r.url = btrim(ct.url)
   );

insert into public.resources
  (cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
select ct.cell_id, ct.id, 'attachment', ct.name, btrim(shot.url),
       coalesce((select max(r.position) + 1 from public.resources r
                  where r.cell_touchpoint_id = ct.id), 0) + shot.ord - 1,
       shot.ord = 1 and not exists (
         select 1 from public.resources f
          where f.cell_touchpoint_id = ct.id and f.kind = 'attachment' and f.featured
       ),
       'import'
  from public.cell_touchpoints ct
  cross join lateral unnest(ct.screenshots) with ordinality as shot(url, ord)
 where nullif(btrim(shot.url), '') is not null
   and not exists (
     select 1 from public.resources r
      where r.cell_touchpoint_id = ct.id and r.url = btrim(shot.url)
   );

do $proof$
declare
  missing int;
begin
  select count(*) into missing
    from public.cell_touchpoints ct
   where (nullif(btrim(ct.url), '') is not null
          and not exists (select 1 from public.resources r
                           where r.cell_touchpoint_id = ct.id and r.url = btrim(ct.url)))
      or exists (select 1 from unnest(ct.screenshots) as shot(url)
                  where nullif(btrim(shot.url), '') is not null
                    and not exists (select 1 from public.resources r
                                     where r.cell_touchpoint_id = ct.id and r.url = btrim(shot.url)));
  if missing <> 0 then
    raise exception '% placements still hold a url or screenshot no resource carries', missing;
  end if;
end
$proof$;

-- ---------------------------------------------------------------------------
-- 3. The copy functions carry role, featured and the placement's cell
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  target record;
  after  text;
  rewritten int := 0;
begin
  for target in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('duplicate_path', 'duplicate_scenario')
  loop
    after := pg_get_functiondef(target.oid);

    -- The local that shares a column's name since 21000107000000.
    if target.proname = 'duplicate_path' then
      after := replace(after, '  scenario_id uuid;', '  v_scenario_id uuid;');
      after := replace(after, 'into scenario_id', 'into v_scenario_id');
      after := replace(after, 'if scenario_id is null', 'if v_scenario_id is null');
      after := replace(after,
        'select scenario_id, duplicate_path.name, duplicate_path.kind,',
        'select v_scenario_id, duplicate_path.name, duplicate_path.kind,');
      if after !~ 'v_scenario_id uuid;' or after ~ '\mselect scenario_id,' then
        raise exception 'duplicate_path still names its local ambiguously';
      end if;
    end if;

    -- The placement copy: role in place of the two URL columns.
    after := replace(after,
      '(cell_id, name, position, summary, screenshots, url, origin)',
      '(cell_id, name, position, summary, role, origin)');
    after := replace(after,
      'ct.summary, ct.screenshots, ct.url, ''app''',
      'ct.summary, ct.role, ''app''');

    -- The cell's own resources: its own only, featured carried.
    after := regexp_replace(after,
      '\(cell_id, kind, name, url, position, origin\)(\s+)select nc\.id, r\.kind, r\.name, r\.url, r\.position, ''app''(\s+)from public\.resources r(\s+)join public\.cells c on c\.id = r\.cell_id',
      '(cell_id, kind, name, url, position, featured, origin)\1select nc.id, r.kind, r.name, r.url, r.position, r.featured, ''app''\2from public.resources r\3join public.cells c on c.id = r.cell_id and r.cell_touchpoint_id is null');

    -- The placement's resources: the copied cell, the copied placement, featured.
    after := regexp_replace(after,
      '\(cell_touchpoint_id, kind, name, url, position, origin\)(\s+)select nct\.id, r\.kind, r\.name, r\.url, r\.position, ''app''',
      '(cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)\1select nc.id, nct.id, r.kind, r.name, r.url, r.position, r.featured, ''app''');

    if after ~ 'screenshots' or after !~ 'ct\.role' then
      raise exception '% still copies the two URL columns', target.proname;
    end if;
    if (select count(*) from regexp_matches(after, 'r\.featured', 'g')) <> 2 then
      raise exception '% does not carry featured on both resource copies', target.proname;
    end if;
    if after !~ 'r\.cell_touchpoint_id is null' or after !~ 'select nc\.id, nct\.id' then
      raise exception '% does not separate the cell''s own resources from a placement''s', target.proname;
    end if;

    execute after;
    rewritten := rewritten + 1;
  end loop;

  if rewritten <> 2 then
    raise exception 'expected to rewrite duplicate_path and duplicate_scenario, rewrote %', rewritten;
  end if;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- 4. The columns
-- ---------------------------------------------------------------------------

alter table public.cell_touchpoints
  drop column screenshots,
  drop column url;

comment on table public.cell_touchpoints is
  'One touchpoint used at one cell: its own summary and role at this moment. '
  'What it points at is in resources (cell_touchpoint_id).';


-- ---------------------------------------------------------------------------
-- The IR revision this shape is
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.06',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.06') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  bad int;
  def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cell_touchpoints'
       and column_name in ('screenshots', 'url')
  ) then
    raise exception 'cell_touchpoints still carries screenshots or url';
  end if;

  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.cell_touchpoints'::regclass
     and c.conname = 'cell_touchpoints_role_check';
  if def is null or def !~ '''core''' or def !~ '''peripheral''' then
    raise exception 'cell_touchpoints_role_check is not core | peripheral: %', def;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'duplicate_path'
                and (p.prosrc ~ 'select scenario_id, duplicate_path\.name'
                     or p.prosrc !~ 'v_scenario_id uuid;')) then
    raise exception 'duplicate_path still names its local ambiguously';
  end if;

  select count(*) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind in ('f', 'p')
     and p.prosrc ~ 'ct\.(screenshots|url)\M';
  if bad <> 0 then
    raise exception '% functions still read cell_touchpoints.screenshots or .url', bad;
  end if;

  if exists (select 1 from public.cell_touchpoints where role not in ('core', 'peripheral')) then
    raise exception 'a placement carries a role outside the vocabulary';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000120000000_a_touchpoint_is_a_thing_the_service_owns.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint is a thing the service owns.
--
-- A placement named its touchpoint by a bare `name`, per cell. The same tool
-- placed at nine cells was nine strings that happened to agree, and nothing
-- held them to one spelling, one kind, one summary. A touchpoint is a thing
-- the SERVICE owns — an app, a document, a channel — and a placement is one
-- use of it at one cell.
--
-- So: a registry, `touchpoints`, one row per (service, name); and a
-- placement names its touchpoint one of two ways and exactly one —
-- `touchpoint_id` into the registry, or `name` alone when the registry lacks
-- it. A name-only placement is still a placement: drawn dashed on the board,
-- opening the same panel, offered a "Link to registry" action. It is never
-- matched to the entry it resembles by a rule; that choice is the author's.
--
-- ── The fold ──────────────────────────────────────────────────────────────
--
-- Every existing placement name becomes a registry row for its service
-- (one per spelling, case-insensitively) and the placement links to it.
-- Nothing is lost and nothing is guessed: the registry is minted FROM the
-- names, so every placement lands linked. Vacuous on an empty database.
--
-- ── The functions ─────────────────────────────────────────────────────────
--
-- `sync_cell_touchpoints(p_cell_id, p_names)` brings a cell's placements
-- into line with its text: a new name mints a registry row and a linked
-- placement; a name typed back links the name-only row that kept its
-- writing; a removed placement with anything on it — words, a role,
-- resources — stays as a name-only row, one with nothing on it goes. It
-- hands back what it removed so the caller's inverse can put the words back.
-- `restore_cell_touchpoints` is that inverse. `set_placement_touchpoint`
-- is "Link to registry" and its own inverse; `remove_placement` /
-- `restore_placement` take a name-only row nobody wants off a cell and put
-- it back, resources included. All five SECURITY DEFINER behind
-- `is_service_account()`: `touchpoint_id` and `name` are structure, and
-- structure does not move through a column grant.
--
-- The two copy functions carry the placement's identity across, both ways.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Schema changes, a fold over zero rows, function definitions. The proof is
-- an INVARIANT: the registry exists, no placement names its touchpoint both
-- ways or neither, every placement whose service's registry holds its name
-- is linked, the five functions are definers.


-- ---------------------------------------------------------------------------
-- 1. The registry
-- ---------------------------------------------------------------------------

create table public.touchpoints (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  name       text not null,
  kind       text not null default 'other'
               constraint touchpoints_kind_check
               check (kind in ('app', 'document', 'physical', 'channel', 'service', 'other')),
  summary    text,
  url        text,
  origin     text not null constraint touchpoints_origin_check check (origin in ('import', 'app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint touchpoints_service_id_name_key unique (service_id, name)
);

create trigger set_touchpoints_updated_at
  before update on public.touchpoints
  for each row execute function public.set_updated_at();

comment on table public.touchpoints is
  'The service''s registry of touchpoints — the apps, documents, channels and '
  'things a moment happens through. One row per (service, name); a placement '
  'in cell_touchpoints is one use of one at one cell.';
comment on column public.touchpoints.kind is
  'app | document | physical | channel | service | other. What sort of thing '
  'this is; defaulted to other and judged later, never guessed from a name.';
comment on column public.touchpoints.summary is
  'What this touchpoint IS, for the service — not what it does at any one cell.';
comment on column public.touchpoints.url is
  'Where the touchpoint itself lives, when it has a home; a placement''s own '
  'link is a resource on the placement.';

-- ---------------------------------------------------------------------------
-- 2. Two ways to name a touchpoint, and exactly one
-- ---------------------------------------------------------------------------

alter table public.cell_touchpoints
  add column touchpoint_id uuid references public.touchpoints (id) on delete restrict,
  alter column name drop not null,
  drop constraint cell_touchpoints_cell_name_unique,
  add constraint cell_touchpoints_one_identity
    check ((touchpoint_id is null) <> (name is null)),
  add constraint cell_touchpoints_name_not_blank
    check (name is null or btrim(name) <> ''),
  add constraint cell_touchpoints_cell_id_touchpoint_id_key unique (cell_id, touchpoint_id);

create unique index cell_touchpoints_cell_name_key
  on public.cell_touchpoints (cell_id, lower(name))
  where name is not null;

comment on column public.cell_touchpoints.touchpoint_id is
  'The registry entry this placement names, or null for a name-only placement.';
comment on column public.cell_touchpoints.name is
  'The touchpoint''s name when the registry lacks it. Exactly one of name and '
  'touchpoint_id is set; linking to the registry clears it.';
comment on table public.cell_touchpoints is
  'One touchpoint used at one cell: its own summary and role at this moment. '
  'Named by touchpoint_id into the registry, or by name alone when the '
  'registry lacks it. What it points at is in resources.';

-- ---------------------------------------------------------------------------
-- 3. The fold: every name a registry row, every placement linked
-- ---------------------------------------------------------------------------

insert into public.touchpoints (service_id, name, origin)
select distinct on (ph.service_id, lower(ct.name))
       ph.service_id, ct.name, 'import'
  from public.cell_touchpoints ct
  join public.cells c on c.id = ct.cell_id
  join public.paths p on p.id = c.path_id
  join public.scenarios s on s.id = p.scenario_id
  join public.phases ph on ph.id = s.phase_id
 where ct.name is not null
 order by ph.service_id, lower(ct.name), ct.name;

update public.cell_touchpoints ct
   set touchpoint_id = tp.id,
       name          = null,
       updated_at    = now()
  from public.cells c
  join public.paths p on p.id = c.path_id
  join public.scenarios s on s.id = p.scenario_id
  join public.phases ph on ph.id = s.phase_id
  join public.touchpoints tp on tp.service_id = ph.service_id
 where c.id = ct.cell_id
   and ct.name is not null
   and lower(tp.name) = lower(ct.name);

-- ---------------------------------------------------------------------------
-- 4. The five placement writes
-- ---------------------------------------------------------------------------

create or replace function public.sync_cell_touchpoints(p_cell_id uuid, p_names text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_service_id uuid;
  v_lane_role  text;
  v_bearing    boolean;
  v_removed    jsonb;
  v_wanted     jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select ph.service_id, ln.lane_role
    into v_service_id, v_lane_role
    from public.cells c
    join public.lanes ln on ln.id = c.lane_id
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = p_cell_id;

  if v_service_id is null then
    raise exception 'cell % is not attached to a service', p_cell_id;
  end if;

  -- Content on an actor lane is a sentence about what somebody did; syncing
  -- it would file that sentence in the registry as a tool.
  select v_lane_role in ('frontstage_tech', 'backstage_tech', 'support_systems')
         or exists (select 1 from public.cell_touchpoints where cell_id = p_cell_id)
    into v_bearing;

  if not v_bearing then
    return jsonb_build_object('skipped', true, 'removed', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'position', position)), '[]'::jsonb)
    into v_wanted
    from (
      select name, min(ord)::int as position
        from unnest(p_names) with ordinality as t(name, ord)
       where btrim(name) <> ''
       group by name
    ) deduped;

  insert into public.touchpoints (service_id, name, origin)
  select v_service_id, w.name, 'app'
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
  on conflict (service_id, name) do nothing;

  -- A name typed back links the name-only row that was keeping its
  -- writing, rather than inserting a second row beside it.
  update public.cell_touchpoints ct
     set touchpoint_id = tp.id,
         name          = null,
         updated_at    = now()
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
    join public.touchpoints tp
      on tp.service_id = v_service_id and tp.name = w.name
   where ct.cell_id = p_cell_id
     and ct.touchpoint_id is null
     and lower(ct.name) = lower(w.name)
     and not exists (select 1 from public.cell_touchpoints x
                      where x.cell_id = p_cell_id and x.touchpoint_id = tp.id);

  -- What leaves the text: linked rows whose name is not wanted. Handed back
  -- with everything on them, so the inverse can put the words back.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', tp.name,
           'position', ct.position,
           'summary', ct.summary,
           'role', ct.role,
           'resources', (select coalesce(jsonb_agg(jsonb_build_object(
                             'kind', r.kind, 'name', r.name, 'url', r.url,
                             'position', r.position, 'featured', r.featured, 'origin', r.origin
                           ) order by r.position), '[]'::jsonb)
                           from public.resources r where r.cell_touchpoint_id = ct.id)
         )), '[]'::jsonb)
    into v_removed
    from public.cell_touchpoints ct
    join public.touchpoints tp on tp.id = ct.touchpoint_id
   where ct.cell_id = p_cell_id
     and tp.name not in (
       select w.name from jsonb_to_recordset(v_wanted) as w(name text, position int)
     );

  -- A removed placement with anything on it stays as a name-only row —
  -- words, role and resources intact, drawn dashed — unless the cell already
  -- keeps a name-only row under that name. One with nothing on it goes.
  update public.cell_touchpoints ct
     set touchpoint_id = null,
         name          = tp.name,
         updated_at    = now()
    from public.touchpoints tp
   where ct.touchpoint_id = tp.id
     and ct.cell_id = p_cell_id
     and tp.name not in (
       select w.name from jsonb_to_recordset(v_wanted) as w(name text, position int)
     )
     and (coalesce(btrim(ct.summary), '') <> ''
          or ct.role is not null
          or exists (select 1 from public.resources r where r.cell_touchpoint_id = ct.id))
     and not exists (select 1 from public.cell_touchpoints x
                      where x.cell_id = p_cell_id and x.name is not null
                        and lower(x.name) = lower(tp.name));

  delete from public.cell_touchpoints ct
   using public.touchpoints tp
   where ct.touchpoint_id = tp.id
     and ct.cell_id = p_cell_id
     and tp.name not in (
       select w.name from jsonb_to_recordset(v_wanted) as w(name text, position int)
     );

  update public.cell_touchpoints ct
     set position = w.position,
         updated_at = now()
    from public.touchpoints tp,
         jsonb_to_recordset(v_wanted) as w(name text, position int)
   where ct.touchpoint_id = tp.id
     and ct.cell_id = p_cell_id
     and tp.name = w.name
     and ct.position is distinct from w.position;

  -- Name-only rows sit after the text's own, in the order they had.
  update public.cell_touchpoints ct
     set position = ranked.position,
         updated_at = now()
    from (
      select x.id,
             (select coalesce(max(position), -1) from public.cell_touchpoints y
               where y.cell_id = p_cell_id and y.touchpoint_id is not null)
             + row_number() over (order by x.position, x.name) as position
        from public.cell_touchpoints x
       where x.cell_id = p_cell_id and x.touchpoint_id is null
    ) ranked
   where ct.id = ranked.id
     and ct.position is distinct from ranked.position;

  insert into public.cell_touchpoints (cell_id, touchpoint_id, position, origin)
  select p_cell_id, tp.id, w.position, 'app'
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
    join public.touchpoints tp
      on tp.service_id = v_service_id and tp.name = w.name
   where not exists (
     select 1 from public.cell_touchpoints ct
      where ct.cell_id = p_cell_id and ct.touchpoint_id = tp.id
   );

  return jsonb_build_object('skipped', false, 'removed', v_removed);
end
$function$;

create or replace function public.restore_cell_touchpoints(p_cell_id uuid, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  -- By name, linked or name-only: the revert re-ran the sync first, so a
  -- row that was kept name-only is linked again by the time this runs.
  update public.cell_touchpoints ct
     set summary    = r.summary,
         role       = r.role,
         updated_at = now()
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as r(name text, summary text, role text)
   where ct.cell_id = p_cell_id
     and ((ct.touchpoint_id is not null
           and exists (select 1 from public.touchpoints tp
                        where tp.id = ct.touchpoint_id and tp.name = r.name))
          or (ct.touchpoint_id is null and lower(ct.name) = lower(r.name)));

  -- The resources the placement carried, for a placement that has none —
  -- the one the same revert just re-inserted. One that still has its own
  -- is left alone rather than doubled.
  insert into public.resources
    (cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
  select p_cell_id, ct.id,
         coalesce(nullif(btrim(e.kind), ''), 'link'), e.name, e.url,
         coalesce(e.position, e.ord::int - 1), coalesce(e.featured, false),
         coalesce(nullif(btrim(e.origin), ''), 'app')
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as r(name text, resources jsonb)
    join public.cell_touchpoints ct on ct.cell_id = p_cell_id
    left join public.touchpoints tp on tp.id = ct.touchpoint_id
    cross join lateral (
           select x.kind, x.name, x.url, x.position, x.featured, x.origin, x.ord
             from rows from (
                    jsonb_to_recordset(coalesce(r.resources, '[]'::jsonb))
                      as (kind text, name text, url text, position int, featured boolean, origin text)
                  ) with ordinality as x(kind, name, url, position, featured, origin, ord)
         ) e
   where ((ct.touchpoint_id is not null and tp.name = r.name)
          or (ct.touchpoint_id is null and lower(ct.name) = lower(r.name)))
     and nullif(btrim(e.url), '') is not null
     and not exists (select 1 from public.resources have where have.cell_touchpoint_id = ct.id);
end
$function$;

create or replace function public.set_placement_touchpoint(
  p_placement_id uuid,
  p_touchpoint_id uuid default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_row public.cell_touchpoints;
  v_service_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if (p_touchpoint_id is null) = (nullif(btrim(coalesce(p_name, '')), '') is null) then
    raise exception 'a placement names its touchpoint one way: a registry id or a name';
  end if;

  select ct.* into v_row from public.cell_touchpoints ct where ct.id = p_placement_id for update;
  if v_row.id is null then
    raise exception 'placement % does not exist', p_placement_id;
  end if;

  if p_touchpoint_id is not null then
    select ph.service_id into v_service_id
      from public.cells c
      join public.paths p on p.id = c.path_id
      join public.scenarios s on s.id = p.scenario_id
      join public.phases ph on ph.id = s.phase_id
     where c.id = v_row.cell_id;
    if not exists (select 1 from public.touchpoints tp
                    where tp.id = p_touchpoint_id and tp.service_id = v_service_id) then
      raise exception 'that touchpoint is not in this service''s registry';
    end if;
    if exists (select 1 from public.cell_touchpoints x
                where x.cell_id = v_row.cell_id and x.touchpoint_id = p_touchpoint_id and x.id <> v_row.id) then
      raise exception 'that cell already shows that touchpoint';
    end if;
  end if;

  update public.cell_touchpoints
     set touchpoint_id = p_touchpoint_id,
         name          = case when p_touchpoint_id is null then btrim(p_name) end,
         updated_at    = now()
   where id = p_placement_id;

  return jsonb_build_object('touchpoint_id', v_row.touchpoint_id, 'name', v_row.name);
end
$function$;

create or replace function public.remove_placement(p_placement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_row       jsonb;
  v_resources jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select to_jsonb(ct) into v_row from public.cell_touchpoints ct where ct.id = p_placement_id for update;
  if v_row is null then
    raise exception 'placement % does not exist', p_placement_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.position), '[]'::jsonb)
    into v_resources
    from public.resources r where r.cell_touchpoint_id = p_placement_id;

  delete from public.cell_touchpoints where id = p_placement_id;

  return jsonb_build_object('row', v_row, 'resources', v_resources);
end
$function$;

create or replace function public.restore_placement(p_row jsonb, p_resources jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  insert into public.cell_touchpoints
    (id, cell_id, touchpoint_id, name, position, summary, role, origin, created_at)
  select r.id, r.cell_id, r.touchpoint_id, r.name,
         -- Its old position if free, else after everything the cell shows.
         case when exists (select 1 from public.cell_touchpoints x
                            where x.cell_id = r.cell_id and x.position = r.position)
              then (select coalesce(max(position), -1) + 1 from public.cell_touchpoints x
                     where x.cell_id = r.cell_id)
              else r.position end,
         r.summary, r.role, coalesce(r.origin, 'app'), coalesce(r.created_at, now())
    from jsonb_to_record(p_row)
      as r(id uuid, cell_id uuid, touchpoint_id uuid, name text, position int,
           summary text, role text, origin text, created_at timestamptz)
  returning id into v_id;

  if v_id is null then
    raise exception 'the captured placement could not be restored';
  end if;

  insert into public.resources
    (id, cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
  select coalesce(e.id, gen_random_uuid()), (p_row ->> 'cell_id')::uuid, v_id,
         coalesce(nullif(btrim(e.kind), ''), 'link'), e.name, e.url,
         coalesce(e.position, e.ord::int - 1), coalesce(e.featured, false),
         coalesce(nullif(btrim(e.origin), ''), 'app')
    from rows from (
           jsonb_to_recordset(coalesce(p_resources, '[]'::jsonb))
             as (id uuid, kind text, name text, url text, position int, featured boolean, origin text)
         ) with ordinality as e(id, kind, name, url, position, featured, origin, ord)
   where nullif(btrim(e.url), '') is not null;

  return jsonb_build_object('placement_id', v_id);
end
$function$;

comment on function public.sync_cell_touchpoints(uuid, text[]) is
  'Brings a cell''s placements into line with its text. A new name mints a '
  'registry row; a name typed back links the name-only row; a removed '
  'placement with anything on it becomes name-only, one with nothing is '
  'deleted. Returns what it removed, for restore_cell_touchpoints.';
comment on function public.restore_cell_touchpoints(uuid, jsonb) is
  'The inverse of a sync: summary and role back by name, linked or '
  'name-only; resources re-created for a row that has none.';
comment on function public.set_placement_touchpoint(uuid, uuid, text) is
  'Names a placement''s touchpoint one way — a registry id, or a name the '
  'registry lacks — and returns the previous pair, which is the inverse.';
comment on function public.remove_placement(uuid) is
  'Deletes one placement and returns the row and its resources for '
  'restore_placement.';
comment on function public.restore_placement(jsonb, jsonb) is
  'The inverse of remove_placement: the row back under its own id, '
  'resources included.';

-- ---------------------------------------------------------------------------
-- 5. The copy functions carry a placement's identity across
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  target record;
  after  text;
  rewritten int := 0;
begin
  for target in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('duplicate_path', 'duplicate_scenario')
  loop
    after := pg_get_functiondef(target.oid);
    after := replace(after,
      '(cell_id, name, position, summary, role, origin)',
      '(cell_id, touchpoint_id, name, position, summary, role, origin)');
    after := replace(after,
      'select nc.id, ct.name, ct.position, ct.summary, ct.role, ''app''',
      'select nc.id, ct.touchpoint_id, ct.name, ct.position, ct.summary, ct.role, ''app''');
    after := replace(after,
      'on nct.cell_id = nc.id and nct.name = ct.name',
      'on nct.cell_id = nc.id and nct.touchpoint_id is not distinct from ct.touchpoint_id and nct.name is not distinct from ct.name');
    -- Found while proving the copy: duplicate_path's default kind was still
    -- 'alternative', a value paths_kind_check has refused since the kinds
    -- became happy | variant | exception. A copy is a variant.
    after := replace(after,
      'kind text DEFAULT ''alternative''::text',
      'kind text DEFAULT ''variant''::text');
    if after ~ '''alternative''' then
      raise exception '% still defaults a path kind the check refuses', target.proname;
    end if;
    if after !~ 'ct\.touchpoint_id, ct\.name' or after !~ 'nct\.touchpoint_id is not distinct from' then
      raise exception '% does not carry a placement''s identity', target.proname;
    end if;
    execute after;
    rewritten := rewritten + 1;
  end loop;
  if rewritten <> 2 then
    raise exception 'expected to rewrite duplicate_path and duplicate_scenario, rewrote %', rewritten;
  end if;
end
$rewrite$;


-- ---------------------------------------------------------------------------
-- The IR revision this shape is
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.07',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.07') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  bad int;
  fn  text;
begin
  if to_regclass('public.touchpoints') is null then
    raise exception 'the registry is missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.cell_touchpoints'::regclass
                    and conname = 'cell_touchpoints_one_identity') then
    raise exception 'cell_touchpoints has no one-identity check';
  end if;

  select count(*) into bad from public.cell_touchpoints
   where (touchpoint_id is null) = (name is null);
  if bad <> 0 then
    raise exception '% placements name their touchpoint both ways or neither', bad;
  end if;

  -- The fold left nothing name-only that its service's registry could name.
  select count(*) into bad
    from public.cell_touchpoints ct
    join public.cells c on c.id = ct.cell_id
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where ct.name is not null
     and exists (select 1 from public.touchpoints tp
                  where tp.service_id = ph.service_id and lower(tp.name) = lower(ct.name));
  if bad <> 0 then
    raise exception '% placements stayed name-only with their name in the registry', bad;
  end if;

  foreach fn in array array[
    'public.sync_cell_touchpoints(uuid, text[])',
    'public.restore_cell_touchpoints(uuid, jsonb)',
    'public.set_placement_touchpoint(uuid, uuid, text)',
    'public.remove_placement(uuid)',
    'public.restore_placement(jsonb, jsonb)'
  ] loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
  end loop;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000121000000_an_upload_is_an_attachment_with_a_stable_url.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An upload is an attachment with a stable URL.
--
-- 21000118000000 gave `resources` an `attachment` kind: a file the cell
-- points at, carried as a url like any other resource. Until now the only
-- way a file got there was a deploy — a path inside whatever site shipped
-- this template. This is where a person adds one: a public-read Storage
-- bucket on the free tier, one object per attachment, its public URL the
-- row's `url`. The row's kind is decided when it is made; the bytes at the
-- other end decide how it is shown.
--
-- ── The bucket (recipe) ───────────────────────────────────────────────────
--
-- `cell-attachments`, public. Public because the app reads without a
-- session — every board is readable by anon — and a private bucket would
-- need a signed URL per image per viewer, minted by a session the reader
-- does not have. Reading is the same posture as the tables: open. Writing
-- is not.
--
-- Objects are keyed `cells/<cell id>/<generated id>.<ext>`: ids and nothing
-- else, so renaming the placement, the touchpoint or the cell changes no
-- URL. No orphan purge: deleting the row leaves the object, a bounded cost
-- on a bucket this size.
--
-- The policies mirror the tables: SELECT for anyone signed in (anon reads
-- through the public URL, which never consults a policy), INSERT / UPDATE /
-- DELETE only for `authenticated` AND `is_service_account()`, and only under
-- the key pattern above. `slice-illustrations` reached the same shape in two
-- steps; this bucket starts there. Each write policy carries the guard
-- itself, so the four policies are the whole rule.
--
-- Storage is Supabase's, so the bucket and its policies are recipe. The
-- portable core knows nothing of buckets; a backend without one keeps
-- attachments wherever it keeps files and writes their URLs into the row.
--
-- ── The rule (core) ───────────────────────────────────────────────────────
--
-- A resource's url is a URL, never a path inside the site that happens to
-- deploy this template: `resources_url_absolute`. Vacuous on an empty
-- database and on every seed this repo ships — no sample resource names a
-- path. `cells.frame` is NOT held to the same rule here: the sample's
-- storyboard frames name the template's own cover figures, shipped with it
-- and not one deployment's content, and a rule the shipped seed breaks is
-- not a rule.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- The shim models `storage.buckets` and `storage.objects`, so the bucket row
-- and the policies replay. The proof is an INVARIANT: the constraint exists
-- and no url starts with `/`; under the recipe, the bucket exists and is
-- public, the four policies exist, and no write policy admits anon.


alter table public.resources
  add constraint resources_url_absolute check (url is null or url !~ '^/');

comment on constraint resources_url_absolute on public.resources is
  'A resource points at a URL, never at a path inside whatever site deployed this template. An uploaded file''s URL is its object''s in the cell-attachments bucket (21000121000000).';

do $proof$
declare
  bad int;
begin
  select count(*) into bad from public.resources where url ~ '^/';
  if bad <> 0 then raise exception '% resources still point inside the site', bad; end if;
  if not exists (select 1 from pg_constraint where conname = 'resources_url_absolute') then
    raise exception 'the absolute-url check is missing';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000122000000_the_tech_lanes_were_never_only_tech.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The tech lanes were never only tech, and a lane role is a closed set.
--
-- `lane_role` was the one classifier column in this schema with no CHECK.
-- Every sibling has one — `paths.kind`, `scenarios.layout`, `slices.kind`,
-- five `origin` columns, the `resources` and `cell_touchpoints` kinds — so a
-- lane role could drift to any spelling and nothing would report it. This
-- closes it, and in closing it finishes three renames the data layer had
-- already begun to make at the render layer:
--
--   frontstage_tech      → frontstage_touchpoints
--   backstage_tech       → backstage_touchpoints
--   visual               → storyboard
--
-- ── Why the tech lanes become touchpoints ──────────────────────────────────
--
-- A "tech" lane never held only software. It held the things a moment happens
-- THROUGH — an app, a document, a channel, a place — which is exactly a
-- touchpoint. `cell_touchpoints` already carries them under that name; the
-- lane the customer or staff meets them in is a touchpoints lane.
--
-- ── The support split ──────────────────────────────────────────────────────
--
-- `support_systems` did two jobs at once: back-office PEOPLE (the teams and
-- vendors behind the work) and back-office SYSTEMS (the tools they run). The
-- people are `support_actions`; the systems are touchpoints like any other.
-- Every `support_systems` lane in this template is a systems lane — reference
-- material and guardrails the service rests on — so each becomes
-- `backstage_touchpoints`, and its cells keep the stacked, per-item face they
-- already wore. `support_actions` enters the vocabulary for the people lane an
-- adopter may add, and `partner_actions` for a party outside the service.
--
-- ── Why the set is closed, and what a role outside it becomes ───────────────
--
-- A custom role is no longer allowed — an unconstrained column is how a lane
-- goes unclassified, and the divider lines are drawn from the role, so an
-- unrecognised one draws nothing. `step_visual` never named a lane here (a
-- step never carried its own storyboard variation), so it is retired unused.
-- Any lane still carrying a role outside the eight — a `stakeholders`
-- swimlane, an adopter's own word — is set to null, which is a generic
-- swimlane and is exactly how such a lane already rendered: no role style, no
-- divider anchored on it. Null stays legal on purpose, for the actor lanes
-- that carry a person's name and no blueprint role.
--
-- ── Replaying against an empty database ─────────────────────────────────────
--
-- Every rename is an idempotent UPDATE over whatever rows exist, vacuous on
-- zero lanes; the constraint validates every existing row as it is added, so a
-- bad role aborts the migration rather than reaching the proof. The proof is
-- an INVARIANT — the constraint admits exactly the eight, and no lane holds a
-- role outside them — never a census.


-- ---------------------------------------------------------------------------
-- 1. The renames, then the roles the closed set does not admit
-- ---------------------------------------------------------------------------

update public.lanes set lane_role = 'frontstage_touchpoints'
 where lane_role = 'frontstage_tech';
update public.lanes set lane_role = 'backstage_touchpoints'
 where lane_role = 'backstage_tech';
update public.lanes set lane_role = 'storyboard'
 where lane_role = 'visual';

-- A back-office system is a touchpoint. Every support_systems lane here is one.
update public.lanes set lane_role = 'backstage_touchpoints'
 where lane_role = 'support_systems';

-- Anything still outside the eight — a custom role, a retired one — is a
-- generic swimlane. This is what makes the ADD CONSTRAINT below succeed on
-- data that predates the closed vocabulary, and it changes no rendering: a
-- role with no style and no divider already drew as a plain swimlane.
update public.lanes set lane_role = null
 where lane_role is not null
   and lane_role not in (
     'customer_actions',
     'frontstage_actions',
     'backstage_actions',
     'partner_actions',
     'frontstage_touchpoints',
     'backstage_touchpoints',
     'support_actions',
     'storyboard'
   );

-- ---------------------------------------------------------------------------
-- 2. The closed constraint
-- ---------------------------------------------------------------------------
--
-- `is null or in (...)` rather than a bare `in (...)`: a NULL inside `in`
-- evaluates to NULL, which a CHECK treats as satisfied, so the bare form would
-- permit NULL by accident rather than on purpose. Null is a decision here — an
-- actor lane carries no blueprint role — and the next person tightening this
-- needs to see that.

alter table public.lanes
  drop constraint if exists lanes_lane_role_check;

alter table public.lanes
  add constraint lanes_lane_role_check
  check (
    lane_role is null
    or lane_role in (
      'customer_actions',
      'frontstage_actions',
      'backstage_actions',
      'partner_actions',
      'frontstage_touchpoints',
      'backstage_touchpoints',
      'support_actions',
      'storyboard'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The bearing check inside sync_cell_touchpoints
-- ---------------------------------------------------------------------------
--
-- The sync files a cell's text in the touchpoint registry only when the lane
-- is a touchpoints lane (or the cell already holds a placement). It named the
-- old roles; it must name the new ones, or a touchpoints lane's edits stop
-- reaching the registry. Rewritten from its own current definition so the rest
-- of the body — every line this migration does not touch — carries across
-- unchanged.

do $rewrite$
declare
  after text;
begin
  after := pg_get_functiondef('public.sync_cell_touchpoints(uuid, text[])'::regprocedure);
  after := replace(
    after,
    'v_lane_role in (''frontstage_tech'', ''backstage_tech'', ''support_systems'')',
    'v_lane_role in (''frontstage_touchpoints'', ''backstage_touchpoints'')'
  );
  if after ~ '''frontstage_tech''' or after !~ '''frontstage_touchpoints''' then
    raise exception 'sync_cell_touchpoints still names the retired touchpoints roles';
  end if;
  execute after;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- 4. Say what the roles are, where the schema keeps its prose
-- ---------------------------------------------------------------------------
--
-- The column comment is a second list, and `check-retired-identifiers.mjs`
-- treats pg_description as a trusted prose surface — leaving it naming
-- `frontstage_tech` and `support_systems` would be the same drift this
-- migration exists to close, one layer down.

comment on column public.lanes.lane_role is
  'Semantic role key that drives rendering (touchpoint cells, storyboard rows, '
  'divider-line anchoring); the display name stays in lanes.name and is '
  'free-form in any language. Canonical values: customer_actions, '
  'frontstage_actions, backstage_actions, partner_actions, '
  'frontstage_touchpoints, backstage_touchpoints, support_actions, storyboard. '
  'Null = generic swimlane (e.g. actor lanes), and is permitted on purpose. '
  'Constrained by lanes_lane_role_check — a custom role is not allowed, '
  'because an unconstrained column is how a lane goes unclassified.';


-- ---------------------------------------------------------------------------
-- The IR revision this shape is
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.09.08',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.09.08') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  def text;
  bad int;
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.lanes'::regclass
     and c.conname = 'lanes_lane_role_check';
  if def is null then
    raise exception 'lanes_lane_role_check is missing';
  end if;
  if def ~ 'frontstage_tech' or def ~ 'backstage_tech'
     or def ~ 'support_systems' or def ~ '''visual''' or def ~ 'step_visual' then
    raise exception 'lanes_lane_role_check still admits a retired role: %', def;
  end if;
  foreach def in array array[
    'customer_actions', 'frontstage_actions', 'backstage_actions',
    'partner_actions', 'frontstage_touchpoints', 'backstage_touchpoints',
    'support_actions', 'storyboard'
  ] loop
    if pg_get_constraintdef((
         select c.oid from pg_constraint c
          where c.conrelid = 'public.lanes'::regclass
            and c.conname = 'lanes_lane_role_check'
       )) !~ def then
      raise exception 'lanes_lane_role_check does not admit %', def;
    end if;
  end loop;

  select count(*) into bad from public.lanes
   where lane_role is not null
     and lane_role not in (
       'customer_actions', 'frontstage_actions', 'backstage_actions',
       'partner_actions', 'frontstage_touchpoints', 'backstage_touchpoints',
       'support_actions', 'storyboard'
     );
  if bad <> 0 then
    raise exception '% lanes hold a role outside the closed set', bad;
  end if;

  if (select prosrc from pg_proc where oid = 'public.sync_cell_touchpoints(uuid, text[])'::regprocedure)
       ~ 'frontstage_tech' then
    raise exception 'sync_cell_touchpoints still reads a retired touchpoints role';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000123000000_every_core_kind_carries_a_local_example.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Every core kind carries a local example.
--
-- A definition popover teaches the generic concept — what a phase is, what a
-- lane is — but it cannot ground that concept in the reader's own service
-- without one of two bad outcomes: bake one deployment's content in as
-- everyone's, or show nothing concrete and leave the abstraction abstract. The
-- fix is an authored, free-text example for each of the six core kinds —
-- service, phase, scenario, path, step, lane — written once, per deployment,
-- and shown under the definition as its own section.
--
-- ── Why a column on `services`, and why jsonb ────────────────────────────
--
-- The set is small, fixed, per-service and never queried on its own, so it is
-- a single jsonb object on the service row rather than a child table. It rides
-- the service block of the blueprint source: the mapping skill authors it, the
-- seed generator emits it, and a re-map round-trips it, which is why this is
-- blueprint DATA on `services` and not app config in a file a re-map would
-- wipe.
--
-- The six keys are a fixed vocabulary the app owns, so there is deliberately
-- NO CHECK here. A constraint enumerating the keys would be a second place the
-- kind list lives, and it would reject a forward-compatible seventh key on the
-- day the app learned to write one. The column stays a plain jsonb object; the
-- shape is enforced where it is read.
--
-- Additive and non-breaking: default `{}` so the row that exists today, and
-- every deployment that has authored nothing yet, reads back an empty map and
-- renders no example. It applies before the read that consumes it merges.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- One additive column with a default. The proof is an INVARIANT, never a
-- census: after the add every row has a non-null object default, which is
-- vacuously true on an empty replay and is the evidence on a live target that
-- the default took and no reader meets a null map.
--
-- The whole migration is portable core: a plain column on a plain table, with
-- no Supabase primitive named. The table-level select policy already covers a
-- new column, so there is no recipe fragment.

alter table public.services
  add column if not exists entity_examples jsonb not null default '{}'::jsonb;

comment on column public.services.entity_examples is
  'Per-service authored examples, one free-text value per core kind (service, phase, scenario, path, step, lane), shown under each kind''s definition to ground it in this deployment. Blueprint data, not app config: it rides the service block so a re-map round-trips it. A jsonb object with no CHECK — the six-key shape is the app''s, and an unwritten key simply does not render.';

do $proof$
declare
  v_nulls integer;
begin
  select count(*) into v_nulls
    from public.services
   where entity_examples is null;
  if v_nulls <> 0 then
    raise exception
      'proof: % service row(s) have a null entity_examples; the default did not take', v_nulls;
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000124000000_a_touchpoint_carries_its_icon.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint carries its icon.
--
-- A well-known tool shows a stock logo in the detail panel — Zoom's mark, a
-- form's glyph. In the instance this template was generalised from, that logo
-- lived in CODE: a `Record<string, logo>` keyed on the tool's NAME ("Zoom",
-- "Slack", an app named after the deployment), read by a resolver that a
-- foreign tool fell straight through. A name-keyed map in the renderer is a
-- deployment's vocabulary wearing a code hat — the exact coupling this
-- convergence is unwinding (Decision D4: a value belongs in a row, not a hook).
--
-- A touchpoint is a thing the SERVICE owns (21000120000000), and its icon is a
-- property of the thing, authored once per (service, tool) — not per placement,
-- and never in the renderer. So it lands here, on the registry: one nullable
-- `icon_url`. The template ships it null and draws nothing; a deployment seeds
-- the URL of its own asset, and the generic panel reads it off the row. Zoom's
-- logo stops being a branch in a TypeScript file and becomes a string in a
-- column a re-map round-trips.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- One additive column with no default beyond NULL. The proof is an INVARIANT,
-- never a census: the column exists and is nullable, which is vacuously true on
-- an empty replay and is the evidence on a live target that the add took and no
-- existing row was forced to carry a value it does not have.
--
-- The whole migration is portable core: a plain column on a plain table, no
-- Supabase primitive named. The table-level SELECT policy and grant from
-- 21000120000000 already cover a new column — anon reads it the moment it
-- exists — so there is no recipe fragment (the same stance as
-- 21000123000000).

alter table public.touchpoints
  add column if not exists icon_url text;

comment on column public.touchpoints.icon_url is
  'A stable URL for the touchpoint''s stock icon or logo — the mark a '
  'well-known tool shows in the detail panel. A property of the thing the '
  'service owns, authored once per (service, name), not per placement. Blueprint '
  'data, not app config: the template ships it null and draws nothing, and a '
  'deployment seeds its own asset URL. The renderer reads this row rather than '
  'matching a tool name against a table baked into code.';

do $proof$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'touchpoints'
       and column_name = 'icon_url'
  ) then
    raise exception 'proof: touchpoints.icon_url did not take';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'touchpoints'
       and column_name = 'icon_url'
       and is_nullable = 'NO'
  ) then
    raise exception 'proof: touchpoints.icon_url must be nullable — a touchpoint without a logo carries none';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000125000000_an_entity_has_a_status_and_a_lane_names_its_actor.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An entity has a status, and a lane names its actor.
--
-- Two things the panel editors need that this core never had (#357, split out
-- of #321). Both were built in the instance this template was generalised
-- from, where they earned their shape; this migration brings that shape here
-- so the editors can follow without inventing a second one.
--
-- ── A status ──────────────────────────────────────────────────────────────
--
-- How far along the thing an entity describes is. A current-state blueprint
-- documents what is in use, so the default is `live`; a route being designed
-- is `proposed`, one committed to is `planned`, one that exists and waits is
-- `built`, one being taken away is `deprecated`, and one in trouble is
-- `at_risk`. The vocabulary is ONE domain shared by cells and paths — a
-- second list would drift from the first within a month — and it lives in a
-- column, not in a name prefix a reader has to parse and nothing can query.
--
-- ── A cast, and a lane that picks from it ─────────────────────────────────
--
-- A lane's `name` says what it is called. Which ACTOR does the work — the
-- learner, the tutor, the partner, the service itself — was free text that
-- named the same people four ways and agreed with none of them. So: a cast
-- list, `stakeholders`, and a lane that names its actor by id. A structural
-- lane (the storyboard, the touchpoint rows) names nobody, which is the whole
-- point: a null actor is what tells a reader "this row is scaffolding, not a
-- person".
--
-- The cast is the DEPLOYMENT's, not a service's (ADR 0003). The name is the
-- identity, unique across the whole deployment, and a service "has" an actor
-- exactly when one of its lanes names it. So there is no `service_id` here
-- and never was: the same learner recurs across services by name, not as one
-- row per service. `kind` sorts the cast — recipient | staff | partner |
-- provider | team — and `team` is a kind of its own because a team is a group
-- a lane can be, while `staff` are the people in it who ARE actors too.
--
-- The cast carries no `origin`. A touchpoint is minted from a cell's text, so
-- import-or-app is a fact about how its row came to be; an actor is only ever
-- picked, by an author, and the flag would distinguish nothing.
--
-- The touchpoint registry is not linked to the cast here. A touchpoint's owner
-- is a join across two catalogs, and this core's touchpoints are still a
-- service's (21000120000000) while the cast is the deployment's; the link
-- waits for the registry to make the same move, so both ends agree.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- A domain, two columns with a default, a table, a nullable column and its
-- index. Every one is additive, so no row is touched and the schema version
-- does not move (the columns and the index are guarded with `if not exists`
-- because a column add is the one statement here a partial re-run could
-- repeat; the domain and the table are bare, as every sibling's are — the
-- series is applied once, in order, never re-run) —
-- this changes what a target CAN hold, not the shape of what the IR authors
-- (the same stance as 21000121000000, 21000123000000, 21000124000000). The
-- proof is an INVARIANT, never a census: the domain exists, both status
-- columns are on it and refuse null, the cast exists and is unique by name,
-- the lane's actor is nullable and points at the cast. Each reads the same on
-- an empty replay as on a live target.


-- ---------------------------------------------------------------------------
-- 1. The vocabulary
-- ---------------------------------------------------------------------------

create domain public.entity_status as text
  check (value in ('proposed', 'planned', 'built', 'live', 'at_risk', 'deprecated'));

comment on domain public.entity_status is
  'How far along the thing an entity describes is. One vocabulary shared by '
  'cells and paths — a second list would drift from the first within a month.';

-- ---------------------------------------------------------------------------
-- 2. A cell and a path carry one
-- ---------------------------------------------------------------------------

alter table public.cells
  add column if not exists status public.entity_status not null default 'live';

comment on column public.cells.status is
  'How far along the thing this cell describes is. Defaults to live — a '
  'current-state blueprint documents what is in use.';

alter table public.paths
  add column if not exists status public.entity_status not null default 'live';

comment on column public.paths.status is
  'How far along this route is. Defaults to live. A badge renders from this '
  'row, never from a prefix in the name.';

-- ---------------------------------------------------------------------------
-- 3. The cast
-- ---------------------------------------------------------------------------

create table public.stakeholders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null
               constraint stakeholders_kind_check
               check (kind in ('recipient', 'staff', 'partner', 'provider', 'team')),
  summary    text,
  aliases    text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stakeholders_name_key unique (name)
);

create trigger set_stakeholders_updated_at
  before update on public.stakeholders
  for each row execute function public.set_updated_at();

comment on table public.stakeholders is
  'Deployment-level cast list: one pool of actors a lane picks from, unique by '
  'name across the deployment. A lane references a stakeholder; no service '
  'owns one (ADR 0003).';
comment on column public.stakeholders.name is
  'The identity: unique across the deployment, so the same actor recurs across '
  'services by name rather than as one row per service.';
comment on column public.stakeholders.kind is
  'recipient | staff | partner | provider | team. Who this is to the service. '
  'A team is a group a lane can be; staff are the people in it, and they are '
  'actors too.';
comment on column public.stakeholders.summary is
  'Who this actor IS, for the deployment — not what they do at any one cell.';
comment on column public.stakeholders.aliases is
  'Other spellings this blueprint has used for the same actor, so a match by '
  'name finds them.';

-- ---------------------------------------------------------------------------
-- 4. A lane names its actor
-- ---------------------------------------------------------------------------

alter table public.lanes
  add column if not exists stakeholder_id uuid
    references public.stakeholders (id) on delete set null;

-- The delete path and the picker both walk lanes by actor; every other
-- foreign key in the series has its index.
create index if not exists lanes_stakeholder_id_idx
  on public.lanes (stakeholder_id);

comment on column public.lanes.stakeholder_id is
  'The actor whose work this lane holds, or null for a structural lane — the '
  'storyboard, the touchpoint rows — that names nobody. An association, not a '
  'parent: the lane is the service''s, the actor is the deployment''s, and an '
  'actor taken out of the cast un-names its lanes rather than pinning itself.';


-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  col record;
begin
  if to_regtype('public.entity_status') is null then
    raise exception 'proof: the entity_status domain is missing';
  end if;

  for col in
    select table_name, is_nullable, domain_name, column_default
      from information_schema.columns
     where table_schema = 'public'
       and table_name in ('cells', 'paths')
       and column_name = 'status'
  loop
    if col.is_nullable = 'YES' then
      raise exception 'proof: %.status must refuse null — every entity has a status', col.table_name;
    end if;
    if col.domain_name is distinct from 'entity_status' then
      raise exception 'proof: %.status is not on the entity_status domain', col.table_name;
    end if;
    if col.column_default not like '''live''%' then
      raise exception 'proof: %.status must default to live — a current-state blueprint documents what is in use', col.table_name;
    end if;
  end loop;

  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and table_name in ('cells', 'paths')
         and column_name = 'status') <> 2 then
    raise exception 'proof: cells.status and paths.status did not both take';
  end if;

  if to_regclass('public.stakeholders') is null then
    raise exception 'proof: the cast is missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.stakeholders'::regclass
                    and conname = 'stakeholders_name_key'
                    and contype = 'u') then
    raise exception 'proof: the cast is not unique by name';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = 'stakeholders'
                and column_name = 'service_id') then
    raise exception 'proof: the cast is the deployment''s — it must not carry a service_id';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'lanes'
                    and column_name = 'stakeholder_id'
                    and is_nullable = 'YES') then
    raise exception 'proof: lanes.stakeholder_id must exist and be nullable — a structural lane names nobody';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.lanes'::regclass
                    and contype = 'f'
                    and confrelid = 'public.stakeholders'::regclass) then
    raise exception 'proof: lanes.stakeholder_id does not point at the cast';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000126000000_a_step_says_what_its_moment_is.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A step says what its moment is, and the service panel may write its own.
--
-- One column and three grants, all for the same reason (#357, alongside
-- 21000125000000): the panel editors that follow write these fields DIRECTLY,
-- under the caller's own privileges rather than through a definer function, so
-- a field that is not on the write surface refuses the save no matter how good
-- the form above it looks.
--
-- ── The column ────────────────────────────────────────────────────────────
--
-- A step is the only level a reader scans horizontally and has nothing to
-- read: it owns exactly one column, `name`. The column under it holds five
-- lanes' worth of cells and not one sentence saying what the moment as a whole
-- IS.
--
-- The first instinct is to put that sentence in the storyboard lane's cell —
-- the row already exists, in every path, at a real grid position. It does not
-- work. A storyboard cell's face comes from its frames, so a cell with no
-- picture does not render, is therefore not clickable, and the cell panel
-- cannot reach it. The sentence would land in exactly the place this effort
-- exists to remove: a filled field with no front door.
--
-- Step identity is clean, which makes the column cheap. `steps` holds one row
-- per step, keyed on `scenario_id`; `path_steps` only positions it. No
-- fan-out, no drift, and it covers every step rather than the subset that
-- happens to carry a frame today. It renders as the caption under the
-- storyboard frame, which is step-grained already.
--
-- ── The grants ────────────────────────────────────────────────────────────
--
-- `services.summary` and `services.entity_examples` are content columns the
-- Service panel writes in place. No key rides in either, so granting UPDATE on
-- them moves no row anywhere — it is the same kind of grant `cells.summary`
-- has held since the authoring foundation.
--
-- Neither has ever been named on the write surface. `services` is the one
-- spine table that was never revoked and re-granted column by column, so on a
-- host whose platform hands `authenticated` a table's whole UPDATE at creation
-- the panel happened to work, and on the portable core — where nothing hands
-- out anything — it did not. Naming the two columns makes the surface the same
-- shape on both, and says out loud which two of the service's fields a
-- signed-in author may write. Nothing is revoked here: a host that already
-- granted more keeps it, and this file's job is to guarantee the floor, not to
-- re-posture a table it did not narrow.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- One nullable column and three grants. Every one is additive, so no row is
-- touched and the schema version does not move — this changes what a target
-- CAN hold, not the shape of what the IR authors (the same stance as
-- 21000123000000, 21000124000000, 21000125000000). The column add is guarded
-- with `if not exists` because it is the one statement here a partial re-run
-- could repeat.
--
-- There are TWO proofs because the halves answer different questions. The
-- core's: the column exists and is nullable — a step nobody has described yet
-- is the ordinary case, not an error. The recipe's: `authenticated` can UPDATE
-- each of the three columns. That second question can only be asked where
-- `authenticated` exists, which is the recipe's business; asking it in the
-- core would make the portable core name the host it exists to be independent
-- of. Both are invariants, never censuses, and both read the same on an empty
-- replay as on a live target.


-- ---------------------------------------------------------------------------
-- 1. What the moment is
-- ---------------------------------------------------------------------------

alter table public.steps add column if not exists summary text;

comment on column public.steps.summary is
  'What this moment is, across every lane — the one sentence that makes the '
  'column legible without reading five cells. Shown as the caption on the '
  'storyboard frame. Null until an author writes it.';

-- ---------------------------------------------------------------------------
-- Proof — the column, as an invariant
-- ---------------------------------------------------------------------------

do $proof$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'steps'
                    and column_name = 'summary'
                    and is_nullable = 'YES') then
    raise exception 'proof: steps.summary must exist and be nullable — a step nobody has described yet is the ordinary case';
  end if;
  if (select data_type from information_schema.columns
       where table_schema = 'public'
         and table_name = 'steps'
         and column_name = 'summary') is distinct from 'text' then
    raise exception 'proof: steps.summary is not text — the caption is prose, not a key';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000127000000_a_phase_may_say_what_it_is.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A phase may say what it is.
--
-- The Phase panel (#357, slice 3) writes `phases.summary` directly, under the
-- signed-in author's own privileges. It could not: 20260729120000 revoked
-- UPDATE on `phases` from `authenticated` and re-granted exactly two columns,
-- `business_impact` and `operational_requirements`. The column was still
-- called `description` then; 21000108000000 renamed it to `summary` and, being
-- a rename, moved the word and not the grant — there was none to move. So the
-- one sentence the panel leads with was the one field a signed-in author
-- could not save. Found by replaying the whole series and asking
-- `has_column_privilege` for every column the five panels write; this was
-- the only refusal.
--
-- Nothing in the core changes. The grant is the recipe's business —
-- `authenticated` is a role only the recipe creates — so this file is recipe
-- from its first statement, and its proof is the one the panel's save asks:
-- can this role UPDATE this column. Additive; the schema version does not
-- move (the same stance as 21000126000000).

-- ─────────────────────────────────────────────────────────────────────────
-- 21000128000000_a_grant_is_not_a_policy.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A grant is not a policy, and the service was only ever granted.
--
-- 21000126000000 put `services.summary` and `services.entity_examples` on the
-- write surface, and the Service panel still cannot save either. The grant was
-- necessary and it was not sufficient: `public.services` has row level security
-- enabled and carries exactly one policy, `services_select`. Under RLS an
-- UPDATE with no matching policy does not error — it matches no row. So the
-- save returns 200 with an empty payload, `requireRowsWritten` reads the zero
-- and raises "That service no longer exists", and the author is told their
-- service was deleted when what actually happened is that nothing was ever
-- allowed to touch it.
--
-- ── Why this is the one table it happened to ──────────────────────────────
--
-- Every other table the panels write got its update policy the day it got its
-- column grants: `lanes` and `phases` from the derived layer, `steps`, `paths`
-- and `scenarios` in 20260818000000, `business_models` in the propositions
-- work, `stakeholders` in 21000125000000. `services` is the spine's root and
-- nothing had ever written it — the IR builds a service, it does not edit one —
-- so it was the only table that reached the panel era with a read policy and
-- nothing else. 21000126000000 saw the missing grant, which is the half that is
-- visible in a column list, and had no reason to look for the half that is not.
--
-- ── Why dev never saw it ──────────────────────────────────────────────────
--
-- Local authoring signs in with `VITE_SUPABASE_DEV_SERVICE_KEY`, and
-- `service_role` bypasses row level security outright. The panel saved on every
-- laptop it was built on. It is the deployed, signed-in author — the only
-- caller RLS actually applies to — who is refused, which is the failure mode
-- this whole band keeps producing: a check that passes because the tester holds
-- a key no reader holds.
--
-- ── Shape ─────────────────────────────────────────────────────────────────
--
-- The same shape as `steps_update_auth` in 20260818000000, and for the same
-- reason: the column grant above it is what narrows the write, so the policy
-- says who and the grant says what. `using (true) with check (true)` is not a
-- widening — a signed-in author already writes `steps`, `paths`, `scenarios`
-- and `phases` on exactly these terms, and `services` is now consistent with
-- them rather than exceptional.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Recipe-only and additive: no table, no column, no row. The schema version
-- does not move (the same stance as 21000126000000 and 21000127000000). The
-- `drop policy if exists` makes a partial re-run idempotent. The proof is an
-- invariant — the policy is there, for `authenticated`, for UPDATE — and reads
-- the same on an empty replay as on a live target.

-- ─────────────────────────────────────────────────────────────────────────
-- 21000129000000_a_sql_body_keeps_the_name_it_was_written_with.sql
-- ─────────────────────────────────────────────────────────────────────────

-- `slices_referencing` still reads `slice_items`, and every delete says so.
--
-- 21000115000000 renamed the table to `slides` and moved every dependent name
-- a catalogue can see — the four constraints, the two indexes, the trigger, the
-- four PERMISSIVE policies. It missed two things: the three RESTRICTIVE policies
-- the optional tier recipe had already created under the old name, and the one
-- kind of name no catalogue holds at all — the text a function body was created
-- with.
--
-- `slices_referencing` is `language sql`. A SQL body is stored verbatim and is
-- not re-resolved when a relation it names is renamed, so the function survived
-- the rename intact and fails on CALL:
--
--   select public.slices_referencing(array[]::uuid[]);
--   ERROR:  relation "public.slice_items" does not exist
--
-- `deletion_impact` reads it for `affected_slices`, and `delete_cell`,
-- `remove_lane`, `remove_lanes`, `remove_step`, `delete_path` and
-- `delete_scenario` all read `deletion_impact`. So no structural delete could
-- succeed at all on a database built from this series — the confirm dialog
-- raises 42P01 at the moment somebody is deleting something.
--
-- ── Why 21000115 did not catch it ─────────────────────────────────────────
--
-- It knew about bodies. It rewrote `duplicate_path` and `duplicate_scenario`
-- from `pg_get_functiondef`, and its proof swept those same two for the
-- retired COLUMN word. Both halves were scoped by name to the two functions
-- that copy `cells.picture`, because that is the rename that file was thinking
-- about; the TABLE rename in the same file got the catalogue pass and no body
-- pass at all. A sweep scoped to the functions you already suspect can only
-- confirm what you suspected — which is why the assertion added with this file
-- (`npm run check:function-bodies`) calls EVERY `language sql` function in
-- `public` rather than the ones a reader would think to name.
--
-- The deployment this template was generalised from hit the same defect in the
-- same rename and fixed it the same way — a `create or replace` per body, with
-- the moved names changed and nothing else — so this is that fix, on the two
-- occurrences this schema has.
--
-- ── The three policies the same rename left behind ────────────────────────
--
-- The catalogue pass 21000115 DID run was not complete either, and the sweep
-- that reads a built database is what says so rather than a reading of the
-- file. `20260818002000` — the OPTIONAL service-account tier, a recipe —
-- creates a RESTRICTIVE insert/update/delete policy per table from a
-- hand-written table list, and that list still read `slice_items`. So a
-- database that replays the whole series carries
-- `slice_items_insert_service_only`, `slice_items_update_service_only` and
-- `slice_items_delete_service_only` on `public.slides`: 21000115 moved the four
-- permissive policies it could name and never looked for the recipe's three.
--
-- They are RENAMED below rather than dropped and recreated. A rename keeps the
-- policy's definition byte-for-byte — same command, same roles, the same
-- `using` and `with check` expressions — and a recreate is an opportunity to
-- write a different policy while claiming to move one.
--
-- The rename is in the RECIPE half, and guarded by a catalogue lookup, because
-- only a replay ever holds the old names. The generated recipe follows the
-- core's renames through every fragment that predates them
-- (`scripts/generate-portable-core.mjs`), so on the two-halves database the
-- tier's loop already created all three as `slides_*_service_only` and there is
-- nothing to move. Both databases end on the same three names, which is what
-- the assertion after the loop states.
--
-- ── What changes, and what deliberately does not ──────────────────────────
--
-- The body below is the definition the schema dump holds, with
-- `public.slice_items` written `public.slides` in the two places it appears.
-- The signature, the return type, the `language sql stable` volatility and the
-- `search_path` are byte-for-byte what 20260818001000 created, because a
-- function that acquired a new posture while being repaired is a second change
-- hiding inside a fix.
--
-- The grant is untouched on purpose. `create or replace function` keeps the
-- object's ACL, so the recipe's `grant execute … to anon, authenticated` still
-- holds — and it has to be untouched here, because those roles exist only
-- where the Supabase recipe was applied and this half is the portable core.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- No table, column or row moves: the schema version does not advance (the
-- stance of 21000126000000 through 21000128000000). `create or replace` makes a
-- re-run of the body a no-op, and the policy rename asks the catalogue first,
-- so a second run finds nothing left to move. The proofs are invariants — no
-- body in `public` names the retired relation, no policy carries it, and the
-- two functions the defect disabled answer when called — and all three read the
-- same on an empty replay as on a populated target.

create or replace function public.slices_referencing(cell_ids uuid[])
returns jsonb
language sql stable
set search_path = public, pg_catalog, pg_temp
as $fn$
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'slice_id', s.id,
      'title', s.title,
      'cell_keys', (
        select coalesce(jsonb_agg(to_jsonb(c.cell_key)), '[]'::jsonb)
        from public.cells c
        where c.id = any($1)
          and exists (
            select 1 from public.slides i2
            where i2.slice_id = s.id and c.id = any(i2.cell_ids)
          )
      )
    ) as entry
    from public.slices s
    where exists (
      select 1 from public.slides i
      where i.slice_id = s.id and i.cell_ids && $1
    )
  ) rows;
$fn$;

do $$
declare
  v_named text;
  v_slices jsonb;
  v_impact jsonb;
begin
  -- Every body, not the ones a reader would think to name — this is the sweep
  -- 21000115 scoped to two functions and therefore could not have failed.
  select string_agg(p.proname, ', ' order by p.proname) into v_named
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.prosrc like '%slice_items%';

  if v_named is not null then
    raise exception
      'a function body still names public.slice_items, which is public.slides now: %',
      v_named;
  end if;

  -- Called, not read. A `language sql` body is text until something calls it,
  -- so the only assertion that can see this class of defect is a call — and
  -- both of these raised 42P01 before this file.
  select public.slices_referencing(array[]::uuid[]) into v_slices;
  if v_slices is null then
    raise exception 'slices_referencing returned null; it returns a jsonb array';
  end if;

  select public.deletion_impact('lane', gen_random_uuid()) into v_impact;
  if v_impact -> 'affected_slices' is null then
    raise exception 'deletion_impact no longer reports affected_slices';
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000130000000_a_service_has_a_slug.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A service has a slug.
--
-- A deployment may hold more than one service (ADR 0003), and the moment it
-- does, something has to name which one a reader — or an agent — is looking at.
-- The name cannot: it is free text, it is renamed, and two services may be
-- called almost the same thing. So a service gets a `slug`: a short, stable,
-- URL-safe identity of its own, unique across the deployment, which a route
-- (`/<slug>`) and a scoped read can both key on.
--
-- ── Its own identity, not a derivation ─────────────────────────────────────
--
-- A slug DERIVED from the name at read time would need no column at all, and
-- that is the version worth arguing against: it moves a service's URL every
-- time somebody edits the name, and it has nothing to say when two names
-- slugify alike. A column fixes both — a rename leaves the route where it was,
-- and the unique constraint refuses the collision rather than letting two
-- services share a route.
--
-- ── Nullable, backfilled, then made unique ─────────────────────────────────
--
-- The table may already hold rows, so the column cannot arrive NOT NULL with no
-- default. It lands nullable, every existing row is backfilled, and only then
-- does the unique constraint go on — a populated column a constraint can trust.
--
-- It STAYS nullable on purpose. The seam that reads it (`src/lib/serviceSlug.ts`)
-- keeps a name-derived fallback for a row whose slug is null, so a deployer who
-- clears the slug gets the name-derived route back rather than a broken one.
-- That fallback is only meaningful if null is reachable, so the column is not
-- narrowed to NOT NULL here.
--
-- ── The backfill reuses key_slug, the database's own slugifier ──────────────
--
-- `public.key_slug` (20260818001000) is the function `src/lib/serviceSlug.ts`
-- documents itself as mirroring:
-- `trim('-', regexp_replace(lower(value), '[^a-z0-9]+', '-'))`. Reusing it
-- keeps the backfill in step with the app's derivation rather than minting a
-- third copy of the slug rule; for every ASCII name the two agree exactly.
-- `coalesce(..., id::text)` supplies the id fallback for the pathological
-- all-non-ASCII name, where the app falls back to the row id and `key_slug` to
-- an md5 fragment; either is stable, unique and resolvable, and a service so
-- named keeps whatever route it had.
--
-- ── The editable grant is deliberately NOT here ────────────────────────────
--
-- Letting an author EDIT the slug is a panel write, and a later ticket — the
-- same split `21000123000000` (add `entity_examples`) and `21000128000000`
-- (grant the panel its UPDATE, beside the policy that makes the grant mean
-- anything) already drew. Routing and scoping only READ the slug, so this file
-- adds no `grant update (slug)`: a write surface with no writer is a column the
-- RLS posture has to account for before any mutation touches it. When the edit
-- panel arrives it adds the grant and the policy together, exactly as the
-- examples panel did.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- Additive: one nullable column, a backfill that matches whatever rows exist,
-- and a constraint dropped-if-exists before it is re-added so a re-run and an
-- empty replay both no-op. The whole migration is portable core — a plain
-- column and a plain constraint on a plain table, with no Supabase primitive
-- named — and the table-level select policy already covers a new column, so
-- there is no recipe fragment. The schema version does not move (the same
-- stance as 21000123000000).
--
-- The proof is an INVARIANT, never a census, which is the series' own rule:
-- after this file every service row has a slug and all slugs are
-- distinct. That is vacuously true of an empty replay's zero rows and is the
-- evidence on a populated target that the backfill reached every row and the
-- constraint has something to guard.

-- ── 1. The column, nullable ────────────────────────────────────────────────

alter table public.services
  add column if not exists slug text;

comment on column public.services.slug is
  'A service''s stable route slug: `/<slug>` opens it, and a scoped agent read names it. Its own identity, not derived from the name — a rename does not move the URL, and the unique constraint stops two services colliding. Backfilled from the name-derived slug (public.key_slug) when added; nullable so a cleared slug falls back to the name-derived route in the app. Editable by the deployer through a later panel write, which adds the UPDATE grant then.';

-- ── 2. Backfill every existing row from its name-derived slug ───────────────
--
-- Scoped to `slug is null` so it is idempotent and touches nothing a re-run has
-- already filled.

update public.services
   set slug = coalesce(public.key_slug(name), id::text)
 where slug is null;

-- ── 3. The unique constraint, once the column is populated ──────────────────
--
-- Dropped-if-exists first so this is idempotent across a re-run.

alter table public.services
  drop constraint if exists services_slug_key;
alter table public.services
  add constraint services_slug_key unique (slug);

comment on constraint services_slug_key on public.services is
  'One slug per service, per deployment. Two services whose names slugify alike are refused rather than colliding on a shared route.';

-- ── 4. Prove it ────────────────────────────────────────────────────────────
--
-- Invariants, not a census. Zero rows on an empty replay satisfy both; a
-- populated target is the case they exist to check.

do $proof$
declare
  v_missing  integer;
  v_total    integer;
  v_distinct integer;
begin
  select count(*) into v_missing
    from public.services
   where slug is null;
  if v_missing <> 0 then
    raise exception
      'proof: % service row(s) have a null slug after backfill; the backfill did not reach every row', v_missing;
  end if;

  select count(*), count(distinct slug) into v_total, v_distinct
    from public.services;
  if v_total <> v_distinct then
    raise exception
      'proof: % service rows carry only % distinct slugs; the unique constraint has a collision to reject', v_total, v_distinct;
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000131000000_a_touchpoint_belongs_to_the_deployment.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint belongs to the deployment, not to one of its services.
--
-- ADR 0003 decided this and landed only half of it. `stakeholders` was born
-- deployment-level in `21000125000000` — no `service_id`, `unique (name)`
-- across the whole deployment — while `touchpoints` kept the
-- `unique (service_id, name)` it was born with in `21000120000000`. That was
-- never a considered pair. The ADR's own consequences say so in as many
-- words: "`touchpoints` makes the same move in a later migration, dropping
-- its `service_id` and re-uniquing on `(name)`", and "that entry reverses in
-- the migration that drops the column, which is where the argument is
-- written". This is that migration, so the argument is written here.
--
-- ── Why the catalog is one pool ────────────────────────────────────────────
--
-- A deployment holds a journey per service and one catalog of the nouns those
-- journeys reference. The journey — phase, scenario, path, step, lane, cell —
-- is a hard per-service boundary; the catalog is soft, and both halves of it
-- are now the deployment's. Two rules give it its shape, and they are the same
-- two the cast list already runs on:
--
--   the NAME IS THE IDENTITY. One pool, unique by name across the deployment.
--   A second service reuses an entry by naming the same tool the same way. Two
--   services running different tools carry different names — "Gmail" and
--   "Outlook", never two rows both called "Email" — so an identical name means
--   the identical thing, and renaming that thing once moves it everywhere it
--   appears.
--
--   MEMBERSHIP IS IMPLICIT. A service "has" a touchpoint exactly when one of
--   its cells places it. There is no `service_touchpoints` table and no
--   palette to author, which is the only model coherent with how a touchpoint
--   is born: minted from a cell's text by the sync, with no "add a tool to
--   this service" gesture anywhere.
--
-- The incoherence the split leaves behind is worth naming, because it is what
-- makes this the straggler rather than a position. A touchpoint will carry a
-- `stakeholder_id` — its owner. With the tools per service and the actors the
-- deployment's, a shared tool's owner would have to be one service's actor,
-- and there is no answer to which. The link waits for both ends to be the
-- deployment's, and after this file they are.
--
-- ── The merge, and why the ADR's own rule makes it safe ─────────────────────
--
-- The deployment this template was generalised from could drop the column
-- outright: it holds one service, so `unique (service_id, name)` and
-- `unique (name)` were already the same constraint over its rows. A template
-- cannot assume that. An adopter may hold several services, each with its own
-- "Zoom" row, and re-uniquing on `(name)` would be refused.
--
-- So the drop is preceded by a fold, and the rule above is what licenses it:
-- an identical name means the identical thing, so two rows sharing a name are
-- one touchpoint recorded twice. Every placement is repointed at the survivor
-- — the oldest row of the name, by `created_at` then `id`, which is stable
-- across re-runs because neither value moves — the survivor takes whatever
-- description it was missing from the rows folding into it, and the rest are
-- deleted. Nothing a cell points at is lost, and nothing anybody wrote about
-- the tool is lost either. On the single-service database that is the common
-- case the fold matches zero rows and does nothing at all.
--
-- Two placements on one cell cannot be folded onto one survivor: a cell
-- belongs to one service, and within a service the names were already unique.
-- If that ever became untrue the repoint would be refused by
-- `cell_touchpoints_cell_id_touchpoint_id_key` rather than quietly dropping a
-- placement, which is the right way round for a fold nobody is watching.
--
-- ── The two functions that derived a service, and the three that never did ──
--
-- `sync_cell_touchpoints` read the cell's service to mint into and to join
-- back on; it stops reading it and mints by name alone. The cell must still
-- resolve all the way up to a phase — that is what attaches it to a service at
-- all — so the lookup stays and only its columns go.
-- `set_placement_touchpoint` checked a chosen registry id against the cell's
-- service; there is no service to scope by now, so it checks that the id is in
-- the registry.
--
-- Both are rewritten from `pg_get_functiondef` rather than restated, the way
-- `21000120000000` rewrote the two copy functions and `21000122000000`
-- rewrote this same sync. A restatement of a body that three migrations have
-- already edited is a chance to revert one of them by hand; a replacement of
-- the exact fragments that name `service_id` cannot. Each replacement is
-- asserted to have landed, and the finished body is swept for the word.
--
-- `restore_cell_touchpoints`, `remove_placement` and `restore_placement` never
-- named `service_id` and are left exactly as they are.
--
-- ── The grant surface does not move ────────────────────────────────────────
--
-- `create or replace function` preserves the ACL, so neither rewrite is
-- re-granted — the same stance `21000122000000` took when it rewrote this
-- sync. What replaces the re-statement is an assertion, in the recipe half
-- because that is where the roles exist: `authenticated` still executes both,
-- `anon` still does not.
--
-- On the table, `authenticated` held `update (name, kind, summary, url)` and
-- never held UPDATE on `service_id`, so the dropped column leaves no stale
-- column grant behind. The table-level SELECT and INSERT grants cover whatever
-- columns the table has, so they need no edit either.
--
-- ── Why the schema version does not move ───────────────────────────────────
--
-- The IR authors a touchpoint's name, kind, summary and home; which service
-- owns the row was never one of its fields, because an IR describes one
-- service. Nothing authored moves and no file needs carrying forward, so the
-- version stays where `21000122000000` left it — the same stance
-- `21000123000000`, `21000124000000` and `21000130000000` took.
--
-- What does move is the SQL the seed generator emits: it stops writing a
-- `service_id` column that is no longer there. A seed generated from this
-- checkout therefore needs a target that has applied this file, which is the
-- ordinary requirement that the migrations are applied before the artifacts
-- built from them.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- A fold over zero rows, three catalogue changes, two function rewrites. The
-- proof is an INVARIANT: the column is gone, the deployment-wide unique is
-- there and no service-scoped one is, no placement points at a registry row
-- that is not there, neither function names `service_id`, and both are still
-- SECURITY DEFINER. Every clause reads the same on an empty replay as on a
-- populated target.

-- ---------------------------------------------------------------------------
-- 1. The fold: one row per name, and every placement pointing at it
-- ---------------------------------------------------------------------------

-- Every placement moves to the oldest row carrying its touchpoint's name.
update public.cell_touchpoints ct
   set touchpoint_id = keep.id,
       updated_at    = now()
  from public.touchpoints folding
  join (
    select distinct on (name) id, name
      from public.touchpoints
     order by name, created_at, id
  ) keep on keep.name = folding.name
 where ct.touchpoint_id = folding.id
   and folding.id <> keep.id;

-- The survivor takes what it was missing from the rows folding into it: the
-- first description written under that name, oldest first. `kind` is lifted
-- only out of the default, because 'other' is "nobody has judged this yet"
-- rather than a judgement to preserve.
update public.touchpoints keep
   set summary    = coalesce(keep.summary, folded.summary),
       url        = coalesce(keep.url, folded.url),
       icon_url   = coalesce(keep.icon_url, folded.icon_url),
       kind       = case when keep.kind = 'other'
                         then coalesce(folded.kind, keep.kind)
                         else keep.kind end,
       updated_at = now()
  from (
    select name,
           (array_agg(summary order by created_at, id)
              filter (where summary is not null))[1] as summary,
           (array_agg(url order by created_at, id)
              filter (where url is not null))[1] as url,
           (array_agg(icon_url order by created_at, id)
              filter (where icon_url is not null))[1] as icon_url,
           (array_agg(kind order by created_at, id)
              filter (where kind <> 'other'))[1] as kind
      from public.touchpoints
     group by name
  ) folded
 where folded.name = keep.name
   and exists (select 1 from public.touchpoints other
                where other.name = keep.name and other.id <> keep.id);

-- What is left is the duplicates, and nothing points at them any more.
delete from public.touchpoints folding
 using (
   select distinct on (name) id, name
     from public.touchpoints
    order by name, created_at, id
 ) keep
 where keep.name = folding.name
   and folding.id <> keep.id;

-- ---------------------------------------------------------------------------
-- 2. The column goes, and uniqueness becomes the deployment's
-- ---------------------------------------------------------------------------

alter table public.touchpoints drop constraint if exists touchpoints_service_id_name_key;
alter table public.touchpoints drop constraint if exists touchpoints_service_id_fkey;
alter table public.touchpoints drop column if exists service_id;
alter table public.touchpoints drop constraint if exists touchpoints_name_key;
alter table public.touchpoints add constraint touchpoints_name_key unique (name);

comment on table public.touchpoints is
  'The deployment''s registry of touchpoints — the apps, documents, channels '
  'and things a moment happens through. One row per name across the whole '
  'deployment; a service references an entry, no service owns one (ADR 0003). '
  'A placement in cell_touchpoints is one use of one at one cell.';
comment on column public.touchpoints.name is
  'The identity: unique across the deployment, so a second service reuses an '
  'entry by naming the same tool the same way rather than minting its own, and '
  'a rename moves the tool everywhere it appears.';
comment on column public.touchpoints.summary is
  'What this touchpoint IS, for the deployment — not what it does at any one cell.';
comment on constraint touchpoints_name_key on public.touchpoints is
  'One row per touchpoint name, deployment-wide. Distinct tools take distinct names; an identical name means the identical thing.';

-- ---------------------------------------------------------------------------
-- 3. The sync stops deriving a service, and mints by name
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  before text;
  after  text;
begin
  before := pg_get_functiondef('public.sync_cell_touchpoints(uuid, text[])'::regprocedure);
  after  := before;

  -- The local the service was read into.
  after := replace(after,
    $r$  v_service_id uuid;
  v_lane_role  text;$r$,
    $r$  v_lane_role  text;$r$);

  -- The lookup keeps its joins — a cell that does not reach a phase is not
  -- attached to a service — and loses the column it selected.
  after := replace(after,
    $r$  select ph.service_id, ln.lane_role
    into v_service_id, v_lane_role$r$,
    $r$  select ln.lane_role
    into v_lane_role$r$);

  after := replace(after,
    $r$  if v_service_id is null then$r$,
    $r$  if not found then$r$);

  -- Minting is by name alone.
  after := replace(after,
    $r$  insert into public.touchpoints (service_id, name, origin)
  select v_service_id, w.name, 'app'$r$,
    $r$  insert into public.touchpoints (name, origin)
  select w.name, 'app'$r$);

  after := replace(after,
    $r$  on conflict (service_id, name) do nothing;$r$,
    $r$  on conflict (name) do nothing;$r$);

  -- Both joins back to the registry, which match on the name and nothing else.
  after := replace(after,
    $r$      on tp.service_id = v_service_id and tp.name = w.name$r$,
    $r$      on tp.name = w.name$r$);

  if after = before then
    raise exception 'sync_cell_touchpoints was not rewritten at all';
  end if;
  if after ~ 'service_id' then
    raise exception 'sync_cell_touchpoints still names service_id';
  end if;
  if after !~ 'on conflict \(name\) do nothing' then
    raise exception 'sync_cell_touchpoints does not mint by name';
  end if;
  if after !~ 'if not found then' then
    raise exception 'sync_cell_touchpoints lost its not-attached-to-a-service guard';
  end if;
  if after !~ 'frontstage_touchpoints' then
    raise exception 'sync_cell_touchpoints lost the lane roles 21000122000000 gave it';
  end if;

  execute after;
end
$rewrite$;

comment on function public.sync_cell_touchpoints(uuid, text[]) is
  'Brings a cell''s placements into line with its text. A new name mints a '
  'registry row for the deployment; a name typed back links the name-only row; '
  'a removed placement with anything on it becomes name-only, one with nothing '
  'is deleted. Returns what it removed, for restore_cell_touchpoints.';

-- ---------------------------------------------------------------------------
-- 4. Choosing a registry entry is no longer scoped by service
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  before text;
  after  text;
begin
  before := pg_get_functiondef('public.set_placement_touchpoint(uuid, uuid, text)'::regprocedure);
  after  := before;

  after := replace(after,
    $r$  v_row public.cell_touchpoints;
  v_service_id uuid;$r$,
    $r$  v_row public.cell_touchpoints;$r$);

  after := replace(after,
    $r$    select ph.service_id into v_service_id
      from public.cells c
      join public.paths p on p.id = c.path_id
      join public.scenarios s on s.id = p.scenario_id
      join public.phases ph on ph.id = s.phase_id
     where c.id = v_row.cell_id;
    if not exists (select 1 from public.touchpoints tp
                    where tp.id = p_touchpoint_id and tp.service_id = v_service_id) then
      raise exception 'that touchpoint is not in this service''s registry';
    end if;$r$,
    $r$    -- The registry is the deployment's (ADR 0003), so an entry is in it
    -- or it is not; there is no service to scope the lookup by.
    if not exists (select 1 from public.touchpoints tp
                    where tp.id = p_touchpoint_id) then
      raise exception 'that touchpoint is not in the registry';
    end if;$r$);

  if after = before then
    raise exception 'set_placement_touchpoint was not rewritten at all';
  end if;
  if after ~ 'service_id' then
    raise exception 'set_placement_touchpoint still names service_id';
  end if;
  if after !~ 'that touchpoint is not in the registry' then
    raise exception 'set_placement_touchpoint lost its registry-membership check';
  end if;
  if after !~ 'that cell already shows that touchpoint' then
    raise exception 'set_placement_touchpoint lost its one-per-cell check';
  end if;

  execute after;
end
$rewrite$;

comment on function public.set_placement_touchpoint(uuid, uuid, text) is
  'Names a placement''s touchpoint one way — an entry in the deployment''s '
  'registry, or a name the registry lacks — and returns the previous pair, '
  'which is the inverse.';

-- ---------------------------------------------------------------------------
-- 5. Prove it — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  bad int;
  fn  text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = 'touchpoints'
                and column_name = 'service_id') then
    raise exception 'touchpoints still carries service_id';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.touchpoints'::regclass
                    and contype = 'u'
                    and pg_get_constraintdef(oid) = 'UNIQUE (name)') then
    raise exception 'touchpoints has no deployment-wide unique (name)';
  end if;

  if exists (select 1 from pg_constraint
              where conrelid = 'public.touchpoints'::regclass
                and contype = 'u'
                and pg_get_constraintdef(oid) ~ 'service_id') then
    raise exception 'a service-scoped unique survives on the registry';
  end if;

  -- The fold repointed every placement before it deleted anything.
  select count(*) into bad
    from public.cell_touchpoints ct
   where ct.touchpoint_id is not null
     and not exists (select 1 from public.touchpoints tp where tp.id = ct.touchpoint_id);
  if bad <> 0 then
    raise exception '% placements point at a registry row that is not there', bad;
  end if;

  -- Still exactly one identity per placement, which the fold could have
  -- broken by repointing a row onto one its cell already showed.
  select count(*) into bad from public.cell_touchpoints
   where (touchpoint_id is null) = (name is null);
  if bad <> 0 then
    raise exception '% placements name their touchpoint both ways or neither', bad;
  end if;

  foreach fn in array array[
    'public.sync_cell_touchpoints(uuid, text[])',
    'public.set_placement_touchpoint(uuid, uuid, text)'
  ] loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if pg_get_functiondef(fn::regprocedure) ~ 'service_id' then
      raise exception '% still names service_id', fn;
    end if;
  end loop;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000201000000_a_touchpoint_names_its_owner.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint names its owner.
--
-- `21000131000000` wrote the promissory note in its own header: "A touchpoint
-- will carry a `stakeholder_id` — its owner. With the tools per service and the
-- actors the deployment's, a shared tool's owner would have to be one service's
-- actor, and there is no answer to which. The link waits for both ends to be
-- the deployment's, and after this file they are." Both ends are. This is the
-- link.
--
-- ── Why the wait was the whole argument ────────────────────────────────────
--
-- `stakeholders` was born deployment-level in `21000125000000`; `touchpoints`
-- became deployment-level in `21000131000000`. Until that second move the
-- column was not merely premature, it was unanswerable: a registry row scoped
-- to one service, pointing at a cast shared by all of them, forces the question
-- "whose actor owns the shared tool?" onto a schema that has no way to hold two
-- answers. With both pools now keyed on name across the whole deployment the
-- question dissolves — one Zoom, one owner, named once.
--
-- ── An association, not a parent ───────────────────────────────────────────
--
-- The same relationship `21000125000000` gave a lane, and it carries the same
-- shape for the same reason. A touchpoint is not a child of its owner: it
-- exists whether or not anybody has said who runs it, it is minted by
-- `sync_cell_touchpoints` from a cell's text with no owner at all, and taking
-- an actor out of the cast should not take the tool off the board with it. So
-- the column is NULLABLE — "nobody has said yet" is the ordinary state, not a
-- gap — and there is no cascade.
--
-- ── The deviation from the deployment, stated rather than smuggled ─────────
--
-- The deployment this template generalises writes `stakeholder_id uuid
-- references public.stakeholders (id)` with no delete action, which is NO
-- ACTION: deleting an actor who owns a touchpoint is REFUSED. This file writes
-- `on delete set null` instead, matching `lanes.stakeholder_id` in
-- `21000125000000` and the sentence that migration already committed the
-- template to — "an actor taken out of the cast un-names its lanes rather than
-- pinning itself."
--
-- Mirroring the deployment here would make the template incoherent with itself:
-- removing an actor would silently un-name their lanes and simultaneously be
-- refused by their touchpoints, so the cast would hold two contradictory
-- opinions about what deleting an actor means. One rule for the cast, applied
-- to both things that reference it, is the position; the deployment is the
-- looser of the two and can tighten to it. This is the one place this file
-- deliberately does not copy the deployment, and it is written down here so a
-- reader meets the choice rather than the difference.
--
-- ── What does NOT move ─────────────────────────────────────────────────────
--
-- The schema version stays where `21000122000000` left it — the same stance
-- `21000123000000`, `21000124000000`, `21000130000000` and `21000131000000`
-- took. An IR describes one service and authors a touchpoint's name, kind,
-- summary and home; who OWNS the tool has never been one of its fields, and
-- `registryTouchpoint` in `references/ir-schema.json` is unchanged, so nothing
-- authored moves and no file needs carrying forward.
--
-- The seed generators are unaffected for the same reason: both write
-- `insert into public.touchpoints (id, name, kind, summary, url, origin)`, and
-- a new nullable column with no default changes nothing about a column list
-- that does not name it.
--
-- ── The index ──────────────────────────────────────────────────────────────
--
-- `21000125000000` put one on `lanes.stakeholder_id` with the reason that
-- "every other foreign key in the series has its index", and the same two
-- readers exist here: the delete path walks touchpoints by actor to find what
-- an outgoing actor un-names, and the owner picker walks them the same way.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- Additive: one nullable column, one index, one grant. Every statement is
-- `if not exists` or dropped-first, so a re-run and an empty replay both no-op.
-- `public.stakeholders` is created by `21000125000000`, seven files upstream in
-- this same series, so unlike the deployment's version this reference needs no
-- `to_regclass` guard — the target is always there by the time this runs.
--
-- The proof is an INVARIANT, never a census: the column exists and is nullable,
-- it points at the cast, and its delete action is SET NULL. All three read the
-- same on an empty replay as on a populated target, which is the point.

-- ── 1. The column ──────────────────────────────────────────────────────────

alter table public.touchpoints
  add column if not exists stakeholder_id uuid
    references public.stakeholders (id) on delete set null;

comment on column public.touchpoints.stakeholder_id is
  'The actor who owns this touchpoint — who runs the app, publishes the '
  'document, staffs the channel — or null when nobody has said yet, which is '
  'the ordinary state for a row the sync minted from a cell''s text. An '
  'association, not a parent: both the tool and the actor are the '
  'deployment''s (ADR 0003), and an actor taken out of the cast un-names its '
  'touchpoints rather than pinning itself, exactly as it un-names its lanes.';

-- ── 2. Its index ───────────────────────────────────────────────────────────

create index if not exists touchpoints_stakeholder_id_idx
  on public.touchpoints (stakeholder_id);


-- ── 3. Prove it ────────────────────────────────────────────────────────────
--
-- Invariants, not a census. An empty replay satisfies all three, and a
-- populated target is the case they exist to check.

do $proof$
declare
  v_delete_action "char";
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'touchpoints'
                    and column_name = 'stakeholder_id'
                    and is_nullable = 'YES') then
    raise exception
      'proof: touchpoints.stakeholder_id must exist and be nullable — a touchpoint nobody has claimed names nobody';
  end if;

  select confdeltype into v_delete_action
    from pg_constraint
   where conrelid = 'public.touchpoints'::regclass
     and contype = 'f'
     and confrelid = 'public.stakeholders'::regclass;

  if v_delete_action is null then
    raise exception 'proof: touchpoints.stakeholder_id does not point at the cast';
  end if;

  -- 'n' is SET NULL. The deviation argued in the header is only real if it is
  -- the shape the database actually holds, so it is asserted rather than
  -- described.
  if v_delete_action <> 'n' then
    raise exception
      'proof: touchpoints.stakeholder_id deletes as %, not SET NULL — an actor leaving the cast must un-name its touchpoints, not be refused', v_delete_action;
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000202000000_a_rename_moves_the_word_in_every_cell.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A rename moves the word in every cell, not just the registry row.
--
-- The registry landed in `21000120000000` and the read path is genuinely
-- registry-backed: the board draws `touchpoints.name` through the placement,
-- so changing that one row moves every use of the tool on screen at once.
-- That is the headline promise, and on its own it comes apart the first time
-- anybody uses it.
--
-- `cells.content` still holds the OLD string, and a content save re-derives
-- placements from that text. So the next edit to any affected cell hands
-- `sync_cell_touchpoints` the stale name, the renamed placement is not in the
-- wanted list, and it is removed — taking its per-moment summary, role and
-- resources with it — while a fresh registry entry appears under the old name
-- in its stead. The rename is silently undone and the authored writing is
-- gone.
--
-- That is this package's own defect returning: two records of the same fact,
-- drifting. Nothing in the template writes `touchpoints.name` yet, so it is
-- latent rather than live, which is exactly why it is fixable now rather than
-- after a rename affordance has shipped.
--
-- Ported from a deployment built on this template, where both halves have
-- been live since 2026-08-30. The template had no registry writer at all;
-- `src/lib/touchpointMutations.ts` arrives with this file as the client
-- half.
--
-- ── Why this is a function and not a client loop ──────────────────────────
--
-- The same reason `sync_cell_touchpoints` is: the registry row and every
-- bearing cell's text must move TOGETHER OR NOT AT ALL, and PostgREST gives
-- every statement its own transaction. A client that updated the registry and
-- then looped over cells would leave the two halves disagreeing the moment any
-- one of those requests failed — which is the state this exists to end. One
-- call, one transaction.
--
-- ── Which cells, and how the word is matched ─────────────────────────────
--
-- The cells are found through `cell_touchpoints`, never by scanning text for
-- the old name. The placement IS the record of "this cell uses this
-- touchpoint", so the rewrite is keyed on identity and a cell that merely
-- happens to spell the same word somewhere else is not touched.
--
-- Inside a cell, `content` is a delimited list — `parseCellContent.ts` splits
-- on newline or comma and trims — so the match is against a whole ITEM, never
-- a substring. Renaming `Zoom` must leave `Zoom Recording` alone, and a
-- registry that holds both is ordinary. `rename_content_item` rebuilds the
-- list from its own tokens, so the author's delimiters and spacing survive
-- untouched and only the item that IS the old name is replaced.
--
-- ── The posture is this package's, not the deployment's ──────────────────
--
-- The deployment's copy is `security invoker` and leans on column grants. Here
-- every placement function is `security definer` behind an explicit
-- `is_service_account()` guard (`21000120000000`), because that is how this
-- package decides who may author, and a writer that answered the question a
-- second way would be a second answer to it. `updated_at` is stamped the way
-- its siblings stamp it; the table's trigger would do it anyway, and the two
-- agreeing is the point.

-- ── The one-item rewrite ──────────────────────────────────────────────────
--
-- Tokenised rather than regexp-replaced. A replace bounded by delimiters
-- consumes the delimiter it matched, so two adjacent items that both match
-- lose the second; and a word-boundary replace rewrites `Zoom` inside
-- `Zoom Recording`, which is the near miss this file names. Splitting into
-- items AND delimiters, mapping the items, and concatenating puts the original
-- string back verbatim wherever nothing matched.

create or replace function public.rename_content_item(
  p_content text,
  p_from    text,
  p_to      text
)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select coalesce(
    string_agg(
      case
        -- A delimiter travels through unchanged, which is what keeps
        -- "A,\nB" from coming back as "A, B".
        when m.token[1] in (E'\n', ',') then m.token[1]
        when btrim(m.token[1], E' \t\r\n') = p_from
          -- Surrounding whitespace is the author's, not ours.
          then substring(m.token[1] from '^[ \t\r\n]*')
               || p_to
               || substring(m.token[1] from '[ \t\r\n]*$')
        else m.token[1]
      end,
      '' order by m.ord),
    p_content)
  from regexp_matches(p_content, E'[^\n,]+|[\n,]', 'g')
       with ordinality as m(token, ord);
$function$;

comment on function public.rename_content_item(text, text, text) is
  'Replace one whole item in a delimited cell content string. The match is '
  'against the trimmed item, never a substring, so renaming Zoom leaves '
  'Zoom Recording alone.';

-- ── The rename ────────────────────────────────────────────────────────────

create or replace function public.rename_touchpoint(
  p_touchpoint_id uuid,
  p_name          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_previous text;
  v_written  int;
  v_cells    uuid[] := '{}';
  v_stale    int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'a touchpoint needs a name — an empty one is a blank pill';
  end if;

  -- Locked, because everything below is decided from this row's old name.
  select name into v_previous
    from public.touchpoints
   where id = p_touchpoint_id
     for update;

  if v_previous is null then
    raise exception 'touchpoint % does not exist', p_touchpoint_id;
  end if;

  update public.touchpoints
     set name = v_name,
         updated_at = now()
   where id = p_touchpoint_id;

  -- A zero-row write is a failure, not a no-op. The select above already found
  -- the row, so nought here means it went in the moment between — and the
  -- caller is about to record an inverse for a rename that never happened.
  get diagnostics v_written = row_count;
  if v_written <> 1 then
    raise exception 'renaming touchpoint % wrote % rows', p_touchpoint_id, v_written;
  end if;

  -- Renaming a touchpoint to what it is already called is a no-op on the text,
  -- and running the rewrite anyway would trip the post-condition below on
  -- every cell. The registry write above still happened, so the caller gets a
  -- truthful answer either way.
  if v_previous <> v_name then
    with bearing as (
      -- Identity, not text search. A cell bears this touchpoint because a
      -- placement says so.
      select ct.cell_id from public.cell_touchpoints ct
       where ct.touchpoint_id = p_touchpoint_id
    ),
    rewritten as (
      update public.cells c
         set content = public.rename_content_item(c.content, v_previous, v_name)
        from bearing b
       where c.id = b.cell_id
         and c.content
             is distinct from public.rename_content_item(c.content, v_previous, v_name)
      returning c.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_cells from rewritten;

    -- The post-condition, and the reason the rewrite cannot fail quietly. If
    -- the item match ever stopped matching, every statement above would still
    -- succeed, no cell would change, and the rename would go back to being
    -- undone by the next content save — the exact defect, restored, with a
    -- green call to show for it.
    select count(*) into v_stale
      from public.cell_touchpoints ct
      join public.cells c on c.id = ct.cell_id
     where ct.touchpoint_id = p_touchpoint_id
       and exists (
         select 1
           from unnest(regexp_split_to_array(c.content, E'[\n,]')) as item
          where btrim(item, E' \t\r\n') = v_previous
       );
    if v_stale <> 0 then
      raise exception
        '% cells still name "%" after renaming it to "%"',
        v_stale, v_previous, v_name;
    end if;
  end if;

  return jsonb_build_object(
    'touchpoint_id', p_touchpoint_id,
    'name', v_name,
    'previous_name', v_previous,
    'cell_ids', to_jsonb(v_cells)
  );
end
$function$;

comment on function public.rename_touchpoint(uuid, text) is
  'Rename a touchpoint: the registry row and the matching item in every '
  'bearing cell''s content, in one transaction. Returns the previous name and '
  'the cells rewritten, so the caller can record an inverse that restores both '
  'halves.';


-- ── Prove the item match, on an empty database too ────────────────────────
--
-- `rename_content_item` is pure, so this block needs no rows and runs on every
-- apply including the empty replay. The near miss is the first case because it
-- is the one the header names: a substring replace turns `Zoom Recording` into
-- `Meet Recording` without a word of warning.
--
-- Invariants about the function, never a census of the data — an empty replay
-- satisfies every one of them, and so does a populated target.

do $proof$
declare
  v_got text;
begin
  v_got := public.rename_content_item('Zoom, Zoom Recording', 'Zoom', 'Meet');
  if v_got <> 'Meet, Zoom Recording' then
    raise exception 'proof: the near miss was rewritten: %', v_got;
  end if;

  -- The longer name renames on its own terms, and leaves the shorter alone.
  v_got := public.rename_content_item('Zoom, Zoom Recording', 'Zoom Recording', 'Recording');
  if v_got <> 'Zoom, Recording' then
    raise exception 'proof: the longer item did not rename: %', v_got;
  end if;

  -- Newlines are a delimiter too, and the author's spacing is theirs.
  v_got := public.rename_content_item(E'Handbook\n  Zoom  , Slack', 'Zoom', 'Meet');
  if v_got <> E'Handbook\n  Meet  , Slack' then
    raise exception 'proof: delimiters or spacing did not survive: %', v_got;
  end if;

  -- Two adjacent items that both match. A delimiter-consuming replace gets the
  -- first and silently skips the second.
  v_got := public.rename_content_item('Zoom,Zoom', 'Zoom', 'Meet');
  if v_got <> 'Meet,Meet' then
    raise exception 'proof: an adjacent repeat was skipped: %', v_got;
  end if;

  -- A name that appears only as part of another item changes nothing.
  v_got := public.rename_content_item('Zoom Recording', 'Zoom', 'Meet');
  if v_got <> 'Zoom Recording' then
    raise exception 'proof: a substring was rewritten: %', v_got;
  end if;

  -- Nothing to rename is not an error, and must not reshape the string.
  v_got := public.rename_content_item('', 'Zoom', 'Meet');
  if v_got <> '' then
    raise exception 'proof: empty content did not survive: %', v_got;
  end if;
end
$proof$;

-- ── Prove the rename is closed, and that it refuses an empty name ─────────
--
-- Two invariants about the function's own posture, asserted rather than
-- described: it is SECURITY DEFINER (so the guard in its body is the thing
-- deciding, not a column grant), and `anon` cannot call it.

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rename_touchpoint';

  if v_definer is null then
    raise exception 'proof: rename_touchpoint was not created';
  end if;
  if not v_definer then
    raise exception
      'proof: rename_touchpoint must be SECURITY DEFINER — its siblings are, and the guard in its body is what decides who may author';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000203000000_a_touchpoint_carries_its_tone.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint carries its tone.
--
-- Authored 2026-09-06. The version is an allocation counter, not a date.
--
-- `src/lib/touchpointColors.ts` holds a literal mapping a tool's NAME to the
-- colour family its face is drawn in: `Zoom` is indigo, `Notion` is gold. The
-- file's own header has said since it was written that this is a stopgap — "a
-- touchpoint's colour is meant to be chosen by whoever owns the blueprint",
-- and there was nowhere to store it because a touchpoint was then a substring
-- parsed out of `cells.content` with no row to hang anything on. There has
-- been a row since `21000120000000`, and a deployment-owned one since
-- `21000131000000`. This is the column.
--
-- ── Why a map in code cannot be the answer ─────────────────────────────────
--
-- The literal is a template's guess at what an adopter's tools are called, and
-- it is only ever right about the handful any service might use. A deployment
-- built on this template has its own twenty: an internal app, a campus system,
-- a partner's employer portal. None of those can be shipped upstream without
-- putting one adopter's vocabulary in every other adopter's build, so the
-- MACHINERY stays shared — alias resolution, case folding, the deterministic
-- fallback for a name the map does not carry — and the VALUES become each
-- deployment's, sourced from a column rather than from code. Without this
-- column `touchpointColors.ts` is a file every adopter has to fork.
--
-- ── Why `tone`, and why no CHECK constraint ────────────────────────────────
--
-- `tone` is the word the code already uses: `TouchpointTone` in
-- `src/lib/blueprintCellStyle.ts`, `data-blueprint-tone` on the rendered face.
-- Naming the column anything else would mint a second word for one thing,
-- which is the failure `21000116000000` swept the schema for.
--
-- The value names a palette FAMILY — `crimson`, `gold`, `indigo`, `purple`,
-- `red`, `tomato`, `yellow` — and not a colour. Which step of that family a
-- face is painted at is the renderer's decision and stays there.
--
-- No CHECK constraint enumerates those seven, deliberately. The tone
-- vocabulary belongs to the token model, which ADR 0006 makes the single style
-- seam. A CHECK here would be a second copy of that list, in a place no test
-- reads, free to drift from the one the renderer compiles against — and a
-- deployment that adds an eighth family would have to ship a migration to use
-- a colour. The column stores what the author chose; the renderer decides what
-- it can draw, and falls back deterministically for anything it does not know,
-- exactly as it already does for a tool the map never named.
--
-- ── No new grant ───────────────────────────────────────────────────────────
--
-- The registry's table-level SELECT policy and grant, written in
-- `21000120000000`, already cover a new column, so nothing here belongs to the
-- recipe half and the file is entirely core. No UPDATE grant either:
-- `authenticated` is granted UPDATE per column, and the column an editing
-- surface writes gets its grant in the migration that brings that surface —
-- `21000127000000` is the shape.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- One additive column, nullable, no default beyond NULL, `if not exists` so a
-- re-run is a no-op. It replays clean against an empty database.
--
-- The proof is an INVARIANT, never a census: the column exists and is
-- nullable. Nullable is load-bearing rather than incidental — null means the
-- author expressed no preference, and that is the state every existing row is
-- in, so a NOT NULL column would either fail the add or invent a default
-- colour for tools nobody had chosen one for.

alter table public.touchpoints
  add column if not exists tone text;

comment on column public.touchpoints.tone is
  'The palette family this touchpoint''s face is drawn in — the deployment''s '
  'own choice, one of the renderer''s tone names (crimson, gold, indigo, '
  'purple, red, tomato, yellow). A product fact ("our scheduling tool is '
  'blue"), not a styling one, which is why it is a row and not a literal in '
  'touchpointColors.ts. Deliberately unconstrained: the tone vocabulary '
  'belongs to the token model (ADR 0006) and a CHECK here would be a second '
  'copy of it, free to drift. Null means no preference — the renderer falls '
  'back deterministically, exactly as it does for a tool the seed map never '
  'named.';

do $proof$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'touchpoints'
       and column_name = 'tone'
  ) then
    raise exception
      'proof: touchpoints.tone did not take';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'touchpoints'
       and column_name = 'tone'
       and is_nullable = 'NO'
  ) then
    raise exception
      'proof: touchpoints.tone must be nullable — null is "the author chose no colour", which is what every existing row means';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000204000000_a_touchpoint_answers_to_more_than_one_name.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint answers to more than one name.
--
-- Authored 2026-09-06. The version is an allocation counter, not a date.
--
-- The other half of the literal `21000203000000` began unwinding.
-- `src/lib/touchpointColors.ts` carries `TECH_LABEL_ALIASES` beside its colour
-- map: a second table, this one from an old spelling to the canonical name. A
-- deployment that stopped using one of two merged tools wants a slice written
-- before the merge to find the one that is left rather than mint a second. A
-- label that carried its own specification — a portal named for the view it
-- opened on — wants to resolve to the THING, because which view is the
-- placement summary's job. A lower-case spelling wants to resolve at all,
-- because a cell was typed by a person.
--
-- Every one of those is a fact about one deployment's own history, and none of
-- it is knowledge a renderer should hold. The alias RESOLUTION is generic
-- machinery and stays in code; the alias LIST is each deployment's, sourced
-- from a column. This is that column.
--
-- A touchpoint's `name` is its identity, unique deployment-wide
-- (`21000120000000`, ADR 0003). `aliases` are the other spellings that mean
-- the same row — the same shape `stakeholders.aliases` has carried since
-- `21000125000000`, where lane and cell text is matched against
-- `unnest(aliases)` to find the stakeholder a human wrote a nickname for.
--
-- ── Nullable, where the sibling column is NOT NULL ─────────────────────────
--
-- `stakeholders.aliases` is `text[] not null default '{}'`. This one is a
-- plain nullable `text[]`, and the difference is deliberate enough to be worth
-- writing down rather than leaving a reader to notice it as an inconsistency.
--
-- The slice this file belongs to adds columns and nothing else, and every
-- column it adds is nullable, so that the whole change is one shape: an add
-- that cannot fail on a populated table and cannot invent a value for a row
-- nobody has authored yet. On this column null carries a meaning the empty
-- array does not — "no aliases have been considered for this touchpoint", as
-- against "considered, and there are none" — which is the state all of today's
-- rows are in.
--
-- The cost is that a reader must write `coalesce(aliases, '{}')` where the
-- stakeholder reader writes `aliases`. That is one function's worth of care in
-- `touchpointColors.ts` against a NOT NULL that would have to be added,
-- defaulted and backfilled here. Narrowing this to `not null default '{}'`
-- later is a one-line follow-up that no existing row can fail, so the looser
-- shape forecloses nothing.
--
-- ── What is NOT constrained, and why ───────────────────────────────────────
--
-- Nothing here stops an alias colliding with another touchpoint's `name`, or
-- with another touchpoint's alias. Such a constraint is real and wanted, and
-- it belongs with the resolver that would be ambiguous without it. Written as
-- a database rule instead, it would refuse a WRITE rather than settle a READ,
-- and a board must draw rather than throw when two rows disagree — so the
-- resolver decides (a name beats another row's alias) and says so where the
-- decision is made. There is no index either: a registry of this size resolves
-- by sequential scan, and an index chosen before a query exists is a guess
-- about the query.
--
-- ── No new grant ───────────────────────────────────────────────────────────
--
-- The registry's table-level SELECT policy and grant, written in
-- `21000120000000`, already cover a new column, so nothing here belongs to the
-- recipe half. No UPDATE grant: the editing surface brings its own column
-- grant when it arrives, the way `21000127000000` did.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- One additive column, nullable, no default beyond NULL, `if not exists` so a
-- re-run is a no-op. It replays clean against an empty database.
--
-- The proof is an INVARIANT, never a census: the column exists, it is
-- nullable, and it is an array of text rather than a single text. The last of
-- those is worth asserting because `text` and `text[]` are both plausible
-- spellings of "the other names", and a scalar column would silently accept
-- the first alias and lose the rest.

alter table public.touchpoints
  add column if not exists aliases text[];

comment on column public.touchpoints.aliases is
  'The other spellings that mean this touchpoint — an older name the service '
  'has stopped using, a label that carried its own specification, a '
  'lower-case one a person typed into a cell. The name is the identity; these '
  'resolve to it. The deployment''s own history, which is why it is a column '
  'and not a literal in touchpointColors.ts. Nullable rather than NOT NULL '
  'DEFAULT ''{}'' like stakeholders.aliases: null means no aliases have been '
  'considered, which is what every row means until somebody says otherwise. '
  'Uniqueness against other names and aliases is not constrained here — that '
  'rule settles a read, so it belongs with the resolver, which resolves a '
  'collision in favour of the name.';

do $proof$
declare
  v_type text;
  v_nullable text;
begin
  select data_type, is_nullable
    into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'touchpoints'
     and column_name = 'aliases';

  if v_type is null then
    raise exception
      'proof: touchpoints.aliases did not take';
  end if;

  if v_type <> 'ARRAY' then
    raise exception
      'proof: touchpoints.aliases is %, not an array — a scalar column keeps the first alias and loses the rest', v_type;
  end if;

  if v_nullable = 'NO' then
    raise exception
      'proof: touchpoints.aliases must be nullable — null is "no aliases considered", which is what every existing row means';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000205000000_a_scenario_says_what_runs_beside_it.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A scenario says what runs beside it.
--
-- Authored 2026-09-06. The version is an allocation counter, not a date.
--
-- Some scenarios can run at the same time as each other, and a board that
-- says so says it in a sentence: "this scenario can run in parallel with the
-- goal-setting and help-request scenarios." A deployment built on this
-- template kept that sentence in a `Record<string, string>` keyed on hardcoded
-- scenario UUIDs, and read it twice — once onto the blueprint fallbacks, once
-- as a sidebar tooltip.
--
-- It is a per-scenario display value written in code, which is the class this
-- schema keeps moving out: the vocabulary and the per-scenario display flags
-- belong to the board, not to the build. A deployment whose scenarios do not
-- overlap gets somebody else's three sentences; a deployment that adds a
-- fourth overlapping scenario has to ship a TypeScript change to say so.
--
-- ── The note is a scenario's, and today it is written onto its paths ───────
--
-- `paths.note` already exists, and its own comment names this exact use:
-- "optional path note shown alongside path metadata (e.g. parallel scenario
-- context)". So the sentence has a home — the wrong one. Parallelism is a fact
-- about the SCENARIO, and a reader that keeps it on paths copies the same
-- string onto every path of it: a scenario's happy path and its alternate path
-- both carry the identical sentence. Two rows that must agree and nothing
-- making them, which is the shape a single column fixes.
--
-- `paths.note` is untouched. A path keeps its own note for what is true of
-- that route and not of its siblings; this column is for what is true of all
-- of them. A path note that merely repeats its scenario's is now redundant
-- rather than wrong, and clearing one is a data decision each deployment makes
-- about its own board.
--
-- ── Why `note` and not a flag ──────────────────────────────────────────────
--
-- The obvious alternative was a structured one — `parallel_with uuid[]`, and
-- let the renderer compose the sentence. It is the better model and it is not
-- this change. Composing that sentence means owning its grammar in every
-- language a deployment authors in ("with the goal-setting and help-request
-- scenarios" is an English list with an English conjunction), and the board's
-- names are already free-form and any language (see `lanes.name`,
-- `21000104000000`). A note the author writes is a note the author can write
-- correctly. The column is prose because the value is prose.
--
-- Naming it `note` rather than inventing a word is the rule `21000116000000`
-- settled: `summary` is the thing's own description, `note` is the aside
-- beside it, and `phases`, `paths` and `cells` already spell it that way. A
-- scenario's `summary` is what the scenario IS; this is what a reader should
-- know about it besides.
--
-- ── No new grant ───────────────────────────────────────────────────────────
--
-- `scenarios` already grants SELECT to anon and to authenticated at the table
-- level, so a new column is readable the moment it exists and nothing here
-- belongs to the recipe half. No UPDATE grant: `20260818000000` granted
-- `update` on exactly the three columns a panel writes — today `name`,
-- `summary` and `layout`, after the renames — and a fourth column joins that
-- list in the migration that brings the field which writes it.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- One additive column, nullable, no default beyond NULL, `if not exists` so a
-- re-run is a no-op. It replays clean against an empty database.
--
-- The proof is an INVARIANT, never a census: the column exists and is
-- nullable. Asserting that any scenario CARRIES a note would be a census —
-- true of one populated database on the day and false of every empty replay.

alter table public.scenarios
  add column if not exists note text;

comment on column public.scenarios.note is
  'An aside about the scenario, beside the summary that says what it is: most '
  'often what else may be running at the same time ("this scenario can run in '
  'parallel with goal setting and help requests"). Blueprint data, not app '
  'configuration — it replaces the Record keyed on hardcoded scenario ids that '
  'a deployment would otherwise keep in code. A scenario''s fact, held once, '
  'rather than the same sentence copied onto each of its paths through '
  'paths.note. Free prose in the author''s own language rather than a '
  'structured flag the renderer would have to compose a sentence from.';

do $proof$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'scenarios'
       and column_name = 'note'
  ) then
    raise exception
      'proof: scenarios.note did not take';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'scenarios'
       and column_name = 'note'
       and is_nullable = 'NO'
  ) then
    raise exception
      'proof: scenarios.note must be nullable — most scenarios have nothing to say beside their summary';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000207000000_a_count_is_true_of_the_delete_that_follows.sql
-- ─────────────────────────────────────────────────────────────────────────

-- `deletion_impact` counts the delete that follows, for all four kinds.
--
-- The confirm dialog's entire job is the number, and two of the four kinds
-- answered with a number that was not true of the delete they preceded. Both
-- in the same way, and in opposite directions:
--
--   lane   `deletion_impact('lane', id)` counted the cells of ONE `lanes` row.
--          `remove_lane(scenario_id, lane_name)` deletes every same-named lane
--          across every path of the scenario. Measured against a live
--          blueprint: 11 reported, 93 deleted. An 8.5x UNDERCOUNT.
--
--   step   `deletion_impact('step', id)` counted that step across EVERY path.
--          `remove_step(path_id, step_id)` deletes only the cells on the path
--          it is given. Measured on the same blueprint: 12 reported, 5
--          deleted. An OVERCOUNT.
--
-- The cause is identity, not arithmetic. A lane delete is addressed by
-- (scenario, name) and a step delete by (path, step), but the function took a
-- single uuid and so could not name either delete. No sum over the wrong row
-- set gives the right answer; the row set was the defect.
--
-- `scope_id` supplies the missing half. `scenario` and `path` are addressed by
-- one id, ignore it, and are byte-for-byte the predicates they were — so every
-- existing caller is unaffected, in SQL and over PostgREST alike, because the
-- new argument has a default. `lane` needs nothing from the caller: it derives
-- the (scenario, name) pair from the lane it is handed, which is the same pair
-- `remove_lane` is called with. `step` REFUSES without it rather than guess a
-- path — an overcount in a delete dialog reads as "this is bigger than it is",
-- and a number nobody can justify is worse than an error that says why.
--
-- `remove_step` is rewritten alongside, because it reads `deletion_impact`
-- itself for the label and the `affected_slices` it archives. Left alone it
-- would call the two-argument form, hit the refusal, and stop deleting steps
-- at all. Its body is otherwise unchanged, and passing the path it was already
-- given also narrows the archived `affected_slices` from "slices touched on
-- any path" to the ones this delete actually costs.


drop function if exists public.deletion_impact(text, uuid);

create or replace function public.deletion_impact(
  kind      text,
  target_id uuid,
  scope_id  uuid default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  affected uuid[];
  label    text;
begin
  if kind = 'scenario' then
    select array_agg(c.id), max(sc.name) into affected, label
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios sc on sc.id = p.scenario_id
    where sc.id = target_id;

  elsif kind = 'path' then
    select array_agg(c.id), max(p.name) into affected, label
    from public.cells c join public.paths p on p.id = c.path_id
    where p.id = target_id;

  elsif kind = 'step' then
    -- remove_step(path_id, step_id) is path-scoped, so this must be too.
    if scope_id is null then
      raise exception 'deletion_impact(''step'', ...) needs scope_id = the path_id'
        using hint = 'remove_step deletes only the cells on one path; without the path there is no true count.';
    end if;
    select array_agg(c.id), max(s.name) into affected, label
    from public.cells c join public.steps s on s.id = c.step_id
    where c.step_id = target_id and c.path_id = scope_id;

  elsif kind = 'lane' then
    -- remove_lane(scenario_id, lane_name) deletes by NAME across the whole
    -- scenario. Resolve the given lane to its (scenario, name) and count
    -- every lane the delete would actually take.
    select array_agg(c.id), max(l.name) into affected, label
    from public.cells c
    join public.lanes l on l.id = c.lane_id
    join public.paths p on p.id = l.path_id
    where p.scenario_id = (
            select p2.scenario_id
            from public.lanes l2
            join public.paths p2 on p2.id = l2.path_id
            where l2.id = target_id
          )
      and l.name = (select l3.name from public.lanes l3 where l3.id = target_id);

  else
    raise exception 'Unknown kind %', kind;
  end if;

  affected := coalesce(affected, array[]::uuid[]);

  return jsonb_build_object(
    'label', coalesce(label, ''),
    'cell_count', cardinality(affected),
    'dependency_count', (
      select count(*) from public.cell_dependencies t
      where t.source_cell_id = any(affected) or t.target_cell_id = any(affected)
    ),
    'affected_slices', public.slices_referencing(affected)
  );
end;
$$;

-- Unchanged except for the one call: it now hands `deletion_impact` the path
-- it was itself given, which is the scope of everything below it.
create or replace function public.remove_step(path_id uuid, step_id uuid)
returns uuid
language plpgsql security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  impact := public.deletion_impact('step', step_id, remove_step.path_id);

  select jsonb_build_object(
    'step', to_jsonb(s),
    'path_id', remove_step.path_id,
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c
              where c.step_id = s.id and c.path_id = remove_step.path_id)
  ) into payload
  from public.steps s where s.id = step_id;

  insert into public.deleted_structure (kind, label, payload, affected_slices)
  values ('step', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.cells
    where cells.step_id = remove_step.step_id and cells.path_id = remove_step.path_id;
  delete from public.path_steps
    where path_steps.step_id = remove_step.step_id and path_steps.path_id = remove_step.path_id;

  -- Orphaned step rows serve nothing; the scenario keeps only columns in use.
  delete from public.steps s
    where s.id = remove_step.step_id
      and not exists (select 1 from public.path_steps ps where ps.step_id = s.id);

  -- Renumber what is left so positions stay contiguous.
  with ordered as (
    select ps.step_id, row_number() over (order by ps.position) - 1 as position
    from public.path_steps ps where ps.path_id = remove_step.path_id
  )
  update public.path_steps ps
    set position = ordered.position
    from ordered
    where ps.path_id = remove_step.path_id and ps.step_id = ordered.step_id;

  return archive_id;
end;
$$;

-- The proofs are invariants, not counts: they hold on an empty replay and on a
-- loaded database, because what changed is which rows the predicates ADDRESS,
-- and that is visible without any rows at all.
do $$
declare
  v_impact jsonb;
  v_refused boolean := false;
begin
  -- One signature, three arguments, the third optional. Two of them would mean
  -- an overload, and PostgREST would resolve `{kind, target_id}` to whichever
  -- it liked — which is the old behaviour surviving under the new name.
  if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'deletion_impact') <> 1 then
    raise exception 'public.deletion_impact is not a single function; an overload would let the old signature answer';
  end if;

  if (select pronargs from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'deletion_impact') <> 3 then
    raise exception 'public.deletion_impact does not take three arguments';
  end if;

  if (select pronargdefaults from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'deletion_impact') <> 1 then
    raise exception 'scope_id has no default; every existing two-argument caller would break';
  end if;

  -- The refusal is the `step` contract. Asserted by calling, because a body is
  -- text until something runs it.
  begin
    select public.deletion_impact('step', gen_random_uuid()) into v_impact;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'deletion_impact(''step'', id) answered without a scope; it cannot know which path';
  end if;

  -- And the three that answer still answer, over the current vocabulary.
  select public.deletion_impact('lane', gen_random_uuid()) into v_impact;
  if v_impact -> 'affected_slices' is null then
    raise exception 'deletion_impact(''lane'', …) no longer reports affected_slices';
  end if;
  select public.deletion_impact('scenario', gen_random_uuid()) into v_impact;
  if v_impact -> 'affected_slices' is null then
    raise exception 'deletion_impact(''scenario'', …) no longer reports affected_slices';
  end if;
  select public.deletion_impact('path', gen_random_uuid()) into v_impact;
  if v_impact -> 'affected_slices' is null then
    raise exception 'deletion_impact(''path'', …) no longer reports affected_slices';
  end if;

  -- The caller that would have hit the refusal on every step delete.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'remove_step'
       and p.prosrc like '%deletion_impact(''step'', step_id)%'
  ) then
    raise exception 'remove_step still calls deletion_impact without a scope, which now refuses';
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000208000000_a_source_carries_one_note.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A source carries one note.
--
-- `evidence` held three prose-ish columns — `ref`, `excerpt` and `note` — and
-- the form above them asked an author to sort a sentence into the right one
-- before writing it. Measured on the deployment that runs this template: of 66
-- rows, every one carries a title, two carry the quote field, and none carries
-- the reference field. The titles say where the references went instead
-- ("PR 1151", "Card 2266", "Metabase, 2026-08-08"), and one of the two quotes
-- is not a quote but a note about a meeting, sitting in a field whose
-- placeholder reads "Their words, not a summary of them".
--
-- Zero rows means UNUSED, not unreachable: the agent's `create_evidence` could
-- write `ref` the whole time and never did. So the count is evidence about the
-- field, not about the surface.
--
-- `note` survives as the one general-purpose prose column. A quote is one thing
-- an author might put in it, an observation is another, and a URL is a third —
-- a URL written inside a note renders as a link wherever a source is displayed,
-- which is the whole job `ref` was carrying for the rows that never used it.
--
-- ── Why one column is dropped and the other is folded first ────────────────
--
-- `excerpt` and `note` mean the same thing at different widths, so an excerpt
-- has somewhere to go and is moved there. `ref` does not: a locator is not
-- prose, and this migration will not invent a sentence around "PR 1151". A
-- row that still carries one stops the migration instead, and the fix is to
-- fold the locator into the note by hand and run again.
--
-- ── The word `note` survives the promotion ────────────────────────────────
--
-- `21000116000000` set one word per meaning — a `name` is navigated by, a
-- `title` is authored, a `summary` is the thing's own sentence, a `note` is an
-- aside — and then deliberately spared `evidence.note` on the argument that a
-- source's note is an aside beside the source. Three months of authoring says
-- the aside was doing the work and the field beside it was not. So this keeps
-- the word rather than renaming to `summary`: `summary` is the thing's OWN
-- sentence, and a note about a source is still not the source. What changes is
-- that it is now the only prose there is, which is a fold rather than a licence
-- — `findings.summary` is still a summary, and the next column whose job is a
-- thing's own sentence still gets that word.
--
-- ── The assertions are invariants, not censuses ────────────────────────────
--
-- Neither guard counts rows. "No excerpt is destroyed" and "no reference is
-- destroyed" are true of every database this file will ever meet, including an
-- empty one — which is the only kind of assertion that can replay. A guard
-- that named a number would be true of one database on one day and would make
-- this file unable to run anywhere else.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- 21000113000000 wrote `evidence.ref` when it split `cells.links`, from the
-- provenance citations that column held. On an empty replay there are no cells
-- and therefore no citations, so both guards pass and both columns go. On a
-- database that carried citations, the reference guard is exactly the stop it
-- is there to be.
--
-- No grant moves. `evidence` is granted whole-table (20260730090000,
-- 20260818000000), never column by column, so removing two columns removes
-- nothing anybody was given. No function body reads either column: the only
-- SQL that ever named `ref` is 21000113000000's own one-time insert and its
-- own guard, both of which run before this file and are unaffected by it.


-- ---------------------------------------------------------------------------
-- 1. Every excerpt reaches the note
-- ---------------------------------------------------------------------------

update public.evidence
   set note = excerpt
 where excerpt is not null
   and note is null;

do $$
declare
  stranded bigint;
begin
  -- What is left is the rows that carried BOTH, where the two are not the same
  -- sentence. The migration cannot choose between them and will not concatenate
  -- them into a shape their author did not write.
  select count(*) into stranded
    from public.evidence
   where excerpt is not null
     and btrim(excerpt) is distinct from btrim(coalesce(note, ''));
  if stranded <> 0 then
    raise exception '% evidence row(s) carry both an excerpt and a different note. Merge each pair into the note, then run this migration again — it will not join two sentences on its author''s behalf.', stranded;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. No reference is destroyed
-- ---------------------------------------------------------------------------

do $$
declare
  located bigint;
begin
  select count(*) into located
    from public.evidence
   where nullif(btrim(ref), '') is not null;
  if located <> 0 then
    raise exception '% evidence row(s) carry a reference. A locator is not prose and this migration will not invent a sentence around one — fold each into the row''s note, then run it again.', located;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The columns
-- ---------------------------------------------------------------------------

alter table public.evidence
  drop column ref,
  drop column excerpt;

comment on column public.evidence.note is
  'The one thing worth keeping about this source, in the author''s own words: '
  'a quotation, an observation, or a link. A URL written here renders as a '
  'link wherever the source is displayed.';

comment on table public.evidence is
  'Provenance rows for cells and proposition questions. A cell with zero rows '
  'is an ASSUMPTION (derived, never stored). Restricted SELECT: a note may '
  'hold interview content.';

-- ---------------------------------------------------------------------------
-- Proof — invariants, never censuses
-- ---------------------------------------------------------------------------

do $proof$
declare
  bad int;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'evidence'
       and column_name in ('ref', 'excerpt')
  ) then
    raise exception 'evidence still carries ref or excerpt';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'evidence'
       and column_name = 'note'
  ) then
    raise exception 'evidence has no note — the prose landed nowhere';
  end if;

  -- `drop column` refuses when a view or an index depends on the column and
  -- says NOTHING about a function body, which is what makes this the sweep
  -- worth running rather than the one the DDL already did. Nothing in `public`
  -- reads either column today; a body added later that does would raise 42703
  -- when called, and this is where it says so instead.
  --
  -- `excerpt` is taken bare because the word appears nowhere else in this
  -- schema. `ref` cannot be — it is a fragment of half the identifiers in
  -- Postgres — so it is taken only inside a body that also names `evidence`,
  -- which is as narrow as a text sweep can honestly be.
  select count(*) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind in ('f', 'p')
     and (p.prosrc ~ '\mexcerpt\M'
          or (p.prosrc ~ '\mevidence\M' and p.prosrc ~ '\mref\M'));
  if bad <> 0 then
    raise exception '% functions still read evidence.ref or .excerpt', bad;
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000209000000_an_omitted_argument_is_not_an_erasure.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An argument nobody sent is not an erasure.
--
-- `set_cell_dependency` upserts, and its `do update` took both prose columns
-- straight off the row it had tried to insert:
--
--     do update set name = excluded.name, note = excluded.note
--
-- Both arguments default to null, so an omitted argument and an argument sent
-- as null arrive identically. A call that says nothing about the words does not
-- leave them alone — it CLEARS them, on an edge that already exists, and
-- reports success by returning the id it did the damage under.
--
-- ── WHO REACHES IT ────────────────────────────────────────────────────────
--
-- The agent tool. `create_cell_dependency` needs a source, a target and a kind;
-- its prose argument is optional. Asked twice for the same edge — a retry, a
-- re-run of a plan, a model connecting two cells it has already connected — the
-- second call is a bare upsert onto the first, and whatever an author wrote on
-- that edge is gone. Two rows would be a duplicate anybody could see; this
-- leaves one row and a blank field.
--
-- The panel's connection editor cannot: `validateDraftDependency` refuses a
-- duplicate before any call is made. That is a validation standing between a
-- reader and a defect, which is not the same as the defect not being there.
--
-- Performed at the bottom of this file, and performed before it was written
-- against a database holding the previous body: author an edge carrying a name
-- and a note, call again with only the three arguments the tool always sends,
-- and both columns come back null.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
--     do update set name = coalesce(excluded.name, cell_dependencies.name),
--                   note = coalesce(excluded.note, cell_dependencies.note)
--
-- An omitted argument means "leave it as it was"; a supplied one still
-- replaces. Nothing else about the function moves.
--
-- BOTH COLUMNS, and the same reasoning twice. The question worth asking is
-- whether either of them wants the plain assignment — whether some caller
-- CLEARS a value by sending null through this function. None does:
--
--   name   nothing has written it since the editor and the agent tool were
--          pointed at `note`. The only calls that reach it send null because
--          they have nothing to say, never to empty it.
--
--   note   the editor writes it on the way IN, on a pair this function has
--          never seen. Clearing one means removing the connection and adding
--          it again, which is `clear_cell_dependency` and a fresh insert — a
--          different row, and no upsert involved.
--
-- Nor does an undo: the inverse recorded for this function is a delete, not a
-- re-set, so nothing replays an earlier null through it either.
--
-- The cost is stated rather than hidden. After this, a null cannot clear
-- through this function, and neither can an empty string — the body has always
-- turned `''` into null before the conflict clause, so the two have never been
-- distinguishable here. An edit that must be able to empty a field needs a
-- function whose arguments are REQUIRED, where an omission is a loud "function
-- does not exist" rather than a quiet erase; this one, whose job is to add an
-- edge, is not it. Between a caller unable to blank a field and a caller
-- blanking one it never mentioned, only the second loses an author's words.
--
-- ── WHAT THIS FILE DOES NOT ASSERT ────────────────────────────────────────
--
-- That the previous body cleared. It is provable — it is how the defect was
-- found — but it is a fact about what this repository shipped last, not an
-- invariant of the statement below, and a migration that asserts it refuses to
-- apply to a database that arrived at the fix any other way. The proof asserts
-- the post-condition: after this file, an omitted argument preserves and a
-- supplied one replaces. That is true of an empty database, of a loaded one,
-- and of every replay.
--
-- ── THE CLAIM WITHOUT THE ROLE ────────────────────────────────────────────
--
-- The proof holds a service-account claim and does NOT switch role, and the
-- two halves have different reasons.
--
-- It holds the claim because it has to: on a Supabase database the recipe has
-- replaced `is_service_account()` with a read of the JWT, and a migration
-- applies with no JWT at all — so an unclaimed proof would not get past the
-- first line of the function it is proving. In the core, where the tier seam
-- is `select true`, setting the GUC costs nothing and means nothing.
--
-- It does not switch role because it cannot. A deployment proves a write RPC
-- under `set local role authenticated`, since an owner run cannot see a
-- missing grant and the restrictive policies match zero rows in silence. This
-- file is the core, and the core replays onto a stock Postgres where
-- `authenticated` is not a role: a `set local role` in this band is a file
-- that cannot replay. The grants and the policies are the recipe's, and they
-- are untouched here — `create or replace` keeps the ACL, which a
-- drop-and-recreate would take with it.


CREATE OR REPLACE FUNCTION public.set_cell_dependency(source_cell_id uuid, target_cell_id uuid, kind text DEFAULT 'leads_to'::text, name text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  dependency_id uuid;
  source_path uuid;
  target_path uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if set_cell_dependency.source_cell_id = set_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;
  if set_cell_dependency.kind not in ('leads_to', 'enables') then
    raise exception 'Unknown dependency kind %', set_cell_dependency.kind;
  end if;

  select c.path_id into source_path from public.cells c
    where c.id = set_cell_dependency.source_cell_id;
  select c.path_id into target_path from public.cells c
    where c.id = set_cell_dependency.target_cell_id;
  if source_path is null or target_path is null then
    raise exception 'Both cells must exist';
  end if;
  -- Arrows are drawn within one path's grid; a cross-path arrow has nowhere
  -- to render and is what validate_ir.py rejects on import.
  if source_path <> target_path then
    raise exception 'Both cells must be in the same path of the journey';
  end if;

  insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, name, note)
  values (set_cell_dependency.source_cell_id, set_cell_dependency.target_cell_id,
          set_cell_dependency.kind,
          nullif(trim(set_cell_dependency.name), ''),
          nullif(trim(set_cell_dependency.note), ''))
  on conflict on constraint cell_dependencies_source_target_kind_unique
    -- An omitted argument leaves the column as it was. Both arguments default
    -- to null, so `excluded.<col>` cannot tell "the caller said nothing" from
    -- "the caller said nothing is there" — and on an edge that already exists,
    -- the first is what every caller means.
    do update set name = coalesce(excluded.name, public.cell_dependencies.name),
                  note = coalesce(excluded.note, public.cell_dependencies.note)
  returning id into dependency_id;

  return dependency_id;
end;
$function$;

-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
-- Two claims, neither readable off the definition above without believing a
-- reading of `coalesce`:
--
--   1. a call that omits the words leaves them where they were, on the row
--      that was already there — the defect this file exists to close;
--   2. a call that carries them still replaces them, so the fix did not make
--      the function unable to edit the field it upserts.
--
-- The fixture is built and given back inside a sentinel-exception block: a
-- migration may prove a thing, and may not leave the rows it proved it with.
do $an_omitted_argument$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  stp uuid;
  lane_a uuid;
  lane_b uuid;
  cell_a uuid;
  cell_b uuid;
  dep uuid;
  again uuid;
  rows_now integer;
  v_name text;
  v_note text;
  done boolean := false;
  msg text;
begin
  -- Can this environment hold a service claim at all?
  --
  -- Everything below goes through `set_cell_dependency`, which refuses an
  -- account that is not the service account. On Supabase, and on a stock
  -- replay where the core's `is_service_account()` is `select true`, the claim
  -- set inside the fixture is enough. Behind the PORTABLE SHIM it is not:
  -- `auth.jwt()` there returns an empty object unconditionally, so no session
  -- can be a service account and the guarded RPC cannot be exercised.
  --
  -- Asked rather than assumed, and skipped rather than faked. A proof that
  -- reached past the guard to prove the statement underneath would be proving
  -- a copy of the function body instead of the function.
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'omitted-argument proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    -- The claim the function's first line asks for. A GUC, not a role: this
    -- has to be true on a stock Postgres replay as well as on Supabase, and
    -- `set local` gives it back at the end of this block's transaction.
    --
    -- `app_metadata.role` and nothing else, because that is all
    -- `is_service_account()` reads. A fuller claim would carry the name of a
    -- Supabase role into a dollar-quoted body, where the core's own purity
    -- check reads it — correctly — as the core reaching for something only
    -- Supabase provides.
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('omitted-argument fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.steps (scenario_id, name)
      values (scen, 'fixture step') returning id into stp;
    insert into public.path_steps (path_id, step_id, position)
      values (pth, stp, 0);
    -- Two lanes rather than two cells in one: `cells_lane_step_slot_unique` is
    -- the grid saying one cell per square.
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane A', 0) returning id into lane_a;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane B', 1) returning id into lane_b;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_a, stp, 'fixture source') returning id into cell_a;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_b, stp, 'fixture target') returning id into cell_b;

    -- The edge as an author leaves it.
    dep := public.set_cell_dependency(
      cell_a, cell_b, 'leads_to', 'Email', 'the sentence the author wrote');

    -- 1. THE BARE RE-RUN. Exactly what the agent tool sends when it is asked
    -- for an edge that already exists and given nothing to say about it.
    again := public.set_cell_dependency(cell_a, cell_b, 'leads_to');
    if again <> dep then
      raise exception 'the re-run wrote a different row (% then %)', dep, again;
    end if;
    select count(*) into rows_now
      from public.cell_dependencies where source_cell_id = cell_a;
    if rows_now <> 1 then
      raise exception 'the re-run left % rows, expected 1', rows_now;
    end if;

    select d.name, d.note into v_name, v_note
      from public.cell_dependencies d where d.id = dep;
    if v_name is distinct from 'Email' then
      raise exception 'an omitted name erased the badge (now %)', coalesce(v_name, '<null>');
    end if;
    if v_note is distinct from 'the sentence the author wrote' then
      raise exception 'an omitted note erased the sentence (now %)', coalesce(v_note, '<null>');
    end if;

    -- 2. AND A SUPPLIED ARGUMENT STILL REPLACES. A function that preserved
    -- everything would pass the assertions above and be useless.
    perform public.set_cell_dependency(
      cell_a, cell_b, 'leads_to', 'Post', 'a second sentence');
    select d.name, d.note into v_name, v_note
      from public.cell_dependencies d where d.id = dep;
    if v_name is distinct from 'Post' or v_note is distinct from 'a second sentence' then
      raise exception 'a supplied argument no longer replaces (%, %)',
        coalesce(v_name, '<null>'), coalesce(v_note, '<null>');
    end if;

    -- One of them at a time, which is the case the two-argument reading of
    -- `coalesce` gets wrong: the note moves and the name stays put.
    perform public.set_cell_dependency(
      cell_a, cell_b, 'leads_to', null, 'a third sentence');
    select d.name, d.note into v_name, v_note
      from public.cell_dependencies d where d.id = dep;
    if v_name is distinct from 'Post' or v_note is distinct from 'a third sentence' then
      raise exception 'one column moved and took the other with it (%, %)',
        coalesce(v_name, '<null>'), coalesce(v_note, '<null>');
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'omitted-argument fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'omitted-argument fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the omitted-argument cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'omitted-argument fixture') then
    raise exception 'the omitted-argument fixture survived the rollback';
  end if;
end
$an_omitted_argument$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000210000000_an_upsert_says_which_half_it_took.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An upsert says which half it took, and its undo stops guessing.
--
-- `set_cell_dependency` upserts. Landing on a pair that is already connected
-- it UPDATES that row and hands back its id — the same id, in the same shape,
-- as the one it returns when it inserts. Nothing downstream can tell the two
-- apart, and one thing downstream has to: the ledger derives this write's
-- inverse from the operation's NAME, and the name says "connected two cells",
-- so the inverse it records is a delete.
--
-- On the insert half that is exact. On the update half it is destruction
-- dressed as an undo: the edge was there before the write, the write only
-- changed its words, and taking the write back removes the edge entirely.
-- Pressing undo leaves the author worse off than not pressing it.
--
-- ── WHO REACHES IT ────────────────────────────────────────────────────────
--
-- The agent tool. `create_cell_dependency` on a pair the blueprint already
-- connects is a bare upsert onto an existing row — a retry, a re-run of a
-- plan, a model connecting two cells it has connected already. The panel's
-- connection editor cannot: its validation refuses a duplicate before any call
-- is made. So this is an agent-only path, which is the worst kind. The write
-- is made by a machine, in a batch, on rows a person has often already read,
-- and the undo that follows is a person's.
--
-- It compounds with how the undo picks its target. The session sheet offers
-- the newest entry that captured an inverse, so a person reaching for "take
-- back what the agent just did" can reach past their own last edit and delete
-- an edge neither they nor the agent created in that session.
--
-- ── THE FIX, AND WHY IT IS HERE AND NOT IN THE TOOL ───────────────────────
--
-- The inverse must depend on what the write DID, not on what it is called. So
-- the write says what it did.
--
-- The cheaper fix is to narrow the tool — refuse to upsert onto an existing
-- edge and point at an update instead. That is what the cell upsert's tool
-- does, and the reason not to repeat it here is visible in that guard: it is a
-- read followed by a write, so it is a race; it defends one caller, so the
-- next caller has to remember it; and it leaves the ledger deriving a delete
-- from a name, which is the thing that is actually wrong. A guard standing
-- between a caller and a defect is not the same as the defect not being there.
--
-- ── WHAT THE FUNCTION NOW RETURNS ─────────────────────────────────────────
--
--     { "id": uuid, "inserted": boolean, "previous": {…} | null }
--
--   id         the row written, either half. What every existing caller read
--              off the old `uuid` return, now under a name.
--   inserted   which half the upsert took, read from the written row's `xmax`
--              — zero exactly when this statement inserted it.
--   previous   the row AS IT STOOD, captured before the write and locked, or
--              null when there was nothing there. Keyed on the row's own id,
--              so the undo restores THIS row and not whatever joins the same
--              two cells by the time it runs.
--
-- `previous` is null whenever `inserted` is true, and it can ALSO be null when
-- `inserted` is false: another session inserting the row between the capture
-- and the upsert leaves this call updating a row it never saw. That is a state
-- the caller must be able to see, because the honest answer to it is to offer
-- no undo at all rather than an approximate one — which is what the ledger
-- does with the deletes, and is the same sentence said about a different
-- operation.
--
-- ── WHY THE RETURN TYPE MOVES, AND WHAT THAT COSTS ────────────────────────
--
-- A `uuid` cannot carry two more facts, and Postgres will not let `create or
-- replace` change a return type. So the function is dropped and recreated,
-- which takes its ACL with it — the one thing the previous migration on this
-- function was careful to avoid, and the reason it is restated here in two
-- bands. The core revokes the PUBLIC execute the recreate lands on; the recipe
-- half re-states the anon revoke and the authenticated grant, because those
-- name roles only a Supabase deployment has. `20260818001000` and
-- `21000207000000` are the two files that did this before, in that order and
-- for that reason.
--
-- The signature is byte-identical, so every caller's ARGUMENTS are unaffected
-- — over PostgREST too, which resolves by argument name. What changes is what
-- comes back, and the two readers of that are the panel's add form, which
-- ignores it, and the agent tool, which quotes the id.
--
-- ── THE OTHER HALF: A ROW CAN BE PUT BACK ─────────────────────────────────
--
-- Knowing the upsert updated is only half an undo; the other half needs an
-- operation that restores what the update overwrote. `restore_cell_dependency`
-- is that operation and nothing else — the two prose columns, on one row, by
-- id. It exists for the same reason `restore_placement` and
-- `restore_featured_resources` do: an inverse a caller cannot express with the
-- forward operation needs a function of its own.
--
-- It ASSIGNS rather than coalescing, which is the whole point: the case the
-- agent actually causes is an edge that had no note being given one, and an
-- inverse that cannot write a null cannot undo that. The forward function
-- coalesces, deliberately, so an omitted argument is not an erasure — the two
-- rules are opposite because the two jobs are. One is told what to add; the
-- other is told what was there.
--
-- And it does not trim. Every other write into these columns trims on the way
-- in, so a value that reaches this function has already been trimmed by
-- whatever wrote it — except an imported row, which the pipeline writes
-- directly. A restore that trimmed would quietly rewrite such a row on the way
-- back rather than putting it back.
--
-- A zero-row update is a failure and says so. There is no state in which the
-- undo of an edit to a row that still exists matches nothing, so matching
-- nothing means the row is gone and the caller is owed the sentence.


drop function if exists public.set_cell_dependency(uuid, uuid, text, text, text);

create or replace function public.set_cell_dependency(
  source_cell_id uuid,
  target_cell_id uuid,
  kind text default 'leads_to',
  name text default null,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  previous public.cell_dependencies;
  dependency_id uuid;
  was_inserted boolean;
  source_path uuid;
  target_path uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if set_cell_dependency.source_cell_id = set_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;
  if set_cell_dependency.kind not in ('leads_to', 'enables') then
    raise exception 'Unknown dependency kind %', set_cell_dependency.kind;
  end if;

  select c.path_id into source_path from public.cells c
    where c.id = set_cell_dependency.source_cell_id;
  select c.path_id into target_path from public.cells c
    where c.id = set_cell_dependency.target_cell_id;
  if source_path is null or target_path is null then
    raise exception 'Both cells must exist';
  end if;
  -- Arrows are drawn within one path's grid; a cross-path arrow has nowhere
  -- to render and is what validate_ir.py rejects on import.
  if source_path <> target_path then
    raise exception 'Both cells must be in the same path of the journey';
  end if;

  -- BEFORE the write, and locked. The lock is what stops a concurrent edit of
  -- the same edge from landing between this read and the upsert and leaving
  -- the caller holding a `previous` that was never true.
  select d.* into previous
    from public.cell_dependencies d
   where d.source_cell_id = set_cell_dependency.source_cell_id
     and d.target_cell_id = set_cell_dependency.target_cell_id
     and d.kind = set_cell_dependency.kind
   for update;

  insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, name, note)
  values (set_cell_dependency.source_cell_id, set_cell_dependency.target_cell_id,
          set_cell_dependency.kind,
          nullif(trim(set_cell_dependency.name), ''),
          nullif(trim(set_cell_dependency.note), ''))
  on conflict on constraint cell_dependencies_source_target_kind_unique
    -- An omitted argument leaves the column as it was. Both arguments default
    -- to null, so `excluded.<col>` cannot tell "the caller said nothing" from
    -- "the caller said nothing is there" — and on an edge that already exists,
    -- the first is what every caller means.
    do update set name = coalesce(excluded.name, public.cell_dependencies.name),
                  note = coalesce(excluded.note, public.cell_dependencies.note)
  -- `xmax` is zero on a row this statement inserted and the updating
  -- transaction's id on a row it updated. It is the write's own account of
  -- which half it took, which is the one account nothing else can second-guess
  -- after the fact.
  returning id, (xmax = 0) into dependency_id, was_inserted;

  return jsonb_build_object(
    'id', dependency_id,
    'inserted', was_inserted,
    'previous',
    case
      when was_inserted or previous.id is null then null
      else jsonb_build_object(
        'id', previous.id,
        'source_cell_id', previous.source_cell_id,
        'target_cell_id', previous.target_cell_id,
        'kind', previous.kind,
        'name', previous.name,
        'note', previous.note)
    end);
end;
$function$;

create or replace function public.restore_cell_dependency(
  dependency_id uuid,
  name text,
  note text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  update public.cell_dependencies d
     set name = restore_cell_dependency.name,
         note = restore_cell_dependency.note
   where d.id = restore_cell_dependency.dependency_id;

  if not found then
    raise exception 'That connection no longer exists';
  end if;
end;
$function$;

-- The recreate above landed on the default EXECUTE TO PUBLIC. This is the
-- revoke the previous body carried, restated because the drop took it.
revoke execute on function public.set_cell_dependency(uuid, uuid, text, text, text) from public;
revoke execute on function public.restore_cell_dependency(uuid, text, text) from public;


-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
-- Four claims, none of them readable off the definitions above:
--
--   1. the first call INSERTS and says so, and offers no previous — the half
--      whose inverse has always been a delete, and still is;
--   2. the second call on the same pair UPDATES and says so, and hands back
--      the row as it stood — the half whose inverse was a delete and is now a
--      restore;
--   3. the previous it hands back is the row BEFORE this write, not after:
--      checked on a call that overwrites a note, where a function returning
--      the row as it now stands would agree with the row and only disagree
--      here;
--   4. the undo, performed. Feeding that previous back through
--      `restore_cell_dependency` puts the words back, INCLUDING back to null
--      — the case an inverse built out of the forward function cannot express,
--      and the case the agent actually causes.
--
-- And the edge is counted throughout, because the defect this file closes is
-- an edge that stops existing: one row before the undo, one row after.
--
-- The fixture is built and given back inside a sentinel-exception block: a
-- migration may prove a thing, and may not leave the rows it proved it with.
do $which_half$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  stp uuid;
  lane_a uuid;
  lane_b uuid;
  cell_a uuid;
  cell_b uuid;
  first_write jsonb;
  second_write jsonb;
  dep uuid;
  rows_now integer;
  v_name text;
  v_note text;
  done boolean := false;
  msg text;
begin
  -- Can this environment hold a service claim at all?
  --
  -- Everything below goes through `set_cell_dependency`, which refuses an
  -- account that is not the service account. On Supabase, and on a stock
  -- replay where the core's `is_service_account()` is `select true`, the claim
  -- set inside the fixture is enough. Behind the PORTABLE SHIM it is not:
  -- `auth.jwt()` there returns an empty object unconditionally, so no session
  -- can be a service account and the guarded RPC cannot be exercised.
  --
  -- Asked rather than assumed, and skipped rather than faked. A proof that
  -- reached past the guard to prove the statements underneath would be proving
  -- a copy of the function bodies instead of the functions.
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'which-half proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    -- The claim the functions' first lines ask for. A GUC, not a role: this
    -- has to be true on a stock Postgres replay as well as on Supabase, and
    -- `set local` gives it back at the end of this block's transaction. There
    -- is no `set local role` here, because the core replays onto a stock
    -- Postgres where `authenticated` is not a role — the grants above are the
    -- recipe's, and the recipe is where a deployment proves them.
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('which-half fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.steps (scenario_id, name)
      values (scen, 'fixture step') returning id into stp;
    insert into public.path_steps (path_id, step_id, position)
      values (pth, stp, 0);
    -- Two lanes rather than two cells in one: `cells_lane_step_slot_unique` is
    -- the grid saying one cell per square.
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane A', 0) returning id into lane_a;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane B', 1) returning id into lane_b;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_a, stp, 'fixture source') returning id into cell_a;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_b, stp, 'fixture target') returning id into cell_b;

    -- 1. THE INSERT HALF. An edge that did not exist, added with no words on
    -- it — which is the state the agent's second call then overwrites.
    first_write := public.set_cell_dependency(cell_a, cell_b, 'leads_to');
    if (first_write ->> 'inserted') is distinct from 'true' then
      raise exception 'the first call did not report an insert: %', first_write;
    end if;
    if first_write -> 'previous' <> 'null'::jsonb then
      raise exception 'the insert half reported a previous row: %', first_write;
    end if;
    dep := (first_write ->> 'id')::uuid;

    -- 2. THE UPDATE HALF. The agent's `create_cell_dependency` on a pair that
    -- is already connected, carrying a label.
    second_write := public.set_cell_dependency(
      cell_a, cell_b, 'leads_to', null, 'the sentence the agent wrote');
    if (second_write ->> 'inserted') is distinct from 'false' then
      raise exception 'the second call did not report an update: %', second_write;
    end if;
    if (second_write ->> 'id')::uuid <> dep then
      raise exception 'the second call wrote a different row (% then %)',
        dep, second_write ->> 'id';
    end if;
    select count(*) into rows_now
      from public.cell_dependencies where source_cell_id = cell_a;
    if rows_now <> 1 then
      raise exception 'the second call left % rows, expected 1', rows_now;
    end if;

    -- 3. AND WHAT IT HANDED BACK IS THE ROW AS IT STOOD. The note is null
    -- there and is not null on the row now, which is the disagreement a
    -- function returning the row as it NOW stands could not produce.
    if (second_write -> 'previous' ->> 'id')::uuid <> dep then
      raise exception 'the previous row is not the row that was written: %', second_write;
    end if;
    if second_write -> 'previous' ->> 'note' is not null then
      raise exception 'the previous row carries a note it never had: %', second_write;
    end if;
    select d.note into v_note from public.cell_dependencies d where d.id = dep;
    if v_note is distinct from 'the sentence the agent wrote' then
      raise exception 'the write did not land (note is now %)', coalesce(v_note, '<null>');
    end if;

    -- 4. THE UNDO, PERFORMED — as the ledger performs it, by feeding the
    -- previous row straight into the restore. Back to null, which is the
    -- assignment the forward function's coalesce cannot express.
    perform public.restore_cell_dependency(
      (second_write -> 'previous' ->> 'id')::uuid,
      second_write -> 'previous' ->> 'name',
      second_write -> 'previous' ->> 'note');
    select d.name, d.note into v_name, v_note
      from public.cell_dependencies d where d.id = dep;
    if v_name is not null or v_note is not null then
      raise exception 'the undo left words behind (%, %)',
        coalesce(v_name, '<null>'), coalesce(v_note, '<null>');
    end if;

    -- THE WHOLE POINT. The edge the agent found is the edge the author still
    -- has. Under the derivation this file replaces, the undo above was a
    -- delete and this count was zero.
    select count(*) into rows_now
      from public.cell_dependencies where source_cell_id = cell_a;
    if rows_now <> 1 then
      raise exception 'after the undo % edges remain, expected 1', rows_now;
    end if;

    -- 5. AND A RESTORE OF A ROW THAT IS GONE SAYS SO. A zero-row write is a
    -- failure here, not a quiet success, which is what lets the caller tell an
    -- undo that worked from one that matched nothing.
    begin
      perform public.restore_cell_dependency(
        gen_random_uuid(), null, 'never written');
      raise exception 'restoring a row that does not exist was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'That connection no longer exists' then raise; end if;
    end;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'which-half fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'which-half fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the which-half cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'which-half fixture') then
    raise exception 'the which-half fixture survived the rollback';
  end if;
end
$which_half$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000211000000_the_other_upsert_says_which_half_it_took.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The other upsert says which half it took, and its undo stops guessing.
--
-- `upsert_cell` upserts. Landing on a square of the grid that already holds a
-- cell it UPDATES that row and hands back its id — the same id, in the same
-- shape, as the one it returns when it inserts. Nothing downstream can tell
-- the two apart, and one thing downstream has to: the ledger derives this
-- write's inverse from the operation's NAME, and the name says "cell", so the
-- inverse it records is `delete_cell`.
--
-- On the insert half that is exact. On the update half it is destruction
-- dressed as an undo: the cell was there before the write, the write only
-- changed its text, and taking the write back removes the cell entirely —
-- with its summary, its Function, its Form, its Value props, its owner pair
-- and its status, none of which this write touched.
--
-- ── WHY THIS IS NOT A LIVE DEFECT, AND WHY THAT IS THE ARGUMENT ───────────
--
-- Both callers establish the slot was empty before they call. The panel calls
-- `upsert_cell` only on a draft, when there is no cell id to update; the agent
-- tool reads the slot first and refuses with "A cell already exists at that
-- slot … `upsert_cell` only creates."
--
-- So nothing reaches the update half today, and this file is not a repair of
-- a symptom anybody has seen. It is a repair of the reason nobody has seen
-- one, which is two callers remembering.
--
-- The agent tool's occupancy check is a read followed by a write. Between the
-- read and the upsert nothing holds the slot: two agent turns on the same
-- board, or an agent and a person, and both reads see an empty square and the
-- second write lands on the first write's cell. The window is small and the
-- consequence is not — the loser's undo deletes the winner's cell.
--
-- And the guard is per-caller. It defends the two callers that carry it and
-- must be carried again by the third, which is a rule living in prose in two
-- files rather than in the operation. `set_cell_dependency` made this exact
-- argument in `21000210000000` and pointed at this function's guard as the
-- cheaper fix it declined to copy. This file finishes that sentence.
--
-- The guards STAY. Once the write reports for itself they are belt-and-braces
-- rather than the safety, and the agent tool's refusal is a better answer to
-- "create a cell where one already is" than a silent update would be. What
-- changes is that the ledger no longer depends on them being remembered.
--
-- ── WHAT THE FUNCTION NOW RETURNS ─────────────────────────────────────────
--
--     { "id": uuid, "inserted": boolean, "previous": {…} | null }
--
--   id         the row written, either half. What every existing caller read
--              off the old `uuid` return, now under a name.
--   inserted   which half the upsert took, read from the written row's `xmax`
--              — zero exactly when this statement inserted it. No caller can
--              establish this afterwards, which is why the write says it.
--   previous   the row AS IT STOOD, captured before the write under a lock,
--              or null when there was nothing there. Keyed on the row's own
--              id, so the undo restores THIS cell and not whatever occupies
--              the square by the time it runs.
--
-- `previous` is null whenever `inserted` is true, and it can ALSO be null when
-- `inserted` is false: another session inserting the cell between the capture
-- and the upsert leaves this call updating a row it never saw. That is a state
-- the caller must be able to see, because the honest answer to it is to offer
-- no undo at all rather than an approximate one — which is what the ledger
-- does with the deletes, and is the same sentence said about a different
-- operation.
--
-- ── WHAT `previous` CARRIES, AND WHY IT IS ONE COLUMN ─────────────────────
--
-- A cell has eighteen columns and this carries one of them, which wants
-- saying out loud rather than discovering.
--
-- The update half writes exactly one: `do update set content =
-- excluded.content`. Everything else in the `values` list is either part of
-- the conflict key (path, lane, step, slot) or set only on the insert —
-- `origin`, and `cell_key`, which is deliberately minted on insert and never
-- on update because a cell's key is its identity for slice recovery.
--
-- So `previous` carries `id` and `content`, and the restore writes `content`.
-- That is everything `upsert_cell` can change, which is the whole of what its
-- undo may change.
--
-- The temptation is the other seven columns a person actually types into a
-- cell — summary, status, Function, Form, Value props, owner, perceived
-- owner. An undo that put those back too would look more thorough and would
-- be wrong: `upsert_cell` never wrote them, so restoring them would reach
-- past this write and revert somebody's separate edit, which has its own
-- ledger row and its own inverse through `update_cell_content` and
-- `update_cell_spec`. An inverse that undoes more than its operation did is
-- the same class of error as one that undoes less.
--
-- ── WHY THE RETURN TYPE MOVES, AND WHAT THAT COSTS ────────────────────────
--
-- A `uuid` cannot carry two more facts, and Postgres will not let `create or
-- replace` change a return type. So the function is dropped and recreated,
-- which takes its ACL with it. A freshly created function picks up the
-- platform's default privileges, and a `revoke … from public` does not take
-- away a role's own grant — so the ACL is restated in both bands rather than
-- assumed. The core revokes the PUBLIC execute the recreate lands on; the
-- recipe half re-states the anon revoke and the authenticated grant, because
-- those name roles only a Supabase deployment has. `20260818001000`,
-- `21000207000000` and `21000210000000` are the files that did this before,
-- in that order and for that reason.
--
-- The signature is byte-identical, so every caller's ARGUMENTS are unaffected
-- — over PostgREST too, which resolves by argument name. What changes is what
-- comes back, and the two readers of that are the panel's editor, which takes
-- the id, and the agent tool, which quotes it.
--
-- ── THE OTHER HALF: A CELL'S TEXT CAN BE PUT BACK ─────────────────────────
--
-- Knowing the upsert updated is only half an undo; the other half needs an
-- operation that restores what the update overwrote. `restore_cell_content`
-- is that operation and nothing else — one prose column, on one row, by id.
-- It exists for the same reason `restore_cell_dependency`, `restore_placement`
-- and `restore_featured_resources` do: an inverse a caller cannot express with
-- the forward operation needs a function of its own.
--
-- It ASSIGNS rather than coalescing. `cells.content` is `not null default ''`,
-- so the state a coalescing inverse could not express is not null but EMPTY:
-- the panel creates a cell from a draft with `form.content.trim()`, which is
-- routinely the empty string, and an agent writing text onto that blank square
-- is exactly the collision this file is about. An inverse that treated `''` as
-- "the caller said nothing" would leave the agent's sentence standing and
-- report success. A revert control that silently cannot clear a field is worse
-- than no revert control, because it lies.
--
-- And it does not trim. `upsert_cell` does not trim either — it coalesces and
-- writes what it is given — so a value that reaches this function has already
-- been trimmed by whatever wrote it, except an imported row, which the
-- pipeline writes directly. A restore that trimmed would quietly rewrite such
-- a row on the way back rather than putting it back.
--
-- A zero-row update is a failure and says so. There is no state in which the
-- undo of an edit to a row that still exists matches nothing, so matching
-- nothing means the cell is gone and the caller is owed the sentence.
--
-- One thing the restore does NOT undo, said plainly: `upsert_cell` links the
-- step to the path first when the link is missing, and neither the delete this
-- replaces nor the restore that succeeds it removes that link. That is
-- unchanged by this file, and on the update half it is unreachable anyway — a
-- cell cannot exist in a column the path does not carry.


drop function if exists public.upsert_cell(uuid, uuid, uuid, text);

create or replace function public.upsert_cell(
  path_id uuid,
  lane_id uuid,
  step_id uuid,
  content text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  previous public.cells;
  cell_id uuid;
  was_inserted boolean;
  next_column int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.path_steps ps
    where ps.path_id = upsert_cell.path_id and ps.step_id = upsert_cell.step_id
  ) then
    select coalesce(max(position) + 1, 0) into next_column
    from public.path_steps where path_steps.path_id = upsert_cell.path_id;
    insert into public.path_steps (path_id, step_id, position)
    values (upsert_cell.path_id, upsert_cell.step_id, next_column);
  end if;

  -- BEFORE the write, and locked. The lock is what stops a concurrent edit of
  -- the same square from landing between this read and the upsert and leaving
  -- the caller holding a `previous` that was never true.
  select c.* into previous
    from public.cells c
   where c.lane_id = upsert_cell.lane_id
     and c.step_id = upsert_cell.step_id
     and c.position = 0
   for update;

  -- Minted on insert, never on update: a cell's key is its identity for slice
  -- recovery, so renaming a lane must not silently repoint every slice that
  -- referenced the cells in it.
  insert into public.cells (path_id, lane_id, step_id, position, content, origin, cell_key)
  values (upsert_cell.path_id, upsert_cell.lane_id, upsert_cell.step_id, 0,
          coalesce(content, ''), 'app',
          public.mint_cell_key(upsert_cell.path_id, upsert_cell.lane_id,
                               upsert_cell.step_id))
  on conflict on constraint cells_lane_step_slot_unique
    do update set content = excluded.content
  -- `xmax` is zero on a row this statement inserted and the updating
  -- transaction's id on a row it updated. It is the write's own account of
  -- which half it took, which is the one account nothing else can second-guess
  -- after the fact.
  returning id, (xmax = 0) into cell_id, was_inserted;

  return jsonb_build_object(
    'id', cell_id,
    'inserted', was_inserted,
    'previous',
    case
      when was_inserted or previous.id is null then null
      -- One column, because one column is what the update half wrote. See the
      -- header: an inverse that undoes more than its operation did reverts
      -- somebody else's edit.
      else jsonb_build_object('id', previous.id, 'content', previous.content)
    end);
end;
$function$;

create or replace function public.restore_cell_content(
  cell_id uuid,
  content text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  update public.cells c
     set content = restore_cell_content.content
   where c.id = restore_cell_content.cell_id;

  if not found then
    raise exception 'That cell no longer exists';
  end if;
end;
$function$;

-- The recreate above landed on the default EXECUTE TO PUBLIC. This is the
-- revoke the previous body carried, restated because the drop took it.
revoke execute on function public.upsert_cell(uuid, uuid, uuid, text) from public;
revoke execute on function public.restore_cell_content(uuid, text) from public;


-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
-- Six claims, none of them readable off the definitions above:
--
--   1. the first call INSERTS and says so, and offers no previous — the half
--      whose inverse has always been a delete, and still is;
--   2. the second call on the same square UPDATES and says so, on the same
--      row — the half whose inverse was a delete and is now a restore;
--   3. the previous it hands back is the row BEFORE this write, not after:
--      checked on a call that overwrites the text, where a function returning
--      the row as it now stands would agree with the row and only disagree
--      here;
--   4. the undo, performed. Feeding that previous back through
--      `restore_cell_content` puts the text back, INCLUDING back to the empty
--      string — the case an inverse that coalesced could not express, and the
--      case a blank cell an agent writes onto actually is;
--   5. the undo carries one column and no more: a summary typed between the
--      two writes is still there afterwards. That is the deliberate scope of
--      `previous`, and the assertion is what keeps it deliberate;
--   6. a restore of a row that is gone says so rather than passing quietly.
--
-- And the cell is counted throughout, because the defect this file closes is
-- a cell that stops existing: one row before the undo, one row after.
--
-- The fixture is built and given back inside a sentinel-exception block: a
-- migration may prove a thing, and may not leave the rows it proved it with.
do $which_half$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  stp uuid;
  lane_a uuid;
  first_write jsonb;
  second_write jsonb;
  cell uuid;
  rows_now integer;
  v_content text;
  v_summary text;
  done boolean := false;
  msg text;
begin
  -- Can this environment hold a service claim at all?
  --
  -- Everything below goes through `upsert_cell`, which refuses an account that
  -- is not the service account. On Supabase, and on a stock replay where the
  -- core's `is_service_account()` is `select true`, the claim set inside the
  -- fixture is enough. Behind a portable shim it may not be: a stand-in whose
  -- `auth.jwt()` returns an empty object unconditionally leaves no session
  -- able to be a service account, and the guarded RPC cannot be exercised.
  --
  -- Asked rather than assumed, and skipped rather than faked. A proof that
  -- reached past the guard to prove the statements underneath would be proving
  -- a copy of the function bodies instead of the functions.
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'which-half proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    -- The claim the functions' first lines ask for. A GUC, not a role: this
    -- has to be true on a stock Postgres replay as well as on Supabase, and
    -- `set local` gives it back at the end of this block's transaction. There
    -- is no `set local role` here, because the core replays onto a stock
    -- Postgres where `authenticated` is not a role — the grants above are the
    -- recipe's, and the recipe is where a deployment proves them.
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('which-half cell fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.steps (scenario_id, name)
      values (scen, 'fixture step') returning id into stp;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane', 0) returning id into lane_a;
    -- No `path_steps` row on purpose: linking the column to the path is the
    -- function's own first job, and the insert below is what exercises it.

    -- 1. THE INSERT HALF, on a blank draft — `form.content.trim()` on a cell
    -- the author has not typed into yet, which is the square the agent then
    -- lands on.
    first_write := public.upsert_cell(pth, lane_a, stp, '');
    if (first_write ->> 'inserted') is distinct from 'true' then
      raise exception 'the first call did not report an insert: %', first_write;
    end if;
    if first_write -> 'previous' <> 'null'::jsonb then
      raise exception 'the insert half reported a previous row: %', first_write;
    end if;
    cell := (first_write ->> 'id')::uuid;

    -- The author's separate edit, through the operation that owns that column
    -- and captures its own inverse. Nothing below may touch it.
    update public.cells set summary = 'what the author typed' where id = cell;

    -- 2. THE UPDATE HALF. The agent's `create_cell` on a square that is
    -- already occupied — which its occupancy read refuses today, and which
    -- two agent turns racing that read do not.
    second_write := public.upsert_cell(pth, lane_a, stp, 'what the agent wrote');
    if (second_write ->> 'inserted') is distinct from 'false' then
      raise exception 'the second call did not report an update: %', second_write;
    end if;
    if (second_write ->> 'id')::uuid <> cell then
      raise exception 'the second call wrote a different row (% then %)',
        cell, second_write ->> 'id';
    end if;
    select count(*) into rows_now from public.cells where lane_id = lane_a;
    if rows_now <> 1 then
      raise exception 'the second call left % cells, expected 1', rows_now;
    end if;

    -- 3. AND WHAT IT HANDED BACK IS THE ROW AS IT STOOD. The content is empty
    -- there and is not empty on the row now, which is the disagreement a
    -- function returning the row as it NOW stands could not produce.
    if (second_write -> 'previous' ->> 'id')::uuid <> cell then
      raise exception 'the previous row is not the row that was written: %', second_write;
    end if;
    if second_write -> 'previous' ->> 'content' is distinct from '' then
      raise exception 'the previous row carries text it never had: %', second_write;
    end if;
    select c.content into v_content from public.cells c where c.id = cell;
    if v_content is distinct from 'what the agent wrote' then
      raise exception 'the write did not land (content is now %)', coalesce(v_content, '<null>');
    end if;

    -- 4. THE UNDO, PERFORMED — as the ledger performs it, by feeding the
    -- previous row straight into the restore. Back to the empty string, which
    -- is the assignment a coalescing inverse cannot express.
    perform public.restore_cell_content(
      (second_write -> 'previous' ->> 'id')::uuid,
      second_write -> 'previous' ->> 'content');
    select c.content, c.summary into v_content, v_summary
      from public.cells c where c.id = cell;
    if v_content is distinct from '' then
      raise exception 'the undo left text behind (%)', coalesce(v_content, '<null>');
    end if;

    -- 5. AND IT CARRIED ONE COLUMN. The summary was typed between the two
    -- writes, by a different operation with a different inverse; an undo of
    -- the upsert that reached it would be reverting somebody else's edit.
    if v_summary is distinct from 'what the author typed' then
      raise exception 'the undo reached a column the write never touched (summary is now %)',
        coalesce(v_summary, '<null>');
    end if;

    -- THE WHOLE POINT. The cell the agent found is the cell the author still
    -- has. Under the derivation this file replaces, the undo above was a
    -- delete and this count was zero.
    select count(*) into rows_now from public.cells where lane_id = lane_a;
    if rows_now <> 1 then
      raise exception 'after the undo % cells remain, expected 1', rows_now;
    end if;

    -- 6. AND A RESTORE OF A ROW THAT IS GONE SAYS SO. A zero-row write is a
    -- failure here, not a quiet success, which is what lets the caller tell an
    -- undo that worked from one that matched nothing.
    begin
      perform public.restore_cell_content(gen_random_uuid(), 'never written');
      raise exception 'restoring a row that does not exist was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'That cell no longer exists' then raise; end if;
    end;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'which-half cell fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'which-half cell fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the which-half cell cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'which-half cell fixture') then
    raise exception 'the which-half cell fixture survived the rollback';
  end if;
end
$which_half$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000212000000_the_service_record_joins_the_tier.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The service record joins the tier every other table already answers to.
--
-- `public.services` is the one table on the write surface a plain signed-in
-- member can UPDATE. Every other table there admits only a service account.
-- docs/guide/04-operations.md says a member outside the editing tier may read
-- and not write; of this table that was never true.
--
-- ── How the gap opened ────────────────────────────────────────────────────
--
-- Two migrations, neither wrong on its own.
--
-- 20260818002000 introduced the service-account tier and hung a RESTRICTIVE
-- `*_service_only` policy on the tables that had a write policy to restrict.
-- `services` had none yet — the spine's root was read-only, the IR builds a
-- service and nothing edited one — so it got none.
--
-- 21000128000000 then gave `services` the write policy it was missing,
-- `services_update_auth` with `using (true)`, so the Service panel could save.
-- It restored the half that was missing and did not add the half the earlier
-- migration would have. Nothing anywhere argues that the service record should
-- be the one row an ordinary member may rewrite: it is an oversight with two
-- authors, and this file is the third.
--
-- ── Shape ─────────────────────────────────────────────────────────────────
--
-- RESTRICTIVE, which is the whole of the fix. A permissive policy naming
-- `is_service_account()` would OR with `services_update_auth`'s `using (true)`
-- and change nothing at all. Restrictive policies AND, so this one narrows the
-- permissive policy it stands beside — the same shape 20260818002000 built for
-- its thirteen tables, and the same one `stakeholders` and `cell_touchpoints`
-- were given when they joined the surface later. Written out rather than
-- looped, because it is one table.
--
-- UPDATE only, and deliberately. `services` carries no INSERT or DELETE policy
-- for `authenticated` at all, so both verbs already match zero rows under row
-- level security; a restrictive policy over a write nobody is admitted to make
-- would assert nothing and read as though it did. Nothing under `src/` inserts
-- or deletes a service either — the write surface finds one verb on this table
-- — and the RPCs that do build one are SECURITY DEFINER, so they never meet a
-- policy and assert the tier in their own bodies instead.
--
-- ── A single-tier deployment is untouched ─────────────────────────────────
--
-- `public.is_service_account()` is the CORE seam (20260818001000) and its
-- default body is `select true`: every signed-in session edits, the template
-- default. Only the OPTIONAL tier recipe replaces it with a read of the JWT.
-- So on a deployment that skipped that recipe this policy admits everyone and
-- changes nothing, which is the posture that deployment chose and this file
-- must not overrule. That is also why the proof below asserts AGREEMENT with
-- the seam rather than a flat refusal: after this migration an UPDATE of
-- `services` is admitted exactly when `is_service_account()` says so,
-- whichever body that function carries.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Recipe-only and additive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000128000000). The
-- `drop policy if exists` makes a partial re-run idempotent. The proof stands
-- its own service row up inside a subtransaction it then aborts, so it asks
-- the same question of an empty replay as of a loaded target and leaves
-- nothing behind on either.

-- ─────────────────────────────────────────────────────────────────────────
-- 21000213000000_one_shape_for_service_accounts_only.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Two tables spell "service accounts only" the way the other twelve do.
--
-- Fourteen tables are on the write surface — the tables the panels reach
-- directly, under the caller's own privileges, rather than through the
-- definer RPCs (scripts/panel-write-surface.mjs holds the list). Twelve of
-- them express "only the editing tier may write this" as a PAIR: a permissive
-- `<table>_<verb>_auth` with `using (true)`, and a RESTRICTIVE
-- `<table>_<verb>_service_only` whose predicate is `public.is_service_account()`.
-- `stakeholders` and `cell_touchpoints`, until this file, expressed it as a
-- SINGLE PERMISSIVE policy whose whole predicate was that same call.
--
-- ── This is not a security fix ────────────────────────────────────────────
--
-- Both shapes admit exactly a service account and refuse exactly everyone
-- else. There is no hole here and this file closes none. Read as a patch it
-- would say the opposite of what is true, so: the posture before this
-- migration and the posture after it are the same posture, on every database
-- it will ever be replayed against. What changes is that one rule stops being
-- written two ways.
--
-- ── How the second shape arrived ──────────────────────────────────────────
--
-- 20260818002000, the optional service-account tier, hung the restrictive
-- half on the thirteen tables that already had a permissive write policy for
-- it to narrow. `stakeholders` (21000125000000) and `cell_touchpoints`
-- (21000113000000) joined the surface afterwards. Each was written from
-- scratch rather than by amending an existing permissive policy, so each
-- reached for the shortest thing that was correct: one policy, one call. Both
-- authors were right about the rule and neither had anywhere to read the
-- shape, because nothing stated it. That is the defect — not the SQL, the
-- absence of a written convention. So the other half of this change is a
-- paragraph in docs/connectors/supabase/database.md § Row Level Security
-- saying which shape a write policy takes, which is the half that stops the
-- next table from arriving with a third one.
--
-- ── Why the pair wins ─────────────────────────────────────────────────────
--
-- The two shapes are equally correct, so this is a decision about which is
-- clearer rather than which is right. Three things decide it.
--
-- It is the majority and the established one. A reader meets the pair twelve
-- times before meeting the exception, 20260818002000 built it, and
-- 21000212000000 followed it for `services`. Collapsing the other way would
-- rewrite twelve tables to accommodate two.
--
-- It keeps two decisions apart that have two different owners. The permissive
-- half is the base template's: this table is edited from the browser rather
-- than through an RPC. The restrictive half is the OPTIONAL tier recipe's:
-- and only by the editing tier. Under the single-policy shape a base-template
-- migration names a function whose whole purpose belongs to a recipe the
-- deployer is invited to delete, and is correct only because the core seam's
-- default body happens to be `select true`. That is a coupling nothing at the
-- call site shows.
--
-- And it makes the absence of a restriction legible. `services` carried a
-- permissive `using (true)` and no restrictive partner until 21000212000000,
-- one release ago. A surface table with an `_auth` policy and no
-- `_service_only` beside it is a hole — but that reading is only sound once
-- every table on the surface is expected to carry the pair, because until now
-- a lone permissive policy might equally have been the other legitimate
-- shape. The single-policy form is the one that most resembles the defect,
-- which is what cost the time.
--
-- ── A single-tier deployment is untouched ─────────────────────────────────
--
-- `public.is_service_account()` is the CORE seam (20260818001000) and its
-- default body is `select true`: every signed-in session edits, the template
-- default. Only the optional tier recipe replaces it with a read of the JWT.
-- So where that recipe was skipped these policies admit everyone, exactly as
-- the single policies they replace did, and that is the posture the
-- deployment chose. The proof below therefore asserts AGREEMENT with the seam
-- rather than a flat refusal: after this file a write to either table is
-- admitted exactly when `is_service_account()` says so, whichever body that
-- function carries.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Recipe-only and additive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000128000000 and
-- 21000212000000). A policy's permissiveness cannot be altered in place, so
-- each is dropped and recreated, and the `drop policy if exists` makes a
-- partial re-run idempotent. The order the statements are written in is the
-- one that never widens: see the note above each table.
--
-- The proof stands its own rows up inside subtransactions it then aborts. It
-- can only do so for `cell_touchpoints` where a cell exists to hang one on,
-- so on an empty replay that half says out loud that it was skipped. The
-- populated case is covered where it belongs: `npm run check:seed-load`
-- attempts every one of these writes as an author and again as a viewer,
-- against a seeded database, and never reads `pg_policies`.

-- ─────────────────────────────────────────────────────────────────────────
-- 21000214000000_a_restriction_needs_something_to_restrict.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Twenty restrictive policies stood over verbs no permissive policy opens.
--
-- Under row level security a RESTRICTIVE policy narrows and never admits. A
-- verb with a restrictive policy and no permissive policy therefore matches
-- zero rows for everyone the restriction names — the restriction is standing
-- over a door that was never cut into the wall. Twenty of the forty-six
-- restrictive policies in `public` were in that position. This file removes
-- them and lets the absence of a policy say what it already said.
--
-- ── This is not a security fix ───────────────────────────────────────────
--
-- Nothing that was refused becomes permitted here, and nothing that was
-- permitted was ever in doubt. Read as a patch this file would say the
-- opposite of what is true, so: the posture before it and the posture after
-- it are the same posture, on every database it will ever be replayed
-- against. What changes is that a reader counting policies stops being told
-- a verb is governed when it is simply closed.
--
-- ── What was measured, and where the brief was short ─────────────────────
--
-- Read off a full local replay of the series, `pg_policies` joined to itself:
-- every restrictive policy in `public`, and whether a permissive policy for
-- the same command names any role in common with it.
--
--   audit_findings      delete
--   business_models     delete
--   cell_dependencies   insert · update · delete
--   cells               insert · delete
--   lanes               insert · delete
--   path_steps          insert · update · delete
--   paths               insert · delete
--   phases              insert · delete
--   scenarios           insert · delete
--   steps               insert · delete
--
-- Eleven tables and twenty verbs, not the six tables the ticket named.
-- The six — `cells`, `lanes`, `paths`, `phases`, `scenarios`, `steps` — are
-- the family a reader notices, because each has a permissive UPDATE beside
-- the missing halves and so reads as a table that is half-governed. The other
-- five are the same defect and quieter: `cell_dependencies` and `path_steps`
-- carry no permissive write policy at all, and `audit_findings` and
-- `business_models` are missing only their DELETE. A count of six would have
-- left the schema with five exceptions to the rule this file states.
--
-- ── One loop, and it is the whole cause ──────────────────────────────────
--
-- 20260818002000, the optional service-account tier, loops over thirteen
-- tables and creates all three write policies on each, unconditionally. Its
-- comment says it plainly — "they AND with the permissive policies" — and for
-- nineteen of the thirty-nine there was a permissive policy to AND with. For
-- the other twenty there was not, and there still is not. The loop was
-- written table-wide over a surface that is verb-wide. That is the defect,
-- and it is a defect of expression: no database was ever more open or more
-- closed than its author intended.
--
-- ── Every one of the twenty is RPC-only, and checked as such ─────────────
--
-- The question is not whether the app COULD reach these verbs but whether it
-- does, and the answer was taken from the writers rather than assumed.
-- `scripts/direct-table-writes.mjs` walks `src/` for direct table writes and
-- reports the verbs it finds: `cells`, `lanes`, `paths`, `phases`,
-- `scenarios` and `steps` are UPDATE and nothing else; `audit_findings` is
-- INSERT and UPDATE; `business_models` is UPDATE; `cell_dependencies` and
-- `path_steps` are not written by the app at all. Not one of the twenty
-- verbs above appears.
--
-- What builds and destroys structure instead are the authoring RPCs of
-- 20260818001000 — `upsert_cell`, `delete_cell`, `add_lane`, `remove_lane`,
-- `create_path`, `create_scenario`, `set_cell_dependency`, `set_path_steps`
-- and their siblings. Every one of them is SECURITY DEFINER, and no table
-- here sets FORCE ROW LEVEL SECURITY, so each runs as the function owner and
-- never meets a policy at all; the tier is asserted inside those bodies. A
-- function that were NOT definer would be governed by these policies and the
-- answer for its table would be different — so this was read from
-- `pg_proc.prosecdef` on the replay rather than taken on trust.
--
-- And the grants agree, which is the second and independent reason nothing
-- moves here. `authenticated` holds no privilege at all for any of the
-- twenty: no DELETE on any of the eleven tables, and INSERT only on
-- `audit_findings` and `business_models`, whose INSERT is a full pair and is
-- not touched. Attempted as the role, each of the twenty is refused with
-- 42501 before row level security is consulted. The restrictive policies were
-- inert twice over.
--
-- So all twenty are the ticket's first case — genuinely RPC-only, and the
-- policy is noise. None is the second case. Giving any of them a permissive
-- half would OPEN a direct structural write that
-- docs/connectors/supabase/database.md § Row Level Security rules out in its
-- first bullet: structure goes through RPCs, not tables.
--
-- 21000212000000 reached the same conclusion for `services` and wrote it
-- down: a restrictive policy over a write nobody is admitted to make "would
-- assert nothing and read as though it did", so it gave that table UPDATE
-- only. This file is that decision applied backwards to the ones that already
-- existed.
--
-- ── Which makes the pair convention readable in both directions ──────────
--
-- 21000213000000 settled that a write policy is a PAIR — permissive
-- `<table>_<verb>_auth` for *the panels reach this table directly*, restrictive
-- `<table>_<verb>_service_only` for *and only the editing tier may* — and the
-- reading that earns it: an `_auth` policy with no `_service_only` beside it
-- is a hole. That reading survives a lone permissive policy. It does not
-- survive twenty lone restrictive ones, because a rule of the form "these
-- come in pairs" is worth what its exceptions cost, and eleven tables of
-- exceptions cost all of it. After this file the two halves appear together
-- or not at all, and each absence means one thing: no policy for a verb is
-- the direct write path being closed.
--
-- ── Order, and why there is nothing to sequence ──────────────────────────
--
-- 21000213000000 had to write drop-old · restrictive · permissive so a table
-- was never briefly open. Here there is no such window: only restrictive
-- policies are dropped, dropping a restriction that stands alone leaves the
-- verb closed by RLS's deny-by-default, and no permissive policy is created
-- anywhere in this file. A table is closed for these verbs before the first
-- statement, between every pair of statements, and after the last.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- Recipe-only and subtractive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000212000000 and
-- 21000213000000). `drop policy if exists` makes a partial re-run idempotent
-- and makes the file replay onto a database where the optional tier recipe
-- was deleted and these policies never existed.

-- ─────────────────────────────────────────────────────────────────────────
-- 21000215000000_every_authoring_write_leaves_a_record.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Every authoring write leaves a record, not only the deletes.
-- Authored 2026-09-10. The version is an allocation counter in the reserved
-- band, not the date — see scripts/check-migration-band.mjs.
--
-- CLOSE THE TAB AND THE RECORD OF WHAT CHANGED IS GONE.
--
-- Two recorders exist today and each covers half the story.
--
--   * DELETES are durable. Six `security definer` functions — delete_scenario,
--     delete_path, remove_step, remove_lane, remove_lanes, delete_cell — write
--     every row they are about to destroy into `public.deleted_structure` in
--     the same transaction as the cascade, and return that row's id.
--   * EVERY OTHER AUTHORING WRITE — renames, reorders, cell text, lane specs,
--     evidence, slices, findings, stakeholders — is recorded only in
--     `src/lib/authoringSession.ts`, a module-level JavaScript array. A page
--     refresh empties it.
--
-- So an agent that makes thirty edits and a human who makes thirty edits both
-- leave exactly nothing behind once the tab closes, while a single deleted
-- cell is remembered forever. That asymmetry is not a policy anyone chose; it
-- is what happens when the durable recorder is written as delete-safety rather
-- than as a record of authorship.
--
-- ONE LOG. `public.authoring_changes` records every authoring write. A delete
-- carries the rows it destroyed as its `payload`, exactly as the archive did,
-- so restore still has everything it ever had. `public.trash` is a VIEW over
-- the rows that carry a `deleted_kind`, so the recovery list is a filter on
-- one table rather than a second table that has to be kept in step with it.
-- `deleted_structure` is folded in and dropped rather than renamed: renaming
-- it would leave a table whose name says "deletions" holding renames.
--
-- ---------------------------------------------------------------------------
-- WHO WRITES A ROW, AND WHY THERE ARE TWO WRITERS RATHER THAN ONE
-- ---------------------------------------------------------------------------
--
-- The app appends through `record_authoring_change`, a definer RPC that takes
-- the operation, its arguments, its captured inverse and the author. It takes
-- NO payload and no `deleted_kind` — a client cannot forge a trash entry, and
-- cannot claim to have archived rows it never had.
--
-- The six delete functions append their own row, because the payload has to be
-- captured inside the same transaction as the cascade that destroys it. A
-- client-side append could only ever run afterwards, by which time the rows it
-- was supposed to preserve are gone. So the sweep below rewrites those six
-- bodies to insert into `authoring_changes` instead, naming themselves in the
-- `fn` column, and the client skips its own append for exactly those six
-- operations (`ARCHIVED_BY_THE_DATABASE` in `src/lib/authoringLog.ts`). One
-- write, one row, from whichever side is holding the rows.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- IT IS AUDIT-ONLY. The in-memory stack stays exactly as it is and remains the
-- fast undo affordance; `revert` is stored so a row can SAY what would undo it,
-- not so anything replays it. Replaying an inverse against a database that has
-- moved on is a different problem — the row it names may have been deleted,
-- renamed or reparented since — and it is out of scope on purpose.
--
-- IT DOES NOT RECORD A REVERT AS A CHANGE OF ITS OWN. `executeRevert` passes
-- `record: false` so that undoing "Added a lane" does not append "Deleted a
-- lane" to the very list the row was just removed from, and that argument is
-- unchanged here. The consequence is stated rather than hidden: a revert whose
-- inverse is a delete DOES leave a row, because the delete function writes it
-- server-side; a revert whose inverse is an update leaves none. Making the two
-- agree means separating "not in the undo list" from "not in the log" at every
-- one of the twelve mutation modules that thread `record: false`, which is a
-- change to the undo contract and not to this one.
--
-- IT MISATTRIBUTES ONE CASE, AND SAYS SO. A row written server-side carries
-- `author = 'human'`, because the delete functions have no way to see the
-- client's agent attribution. That is right for every delete the app can make
-- — the agent holds no delete tool at all (`WRITE_TOOL_NAMES` in
-- `src/lib/agent/tools/specs.ts` has none) — and wrong for exactly one path:
-- the agent's `undo_last_change` reverting its own `create_lane`, which fires
-- `remove_lanes` and archives it as a human's delete. Fixing it means passing
-- attribution into six function signatures, which is a wider change than the
-- one defect justifies. It is recorded here so the next reader finds it
-- written down rather than by disbelieving a row.
--
-- NO ROW COUNT IS ASSERTED ANYWHERE BELOW. Every assertion in this file is an
-- invariant that is vacuously true on an empty database and meaningful on a
-- populated one. A migration replays against empty databases — every fresh
-- deployment of this template is one — so a migration that asserts "36 rows
-- moved" fails every empty replay for the rest of time. The one count that IS
-- compared is compared to itself: every archived deletion found is an archived
-- deletion carried forward, which is 0 = 0 on an empty database and n = n on a
-- deployment that has been authored in.
--
-- ---------------------------------------------------------------------------
-- The log.
-- ---------------------------------------------------------------------------
create table if not exists public.authoring_changes (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),

  -- WHO. `author` is the tier, `author_id` is the account, `agent_session_id`
  -- is the agent conversation the write belongs to. Deliberately NOT a foreign
  -- key to `agent_sessions`: an audit row has to outlive the session it names,
  -- and the analysis tier already names cells softly for the same reason.
  author text not null default 'human'
    constraint authoring_changes_author_check check (author in ('human', 'agent')),
  author_id uuid,
  agent_session_id uuid,

  -- WHAT. `fn` is the operation — an authoring RPC name, or one of the
  -- direct-table mutation names the client logs under (`update_cell_content`,
  -- `update_cell_spec`, `update_cell_resources`). `args` is what was sent, ids
  -- and not names, because a name is a thing that changes. `revert` is the
  -- inverse captured at write time where one exists, in the shape
  -- `RevertSpec` — `{fn, args}`.
  fn text not null
    constraint authoring_changes_fn_check check (btrim(fn) <> ''),
  args jsonb not null default '{}'::jsonb
    constraint authoring_changes_args_check check (jsonb_typeof(args) = 'object'),
  revert jsonb
    constraint authoring_changes_revert_check
      check (revert is null or jsonb_typeof(revert) = 'object'),

  -- WHAT A DELETE DESTROYED. Null on every other operation. `payload` is every
  -- deleted row, natural-keyed and in dependency order, so a restore can replay
  -- it through the ordinary create path; `affected_slices` is
  -- [{slice_id, title, cell_keys:[…]}].
  deleted_kind text
    constraint authoring_changes_deleted_kind_check
      check (deleted_kind in ('scenario', 'path', 'lane', 'step', 'cell')),
  label text,
  payload jsonb,
  affected_slices jsonb not null default '[]'::jsonb
    constraint authoring_changes_affected_slices_check
      check (jsonb_typeof(affected_slices) = 'array'),

  -- An agent session names an agent's write and nothing else, in both
  -- directions. Stated as a biconditional rather than an implication because
  -- `author = 'agent'` with no session is the shape that loses the grouping
  -- the change sheet renders, and it would pass a one-way check silently.
  constraint authoring_changes_agent_session_check
    check ((author = 'agent') = (agent_session_id is not null)),

  -- A deletion carries its rows or it is not a deletion. This is the whole of
  -- "deleted rows are restorable from the log", stated where it cannot drift:
  -- a delete recorded without a payload would look identical to a delete
  -- recorded with one until someone tried to restore it.
  constraint authoring_changes_payload_check
    check ((deleted_kind is null) = (payload is null))
);

comment on table public.authoring_changes is
  'Append-only record of every authoring write. Audit-only: the in-memory stack in src/lib/authoringSession.ts is still the undo affordance, and nothing replays `revert` from here. A row with `deleted_kind` set is a deletion and carries the rows it destroyed; `public.trash` is the view over exactly those.';
comment on column public.authoring_changes.fn is
  'The operation: an authoring RPC name, or one of the direct-table mutation names the client logs under. Matches the WriteFn union in src/lib/authoringSession.ts.';
comment on column public.authoring_changes.args is
  'Exactly what was sent. Ids, not names — a name is resolved at render because a name is a thing that changes.';
comment on column public.authoring_changes.revert is
  'The captured inverse, {fn, args}, where one exists. Recorded so a row can say what would undo it. Nothing replays it — see the header.';
comment on column public.authoring_changes.agent_session_id is
  'The agent conversation this write belongs to. No foreign key on purpose: the record has to outlive the session it names.';

create index if not exists authoring_changes_at_idx
  on public.authoring_changes (at desc);
-- The trash view's only access path. Partial, because deletions are the small
-- minority of a log that records every rename and every cell edit.
create index if not exists authoring_changes_deleted_kind_idx
  on public.authoring_changes (deleted_kind, at desc)
  where deleted_kind is not null;
create index if not exists authoring_changes_agent_session_idx
  on public.authoring_changes (agent_session_id)
  where agent_session_id is not null;

-- ---------------------------------------------------------------------------
-- Append-only, enforced rather than promised.
--
-- The grants below already withhold UPDATE and DELETE from every client role,
-- so this trigger is not what stops a browser. It is what stops the definer
-- functions, the service key and a future migration — every writer that is
-- inside the gate the grants describe. A log that the writers can rewrite is
-- a log that says whatever the last writer wanted it to say.
-- ---------------------------------------------------------------------------
create or replace function public.authoring_changes_are_append_only()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  raise exception 'public.authoring_changes is append-only; % is not permitted on it', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists authoring_changes_no_rewrite on public.authoring_changes;
create trigger authoring_changes_no_rewrite
  before update or delete on public.authoring_changes
  for each row execute function public.authoring_changes_are_append_only();

drop trigger if exists authoring_changes_no_truncate on public.authoring_changes;
create trigger authoring_changes_no_truncate
  before truncate on public.authoring_changes
  for each statement execute function public.authoring_changes_are_append_only();


-- ---------------------------------------------------------------------------
-- The client's append.
--
-- Takes the operation, its arguments, its inverse and the author — and nothing
-- else. No payload parameter and no `deleted_kind` parameter, so the one thing
-- a caller here cannot do is claim to have deleted something: a trash entry
-- can only be written by the function that is holding the rows.
-- ---------------------------------------------------------------------------
create or replace function public.record_authoring_change(
  fn text,
  args jsonb default '{}'::jsonb,
  revert jsonb default null,
  author text default 'human',
  agent_session_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  change_id uuid;
begin
  -- The same service-account gate every other write function carries. The
  -- append runs after the write it records, so anyone who got here already
  -- passed it once; carrying it means the log's write surface cannot be
  -- wider than the surface it describes.
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if record_authoring_change.fn is null
     or btrim(record_authoring_change.fn) = '' then
    raise exception 'A recorded change has to name the operation that made it';
  end if;

  insert into public.authoring_changes (fn, args, revert, author, agent_session_id)
  values (
    record_authoring_change.fn,
    coalesce(record_authoring_change.args, '{}'::jsonb),
    record_authoring_change.revert,
    coalesce(record_authoring_change.author, 'human'),
    record_authoring_change.agent_session_id
  )
  returning id into change_id;

  return change_id;
end;
$$;

comment on function public.record_authoring_change(text, jsonb, jsonb, text, uuid) is
  'Append one authoring write to public.authoring_changes. Called by src/lib/authoringLog.ts after the write it records has already succeeded, so the log can never claim a change the database does not have.';


-- ---------------------------------------------------------------------------
-- The six delete functions, redirected.
--
-- A `pg_get_functiondef` sweep rather than six rewritten bodies. The file is
-- not the apply path: a deployment's installed body is whatever the last
-- migration to touch it left there, and several of those were themselves
-- sweeps over renamed relations. Reproducing the bodies here would pick one
-- schema and break every deployment that is on the other. Rewriting the text
-- that is actually installed picks neither.
--
-- The insert is textually identical in all six, which is what makes this
-- safe to do by replacement:
--
--   insert into public.deleted_structure (kind, label, payload, affected_slices)
--   values ('<kind>', …)
--
-- becomes
--
--   insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
--   values ('<function name>', '<kind>', …)
--
-- so each function names itself in the `fn` column. `create or replace` with
-- the definition Postgres itself printed keeps the argument types, and
-- therefore keeps the ACL — a replace that changed the signature would create
-- a second overload with default privileges instead.
--
-- The set is discovered, not listed. A seventh function that archives the
-- same way is swept too, and — because the sweep raises on a shape it does
-- not recognise — a function that references the archive some other way stops
-- the migration instead of being quietly left pointing at a dropped table.
-- ---------------------------------------------------------------------------
do $sweep$
declare
  targets oid[];
  target oid;
  fn_name text;
  fn_def text;
  fn_rewritten text;
begin
  select coalesce(array_agg(p.oid order by p.proname), array[]::oid[])
  into targets
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc like '%public.deleted_structure%';

  foreach target in array targets loop
    select p.proname, pg_get_functiondef(p.oid) into fn_name, fn_def
    from pg_proc p where p.oid = target;

    fn_rewritten := replace(
      fn_def,
      'insert into public.deleted_structure (kind, label, payload, affected_slices)',
      'insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)'
    );
    if fn_rewritten = fn_def then
      raise exception
        'public.% reaches the deletion archive in a shape this sweep does not know', fn_name;
    end if;

    fn_rewritten := regexp_replace(
      fn_rewritten,
      '(insert into public\.authoring_changes \(fn, deleted_kind, label, payload, affected_slices\)\s*values \()',
      '\1' || quote_literal(fn_name) || ', ',
      'g'
    );

    execute fn_rewritten;
  end loop;
end
$sweep$;

-- ---------------------------------------------------------------------------
-- Carry the archived deletions forward, then drop the table they were in.
--
-- `author = 'human'` on every one of them: no attribution was ever recorded
-- for a delete, and the agent has never held a delete tool, so "a person did
-- this" is the true answer rather than the convenient one.
--
-- `args` is `{}` and not a reconstruction. The archive stored the payload and
-- the label and never the call, and inventing plausible arguments for historic
-- deletes would put rows in the log that read exactly like recorded ones and
-- are not.
-- ---------------------------------------------------------------------------
do $carry$
declare
  found int;
  moved int;
begin
  if to_regclass('public.deleted_structure') is null then
    raise notice 'public.deleted_structure is absent — there is nothing to carry forward.';
    return;
  end if;

  select count(*) into found from public.deleted_structure;

  insert into public.authoring_changes
    (at, author, author_id, fn, args, deleted_kind, label, payload, affected_slices)
  select
    d.deleted_at,
    'human',
    d.deleted_by,
    case d.kind
      when 'scenario' then 'delete_scenario'
      when 'path' then 'delete_path'
      when 'step' then 'remove_step'
      when 'lane' then 'remove_lane'
      when 'cell' then 'delete_cell'
    end,
    '{}'::jsonb,
    d.kind,
    d.label,
    d.payload,
    coalesce(d.affected_slices, '[]'::jsonb)
  from public.deleted_structure d;

  get diagnostics moved = row_count;

  -- Compared to itself, so it holds at 0 = 0 on an empty database and at
  -- whatever a deployment carries on that deployment. A literal here would be
  -- a census, and a census fails every empty replay forever.
  if moved <> found then
    raise exception 'carried % of % archived deletions forward', moved, found;
  end if;
end
$carry$;

drop table if exists public.deleted_structure;

-- ---------------------------------------------------------------------------
-- Trash: a filter, not a table.
--
-- The column names are the ones `deleted_structure` used, so every reader of
-- the recovery list is unchanged by this migration except for the relation it
-- names. `security_invoker` because a view created without it reads its base
-- table as the view's OWNER and bypasses that table's row-level security.
-- ---------------------------------------------------------------------------
create or replace view public.trash
  with (security_invoker = true)
as
select
  c.id,
  c.at as deleted_at,
  c.author_id as deleted_by,
  c.deleted_kind as kind,
  c.label,
  c.payload,
  c.affected_slices
from public.authoring_changes c
where c.deleted_kind is not null;

comment on view public.trash is
  'The deletions in public.authoring_changes, in the shape the retired deleted_structure table had. A filter over the one log, so the recovery list cannot drift from the record of what happened.';


-- ---------------------------------------------------------------------------
-- Post-conditions. Every one of them holds on an empty database.
-- ---------------------------------------------------------------------------
do $assert$
declare
  stale text;
  unnamed text;
  bad int;
begin
  -- 1. THE LOG EXISTS AND IS A TABLE.
  if to_regclass('public.authoring_changes') is null then
    raise exception 'public.authoring_changes was not created';
  end if;

  -- 2. THE ARCHIVE IS GONE. Stated separately from the carry-forward above: a
  -- schema holding both would satisfy every other assertion here while leaving
  -- the next author to guess which of the two a deletion is in.
  if to_regclass('public.deleted_structure') is not null then
    raise exception 'public.deleted_structure still exists beside the log that replaced it';
  end if;

  -- 3. TRASH IS A VIEW OVER THE LOG, not a table someone recreated.
  if not exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'trash'
  ) then
    raise exception 'public.trash is not a view';
  end if;

  -- 4. NOTHING STILL POINTS AT THE DROPPED TABLE. A plpgsql body is text
  -- resolved at call time, so a function left naming `deleted_structure` is
  -- deployable and broken until someone deletes a cell.
  select string_agg(p.proname, ', ' order by p.proname) into stale
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%deleted_structure%';
  if stale is not null then
    raise exception 'these functions still name deleted_structure: %', stale;
  end if;

  -- 5. EVERY ARCHIVING FUNCTION NAMES ITSELF IN `fn`. The sweep injects the
  -- function's own name as the first value; this is what proves it landed,
  -- rather than that the relation name changed and the column list did not.
  -- Vacuously true where no function archives.
  select string_agg(p.proname, ', ' order by p.proname) into unnamed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc like '%insert into public.authoring_changes (fn, deleted_kind,%'
    and p.prosrc not like '%values (' || quote_literal(p.proname::text) || ',%';
  if unnamed is not null then
    raise exception 'these functions archive without naming themselves: %', unnamed;
  end if;

  -- 6. THE APPEND-ONLY TRIGGERS ARE INSTALLED. Two of them: rewriting a row
  -- and truncating the table are different statements and one trigger cannot
  -- refuse both.
  select count(*) into bad
  from pg_trigger t
  where t.tgrelid = 'public.authoring_changes'::regclass
    and not t.tgisinternal;
  if bad <> 2 then
    raise exception 'public.authoring_changes carries % append-only triggers, expected 2', bad;
  end if;

  -- 7. THE CLIENT'S APPEND IS SECURITY DEFINER. Without it the insert fails
  -- behind the revoked grant, on the one path that has to work. The other
  -- half of this — that anon cannot reach it — is the host's to enforce and
  -- is asserted in the recipe below.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_authoring_change'
      and p.prosecdef
  ) then
    raise exception 'public.record_authoring_change is missing or is not security definer';
  end if;

  -- 8. NO ROW CONTRADICTS THE TWO INVARIANTS THE CHECKS ENCODE. The
  -- constraints already refuse these, so this asserts the constraints are
  -- present and armed rather than trusting that they are. Zero rows pass it;
  -- so does a populated table.
  select count(*) into bad
  from public.authoring_changes
  where (deleted_kind is null) <> (payload is null)
     or (author = 'agent') <> (agent_session_id is not null);
  if bad <> 0 then
    raise exception '% rows break the payload or attribution invariant', bad;
  end if;
end
$assert$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000216000000_an_actor_can_be_part_of_another.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An actor can be part of another actor.
--
-- The cast list is flat today: eight parties, no relationship between any two
-- of them. A deployment that names its design function on one lane and its
-- design-system function on another cannot ask "what does Design own?" without
-- knowing, outside the database, that the second is inside the first.
--
-- One nullable self-reference fixes that, and it is the whole change. A lane
-- still names ONE actor, the specific one, and the rollup is a join rather
-- than a different way of naming.
--
-- ── Why exactly one level ────────────────────────────────────────────────
--
-- A self-reference with nothing said about depth is an invitation to a cycle,
-- and a cycle turns every rollup into a query that does not finish. Depth is
-- also not free to read: at two levels "what does Design own?" is a recursive
-- CTE, at one it is a single join, and nothing in the model has ever wanted
-- the second.
--
-- So the rule is stated rather than hoped for: a parent has no parent. The
-- trigger enforces it from both directions, because either edit breaks it —
-- pointing at a row that already has a parent, or giving a parent to a row
-- that is already somebody's parent. A `check` cannot see other rows, so it
-- carries only the part that is about this row alone.

alter table public.stakeholders
  add column parent_id uuid references public.stakeholders (id) on delete set null,
  add constraint stakeholders_parent_not_self
    check (parent_id is null or parent_id <> id);

comment on column public.stakeholders.parent_id is
  'The actor this one is part of, or null when it is not part of another. '
  'Exactly one level: a parent has no parent. A lane still names the specific '
  'actor; this is what lets a reader roll those up.';

create function public.stakeholders_parent_is_flat()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null
     and (select parent_id from public.stakeholders where id = new.parent_id)
         is not null then
    raise exception
      'stakeholder % cannot be part of %, which is already part of something else',
      new.name, new.parent_id
      using errcode = 'check_violation';
  end if;

  if new.parent_id is not null
     and exists (select 1
                 from public.stakeholders
                 where parent_id = new.id) then
    raise exception
      'stakeholder % cannot be part of another: other actors are part of it',
      new.name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.stakeholders_parent_is_flat() is
  'Holds the cast list to one level of nesting. Both directions, because '
  'either edit breaks it: taking a parent that has one, or taking a parent '
  'while being one.';

create trigger stakeholders_parent_is_flat
  before insert or update of parent_id on public.stakeholders
  for each row execute function public.stakeholders_parent_is_flat();


do $flat$
declare
  n integer;
begin
  -- An invariant, not a census: whatever rows exist, none of them is two
  -- levels deep. Vacuously true on an empty database, and exactly as strong
  -- on a seeded one.
  select count(*) into n
  from public.stakeholders child
  join public.stakeholders parent on parent.id = child.parent_id
  where parent.parent_id is not null;

  if n <> 0 then
    raise exception 'the cast list is % rows deeper than one level', n;
  end if;
end
$flat$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000217000000_an_actor_is_part_of_another.sql
-- ─────────────────────────────────────────────────────────────────────────

-- `parent_id` says there is a tree. There is not.

-- 21000216000000 gave `stakeholders` a self-reference and held it to exactly
-- one level, then named it `parent_id` — which is the name for the shape, and
-- the shape it names is a tree of any depth. A reader who trusts the name
-- reaches for a recursive CTE, or nests a third level and is refused by a
-- trigger the name gave no warning about.
--
-- Both repositories' prose already had the right word. The column comment
-- says "the actor this one is part of"; the glossary says an actor may be
-- part of another. `part_of_id` names the RELATIONSHIP — membership, which is
-- flat by nature — instead of a graph shape the constraint forbids. It is the
-- same rule the `summary`/`name`/`title` renames settled: the name says the
-- thing.
--
-- Forward-only rather than an amendment to 21000216000000. That migration is
-- released, and a released migration is somebody else's applied history even
-- when it is one version old.
--
-- The dependent names go longhand for the reason the vocabulary migrations
-- documented: a name moved inside dynamic SQL is a name the static readers
-- cannot see, and a retired word nothing can see is a retired word nothing
-- forbids.

alter table public.stakeholders rename column parent_id to part_of_id;

alter table public.stakeholders
  rename constraint stakeholders_parent_not_self to stakeholders_part_of_not_self;

alter index if exists stakeholders_parent_id_fkey rename to stakeholders_part_of_id_fkey;

drop trigger stakeholders_parent_is_flat on public.stakeholders;
drop function public.stakeholders_parent_is_flat();

comment on column public.stakeholders.part_of_id is
  'The actor this one is part of, or null when it is not part of another. '
  'Exactly one level: an actor that is part of something is part of nothing '
  'further. A lane still names the specific actor; this is what lets a reader '
  'roll those up.';

create function public.stakeholders_part_of_is_flat()
returns trigger
language plpgsql
as $$
begin
  if new.part_of_id is not null
     and (select part_of_id from public.stakeholders where id = new.part_of_id)
         is not null then
    raise exception
      'stakeholder % cannot be part of %, which is already part of something else',
      new.name, new.part_of_id
      using errcode = 'check_violation';
  end if;

  if new.part_of_id is not null
     and exists (select 1
                 from public.stakeholders
                 where part_of_id = new.id) then
    raise exception
      'stakeholder % cannot be part of another: other actors are part of it',
      new.name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.stakeholders_part_of_is_flat() is
  'Holds the cast list to one level of nesting. Both directions, because '
  'either edit breaks it: taking a parent that has one, or taking a parent '
  'while being one.';

create trigger stakeholders_part_of_is_flat
  before insert or update of part_of_id on public.stakeholders
  for each row execute function public.stakeholders_part_of_is_flat();


do $flat$
declare
  n integer;
begin
  select count(*) into n
  from public.stakeholders child
  join public.stakeholders parent on parent.id = child.part_of_id
  where parent.part_of_id is not null;

  if n <> 0 then
    raise exception 'the cast list is % rows deeper than one level', n;
  end if;
end
$flat$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000218000000_a_slide_chooses_from_its_images.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A slide chooses from its images; it does not swap one for the other.
--
-- `slides.illustration` held ONE image and, when set, replaced the slide's
-- strip entirely. Two things were wrong with that, and only the second was
-- ever written down.
--
-- The written one: the substitution was silent. `21000115000000` kept the
-- column and said what would settle it — "if it should later become an append
-- to the strip rather than a substitute, that is a change with its own
-- reasoning and its own migration". This is that migration, and append turns
-- out to be the wrong answer too.
--
-- The unwritten one: an author who wants ONE drawn image instead of three
-- fragments is not asking to append, and an author who wants the second frame
-- alone could not ask at all. A slide had exactly two states — all its frames,
-- or one uploaded image — and the useful middle was unreachable.
--
-- So the slide keeps a POOL and chooses from it. The pool is its uploaded
-- illustrations plus the frames of the cells it cites, and the choice names
-- one member of it, or nothing:
--
--   both null            the strip, exactly as today. Still the default, and
--                        still what every existing row does.
--   active_frame_cell_id one cell's frame. Unreachable before this migration.
--   active_illustration  one uploaded image, which is what the old column did.
--
-- ── Why an array of text, not jsonb ──────────────────────────────────────
--
-- `cell_touchpoints.screenshots text[]` is the same thing at a different
-- grain, and 21000119000000 argued it out already: one array column is what
-- the singular and plural fields were always describing, and a single-valued
-- column "would silently drop every entry after the first the day an author
-- used the plural field".
--
-- The old column carried `{src, updated_at}` because the upload path was
-- derived from the slide id and UPSERTED, so a replacement overwrote its
-- predecessor and needed a cache-buster to be seen. A pool does not overwrite:
-- every upload is its own object under its own name, so a new image is a new
-- URL and there is nothing to bust. `updated_at` was solving a problem this
-- shape does not have.
--
-- ── Why the choice is two columns and not one jsonb ──────────────────────
--
-- A frame belongs to a cell, and a cell can be deleted. As a column with a
-- reference, `on delete set null` retires the choice the moment its cell goes
-- and the slide falls back to its strip. The same fact inside a jsonb
-- document is a dangling id that nothing can see, on a slide that renders
-- blank and explains nothing. `num_nonnulls` keeps them mutually exclusive.

alter table public.slides
  add column illustrations text[] not null default '{}'::text[],
  add column active_frame_cell_id uuid references public.cells (id) on delete set null,
  add column active_illustration text;

comment on column public.slides.illustrations is
  'Images an author uploaded for this slide, in author order. The slide''s '
  'pool, not what it shows: what it shows is chosen by the two active_ '
  'columns, and an unused upload is a legitimate resting state.';

comment on column public.slides.active_frame_cell_id is
  'Show this cell''s frame alone. Null with active_illustration null means '
  'show the whole strip.';

comment on column public.slides.active_illustration is
  'Show this uploaded image alone. Must be one of illustrations.';

-- Carry the old column forward: its image becomes the pool's only member, and
-- the choice that reproduces what the slide showed yesterday.
update public.slides
   set illustrations = array[illustration->>'src'],
       active_illustration = illustration->>'src'
 where illustration is not null
   and illustration->>'src' is not null;

alter table public.slides
  add constraint slides_one_active_image
    check (num_nonnulls(active_frame_cell_id, active_illustration) <= 1),
  add constraint slides_active_illustration_is_in_the_pool
    check (active_illustration is null or active_illustration = any (illustrations));

alter table public.slides drop column illustration;


do $chosen$
declare
  n integer;
begin
  -- Invariants, not censuses. Vacuously true on an empty database.
  select count(*) into n from public.slides
   where active_illustration is not null
     and not (active_illustration = any (illustrations));
  if n <> 0 then
    raise exception '% slide(s) show an image that is not in their pool', n;
  end if;

  select count(*) into n from public.slides
   where active_frame_cell_id is not null and active_illustration is not null;
  if n <> 0 then
    raise exception '% slide(s) claim to show two images at once', n;
  end if;
end
$chosen$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000219000000_a_slides_prose_is_a_caption.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A slide's prose is a caption.
--
-- `slides.narrative` named the sentence a reader meets under the images as if
-- it were a story the slide told. It is the words under the pictures: a
-- caption. The column moves and nothing else does — no behaviour change, no
-- drop, no add.

alter table public.slides rename column narrative to caption;

comment on column public.slides.caption is
  'The sentence a reader meets under this slide''s images. Authored content, '
  'not a story the slide tells.';


do $caption$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'slides'
       and column_name = 'narrative'
  ) then
    raise exception 'slides.narrative is still there';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'slides'
       and column_name = 'caption'
  ) then
    raise exception 'slides.caption is not there';
  end if;
end
$caption$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000220000000_a_slide_shows_a_set_of_its_cells_frames.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A slide shows an ordered set of its cells' frames.
--
-- `21000218000000` gave a slide a pool and a single choice: all its frames,
-- or one member. The useful middle — some of the frames, in an order the
-- author chose, including none — was still unreachable, and an upload still
-- replaced the board rather than joining it.
--
-- The set is a table. Each member names exactly one source: a cited cell, or
-- (from the next ticket) an uploaded URL. `shows_all_images` is the
-- untouched default; the first tick writes rows and clears it.

alter table public.slides
  add column shows_all_images boolean not null default true;

comment on column public.slides.shows_all_images is
  'True until an author ticks or unticks the set. True means show every '
  'cited cell''s frame and keep doing so as the board changes. False means '
  'show exactly slide_images, including none.';

create table public.slide_images (
  id        uuid primary key default gen_random_uuid(),
  slide_id  uuid not null references public.slides (id) on delete cascade,
  position  integer not null,
  cell_id   uuid references public.cells (id) on delete cascade,
  image_url text,
  constraint slide_images_one_source
    check (num_nonnulls(cell_id, image_url) = 1),
  constraint slide_images_position_unique unique (slide_id, position)
);

comment on table public.slide_images is
  'The ordered set of images a slide shows once an author has chosen. '
  'Empty with slides.shows_all_images false is "show nothing"; empty with '
  'shows_all_images true is the untouched default and is not stored.';

comment on column public.slide_images.cell_id is
  'Show this cell''s frame. Cascades away if the cell is deleted.';

comment on column public.slide_images.image_url is
  'Show this uploaded image. Unused until a slide can carry uploads in the set.';

-- Carry the single choice forward as a one-member set.
insert into public.slide_images (slide_id, position, cell_id)
select id, 0, active_frame_cell_id
  from public.slides
 where active_frame_cell_id is not null;

insert into public.slide_images (slide_id, position, image_url)
select id, 0, active_illustration
  from public.slides
 where active_illustration is not null;

update public.slides
   set shows_all_images = false
 where active_frame_cell_id is not null
    or active_illustration is not null;

alter table public.slides
  drop constraint if exists slides_one_active_image,
  drop constraint if exists slides_active_illustration_is_in_the_pool;

alter table public.slides
  drop column illustrations,
  drop column active_frame_cell_id,
  drop column active_illustration;


do $rehearse$
declare
  svc uuid;
  ph uuid;
  sc uuid;
  pa uuid;
  ln uuid;
  st uuid;
  c1 uuid;
  c2 uuid;
  slc uuid;
  sld uuid;
  n integer;
  refused boolean;
begin
  insert into public.services (name) values ('slide-images-rehearsal') returning id into svc;
  insert into public.phases (service_id, name, position) values (svc, 'p', 0) returning id into ph;
  insert into public.scenarios (phase_id, name, position) values (ph, 's', 0) returning id into sc;
  insert into public.paths (scenario_id, name, kind) values (sc, 'happy', 'happy') returning id into pa;
  insert into public.lanes (path_id, name, position) values (pa, 'lane', 0) returning id into ln;
  insert into public.steps (scenario_id, name) values (sc, 'step') returning id into st;
  insert into public.path_steps (path_id, step_id, position) values (pa, st, 0);
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'one', 0) returning id into c1;
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'two', 1) returning id into c2;
  insert into public.slices (service_id, kind, title)
  values (svc, 'custom', 'rehearsal') returning id into slc;
  insert into public.slides (slice_id, position, cell_ids, cell_keys, shows_all_images)
  values (slc, 0, array[c1, c2], array['k1','k2'], false)
  returning id into sld;

  -- Mixed set accepted.
  insert into public.slide_images (slide_id, position, cell_id, image_url)
  values (sld, 0, c1, null),
         (sld, 1, null, 'https://example.com/a.png');

  -- Both sources refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id, image_url)
    values (sld, 2, c2, 'https://example.com/b.png');
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'both sources were accepted';
  end if;

  -- Neither refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id, image_url)
    values (sld, 3, null, null);
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'neither source was accepted';
  end if;

  -- Duplicate position refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id)
    values (sld, 0, c2);
  exception
    when unique_violation then refused := true;
  end;
  if not refused then
    raise exception 'duplicate position was accepted';
  end if;

  -- Deleting a cell removes only its own member.
  delete from public.cells where id = c1;
  select count(*) into n from public.slide_images where slide_id = sld;
  if n <> 1 then
    raise exception 'deleting a cell removed % members, expected 1 remaining', n;
  end if;
  if exists (select 1 from public.slide_images where slide_id = sld and cell_id = c1) then
    raise exception 'the deleted cell''s member is still there';
  end if;

  delete from public.services where id = svc;
end
$rehearse$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000221000000_unciting_a_cell_drops_it_from_the_set.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Un-citing a cell drops that cell from the slide's image set.
--
-- `slide_images.cell_id` members are a choice about cells THIS slide cites.
-- When `cell_ids` loses a cell, that member has nothing to show and is
-- deleted. Other members keep their positions. `shows_all_images` is not
-- touched: an authored empty set stays an authored empty set, not the
-- untouched default. Citing the cell again does not put the member back.

create function public.slide_images_drop_uncited_cells()
returns trigger
language plpgsql
as $$
begin
  if new.cell_ids is not distinct from old.cell_ids then
    return new;
  end if;
  delete from public.slide_images
   where slide_id = new.id
     and cell_id is not null
     and not (cell_id = any (coalesce(new.cell_ids, '{}'::uuid[])));
  return new;
end;
$$;

comment on function public.slide_images_drop_uncited_cells() is
  'When a slide''s cell_ids change, drop slide_images rows whose cell is no '
  'longer cited. Positions of remaining members are left as they are.';

create trigger slides_drop_uncited_slide_images
  after update of cell_ids on public.slides
  for each row execute function public.slide_images_drop_uncited_cells();


do $uncite$
declare
  svc uuid;
  ph uuid;
  sc uuid;
  pa uuid;
  ln uuid;
  st uuid;
  c1 uuid;
  c2 uuid;
  c3 uuid;
  slc uuid;
  sld uuid;
  n integer;
  p integer;
begin
  insert into public.services (name) values ('slide-uncite-rehearsal') returning id into svc;
  insert into public.phases (service_id, name, position) values (svc, 'p', 0) returning id into ph;
  insert into public.scenarios (phase_id, name, position) values (ph, 's', 0) returning id into sc;
  insert into public.paths (scenario_id, name, kind) values (sc, 'happy', 'happy') returning id into pa;
  insert into public.lanes (path_id, name, position) values (pa, 'lane', 0) returning id into ln;
  insert into public.steps (scenario_id, name) values (sc, 'step') returning id into st;
  insert into public.path_steps (path_id, step_id, position) values (pa, st, 0);
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'one', 0) returning id into c1;
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'two', 1) returning id into c2;
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'three', 2) returning id into c3;
  insert into public.slices (service_id, kind, title)
  values (svc, 'custom', 'rehearsal') returning id into slc;
  insert into public.slides (slice_id, position, cell_ids, cell_keys, shows_all_images)
  values (slc, 0, array[c1, c2, c3], array['k1','k2','k3'], false)
  returning id into sld;

  insert into public.slide_images (slide_id, position, cell_id, image_url)
  values (sld, 0, c1, null),
         (sld, 1, null, 'https://example.com/a.png'),
         (sld, 2, c2, null),
         (sld, 3, c3, null);

  -- Un-cite c2; c1, the upload, and c3 remain, at their original positions.
  update public.slides
     set cell_ids = array[c1, c3],
         cell_keys = array['k1','k3']
   where id = sld;

  select count(*) into n from public.slide_images where slide_id = sld;
  if n <> 3 then
    raise exception 'unciting one cell left % members, expected 3', n;
  end if;
  if exists (select 1 from public.slide_images where slide_id = sld and cell_id = c2) then
    raise exception 'the uncited cell''s member is still there';
  end if;
  select position into p from public.slide_images where slide_id = sld and cell_id = c3;
  if p <> 3 then
    raise exception 'remaining member was reindexed to %, expected 3', p;
  end if;
  select position into p from public.slide_images
   where slide_id = sld and image_url = 'https://example.com/a.png';
  if p <> 1 then
    raise exception 'upload member was reindexed to %, expected 1', p;
  end if;

  -- Re-citing c2 does not put the member back.
  update public.slides
     set cell_ids = array[c1, c2, c3],
         cell_keys = array['k1','k2','k3']
   where id = sld;
  if exists (select 1 from public.slide_images where slide_id = sld and cell_id = c2) then
    raise exception 're-citing a cell resurrected its image member';
  end if;

  -- Un-cite every remaining cell member; the flag stays false (chose nothing).
  update public.slides
     set cell_ids = '{}'::uuid[],
         cell_keys = '{}'::text[]
   where id = sld;
  select count(*) into n from public.slide_images
   where slide_id = sld and cell_id is not null;
  if n <> 0 then
    raise exception 'unciting every cell left % cell members', n;
  end if;
  if exists (
    select 1 from public.slides where id = sld and shows_all_images
  ) then
    raise exception 'emptying the set flipped the slide back to untouched';
  end if;
  select count(*) into n from public.slide_images where slide_id = sld;
  if n <> 1 then
    raise exception 'the upload member was dropped with the cells';
  end if;

  delete from public.services where id = svc;
end
$uncite$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000222000000_an_upload_joins_the_slide_set.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An uploaded image is a member of the same set as a cell's frame.

comment on column public.slide_images.image_url is
  'Show this uploaded image. It joins the slide''s set; it does not replace '
  'the cited cells'' frames.';


do $upload$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'slide_images'
       and column_name = 'image_url'
  ) then
    raise exception 'slide_images.image_url is not there';
  end if;
end
$upload$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000223000000_a_lane_position_is_unique_within_its_path.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A lane's position is unique within its path, and the check is deferred.

-- ONE PLACE IN THE TREE ALREADY BELIEVED THIS RULE EXISTED, and it was wrong.
--
-- `src/lib/authoringErrors.ts` matched a constraint name to say "Two lanes
-- ended up in the same position." No object has ever carried that name. The
-- thing on those two columns is `lanes_path_row_idx` — a plain, non-unique
-- index created by `20260716200000` as `layers_path_row_idx` and carried
-- through the vocabulary renames — so the branch could not fire, and an author
-- who put two lanes in one slot got no message at all, because nothing refused
-- the write in the first place.
--
-- A matcher on a name nothing carries is dead text, and there are only two
-- honest ways out: delete the entry, or make the rule real. Renaming it onto
-- `lanes_path_row_idx` would be neither — a non-unique index raises nothing,
-- so the entry would still be dead and would now also claim a rule the schema
-- does not have.
--
-- This file is the rule, and it is the last of its kind rather than the first.
-- Five constraints already say "one row per slot in its parent" DEFERRABLE
-- INITIALLY DEFERRED: `path_steps_path_column_unique`, made deferrable by
-- `20260818000000` on the grounds that "the RPCs do the shifting in one
-- transaction, and a deferrable constraint makes that safe rather than lucky";
-- `slides_position_unique`; `cell_touchpoints_cell_position_unique`;
-- `resources_touchpoint_position_unique`; and the `resources_cell_position_unique`
-- exclusion. Lanes were the remaining table with an editor that renumbers and
-- no rule saying what the numbering means.

-- ---------------------------------------------------------------------------
-- DEFERRABLE INITIALLY DEFERRED, BECAUSE EVERY REORDER TRANSIENTLY COLLIDES.
-- ---------------------------------------------------------------------------
--
-- Not belt and braces. An immediate constraint breaks both write paths that
-- move lanes, and both break on ordinary use:
--
--   `reorder_lanes(scenario_id, lane_names[])` is a plpgsql loop issuing one
--   `update … set position = i - 1` per name, all inside the single
--   transaction of the function call. Swap two adjacent lanes and the first
--   statement writes a position the second has not vacated yet. Immediate, it
--   fails there — on the ordinary move a person makes by dragging a lane.
--
--   `add_lane(…, at_position)` opens the slot with one statement, `update
--   public.lanes set position = position + 1 … where position >= target`. A
--   plain UPDATE is checked as each row is written, not at the end, so an
--   n-row shift collides with itself at the first row even though its final
--   state is unique. One statement is not one check.
--
-- Deferral is also what makes the error message worth having: the only way a
-- caller can see this violation is a move that SETTLED on two lanes in one
-- slot, never a move passing through one.
--
-- WHAT IT DOES NOT ASSERT: contiguity. `remove_lane` and `remove_lanes` delete
-- without renumbering, so a path may legally run 0,1,2,4,5. A gap is a display
-- ordering with a hole in it; a duplicate is two lanes claiming one slot.
--
-- ONE COST, NAMED: a deferrable unique index cannot be an `on conflict`
-- arbiter. Nothing infers on (path_id, position), and nothing upserts a lane at
-- all — `supabase/seed.sql` inserts its lanes plainly, and the RPCs that insert
-- lanes (`add_lane`, `create_path`, `create_scenario`, `duplicate_path`,
-- `duplicate_scenario`) carry no `on conflict` either.

-- ---------------------------------------------------------------------------
-- Precondition. The ALTER would fail on its own with a bare unique_violation
-- naming one pair; this says how many, and stops before the DDL. A consumer
-- replaying onto their own data is who this is for.
-- ---------------------------------------------------------------------------
do $precondition$
declare
  dupes int;
  worst text;
begin
  select count(*) into dupes from (
    select path_id, position from public.lanes
    group by path_id, position having count(*) > 1
  ) d;

  if dupes > 0 then
    select string_agg(format('%s@%s×%s', path_id, position, n), ', ')
      into worst
    from (
      select path_id, position, count(*) as n from public.lanes
      group by path_id, position having count(*) > 1
      order by count(*) desc limit 5
    ) d;
    raise exception '% colliding (path_id, position) pairs: %', dupes, worst
      using hint = 'Repair the data first — which lane keeps the slot is an authoring decision, not a schema one.';
  end if;
end
$precondition$;

alter table public.lanes
  drop constraint if exists lanes_path_position_unique;
alter table public.lanes
  add constraint lanes_path_position_unique
    unique (path_id, position) deferrable initially deferred;

comment on constraint lanes_path_position_unique on public.lanes is
  'One lane per slot in a path. Deferred because reorder_lanes renumbers one '
  'statement per lane and add_lane opens a slot with a single self-colliding '
  'UPDATE; both are checked at commit, not mid-flight.';

-- `lanes_path_row_idx` goes: the constraint's own index covers (path_id,
-- position) leading-first, so the old one is a second copy of the same tree for
-- every lane write to maintain — and it is the object whose name was mistaken
-- for a constraint. `lanes_path_id_idx` stays; a leading-column index is a size
-- trade-off that predates this file, not a duplicate of it.
drop index if exists public.lanes_path_row_idx;

-- ---------------------------------------------------------------------------
-- Post-conditions. The shape, then the behaviour — the behaviour proved by
-- performing it on a fixture that is rolled back before this block returns.
-- ---------------------------------------------------------------------------
do $assert$
declare
  con      record;
  cols     text;
  n        int;
  svc      uuid;
  phase    uuid;
  scen     uuid;
  pth      uuid;
  lane_a   uuid;
  lane_b   uuid;
  refused  boolean := false;
  msg      text;
begin
  -- 1. IT EXISTS, AS A UNIQUE CONSTRAINT ON EXACTLY (path_id, position).
  select c.conname, c.contype, c.condeferrable, c.condeferred
    into con
  from pg_constraint c
  join pg_class t     on t.oid = c.conrelid
  join pg_namespace s on s.oid = t.relnamespace
  where s.nspname = 'public' and t.relname = 'lanes'
    and c.conname = 'lanes_path_position_unique';

  if not found then
    raise exception 'lanes_path_position_unique is not on public.lanes';
  end if;
  if con.contype <> 'u' then
    raise exception 'lanes_path_position_unique is contype %, not a unique constraint', con.contype;
  end if;

  -- Column ORDER, not just membership: (position, path_id) would be a
  -- different index and the same constraint, and the wrong one for the
  -- path-scoped reads every board load makes.
  select string_agg(a.attname, ',' order by k.ord) into cols
  from pg_constraint c
  join pg_class t     on t.oid = c.conrelid
  join pg_namespace s on s.oid = t.relnamespace
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where s.nspname = 'public' and t.relname = 'lanes'
    and c.conname = 'lanes_path_position_unique';
  if cols is distinct from 'path_id,position' then
    raise exception 'lanes_path_position_unique covers (%), expected (path_id,position)', cols;
  end if;

  -- 2. IT IS DEFERRABLE, AND DEFERRED BY DEFAULT. Deferrable-but-immediate
  -- would pass every shape check above and still fail every drag of a lane,
  -- because nothing in the RPCs issues `set constraints`.
  if not con.condeferrable then
    raise exception 'lanes_path_position_unique is not deferrable: reorder_lanes would fail on its first swap';
  end if;
  if not con.condeferred then
    raise exception 'lanes_path_position_unique is deferrable but not INITIALLY DEFERRED, and no caller defers it';
  end if;

  -- 3. THE DUPLICATE INDEX IS GONE, and exactly one index now covers the pair.
  select count(*) into n
  from pg_index i
  join pg_class t on t.oid = i.indrelid
  join pg_namespace s on s.oid = t.relnamespace
  where s.nspname = 'public' and t.relname = 'lanes'
    and (select string_agg(a.attname, ',' order by k.ord)
         from unnest(i.indkey::int[]) with ordinality as k(attnum, ord)
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
        = 'path_id,position';
  if n <> 1 then
    raise exception 'expected exactly one index on (path_id, position), found %', n;
  end if;

  -- 4. NO LIVE ROW VIOLATES IT. The ALTER validated the table or it would not
  -- have returned, so this states the fact rather than testing it — and it is
  -- here because a replay onto dirty data is the case where this file must be
  -- read, not trusted.
  select count(*) into n from (
    select path_id, position from public.lanes
    group by path_id, position having count(*) > 1
  ) d;
  if n <> 0 then
    raise exception '% colliding lane positions survived the constraint', n;
  end if;

  -- 5. THE BEHAVIOUR, PERFORMED. Everything below happens on a fixture built
  -- here and rolled back by the sentinel at the end of the block — nothing
  -- touches a real lane, and nothing survives this migration.
  begin
    insert into public.services (name)
      values ('lane-position fixture') returning id into svc;
    insert into public.phases (service_id, name)
      values (svc, 'fixture phase') returning id into phase;
    insert into public.scenarios (phase_id, name)
      values (phase, 'fixture scenario') returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.lanes (path_id, name, position)
      values (pth, 'A', 0) returning id into lane_a;
    insert into public.lanes (path_id, name, position)
      values (pth, 'B', 1) returning id into lane_b;

    -- 5a. A REORDER THAT COLLIDES MID-FLIGHT SUCCEEDS. This is the exact shape
    -- of `reorder_lanes`: one UPDATE per lane, in the loop's order, inside one
    -- transaction. After the first statement both lanes hold position 0.
    update public.lanes set position = 0 where id = lane_b;

    select count(*) into n from public.lanes
    where path_id = pth and position = 0;
    if n <> 2 then
      raise exception 'the fixture did not collide (% lanes at position 0): the proof below would be vacuous', n;
    end if;

    update public.lanes set position = 1 where id = lane_a;

    -- `set constraints … immediate` runs the deferred check now. Reaching the
    -- next line is the proof: the transient duplicate above was tolerated and
    -- the settled state is accepted.
    set constraints public.lanes_path_position_unique immediate;

    select string_agg(name, '' order by position) into msg
    from public.lanes where path_id = pth;
    if msg <> 'BA' then
      raise exception 'the swap did not settle as B,A but as %', msg;
    end if;

    -- 5b. AND `add_lane`'S SHIFT — one UPDATE moving both rows at once, which
    -- is the shape an immediate constraint refuses row-by-row.
    set constraints public.lanes_path_position_unique deferred;
    update public.lanes set position = position + 1 where path_id = pth;
    set constraints public.lanes_path_position_unique immediate;

    -- 5c. A GENUINE DUPLICATE AT COMMIT STILL FAILS. Same statements, same
    -- deferral — the only difference is that this one does not settle.
    set constraints public.lanes_path_position_unique deferred;
    begin
      update public.lanes set position = 1 where id in (lane_a, lane_b);
      set constraints public.lanes_path_position_unique immediate;
      raise exception 'two lanes committed to the same position: the constraint is not enforcing';
    exception when unique_violation then
      refused := true;
    end;
    if not refused then
      raise exception 'the deferred check accepted two lanes in one slot';
    end if;

    -- Roll the fixture back. Everything since the BEGIN above goes with it;
    -- the DDL is outside this subtransaction and stays.
    raise exception using errcode = 'P0001', message = 'lane-position fixture rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'lane-position fixture rollback' then raise; end if;
  end;

  if not refused then
    raise exception 'the duplicate-at-commit case never ran';
  end if;

  if exists (select 1 from public.services where name = 'lane-position fixture') then
    raise exception 'the fixture survived the rollback';
  end if;
end
$assert$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000225000000_a_comment_is_prose_that_ships_to_agents.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A comment is prose that ships to agents.
--
-- Authored 2026-09-10. The version is an allocation counter, not a date.
--
-- The agent-facing schema section is rendered from `pg_description` rather
-- than written a third time beside the catalog. PostgREST exposes
-- `pg_catalog` to no role — not anon, not service_role — so a generator
-- talking to the Data API has no way to read a comment under any key.
-- `schema_comments()` is that way: every table, view and column comment in
-- public, SECURITY INVOKER (the catalog is already readable; there is
-- nothing to escalate), granted to the roles a connected deployment's anon
-- key can hold.
--
-- A deployment with a database runs `npm run agent-account` to splice the
-- result into its account; with no database connected nothing is generated.
-- The function itself is core — any Postgres can answer it. Who may call it
-- over PostgREST is the recipe's.


create or replace function public.schema_comments()
returns table (relation text, column_name text, comment text)
language sql
stable
set search_path = pg_catalog
as $$
  select c.relname::text,
         null,
         obj_description(c.oid, 'pg_class')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm')
     and obj_description(c.oid, 'pg_class') is not null
  union all
  select c.relname::text,
         a.attname::text,
         col_description(c.oid, a.attnum)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm')
     and col_description(c.oid, a.attnum) is not null
$$;

comment on function public.schema_comments() is
  'Every table, view and column comment in public. A comment is prose that ships to agents, so the agent-account generator renders the schema section from it rather than restating the catalog.';

do $proof$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.schema_comments();
  if v_rows = 0 then
    raise exception 'proof: schema_comments() returned no comment';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000226000000_a_dependency_can_be_edited_where_it_sits.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A dependency can be edited where it sits.
--
-- Authored 2026-09-11.
--
-- `set_cell_dependency` upserts on `cell_dependencies_source_target_kind_unique`,
-- so the three things a connection row shows do not edit alike through it:
--
--     note    the upsert updates it                        — correct
--     kind    a different kind is a different conflict key  — INSERTS A SECOND ROW
--     target  a different target is a different key too     — INSERTS A SECOND ROW
--
-- The first row is neither updated nor removed. It is orphaned, and the board
-- keeps drawing it. That never showed while the panel could only add a
-- connection or remove one — an author who wanted a different connection
-- removed the old one and added another. The panel now edits a row where it
-- sits, and that needs a write that means "this row, differently".
--
-- Two calls — clear then set — are not that. They are two transactions, so a
-- failure between them destroys the edge, and they leave two ledger entries
-- whose undo only half works.
--
-- ── WHAT IT RETURNS, AND WHY IT IS NOT THE ID ─────────────────────────────
--
-- The row AS IT STOOD, captured and locked before the write, so the client
-- can record an inverse keyed on the dependency's own id: the undo restores
-- THIS row, not a look-alike that happens to join the same two cells by the
-- time it runs. The inverse is this same function pointed at the values it
-- returned. Every argument it takes is in that row, so nothing an edit can
-- change is left out of its undo.
--
-- One asymmetry, stated rather than hidden: the function trims the note on
-- the way in, so undoing an edit of an imported row whose note carried
-- leading or trailing space puts the words back without the space.
--
-- ── WHY `note` IS AN ARGUMENT AND `name` IS NOT ───────────────────────────
--
-- `note` is the connection's one prose field, the one the row reads back. It
-- has to travel with the kind and the target or a kind change would silently
-- discard it, and it has to come back in the returned row or the undo
-- restores an edge with its words missing. `name` is the badge spelling the
-- panel neither shows nor writes. This function neither reads nor writes it,
-- so an edit leaves it exactly as the row held it; `set_cell_dependency` and
-- `restore_cell_dependency` still carry it for the callers that do.
--
-- ── WHY EVERY ARGUMENT IS REQUIRED ────────────────────────────────────────
--
-- On the sibling every argument but the two cells has a default, and here a
-- default would make an omitted argument a silent erase: an update that was
-- told nothing about the note would clear it. Required, an omitted argument
-- is a PostgREST "function does not exist" — loud, at the first call, rather
-- than quiet at every one.
--
-- ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
--
-- It does not move an edge's SOURCE. A cell edits only the connections it is
-- the source of; a connection that should leave a different cell is a
-- different connection, and is removed and added.


create or replace function public.update_cell_dependency(
  dependency_id uuid,
  kind text,
  target_cell_id uuid,
  note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  previous public.cell_dependencies;
  source_path uuid;
  target_path uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  -- Locked, because every check below is read-then-write: without the lock
  -- two concurrent edits of one row can both pass the uniqueness check, and
  -- the second meets the constraint instead of the sentence.
  select d.* into previous
    from public.cell_dependencies d
   where d.id = update_cell_dependency.dependency_id
   for update;
  if previous.id is null then
    raise exception 'That connection no longer exists';
  end if;

  -- The checks `set_cell_dependency` makes, asked of the row's own source
  -- rather than of an argument.
  if update_cell_dependency.kind not in ('leads_to', 'enables') then
    raise exception 'Unknown dependency kind %', update_cell_dependency.kind;
  end if;
  if previous.source_cell_id = update_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;

  select c.path_id into source_path from public.cells c
    where c.id = previous.source_cell_id;
  select c.path_id into target_path from public.cells c
    where c.id = update_cell_dependency.target_cell_id;
  if source_path is null or target_path is null then
    raise exception 'Both cells must exist';
  end if;
  -- Arrows are drawn within one path's grid; a cross-path arrow has nowhere
  -- to render and is what validate_ir.py rejects on import.
  if source_path <> target_path then
    raise exception 'Both cells must be in the same path of the journey';
  end if;

  -- The one check the sibling does not need, because its upsert absorbs the
  -- collision and this update meets it. Said in the panel's words rather than
  -- as a constraint name.
  if exists (
    select 1 from public.cell_dependencies d
     where d.source_cell_id = previous.source_cell_id
       and d.target_cell_id = update_cell_dependency.target_cell_id
       and d.kind = update_cell_dependency.kind
       and d.id <> previous.id
  ) then
    raise exception 'That connection already exists';
  end if;

  update public.cell_dependencies d
     set target_cell_id = update_cell_dependency.target_cell_id,
         kind = update_cell_dependency.kind,
         note = nullif(btrim(update_cell_dependency.note), '')
   where d.id = previous.id;

  return jsonb_build_object(
    'id', previous.id,
    'source_cell_id', previous.source_cell_id,
    'target_cell_id', previous.target_cell_id,
    'kind', previous.kind,
    'note', previous.note
  );
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC on every function it creates, on any
-- Postgres, so this revoke is the core's half.
revoke execute on function public.update_cell_dependency(uuid, text, uuid, text) from public;


-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
-- Five claims, none of them readable off the definition above:
--
--   1. a kind change leaves exactly ONE row, and so does a target change —
--      the defect this function exists to fix, and the one a future rewrite
--      back onto the upsert would silently reintroduce;
--   2. `leads_to` and `enables` stay distinguishable ACROSS such a change, so
--      an edge moved between them stops and starts being drawn. `leads_to` is
--      what the canvas's arrow layer filters on, so this is the data half of
--      the asymmetry the panel renders;
--   3. the returned row is the row AS IT STOOD — checked on the first call,
--      whose before-state has since been overwritten twice — and the edit
--      leaves the `name` column as it was;
--   4. the undo, performed, by feeding each returned row straight back in;
--   5. an edit onto a connection that already exists, and an edit of one that
--      is gone, each fail with the sentence the panel shows.
--
-- The fixture is built and given back inside a sentinel-exception block: a
-- migration may prove a thing, and may not leave the rows it proved it with.
do $edit_in_place$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  stp uuid;
  lane_a uuid;
  lane_b uuid;
  lane_c uuid;
  cell_a uuid;
  cell_b uuid;
  cell_c uuid;
  dep uuid;
  before_kind_change jsonb;
  before_target_change jsonb;
  rows_now integer;
  drawn integer;
  final_kind text;
  final_target uuid;
  final_note text;
  final_name text;
  done boolean := false;
  msg text;
begin
  -- Can this environment hold a service claim at all?
  --
  -- Everything below goes through `update_cell_dependency`, which refuses an
  -- account that is not the service account. On Supabase, on the shim, and on
  -- a stock replay where the core's `is_service_account()` is `select true`,
  -- the claim set inside the fixture is enough. Where it is not, the proof is
  -- skipped rather than faked: reaching past the guard to prove the statements
  -- underneath would prove a copy of the function instead of the function.
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'edit-in-place proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    -- The claim the function's first line asks for. A GUC, not a role: the
    -- core replays onto a stock Postgres where `authenticated` is not a role,
    -- and on the seed-load path the core runs before the recipe has granted
    -- it anything. The grants above are the recipe's, and a deployment proves
    -- them by calling the function as the role it signs in as.
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('edit-in-place fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.steps (scenario_id, name)
      values (scen, 'fixture step') returning id into stp;
    insert into public.path_steps (path_id, step_id, position)
      values (pth, stp, 0);
    -- Three lanes rather than three cells in one: the grid holds one cell per
    -- square.
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane A', 0) returning id into lane_a;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane B', 1) returning id into lane_b;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane C', 2) returning id into lane_c;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_a, stp, 'fixture source') returning id into cell_a;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_b, stp, 'fixture target') returning id into cell_b;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_c, stp, 'fixture other target') returning id into cell_c;

    insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, name, note)
      values (cell_a, cell_b, 'leads_to', 'a badge nobody draws', 'the note it arrived with')
      returning id into dep;

    -- 1. A KIND CHANGE. One row before, one row after, the same row.
    before_kind_change :=
      public.update_cell_dependency(dep, 'enables', cell_b, 'the note it arrived with');
    select count(*) into rows_now
      from public.cell_dependencies where source_cell_id = cell_a;
    if rows_now <> 1 then
      raise exception 'a kind change left % rows, expected 1', rows_now;
    end if;

    -- 2. AND THE ASYMMETRY MOVED WITH IT. `leads_to` draws, `enables` does
    -- not; the edge is now the kind that does not draw.
    select count(*) into drawn
      from public.cell_dependencies
     where source_cell_id = cell_a and kind = 'leads_to';
    if drawn <> 0 then
      raise exception 'an edge changed to enables still counts as drawn (% rows)', drawn;
    end if;

    -- A TARGET CHANGE. Still one row, and still the same one.
    before_target_change :=
      public.update_cell_dependency(dep, 'enables', cell_c, 'a different note');
    select count(*) into rows_now
      from public.cell_dependencies where source_cell_id = cell_a;
    if rows_now <> 1 then
      raise exception 'a target change left % rows, expected 1', rows_now;
    end if;
    if not exists (select 1 from public.cell_dependencies where id = dep) then
      raise exception 'the edited row is gone; the edit replaced it rather than changing it';
    end if;

    -- 3. WHAT CAME BACK IS THE ROW AS IT STOOD, checked on the FIRST call: a
    -- function returning the row as it now stands would agree with the row on
    -- the second call and only disagree here.
    if before_kind_change ->> 'kind' <> 'leads_to'
       or (before_kind_change ->> 'note') <> 'the note it arrived with'
       or (before_kind_change ->> 'id')::uuid <> dep
       or (before_kind_change ->> 'target_cell_id')::uuid <> cell_b then
      raise exception 'the returned row is not the row as it stood: %', before_kind_change;
    end if;
    select d.name into final_name from public.cell_dependencies d where d.id = dep;
    if final_name is distinct from 'a badge nobody draws' then
      raise exception 'the name did not survive the edit (now %)', coalesce(final_name, '<null>');
    end if;

    -- 4. THE UNDO, PERFORMED — as the ledger performs it, newest first, each
    -- inverse the function pointed at the row it returned.
    perform public.update_cell_dependency(
      (before_target_change ->> 'id')::uuid,
      before_target_change ->> 'kind',
      (before_target_change ->> 'target_cell_id')::uuid,
      before_target_change ->> 'note');
    perform public.update_cell_dependency(
      (before_kind_change ->> 'id')::uuid,
      before_kind_change ->> 'kind',
      (before_kind_change ->> 'target_cell_id')::uuid,
      before_kind_change ->> 'note');

    select d.kind, d.target_cell_id, d.note
      into final_kind, final_target, final_note
      from public.cell_dependencies d where d.id = dep;
    if final_kind <> 'leads_to' or final_target <> cell_b
       or final_note is distinct from 'the note it arrived with' then
      raise exception
        'undo left the edge as (%, %, %), not where it started', final_kind, final_target, final_note;
    end if;

    select count(*) into drawn
      from public.cell_dependencies
     where source_cell_id = cell_a and kind = 'leads_to';
    if drawn <> 1 then
      raise exception 'after the undo % edges are drawn, expected 1', drawn;
    end if;

    -- 5. A COLLISION IS REFUSED IN THE PANEL'S WORDS. A second edge from the
    -- same source, then an edit that would turn the first into a copy of it.
    insert into public.cell_dependencies (source_cell_id, target_cell_id, kind)
      values (cell_a, cell_c, 'leads_to');
    begin
      perform public.update_cell_dependency(dep, 'leads_to', cell_c, null);
      raise exception 'an edit onto an existing connection was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'That connection already exists' then raise; end if;
    end;

    -- AND AN EDIT OF A ROW THAT IS GONE SAYS SO. Matching nothing is a
    -- failure here, not a quiet success.
    begin
      perform public.update_cell_dependency(gen_random_uuid(), 'leads_to', cell_b, null);
      raise exception 'editing a connection that does not exist was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'That connection no longer exists' then raise; end if;
    end;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'edit-in-place fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'edit-in-place fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the edit-in-place cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'edit-in-place fixture') then
    raise exception 'the edit-in-place fixture survived the rollback';
  end if;
end
$edit_in_place$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000227000000_a_featured_image_is_the_frame.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A cell's featured image is its frame.
--
-- Authored 2026-09-13.
--
-- A cell had two ways to have "its picture": the `frame` column, and a
-- resource attachment flagged `featured`, which the panel led with whatever the
-- frame held. And a touchpoint's stock logo lived only on the touchpoint, so a
-- deployment that wanted a logo on a slide uploaded a copy of it as the cell's
-- frame, and the panel drew the logo twice.
--
-- The model is now one slot. The FEATURED IMAGE of a cell is `cells.frame`:
-- whatever a person chose — a storyboard illustration, a screenshot, one of the
-- cell's attachments, or its touchpoint's logo. What is stored is what shows;
-- nothing is substituted at display time. Links keep `resources.featured`,
-- which is the panel's buttons and a different thing.
--
-- ── WHY A FUNCTION AND NOT A COLUMN GRANT ────────────────────────────────
--
-- `authenticated` holds no UPDATE on `frame`, and no function wrote it: frames
-- arrived through seeds and imports only. A column grant would open a write
-- the ledger never sees. Every other author write is a logged, undoable
-- operation, so this one is too: `set_cell_featured_image` returns the frame
-- AS IT STOOD, and its inverse is the same function pointed at that value.
--
-- It accepts an https address (an attachment's url) or a path on this site
-- (a stock logo such as `/touchpoint-logos/…`), or null to clear. A path that
-- starts `//` or `/\` is another host to a browser and is refused, as is any
-- other scheme: this string is drawn as an image source.
--
-- ── WHY PLACING A CELL FILLS AN EMPTY FRAME ──────────────────────────────
--
-- A cell placed on a touchpoint that carries a logo leads with that logo
-- until somebody chooses otherwise. The two functions that place a cell on a
-- registry entry — `sync_cell_touchpoints`, which mints placements from a
-- cell's text, and `set_placement_touchpoint`, which links a placement to an
-- entry — set `frame` to the entry's `icon_url` when the frame is null or
-- blank and the entry has one. The stock path is stored, never a copy. A frame
-- that holds anything is never overwritten.
--
-- The sync fills only for placements it INSERTS, so a text save on a cell
-- already on that touchpoint does not refill a frame somebody cleared.
--
-- Both are rewritten from `pg_get_functiondef`, the way `21000131000000`
-- rewrote them, and each replacement is asserted to have landed. Neither
-- signature changes, and `create or replace` keeps both ACLs.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- One new function, two rewrites, and a proof that builds its own fixture and
-- gives it back inside a sentinel-exception block.


create or replace function public.set_cell_featured_image(
  cell_id uuid,
  image_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  found_id uuid;
  previous_frame text;
  next_frame text;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select c.id, c.frame into found_id, previous_frame
    from public.cells c
   where c.id = set_cell_featured_image.cell_id
   for update;
  if found_id is null then
    raise exception 'That cell no longer exists';
  end if;

  next_frame := nullif(btrim(set_cell_featured_image.image_url), '');
  if next_frame is not null and next_frame !~ '^(https://|/[^/\\])' then
    raise exception 'A featured image is an https address or a path on this site';
  end if;

  update public.cells c
     set frame = next_frame
   where c.id = found_id;

  return jsonb_build_object('cell_id', found_id, 'frame', previous_frame);
end;
$function$;

comment on function public.set_cell_featured_image(uuid, text) is
  'Sets a cell''s featured image, which is its frame: an https address, a '
  'path on this site, or null to clear. Returns the frame as it stood, which '
  'is the inverse.';

revoke execute on function public.set_cell_featured_image(uuid, text) from public;


-- ---------------------------------------------------------------------------
-- The sync fills an empty frame with the logo of a touchpoint it places
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  before text;
  after  text;
begin
  before := pg_get_functiondef('public.sync_cell_touchpoints(uuid, text[])'::regprocedure);
  after  := replace(before,
    $r$  insert into public.cell_touchpoints (cell_id, touchpoint_id, position, origin)
  select p_cell_id, tp.id, w.position, 'app'
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
    join public.touchpoints tp
      on tp.name = w.name
   where not exists (
     select 1 from public.cell_touchpoints ct
      where ct.cell_id = p_cell_id and ct.touchpoint_id = tp.id
   );$r$,
    $r$  -- A placement it inserts on a touchpoint with a logo fills an empty
  -- frame with that logo's path; a frame that holds anything is left alone.
  with placed as (
    insert into public.cell_touchpoints (cell_id, touchpoint_id, position, origin)
    select p_cell_id, tp.id, w.position, 'app'
      from jsonb_to_recordset(v_wanted) as w(name text, position int)
      join public.touchpoints tp
        on tp.name = w.name
     where not exists (
       select 1 from public.cell_touchpoints ct
        where ct.cell_id = p_cell_id and ct.touchpoint_id = tp.id
     )
    returning touchpoint_id, position
  )
  update public.cells c
     set frame = logo.icon_url
    from (
      select btrim(tp.icon_url) as icon_url
        from placed
        join public.touchpoints tp on tp.id = placed.touchpoint_id
       where nullif(btrim(tp.icon_url), '') is not null
       order by placed.position
       limit 1
    ) logo
   where c.id = p_cell_id
     and nullif(btrim(c.frame), '') is null;$r$);

  if after = before then
    raise exception 'sync_cell_touchpoints was not rewritten at all';
  end if;
  if after !~ 'returning touchpoint_id, position' then
    raise exception 'sync_cell_touchpoints does not read back what it placed';
  end if;

  execute after;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- Linking a placement to a registry entry fills an empty frame the same way
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  before text;
  after  text;
begin
  before := pg_get_functiondef('public.set_placement_touchpoint(uuid, uuid, text)'::regprocedure);
  after  := replace(before,
    $r$         updated_at    = now()
   where id = p_placement_id;
$r$,
    $r$         updated_at    = now()
   where id = p_placement_id;

  -- An entry with a logo fills the cell's empty frame with that logo's path;
  -- a frame that holds anything is left alone.
  if p_touchpoint_id is not null then
    update public.cells c
       set frame = btrim(tp.icon_url)
      from public.touchpoints tp
     where tp.id = p_touchpoint_id
       and c.id = v_row.cell_id
       and nullif(btrim(tp.icon_url), '') is not null
       and nullif(btrim(c.frame), '') is null;
  end if;
$r$);

  if after = before then
    raise exception 'set_placement_touchpoint was not rewritten at all';
  end if;
  if after !~ 'that touchpoint is not in the registry' then
    raise exception 'set_placement_touchpoint lost its registry-membership check';
  end if;

  execute after;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- The behaviour, performed
-- ---------------------------------------------------------------------------
--
--   1. setting returns the frame as it stood, and feeding that back undoes it;
--   2. clearing stores null, and a refused address and a missing cell each
--      fail with the sentence the panel shows;
--   3. an account that is not the service account cannot write;
--   4. the sync fills an empty frame with the logo of a touchpoint it places,
--      and leaves a set frame alone;
--   5. linking a placement to an entry with a logo does the same.
do $featured_image$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  stp uuid;
  lane_tp uuid;
  lane_b uuid;
  lane_c uuid;
  cell_a uuid;
  cell_b uuid;
  cell_c uuid;
  entry uuid;
  placement uuid;
  logo constant text := '/touchpoint-logos/example-logo.png';
  shot constant text := 'https://example.supabase.co/storage/v1/object/public/cell-attachments/shot.png';
  before_set jsonb;
  before_clear jsonb;
  now_frame text;
  done boolean := false;
  msg text;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'featured-image proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('featured-image fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;
    insert into public.steps (scenario_id, name)
      values (scen, 'fixture step') returning id into stp;
    insert into public.path_steps (path_id, step_id, position)
      values (pth, stp, 0);
    insert into public.lanes (path_id, name, position, lane_role)
      values (pth, 'fixture touchpoints', 0, 'frontstage_touchpoints') returning id into lane_tp;
    insert into public.lanes (path_id, name, position, lane_role)
      values (pth, 'fixture touchpoints B', 1, 'backstage_touchpoints') returning id into lane_b;
    insert into public.lanes (path_id, name, position)
      values (pth, 'fixture lane C', 2) returning id into lane_c;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_tp, stp, 'Fixture tool') returning id into cell_a;
    insert into public.cells (path_id, lane_id, step_id, content, frame)
      values (pth, lane_b, stp, 'Fixture tool', shot) returning id into cell_b;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (pth, lane_c, stp, 'fixture actor') returning id into cell_c;
    insert into public.touchpoints (name, origin, icon_url)
      values ('Fixture tool', 'app', logo) returning id into entry;

    -- 1. SET, AND ITS UNDO.
    before_set := public.set_cell_featured_image(cell_c, shot);
    if before_set ->> 'frame' is not null or (before_set ->> 'cell_id')::uuid <> cell_c then
      raise exception 'setting did not return the frame as it stood: %', before_set;
    end if;
    select frame into now_frame from public.cells where id = cell_c;
    if now_frame is distinct from shot then
      raise exception 'setting stored %, not the address', now_frame;
    end if;
    perform public.set_cell_featured_image(
      (before_set ->> 'cell_id')::uuid, before_set ->> 'frame');
    select frame into now_frame from public.cells where id = cell_c;
    if now_frame is not null then
      raise exception 'undo left the frame as %', now_frame;
    end if;

    -- 2. A LOGO PATH IS ACCEPTED, AND CLEARING STORES NULL.
    perform public.set_cell_featured_image(cell_c, logo);
    before_clear := public.set_cell_featured_image(cell_c, '  ');
    select frame into now_frame from public.cells where id = cell_c;
    if now_frame is not null or before_clear ->> 'frame' is distinct from logo then
      raise exception 'clearing left % and returned %', now_frame, before_clear;
    end if;

    begin
      perform public.set_cell_featured_image(cell_c, '//evil.example/x.png');
      raise exception 'a protocol-relative address was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'A featured image is an https address or a path on this site' then raise; end if;
    end;
    begin
      perform public.set_cell_featured_image(cell_c, 'javascript:alert(1)');
      raise exception 'a script address was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'A featured image is an https address or a path on this site' then raise; end if;
    end;
    begin
      perform public.set_cell_featured_image(gen_random_uuid(), shot);
      raise exception 'a missing cell was accepted';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'That cell no longer exists' then raise; end if;
    end;

    -- 3. NO SERVICE CLAIM, NO WRITE — where the environment can tell the
    -- difference. A stock replay's `is_service_account()` is `select true`,
    -- and there the guard has nothing to refuse.
    perform set_config('request.jwt.claims', '{"app_metadata":{}}', true);
    if not public.is_service_account() then
      begin
        perform public.set_cell_featured_image(cell_c, shot);
        raise exception 'an account without the service claim set a featured image';
      exception when insufficient_privilege then
        null;
      end;
    end if;
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    -- 4. THE SYNC FILLS AN EMPTY FRAME, AND LEAVES A SET ONE.
    perform public.sync_cell_touchpoints(cell_a, array['Fixture tool']);
    perform public.sync_cell_touchpoints(cell_b, array['Fixture tool']);
    select frame into now_frame from public.cells where id = cell_a;
    if now_frame is distinct from logo then
      raise exception 'placing an empty cell on a logo left its frame as %', now_frame;
    end if;
    select frame into now_frame from public.cells where id = cell_b;
    if now_frame is distinct from shot then
      raise exception 'placing overwrote a set frame with %', now_frame;
    end if;

    -- A text save on a cell already placed does not refill a cleared frame.
    perform public.set_cell_featured_image(cell_a, null);
    perform public.sync_cell_touchpoints(cell_a, array['Fixture tool']);
    select frame into now_frame from public.cells where id = cell_a;
    if now_frame is not null then
      raise exception 'a resync refilled a cleared frame with %', now_frame;
    end if;

    -- 5. LINKING A NAME-ONLY PLACEMENT TO THE ENTRY FILLS THE SAME WAY.
    insert into public.cell_touchpoints (cell_id, name, position, origin)
      values (cell_c, 'fixture name', 0, 'app') returning id into placement;
    perform public.set_placement_touchpoint(placement, entry, null);
    select frame into now_frame from public.cells where id = cell_c;
    if now_frame is distinct from logo then
      raise exception 'linking an empty cell to a logo left its frame as %', now_frame;
    end if;
    perform public.set_cell_featured_image(cell_c, shot);
    perform public.set_placement_touchpoint(placement, null, 'fixture name');
    perform public.set_placement_touchpoint(placement, entry, null);
    select frame into now_frame from public.cells where id = cell_c;
    if now_frame is distinct from shot then
      raise exception 'linking overwrote a set frame with %', now_frame;
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'featured-image fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'featured-image fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the featured-image cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'featured-image fixture') then
    raise exception 'the featured-image fixture survived the rollback';
  end if;
end
$featured_image$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000228000000_the_icon_comment_says_what_its_file_says.sql
-- ─────────────────────────────────────────────────────────────────────────

-- The icon comment says what its file says.
--
-- Authored 2026-10-04.
--
-- `21000124000000` comments `touchpoints.icon_url`, and the text of that
-- comment was reworded in the file after databases had already applied it. A
-- migration that has run does not run again, so a database that applied the
-- earlier text still carries it in `pg_description`, and `schema_comments()`
-- ships it to agents as the column's meaning. Reading the file says one thing
-- and asking the database says another.
--
-- So the comment is issued again, with the file's text, and asserted to have
-- landed. On a database that already carries this text the statement changes
-- nothing; on an empty replay it is the second write of the same string.
--
-- The text is stated once, in the block below, so the write and its proof
-- cannot disagree. It must match `21000124000000`'s text word for word.
--
-- The whole migration is portable core: a comment on a plain column.

do $proof$
declare
  v_comment constant text :=
    'A stable URL for the touchpoint''s stock icon or logo — the mark a '
    'well-known tool shows in the detail panel. A property of the thing the '
    'service owns, authored once per (service, name), not per placement. Blueprint '
    'data, not app config: the template ships it null and draws nothing, and a '
    'deployment seeds its own asset URL. The renderer reads this row rather than '
    'matching a tool name against a table baked into code.';
  v_attnum smallint;
begin
  execute format('comment on column public.touchpoints.icon_url is %L', v_comment);

  select attnum into v_attnum
    from pg_attribute
   where attrelid = 'public.touchpoints'::regclass
     and attname = 'icon_url'
     and not attisdropped;

  if col_description('public.touchpoints'::regclass, v_attnum) is distinct from v_comment then
    raise exception 'proof: touchpoints.icon_url does not carry the current comment';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000301000000_one_write_edits_a_touchpoint_whole.sql
-- ─────────────────────────────────────────────────────────────────────────

-- One write edits a touchpoint whole: its name, kind, summary, link and icon.
--
-- Authored 2026-10-05.
--
-- The registry row has five fields an author edits — what the tool is
-- called, what sort of thing it is, what it is for the service, where it
-- lives, and the mark it shows — and until now the template wrote exactly
-- one of them. `rename_touchpoint` (`21000202000000`) moves the name and the
-- word in every bearing cell; nothing wrote the other four, and `icon_url`
-- had no writer of any kind, so a deployment could seed a logo and no author
-- could ever change or remove it.
--
-- An editor that saved the five as a rename followed by a row update would
-- be two requests, and PostgREST gives each its own transaction. The rename
-- could land and the update be refused — or the reverse — and the panel
-- would be left showing a half-saved entry whose undo has to guess which
-- half happened. That is the failure the rename function exists to end for
-- the name and its text; this extends the same answer to the whole row. One
-- call, one transaction, one ledger entry, one undo.
--
-- ── Why it calls `rename_touchpoint` rather than repeating it ─────────────
--
-- The rename is the delicate half — whole-item matching, delimiters kept,
-- the post-condition that refuses to finish while any bearing cell still
-- names the old word — and it is already proven where it lives. A second
-- copy of that body here would be a second answer to the same question, and
-- the two would drift the first time either was fixed. So this function
-- calls it, inside its own transaction: a rename that raises takes the other
-- four fields down with it, and a refusal on any of the four takes the
-- rename back out of every cell. It is called only when the name actually
-- changes, so an edit to the summary alone rewrites no text and bumps nothing
-- it did not touch.
--
-- ── The arguments are the whole entry, not a patch ────────────────────────
--
-- Positional `p_` parameters, the shape `rename_touchpoint` takes, rather than
-- a jsonb patch. Every argument is the field's NEXT value, and null means
-- empty — so clearing the icon is `p_icon_url => null`, which is a thing an
-- author does, and not "leave it alone", which a patch would have to spell
-- some other way. The panel holds the whole entry anyway, and a full-state
-- write is its own inverse: what the function returns as the row's previous
-- values is exactly the argument list that puts the row back, name and cell
-- text included. The ledger records that and nothing else.
--
-- Blank prose is stored as null rather than `''`, the house rule every other
-- registry write follows — two spellings of empty is how a field ends up
-- rendering an empty frame instead of nothing at all. The kind's vocabulary
-- is the table's CHECK and is not restated here, so it cannot drift from it.
--
-- ── Why `icon_url` gets no column grant ────────────────────────────────────
--
-- Like every placement and registry function since `21000120000000`, this is
-- `security definer` behind an explicit `is_service_account()` guard, so it
-- never consults a column grant. Granting `update (icon_url)` to
-- `authenticated` as well would open a second, direct write surface with no
-- writer behind it — a column every posture check then has to account for
-- before anything uses it. The function is the writer.
--
-- ── Where an uploaded icon lives ───────────────────────────────────────────
--
-- In `cell-attachments`, the bucket resource uploads already use
-- (`21000121000000`): public-read, service-account write, one object per
-- file under an id-only key. Its write policies admitted `cells/<id>/<id>`
-- keys and nothing else, so they are widened by one prefix, `touchpoints/`,
-- under the same pattern and the same guard. The key names the touchpoint's
-- id, never its name, so a rename moves no URL. No purge on replace or
-- clear, for the reason that migration gives: an object without a row is a
-- bounded cost on a bucket this size.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- A function definition and two policy rewrites; no rows are read or moved.
-- The proofs are invariants about the function's own posture and about the
-- policies, which an empty replay satisfies exactly as a populated target
-- does. What the function does to rows is held by
-- `scripts/tests/update-touchpoint.test.sh`, which replays this series onto a
-- loaded seed and calls it as an author and as a reader.

-- ── The write ─────────────────────────────────────────────────────────────

create or replace function public.update_touchpoint(
  p_touchpoint_id uuid,
  p_name          text,
  p_kind          text,
  p_summary       text,
  p_url           text,
  p_icon_url      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_kind     text := btrim(coalesce(p_kind, ''));
  v_summary  text := nullif(btrim(coalesce(p_summary, '')), '');
  v_url      text := nullif(btrim(coalesce(p_url, '')), '');
  v_icon_url text := nullif(btrim(coalesce(p_icon_url, '')), '');
  v_previous public.touchpoints;
  v_renamed  jsonb;
  v_written  int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  -- Refused here as well as inside the rename, because an unchanged name never
  -- reaches the rename — and an empty one must never reach the row.
  if v_name = '' then
    raise exception 'a touchpoint needs a name — an empty one is a blank pill';
  end if;

  if v_kind = '' then
    raise exception 'a touchpoint is one of its kinds — a blank one is none of them';
  end if;

  -- Locked, and read whole: this is the row the inverse will put back.
  select * into v_previous
    from public.touchpoints
   where id = p_touchpoint_id
     for update;

  if v_previous.id is null then
    raise exception 'touchpoint % does not exist', p_touchpoint_id;
  end if;

  -- A save that matches the row as it stands is not an edit. Nothing is
  -- written and `updated_at` is not stamped, and the reply says so, so the
  -- caller records no ledger entry — an undo of nothing is a row in the sheet
  -- that does nothing when clicked.
  if (v_previous.name, v_previous.kind, v_previous.summary, v_previous.url, v_previous.icon_url)
     is not distinct from (v_name, v_kind, v_summary, v_url, v_icon_url) then
    return jsonb_build_object(
      'touchpoint_id', p_touchpoint_id,
      'name', v_name,
      'previous_name', v_previous.name,
      'cell_ids', '[]'::jsonb,
      'changed', false,
      'previous', jsonb_build_object(
        'name', v_previous.name,
        'kind', v_previous.kind,
        'summary', v_previous.summary,
        'url', v_previous.url,
        'icon_url', v_previous.icon_url
      )
    );
  end if;

  -- The name first, through the one function that knows how to move it. If it
  -- raises, nothing below runs and nothing above has been written.
  if v_previous.name <> v_name then
    v_renamed := public.rename_touchpoint(p_touchpoint_id, v_name);
  end if;

  update public.touchpoints
     set kind       = v_kind,
         summary    = v_summary,
         url        = v_url,
         icon_url   = v_icon_url,
         updated_at = now()
   where id = p_touchpoint_id;

  -- A zero-row write is a failure, not a no-op: the caller is about to record
  -- an inverse for an edit that never happened.
  get diagnostics v_written = row_count;
  if v_written <> 1 then
    raise exception 'editing touchpoint % wrote % rows', p_touchpoint_id, v_written;
  end if;

  return jsonb_build_object(
    'touchpoint_id', p_touchpoint_id,
    'name', v_name,
    'previous_name', v_previous.name,
    'cell_ids', coalesce(v_renamed -> 'cell_ids', '[]'::jsonb),
    'changed', true,
    -- The argument list that undoes this call, as the row stood under the
    -- lock — never as the caller remembered it.
    'previous', jsonb_build_object(
      'name', v_previous.name,
      'kind', v_previous.kind,
      'summary', v_previous.summary,
      'url', v_previous.url,
      'icon_url', v_previous.icon_url
    )
  );
end
$function$;

comment on function public.update_touchpoint(uuid, text, text, text, text, text) is
  'Edit a touchpoint''s registry entry whole — name, kind, summary, url and '
  'icon_url — in one transaction. A changed name goes through rename_touchpoint, '
  'so every bearing cell''s content moves with it. Blank prose is stored as null. '
  'A save matching the row writes nothing and returns changed = false. '
  'Returns the previous values, which are the arguments that undo the call.';


-- ── Prove the function's posture ───────────────────────────────────────────
--
-- SECURITY DEFINER, because the guard in its body is what decides who may
-- author and no column grant is consulted; and present with the six
-- arguments the client posts, since PostgREST resolves a call by its keys.

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.oid = to_regprocedure('public.update_touchpoint(uuid, text, text, text, text, text)');

  if v_definer is null then
    raise exception 'proof: update_touchpoint(uuid, text, text, text, text, text) was not created';
  end if;
  if not v_definer then
    raise exception
      'proof: update_touchpoint must be SECURITY DEFINER — the guard in its body is what decides who may author';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000302000000_a_touchpoint_link_is_https.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A touchpoint's link is https, and its icon an address it can draw, before
-- either is stored.
--
-- Authored 2026-10-05.
--
-- `update_touchpoint` (`21000301000000`) stored whatever text arrived in
-- `url` and `icon_url`. A `javascript:` link, a `data:` image, an `http:`
-- address, a relative path or a sentence that is not a link at all all went
-- into the registry, and the panel draws the one as a link and the other as
-- an image source. A resource link has met a stricter bar on the way in for
-- some time — https only, refused with a reason — and a touchpoint's link
-- now meets the same one; its icon meets a near relative of it.
--
-- The dialog refuses first, with its own validator's sentence, so a person
-- sees why Save is dark. This is the other half, for the same reason
-- resources have one: the map skill, the agent and a seed reach the function
-- without passing the dialog.
--
-- ── The rule ───────────────────────────────────────────────────────────────
--
-- A link is an absolute https address: the scheme, then a host, then
-- anything without whitespace. The client upgrades a bare `figma.com/…` to
-- https before it posts, because typing the scheme is not something anyone
-- should have to remember; the function does not, because a caller that
-- skipped the dialog can spell the scheme itself, and guessing at what an
-- agent meant is how a link ends up pointing somewhere nobody chose. So an
-- agent or map-skill write sends the scheme: a bare host is refused here.
--
-- An icon is empty, which is how it is cleared, or one of three shapes, each
-- owed to where an icon comes from. An https address, which is what an upload
-- yields on a hosted project. A path on this site — `/…`, never `//…` or
-- `/\…`, which a browser reads as another host — which is how a deployment
-- seeds its logos, and which the renderer resolves under the base path. And
-- http on a loopback host (`localhost`, `127.0.0.1`, `[::1]`, any port),
-- because an upload's public URL is http on the local stack, and refusing it
-- would refuse every icon uploaded in development. http on any other host,
-- `javascript:`, `data:`, a protocol-relative or a bare-host address is
-- refused. The dialog's `validateIconUrl` holds the same rule.
--
-- ── Only a value that changes is checked ──────────────────────────────────
--
-- Existing rows are not rewritten, and they must stay editable. A deployment
-- seeds its logos as paths on its own site, and an entry imported before this
-- may carry an http link; if the rule held every argument, a save of such an
-- entry's summary would be refused for a link nobody touched. So a value that
-- matches what the row already holds passes as it stands, and the no-op path
-- — a save matching the row returns `changed: false` and writes nothing — is
-- unchanged. Rendering keeps its own guard for whatever was stored before.
--
-- A seeded logo path is an icon the rule takes, so undoing its replacement
-- puts it back. The cost that remains is the link's: an undo that puts back a
-- pre-existing `http:` or other non-https URL after it was replaced is a new
-- value to this function, and is refused with the same sentence. That is the
-- rule doing its job on a value it never chose.
--
-- ── Why the sentences read the way they do ────────────────────────────────
--
-- They are for the writes that never pass the dialog — the agent, the map
-- skill, a seed — and for a dialog whose own check was somehow bypassed; a
-- person in the dialog sees its validator's sentence first. The client passes
-- a raised message through only when it reads as a sentence — capitalised, no
-- identifier punctuation, nothing shaped like `host.tld` — and replaces
-- anything else with a line pointing at the console. So they name no value
-- back.
--
-- ── What else is kept exactly ─────────────────────────────────────────────
--
-- The signature, `security definer`, the guard, the lock, the rename path,
-- the no-op reply and the shape of the result are the previous body's, and
-- `create or replace` keeps the grants. The checks sit after the lock and
-- before the rename, so a refused link writes nothing anywhere: no row, no
-- cell text, and — because the call raises — no ledger entry on the client.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- A function definition and a proof that builds its own fixture and gives it
-- back inside a sentinel-exception block, as `21000227000000` does.

create or replace function public.update_touchpoint(
  p_touchpoint_id uuid,
  p_name          text,
  p_kind          text,
  p_summary       text,
  p_url           text,
  p_icon_url      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_kind     text := btrim(coalesce(p_kind, ''));
  v_summary  text := nullif(btrim(coalesce(p_summary, '')), '');
  v_url      text := nullif(btrim(coalesce(p_url, '')), '');
  v_icon_url text := nullif(btrim(coalesce(p_icon_url, '')), '');
  -- An absolute https address: scheme, a host, and no whitespace anywhere.
  v_https    constant text := '^https://[^\s/?#]+([/?#]\S*)?$';
  -- What an icon may be besides that: a path on this site, or http on a
  -- loopback host, any port.
  v_on_site  constant text := '^/[^/\\\s]\S*$';
  v_loopback constant text := '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?([/?#]\S*)?$';
  v_previous public.touchpoints;
  v_renamed  jsonb;
  v_written  int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  -- Refused here as well as inside the rename, because an unchanged name never
  -- reaches the rename — and an empty one must never reach the row.
  if v_name = '' then
    raise exception 'a touchpoint needs a name — an empty one is a blank pill';
  end if;

  if v_kind = '' then
    raise exception 'a touchpoint is one of its kinds — a blank one is none of them';
  end if;

  -- Locked, and read whole: this is the row the inverse will put back.
  select * into v_previous
    from public.touchpoints
   where id = p_touchpoint_id
     for update;

  if v_previous.id is null then
    raise exception 'touchpoint % does not exist', p_touchpoint_id;
  end if;

  -- The two links, checked only where they change: a value the row already
  -- holds was stored before this rule and is not this save's to refuse.
  if v_url is not null
     and v_url is distinct from v_previous.url
     and v_url !~* v_https then
    if v_url ~* '^http:' then
      raise exception 'A touchpoint’s link has to be https — that one is http, which is not secure.';
    end if;
    raise exception 'A touchpoint’s link has to be a full address that starts with https.';
  end if;

  if v_icon_url is not null
     and v_icon_url is distinct from v_previous.icon_url
     and v_icon_url !~* v_https
     and v_icon_url !~ v_on_site
     and v_icon_url !~* v_loopback then
    raise exception 'A touchpoint’s icon has to be an https address, a path on this site, or nothing at all.';
  end if;

  -- A save that matches the row as it stands is not an edit. Nothing is
  -- written and `updated_at` is not stamped, and the reply says so, so the
  -- caller records no ledger entry — an undo of nothing is a row in the sheet
  -- that does nothing when clicked.
  if (v_previous.name, v_previous.kind, v_previous.summary, v_previous.url, v_previous.icon_url)
     is not distinct from (v_name, v_kind, v_summary, v_url, v_icon_url) then
    return jsonb_build_object(
      'touchpoint_id', p_touchpoint_id,
      'name', v_name,
      'previous_name', v_previous.name,
      'cell_ids', '[]'::jsonb,
      'changed', false,
      'previous', jsonb_build_object(
        'name', v_previous.name,
        'kind', v_previous.kind,
        'summary', v_previous.summary,
        'url', v_previous.url,
        'icon_url', v_previous.icon_url
      )
    );
  end if;

  -- The name first, through the one function that knows how to move it. If it
  -- raises, nothing below runs and nothing above has been written.
  if v_previous.name <> v_name then
    v_renamed := public.rename_touchpoint(p_touchpoint_id, v_name);
  end if;

  update public.touchpoints
     set kind       = v_kind,
         summary    = v_summary,
         url        = v_url,
         icon_url   = v_icon_url,
         updated_at = now()
   where id = p_touchpoint_id;

  -- A zero-row write is a failure, not a no-op: the caller is about to record
  -- an inverse for an edit that never happened.
  get diagnostics v_written = row_count;
  if v_written <> 1 then
    raise exception 'editing touchpoint % wrote % rows', p_touchpoint_id, v_written;
  end if;

  return jsonb_build_object(
    'touchpoint_id', p_touchpoint_id,
    'name', v_name,
    'previous_name', v_previous.name,
    'cell_ids', coalesce(v_renamed -> 'cell_ids', '[]'::jsonb),
    'changed', true,
    -- The argument list that undoes this call, as the row stood under the
    -- lock — never as the caller remembered it.
    'previous', jsonb_build_object(
      'name', v_previous.name,
      'kind', v_previous.kind,
      'summary', v_previous.summary,
      'url', v_previous.url,
      'icon_url', v_previous.icon_url
    )
  );
end
$function$;

comment on function public.update_touchpoint(uuid, text, text, text, text, text) is
  'Edit a touchpoint''s registry entry whole — name, kind, summary, url and '
  'icon_url — in one transaction. A changed name goes through rename_touchpoint, '
  'so every bearing cell''s content moves with it. Blank prose is stored as null. '
  'A changed url must be an absolute https address, or empty; a changed icon_url '
  'an https address, a path on this site, an http loopback address, or empty. '
  'A value the row already holds is kept as it stands. '
  'A save matching the row writes nothing and returns changed = false. '
  'Returns the previous values, which are the arguments that undo the call.';

-- ── Prove the posture survived the rewrite ─────────────────────────────────

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.oid = to_regprocedure('public.update_touchpoint(uuid, text, text, text, text, text)');

  if v_definer is null then
    raise exception 'proof: update_touchpoint(uuid, text, text, text, text, text) was not replaced';
  end if;
  if not v_definer then
    raise exception
      'proof: update_touchpoint must stay SECURITY DEFINER — the guard in its body is what decides who may author';
  end if;
end
$proof$;

-- ── The rule, performed ────────────────────────────────────────────────────
--
--   1. an entry carrying an http link and a path icon from before the rule
--      can still have its summary edited, and keeps both as they stand;
--   2. a save matching the row still returns changed = false;
--   3. a `javascript:`, `http:`, relative or non-link URL is refused with the
--      function's sentence, and leaves the row as it stood;
--   4. an icon outside the rule — http on a real host, `javascript:`,
--      `data:`, protocol-relative, a bare host — is refused the same way;
--   5. each icon shape the rule takes is stored: https, a path on this site,
--      and http on each loopback host;
--   6. undoing the replacement of a seeded logo path puts it back;
--   7. an https link is stored, and an empty icon and an empty link clear.
do $touchpoint_links$
declare
  entry uuid;
  legacy_url  constant text := 'http://legacy.example/tool';
  legacy_icon constant text := '/touchpoint-logos/example-logo.png';
  uploaded    constant text :=
    'https://example.supabase.co/storage/v1/object/public/cell-attachments/touchpoints/'
    || '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png';
  link_http    constant text := 'A touchpoint’s link has to be https — that one is http, which is not secure.';
  link_refused constant text := 'A touchpoint’s link has to be a full address that starts with https.';
  icon_refused constant text :=
    'A touchpoint’s icon has to be an https address, a path on this site, or nothing at all.';
  reply jsonb;
  now_row public.touchpoints;
  candidate text;
  expected text;
  done boolean := false;
  msg text;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'touchpoint-link proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.touchpoints (name, kind, origin, url, icon_url)
      values ('touchpoint-link fixture', 'app', 'app', legacy_url, legacy_icon)
      returning id into entry;

    -- 1. WHAT THE ROW ALREADY HOLDS PASSES AS IT STANDS.
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    select * into now_row from public.touchpoints where id = entry;
    if reply ->> 'changed' <> 'true' or now_row.summary is distinct from 'edited'
       or now_row.url is distinct from legacy_url
       or now_row.icon_url is distinct from legacy_icon then
      raise exception 'proof: an edit beside a pre-rule link did not land as it was: %', reply;
    end if;

    -- 2. A SAVE MATCHING THE ROW IS STILL NOT AN EDIT.
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    if reply ->> 'changed' <> 'false' then
      raise exception 'proof: a save matching the row did not say it changed nothing: %', reply;
    end if;

    -- 3. A URL THAT IS NOT AN ABSOLUTE HTTPS ADDRESS IS REFUSED.
    foreach candidate in array array[
      'javascript:alert(1)', 'http://example.com', '/relative/path', 'not a link',
      'data:text/html,hi', 'https://', '//evil.example/x'
    ] loop
      expected := case when candidate ~* '^http:' then link_http else link_refused end;
      begin
        perform public.update_touchpoint(
          entry, 'touchpoint-link fixture', 'app', 'edited', candidate, legacy_icon);
        raise exception 'proof: the link % was accepted', candidate;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> expected then raise; end if;
      end;
    end loop;

    -- 4. AN ICON OUTSIDE THE RULE IS REFUSED.
    foreach candidate in array array[
      'http://cdn.example/x.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)',
      '//evil.example/x.png', '/\evil.example/x.png', 'cdn.example/x.png',
      'http://localhost.evil.example/x.png', 'http://localhost@evil.example/x.png',
      'https://', '/'
    ] loop
      begin
        perform public.update_touchpoint(
          entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, candidate);
        raise exception 'proof: the icon % was accepted', candidate;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> icon_refused then raise; end if;
      end;
    end loop;

    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is distinct from legacy_url
       or now_row.icon_url is distinct from legacy_icon
       or now_row.summary is distinct from 'edited' then
      raise exception 'proof: a refused link changed the row: % %', now_row.url, now_row.icon_url;
    end if;

    -- 5. EVERY SHAPE THE ICON RULE TAKES IS STORED.
    foreach candidate in array array[
      uploaded,
      '/touchpoint-logos/another-logo.png',
      'http://127.0.0.1:54321/storage/v1/object/public/cell-attachments/touchpoints/a/b.png',
      'http://localhost/x.png',
      'http://[::1]:8080/x.png'
    ] loop
      perform public.update_touchpoint(
        entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, candidate);
      select * into now_row from public.touchpoints where id = entry;
      if now_row.icon_url is distinct from candidate then
        raise exception 'proof: the icon % was stored as %', candidate, now_row.icon_url;
      end if;
    end loop;

    -- 6. UNDOING A REPLACED SEEDED LOGO PUTS THE PATH BACK.
    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, uploaded);
    perform public.update_touchpoint(
      entry, reply -> 'previous' ->> 'name', reply -> 'previous' ->> 'kind',
      reply -> 'previous' ->> 'summary', reply -> 'previous' ->> 'url',
      reply -> 'previous' ->> 'icon_url');
    select * into now_row from public.touchpoints where id = entry;
    if now_row.icon_url is distinct from legacy_icon then
      raise exception 'proof: undoing a replaced seeded logo left %', now_row.icon_url;
    end if;

    -- 7. AN HTTPS LINK IS STORED, AND EMPTY STILL CLEARS.
    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', ' https://figma.com/file/x ', uploaded);
    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is distinct from 'https://figma.com/file/x'
       or now_row.icon_url is distinct from uploaded then
      raise exception 'proof: an https link and an uploaded icon were stored as % and %',
        now_row.url, now_row.icon_url;
    end if;

    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', '', '');
    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is not null or now_row.icon_url is not null then
      raise exception 'proof: clearing left % and %', now_row.url, now_row.icon_url;
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'touchpoint-link fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'touchpoint-link fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'proof: the touchpoint-link cases never ran';
  end if;
  if exists (select 1 from public.touchpoints where name = 'touchpoint-link fixture') then
    raise exception 'proof: the touchpoint-link fixture survived the rollback';
  end if;
end
$touchpoint_links$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000303000000_a_finding_says_what_fixing_it_is_worth.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A finding says what fixing it is worth, and what fixing it costs.
--
-- Authored 2026-10-09.
--
-- A finding carried one rating, `severity`, and severity answers one
-- question: how wrong is this? It does not answer the question a team asks
-- when it sits down with an audit, which is what to fix first. A critical
-- finding that takes a quarter of rework and a warning that takes one
-- sentence are not ordered by how wrong each is.
--
-- So a finding gains two more ratings, each `low | medium | high`:
--
--   impact   how much fixing it matters to the service
--   effort   how much work the fix takes
--
-- The auditor assigns both beside severity, from the rubric in each check
-- doc, and the audit report groups its findings by the pair: high impact for
-- low effort first, then the high-impact work worth planning, then the
-- cheap wins, then everything else.
--
-- ── Why nullable ──────────────────────────────────────────────────────────
--
-- Every finding recorded before this migration has neither rating, and
-- inventing one for it would put a judgement in the ledger that no auditor
-- made. So both columns are nullable, an existing row stays exactly as it
-- is, and a reader shows a null as unrated and sorts it last. A finding
-- recorded from here on carries both: the auditor's output and the agent's
-- `create_finding` refuse one without them, which is where the rule belongs —
-- a NOT NULL here would refuse every historical row along with it.
--
-- ── Why update is granted ────────────────────────────────────────────────
--
-- An audit that re-detects an open finding updates it in place, and a
-- re-run whose only change is a rating must move that rating rather than
-- raise a twin. The update grant is column-narrowed to what that rewrite
-- touches, so the two new columns join it.

alter table public.audit_findings
  add column impact text
    constraint audit_findings_impact_check check (impact in ('low', 'medium', 'high')),
  add column effort text
    constraint audit_findings_effort_check check (effort in ('low', 'medium', 'high'));

comment on column public.audit_findings.impact is
  'How much fixing this finding matters to the service: low, medium or high. '
  'Null on a finding recorded before the rating existed, which reads as unrated.';

comment on column public.audit_findings.effort is
  'How much work the fix takes: low, medium or high. Null on a finding '
  'recorded before the rating existed, which reads as unrated.';

-- ─────────────────────────────────────────────────────────────────────────
-- 21000304000000_a_slice_write_is_all_or_nothing.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A slice write is all-or-nothing: a failed replace no longer empties the slice.
--
-- Authored 2026-10-12.
--
-- Both slice writes were sequences of PostgREST requests, and PostgREST gives
-- each request its own transaction. Replacing a slice's slides read them,
-- deleted every one, then inserted the new set — so an insert refused by one
-- bad cell id left the delete standing and a slice that had slides with none.
-- Creating a slice inserted the row, then its slides — so the same refusal
-- left an empty slice behind. Both writes serve the editor's Save and the
-- agent's tools alike, and an agent's one mistyped id was enough to wipe a
-- slice on a live deployment.
--
-- Two functions end that, each one call and one transaction:
--
--   replace_slides(p_slice_id, p_slides)   swaps a slice's slides, and their
--                                          `slide_images`, whole
--   create_slice(…, p_slides)              writes a slice and its slides
--
-- A refusal anywhere — a cell that is not an id, an image member that names
-- nothing, a kind outside the CHECK — raises, and nothing the call wrote
-- survives it.
--
-- ── What the client still decides ─────────────────────────────────────────
--
-- Which image set a replaced slide carries is the client's call, made by
-- `imageSetCarriedOntoReplacedSlide` from the slide's prior row and its new
-- cells, and it arrives here already decided: each element of `p_slides` names
-- its `cell_ids`, `cell_keys`, `title`, `caption`, `shows_all_images` and the
-- `images` to write under it. An element may carry the `id` of the slide it
-- replaces, so a slide's identity — and the upload folder named after it —
-- survives the rewrite. `position` is the element's place in the list; a
-- caller cannot send two slides into one slot.
--
-- ── What it returns is the inverse ────────────────────────────────────────
--
-- `replace_slides` returns the slides it deleted, each with its image set, as
-- they stood under the lock — never as the caller last read them. That is the
-- payload the session ledger's `restore_slides` revert writes back verbatim,
-- column for column, so it is `to_jsonb` of the stored rows and not a shape
-- of its own.
--
-- ── Why `create_slice` calls `replace_slides` ─────────────────────────────
--
-- Writing a list of slides under a slice is one answer, and a second copy of
-- it here would drift from the first the next time either was fixed. A new
-- slice has no slides to capture, so the call returns an empty `previous`,
-- and the row and the slides commit or roll back together.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- Two function definitions; no rows are read or moved. The proofs are about
-- the functions' own posture, which an empty replay satisfies exactly as a
-- populated target does. What they do to rows is held by
-- `scripts/tests/slice-writes.test.sh`, which replays this series onto a
-- loaded seed and calls both as an author, as a reader and as anon.

-- ── The replace ────────────────────────────────────────────────────────────

create or replace function public.replace_slides(
  p_slice_id uuid,
  p_slides   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_previous jsonb;
  v_slide    jsonb;
  v_ordinal  bigint;
  v_cell     text;
  v_slide_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  if p_slides is null or jsonb_typeof(p_slides) <> 'array' then
    raise exception 'A slice''s slides are written as a list of slides — nothing was written.';
  end if;

  -- Locked, so the capture below is the state the delete removes and no other
  -- write can slip a slide in between the two.
  perform 1 from public.slices where id = p_slice_id for update;
  if not found then
    raise exception 'That slice no longer exists — nothing was written.';
  end if;

  -- Before the delete, or there is nothing left to capture. Each row whole,
  -- with its image set, in the order `position` already encodes.
  select coalesce(jsonb_agg(
           to_jsonb(s) || jsonb_build_object(
             'slide_images',
             coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
                         from public.slide_images i
                        where i.slide_id = s.id), '[]'::jsonb))
           order by s.position), '[]'::jsonb)
    into v_previous
    from public.slides s
   where s.slice_id = p_slice_id;

  -- `slide_images` cascade with their slide.
  delete from public.slides where slice_id = p_slice_id;

  for v_slide, v_ordinal in
    select value, ordinality from jsonb_array_elements(p_slides) with ordinality
  loop
    if jsonb_typeof(v_slide) <> 'object' then
      raise exception 'Slide % is not a slide — nothing was written.', v_ordinal;
    end if;

    -- Said in a sentence rather than left to the uuid cast, whose message
    -- names a type and no slide. A cell id is a soft reference with no
    -- foreign key, so its shape is the one thing the database can hold it to.
    for v_cell in
      select jsonb_array_elements_text(coalesce(v_slide -> 'cell_ids', '[]'::jsonb))
    loop
      if v_cell !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Slide % names a cell that is not an id (%) — nothing was written.',
          v_ordinal, v_cell;
      end if;
    end loop;

    insert into public.slides (
      id, slice_id, position, cell_ids, cell_keys, title, caption, shows_all_images
    )
    values (
      coalesce((v_slide ->> 'id')::uuid, gen_random_uuid()),
      p_slice_id,
      v_ordinal - 1,
      array(select jsonb_array_elements_text(coalesce(v_slide -> 'cell_ids', '[]'::jsonb)))::uuid[],
      -- A slide sent without keys records its cell ids as them, which is what
      -- a human-authored slide has always stored there.
      array(select jsonb_array_elements_text(
        coalesce(v_slide -> 'cell_keys', v_slide -> 'cell_ids', '[]'::jsonb))),
      nullif(btrim(coalesce(v_slide ->> 'title', '')), ''),
      nullif(btrim(coalesce(v_slide ->> 'caption', '')), ''),
      coalesce((v_slide ->> 'shows_all_images')::boolean, true)
    )
    returning id into v_slide_id;

    insert into public.slide_images (slide_id, position, cell_id, image_url)
    select v_slide_id,
           (member ->> 'position')::int,
           (member ->> 'cell_id')::uuid,
           member ->> 'image_url'
      from jsonb_array_elements(coalesce(v_slide -> 'images', '[]'::jsonb)) as member;
  end loop;

  return jsonb_build_object(
    'slice_id', p_slice_id,
    'slide_count', jsonb_array_length(p_slides),
    'previous', v_previous
  );
end
$function$;

comment on function public.replace_slides(uuid, jsonb) is
  'Replace a slice''s slides, and their slide_images, whole and in one transaction. '
  'Each element of p_slides is one slide in order: cell_ids, cell_keys, title, '
  'caption, shows_all_images, images, and optionally the id it keeps. A refusal '
  'anywhere leaves the prior slides as they were. Returns previous: the deleted '
  'slides with their image sets as they stood, which restore_slides writes back.';

-- ── The create ─────────────────────────────────────────────────────────────

create or replace function public.create_slice(
  p_service_id uuid,
  p_title      text,
  p_summary    text,
  p_kind       text,
  p_actor      text,
  p_slides     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_slice public.slices;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  if v_title = '' then
    raise exception 'A slice needs a title — nothing was written.';
  end if;

  -- `human`: this slice was authored here, so the slice skill never
  -- regenerates over it. Blank prose is stored as null, the house rule.
  insert into public.slices (service_id, title, summary, kind, actor, authorship)
  values (
    p_service_id,
    v_title,
    nullif(btrim(coalesce(p_summary, '')), ''),
    p_kind,
    nullif(btrim(coalesce(p_actor, '')), ''),
    'human'
  )
  returning * into v_slice;

  -- Inside this transaction: a refusal there takes the slice row with it.
  perform public.replace_slides(v_slice.id, coalesce(p_slides, '[]'::jsonb));

  select * into v_slice from public.slices where id = v_slice.id;
  return to_jsonb(v_slice);
end
$function$;

comment on function public.create_slice(uuid, text, text, text, text, jsonb) is
  'Create a human-authored slice and its slides in one transaction. p_slides is '
  'the list replace_slides takes. A refusal anywhere leaves no slice row behind. '
  'Returns the slice row.';


-- ── Prove the functions' posture ──────────────────────────────────────────
--
-- SECURITY DEFINER, because the guard in each body is what decides who may
-- author; and present with the arguments the client posts, since PostgREST
-- resolves a call by its keys.

do $proof$
declare
  v_signature text;
  v_definer   boolean;
begin
  foreach v_signature in array array[
    'public.replace_slides(uuid, jsonb)',
    'public.create_slice(uuid, text, text, text, text, jsonb)'
  ] loop
    select p.prosecdef into v_definer
      from pg_proc p
     where p.oid = to_regprocedure(v_signature);

    if v_definer is null then
      raise exception 'proof: % was not created', v_signature;
    end if;
    if not v_definer then
      raise exception
        'proof: % must be SECURITY DEFINER — the guard in its body is what decides who may author',
        v_signature;
    end if;
  end loop;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000305000000_undoing_a_slice_replace_is_all_or_nothing.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Undoing a slice replace is all-or-nothing: a failed undo no longer empties the slice.
--
-- Authored 2026-10-12.
--
-- `replace_slides` made the forward write one transaction and handed back the
-- slides it removed. The undo that writes them back was still a sequence of
-- PostgREST requests — read the slice's slides, delete them, insert the
-- captured rows, then each slide's `slide_images` — and each request is its
-- own transaction. An insert refused after the delete left the slice with
-- nothing, which is the very failure the forward write was fixed for, moved
-- one click later.
--
--   restore_slides(p_slice_id, p_rows)   puts a slice's captured slides, and
--                                        their `slide_images`, back whole
--
-- ── What it writes is the capture, verbatim ───────────────────────────────
--
-- `p_rows` is the `previous` a replace returned: `to_jsonb` of each stored
-- slide with its `slide_images` beside it. Each slide goes back column for
-- column — id, position and stamps included — so a slide's identity, and the
-- upload folder named after it, survive the round trip. `slice_id` is the one
-- column taken from the call rather than the row: a capture is only ever
-- written back to the slice it was taken from.
--
-- ── What it returns ───────────────────────────────────────────────────────
--
-- `dropped`: the ids of the slides it removed that the capture does not put
-- back — the forward write's own slides. Their upload folders are the
-- client's to sweep, after the commit, since storage is not in this
-- transaction.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- One function definition; no rows are read or moved. What it does to rows is
-- held by `scripts/tests/slice-writes.test.sh`.

create or replace function public.restore_slides(
  p_slice_id uuid,
  p_rows     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_row     jsonb;
  v_ordinal bigint;
  v_dropped jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'A slice''s slides are written back as a list of slides — nothing was written.';
  end if;

  -- Locked, as the replace locks it, so nothing slips a slide in between the
  -- read of what is there and the delete of it.
  perform 1 from public.slices where id = p_slice_id for update;
  if not found then
    raise exception 'That slice no longer exists — nothing was written.';
  end if;

  select coalesce(jsonb_agg(s.id order by s.position), '[]'::jsonb)
    into v_dropped
    from public.slides s
   where s.slice_id = p_slice_id
     and s.id::text not in (
       select r ->> 'id' from jsonb_array_elements(p_rows) r
        where jsonb_typeof(r) = 'object' and r ->> 'id' is not null);

  -- `slide_images` cascade with their slide.
  delete from public.slides where slice_id = p_slice_id;

  for v_row, v_ordinal in
    select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    if jsonb_typeof(v_row) <> 'object' or coalesce(v_row ->> 'id', '') = '' then
      raise exception 'Captured slide % has no id — nothing was written.', v_ordinal;
    end if;

    -- Named columns, as `replace_slides` writes them: a positional `.*`
    -- would put a value in whichever column a later migration added in its
    -- place.
    insert into public.slides (
      id, slice_id, position, cell_ids, cell_keys, title, caption,
      shows_all_images, created_at, created_by, updated_at
    )
    select r.id, p_slice_id, r.position, r.cell_ids, r.cell_keys, r.title, r.caption,
           r.shows_all_images, r.created_at, r.created_by, r.updated_at
      from jsonb_populate_record(null::public.slides, v_row - 'slide_images') as r;

    insert into public.slide_images (id, slide_id, position, cell_id, image_url)
    select coalesce((member ->> 'id')::uuid, gen_random_uuid()),
           (v_row ->> 'id')::uuid,
           (member ->> 'position')::int,
           (member ->> 'cell_id')::uuid,
           member ->> 'image_url'
      from jsonb_array_elements(coalesce(v_row -> 'slide_images', '[]'::jsonb)) as member;
  end loop;

  return jsonb_build_object(
    'slice_id', p_slice_id,
    'slide_count', jsonb_array_length(p_rows),
    'dropped', v_dropped
  );
end
$function$;

comment on function public.restore_slides(uuid, jsonb) is
  'Write a slice''s captured slides, and their slide_images, back whole and in '
  'one transaction: p_rows is the previous a replace_slides call returned. A '
  'refusal anywhere leaves the slice as it stood. Returns dropped: the ids of '
  'the slides it removed that the capture does not restore.';


-- ── Prove the function's posture ──────────────────────────────────────────

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.oid = to_regprocedure('public.restore_slides(uuid, jsonb)');

  if v_definer is null then
    raise exception 'proof: public.restore_slides(uuid, jsonb) was not created';
  end if;
  if not v_definer then
    raise exception
      'proof: public.restore_slides(uuid, jsonb) must be SECURITY DEFINER — the guard in its body is what decides who may author';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000306000000_a_path_kind_left_out_is_a_variant.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A path kind left out is a variant: create_path stops defaulting to a kind
-- the check refuses, and stops refusing every call.
--
-- Authored 2026-10-15.
--
-- `paths_kind_check` admits happy, variant and exception. `create_path` still
-- defaults `kind` to 'alternative', a spelling the check has refused since
-- the kinds were settled, so any call that leaves `kind` out is refused
-- outright:
--
--   create_path(scenario_id, name, kind default 'alternative', lane_source_path_id)
--
-- The app always passes a kind, which is why it has not failed in use. An
-- agent or an RPC caller that relies on the signature's own default does not.
-- `duplicate_path` carried the same default and lost it when the copy
-- functions were rebuilt for the touchpoint registry, on the reasoning that a
-- path made beside another is a variant. The same holds for a path made from
-- nothing, so `create_path` takes the same default.
--
-- ── And a body that can run at all ───────────────────────────────────────
--
-- Proving the default turned up a second defect, larger than the first. The
-- body picks the lane source with
--
--   select id from public.paths where scenario_id = scenario_id
--
-- and `scenario_id` is both the argument and the column. plpgsql's
-- `variable_conflict` is `error`, so every call raises "column reference
-- \"scenario_id\" is ambiguous" — with or without a kind, with or without a
-- lane source, because the statement is refused when it is planned rather
-- than when the `coalesce` would reach it. The body is restated here with
-- each reference qualified, by the function's name for an argument and by an
-- alias for a column. Nothing else in it changes.
--
-- `create or replace` keeps the function's oid and with it every grant. No
-- rows are read or moved.

create or replace function public.create_path(
  scenario_id uuid,
  name text,
  kind text default 'variant',
  lane_source_path_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  new_path_id uuid;
  source_path_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  source_path_id := coalesce(
    create_path.lane_source_path_id,
    (select p.id from public.paths p
      where p.scenario_id = create_path.scenario_id
      order by p.created_at limit 1)
  );

  insert into public.paths (scenario_id, name, kind, origin)
  values (create_path.scenario_id, create_path.name, create_path.kind, 'app')
  returning id into new_path_id;

  insert into public.lanes (path_id, name, lane_role, position, origin)
  select new_path_id, l.name, l.lane_role, l.position, 'app'
  from public.lanes l where l.path_id = source_path_id;

  insert into public.path_steps (path_id, step_id, position)
  select new_path_id, ps.step_id, ps.position
  from public.path_steps ps where ps.path_id = source_path_id;

  return new_path_id;
end;
$$;

-- ── The rule, performed ────────────────────────────────────────────────────
--
-- A call that names its parent and its name, and leaves `kind` out, makes a
-- variant path — with the lane source left to the body, and with it given. The fixture rolls itself back through the sentinel
-- exception: a migration may prove a thing, and may not leave the rows it
-- proved it with.
do $a_kind_left_out$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  made uuid;
  v_kind text;
  done boolean := false;
  msg text;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'kind-left-out proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('kind-left-out fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;

    -- 1. THE TWO-ARGUMENT CALL. No kind and no lane source, so the body
    -- picks its own source path — the statement that could not be planned.
    made := public.create_path(scen, 'fixture made path');
    select p.kind into v_kind from public.paths p where p.id = made;
    if v_kind is distinct from 'variant' then
      raise exception 'create_path without a kind made a % path, expected variant',
        coalesce(v_kind, '<null>');
    end if;

    -- 2. NAMED, so `kind` is left out while the lane source is given.
    made := public.create_path(
      scenario_id => scen,
      name => 'fixture second path',
      lane_source_path_id => pth);
    select p.kind into v_kind from public.paths p where p.id = made;
    if v_kind is distinct from 'variant' then
      raise exception 'create_path with a lane source and without a kind made a % path, expected variant',
        coalesce(v_kind, '<null>');
    end if;

    done := true;
    raise exception using errcode = 'P0001',
      message = 'kind-left-out fixture rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'kind-left-out fixture rollback' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);

  if not done then
    raise exception 'the kind-left-out cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'kind-left-out fixture') then
    raise exception 'the kind-left-out fixture survived the rollback';
  end if;
end
$a_kind_left_out$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000307000000_add_step_runs_again.sql
-- ─────────────────────────────────────────────────────────────────────────

-- add_step runs again: the body stops naming a local variable and a column
-- with the same word.
--
-- Authored 2026-10-15.
--
-- `add_step` declares a local `scenario_id` and then reads the path's parent
-- with
--
--   select scenario_id into scenario_id from public.paths where id = …
--
-- `scenario_id` is both the variable and the column. The variable was safe
-- when the column was `service_scenario_id`; 21000107000000 renamed the
-- column to the variable's own word, and its body sweep rewrote the column
-- reference without seeing the clash. plpgsql's
-- `variable_conflict` is `error`, so every call raises "column reference
-- \"scenario_id\" is ambiguous" before a row is touched — whatever path,
-- name or position it is given. `create_path` carried the same fault and is
-- restated by 21000306000000. The other authoring functions that take a
-- scenario or a path were called the same way against a replay of the
-- portable core and run: `add_lane`, `delete_path`, `duplicate_path`,
-- `remove_lane`, `rename_path`, `reorder_lanes` and `set_cell_dependency`.
--
-- The body is restated here with the variable renamed to `v_scenario_id`, as
-- `duplicate_path` names its own, the column read through an alias, and the
-- `name` argument written by the function's name. Nothing else in it changes.
--
-- `create or replace` keeps the function's oid and with it every grant. No
-- rows are read or moved.

create or replace function public.add_step(
  path_id uuid,
  name text,
  at_position integer default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_scenario_id uuid;
  new_step_id uuid;
  target int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select p.scenario_id into v_scenario_id
  from public.paths p where p.id = add_step.path_id;
  if v_scenario_id is null then
    raise exception 'Unknown path';
  end if;

  select coalesce(max(position) + 1, 0) into target
  from public.path_steps where path_steps.path_id = add_step.path_id;
  target := coalesce(at_position, target);

  -- Deferred unique constraint makes the shift and the insert one safe step.
  update public.path_steps
    set position = position + 1
    where path_steps.path_id = add_step.path_id and position >= target;

  insert into public.steps (scenario_id, name, origin)
  values (v_scenario_id, coalesce(nullif(trim(add_step.name), ''), 'Untitled step'), 'app')
  returning id into new_step_id;

  insert into public.path_steps (path_id, step_id, position)
  values (add_step.path_id, new_step_id, target);

  return new_step_id;
end;
$$;

-- ── The rule, performed ────────────────────────────────────────────────────
--
-- A step added at the end lands in the path's scenario at the next position,
-- and a step added at a position takes it and shifts the one there along. The
-- fixture rolls itself back through the sentinel exception: a migration may
-- prove a thing, and may not leave the rows it proved it with.
do $add_step_runs$
declare
  svc uuid;
  phase uuid;
  scen uuid;
  pth uuid;
  first_step uuid;
  second_step uuid;
  got_scen uuid;
  v_pos int;
  done boolean := false;
  msg text;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'add_step proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.services (name)
      values ('add-step fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase', 0) returning id into phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase, 'fixture scenario', 0) returning id into scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen, 'fixture path', 'happy') returning id into pth;

    -- 1. AT THE END. The statement that could not be planned runs first.
    first_step := public.add_step(pth, 'fixture first step');
    select s.scenario_id into got_scen from public.steps s where s.id = first_step;
    if got_scen is distinct from scen then
      raise exception 'add_step put its step in scenario %, expected %',
        coalesce(got_scen::text, '<null>'), scen;
    end if;
    select ps.position into v_pos
      from public.path_steps ps where ps.path_id = pth and ps.step_id = first_step;
    if v_pos is distinct from 0 then
      raise exception 'add_step placed the first step at %, expected 0',
        coalesce(v_pos::text, '<null>');
    end if;

    -- 2. AT A POSITION, which shifts the step already there.
    second_step := public.add_step(pth, 'fixture second step', 0);
    select ps.position into v_pos
      from public.path_steps ps where ps.path_id = pth and ps.step_id = second_step;
    if v_pos is distinct from 0 then
      raise exception 'add_step at position 0 placed the step at %',
        coalesce(v_pos::text, '<null>');
    end if;
    select ps.position into v_pos
      from public.path_steps ps where ps.path_id = pth and ps.step_id = first_step;
    if v_pos is distinct from 1 then
      raise exception 'add_step at position 0 left the earlier step at %, expected 1',
        coalesce(v_pos::text, '<null>');
    end if;

    done := true;
    raise exception using errcode = 'P0001',
      message = 'add-step fixture rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'add-step fixture rollback' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);

  if not done then
    raise exception 'the add_step cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'add-step fixture') then
    raise exception 'the add_step fixture survived the rollback';
  end if;
end
$add_step_runs$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000308000000_anon_runs_no_authoring_write.sql
-- ─────────────────────────────────────────────────────────────────────────

-- anon runs no authoring write: the two authoring RPCs a rename handed to
-- anon on a hosted project are taken back, and the rule is asserted over the
-- whole schema.
--
-- Authored 2026-10-17.
--
-- A hosted Supabase project carries default privileges for role `postgres`
-- in schema `public` that grant ALL on every new function to `anon`,
-- `authenticated` and `service_role` — a grant to each role by name, beside
-- Postgres's own default to PUBLIC. A migration that creates a function and
-- then says `revoke … from public` has not taken anon's grant away; only a
-- revoke that names anon does.
--
-- 20260818001000 names anon for every authoring RPC it creates, so its own
-- functions are closed. The rename series then dropped and recreated two of
-- them — `add_lane` in 21000104000000 (`at_row` → `at_position` forces a
-- drop) and `create_phase` in 21000106000000 — through the body rewriter in
-- 21000102000000, which restores the captured ACL by revoking PUBLIC and
-- re-granting what was there. On a stock Postgres that lands exactly where it
-- started. On a hosted project the recreate also lands anon's own grant, the
-- revoke from PUBLIC leaves it, and nothing afterwards asked. So on any
-- hosted deployment whose project carries those defaults, `anon` can execute
-- both. Each is SECURITY DEFINER and checks `is_service_account()` before it
-- writes, which an anon key never satisfies, so neither has been a write
-- path — but the posture this schema states is that anon calls no authoring
-- function at all, and the in-body check was the only thing holding it.
--
-- 21000116000000 rewrote four more functions the same way, and its own proof
-- stopped a fresh hosted push there; that file now revokes every grantee the
-- recreate landed on before replaying the captured ACL. The rewriter in
-- 21000102000000 was dropped by 21000109000000 and is not restated: what it
-- left behind is repaired here instead, where an existing deployment's push
-- reaches it too.
--
-- No row is read or moved, the schema version does not move, and on a
-- database where anon held neither grant — every stock Postgres, every CI
-- replay — the two revokes change nothing.

-- ─────────────────────────────────────────────────────────────────────────
-- 21000309000000_a_structure_panel_saves_one_change.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-22. A structure panel saves its fields and path orders together.

create or replace function public.rename_step_name(step_id uuid, new_name text)
returns void language plpgsql security definer
set search_path to 'public', 'pg_catalog', 'pg_temp' as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if nullif(trim(new_name), '') is null then raise exception 'A step needs a name'; end if;
  update public.steps set name = trim(new_name) where id = step_id;
  if not found then raise exception 'That step no longer exists'; end if;
end $$;

create function public.require_structure_author() returns void
language plpgsql set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode='42501';
  end if;
end $$;

create function public.check_structure_draft_order(current_ids uuid[], requested jsonb)
returns void language plpgsql set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  if jsonb_typeof(requested) is distinct from 'array' then
    raise exception 'Reload this path and include every item exactly once, plus the new item';
  end if;
  if jsonb_array_length(requested) <> coalesce(cardinality(current_ids),0)+1
    or (select count(*) from jsonb_array_elements_text(requested) x where x='new') <> 1
    or (select count(distinct x) from jsonb_array_elements_text(requested) x) <> jsonb_array_length(requested)
    or exists(select 1 from jsonb_array_elements_text(requested) x where x <> 'new' and not x = any(coalesce(current_ids,'{}')::text[])) then
    raise exception 'Reload this path and include every item exactly once, plus the new item';
  end if;
end $$;

create function public.add_step_with_details(
  path_id uuid, name text, path_orders jsonb, summary text default null
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare sc uuid; p uuid; requested jsonb; ids uuid[]; new_id uuid; snapshot jsonb := '{}'; after_orders jsonb := '{}'; f jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  select scenario_id into sc from public.paths where id=add_step_with_details.path_id;
  if not found then raise exception 'That path no longer exists. Reload and choose a path'; end if;
  if jsonb_typeof(path_orders) is distinct from 'object' or path_orders='{}' or not path_orders ? path_id::text then
    raise exception 'Choose at least the path where you opened the new step';
  end if;
  perform 1 from public.paths where scenario_id=sc order by id for update;
  for p,requested in select key::uuid,value from jsonb_each(path_orders) order by key loop
    if not exists(select 1 from public.paths where id=p and scenario_id=sc) then raise exception 'Choose paths in the same scenario'; end if;
    perform 1 from public.path_steps where path_steps.path_id=p order by step_id for update;
    select array_agg(step_id order by position),coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into ids,f from public.path_steps where path_steps.path_id=p;
    perform public.check_structure_draft_order(ids,requested);
    snapshot := snapshot || jsonb_build_object(p,f);
  end loop;
  new_id := public.add_step(path_id,trim(name),null::integer);
  update public.steps set summary=nullif(trim(add_step_with_details.summary),'') where id=new_id;
  for p,requested in select key::uuid,value from jsonb_each(path_orders) order by key loop
    if not exists(select 1 from public.path_steps where path_steps.path_id=p and step_id=new_id) then
    insert into public.path_steps(path_id,step_id,position)
      select p,new_id,coalesce(max(position)+1,0) from public.path_steps where path_steps.path_id=p;
    end if;
    update public.path_steps ps set position=q.ordinality-1
      from jsonb_array_elements_text(requested) with ordinality q(id,ordinality)
      where ps.path_id=p and ps.step_id=case when q.id='new' then new_id else q.id::uuid end;
    select jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position) into f from public.path_steps where path_steps.path_id=p;
    after_orders := after_orders || jsonb_build_object(p,f);
  end loop;
  return jsonb_build_object('kind','step','ids',jsonb_build_array(new_id),'before',snapshot,'after',after_orders);
end $$;

create function public.add_lane_with_details(
  scenario_id uuid, name text, lane_role text, path_orders jsonb, details jsonb default '{}'
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid; requested jsonb; ids uuid[]; new_id uuid; created uuid[] := '{}'; by_path jsonb := '{}'; snapshot jsonb := '{}'; after_orders jsonb := '{}'; rows jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  if nullif(trim(lane_role),'') is null then raise exception 'Choose a role'; end if;
  if jsonb_typeof(path_orders) is distinct from 'object' or path_orders='{}' then raise exception 'Choose at least one path'; end if;
  if jsonb_typeof(coalesce(details->'kpis','[]')) <> 'array' or jsonb_typeof(coalesce(details->'tools','[]')) <> 'array' then raise exception 'KPIs and tools must be lists'; end if;
  perform 1 from public.paths where paths.scenario_id=add_lane_with_details.scenario_id order by id for update;
  for p,requested in select key::uuid,value from jsonb_each(path_orders) order by key loop
    if not exists(select 1 from public.paths where id=p and paths.scenario_id=add_lane_with_details.scenario_id) then raise exception 'Choose paths in the same scenario'; end if;
    perform 1 from public.lanes where lanes.path_id=p order by id for update;
    if exists(select 1 from public.lanes where lanes.path_id=p and lower(trim(lanes.name))=lower(trim(add_lane_with_details.name))) then
      raise exception 'This path already has a lane named %. Choose another name or untick this path',trim(name);
    end if;
    select array_agg(id order by position),coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into ids,rows from public.lanes where lanes.path_id=p;
    perform public.check_structure_draft_order(ids,requested);
    snapshot := snapshot || jsonb_build_object(p,rows);
    insert into public.lanes(path_id,name,lane_role,position,owner_team,stakeholder_id,kpis,tools,origin)
    values(p,trim(name),lane_role,coalesce((select max(position)+1 from public.lanes where lanes.path_id=p),0),nullif(trim(details->>'owner_team'),''),nullif(details->>'stakeholder_id','')::uuid,coalesce(details->'kpis','[]'),coalesce(details->'tools','[]'),'app') returning id into new_id;
    created := array_append(created,new_id);
    by_path := by_path || jsonb_build_object(p,new_id);
    update public.lanes l set position=q.ordinality-1 from jsonb_array_elements_text(requested) with ordinality q(id,ordinality)
      where l.path_id=p and l.id=case when q.id='new' then new_id else q.id::uuid end;
    select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) into rows from public.lanes where lanes.path_id=p;
    after_orders := after_orders || jsonb_build_object(p,rows);
  end loop;
  return jsonb_build_object('kind','lane','ids',to_jsonb(created),'by_path',by_path,'before',snapshot,'after',after_orders);
end $$;

create function public.undo_structure_add(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid; rows jsonb; actual jsonb; ids uuid[];
begin
  perform public.require_structure_author();
  if snapshot->>'kind' not in ('lane','step') or jsonb_typeof(snapshot->'before') is distinct from 'object' then raise exception 'This change cannot be undone. Reload the canvas'; end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(snapshot->'ids') x;
  perform 1 from public.paths where id in(select key::uuid from jsonb_each(snapshot->'before')) order by id for update;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'after') order by key loop
    if snapshot->>'kind'='step' then
      select jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position) into actual from public.path_steps where path_id=p;
    else
      select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) into actual from public.lanes where path_id=p;
    end if;
    if actual is distinct from rows then raise exception 'This path changed since Add. Reload before undoing this change'; end if;
  end loop;
  if snapshot->>'kind'='step' then delete from public.steps where id=any(ids);
  else delete from public.lanes where id=any(ids); end if;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'before') loop
    if snapshot->>'kind'='step' then
      update public.path_steps ps set position=(q->>'position')::int from jsonb_array_elements(rows) q where ps.path_id=p and ps.step_id=(q->>'id')::uuid;
    else
      update public.lanes l set position=(q->>'position')::int from jsonb_array_elements(rows) q where l.path_id=p and l.id=(q->>'id')::uuid;
    end if;
  end loop;
end $$;

-- A lane is one path's row. A later rename must not rewrite its neighbours.
create or replace function public.rename_lane(lane_id uuid,new_name text) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid;
begin
  perform public.require_structure_author();
  if nullif(trim(new_name),'') is null then raise exception 'Enter a name'; end if;
  select path_id into p from public.lanes where id=lane_id;
  if not found then raise exception 'That lane no longer exists'; end if;
  perform 1 from public.paths where id=p for update;
  perform 1 from public.lanes where id=lane_id and path_id=p for update;
  if not found then raise exception 'That lane no longer exists'; end if;
  if exists(select 1 from public.lanes where path_id=p and id<>lane_id and lower(trim(name))=lower(trim(new_name))) then raise exception 'This path already has that lane name. Choose another name'; end if;
  update public.lanes set name=trim(new_name) where id=lane_id;
end $$;

-- Name and properties are one panel save; its result captures the exact inverse.
create function public.update_step_with_details(step_id uuid, name text, summary text)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare previous jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  select jsonb_build_object('step_id',s.id,'name',s.name,'summary',s.summary) into previous
    from public.steps s where s.id=step_id for update;
  if not found then raise exception 'That step no longer exists'; end if;
  update public.steps s set name=trim(update_step_with_details.name),summary=nullif(trim(update_step_with_details.summary),'') where s.id=step_id;
  return previous;
end $$;

create function public.restore_step_details(snapshot jsonb)
returns void language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  if nullif(trim(snapshot->>'name'),'') is null then raise exception 'The saved step name is missing'; end if;
  update public.steps set name=snapshot->>'name',summary=snapshot->>'summary' where id=(snapshot->>'step_id')::uuid;
  if not found then raise exception 'That step no longer exists'; end if;
end $$;

create function public.update_lane_with_details(lane_id uuid, lane_ids uuid[], name text, details jsonb)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare original_name text; sc uuid; p uuid; previous jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  if jsonb_typeof(details->'kpis') is distinct from 'array' or jsonb_typeof(details->'tools') is distinct from 'array' then raise exception 'KPIs and tools must be lists'; end if;
  select l.name,paths.scenario_id,l.path_id into original_name,sc,p from public.lanes l join public.paths on paths.id=l.path_id where l.id=lane_id;
  if not found then raise exception 'That lane no longer exists'; end if;
  perform 1 from public.paths where scenario_id=sc order by id for update;
  perform 1 from public.lanes where id=any(lane_ids) order by id for update;
  if not lane_id=any(lane_ids) or cardinality(lane_ids) is distinct from
    (select count(distinct l.id)::integer from public.lanes l join public.paths on paths.id=l.path_id where l.id=any(lane_ids) and paths.scenario_id=sc and l.name=original_name) then
    raise exception 'Reload the lane before saving its properties';
  end if;
  select jsonb_build_object('lane_id',lane_id,'name',original_name,'rows',jsonb_agg(jsonb_build_object('id',id,'owner_team',owner_team,'stakeholder_id',stakeholder_id,'kpis',kpis,'tools',tools) order by id)) into previous from public.lanes where id=any(lane_ids);
  perform public.rename_lane(lane_id,name);
  update public.lanes set owner_team=nullif(trim(details->>'owner_team'),''),stakeholder_id=nullif(details->>'stakeholder_id','')::uuid,kpis=details->'kpis',tools=details->'tools' where id=any(lane_ids);
  return previous;
end $$;

create function public.restore_lane_details(snapshot jsonb)
returns void language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare row_data jsonb;
begin
  perform public.require_structure_author();
  if jsonb_typeof(snapshot->'rows') is distinct from 'array' then raise exception 'The saved lane properties are missing'; end if;
  -- The rename uses the same path lock and duplicate-name guard as the forward save.
  perform public.rename_lane((snapshot->>'lane_id')::uuid,snapshot->>'name');
  for row_data in select value from jsonb_array_elements(snapshot->'rows') order by value->>'id' loop
    update public.lanes set owner_team=row_data->>'owner_team',stakeholder_id=nullif(row_data->>'stakeholder_id','')::uuid,kpis=row_data->'kpis',tools=row_data->'tools' where id=(row_data->>'id')::uuid;
    if not found then raise exception 'A lane no longer exists. Reload before undoing'; end if;
  end loop;
end $$;

-- Clear PUBLIC and explicit host defaults before the recipe grants its roles.
do $acl$
declare fn regprocedure; role_name text;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('require_structure_author','check_structure_draft_order','add_step_with_details','add_lane_with_details','undo_structure_add','rename_step_name','rename_lane','update_step_with_details','update_lane_with_details','restore_step_details','restore_lane_details') loop
    execute format('revoke all on function %s from public',fn);
    for role_name in select r.rolname from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid=fn::oid and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,role_name); end loop;
  end loop;
end $acl$;

-- Atomic write and undo proof; every fixture rolls back.
do $proof$
declare svc uuid; ph uuid; sc uuid; a uuid; b uuid; first_step uuid; last_step uuid; outcome jsonb; lanes jsonb; before_order jsonb; before_lanes jsonb; a1 uuid; a2 uuid; b1 uuid; b2 uuid;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Atomic draft fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Draft phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Draft scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Online','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Phone','variant') returning id into b;
  first_step := public.add_step(a,'Start',4);
  last_step := public.add_step(a,'Finish',9);
  insert into public.path_steps(path_id,step_id,position) values(b,first_step,2),(b,last_step,7);
  before_order := (select jsonb_agg(jsonb_build_object('path_id',path_id,'step_id',step_id,'position',position) order by path_id,position) from public.path_steps where path_id in(a,b));
  outcome := public.add_step_with_details(a,'Review',jsonb_build_object(a,jsonb_build_array(last_step,'new',first_step),b,jsonb_build_array(first_step,last_step,'new')), 'Review the request.');
  if (select count(*) from public.path_steps where step_id=(outcome->'ids'->>0)::uuid) <> 2 then raise exception 'new step did not reach both paths'; end if;
  if (select summary from public.steps where id=(outcome->'ids'->>0)::uuid) <> 'Review the request.' then raise exception 'step summary missing'; end if;
  if (select position from public.path_steps where path_id=a and step_id=last_step) <> 0 then raise exception 'existing step did not move'; end if;
  update public.path_steps set position=99 where path_id=a and step_id=last_step;
  begin
    perform public.undo_structure_add(outcome);
    raise exception 'undo replaced a newer order';
  exception when raise_exception then if sqlerrm <> 'This path changed since Add. Reload before undoing this change' then raise; end if; end;
  update public.path_steps set position=0 where path_id=a and step_id=last_step;
  perform public.undo_structure_add(outcome);
  if exists(select 1 from public.steps where id=(outcome->'ids'->>0)::uuid) then raise exception 'step undo left the item'; end if;
  if before_order is distinct from (select jsonb_agg(jsonb_build_object('path_id',path_id,'step_id',step_id,'position',position) order by path_id,position) from public.path_steps where path_id in(a,b)) then raise exception 'undo did not restore exact stored positions'; end if;
  begin
    perform public.add_step_with_details(a,'Invalid',jsonb_build_object(a,jsonb_build_array(first_step,'new')));
    raise exception 'bad order accepted';
  exception when raise_exception then if sqlerrm <> 'Reload this path and include every item exactly once, plus the new item' then raise; end if; end;
  if exists(select 1 from public.steps where scenario_id=sc and name='Invalid') then raise exception 'failed order leaked step'; end if;
  insert into public.lanes(path_id,name,position,lane_role) values(a,'Start actor',3,'frontstage_actions') returning id into a1;
  insert into public.lanes(path_id,name,position,lane_role) values(a,'End actor',8,'backstage_actions') returning id into a2;
  insert into public.lanes(path_id,name,position,lane_role) values(b,'Start actor',2,'frontstage_actions') returning id into b1;
  insert into public.lanes(path_id,name,position,lane_role) values(b,'End actor',7,'backstage_actions') returning id into b2;
  before_lanes := (select jsonb_agg(jsonb_build_object('id',id,'position',position) order by id) from public.lanes where path_id in(a,b));
  begin
    perform public.add_lane_with_details(sc,'Bad order','frontstage_actions',jsonb_build_object(a,jsonb_build_array(a1,a1,'new'),b,jsonb_build_array(b1,b2,'new')));
    raise exception 'bad lane order accepted';
  exception when raise_exception then if sqlerrm <> 'Reload this path and include every item exactly once, plus the new item' then raise; end if; end;
  if exists(select 1 from public.lanes where path_id in(a,b) and name='Bad order') then raise exception 'failed lane order leaked an item'; end if;
  lanes := public.add_lane_with_details(sc,'Reviewer','frontstage_actions',jsonb_build_object(a,jsonb_build_array(a2,'new',a1),b,jsonb_build_array('new',b2,b1)), '{"owner_team":"Operations"}');
  if jsonb_array_length(lanes->'ids') <> 2 or (select count(*) from public.lanes where path_id in(a,b) and name='Reviewer' and owner_team='Operations') <> 2 then raise exception 'per-path lane fields missing'; end if;
  perform public.rename_lane((select id from public.lanes where path_id=a and name='Reviewer'),'Assessor');
  if (select count(*) from public.lanes where path_id in(a,b) and name='Reviewer') <> 1 then raise exception 'lane rename changed another path'; end if;
  begin
    perform public.add_lane_with_details(sc,'reviewer','frontstage_actions',jsonb_build_object(b,jsonb_build_array('new')));
    raise exception 'duplicate accepted';
  exception when raise_exception then if sqlerrm not like 'This path already has a lane named %. Choose another name or untick this path' then raise; end if; end;
  perform public.undo_structure_add(lanes);
  if before_lanes is distinct from (select jsonb_agg(jsonb_build_object('id',id,'position',position) order by id) from public.lanes where path_id in(a,b)) then raise exception 'lane undo did not restore every row and exact order'; end if;
  raise exception 'draft proof complete';
exception when raise_exception then if sqlerrm <> 'draft proof complete' then raise; end if;
end $proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000310000000_path_orders_are_guarded_permutations.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-24. Path orders use complete identity permutations.
-- Each reorder owns one path and captures the exact inverse.
drop function public.reorder_steps(uuid,uuid[]);
-- Earlier recipe grants still name this signature; it remains a refusal, never a name-based write.
create or replace function public.reorder_lanes(scenario_id uuid, lane_names text[]) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  raise exception 'Reload: the app was updated';
end $$;

create function public.apply_structure_order(path_id uuid, kind text, ids uuid[])
returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare current_ids uuid[]; before_rows jsonb; after_rows jsonb;
begin
  perform public.require_structure_author();
  if kind not in ('lane','step') or kind is null then raise exception 'Choose lanes or steps to reorder'; end if;
  perform 1 from public.paths p where p.id=path_id for update;
  if not found then raise exception 'This path no longer exists. Reload the canvas'; end if;
  if kind='step' then
    perform 1 from public.path_steps ps where ps.path_id=apply_structure_order.path_id order by step_id for update;
    select array_agg(step_id order by position),coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into current_ids,before_rows from public.path_steps ps where ps.path_id=apply_structure_order.path_id;
  else
    perform 1 from public.lanes l where l.path_id=apply_structure_order.path_id order by id for update;
    select array_agg(id order by position),coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into current_ids,before_rows from public.lanes l where l.path_id=apply_structure_order.path_id;
  end if;
  if ids is null or cardinality(ids)<>coalesce(cardinality(current_ids),0)
    or (select count(distinct id) from unnest(ids) id)<>cardinality(ids)
    or exists(select 1 from unnest(ids) id where id is null or not id=any(coalesce(current_ids,'{}'))) then
    raise exception 'Reload this path and include every item exactly once';
  end if;
  if kind='step' then
    update public.path_steps ps set position=q.ordinality-1 from unnest(ids) with ordinality q(id,ordinality) where ps.path_id=apply_structure_order.path_id and ps.step_id=q.id;
  else
    update public.lanes l set position=q.ordinality-1 from unnest(ids) with ordinality q(id,ordinality) where l.path_id=apply_structure_order.path_id and l.id=q.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',ordinality-1) order by ordinality),'[]') into after_rows from unnest(ids) with ordinality q(id,ordinality);
  return jsonb_build_object('kind',kind,'path_id',path_id,'before',before_rows,'after',after_rows);
end $$;

create function public.reorder_steps(path_id uuid, step_ids uuid[]) returns jsonb
language sql security definer set search_path to 'public','pg_catalog','pg_temp'
as $$ select public.apply_structure_order(path_id,'step',step_ids) $$;
create function public.reorder_lanes(path_id uuid, lane_ids uuid[]) returns jsonb
language sql security definer set search_path to 'public','pg_catalog','pg_temp'
as $$ select public.apply_structure_order(path_id,'lane',lane_ids) $$;

create function public.undo_structure_order(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid := (snapshot->>'path_id')::uuid; kind text := snapshot->>'kind'; actual jsonb; ids uuid[];
begin
  perform public.require_structure_author();
  if kind not in ('step','lane') or kind is null or jsonb_typeof(snapshot->'before') is distinct from 'array' or jsonb_typeof(snapshot->'after') is distinct from 'array' then raise exception 'This order cannot be undone. Reload the canvas'; end if;
  perform 1 from public.paths where id=p for update;
  if kind='step' then
    select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into actual from public.path_steps where path_id=p;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into actual from public.lanes where path_id=p;
  end if;
  if actual is distinct from snapshot->'after' then raise exception 'This path changed since Move. Reload before undoing this change'; end if;
  select coalesce(array_agg((q->>'id')::uuid),'{}') into ids from jsonb_array_elements(snapshot->'before') q;
  perform public.apply_structure_order(p,kind,ids);
  if kind='step' then
    update public.path_steps ps set position=(q->>'position')::int from jsonb_array_elements(snapshot->'before') q where ps.path_id=p and ps.step_id=(q->>'id')::uuid;
  else
    update public.lanes l set position=(q->>'position')::int from jsonb_array_elements(snapshot->'before') q where l.path_id=p and l.id=(q->>'id')::uuid;
  end if;
end $$;

-- Clear inherited host grants as well as PUBLIC without requiring host roles in the core.
do $acl$
declare fn regprocedure; role_name text;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('apply_structure_order','reorder_steps','reorder_lanes','undo_structure_order') loop
    execute format('revoke all on function %s from public',fn);
    for role_name in select r.rolname from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid=fn::oid and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,role_name); end loop;
  end loop;
end $acl$;
-- Real rows, both kinds, exact undo, malformed orders and reader refusal; all rolled back.
do $proof$
declare svc uuid; ph uuid; sc uuid; a uuid; b uuid; first_id uuid; last_id uuid; snapshot jsonb; kind text; ids uuid[];
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Order fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Online','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Phone','variant') returning id into b;
  foreach kind in array array['step','lane'] loop
    if kind='step' then
      first_id := public.add_step(a,'Start',4); last_id := public.add_step(a,'Finish',9);
      insert into public.path_steps(path_id,step_id,position) values(b,first_id,2),(b,last_id,7);
      snapshot := public.reorder_steps(a,array[last_id,first_id]);
    else
      insert into public.lanes(path_id,name,position) values(a,'Actor',4) returning id into first_id;
      insert into public.lanes(path_id,name,position) values(a,'System',9) returning id into last_id;
      snapshot := public.reorder_lanes(a,array[last_id,first_id]);
    end if;
    if snapshot->'after'->0->>'id' <> last_id::text then raise exception 'reorder failed'; end if;
    foreach ids slice 1 in array array[array[first_id,first_id],array[first_id,null::uuid],array[first_id,gen_random_uuid()]] loop
      begin
        perform public.apply_structure_order(a,kind,ids);
        raise exception 'invalid permutation accepted';
      exception when raise_exception then if sqlerrm <> 'Reload this path and include every item exactly once' then raise; end if; end;
    end loop;
    begin
      perform public.apply_structure_order(a,kind,array[first_id]); raise exception 'partial order accepted';
    exception when raise_exception then if sqlerrm <> 'Reload this path and include every item exactly once' then raise; end if; end;
    perform public.undo_structure_order(snapshot);
    if kind='step' then
      if (select position from public.path_steps where path_id=a and step_id=first_id) <> 4 or (select position from public.path_steps where path_id=b and step_id=first_id) <> 2 then raise exception 'step undo changed stored positions or another path'; end if;
    elsif (select position from public.lanes where id=first_id) <> 4 then raise exception 'lane undo changed stored positions'; end if;
    begin
      perform public.undo_structure_order(snapshot); raise exception 'stale inverse accepted';
    exception when raise_exception then if sqlerrm <> 'This path changed since Move. Reload before undoing this change' then raise; end if; end;
  end loop;
  raise exception 'order proof complete';
exception when raise_exception then if sqlerrm <> 'order proof complete' then raise; end if;
end $proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000311000000_structure_undo_and_edits_refuse_stale_state.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-25. Undo must not discard later work or trust unchecked destinations.
create or replace function public.undo_structure_add(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid; rows jsonb; actual jsonb; ids uuid[]; kind text := snapshot->>'kind'; memberships uuid[]; named_paths uuid[]; n integer;
begin
  perform public.require_structure_author();
  if kind is null or kind not in ('lane','step')
    or jsonb_typeof(snapshot->'before') is distinct from 'object'
    or jsonb_typeof(snapshot->'after') is distinct from 'object' or snapshot->'after'='{}'
    or jsonb_typeof(snapshot->'ids') is distinct from 'array' or snapshot->'ids'='[]'
    or (select array_agg(key order by key) from jsonb_each(snapshot->'before')) is distinct from
       (select array_agg(key order by key) from jsonb_each(snapshot->'after')) then
    raise exception 'This change cannot be undone. Reload the canvas';
  end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(snapshot->'ids') x;
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or array_position(ids,null) is not null then
    raise exception 'This change cannot be undone. Reload the canvas';
  end if;
  select array_agg(key::uuid order by key::uuid) into named_paths from jsonb_each(snapshot->'after');
  perform 1 from public.paths where id=any(named_paths) order by id for update;
  if kind='step' then
    perform 1 from public.steps where id=any(ids) order by id for update;
    select count(*) into n from public.steps where id=any(ids);
    select array_agg(distinct path_id order by path_id) into memberships from public.path_steps where step_id=any(ids);
  else
    perform 1 from public.lanes where id=any(ids) order by id for update;
    select count(*) into n from public.lanes where id=any(ids);
    select array_agg(distinct path_id order by path_id) into memberships from public.lanes where id=any(ids);
  end if;
  if n<>cardinality(ids) or memberships is distinct from named_paths then raise exception 'This change cannot be undone. Reload the canvas'; end if;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'after') order by key loop
    if jsonb_typeof(rows) is distinct from 'array' or jsonb_typeof(snapshot->'before'->p::text) is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(snapshot->'before'->p::text) with ordinality q(value,n)
        where coalesce(q.value->>'position','') !~ '^(0|[1-9][0-9]*)$'
           or (q.value->>'position')::numeric is distinct from q.n-1)
      or (select count(*) from jsonb_array_elements(snapshot->'before'->p::text)) <>
         (select count(distinct q->>'id') from jsonb_array_elements(snapshot->'before'->p::text) q)
      or (select array_agg(q->>'id' order by q->>'id') from jsonb_array_elements(snapshot->'before'->p::text) q) is distinct from
         (select array_agg(q->>'id' order by q->>'id') from jsonb_array_elements(rows) q where not (q->>'id')::uuid=any(ids)) then
      raise exception 'This change cannot be undone. Reload the canvas';
    end if;
    if kind='step' then
      select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into actual from public.path_steps where path_id=p;
    else
      select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into actual from public.lanes where path_id=p;
    end if;
    if actual is distinct from rows then raise exception 'This path changed since Add. Reload before undoing this change'; end if;
  end loop;
  -- FOR UPDATE on the parent ids also excludes concurrent FK inserts while
  -- checking dependent content. Even a blank cell is later authored work.
  if kind='step' then
    if exists(select 1 from public.cells where step_id=any(ids)) then raise exception 'This step has content since Add. Delete it instead if you mean to'; end if;
    delete from public.steps where id=any(ids);
  else
    if exists(select 1 from public.cells where lane_id=any(ids)) then raise exception 'This lane has content since Add. Delete it instead if you mean to'; end if;
    delete from public.lanes where id=any(ids);
  end if;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'before') loop
    if kind='step' then
      update public.path_steps ps set position=(q->>'position')::int from jsonb_array_elements(rows) q where ps.path_id=p and ps.step_id=(q->>'id')::uuid;
    else
      update public.lanes l set position=(q->>'position')::int from jsonb_array_elements(rows) q where l.path_id=p and l.id=(q->>'id')::uuid;
    end if;
  end loop;
end $$;

create or replace function public.update_step_with_details(step_id uuid, name text, summary text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare previous jsonb; after_row jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  select jsonb_build_object('step_id',s.id,'name',s.name,'summary',s.summary) into previous from public.steps s where s.id=step_id for update;
  if not found then raise exception 'That step no longer exists'; end if;
  update public.steps s set name=trim(update_step_with_details.name),summary=nullif(trim(update_step_with_details.summary),'') where s.id=step_id returning to_jsonb(s) into after_row;
  return previous||jsonb_build_object('after',after_row);
end $$;
create or replace function public.restore_step_details(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare actual jsonb;
begin
  perform public.require_structure_author();
  select to_jsonb(s) into actual from public.steps s where s.id=(snapshot->>'step_id')::uuid for update;
  if actual is null or actual is distinct from snapshot->'after' then raise exception 'This step changed since your save'; end if;
  if nullif(trim(snapshot->>'name'),'') is null then raise exception 'The saved step name is missing'; end if;
  update public.steps set name=snapshot->>'name',summary=snapshot->>'summary' where id=(snapshot->>'step_id')::uuid;
end $$;
create or replace function public.update_lane_with_details(lane_id uuid, lane_ids uuid[], name text, details jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare previous jsonb; after_row jsonb; p uuid;
begin
  perform public.require_structure_author();
  if nullif(trim(name),'') is null then raise exception 'Enter a name'; end if;
  if jsonb_typeof(details->'kpis') is distinct from 'array' or jsonb_typeof(details->'tools') is distinct from 'array' then raise exception 'KPIs and tools must be lists'; end if;
  select path_id into p from public.lanes where id=lane_id;
  perform 1 from public.paths where id=p for update;
  select jsonb_build_object('lane_id',l.id,'name',l.name,'rows',jsonb_build_array(jsonb_build_object('id',l.id,'owner_team',l.owner_team,'stakeholder_id',l.stakeholder_id,'kpis',l.kpis,'tools',l.tools))) into previous from public.lanes l where l.id=lane_id for update;
  if not found then raise exception 'That lane no longer exists'; end if;
  -- lane_ids is retained for wire compatibility only; a lane belongs to one path.
  perform public.rename_lane_checked(lane_id,name);
  update public.lanes l set owner_team=nullif(trim(details->>'owner_team'),''),stakeholder_id=nullif(details->>'stakeholder_id','')::uuid,kpis=details->'kpis',tools=details->'tools' where l.id=lane_id returning to_jsonb(l) into after_row;
  return previous||jsonb_build_object('after',after_row);
end $$;
create or replace function public.restore_lane_details(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare actual jsonb; row_data jsonb; p uuid; target uuid := (snapshot->>'lane_id')::uuid;
begin
  perform public.require_structure_author();
  select path_id into p from public.lanes where id=target;
  perform 1 from public.paths where id=p for update;
  select to_jsonb(l) into actual from public.lanes l where l.id=target for update;
  if actual is null or actual is distinct from snapshot->'after' then raise exception 'This lane changed since your save'; end if;
  if jsonb_typeof(snapshot->'rows') is distinct from 'array' or jsonb_array_length(snapshot->'rows')<>1 or (snapshot->'rows'->0->>'id')::uuid is distinct from target then raise exception 'The saved lane properties are missing'; end if;
  row_data:=snapshot->'rows'->0;
  perform public.rename_lane_checked(target,snapshot->>'name');
  update public.lanes set owner_team=row_data->>'owner_team',stakeholder_id=nullif(row_data->>'stakeholder_id','')::uuid,kpis=row_data->'kpis',tools=row_data->'tools' where id=target;
end $$;

-- Renames capture their before-value under the write lock, never from a stale client.
drop function public.rename_step_name(uuid,text);
create function public.rename_step_name(step_id uuid,new_name text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare previous jsonb; after_row jsonb;
begin
  perform public.require_structure_author();
  if nullif(trim(new_name),'') is null then raise exception 'Enter a name'; end if;
  select jsonb_build_object('step_id',s.id,'name',s.name,'summary',s.summary) into previous from public.steps s where s.id=step_id for update;
  if not found then raise exception 'That step no longer exists'; end if;
  update public.steps s set name=trim(new_name) where s.id=step_id returning to_jsonb(s) into after_row;
  return previous||jsonb_build_object('after',after_row);
end $$;
-- Keep rename_lane's existing guarded write as a private helper for the panel and inverse.
alter function public.rename_lane(uuid,text) rename to rename_lane_checked;
create function public.rename_lane(lane_id uuid,new_name text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare previous jsonb; after_row jsonb; p uuid;
begin
  perform public.require_structure_author();
  select path_id into p from public.lanes where id=lane_id;
  perform 1 from public.paths where id=p for update;
  select jsonb_build_object('lane_id',l.id,'name',l.name,'rows',jsonb_build_array(jsonb_build_object('id',l.id,'owner_team',l.owner_team,'stakeholder_id',l.stakeholder_id,'kpis',l.kpis,'tools',l.tools))) into previous from public.lanes l where l.id=lane_id for update;
  if not found then raise exception 'That lane no longer exists'; end if;
  perform public.rename_lane_checked(lane_id,new_name);
  select to_jsonb(l) into after_row from public.lanes l where l.id=lane_id;
  return previous||jsonb_build_object('after',after_row);
end $$;

create function public.apply_structure_order(path_id uuid, kind text, ids uuid[], expected_ids uuid[])
returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare current_ids uuid[]; before_rows jsonb; after_rows jsonb;
begin
  perform public.require_structure_author();
  if kind not in ('lane','step') or kind is null then raise exception 'Choose lanes or steps to reorder'; end if;
  perform 1 from public.paths p where p.id=path_id for update;
  if not found then raise exception 'This path no longer exists. Reload the canvas'; end if;
  if kind='step' then
    perform 1 from public.path_steps ps where ps.path_id=apply_structure_order.path_id order by step_id for update;
    select array_agg(step_id order by position),coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into current_ids,before_rows from public.path_steps ps where ps.path_id=apply_structure_order.path_id;
  else
    perform 1 from public.lanes l where l.path_id=apply_structure_order.path_id order by id for update;
    select array_agg(id order by position),coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into current_ids,before_rows from public.lanes l where l.path_id=apply_structure_order.path_id;
  end if;
  if expected_ids is distinct from coalesce(current_ids,'{}'::uuid[]) then raise exception 'This path changed. Reload and try again'; end if;
  if ids is null or cardinality(ids)<>coalesce(cardinality(current_ids),0)
    or (select count(distinct id) from unnest(ids) id)<>cardinality(ids)
    or exists(select 1 from unnest(ids) id where id is null or not id=any(coalesce(current_ids,'{}'))) then
    raise exception 'Reload this path and include every item exactly once';
  end if;
  if kind='step' then
    update public.path_steps ps set position=q.ordinality-1 from unnest(ids) with ordinality q(id,ordinality) where ps.path_id=apply_structure_order.path_id and ps.step_id=q.id;
  else
    update public.lanes l set position=q.ordinality-1 from unnest(ids) with ordinality q(id,ordinality) where l.path_id=apply_structure_order.path_id and l.id=q.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',ordinality-1) order by ordinality),'[]') into after_rows from unnest(ids) with ordinality q(id,ordinality);
  return jsonb_build_object('kind',kind,'path_id',path_id,'before',before_rows,'after',after_rows);
end $$;

create function public.reorder_steps(path_id uuid, step_ids uuid[], expected_ids uuid[]) returns jsonb
language sql security definer set search_path to 'public','pg_catalog','pg_temp'
as $$ select public.apply_structure_order(path_id,'step',step_ids,expected_ids) $$;
create function public.reorder_lanes(path_id uuid, lane_ids uuid[], expected_ids uuid[]) returns jsonb
language sql security definer set search_path to 'public','pg_catalog','pg_temp'
as $$ select public.apply_structure_order(path_id,'lane',lane_ids,expected_ids) $$;

create or replace function public.undo_structure_order(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid := (snapshot->>'path_id')::uuid; kind text := snapshot->>'kind'; actual jsonb; ids uuid[];
begin
  perform public.require_structure_author();
  if kind not in ('step','lane') or kind is null or jsonb_typeof(snapshot->'before') is distinct from 'array' or jsonb_typeof(snapshot->'after') is distinct from 'array' then raise exception 'This order cannot be undone. Reload the canvas'; end if;
  perform 1 from public.paths where id=p for update;
  if kind='step' then
    select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into actual from public.path_steps where path_id=p;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into actual from public.lanes where path_id=p;
  end if;
  if actual is distinct from snapshot->'after' then raise exception 'This path changed since Move. Reload before undoing this change'; end if;
  select coalesce(array_agg((q->>'id')::uuid),'{}') into ids from jsonb_array_elements(snapshot->'before') q;
  perform public.apply_structure_order(p,kind,ids,array(select (q->>'id')::uuid from jsonb_array_elements(actual) q));
  if kind='step' then
    update public.path_steps ps set position=(q->>'position')::int from jsonb_array_elements(snapshot->'before') q where ps.path_id=p and ps.step_id=(q->>'id')::uuid;
  else
    update public.lanes l set position=(q->>'position')::int from jsonb_array_elements(snapshot->'before') q where l.path_id=p and l.id=(q->>'id')::uuid;
  end if;
end $$;


-- Older apps remain authorized to receive a useful reload refusal, never a write.
create or replace function public.reorder_steps(path_id uuid, step_ids uuid[]) returns jsonb
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  raise exception 'Reload: the app was updated';
end $$;
create or replace function public.reorder_lanes(path_id uuid, lane_ids uuid[]) returns jsonb
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  raise exception 'Reload: the app was updated';
end $$;
create or replace function public.reorder_lanes(scenario_id uuid, lane_names text[]) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  raise exception 'Reload: the app was updated';
end $$;
drop function public.apply_structure_order(uuid,text,uuid[]);

-- Explicit ACLs include the renamed helper and overloads; none inherit PUBLIC access.
do $acl$
declare fn regprocedure; role_name text;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('undo_structure_add','rename_step_name','rename_lane','rename_lane_checked','update_step_with_details','update_lane_with_details','restore_step_details','restore_lane_details','apply_structure_order','reorder_steps','reorder_lanes','undo_structure_order') loop
  execute format('revoke all on function %s from public',fn);
  for role_name in select r.rolname from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid=fn::oid and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,role_name); end loop;
 end loop;
end $acl$;
-- Real content and concurrent edits must survive Undo; fixtures roll back.
create function pg_temp.expect_structure_refusal(statement text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Unexpected success: %',statement using errcode='ZX001';
  exception when others then
    if sqlerrm is distinct from message then raise exception 'Expected %, got %',message,sqlerrm; end if;
  end;
end $$;
do $proof$
declare svc uuid; ph uuid; sc uuid; a uuid; b uuid; s uuid; t uuid; la uuid; lb uuid; added jsonb; saved jsonb; created_id uuid; cell uuid; target_cell uuid; kind text;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Guarded structure fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Online','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Phone','variant') returning id into b;
  s:=public.add_step(a,'Start',0); t:=public.add_step(a,'Finish',1);
  insert into public.path_steps(path_id,step_id,position) values(b,s,0),(b,t,1);
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Front desk','customer_actions',0) returning id into la;
  insert into public.lanes(path_id,name,lane_role,position) values(b,'Front desk','customer_actions',0) returning id into lb;
  added:=public.add_step_with_details(a,'Review',jsonb_build_object(a,jsonb_build_array(s,'new',t),b,jsonb_build_array(s,t,'new')));
  created_id:=(added->'ids'->>0)::uuid;
  insert into public.cells(path_id,lane_id,step_id,content) values(a,la,created_id,'New work') returning cells.id into cell;
  update public.cells set cell_key=cell::text where cells.id=cell;
  insert into public.evidence(service_id,cell_id,cell_key,kind,title) select svc,cell,c.cell_key,'doc','Later evidence' from public.cells c where c.id=cell;
  insert into public.resources(cell_id,name,url,position,origin) values(cell,'Later resource','https://example.com/reference',0,'app');
  insert into public.cells(path_id,lane_id,step_id,content) values(a,la,t,'Existing destination') returning cells.id into target_cell;
  insert into public.cell_dependencies(source_cell_id,target_cell_id,kind) values(cell,target_cell,'leads_to');
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',added),'This step has content since Add. Delete it instead if you mean to');
  if not exists(select 1 from public.cells where cells.id=cell)
     or not exists(select 1 from public.evidence where cell_id=cell)
     or not exists(select 1 from public.resources where cell_id=cell)
     or not exists(select 1 from public.cell_dependencies where source_cell_id=cell) then raise exception 'Add Undo destroyed later content'; end if;
  delete from public.evidence where cell_id=cell;
  delete from public.cells where cells.id=cell;
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,'{after}','{}')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,'{ids}',jsonb_build_array(s))),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',(added-'after')||jsonb_build_object('after',jsonb_build_object(a,added->'after'->a::text),'before',jsonb_build_object(a,added->'before'->a::text))),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'-1')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'1','position'],'3')),'This change cannot be undone. Reload the canvas');
  perform public.undo_structure_add(added);
  added:=public.add_lane_with_details(sc,'Reviewer','customer_actions',jsonb_build_object(a,jsonb_build_array(la,'new')));
  created_id:=(added->'ids'->>0)::uuid;
  insert into public.cells(path_id,lane_id,step_id,content) values(a,created_id,s,'New lane work') returning cells.id into cell;
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_add(%L::jsonb)',added),'This lane has content since Add. Delete it instead if you mean to');
  delete from public.cells where cells.id=cell;
  perform public.undo_structure_add(added);
  saved:=public.update_step_with_details(s,'Arrival','Initial summary');
  update public.steps set summary='Newer agent summary' where steps.id=s;
  perform pg_temp.expect_structure_refusal(format('select public.restore_step_details(%L::jsonb)',saved),'This step changed since your save');
  if (select summary from public.steps where steps.id=s)<>'Newer agent summary' then raise exception 'Restore lost newer summary'; end if;
  saved:=public.update_step_with_details(s,'Arrival','Latest summary');
  perform public.restore_step_details(saved);
  saved:=public.update_lane_with_details(la,array[la,lb],'Reception','{"owner_team":"Ops","stakeholder_id":null,"kpis":[],"tools":[]}');
  if exists(select 1 from public.lanes where lanes.id=lb and (name<>'Front desk' or owner_team is not null)) then raise exception 'Lane save changed sibling properties'; end if;
  update public.lanes set owner_team='Newer team' where lanes.id=la;
  perform pg_temp.expect_structure_refusal(format('select public.restore_lane_details(%L::jsonb)',saved),'This lane changed since your save');
  saved:=public.update_lane_with_details(la,array[la],'Reception','{"owner_team":"Latest team","stakeholder_id":null,"kpis":[],"tools":[]}');
  perform public.restore_lane_details(saved);
  saved:=public.rename_step_name(s,'Renamed on the server');
  update public.steps set summary='Newer rename summary' where steps.id=s;
  perform pg_temp.expect_structure_refusal(format('select public.restore_step_details(%L::jsonb)',saved),'This step changed since your save');
  saved:=public.rename_lane(la,'Renamed lane');
  update public.lanes set owner_team='Newer rename owner' where lanes.id=la;
  perform pg_temp.expect_structure_refusal(format('select public.restore_lane_details(%L::jsonb)',saved),'This lane changed since your save');
  perform public.reorder_lanes(a,array[la],array[la]);
  perform pg_temp.expect_structure_refusal(format('select public.reorder_lanes(%L::uuid,%L::uuid[],%L::uuid[])',a,array[la],array[lb]),'This path changed. Reload and try again');
  saved:=public.reorder_steps(a,array[t,s],array[s,t]);
  perform pg_temp.expect_structure_refusal(format('select public.reorder_steps(%L::uuid,%L::uuid[],%L::uuid[])',a,array[s,t],array[s,t]),'This path changed. Reload and try again');
  perform public.reorder_steps(a,array[s,t],array[t,s]);
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_order(%L::jsonb)',saved),'This path changed since Move. Reload before undoing this change');
  -- A later lane reorder invalidates the first move's receipt as well.
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Second actor','customer_actions',1) returning id into created_id;
  saved:=public.reorder_lanes(a,array[created_id,la],array[la,created_id]);
  perform public.reorder_lanes(a,array[la,created_id],array[created_id,la]);
  perform pg_temp.expect_structure_refusal(format('select public.undo_structure_order(%L::jsonb)',saved),'This path changed since Move. Reload before undoing this change');
  -- Every fixture above disappears even when this proof passes.
  raise exception 'structure review proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_structure_refusal(text,text);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000312000000_step_path_membership_is_guarded_and_reversible.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-26. Existing steps can join or leave a path without losing recoverable content.

-- Refuse before installing the constraint, with a count and a usable finding
-- query. No existing content is deleted or repaired implicitly.
create function pg_temp.assert_cell_path_steps() returns void language plpgsql as $$
declare orphan_count bigint;
begin
  select count(*) into orphan_count from public.cells c
    left join public.path_steps ps on ps.path_id=c.path_id and ps.step_id=c.step_id
    where ps.step_id is null;
  if orphan_count>0 then
    raise exception 'Cannot upgrade: % % off any path-step. Find them with: SELECT c.id, c.path_id, c.step_id FROM public.cells c LEFT JOIN public.path_steps ps ON ps.path_id=c.path_id AND ps.step_id=c.step_id WHERE ps.step_id IS NULL;', orphan_count, case when orphan_count=1 then 'cell sits' else 'cells sit' end;
  end if;
end $$;
select pg_temp.assert_cell_path_steps();

-- Lock the referenced membership before accepting a cell write. This gives
-- every app, importer and tool caller a readable refusal and closes the race
-- with a concurrent detach. The deferred FK remains the final invariant.
-- The caller's cell RLS still authorizes its write. The trigger owns this
-- lock read because path_steps updates are RPC-only under RLS.
create or replace function public.cells_validate_path_match() returns trigger
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare lane_path uuid;
begin
  select path_id into lane_path from public.lanes where id=new.lane_id;
  if lane_path is null then raise exception 'This lane no longer exists. Reload the canvas'; end if;
  if lane_path<>new.path_id then raise exception 'Choose a lane on this path'; end if;
  perform 1 from public.path_steps ps where ps.path_id=new.path_id and ps.step_id=new.step_id for key share;
  if not found then raise exception 'This step is not on this path. Reload the canvas'; end if;
  return new;
end $$;
create function public.path_step_keeps_saved_cells() returns trigger
language plpgsql set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  if tg_op='UPDATE' and new.path_id=old.path_id and new.step_id=old.step_id then return new; end if;
  -- A parent cascade is intentional deletion; normal remove_step and confirmed
  -- membership removal delete their cells first. An order-only writer cannot.
  if exists(select 1 from public.paths where id=old.path_id)
    and exists(select 1 from public.steps where id=old.step_id)
    and exists(select 1 from public.cells where path_id=old.path_id and step_id=old.step_id) then
    raise exception 'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger path_step_keeps_saved_cells before delete or update of path_id,step_id
  on public.path_steps for each row execute function public.path_step_keeps_saved_cells();
alter table public.cells add constraint cells_path_step_fkey
  foreign key (path_id, step_id) references public.path_steps(path_id, step_id)
  deferrable initially deferred;
create index cells_path_step_idx on public.cells(path_id, step_id);

-- Only the guarded functions read this memento. A client receives its opaque
-- identity, never a payload that it could change and hand back as an inverse.
create table public.structure_membership_receipts (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null,
  path_id uuid not null,
  present boolean not null,
  before_state jsonb not null,
  after_state jsonb not null,
  archive jsonb not null,
  reverted boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.structure_membership_state(p_step uuid, p_path uuid)
returns jsonb language sql stable set search_path to 'public','pg_catalog','pg_temp' as $$
  select jsonb_build_object(
    'step', (select to_jsonb(s) from public.steps s where s.id=p_step),
    'paths', (select coalesce(jsonb_agg(ps.path_id order by ps.path_id),'[]') from public.path_steps ps where ps.step_id=p_step),
    'order', (select coalesce(jsonb_agg(ps.step_id order by ps.position),'[]') from public.path_steps ps where ps.path_id=p_path),
    'positions', (select coalesce(jsonb_agg(jsonb_build_object('step_id',ps.step_id,'position',ps.position) order by ps.position),'[]') from public.path_steps ps where ps.path_id=p_path)
  )
$$;

create function public.change_step_path(
  step_id uuid, path_id uuid, present boolean, at_position integer,
  expected_ids uuid[], expected_path_ids uuid[], confirmed_cells jsonb default null
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare
  prior jsonb; following jsonb; captured jsonb := '{}'; saved_cells jsonb; confirmed_snapshot jsonb;
  ids uuid[]; ordered uuid[]; new_order uuid[]; memberships uuid[];
  step_scenario uuid; path_scenario uuid; receipt uuid;
begin
  perform public.require_structure_author();
  -- Same path-first lock order as reorder_steps / undo_structure_order.
  perform 1 from public.paths p where p.id=change_step_path.path_id for update;
  select p.scenario_id into path_scenario from public.paths p where p.id=change_step_path.path_id;
  select s.scenario_id into step_scenario from public.steps s where s.id=change_step_path.step_id for update;
  if step_scenario is null or path_scenario is null or step_scenario<>path_scenario then
    raise exception 'That step and path must belong to the same scenario';
  end if;
  perform 1 from public.path_steps ps where ps.step_id=change_step_path.step_id order by ps.path_id for no key update;
  select coalesce(array_agg(ps.step_id order by ps.position),'{}') into ordered from public.path_steps ps where ps.path_id=change_step_path.path_id;
  select coalesce(array_agg(ps.path_id order by ps.path_id),'{}') into memberships from public.path_steps ps where ps.step_id=change_step_path.step_id;
  if expected_ids is distinct from ordered or expected_path_ids is distinct from memberships then
    raise exception 'This path changed. Reload and try again';
  end if;
  if present is null or present=(path_id=any(memberships)) then
    raise exception 'This step changed. Reload and try again';
  end if;
  if not present and cardinality(memberships)<=1 then
    raise exception 'A step must stay on at least one path';
  end if;
  prior := public.structure_membership_state(step_id,path_id);
  if present then
    if at_position is null or at_position<0 or at_position>cardinality(ordered) then
      raise exception 'Choose a position on this path';
    end if;
    if exists(select 1 from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id) then
      raise exception 'This step already has cells on that path. Reload and try again';
    end if;
    new_order := ordered[1:at_position] || array[step_id] || ordered[at_position+1:cardinality(ordered)];
    insert into public.path_steps(path_id,step_id,position) values(path_id,step_id,cardinality(ordered));
  else
    -- Lock the existing cells before capturing any cascade. The membership FK
    -- keeps new inserts out; these row locks keep edits / new references out.
    perform 1 from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id order by c.id for update;
    select coalesce(array_agg(c.id order by c.id),'{}'),
      coalesce(jsonb_agg(jsonb_build_object('id',c.id,'updated_at',c.updated_at) order by c.id),'[]')
      into ids,saved_cells from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id;
    if cardinality(ids)>0 then
      if jsonb_typeof(confirmed_cells) is distinct from 'array' then
        raise exception 'The cells on this step changed. Reload and confirm removing them';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'updated_at',x.updated_at) order by x.id),'[]')
        into confirmed_snapshot from jsonb_to_recordset(confirmed_cells) as x(id uuid,updated_at timestamptz);
      if confirmed_snapshot is distinct from saved_cells then
        raise exception 'The cells on this step changed. Reload and confirm removing them';
      end if;
    end if;
    perform 1 from public.cell_touchpoints t where t.cell_id=any(ids) order by t.id for update;
    perform 1 from public.resources t where t.cell_id=any(ids) order by t.id for update;
    perform 1 from public.cell_dependencies t where t.source_cell_id=any(ids) or t.target_cell_id=any(ids) order by t.id for update;
    perform 1 from public.slide_images t where t.cell_id=any(ids) order by t.id for update;
    -- Evidence keeps its provenance identity after a cell is removed. Leave
    -- it intact; restoring the same cell ids reconnects it without rewriting
    -- any evidence that somebody edited in the meantime.
    captured := jsonb_build_object(
      'cells',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from public.cells c where c.id=any(ids)),
      'lanes',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.lanes l where l.id in(select c.lane_id from public.cells c where c.id=any(ids))),
      'placements',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.cell_touchpoints t where t.cell_id=any(ids)),
      'resources',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.resources r where r.cell_id=any(ids)),
      'dependencies',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.cell_dependencies d where d.source_cell_id=any(ids) or d.target_cell_id=any(ids)),
      'images',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.slide_images i where i.cell_id=any(ids))
    );
    delete from public.cells c where c.id=any(ids);
    delete from public.path_steps ps where ps.path_id=change_step_path.path_id and ps.step_id=change_step_path.step_id;
    new_order := array_remove(ordered,step_id);
  end if;
  update public.path_steps ps set position=q.n-1 from unnest(new_order) with ordinality q(id,n)
    where ps.path_id=change_step_path.path_id and ps.step_id=q.id;
  following := public.structure_membership_state(step_id,path_id);
  insert into public.structure_membership_receipts(step_id,path_id,present,before_state,after_state,archive)
    values(step_id,path_id,present,prior,following,captured) returning id into receipt;
  return jsonb_build_object('receipt_id',receipt,'step_id',step_id,'path_id',path_id,'present',present);
end $$;

create function public.undo_step_path_change(receipt_id uuid) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare r public.structure_membership_receipts; prior_order uuid[]; lane_state jsonb;
begin
  perform public.require_structure_author();
  select * into r from public.structure_membership_receipts where id=receipt_id for update;
  if not found or r.reverted then raise exception 'This path change cannot be undone. Reload the canvas'; end if;
  perform 1 from public.paths p where p.id=r.path_id for update;
  perform 1 from public.steps s where s.id=r.step_id for update;
  perform 1 from public.path_steps ps where ps.step_id=r.step_id order by ps.path_id for no key update;
  if public.structure_membership_state(r.step_id,r.path_id) is distinct from r.after_state then
    raise exception 'This step or path changed since your save. Reload before undoing';
  end if;
  if exists(select 1 from public.cells c where c.path_id=r.path_id and c.step_id=r.step_id) then
    raise exception 'This step has content since your save. Remove it explicitly instead';
  end if;
  select coalesce(array_agg(x::uuid),'{}') into prior_order from jsonb_array_elements_text(r.before_state->'order') x;
  if r.present then
    delete from public.path_steps ps where ps.path_id=r.path_id and ps.step_id=r.step_id;
  else
    select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') into lane_state from public.lanes l
      where l.id in(select (x->>'id')::uuid from jsonb_array_elements(r.archive->'lanes') x);
    if lane_state is distinct from r.archive->'lanes' then
      raise exception 'The lanes holding this step changed. Reload before undoing';
    end if;
    insert into public.path_steps(path_id,step_id,position) values(r.path_id,r.step_id,cardinality(prior_order));
    -- No upsert: identity or slot collisions and missing references refuse the
    -- entire inverse rather than overwriting anything written since detach.
    begin
      insert into public.cells select * from jsonb_populate_recordset(null::public.cells,r.archive->'cells');
      insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,r.archive->'placements');
      insert into public.resources select * from jsonb_populate_recordset(null::public.resources,r.archive->'resources');
      insert into public.cell_dependencies select * from jsonb_populate_recordset(null::public.cell_dependencies,r.archive->'dependencies');
      insert into public.slide_images select * from jsonb_populate_recordset(null::public.slide_images,r.archive->'images');
    exception when unique_violation or foreign_key_violation then
      raise exception 'Content referenced by this change changed. Reload before undoing';
    end;
  end if;
  -- Restore stored positions too: older paths may have intentional gaps.
  update public.path_steps ps set position=q.position
    from jsonb_to_recordset(r.before_state->'positions') q(step_id uuid,position integer)
    where ps.path_id=r.path_id and ps.step_id=q.step_id;
  update public.structure_membership_receipts set reverted=true, before_state='{}', after_state='{}', archive='{}' where id=r.id;
end $$;

-- Real attach, detach, round-trip content and stale-state proofs. No fixture survives.
create function pg_temp.expect_membership_refusal(statement text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Unexpected success: %',statement using errcode='ZX001';
  exception when others then
    if sqlerrm<>message then raise; end if;
  end;
end $$;
do $proof$
declare
  svc uuid; ph uuid; sc uuid; a uuid; b uuid; start_id uuid; review_id uuid; end_id uuid;
  la uuid; lb uuid; cell uuid; target_cell uuid; placement uuid; resource uuid; edge uuid; ev uuid;
  slice_id uuid; slide_id uuid; image_id uuid; result jsonb; detached jsonb; proof_order jsonb;
  members uuid[]; confirmation jsonb; original_cell jsonb; original_resource jsonb; original_target jsonb;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Path membership fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Online','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Phone','variant') returning id into b;
  start_id:=public.add_step(a,'Start',0); review_id:=public.add_step(a,'Review',1); end_id:=public.add_step(a,'Finish',2);
  insert into public.path_steps(path_id,step_id,position) values(b,start_id,0),(b,end_id,3);
  insert into public.lanes(path_id,name,position,lane_role) values(a,'Actor',0,'customer_actions') returning id into la;
  insert into public.lanes(path_id,name,position,lane_role) values(b,'Actor',0,'customer_actions') returning id into lb;
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[])',review_id,a,array[start_id,review_id,end_id],array[a]),'A step must stay on at least one path');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,true,1,%L::uuid[],%L::uuid[])',review_id,b,array[end_id,start_id],array[a]),'This path changed. Reload and try again');
  result:=public.change_step_path(review_id,b,true,1,array[start_id,end_id],array[a]);
  if (select array_agg(step_id order by position) from public.path_steps where path_id=b)<>array[start_id,review_id,end_id] then raise exception 'Attach lost its requested placement'; end if;
  perform public.undo_step_path_change((result->>'receipt_id')::uuid);
  if exists(select 1 from public.path_steps where path_id=b and step_id=review_id) then raise exception 'Attach inverse left membership'; end if;
  if (select position from public.path_steps where path_id=b and step_id=end_id)<>3 then raise exception 'Attach inverse lost stored positions'; end if;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',result->>'receipt_id'),'This path change cannot be undone. Reload the canvas');
  result:=public.change_step_path(review_id,b,true,1,array[start_id,end_id],array[a]);
  select array_agg(x order by x) into members from unnest(array[a,b]) x;
  insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,review_id,'Saved review') returning id into cell;
  insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,end_id,'Saved outcome') returning id into target_cell;
  insert into public.cell_touchpoints(cell_id,name,position,origin) values(cell,'Counter',0,'app') returning id into placement;
  insert into public.resources(cell_id,cell_touchpoint_id,name,url,position,origin) values(cell,placement,'Guide','https://example.com/guide',0,'app') returning id into resource;
  insert into public.cell_dependencies(source_cell_id,target_cell_id,kind) values(cell,target_cell,'leads_to') returning id into edge;
  update public.cells set cell_key=cell::text where id=cell;
  insert into public.evidence(service_id,cell_id,cell_key,kind,title) values(svc,cell,(select cell_key from public.cells where id=cell),'observation','Observed review') returning id into ev;
  insert into public.slices(service_id,kind,title) values(svc,'custom','Saved view') returning id into slice_id;
  insert into public.slides(slice_id,position,cell_ids,cell_keys) values(slice_id,0,array[cell],array[cell::text]) returning id into slide_id;
  insert into public.slide_images(slide_id,position,cell_id,image_url) values(slide_id,0,cell,null) returning id into image_id;
  select to_jsonb(c) into original_target from public.cells c where c.id=target_cell;
  select to_jsonb(c) into original_cell from public.cells c where c.id=cell;
  select to_jsonb(r) into original_resource from public.resources r where r.id=resource;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',result->>'receipt_id'),'This step has content since your save. Remove it explicitly instead');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[])',review_id,b,array[start_id,review_id,end_id],members),'The cells on this step changed. Reload and confirm removing them');
  select jsonb_agg(jsonb_build_object('id',c.id,'updated_at',c.updated_at) order by c.id) into confirmation from public.cells c where c.id=cell;
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[],%L::jsonb)',review_id,b,array[start_id,review_id,end_id],members,'[]'),'The cells on this step changed. Reload and confirm removing them');
  detached:=public.change_step_path(review_id,b,false,0,array[start_id,review_id,end_id],members,confirmation);
  if exists(select 1 from public.cells where id=cell) or exists(select 1 from public.resources where id=resource) then raise exception 'Detach left live cells or resources'; end if;
  if not exists(select 1 from public.evidence where id=ev and cell_id=cell) then raise exception 'Detach removed provenance'; end if;
  if exists(select 1 from public.evidence e join public.cells c on c.id=e.cell_id where e.id=ev) then raise exception 'Detached provenance unexpectedly has a live cell'; end if;
  update public.lanes set owner_team='New ownership' where id=lb;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'The lanes holding this step changed. Reload before undoing');
  update public.lanes set owner_team=null where id=lb;
  delete from public.cells where id=target_cell;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'Content referenced by this change changed. Reload before undoing');
  if exists(select 1 from public.cells where id=cell) or exists(select 1 from public.path_steps where path_id=b and step_id=review_id) then raise exception 'Refused inverse leaked restored rows'; end if;
  insert into public.cells select * from jsonb_populate_record(null::public.cells,original_target);
  -- A newer path order refuses the inverse, and its own inverse restores it.
  proof_order:=public.reorder_steps(b,array[end_id,start_id],array[start_id,end_id]);
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'This step or path changed since your save. Reload before undoing');
  perform public.undo_structure_order(proof_order);
  perform public.undo_step_path_change((detached->>'receipt_id')::uuid);
  if original_cell is distinct from (select to_jsonb(c) from public.cells c where c.id=cell)
     or original_resource is distinct from (select to_jsonb(r) from public.resources r where r.id=resource)
     or not exists(select 1 from public.cell_touchpoints where id=placement)
     or not exists(select 1 from public.cell_dependencies where id=edge)
     or not exists(select 1 from public.slide_images where id=image_id) then raise exception 'Detach inverse failed to restore exact content and related identities'; end if;
  if not exists(select 1 from public.evidence e join public.cells c on c.id=e.cell_id where e.id=ev and c.id=cell) then raise exception 'Undo did not reconnect preserved evidence'; end if;
  if exists(select 1 from public.structure_membership_receipts where id=(detached->>'receipt_id')::uuid and (archive<>'{}' or before_state<>'{}' or after_state<>'{}')) then raise exception 'Spent receipt retained content'; end if;
  -- A changed row cannot be overwritten by membership Undo either.
  detached:=public.change_step_path(review_id,b,false,0,array[start_id,review_id,end_id],members,confirmation);
  update public.steps set summary='A newer summary' where id=review_id;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'This step or path changed since your save. Reload before undoing');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,true,1,%L::uuid[],%L::uuid[])',review_id,b,array[start_id,end_id],members),'This path changed. Reload and try again');
  -- All writers, including legacy set_path_steps and direct writes, refuse
  -- before the FK can emit a raw constraint error.
  perform pg_temp.expect_membership_refusal(format('select public.set_path_steps(%L,%L::uuid[])',b,array[start_id]),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('delete from public.path_steps where path_id=%L and step_id=%L',b,end_id),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('update public.path_steps set step_id=%L where path_id=%L and step_id=%L',review_id,b,end_id),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('insert into public.cells(path_id,lane_id,step_id,content) values(%L,%L,%L,%L)',b,lb,review_id,'New cell'),'This step is not on this path. Reload the canvas');
  perform pg_temp.expect_membership_refusal(format('update public.cells set step_id=%L where id=%L',review_id,target_cell),'This step is not on this path. Reload the canvas');
  -- Plant one orphan in a rollback-only subtransaction to prove the exact
  -- migration preflight. The deferred FK is never allowed to commit it.
  set constraints all immediate;
  begin
    alter table public.path_steps disable trigger path_step_keeps_saved_cells;
    set constraints cells_path_step_fkey deferred;
    delete from public.path_steps where path_id=b and step_id=end_id;
    perform pg_temp.assert_cell_path_steps();
    raise exception 'Preflight accepted orphaned cells' using errcode='ZX001';
  exception when others then
    if sqlerrm not like 'Cannot upgrade: 1 cell sits off any path-step. Find them with: SELECT%' then raise; end if;
  end;
  begin
    alter table public.path_steps disable trigger path_step_keeps_saved_cells;
    set constraints cells_path_step_fkey deferred;
    insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,start_id,'Saved start');
    delete from public.path_steps where path_id=b and step_id in(start_id,end_id);
    perform pg_temp.assert_cell_path_steps();
    raise exception 'Preflight accepted two orphaned cells' using errcode='ZX001';
  exception when others then
    if sqlerrm not like 'Cannot upgrade: 2 cells sit off any path-step. Find them with: SELECT%' then raise; end if;
  end;
  perform public.remove_step(b,end_id);
  if exists(select 1 from public.cells where id=target_cell) then raise exception 'Explicit step deletion left its cells'; end if;
  raise exception 'membership proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_membership_refusal(text,text);
drop function pg_temp.assert_cell_path_steps();

-- ─────────────────────────────────────────────────────────────────────────
-- 21000313000000_a_storyboard_row_saves_its_cell_atomically.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-29. A storyboard row edits one existing cell aggregate.
create table public.cell_storyboard_receipts (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.cells(id) on delete cascade,
  actor text not null,
  uploaded_ids uuid[] not null,
  before_state jsonb not null,
  after_state jsonb not null
);
create index cell_storyboard_receipts_cell_idx on public.cell_storyboard_receipts(cell_id);
alter table public.cell_storyboard_receipts enable row level security;
revoke all on public.cell_storyboard_receipts from public;

-- Canonical state is also the expected-state contract. Resources include
-- placement-owned rows because content synchronization can remove placements.
create function public.read_cell_storyboard(p_cell_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare result jsonb;
begin
 perform public.require_structure_author();
 select jsonb_build_object('cell_id', c.id, 'path_id',c.path_id,'lane_id',c.lane_id,'step_id',c.step_id,
   'content',c.content,'summary',c.summary,'frame',c.frame,
   'placements',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.cell_touchpoints t where t.cell_id=c.id),'[]'::jsonb),
   'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.resources r where r.cell_id=c.id),'[]'::jsonb))
 into result from public.cells c where c.id=p_cell_id;
 if result is null then raise exception 'That cell no longer exists'; end if;
 return result;
end $$;

create function public.update_cell_storyboard(p_cell_id uuid,p_content text,p_summary text,p_frame text,p_expected jsonb,p_attachments jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare before_state jsonb; after_state jsonb; receipt_id uuid; attachment jsonb; next_position int; next_frame text; uploaded_id uuid; uploaded_ids uuid[] := array[]::uuid[];
begin
 perform public.require_structure_author();
 perform 1 from public.cells where id=p_cell_id for update;
 perform 1 from public.cell_touchpoints where cell_id=p_cell_id for update;
 perform 1 from public.resources where cell_id=p_cell_id for update;
 before_state := public.read_cell_storyboard(p_cell_id);
 if p_expected is null or before_state <> p_expected then raise exception 'This cell changed. Reopen it before saving.' using errcode='40001'; end if;
 if coalesce(p_content,'') ~ '^[[:space:]]*$' then raise exception 'Text is required'; end if;
 next_frame := nullif(btrim(p_frame),'');
 if next_frame is not null and next_frame !~ '^(https://|/[^/\\])' and next_frame !~ '^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?/storage/v1/object/public/cell-attachments/' then raise exception 'A featured image is an https address or a path on this site'; end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' then raise exception 'Attachments must be an array'; end if;
 select coalesce(max(position),-1)+1 into next_position from public.resources where cell_id=p_cell_id and cell_touchpoint_id is null;
 for attachment in select value from jsonb_array_elements(p_attachments) loop
   if attachment->>'kind' is distinct from 'attachment' or coalesce(btrim(attachment->>'name'),'')='' or (coalesce(attachment->>'url','') !~ '^https://' and coalesce(attachment->>'url','') !~ '^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?/storage/v1/object/public/cell-attachments/') or coalesce(attachment->>'objectKey','')='' or attachment->>'objectKey' not like 'cells/'||p_cell_id::text||'/%' or right(attachment->>'url',length('/cell-attachments/'|| (attachment->>'objectKey'))) <> '/cell-attachments/'||(attachment->>'objectKey') or attachment ? 'id' or attachment ? 'cell_touchpoint_id' then
     raise exception 'Invalid staged attachment';
   end if;
   insert into public.resources(cell_id,kind,name,url,position,origin) values(p_cell_id,'attachment',attachment->>'name',attachment->>'url',next_position,'app') returning id into uploaded_id;
   uploaded_ids := array_append(uploaded_ids,uploaded_id);
   next_position := next_position+1;
 end loop;
 -- Picture/caption-only edits preserve action text and all placements as-is.
 if p_content is distinct from before_state->>'content' then
 perform public.sync_cell_touchpoints(p_cell_id, array(select name from (select regexp_replace(part,'^[[:space:]]+|[[:space:]]+$','','g') as name,ord from regexp_split_to_table(p_content,E'\\r?\\n|,') with ordinality as parts(part,ord)) names where name<>'' order by ord));
 end if;
 -- Explicit choice follows synchronization, which may fill an empty frame.
 update public.cells set content=p_content,summary=nullif(regexp_replace(p_summary,'^[[:space:]]+|[[:space:]]+$','','g'),''),frame=next_frame where id=p_cell_id;
 after_state := public.read_cell_storyboard(p_cell_id);
 insert into public.cell_storyboard_receipts(cell_id,actor,uploaded_ids,before_state,after_state)
 values(p_cell_id,coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',''),uploaded_ids,before_state,after_state) returning id into receipt_id;
 return jsonb_build_object('cell_id',p_cell_id,'receipt_id',receipt_id,'before',before_state,'after',after_state);
end $$;

create function public.restore_cell_storyboard(p_receipt_id uuid) returns void
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare receipt public.cell_storyboard_receipts; current_state jsonb;
begin
 perform public.require_structure_author();
 select * into receipt from public.cell_storyboard_receipts where id=p_receipt_id for update;
 if receipt.id is null or receipt.actor <> coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','') then raise exception 'This edit receipt is unavailable'; end if;
 perform 1 from public.cells where id=receipt.cell_id for update;
 perform 1 from public.cell_touchpoints where cell_id=receipt.cell_id for update;
 perform 1 from public.resources where cell_id=receipt.cell_id for update;
 current_state := public.read_cell_storyboard(receipt.cell_id);
 if current_state <> receipt.after_state then raise exception 'This cell changed after this edit. Undo refused.' using errcode='40001'; end if;
 -- Only this transaction's captured upload IDs may be removed by Undo.
 -- Retained resources are untouched; sync-removed rows recover their own IDs.
 if exists(select 1 from jsonb_populate_recordset(null::public.cell_touchpoints,receipt.before_state->'placements') b join public.cell_touchpoints t on t.id=b.id where t.cell_id<>receipt.cell_id)
 or exists(select 1 from jsonb_populate_recordset(null::public.resources,receipt.before_state->'resources') b join public.resources r on r.id=b.id where r.cell_id<>receipt.cell_id) then raise exception 'A captured identity is now owned elsewhere'; end if;
 delete from public.resources where cell_id=receipt.cell_id and id=any(receipt.uploaded_ids);
 delete from public.cell_touchpoints t where t.cell_id=receipt.cell_id and not exists(select 1 from jsonb_array_elements(receipt.before_state->'placements') b where b->>'id'=t.id::text);
 insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,receipt.before_state->'placements')
 on conflict(id) do update set name=excluded.name,position=excluded.position,summary=excluded.summary,role=excluded.role,touchpoint_id=excluded.touchpoint_id;
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,receipt.before_state->'resources') on conflict(id) do nothing;
 update public.cells set content=receipt.before_state->>'content', summary=receipt.before_state->>'summary',frame=receipt.before_state->>'frame' where id=receipt.cell_id;
 delete from public.cell_storyboard_receipts where id=p_receipt_id;
end $$;
revoke execute on function public.read_cell_storyboard(uuid), public.update_cell_storyboard(uuid,text,text,text,jsonb,jsonb),public.restore_cell_storyboard(uuid) from public;

-- Every fixture lives in a rolled-back subtransaction, including failed writes.
do $storyboard_proof$
declare s uuid; ph uuid; sc uuid; p uuid; st uuid; ln uuid; c uuid; other_cell uuid; tp uuid; placement uuid; resource uuid;
 before_state jsonb; receipt jsonb; uploaded jsonb; after_state jsonb; refused boolean; bad text; original_resources jsonb;
begin
 begin
 perform set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","app_metadata":{"role":"service"}}',true);
 insert into public.services(name) values ('storyboard aggregate proof') returning id into s;
 insert into public.phases(service_id,name,position) values(s,'phase',0) returning id into ph;
 insert into public.scenarios(phase_id,name,position) values(ph,'scenario',0) returning id into sc;
 insert into public.paths(scenario_id,name,kind) values(sc,'path','happy') returning id into p;
 insert into public.steps(scenario_id,name) values(sc,'step') returning id into st;
 insert into public.path_steps(path_id,step_id,position) values(p,st,0);
 insert into public.lanes(path_id,name,position) values(p,'actor',0) returning id into ln;
 insert into public.cells(path_id,lane_id,step_id,content,owner) values(p,ln,st,'','preserve') returning id into c;
 before_state := public.read_cell_storyboard(c);
 receipt := public.update_cell_storyboard(c,'New text',E'\n New summary \t','https://example.test/image.png',before_state,'[]');
 if (select content <> 'New text' or summary <> 'New summary' or frame <> 'https://example.test/image.png' or owner <> 'preserve' from public.cells where id=c) then raise exception 'aggregate save failed'; end if;
 update public.cells set owner='new unrelated owner',status='planned' where id=c;
 perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid);
 if public.read_cell_storyboard(c) <> before_state or (select owner<>'new unrelated owner' or status<>'planned' from public.cells where id=c) then raise exception 'blank-cell inverse or unrelated-field preservation failed'; end if;
 -- Consumed/foreign/malformed tokens cannot replay an inverse.
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when others then refused:=true; end;
 if not refused then raise exception 'receipt replay accepted'; end if;
 refused:=false; begin perform public.restore_cell_storyboard(gen_random_uuid()); exception when others then refused:=true; end;
 if not refused then raise exception 'foreign token accepted'; end if;
 -- Validation and stale expected state are checked before any aggregate mutation.
 foreach bad in array array['blank','url','stale','missing','attachment','foreign_attachment'] loop
 refused:=false;
 begin
   perform public.update_cell_storyboard(case when bad='missing' then gen_random_uuid() else c end,
    case when bad='blank' then E' \n\t ' else 'New text' end,'Changed',case when bad='url' then 'javascript:bad' else '/image.png' end,
    case when bad='stale' then '{}'::jsonb else before_state end,
    case when bad='attachment' then '[{"kind":"attachment","name":"File","url":"javascript:bad","objectKey":"bad"}]'::jsonb
     when bad='foreign_attachment' then '[{"id":"11111111-1111-4111-8111-111111111111","kind":"attachment","name":"File","url":"https://example.test/file","objectKey":"bad"}]'::jsonb else '[]'::jsonb end);
 exception when others then refused:=true; end;
 if not refused or public.read_cell_storyboard(c)<>before_state then raise exception 'invalid % did not roll back the aggregate',bad; end if;
 end loop;
 -- Existing placements on actor cells still follow full-cell content rules.
 update public.cells set content='Action text stays here' where id=c;
 insert into public.touchpoints(name,origin) values('Original tool','app') returning id into tp;
 insert into public.cell_touchpoints(cell_id,touchpoint_id,position,origin,summary) values(c,tp,0,'app','Keep placement writing') returning id into placement;
 insert into public.resources(cell_id,kind,name,url,position,origin,featured) values(c,'link','Original link','https://example.test/link',0,'app',true) returning id into resource;
 insert into public.resources(cell_id,cell_touchpoint_id,kind,name,url,position,origin) values(c,placement,'link','Placement link','https://example.test/placement',0,'app');
 before_state := public.read_cell_storyboard(c); original_resources:=before_state->'resources';
 receipt:=public.update_cell_storyboard(c,before_state->>'content','Picture caption','/caption.png',before_state,'[]');
 after_state:=public.read_cell_storyboard(c);
 if after_state->'placements'<>before_state->'placements' or after_state->'resources'<>before_state->'resources' or after_state->>'content'<>before_state->>'content' then raise exception 'picture/caption edit changed action text or placements'; end if;
 perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid);
 if public.read_cell_storyboard(c)<>before_state then raise exception 'picture/caption inverse changed the aggregate'; end if;
 uploaded:=jsonb_build_array(jsonb_build_object('kind','attachment','name','Uploaded image','objectKey','cells/'||c||'/image.png','url','http://127.0.0.1:58080/storage/v1/object/public/cell-attachments/cells/'||c||'/image.png'));
 receipt := public.update_cell_storyboard(c,E' \tNew tool\t, \n ,\t,\tAnother tool\t  ','Updated','http://127.0.0.1:58080/storage/v1/object/public/cell-attachments/cells/'||c||'/image.png',before_state,uploaded);
 after_state:=public.read_cell_storyboard(c);
 if exists(select 1 from public.cell_touchpoints ct left join public.touchpoints t on t.id=ct.touchpoint_id where ct.cell_id=c and coalesce(ct.name,t.name)<>regexp_replace(coalesce(ct.name,t.name),'^[[:space:]]+|[[:space:]]+$','','g')) or not exists(select 1 from public.cell_touchpoints ct join public.touchpoints t on t.id=ct.touchpoint_id where ct.cell_id=c and t.name='Another tool') then raise exception 'content segments were not trimmed and filtered'; end if;
 if jsonb_array_length(after_state->'resources')<>3 or not exists(select 1 from public.cell_touchpoints where id=placement and touchpoint_id is null and name='Original tool') then raise exception 'upload or content synchronization failed'; end if;
 -- Resource edits refuse Undo; original IDs/flags/order survive the refused attempt.
 update public.resources set name='Later resource edit' where id=resource;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused then raise exception 'Undo overwrote a newer resource edit'; end if;
 -- Roll back that simulated later edit without using a timestamp-changing update.
 delete from public.resources where id=resource;
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,after_state->'resources') r where r.id=resource;
 -- A newer placement edit also refuses Undo.
 update public.cell_touchpoints set summary='Later placement edit' where id=placement;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused then raise exception 'Undo overwrote a newer placement edit'; end if;
 -- Restore the fixture snapshot by exact rows, then test the real inverse.
 delete from public.resources where cell_id=c;
 delete from public.cell_touchpoints where cell_id=c;
 insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,after_state->'placements');
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,after_state->'resources');
 perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid);
 if (public.read_cell_storyboard(c)->'resources')<>original_resources or not exists(select 1 from public.cell_touchpoints where id=placement and touchpoint_id=tp and summary='Keep placement writing') then raise exception 'Undo lost original resource IDs or placement state'; end if;
 before_state:=public.read_cell_storyboard(c);
 receipt:=public.update_cell_storyboard(c,'Latest','Summary','/latest.png',before_state,'[]');
 update public.cells set content='Newer text' where id=c;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused or (select content<>'Newer text' from public.cells where id=c) then raise exception 'Undo overwrote newer text'; end if;
 raise exception using errcode='P0002',message='storyboard fixture rollback';
 exception when no_data_found then if sqlerrm<>'storyboard fixture rollback' then raise; end if; end;
end $storyboard_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000314000000_a_person_who_talks_to_uno_has_a_profile.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A person who talks to Uno has a profile, and only some may confirm.
--
-- Authored 2026-10-17.
--
-- Uno serves people, and it has to know who is talking: who they are in the
-- business, how they want to be spoken to, and whether what they say may
-- change the blueprint. A **profile** (CONTEXT.md) records one person:
--
--   stakeholder_id    the existing cast-list row that says who they are in
--                     the business; no new stakeholder kind
--   user_id           their login account, when one exists
--   may_confirm       whether they approve changes and make a cell
--                     owner-confirmed; separate from who they are
--   register          everyday or precise words
--   dismissed_nudges  nudges they asked not to see again
--   last_run_at       when Uno last ran with them
--
-- ── Who may confirm, and what everyone else does ─────────────────────────
--
-- A person who may not confirm still contributes. `record_contribution`
-- writes what they said as evidence on the cell, in their name, and a
-- suggested change to the cell's content that waits. `approve_suggested_change`
-- applies it, and `confirm_cell` vouches for a cell as it stands; both refuse
-- a caller whose profile does not hold may_confirm. Approving owner-confirms
-- the cell, because the person who approved it now stands behind its value.
--
-- ── Who the caller is ────────────────────────────────────────────────────
--
-- The Supabase recipe identifies the caller with auth.uid(), the same
-- account identity the profile policies use. The portable core's identity
-- seam returns no profile until the host supplies its own implementation.
-- An operator acting for a named person supplies that person's authenticated
-- identity in the same transaction.
--
-- ── What a cell carries ──────────────────────────────────────────────────
--
-- `cells.confirmed_by` and `cells.confirmed_at`: who confirmed the value and
-- when, both or neither. No role is granted UPDATE on either; only the two
-- functions above write them.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references public.stakeholders (id) on delete restrict,
  user_id uuid unique,
  display_name text not null constraint profiles_display_name_check check (btrim(display_name) <> ''),
  may_confirm boolean not null default false,
  register text not null default 'everyday'
    constraint profiles_register_check check (register in ('everyday', 'precise')),
  dismissed_nudges text[] not null default '{}',
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_stakeholder_id_idx on public.profiles (stakeholder_id);

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'One person who talks to Uno: the stakeholder they are in the business, how Uno works with them, and whether they may confirm. Not a stakeholder: the stakeholder says who someone is, the profile says how Uno works with them. A person reads and edits only their own; list_profile_stakeholders shows everyone''s stakeholder link.';
comment on column public.profiles.stakeholder_id is
  'The cast-list row that says who this person is in the business.';
comment on column public.profiles.user_id is
  'The login account this person signs in with, when one exists. Linked by email by the pilot seed.';
comment on column public.profiles.display_name is
  'What Uno calls this person.';
comment on column public.profiles.may_confirm is
  'Whether this person approves changes to the blueprint and makes a cell owner-confirmed. Set by an operator, never by the person.';
comment on column public.profiles.register is
  'everyday | precise. The words Uno uses with this person.';
comment on column public.profiles.dismissed_nudges is
  'Nudges this person dismissed, so Uno does not bring them again unless something changes.';
comment on column public.profiles.last_run_at is
  'When Uno last ran with this person: where the next session reads changes from.';

alter table public.cells
  add column confirmed_by uuid references public.profiles (id) on delete set null,
  add column confirmed_at timestamptz,
  add constraint cells_confirmed_paired check ((confirmed_by is null) = (confirmed_at is null));

comment on column public.cells.confirmed_by is
  'The profile that confirmed this cell''s value: set when someone who may confirm approves a change to it or vouches for it. Null when nobody has. Owner-confirmed outranks anything Uno inferred.';
comment on column public.cells.confirmed_at is
  'When confirmed_by confirmed this cell''s value. Set with it, cleared with it.';

alter table public.evidence
  add column contributed_by uuid references public.profiles (id) on delete set null;

comment on column public.evidence.contributed_by is
  'The profile whose words this evidence records, when a person told Uno. Only that person can set it to themselves.';

create table public.suggested_changes (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.cells (id) on delete cascade,
  evidence_id uuid references public.evidence (id) on delete set null,
  proposed_content text not null,
  suggested_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending'
    constraint suggested_changes_status_check check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint suggested_changes_decision_paired check ((status = 'pending') = (decided_at is null))
);

create index suggested_changes_cell_id_idx on public.suggested_changes (cell_id);

comment on table public.suggested_changes is
  'A change to a cell''s content that someone who may not confirm suggested, waiting for someone who may. Written and decided through record_contribution and approve_suggested_change only.';
comment on column public.suggested_changes.proposed_content is
  'The cell content the suggestion would set.';
comment on column public.suggested_changes.status is
  'pending | approved | declined.';

-- ── The caller ───────────────────────────────────────────────────────────

create function public.caller_profile_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select null::uuid $$;


comment on function public.caller_profile_id() is
  'The profile of the person making this request, identified by auth.uid(); null when the caller has none.';

-- Evidence is writable by any signed-in author, so its attribution is held
-- here: a request that carries claims may attribute evidence to its own
-- caller and nobody else. A write with no claims at all is an operator's at
-- the database, which is trusted to say whose words these are.
create function public.evidence_contributor_is_the_caller() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.contributed_by is not null
     and new.contributed_by is distinct from (case when tg_op = 'UPDATE' then old.contributed_by end)
     and new.contributed_by is distinct from public.caller_profile_id()
     and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'evidence can be attributed only to the person giving it'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger evidence_contributor_is_the_caller
  before insert or update of contributed_by on public.evidence
  for each row execute function public.evidence_contributor_is_the_caller();

create function public.list_profile_stakeholders()
returns table (profile_id uuid, stakeholder_id uuid, display_name text)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if public.caller_profile_id() is null then
    return;
  end if;
  return query
    select p.id, p.stakeholder_id, p.display_name
      from public.profiles p
     order by p.display_name;
end
$$;

comment on function public.list_profile_stakeholders() is
  'Every profile''s stakeholder link and name, for a caller who has a profile: who else in the business talks to Uno. Nothing else about another person''s profile.';

-- The confirmer: the caller's profile, refused unless it may confirm.
create function public.confirming_profile_id() returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = public.caller_profile_id();
  if v_profile.id is null or not v_profile.may_confirm then
    raise exception 'only someone who may confirm can approve a change or confirm a cell'
      using errcode = '42501';
  end if;
  return v_profile.id;
end
$$;

create function public.record_contribution(
  p_cell_id uuid,
  p_title text,
  p_note text,
  p_proposed_content text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.caller_profile_id();
  v_cell public.cells;
  v_service uuid;
  v_evidence uuid;
  v_suggestion uuid;
begin
  if v_profile is null then
    raise exception 'a contribution needs the profile of the person giving it'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'a contribution needs a title saying where it came from';
  end if;
  select * into v_cell from public.cells where id = p_cell_id;
  if v_cell.id is null then
    raise exception 'no cell %', p_cell_id;
  end if;
  select ph.service_id into v_service
    from public.paths pa
    join public.scenarios sc on sc.id = pa.scenario_id
    join public.phases ph on ph.id = sc.phase_id
   where pa.id = v_cell.path_id;

  insert into public.evidence (service_id, cell_id, cell_key, kind, title, note, contributed_by)
  values (v_service, v_cell.id, coalesce(v_cell.cell_key, v_cell.id::text), 'interview', btrim(p_title),
          nullif(btrim(coalesce(p_note, '')), ''), v_profile)
  returning id into v_evidence;

  if p_proposed_content is not null then
    insert into public.suggested_changes (cell_id, evidence_id, proposed_content, suggested_by)
    values (v_cell.id, v_evidence, p_proposed_content, v_profile)
    returning id into v_suggestion;
  end if;

  return jsonb_build_object('evidence_id', v_evidence, 'suggested_change_id', v_suggestion);
end
$$;

comment on function public.record_contribution(uuid, text, text, text) is
  'Guard: the caller must have a profile. Records evidence in that profile''s name and an optional pending suggestion; leaves the cell as it is. Returns {evidence_id, suggested_change_id}.';

create function public.approve_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
  v_change public.suggested_changes;
  v_previous public.cells;
begin
  select * into v_change from public.suggested_changes where id = p_id for update;
  if v_change.id is null then
    raise exception 'no suggested change %', p_id;
  end if;
  if v_change.status <> 'pending' then
    raise exception 'suggested change % is already %', p_id, v_change.status;
  end if;
  select * into strict v_previous from public.cells where id = v_change.cell_id for update;
  update public.cells
     set content = v_change.proposed_content,
         confirmed_by = v_profile,
         confirmed_at = now(),
         updated_at = now()
   where id = v_change.cell_id;
  update public.suggested_changes
     set status = 'approved', decided_by = v_profile, decided_at = now()
   where id = p_id;
  insert into public.authoring_changes (author, author_id, fn, args, revert)
  values ('human', (select user_id from public.profiles where id = v_profile),
    'approve_suggested_change', jsonb_build_object('p_id', p_id, 'cell_id', v_change.cell_id),
    jsonb_build_object('fn', 'update_cell_content', 'args',
      jsonb_build_object('cell_id', v_previous.id, 'update',
        jsonb_build_object('content', v_previous.content, 'summary', coalesce(v_previous.summary, ''),
          'owner', coalesce(v_previous.owner, ''), 'perceivedOwner', coalesce(v_previous.perceived_owner, ''),
          'status', v_previous.status), 'confirmed_by', v_previous.confirmed_by,
          'confirmed_at', v_previous.confirmed_at)));
  return jsonb_build_object('cell_id', v_change.cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.approve_suggested_change(uuid) is
  'Apply a pending suggested change to its cell and owner-confirm the cell in the caller''s name. Refused unless the caller''s profile may confirm.';

create function public.confirm_cell(p_cell_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
begin
  update public.cells
     set confirmed_by = v_profile, confirmed_at = now(), updated_at = now()
   where id = p_cell_id;
  if not found then
    raise exception 'no cell %', p_cell_id;
  end if;
  return jsonb_build_object('cell_id', p_cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.confirm_cell(uuid) is
  'Owner-confirm a cell as it stands, in the caller''s name. Refused unless the caller''s profile may confirm.';

create function public.decline_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
begin
  update public.suggested_changes
     set status = 'declined', decided_by = v_profile, decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'no pending suggested change %', p_id;
  end if;
  return jsonb_build_object('suggested_change_id', p_id, 'decided_by', v_profile);
end
$$;

comment on function public.decline_suggested_change(uuid) is
  'Guard: the caller''s profile must hold may_confirm. Declines a pending suggestion without changing its cell.';

-- ─────────────────────────────────────────────────────────────────────────
-- 21000315000000_an_approval_records_the_cell_update.sql
-- ─────────────────────────────────────────────────────────────────────────

-- An approval records the cell edit in the same shape as other text edits.
-- Authored 2026-10-17. The log is audit-only; it does not replay an undo.
-- The prior confirmation pair belongs inside the captured update, so a
-- consumer restoring that update can restore an unconfirmed value too.

create or replace function public.approve_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
  v_change public.suggested_changes;
  v_previous public.cells;
begin
  select * into v_change from public.suggested_changes where id = p_id for update;
  if v_change.id is null then
    raise exception 'no suggested change %', p_id;
  end if;
  if v_change.status <> 'pending' then
    raise exception 'suggested change % is already %', p_id, v_change.status;
  end if;
  select * into strict v_previous from public.cells where id = v_change.cell_id for update;
  update public.cells
     set content = v_change.proposed_content,
         confirmed_by = v_profile,
         confirmed_at = now(),
         updated_at = now()
   where id = v_change.cell_id;
  update public.suggested_changes
     set status = 'approved', decided_by = v_profile, decided_at = now()
   where id = p_id;
  insert into public.authoring_changes (author, author_id, fn, args, revert)
  values ('human', (select user_id from public.profiles where id = v_profile),
    'update_cell_content', jsonb_build_object('cell_id', v_change.cell_id, 'update',
      jsonb_build_object('content', v_change.proposed_content, 'confirmed_by', v_profile, 'confirmed_at', now())),
    jsonb_build_object('fn', 'update_cell_content', 'args',
      jsonb_build_object('cell_id', v_previous.id, 'update',
        jsonb_build_object('content', v_previous.content, 'summary', coalesce(v_previous.summary, ''),
          'owner', coalesce(v_previous.owner, ''), 'perceivedOwner', coalesce(v_previous.perceived_owner, ''),
          'status', v_previous.status, 'confirmed_by', v_previous.confirmed_by,
          'confirmed_at', v_previous.confirmed_at))));
  return jsonb_build_object('cell_id', v_change.cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.approve_suggested_change(uuid) is
  'Apply a pending suggested change to its cell and owner-confirm the cell in the caller''s name. Refused unless the caller''s profile may confirm.';

-- ─────────────────────────────────────────────────────────────────────────
-- 21000316000000_a_proposal_is_a_validated_tool_call.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A server write and approval use the same transaction. Preview executes it
-- inside a rolled-back subtransaction: constraints and authoring guards run,
-- but neither the mutation nor its log survives proposal-time validation.
alter table public.suggested_changes
  alter column cell_id drop not null,
  alter column proposed_content drop not null,
  add column tool_name text,
  add column tool_args jsonb,
  add column service_id uuid references public.services(id) on delete cascade,
  add column base_state jsonb,
  add constraint suggested_changes_payload check (
    (tool_name is null and cell_id is not null and proposed_content is not null and tool_args is null)
    or (tool_name is not null and tool_args is not null and jsonb_typeof(tool_args) = 'object')
  );
alter table public.authoring_changes
  add column proposed_by uuid references public.profiles(id) on delete set null,
  add column approved_by uuid references public.profiles(id) on delete set null;

alter table public.audit_findings
  add column recorded_by uuid references public.profiles(id) on delete set null;
comment on column public.audit_findings.recorded_by is
  'The profile that first recorded this finding through an agent tool. Null when the original recorder is unknown.';

-- The service rename left the phase RPC's parameter ambiguous beside the
-- renamed column. Qualify the parameter before the new boundary calls it.
do $$ declare body text; before text; begin
  body:=pg_get_functiondef('public.create_phase(uuid,text,text)'::regprocedure);
  before:=body;
  body:=replace(body,'p.service_id = service_id','p.service_id = create_phase.service_id');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
  body:=pg_get_functiondef('public.duplicate_scenario(uuid,text)'::regprocedure);
  before:=body;
  body:=replace(body,'kind, label, note','kind, name, note');
  if body=before then raise exception 'Expected duplicate-scenario column patch did not match'; end if;
  before:=body;
  body:=replace(body,'t.label','t.name');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
end $$;

-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Scenario name"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5)","minimum":1},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Step name"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- The tool schemas' JSON Schema subset. Kept in the database so callers cannot
-- bypass validation by posting directly to the transaction RPC.
create function public.agent_check_shape(p_value jsonb, p_schema jsonb, p_path text default 'arguments') returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare k text; v jsonb; s jsonb; ok boolean; t text;
begin
  if p_schema ? 'anyOf' then
    ok := false;
    for s in select value from jsonb_array_elements(p_schema->'anyOf') loop
      begin perform public.agent_check_shape(p_value,s,p_path); ok:=true; exception when others then null; end;
    end loop;
    if not ok then raise exception '% does not fit the tool schema',p_path; end if;
    return;
  end if;
  t:=p_schema->>'type';
  if t='integer' then
    if jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) then
      raise exception '% must be an integer',p_path;
    end if;
  elsif t is not null and jsonb_typeof(p_value)<>t then raise exception '% must be %',p_path,t;
  end if;
  if p_schema ? 'enum' and not (p_schema->'enum' @> jsonb_build_array(p_value)) then raise exception '% is outside the allowed vocabulary',p_path; end if;
  if p_schema ? 'minimum' and (p_value#>>'{}')::numeric < (p_schema->>'minimum')::numeric then raise exception '% is below the IR minimum',p_path; end if;
  if t='string' and length(p_value#>>'{}')<coalesce((p_schema->>'minLength')::int,0) then raise exception '% needs text',p_path; end if;
  if t='object' then
    for k in select jsonb_array_elements_text(coalesce(p_schema->'required','[]')) loop
      if not p_value ? k then raise exception '% needs %',p_path,k; end if;
    end loop;
    for k,v in select * from jsonb_each(p_value) loop
      s:=p_schema->'properties'->k;
      if s is null and p_schema->'additionalProperties'='false'::jsonb then raise exception '% has unknown field %',p_path,k; end if;
      if s is not null then perform public.agent_check_shape(v,s,p_path||'.'||k); end if;
    end loop;
  elsif t='array' then
    if jsonb_array_length(p_value)<coalesce((p_schema->>'minItems')::int,0) then raise exception '% needs members',p_path; end if;
    for v in select value from jsonb_array_elements(p_value) loop perform public.agent_check_shape(v,p_schema->'items',p_path||'[]'); end loop;
  end if;
end $$;

create function public.agent_named_cells(p_args jsonb) returns uuid[]
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare k text; v jsonb; ids uuid[]:='{}'; nested uuid[];
begin
  if jsonb_typeof(p_args)='array' then
    for v in select value from jsonb_array_elements(p_args) loop ids:=ids||public.agent_named_cells(v); end loop;
  elsif jsonb_typeof(p_args)='object' then
    for k,v in select * from jsonb_each(p_args) loop
      if k='cell_id' or k like '%\_cell_id' escape '\' then ids:=array_append(ids,(v#>>'{}')::uuid);
      elsif k in ('cell_ids','cells') and jsonb_typeof(v)='array' then
        select coalesce(array_agg(value::uuid),'{}') into nested from jsonb_array_elements_text(v); ids:=ids||nested;
      else ids:=ids||public.agent_named_cells(v); end if;
    end loop;
  end if;
  return array(select distinct unnest(ids));
end $$;

create function public.agent_refuse_secrets(p_args jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'The host must supply secret validation before applying agent tools.';
end $$;

-- Capture the rows a proposal names. Lock them at approval, so a concurrent
-- edit cannot slip between the comparison and the normal write path.
create function public.agent_tool_state(p_args jsonb) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp as $$
declare state jsonb:='{}'; k text; v jsonb; tab text; row_data jsonb; id uuid;
begin
  for k,v in select * from jsonb_each(p_args) loop
    tab:=case k when 'cell_id' then 'cells' when 'source_cell_id' then 'cells' when 'target_cell_id' then 'cells' when 'path_id' then 'paths'
      when 'source_path_id' then 'paths' when 'source_scenario_id' then 'scenarios'
      when 'scenario_id' then 'scenarios' when 'phase_id' then 'phases'
      when 'stakeholder_id' then 'stakeholders' when 'evidence_id' then 'evidence'
      when 'slice_id' then 'slices' when 'finding_id' then 'audit_findings' end;
    if tab is not null then
      id:=(v#>>'{}')::uuid;
      execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into row_data using id;
      if row_data is null then raise exception 'The % no longer exists; read the blueprint and propose again.',replace(k,'_id',''); end if;
      state:=state||jsonb_build_object(k,row_data);
    end if;
  end loop;
  return state;
end $$;

create function public.agent_tool_transaction(p_tool text,p_args jsonb,p_service_id uuid,p_session_id uuid,
  p_preview boolean,p_proposer uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  a jsonb:=p_args; result jsonb; id uuid; before_cell public.cells;
  ids uuid[]; n int; value jsonb; slides jsonb; sid uuid; profile uuid:=public.caller_profile_id();
  old_gate text:=current_setting('ub.agent_transaction',true); state jsonb; free boolean; v_fingerprint text; existing public.audit_findings;
begin
  if profile is null then raise exception 'Sign in with a linked profile before writing.' using errcode='42501'; end if;
  perform public.agent_refuse_secrets(a);
  if public.agent_write_contracts()->p_tool is null then raise exception 'No write tool named %',p_tool; end if;
  perform public.agent_check_shape(a,public.agent_write_contracts()->p_tool);
  -- IR numeric fields are whole positions; scale advice is never a cap.
  if a ? 'at_position' and ((a->>'at_position')::numeric<0 or (a->>'at_position')::numeric<>trunc((a->>'at_position')::numeric)) then raise exception 'at_position must be a non-negative integer'; end if;
  if a ? 'step_count' and ((a->>'step_count')::numeric<1 or (a->>'step_count')::numeric<>trunc((a->>'step_count')::numeric)) then raise exception 'step_count must be a positive integer'; end if;
  for value in select val from jsonb_each(a) x(key,val) where key in ('name','title','content','summary','function','form','owner','perceived_owner') loop
    if btrim(value#>>'{}')='' then raise exception 'Name the text to write; blank text does not replace an existing value.'; end if;
  end loop;
  state:=public.agent_tool_state(a);
  free:=p_tool in ('create_finding','create_evidence') or (p_tool='update_evidence' and exists(
    select 1 from public.evidence e where e.id=(a->>'evidence_id')::uuid and e.contributed_by=profile));
  if not p_preview and not free then perform public.confirming_profile_id(); end if;
  ids:=public.agent_named_cells(a);
  n:=cardinality(ids);
  if p_tool='duplicate_path' and coalesce((a->>'copy_cells')::boolean,true) then select count(*) into n from public.cells where path_id=(a->>'source_path_id')::uuid;
  elsif p_tool='duplicate_scenario' then select count(*) into n from public.cells c join public.paths p on p.id=c.path_id where p.scenario_id=(a->>'source_scenario_id')::uuid; end if;
  if n>50 then raise exception 'This call touches more than 50 cells. Split it into calls touching at most 50 cells each.'; end if;
  if exists(select 1 from unnest(ids) x where not exists(select 1 from public.cells c where c.id=x)) then raise exception 'A named cell no longer exists; read the blueprint and try again.'; end if;
  if p_service_id is not null and exists(select 1 from public.cells c join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id join public.phases ph on ph.id=s.phase_id where c.id=any(ids) and ph.service_id<>p_service_id) then raise exception 'A named cell belongs to another service.'; end if;
  -- The private gate widens legacy authoring RPCs only inside this checked
  -- transaction. It never alters a JWT or a person's stored permissions.
  begin
    perform set_config('ub.agent_transaction','on',true);
    case p_tool
      when 'create_phase' then
        if p_service_id is null then raise exception 'Pass service_id from list_blueprint before creating under a service.'; end if;
        result:=to_jsonb(public.create_phase(p_service_id,a->>'name',a->>'summary'));
      when 'create_scenario' then result:=public.create_scenario((a->>'phase_id')::uuid,a->>'name','stacked',(a->>'lane_source_path_id')::uuid,'[]',coalesce((a->>'step_count')::int,5),coalesce(a->>'path_name','Happy Path'));
      when 'create_path' then result:=to_jsonb(public.create_path((a->>'scenario_id')::uuid,a->>'name',coalesce(a->>'kind','variant'),(a->>'lane_source_path_id')::uuid));
      when 'duplicate_path' then result:=to_jsonb(public.duplicate_path((a->>'source_path_id')::uuid,a->>'name',coalesce(a->>'kind','variant'),coalesce((a->>'copy_cells')::boolean,true),coalesce((a->>'copy_cells')::boolean,true)));
      when 'duplicate_scenario' then result:=to_jsonb(public.duplicate_scenario((a->>'source_scenario_id')::uuid,a->>'name'));
      when 'create_step' then result:=to_jsonb(public.add_step((a->>'path_id')::uuid,a->>'name',(a->>'at_position')::int));
      when 'create_lane' then result:=to_jsonb(public.add_lane((a->>'scenario_id')::uuid,a->>'name',a->>'lane_role',(a->>'at_position')::int));
      when 'update_path' then
        perform public.rename_path((a->>'path_id')::uuid,a->>'name'); result:='"Path renamed."';
      when 'upsert_cell' then
        if exists(select 1 from public.cells where path_id=(a->>'path_id')::uuid and lane_id=(a->>'lane_id')::uuid and step_id=(a->>'step_id')::uuid) then raise exception 'That slot is already filled; use update_cell.'; end if;
        result:=public.upsert_cell((a->>'path_id')::uuid,(a->>'lane_id')::uuid,(a->>'step_id')::uuid,a->>'content');
      when 'update_cell' then
        select * into strict before_cell from public.cells where cells.id=(a->>'cell_id')::uuid for update;
        if not (a ?| array['content','summary','owner','perceived_owner','function','form','value_props']) then raise exception 'Name at least one cell field to change.'; end if;
        update public.cells set content=coalesce(a->>'content',content),summary=coalesce(a->>'summary',summary),
          owner=coalesce(a->>'owner',owner),perceived_owner=coalesce(a->>'perceived_owner',perceived_owner),
          function=coalesce(a->>'function',function),form=coalesce(a->>'form',form),value_props=coalesce(a->'value_props',value_props),confirmed_by=profile,confirmed_at=now(),updated_at=now()
          where cells.id=before_cell.id;
        if a ? 'content' then perform public.sync_cell_touchpoints(before_cell.id,regexp_split_to_array(a->>'content',E'[\\r\\n,]+')); end if;
        result:=jsonb_build_object('cell_id',before_cell.id);
      when 'create_cell_dependency' then result:=public.set_cell_dependency((a->>'source_cell_id')::uuid,(a->>'target_cell_id')::uuid,coalesce(a->>'kind','leads_to'),null,a->>'label');
      when 'create_stakeholder' then
        insert into public.stakeholders(name,kind,summary,aliases) values(a->>'name',a->>'kind',a->>'summary',array(select jsonb_array_elements_text(coalesce(a->'aliases','[]')))) returning stakeholders.id into id; result:=to_jsonb(id);
      when 'update_stakeholder' then
        update public.stakeholders set name=coalesce(a->>'name',name),kind=coalesce(a->>'kind',kind),summary=coalesce(a->>'summary',summary),aliases=case when a ? 'aliases' then array(select jsonb_array_elements_text(a->'aliases')) else aliases end where stakeholders.id=(a->>'stakeholder_id')::uuid returning stakeholders.id into id;
        result:=to_jsonb(id);
      when 'create_evidence' then
        select ph.service_id into sid from public.cells c join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id join public.phases ph on ph.id=s.phase_id where c.id=(a->>'cell_id')::uuid;
        insert into public.evidence(service_id,cell_id,cell_key,kind,title,note,contributed_by) values(sid,(a->>'cell_id')::uuid,a->>'cell_id',a->>'kind',a->>'title',a->>'note',profile) returning evidence.id into id; result:=to_jsonb(id);
      when 'update_evidence' then
        update public.evidence set kind=coalesce(a->>'kind',kind),title=coalesce(a->>'title',title),note=coalesce(a->>'note',note),updated_at=now() where evidence.id=(a->>'evidence_id')::uuid returning evidence.id into id; result:=to_jsonb(id);
      when 'create_slice' then
        if p_service_id is null then raise exception 'Pass service_id from list_blueprint before creating a slice.'; end if;
        if cardinality(ids)=0 then raise exception 'A slice needs existing cell ids.'; end if;
        select jsonb_agg(jsonb_build_object('cell_ids',jsonb_build_array(x),'cell_keys',jsonb_build_array(x),'shows_all_images',true,'images','[]'::jsonb) order by ord) into slides from jsonb_array_elements(a->'cell_ids') with ordinality item(x,ord);
        result:=public.create_slice(p_service_id,a->>'title',coalesce(a->>'summary',''),a->>'kind',coalesce(a->>'actor',''),slides);
      when 'update_slice' then
        update public.slices set title=coalesce(a->>'title',title),summary=coalesce(a->>'summary',summary),actor=coalesce(a->>'actor',actor),kind=coalesce(a->>'kind',kind),updated_at=now() where slices.id=(a->>'slice_id')::uuid returning slices.id into id; result:=to_jsonb(id);
      when 'replace_slides' then
        if jsonb_array_length(a->'slides')=0 then raise exception 'slides must be a non-empty array.'; end if;
        select jsonb_agg(jsonb_build_object('cell_ids',v->'cells','cell_keys',v->'cells','title',v->>'title','caption',v->>'caption','shows_all_images',true,'images','[]'::jsonb) order by ord) into slides from jsonb_array_elements(a->'slides') with ordinality x(v,ord);
        result:=public.replace_slides((a->>'slice_id')::uuid,slides);
      when 'create_finding' then
        if p_service_id is null then raise exception 'Pass service_id before recording a finding.'; end if;
        if n=0 and coalesce(a->>'scope','')='' then raise exception 'A zero-cell finding needs a scope.'; end if;
        v_fingerprint:=(a->>'check_key')||':'||case when n=0 then a->>'scope' else
          (select encode(sha256(convert_to(string_agg(x::text,E'\n' order by x::text),'UTF8')),'hex') from unnest(ids) x) end;
        select * into existing from public.audit_findings f where f.service_id=p_service_id and f.fingerprint=v_fingerprint
          order by case f.status when 'open' then 0 when 'dismissed' then 1 else 2 end,updated_at desc limit 1 for update;
        if existing.status='dismissed' then
          perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
          return jsonb_build_object('outcome','suppressed','message','A person dismissed this finding; nothing was recorded.');
        elsif existing.status='open' then
          if existing.recorded_by is distinct from profile and not exists(
            select 1 from public.profiles p where p.id=profile and p.may_confirm
          ) then
            perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
            return jsonb_build_object('outcome','unchanged','result',existing.id,
              'message','An open finding already records this check. Only its original recorder or someone who may confirm can revise it; nothing was changed.');
          end if;
          update public.audit_findings set run_id=coalesce((a->>'run_id')::uuid,gen_random_uuid()),source=a->>'source',severity=a->>'severity',impact=a->>'impact',effort=a->>'effort',summary=a->>'summary',cell_ids=ids,cell_keys=array(select x::text from unnest(ids) x),updated_at=now() where audit_findings.id=existing.id;
          id:=existing.id;
        else
          insert into public.audit_findings(service_id,run_id,source,check_key,severity,impact,effort,summary,cell_ids,cell_keys,fingerprint,recorded_by)
            values(p_service_id,coalesce((a->>'run_id')::uuid,gen_random_uuid()),a->>'source',a->>'check_key',a->>'severity',a->>'impact',a->>'effort',a->>'summary',ids,array(select x::text from unnest(ids) x),v_fingerprint,profile)
            returning audit_findings.id into id;
        end if;
        result:=to_jsonb(id);
      when 'update_finding' then
        update public.audit_findings set status=a->>'status',updated_at=now() where audit_findings.id=(a->>'finding_id')::uuid returning audit_findings.id into id; result:=to_jsonb(id);
      else raise exception 'This write has no transactional implementation: %',p_tool;
    end case;
    insert into public.authoring_changes(fn,args,author,author_id,agent_session_id,proposed_by,approved_by)
      values(p_tool,a||jsonb_build_object('service_id',p_service_id,'result',result),'agent',(select user_id from public.profiles where profiles.id=profile),p_session_id,p_proposer,
        case when free then null else profile end);
    perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
    if p_preview then raise exception using errcode='UB001',message='preview'; end if;
  exception when sqlstate 'UB001' then null;
  end;
  return jsonb_build_object('outcome',case when p_preview then 'validated' else 'applied' end,'result',result,'base_state',state);
end $$;

create function public.run_agent_tool(p_tool text,p_args jsonb,p_session_id uuid,p_service_id uuid default null,p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare profile public.profiles; preview jsonb; proposal uuid; free boolean;
begin
  if p_tool in ('approve_suggested_change','decline_suggested_change') then
    perform public.agent_refuse_secrets(p_args);
    perform public.agent_check_shape(p_args,public.agent_write_contracts()->p_tool);
  end if;
  if p_tool='approve_suggested_change' then return public.approve_suggested_change((p_args->>'suggested_change_id')::uuid); end if;
  if p_tool='decline_suggested_change' then perform public.decline_suggested_change((p_args->>'suggested_change_id')::uuid); return jsonb_build_object('outcome','declined'); end if;
  select * into profile from public.profiles where id=public.caller_profile_id();
  if profile.id is null then raise exception 'Sign in with a linked profile before writing.' using errcode='42501'; end if;
  free:=p_tool in ('create_finding','create_evidence') or (p_tool='update_evidence' and exists(
    select 1 from public.evidence e where e.id=(p_args->>'evidence_id')::uuid and e.contributed_by=profile.id));
  if (profile.may_confirm and p_confirmed) or free then
    return public.agent_tool_transaction(p_tool,p_args,p_service_id,p_session_id,false);
  end if;
  preview:=public.agent_tool_transaction(p_tool,p_args,p_service_id,p_session_id,true);
  if p_tool='update_cell' and p_args ? 'content' and (p_args-'cell_id'-'content')='{}'::jsonb then
    preview:=public.record_contribution((p_args->>'cell_id')::uuid,'Told to Uno in a tool call',p_args->>'content',p_args->>'content');
    return jsonb_build_object('outcome','proposed','suggested_change_id',preview->'suggested_change_id','evidence_id',preview->'evidence_id','message','Recorded the contribution as evidence and a pending cell-content suggestion; the cell is unchanged.');
  end if;
  insert into public.suggested_changes(tool_name,tool_args,service_id,base_state,suggested_by)
    values(p_tool,p_args,p_service_id,preview->'base_state',profile.id) returning id into proposal;
  return jsonb_build_object('outcome','proposed','suggested_change_id',proposal,'message','Recorded a proposal; the blueprint is unchanged. A person who may confirm must review and approve it.');
end $$;

-- The existing approval function is retained for old cell-content proposals.
alter function public.approve_suggested_change(uuid) rename to approve_cell_content_suggestion;
do $$ declare body text; before text; begin
  body:=pg_get_functiondef('public.approve_cell_content_suggestion(uuid)'::regprocedure);
  before:=body;
  body:=replace(body,'(author, author_id, fn, args, revert)','(author, author_id, proposed_by, approved_by, fn, args, revert)');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  before:=body;
  body:=replace(body,$old$('human', (select user_id from public.profiles where id = v_profile),$old$,$new$('human', (select user_id from public.profiles where id = v_profile), v_change.suggested_by, v_profile,$new$);
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
end $$;
create function public.approve_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare proposal public.suggested_changes; approver uuid:=public.confirming_profile_id(); result jsonb;
begin
  select * into proposal from public.suggested_changes where id=p_id for update;
  if proposal.id is null then raise exception 'That proposal no longer exists.'; end if;
  if proposal.status<>'pending' then raise exception 'That proposal is already %.',proposal.status; end if;
  if proposal.tool_name is null then
    if proposal.base_state is not null and public.agent_tool_state(jsonb_build_object('cell_id',proposal.cell_id)) is distinct from proposal.base_state then
      raise exception 'The proposed target changed since this proposal. Read it and propose again; nothing was written.';
    end if;
    perform public.agent_tool_transaction('update_cell',jsonb_build_object('cell_id',proposal.cell_id,'content',proposal.proposed_content),null,gen_random_uuid(),true);
    result:=public.approve_cell_content_suggestion(p_id);
    return result;
  end if;
  if public.agent_tool_state(proposal.tool_args) is distinct from proposal.base_state then
    raise exception 'The proposed target changed since this proposal. Read it and propose again; nothing was written.';
  end if;
  result:=public.agent_tool_transaction(proposal.tool_name,proposal.tool_args,proposal.service_id,gen_random_uuid(),false,proposal.suggested_by);
  update public.suggested_changes set status='approved',decided_by=approver,decided_at=now() where id=p_id;
  return result;
end $$;

-- Old cell-content contributions remain one kind in this same queue. Their
-- creation and approval now pass the same preview checks as tool proposals.
create function public.validate_cell_content_suggestion() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.tool_name is null then
    perform public.agent_tool_transaction('update_cell',jsonb_build_object('cell_id',new.cell_id,'content',new.proposed_content),null,gen_random_uuid(),true);
    new.base_state:=public.agent_tool_state(jsonb_build_object('cell_id',new.cell_id));
  end if;
  return new;
end $$;
create trigger validate_cell_content_suggestion before insert on public.suggested_changes
  for each row execute function public.validate_cell_content_suggestion();

revoke all on function public.agent_check_shape(jsonb,jsonb,text),public.agent_named_cells(jsonb),public.agent_refuse_secrets(jsonb),public.validate_cell_content_suggestion(),public.agent_tool_state(jsonb),public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid),public.agent_write_contracts(),public.approve_cell_content_suggestion(uuid),public.run_agent_tool(text,jsonb,uuid,uuid,boolean),public.approve_suggested_change(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000317000000_a_server_write_captures_its_prior_rows.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-19.
-- Server inverse data is an audit capture, never a canvas RevertSpec.
-- Capture actual row changes, including RPC side effects, in the write's
-- transaction. Preview rollback also rolls back its transaction-local capture.
create function public.capture_agent_prior_rows() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if current_setting('ub.agent_transaction',true)='on'
     and current_setting('ub.capture_agent_prior',true)='on' then
    perform set_config('ub.agent_prior_rows',
      (coalesce(nullif(current_setting('ub.agent_prior_rows',true),''),'[]')::jsonb
        || jsonb_build_array(jsonb_build_object('table',tg_table_name,
          'before',case when tg_op='INSERT' then null else to_jsonb(old) end,
          'after',case when tg_op='DELETE' then null else to_jsonb(new) end)))::text,true);
  end if;
  return null;
end $$;
revoke all on function public.capture_agent_prior_rows() from public;

-- Capture the canonical authored surface and the structural RPC side effects.
-- run-authoring-db checks this against PANEL_WRITE_SURFACE.
-- Private profiles and conversations are outside this capture.
do $$ declare relation text; begin
  foreach relation in array array['services','business_models','phases','scenarios','paths','steps','path_steps',
    'lanes','cells','cell_dependencies','stakeholders','evidence','slices','slides',
    'slide_images','audit_findings','cell_touchpoints','touchpoints','resources'] loop
    execute format('create trigger capture_agent_prior after insert or update or delete on public.%I for each row execute function public.capture_agent_prior_rows()',relation);
  end loop;
end $$;

do $$ declare body text; previous text; begin
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  previous:=body;
  body:=replace(body,'old_gate text:=',
    $patch$old_capture text:=current_setting('ub.capture_agent_prior',true); old_rows text:=current_setting('ub.agent_prior_rows',true);
  old_gate text:=$patch$);
  if body=previous then raise exception 'The transaction capture declaration did not match'; end if;
  previous:=body;
  body:=replace(body,$old$perform set_config('ub.agent_transaction','on',true);$old$,
    $patch$perform set_config('ub.agent_transaction','on',true);
    perform set_config('ub.agent_prior_rows','[]',true);
    perform set_config('ub.capture_agent_prior','on',true);$patch$);
  if body=previous then raise exception 'The transaction capture entry did not match'; end if;
  previous:=body;
  body:=replace(body,'(fn,args,author,author_id,agent_session_id,proposed_by,approved_by)',
    '(fn,args,author,author_id,agent_session_id,proposed_by,approved_by,revert)');
  if body=previous then raise exception 'The inverse column did not match'; end if;
  previous:=body;
  body:=replace(body,'case when free then null else profile end);',
    $patch$case when free then null else profile end,
        jsonb_build_object('kind','captured_rows','rows',current_setting('ub.agent_prior_rows')::jsonb));$patch$);
  if body=previous then raise exception 'The inverse data did not match'; end if;
  previous:=body;
  body:=replace(body,$old$perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);$old$,
    $patch$perform set_config('ub.capture_agent_prior',coalesce(old_capture,''),true);
    perform set_config('ub.agent_prior_rows',coalesce(old_rows,''),true);
    perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);$patch$);
  if body=previous then raise exception 'The transaction capture exit did not match'; end if;
  previous:=body;
  body:=replace(body,'values(p_tool,a||jsonb_build_object(',
    $patch$values(case when p_proposer is null then p_tool else 'approve_suggested_change' end,a||jsonb_build_object('tool_name',p_tool,$patch$);
  if body=previous then raise exception 'The tool approval action label did not match'; end if;
  execute body;
  body:=pg_get_functiondef('public.approve_cell_content_suggestion(uuid)'::regprocedure);
  previous:=body;
  -- Change only the action label; its captured inverse remains a cell update.
  body:=replace(body,$old$'update_cell_content', jsonb_build_object('cell_id', v_change.cell_id$old$,
    $patch$'approve_suggested_change', jsonb_build_object('cell_id', v_change.cell_id$patch$);
  if body=previous then raise exception 'The approval action label did not match'; end if;
  execute body;
end $$;

comment on column public.authoring_changes.revert is
  'Audit-only inverse data: browser writes and existing cell-content approvals hold a RevertSpec; server tool transactions and their approvals hold captured_rows with before and after values. Durable rows are never replayed by canvas undo.';

-- ─────────────────────────────────────────────────────────────────────────
-- 21000318000000_a_confirmer_can_start_a_service.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A new service uses the existing checked write and proposal transaction.
-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Scenario name"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5)","minimum":1},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Step name"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

do $$
declare body text; before text;
begin
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  before:=body;
  body:=replace(body,$old$      when 'create_phase' then$old$,$new$      when 'create_service' then
        id:=gen_random_uuid();
        insert into public.services(id,name,summary,slug)
          values(id,a->>'name',a->>'summary','service-'||id::text);
        result:=to_jsonb(id);
      when 'create_phase' then$new$);
  if body=before then raise exception 'Expected service transaction branch did not match'; end if;
  before:=body;
  body:=replace(body,'Pass service_id from list_blueprint before creating under a service.',
    'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.');
  body:=replace(body,'Pass service_id from list_blueprint before creating a slice.',
    'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.');
  body:=replace(body,'Pass service_id before recording a finding.',
    'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.');
  if body=before then raise exception 'Expected missing-service refusals did not match'; end if;
  execute body;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000319000000_journey_structure_can_be_named.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Renames and initial step names use the same checked, attributed transaction.
-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Scenario name"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Step name"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

do $$
declare body text; before text;
begin
  body:=pg_get_functiondef('public.agent_tool_state(jsonb)'::regprocedure);
  before:=body;
  body:=replace(body,$old$when 'phase_id' then 'phases'$old$,
    $new$when 'phase_id' then 'phases' when 'step_id' then 'steps' when 'lane_id' then 'lanes'$new$);
  if body=before then raise exception 'Expected structure state branch did not match'; end if;
  execute body;

  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  before:=body;
  body:=replace(body,$old$      when 'update_path' then$old$,$new$      when 'update_phase' then
        perform public.rename_phase((a->>'phase_id')::uuid,a->>'name'); result:='"Phase renamed."';
      when 'update_scenario' then
        perform public.rename_scenario((a->>'scenario_id')::uuid,a->>'name'); result:='"Scenario renamed."';
      when 'update_step' then
        update public.steps set name=a->>'name' where steps.id=(a->>'step_id')::uuid; result:='"Step renamed."';
      when 'update_lane' then
        update public.lanes set name=a->>'name' where lanes.id=(a->>'lane_id')::uuid; result:='"Lane renamed."';
      when 'update_path' then$new$);
  if body=before then raise exception 'Expected structure transaction branch did not match'; end if;
  before:=body;
  body:=replace(body,$old$      when 'create_scenario' then result:=public.create_scenario((a->>'phase_id')::uuid,a->>'name','stacked',(a->>'lane_source_path_id')::uuid,'[]',coalesce((a->>'step_count')::int,5),coalesce(a->>'path_name','Happy Path'));$old$,
  $new$      when 'create_scenario' then
        if a ? 'step_names' then
          if a ? 'step_count' and (a->>'step_count')::int<>jsonb_array_length(a->'step_names') then
            raise exception 'step_count must match the number of step_names';
          end if;
          if exists(select 1 from jsonb_array_elements_text(a->'step_names') label where btrim(label)='') then
            raise exception 'Each initial step needs a name';
          end if;
        end if;
        result:=public.create_scenario((a->>'phase_id')::uuid,a->>'name','stacked',(a->>'lane_source_path_id')::uuid,'[]',coalesce(jsonb_array_length(a->'step_names'),(a->>'step_count')::int,5),coalesce(a->>'path_name','Happy Path'));
        if a ? 'step_names' then
          update public.steps s set name=label.name
            from public.path_steps ps, jsonb_array_elements_text(a->'step_names') with ordinality label(name,ordinal)
            where ps.path_id=(result->>'path_id')::uuid and ps.step_id=s.id and ps.position=label.ordinal-1;
        end if;$new$);
  if body=before then raise exception 'Expected scenario transaction branch did not match'; end if;
  execute body;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000320000000_a_service_can_be_read_for_validation.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-20.
-- One statement gives validation a consistent, complete snapshot without
-- changing rows or inheriting the Data API's row limit on a tree of reads.
create function public.read_service_blueprint(p_service_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog, pg_temp as $$
  select to_jsonb(service) || jsonb_build_object(
    'touchpoints',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.touchpoints t
      where exists(select 1 from public.cell_touchpoints ct join public.cells c on c.id=ct.cell_id
        join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id
        join public.phases ph on ph.id=s.phase_id
        where ct.touchpoint_id=t.id and ph.service_id=service.id)),'[]'),
    'phases',coalesce((select jsonb_agg(to_jsonb(ph) || jsonb_build_object(
      'scenarios',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'steps',coalesce((select jsonb_agg(to_jsonb(st) order by st.id) from public.steps st where st.scenario_id=s.id),'[]'),
        'paths',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
          'path_steps',coalesce((select jsonb_agg(to_jsonb(ps) order by ps.position,ps.step_id) from public.path_steps ps where ps.path_id=p.id),'[]'),
          'lanes',coalesce((select jsonb_agg(to_jsonb(l) order by l.position,l.id) from public.lanes l where l.path_id=p.id),'[]'),
          'cells',coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
            'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.resources r where r.cell_id=c.id),'[]'),
            'touchpoints',coalesce((select jsonb_agg(to_jsonb(ct) || jsonb_build_object(
              'name',coalesce(t.name,ct.name),
              'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.resources r where r.cell_touchpoint_id=ct.id),'[]')
            ) order by ct.position,ct.id) from public.cell_touchpoints ct
              left join public.touchpoints t on t.id=ct.touchpoint_id where ct.cell_id=c.id),'[]')
          ) order by c.position,c.id) from public.cells c where c.path_id=p.id),'[]'),
          'dependencies',coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object(
            'source_lane_id',source.lane_id,'source_step_id',source.step_id,
            'target_lane_id',target.lane_id,'target_step_id',target.step_id
          ) order by d.id) from public.cell_dependencies d
            join public.cells source on source.id=d.source_cell_id
            left join public.cells target on target.id=d.target_cell_id where source.path_id=p.id),'[]')
        ) order by p.id) from public.paths p where p.scenario_id=s.id),'[]')
      ) order by s.position,s.id) from public.scenarios s where s.phase_id=ph.id),'[]')
    ) order by ph.position,ph.id) from public.phases ph where ph.service_id=service.id),'[]')
  ) from public.services service where service.id=p_service_id;
$$;
revoke all on function public.read_service_blueprint(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000321000000_structure_writes_refuse_unapplied_changes.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-20. Applied migrations stay unchanged; this tightens their gateway.
-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Scenario name"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Step name"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

-- Each expected body fragment is checked before the next replacement.
do $$
declare body text; before text; level text; tab text; old text; replacement text; tool text;
begin
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  foreach level in array array['step','lane'] loop
    tab:=case level when 'step' then 'steps' else 'lanes' end;
    old:=format('update public.%1$s set name=a->>''name'' where %1$s.id=(a->>''%2$s_id'')::uuid;',tab,level);
    replacement:=format($fragment$if p_service_id is not null and not exists(
          select 1 from public.%1$I t
          join public.%3$I parent on parent.id=t.%4$I
          join public.phases ph on ph.id=parent.phase_id
          where t.id=(a->>%2$L)::uuid and ph.service_id=p_service_id
        ) then raise exception 'That %5$s belongs to another service; read the selected service blueprint and choose its id.'; end if;
        update public.%1$I set name=a->>'name' where %1$I.id=(a->>%2$L)::uuid;
        if not found then raise exception 'That %5$s no longer exists; read the blueprint and choose its id.'; end if;$fragment$,
        tab,level||'_id',case level when 'step' then 'scenarios' else 'paths' end,
        case level when 'step' then 'scenario_id' else 'path_id' end,level);
    -- Lanes reach their phase through paths and scenarios, unlike steps.
    if level='lane' then
      replacement:=replace(replacement,'join public.phases ph on ph.id=parent.phase_id',
        'join public.scenarios scenario on scenario.id=parent.scenario_id join public.phases ph on ph.id=scenario.phase_id');
    end if;
    before:=body; body:=replace(body,old,replacement);
    if body=before then raise exception 'Expected % rename update did not match',level; end if;
  end loop;
  foreach tool in array array['create_phase','create_slice','create_finding'] loop
    old:=format(E'when %L then\n        if p_service_id is null then raise exception %L; end if;',tool,
      'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.');
    replacement:=format(E'when %L then\n        if p_service_id is null then raise exception using message=public.agent_service_required_message(); end if;',tool);
    before:=body; body:=replace(body,old,replacement);
    if body=before then raise exception 'Expected missing-service refusal for % did not match',tool; end if;
  end loop;
  execute body;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000322000000_structure_labels_have_explanations.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-20. Names label a structure; summaries explain it.
-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Short stage label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this scenario; an empty string leaves it blank; omit for none"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Short label for what happens; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this step; an empty string leaves it blank; omit for none"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

-- Extend each existing dispatch branch in place; summaries share its audit capture.
do $$
declare body text; previous text; level text; old text; replacement text;
begin
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  foreach level in array array['phase','scenario','step'] loop
    if level='step' then
      old:='update public.steps set name=a->>''name'' where steps.id=(a->>''step_id'')::uuid;';
      replacement:='update public.steps set name=a->>''name'', summary=case when a ? ''summary'' then a->>''summary'' else summary end where steps.id=(a->>''step_id'')::uuid;';
    else
      old:=format('perform public.rename_%1$s((a->>''%1$s_id'')::uuid,a->>''name'');',level);
      replacement:=old||format(' if a ? ''summary'' then update public.%1$s set summary=a->>''summary'' where %1$s.id=(a->>''%2$s_id'')::uuid; end if;',case level when 'phase' then 'phases' else 'scenarios' end,level);
    end if;
    previous:=body; body:=replace(body,old,replacement);
    if body=previous then raise exception 'Expected % summary branch did not match',level; end if;
  end loop;
  old:=$fragment$result:=to_jsonb(public.add_step((a->>'path_id')::uuid,a->>'name',(a->>'at_position')::int));$fragment$;
  replacement:=old||$fragment$ if a ? 'summary' then update public.steps set summary=a->>'summary' where steps.id=(result#>>'{}')::uuid; end if;$fragment$;
  previous:=body; body:=replace(body,old,replacement);
  if body=previous then raise exception 'Expected create_step summary branch did not match'; end if;
  old:=$fragment$result:=public.create_scenario((a->>'phase_id')::uuid,a->>'name','stacked',(a->>'lane_source_path_id')::uuid,'[]',coalesce(jsonb_array_length(a->'step_names'),(a->>'step_count')::int,5),coalesce(a->>'path_name','Happy Path'));$fragment$;
  replacement:=old||$fragment$ if a ? 'summary' then update public.scenarios set summary=a->>'summary' where scenarios.id=(result->>'scenario_id')::uuid; end if;$fragment$;
  previous:=body; body:=replace(body,old,replacement);
  if body=previous then raise exception 'Expected create_scenario summary branch did not match'; end if;
  -- Distinguish an absent id from an existing object in another service.
  foreach level in array array['step','lane'] loop
    old:=format('when %L then', 'update_'||level);
    replacement:=old||format(' if not exists(select 1 from public.%1$s t where t.id=(a->>%2$L)::uuid) then raise exception %3$L; end if;',case level when 'step' then 'steps' else 'lanes' end,level||'_id','That '||level||' no longer exists; read the blueprint and choose its id.');
    previous:=body; body:=replace(body,old,replacement);
    if body=previous then raise exception 'Expected % existence branch did not match',level; end if;
  end loop;
  old:=$fragment$where key in ('name','title','content','summary','function','form','owner','perceived_owner') loop$fragment$;
  replacement:=$fragment$where key in ('name','title','content','summary','function','form','owner','perceived_owner')
    and not (key='summary' and val='""'::jsonb and p_tool in ('create_step','create_scenario','update_phase','update_scenario','update_step')) loop$fragment$;
  previous:=body; body:=replace(body,old,replacement);
  if body=previous then raise exception 'Expected summary clear guard did not match'; end if;
  execute body;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000323000000_undo_of_an_add_keeps_the_numbering_it_found.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-10-31. Undo of an Add restores the numbering it found, whatever it started from.

-- `undo_structure_add` (last written by 21000311) required every `before`
-- position to equal its array index: 0, 1, 2, … Many existing paths number
-- their steps and lanes from 1, or carry gaps from older edits. The Add
-- itself renumbers the path from 0, so its receipt captures the original
-- numbering in `before`, and that numbering then failed the rule: Undo of
-- every Add on such a path was refused with "This change cannot be undone.
-- Reload the canvas".
--
-- The `before` array order is the path order. The rule it needs is that the
-- numbering agrees with that order: each position is a non-negative integer,
-- and positions strictly increase along the array, which also makes them
-- distinct. Every other guard is unchanged: identities, memberships, the
-- after-order matching the path as it is now, and content added since.
--
-- The other inverses were audited for the same assumption and need no change.
-- `undo_structure_order` and `undo_step_path_change` restore the stored
-- positions without comparing them to an ordinal, and the forward writes
-- compare identities, never positions. The proof below performs each round
-- trip on a path numbered from 1.
--
-- `create or replace` keeps the function's oid and with it every grant.

create or replace function public.undo_structure_add(snapshot jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare p uuid; rows jsonb; actual jsonb; ids uuid[]; kind text := snapshot->>'kind'; memberships uuid[]; named_paths uuid[]; n integer;
begin
  perform public.require_structure_author();
  if kind is null or kind not in ('lane','step')
    or jsonb_typeof(snapshot->'before') is distinct from 'object'
    or jsonb_typeof(snapshot->'after') is distinct from 'object' or snapshot->'after'='{}'
    or jsonb_typeof(snapshot->'ids') is distinct from 'array' or snapshot->'ids'='[]'
    or (select array_agg(key order by key) from jsonb_each(snapshot->'before')) is distinct from
       (select array_agg(key order by key) from jsonb_each(snapshot->'after')) then
    raise exception 'This change cannot be undone. Reload the canvas';
  end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(snapshot->'ids') x;
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or array_position(ids,null) is not null then
    raise exception 'This change cannot be undone. Reload the canvas';
  end if;
  select array_agg(key::uuid order by key::uuid) into named_paths from jsonb_each(snapshot->'after');
  perform 1 from public.paths where id=any(named_paths) order by id for update;
  if kind='step' then
    perform 1 from public.steps where id=any(ids) order by id for update;
    select count(*) into n from public.steps where id=any(ids);
    select array_agg(distinct path_id order by path_id) into memberships from public.path_steps where step_id=any(ids);
  else
    perform 1 from public.lanes where id=any(ids) order by id for update;
    select count(*) into n from public.lanes where id=any(ids);
    select array_agg(distinct path_id order by path_id) into memberships from public.lanes where id=any(ids);
  end if;
  if n<>cardinality(ids) or memberships is distinct from named_paths then raise exception 'This change cannot be undone. Reload the canvas'; end if;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'after') order by key loop
    if jsonb_typeof(rows) is distinct from 'array' or jsonb_typeof(snapshot->'before'->p::text) is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(snapshot->'before'->p::text) q(value)
        where coalesce(q.value->>'position','') !~ '^(0|[1-9][0-9]*)$')
      -- The array order is the path order: its numbering must strictly rise.
      or exists(select 1 from (
          select (q.value->>'position')::numeric as position,
                 lag((q.value->>'position')::numeric) over (order by q.n) as previous
          from jsonb_array_elements(snapshot->'before'->p::text) with ordinality q(value,n)) w
        where w.position<=w.previous)
      or (select count(*) from jsonb_array_elements(snapshot->'before'->p::text)) <>
         (select count(distinct q->>'id') from jsonb_array_elements(snapshot->'before'->p::text) q)
      or (select array_agg(q->>'id' order by q->>'id') from jsonb_array_elements(snapshot->'before'->p::text) q) is distinct from
         (select array_agg(q->>'id' order by q->>'id') from jsonb_array_elements(rows) q where not (q->>'id')::uuid=any(ids)) then
      raise exception 'This change cannot be undone. Reload the canvas';
    end if;
    if kind='step' then
      select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') into actual from public.path_steps where path_id=p;
    else
      select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') into actual from public.lanes where path_id=p;
    end if;
    if actual is distinct from rows then raise exception 'This path changed since Add. Reload before undoing this change'; end if;
  end loop;
  -- FOR UPDATE on the parent ids also excludes concurrent FK inserts while
  -- checking dependent content. Even a blank cell is later authored work.
  if kind='step' then
    if exists(select 1 from public.cells where step_id=any(ids)) then raise exception 'This step has content since Add. Delete it instead if you mean to'; end if;
    delete from public.steps where id=any(ids);
  else
    if exists(select 1 from public.cells where lane_id=any(ids)) then raise exception 'This lane has content since Add. Delete it instead if you mean to'; end if;
    delete from public.lanes where id=any(ids);
  end if;
  for p,rows in select key::uuid,value from jsonb_each(snapshot->'before') loop
    if kind='step' then
      update public.path_steps ps set position=(q->>'position')::int from jsonb_array_elements(rows) q where ps.path_id=p and ps.step_id=(q->>'id')::uuid;
    else
      update public.lanes l set position=(q->>'position')::int from jsonb_array_elements(rows) q where l.path_id=p and l.id=(q->>'id')::uuid;
    end if;
  end loop;
end $$;

-- Paths numbered from 1, or with gaps, round-trip through every structure
-- Undo; a numbering that disagrees with its order is still refused. Fixtures
-- roll back.
create function pg_temp.expect_numbering_refusal(statement text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Unexpected success: %',statement using errcode='ZX001';
  exception when others then
    if sqlerrm is distinct from message then raise exception 'Expected %, got %',message,sqlerrm; end if;
  end;
end $$;
create function pg_temp.step_numbering(p uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') from public.path_steps where path_id=p
$$;
create function pg_temp.lane_numbering(p uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') from public.lanes where path_id=p
$$;
do $proof$
declare svc uuid; ph uuid; sc uuid; a uuid; g uuid; s1 uuid; s2 uuid; s3 uuid; t1 uuid; t2 uuid; t3 uuid; l1 uuid; l2 uuid;
  found_steps jsonb; found_lanes jsonb; found_gaps jsonb; added jsonb; moved jsonb;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Numbered from one fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Counter','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Kiosk','variant') returning id into g;
  insert into public.steps(scenario_id,name,origin) values(sc,'Arrive','app') returning id into s1;
  insert into public.steps(scenario_id,name,origin) values(sc,'Order','app') returning id into s2;
  insert into public.steps(scenario_id,name,origin) values(sc,'Leave','app') returning id into s3;
  insert into public.path_steps(path_id,step_id,position) values(a,s1,1),(a,s2,2),(a,s3,3);
  insert into public.steps(scenario_id,name,origin) values(sc,'Scan','app') returning id into t1;
  insert into public.steps(scenario_id,name,origin) values(sc,'Pay','app') returning id into t2;
  insert into public.steps(scenario_id,name,origin) values(sc,'Collect','app') returning id into t3;
  insert into public.path_steps(path_id,step_id,position) values(g,t1,1),(g,t2,3),(g,t3,7);
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Guest','customer_actions',1) returning id into l1;
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Host','frontstage_actions',2) returning id into l2;
  found_steps:=pg_temp.step_numbering(a); found_lanes:=pg_temp.lane_numbering(a); found_gaps:=pg_temp.step_numbering(g);

  -- A step added between the second and third step of a path numbered 1, 2, 3.
  added:=public.add_step_with_details(a,'Review',jsonb_build_object(a,jsonb_build_array(s1,s2,'new',s3)));
  if added->'before'->a::text is distinct from found_steps then raise exception 'Add captured %, expected %',added->'before'->a::text,found_steps; end if;
  -- A numbering that disagrees with the path order is still refused.
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'1','position'],'1')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'5')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'-1')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'"one"')),'This change cannot be undone. Reload the canvas');
  perform public.undo_structure_add(added);
  if pg_temp.step_numbering(a) is distinct from found_steps then raise exception 'Step Undo left %, expected %',pg_temp.step_numbering(a),found_steps; end if;

  -- Gaps (1, 3, 7) come back exactly.
  added:=public.add_step_with_details(g,'Wait',jsonb_build_object(g,jsonb_build_array(t1,'new',t2,t3)));
  perform public.undo_structure_add(added);
  if pg_temp.step_numbering(g) is distinct from found_gaps then raise exception 'Gap Undo left %, expected %',pg_temp.step_numbering(g),found_gaps; end if;

  -- A lane added first on a lane set numbered 1, 2.
  added:=public.add_lane_with_details(sc,'Runner','backstage_actions',jsonb_build_object(a,jsonb_build_array('new',l1,l2)));
  if added->'before'->a::text is distinct from found_lanes then raise exception 'Lane Add captured %, expected %',added->'before'->a::text,found_lanes; end if;
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'1','position'],'1')),'This change cannot be undone. Reload the canvas');
  perform public.undo_structure_add(added);
  if pg_temp.lane_numbering(a) is distinct from found_lanes then raise exception 'Lane Undo left %, expected %',pg_temp.lane_numbering(a),found_lanes; end if;

  -- Reorder Undo restores the numbering it found, for steps and lanes.
  moved:=public.reorder_steps(a,array[s3,s1,s2],array[s1,s2,s3]);
  perform public.undo_structure_order(moved);
  if pg_temp.step_numbering(a) is distinct from found_steps then raise exception 'Step Move Undo left %, expected %',pg_temp.step_numbering(a),found_steps; end if;
  moved:=public.reorder_steps(g,array[t2,t3,t1],array[t1,t2,t3]);
  perform public.undo_structure_order(moved);
  if pg_temp.step_numbering(g) is distinct from found_gaps then raise exception 'Gap Move Undo left %, expected %',pg_temp.step_numbering(g),found_gaps; end if;
  moved:=public.reorder_lanes(a,array[l2,l1],array[l1,l2]);
  perform public.undo_structure_order(moved);
  if pg_temp.lane_numbering(a) is distinct from found_lanes then raise exception 'Lane Move Undo left %, expected %',pg_temp.lane_numbering(a),found_lanes; end if;

  -- Every fixture above disappears even when this proof passes.
  raise exception 'numbering proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_numbering_refusal(text,text);
drop function pg_temp.step_numbering(uuid);
drop function pg_temp.lane_numbering(uuid);

-- ─────────────────────────────────────────────────────────────────────────
-- 21000324000000_a_link_may_cross_paths_within_one_service.sql
-- ─────────────────────────────────────────────────────────────────────────

-- A link may cross paths within one service.
--
-- Authored 2026-10-31.
--
-- `set_cell_dependency` (last written by 21000210) and `update_cell_dependency`
-- (21000226) refused any edge whose two cells sat on different paths, with
-- "Both cells must be in the same path of the journey". Real services hand off
-- between scenarios: a review in one scenario leads to a report that lives in
-- another scenario and phase, and that relationship could not be recorded.
--
-- The rule is now one service. Both cells' paths must belong, through their
-- scenarios and phases, to the same service; anything else is refused with
-- "Both cells must be in the same service". The kinds are unchanged: a
-- cross-path link is a `leads_to` or an `enables` like any other, and it is
-- written, edited, cleared and undone through the same functions. Deleting
-- either cell still removes the edge, by the foreign keys' cascade.
--
-- What did not move: a cell still cannot depend on itself, the kind is still
-- one of the two, and an edit still cannot collide with an edge that exists.
-- A service is still the outer wall — a link between two services would join
-- two journeys that share nothing but the catalogue (ADR 0003, ADR 0035).
--
-- The canvas draws arrows within one path's grid, so it cannot draw a
-- cross-path link as an arrow; it marks the cell instead. That, and the IR
-- file carrying such links, are separate changes; this one is the write path.
--
-- Deleting a path or a scenario now archives the links that come into it
-- from elsewhere, not only the ones that leave it; see below.
--
-- `create or replace` keeps each function's oid, signature and grants; the
-- recipe half below checks the grants survived rather than restating them.


create or replace function public.set_cell_dependency(
  source_cell_id uuid,
  target_cell_id uuid,
  kind text default 'leads_to',
  name text default null,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  previous public.cell_dependencies;
  dependency_id uuid;
  was_inserted boolean;
  source_service uuid;
  target_service uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if set_cell_dependency.source_cell_id = set_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;
  if set_cell_dependency.kind not in ('leads_to', 'enables') then
    raise exception 'Unknown dependency kind %', set_cell_dependency.kind;
  end if;

  -- cell → path → scenario → phase → service. Every hop is NOT NULL, so a
  -- cell that exists always reaches a service and a null means no cell.
  select ph.service_id into source_service
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = set_cell_dependency.source_cell_id;
  select ph.service_id into target_service
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = set_cell_dependency.target_cell_id;
  if source_service is null or target_service is null then
    raise exception 'Both cells must exist';
  end if;
  -- Any path or scenario of one service; never two services.
  if source_service <> target_service then
    raise exception 'Both cells must be in the same service';
  end if;

  -- BEFORE the write, and locked. The lock is what stops a concurrent edit of
  -- the same edge from landing between this read and the upsert and leaving
  -- the caller holding a `previous` that was never true.
  select d.* into previous
    from public.cell_dependencies d
   where d.source_cell_id = set_cell_dependency.source_cell_id
     and d.target_cell_id = set_cell_dependency.target_cell_id
     and d.kind = set_cell_dependency.kind
   for update;

  insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, name, note)
  values (set_cell_dependency.source_cell_id, set_cell_dependency.target_cell_id,
          set_cell_dependency.kind,
          nullif(trim(set_cell_dependency.name), ''),
          nullif(trim(set_cell_dependency.note), ''))
  on conflict on constraint cell_dependencies_source_target_kind_unique
    -- An omitted argument leaves the column as it was. Both arguments default
    -- to null, so `excluded.<col>` cannot tell "the caller said nothing" from
    -- "the caller said nothing is there" — and on an edge that already exists,
    -- the first is what every caller means.
    do update set name = coalesce(excluded.name, public.cell_dependencies.name),
                  note = coalesce(excluded.note, public.cell_dependencies.note)
  -- `xmax` is zero on a row this statement inserted and the updating
  -- transaction's id on a row it updated. It is the write's own account of
  -- which half it took.
  returning id, (xmax = 0) into dependency_id, was_inserted;

  return jsonb_build_object(
    'id', dependency_id,
    'inserted', was_inserted,
    'previous',
    case
      when was_inserted or previous.id is null then null
      else jsonb_build_object(
        'id', previous.id,
        'source_cell_id', previous.source_cell_id,
        'target_cell_id', previous.target_cell_id,
        'kind', previous.kind,
        'name', previous.name,
        'note', previous.note)
    end);
end;
$function$;

create or replace function public.update_cell_dependency(
  dependency_id uuid,
  kind text,
  target_cell_id uuid,
  note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  previous public.cell_dependencies;
  source_service uuid;
  target_service uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  -- Locked, because every check below is read-then-write: without the lock
  -- two concurrent edits of one row can both pass the uniqueness check, and
  -- the second meets the constraint instead of the sentence.
  select d.* into previous
    from public.cell_dependencies d
   where d.id = update_cell_dependency.dependency_id
   for update;
  if previous.id is null then
    raise exception 'That connection no longer exists';
  end if;

  -- The checks `set_cell_dependency` makes, asked of the row's own source
  -- rather than of an argument.
  if update_cell_dependency.kind not in ('leads_to', 'enables') then
    raise exception 'Unknown dependency kind %', update_cell_dependency.kind;
  end if;
  if previous.source_cell_id = update_cell_dependency.target_cell_id then
    raise exception 'A cell cannot depend on itself';
  end if;

  select ph.service_id into source_service
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = previous.source_cell_id;
  select ph.service_id into target_service
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = update_cell_dependency.target_cell_id;
  if source_service is null or target_service is null then
    raise exception 'Both cells must exist';
  end if;
  if source_service <> target_service then
    raise exception 'Both cells must be in the same service';
  end if;

  -- The one check the sibling does not need, because its upsert absorbs the
  -- collision and this update meets it. Said in the panel's words rather than
  -- as a constraint name.
  if exists (
    select 1 from public.cell_dependencies d
     where d.source_cell_id = previous.source_cell_id
       and d.target_cell_id = update_cell_dependency.target_cell_id
       and d.kind = update_cell_dependency.kind
       and d.id <> previous.id
  ) then
    raise exception 'That connection already exists';
  end if;

  update public.cell_dependencies d
     set target_cell_id = update_cell_dependency.target_cell_id,
         kind = update_cell_dependency.kind,
         note = nullif(btrim(update_cell_dependency.note), '')
   where d.id = previous.id;

  return jsonb_build_object(
    'id', previous.id,
    'source_cell_id', previous.source_cell_id,
    'target_cell_id', previous.target_cell_id,
    'kind', previous.kind,
    'note', previous.note
  );
end;
$function$;

-- ── THE RECOVERY ARCHIVE KEEPS A LINK THAT COMES IN ──────────────────────
--
-- `delete_path` and `delete_scenario` archived the dependencies whose SOURCE
-- cell was inside what they delete. While every link stayed on one path that
-- was every link the cascade removed. A link may now come IN from another
-- path or scenario, and the cascade removes it too — `deletion_impact`
-- counted it, and the archive dropped it. Both now archive every link with
-- EITHER end inside, once each (`exists` rather than a join, so a link with
-- both ends inside is one row, not two). The rest of each body is the
-- definition it replaces, unchanged.

create or replace function public.delete_path(path_id uuid)

returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if (select count(*) from public.paths p
      where p.scenario_id =
        (select scenario_id from public.paths where id = path_id)) <= 1 then
    raise exception 'A blueprint needs at least one path — delete the blueprint instead';
  end if;

  impact := public.deletion_impact('path', path_id);

  select jsonb_build_object(
    'path', to_jsonb(p),
    'lanes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.lanes l where l.path_id = p.id),
    'path_steps', (select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
                   from public.path_steps ps where ps.path_id = p.id),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.path_id = p.id),
    'dependencies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     from public.cell_dependencies t
                     where exists (select 1 from public.cells c
                                    where c.id in (t.source_cell_id, t.target_cell_id)
                                      and c.path_id = p.id))
  ) into payload
  from public.paths p where p.id = path_id;

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('delete_path', 'path', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.paths where id = path_id;
  return archive_id;
end;
$function$;

create or replace function public.delete_scenario(scenario_id uuid)

returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  archive_id uuid;
  impact jsonb;
  payload jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  impact := public.deletion_impact('scenario', scenario_id);

  select jsonb_build_object(
    'scenario', to_jsonb(sc),
    'paths', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
              from public.paths p where p.scenario_id = sc.id),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from public.steps s where s.scenario_id = sc.id),
    'path_steps', (select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
                   from public.path_steps ps
                   join public.paths p on p.id = ps.path_id
                   where p.scenario_id = sc.id),
    'lanes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.lanes l
               join public.paths p on p.id = l.path_id
               where p.scenario_id = sc.id),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c
              join public.paths p on p.id = c.path_id
              where p.scenario_id = sc.id),
    'dependencies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     from public.cell_dependencies t
                     where exists (select 1 from public.cells c
                                    join public.paths p on p.id = c.path_id
                                    where c.id in (t.source_cell_id, t.target_cell_id)
                                      and p.scenario_id = sc.id))
  ) into payload
  from public.scenarios sc where sc.id = scenario_id;

  if payload is null then
    raise exception 'Unknown blueprint';
  end if;

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('delete_scenario', 'scenario', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.scenarios where id = scenario_id;

  return archive_id;
end;
$function$;

-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
--   1. a link from one scenario's cell to another scenario's cell, in another
--      phase of the same service, is written — as `leads_to` and as `enables`;
--      so is a link between two paths of one scenario;
--   2. a link to another service's cell is refused with the sentence, for
--      both kinds, by both functions, written or edited in either direction;
--   3. a cell still cannot depend on itself, written or edited;
--   4. an in-path edge edited onto a cross-path target is the same row, and
--      the inverse the function returned puts it back;
--   5. clearing a cross-path edge removes it, as the inverse of its insert
--      does, and deleting either end cell removes it through the cascade.
--
-- The fixture is built and given back inside a sentinel-exception block: a
-- migration may prove a thing, and may not leave the rows it proved it with.
do $cross_path$
declare
  svc uuid;
  other_svc uuid;
  phase_a uuid;
  phase_b uuid;
  other_phase uuid;
  scen_a uuid;
  scen_b uuid;
  other_scen uuid;
  path_a uuid;
  path_a2 uuid;
  path_b uuid;
  other_path uuid;
  step_a uuid;
  step_b uuid;
  other_step uuid;
  lane uuid;
  cell_a uuid;
  cell_a_peer uuid;
  cell_a2 uuid;
  cell_b uuid;
  other_cell uuid;
  other_cell_peer uuid;
  other_dep uuid;
  written jsonb;
  before_edit jsonb;
  dep uuid;
  k text;
  msg text;
  done boolean := false;
begin
  -- Can this environment hold a service claim at all? Where it cannot, the
  -- proof says so and stops rather than reaching past the guard.
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'cross-path proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;

  begin
    insert into public.services (name)
      values ('cross-path fixture') returning id into svc;
    insert into public.services (name)
      values ('cross-path fixture, another service') returning id into other_svc;

    -- One service, two phases, a scenario in each; the first scenario has
    -- two paths. Another service beside it.
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase A', 0) returning id into phase_a;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase B', 1) returning id into phase_b;
    insert into public.phases (service_id, name, position)
      values (other_svc, 'fixture other phase', 0) returning id into other_phase;
    insert into public.scenarios (phase_id, name, position)
      values (phase_a, 'fixture scenario A', 0) returning id into scen_a;
    insert into public.scenarios (phase_id, name, position)
      values (phase_b, 'fixture scenario B', 0) returning id into scen_b;
    insert into public.scenarios (phase_id, name, position)
      values (other_phase, 'fixture other scenario', 0) returning id into other_scen;
    insert into public.paths (scenario_id, name, kind)
      values (scen_a, 'fixture path A', 'happy') returning id into path_a;
    insert into public.paths (scenario_id, name, kind)
      values (scen_a, 'fixture path A, variant', 'variant') returning id into path_a2;
    insert into public.paths (scenario_id, name, kind)
      values (scen_b, 'fixture path B', 'happy') returning id into path_b;
    insert into public.paths (scenario_id, name, kind)
      values (other_scen, 'fixture other path', 'happy') returning id into other_path;
    insert into public.steps (scenario_id, name)
      values (scen_a, 'fixture step A') returning id into step_a;
    insert into public.steps (scenario_id, name)
      values (scen_b, 'fixture step B') returning id into step_b;
    insert into public.steps (scenario_id, name)
      values (other_scen, 'fixture other step') returning id into other_step;
    insert into public.path_steps (path_id, step_id, position) values (path_a, step_a, 0);
    insert into public.path_steps (path_id, step_id, position) values (path_a2, step_a, 0);
    insert into public.path_steps (path_id, step_id, position) values (path_b, step_b, 0);
    insert into public.path_steps (path_id, step_id, position) values (other_path, other_step, 0);

    insert into public.lanes (path_id, name, position)
      values (path_a, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_a, lane, step_a, 'fixture review') returning id into cell_a;
    insert into public.lanes (path_id, name, position)
      values (path_a, 'fixture peer lane', 1) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_a, lane, step_a, 'fixture in-path peer') returning id into cell_a_peer;
    insert into public.lanes (path_id, name, position)
      values (path_a2, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_a2, lane, step_a, 'fixture variant cell') returning id into cell_a2;
    insert into public.lanes (path_id, name, position)
      values (path_b, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_b, lane, step_b, 'fixture report') returning id into cell_b;
    insert into public.lanes (path_id, name, position)
      values (other_path, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (other_path, lane, other_step, 'fixture other service cell') returning id into other_cell;
    insert into public.lanes (path_id, name, position)
      values (other_path, 'fixture peer lane', 1) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (other_path, lane, other_step, 'fixture other service peer') returning id into other_cell_peer;

    foreach k in array array['leads_to', 'enables'] loop
      -- 1. ACROSS SCENARIOS AND PHASES, within the service.
      written := public.set_cell_dependency(cell_a, cell_b, k, null, 'continues there');
      if not (written ->> 'inserted')::boolean then
        raise exception 'a new cross-scenario % edge was not reported as inserted', k;
      end if;
      if not exists (
        select 1 from public.cell_dependencies d
         where d.id = (written ->> 'id')::uuid
           and d.source_cell_id = cell_a and d.target_cell_id = cell_b and d.kind = k
      ) then
        raise exception 'the cross-scenario % edge is not the row written', k;
      end if;

      -- And across two paths of one scenario.
      perform public.set_cell_dependency(cell_a2, cell_a, k);

      -- 2. ANOTHER SERVICE IS REFUSED, in the sentence.
      begin
        perform public.set_cell_dependency(cell_a, other_cell, k);
        raise exception 'a % edge into another service was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'Both cells must be in the same service' then raise; end if;
      end;
      begin
        perform public.set_cell_dependency(other_cell, cell_b, k);
        raise exception 'a % edge out of another service was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'Both cells must be in the same service' then raise; end if;
      end;

      -- 3. A CELL STILL CANNOT DEPEND ON ITSELF.
      begin
        perform public.set_cell_dependency(cell_b, cell_b, k);
        raise exception 'a % self-edge was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'A cell cannot depend on itself' then raise; end if;
      end;

      -- 5. CLEAR — the inverse of an insert — removes the cross-path edge.
      perform public.clear_cell_dependency((written ->> 'id')::uuid);
      if exists (select 1 from public.cell_dependencies d where d.id = (written ->> 'id')::uuid) then
        raise exception 'clearing a cross-path % edge left it in place', k;
      end if;
    end loop;

    -- 4. AN EDIT ONTO A CROSS-PATH TARGET, and its undo.
    insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, note)
      values (cell_a, cell_a_peer, 'leads_to', 'in the path') returning id into dep;
    before_edit := public.update_cell_dependency(dep, 'enables', cell_b, 'moved out');
    if not exists (
      select 1 from public.cell_dependencies d
       where d.id = dep and d.target_cell_id = cell_b and d.kind = 'enables'
    ) then
      raise exception 'an edit onto a cross-path target did not land on the same row';
    end if;
    -- An edit cannot carry an edge into another service, nor out of one, in
    -- either kind; nor onto its own source.
    insert into public.cell_dependencies (source_cell_id, target_cell_id, kind)
      values (other_cell, other_cell_peer, 'leads_to') returning id into other_dep;
    foreach k in array array['leads_to', 'enables'] loop
      begin
        perform public.update_cell_dependency(dep, k, other_cell, null);
        raise exception 'a % edit onto another service''s cell was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'Both cells must be in the same service' then raise; end if;
      end;
      begin
        perform public.update_cell_dependency(other_dep, k, cell_b, null);
        raise exception 'a % edit from another service onto this one was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'Both cells must be in the same service' then raise; end if;
      end;
      begin
        perform public.update_cell_dependency(dep, k, cell_a, null);
        raise exception 'a % edit onto the edge''s own source was accepted', k;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> 'A cell cannot depend on itself' then raise; end if;
      end;
    end loop;
    perform public.update_cell_dependency(
      (before_edit ->> 'id')::uuid,
      before_edit ->> 'kind',
      (before_edit ->> 'target_cell_id')::uuid,
      before_edit ->> 'note');
    if not exists (
      select 1 from public.cell_dependencies d
       where d.id = dep and d.target_cell_id = cell_a_peer and d.kind = 'leads_to'
         and d.note = 'in the path'
    ) then
      raise exception 'undoing the cross-path edit did not put the edge back';
    end if;

    -- 5. DELETING EITHER END REMOVES A CROSS-PATH EDGE.
    written := public.set_cell_dependency(cell_a, cell_b, 'leads_to');
    perform public.delete_cell(cell_b);
    if exists (select 1 from public.cell_dependencies d where d.id = (written ->> 'id')::uuid) then
      raise exception 'deleting the target cell left its cross-path edge';
    end if;
    if exists (select 1 from public.cell_dependencies d where d.source_cell_id = cell_a2) then
      perform public.delete_cell(cell_a2);
      if exists (select 1 from public.cell_dependencies d where d.source_cell_id = cell_a2) then
        raise exception 'deleting the source cell left its cross-path edge';
      end if;
    else
      raise exception 'the cross-path edges between the two paths of one scenario are missing';
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001', message = 'cross-path fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'cross-path fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the cross-path cases never ran';
  end if;
  if exists (select 1 from public.services where name like 'cross-path fixture%') then
    raise exception 'the cross-path fixture survived the rollback';
  end if;
end
$cross_path$;

-- ── THE ARCHIVE, PERFORMED ────────────────────────────────────────────────
--
--   1. deleting a path archives the link that comes into it from another
--      path and the one that leaves it, and the archive holds exactly as
--      many links as `deletion_impact` counted;
--   2. the same for a scenario, with links to and from another scenario;
--   3. putting the archived rows back, in the order their keys need,
--      restores the incoming link with its id;
--   4. where the link's other end has been deleted since, that restore is
--      refused by the foreign key rather than restoring half a link.
--
-- The template has no restore operation: the archive is the record a
-- recovery reads. (3) and (4) perform the verbatim re-insert a recovery
-- makes, which is what `undo_step_path_change` does with its own archive.
do $cross_path_archive$
declare
  svc uuid;
  phase_a uuid;
  phase_b uuid;
  scen_a uuid;
  scen_b uuid;
  path_a1 uuid;
  path_a2 uuid;
  path_b uuid;
  step_a uuid;
  step_b uuid;
  lane uuid;
  cell_a1 uuid;
  cell_a2 uuid;
  cell_b uuid;
  into_a2 uuid;
  out_of_a2 uuid;
  into_a uuid;
  impact jsonb;
  archive_id uuid;
  archived jsonb;
  msg text;
  done boolean := false;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'cross-path archive proof skipped: this environment cannot hold a service claim, so the guarded delete cannot run here';
    return;
  end if;

  begin
    insert into public.services (name)
      values ('cross-path archive fixture') returning id into svc;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase A', 0) returning id into phase_a;
    insert into public.phases (service_id, name, position)
      values (svc, 'fixture phase B', 1) returning id into phase_b;
    insert into public.scenarios (phase_id, name, position)
      values (phase_a, 'fixture scenario A', 0) returning id into scen_a;
    insert into public.scenarios (phase_id, name, position)
      values (phase_b, 'fixture scenario B', 0) returning id into scen_b;
    -- Two paths in A, because a scenario keeps at least one.
    insert into public.paths (scenario_id, name, kind)
      values (scen_a, 'fixture path A1', 'happy') returning id into path_a1;
    insert into public.paths (scenario_id, name, kind)
      values (scen_a, 'fixture path A2', 'variant') returning id into path_a2;
    insert into public.paths (scenario_id, name, kind)
      values (scen_b, 'fixture path B', 'happy') returning id into path_b;
    insert into public.steps (scenario_id, name)
      values (scen_a, 'fixture step A') returning id into step_a;
    insert into public.steps (scenario_id, name)
      values (scen_b, 'fixture step B') returning id into step_b;
    insert into public.path_steps (path_id, step_id, position) values (path_a1, step_a, 0);
    insert into public.path_steps (path_id, step_id, position) values (path_a2, step_a, 0);
    insert into public.path_steps (path_id, step_id, position) values (path_b, step_b, 0);
    insert into public.lanes (path_id, name, position)
      values (path_a1, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_a1, lane, step_a, 'fixture A1') returning id into cell_a1;
    insert into public.lanes (path_id, name, position)
      values (path_a2, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_a2, lane, step_a, 'fixture A2') returning id into cell_a2;
    insert into public.lanes (path_id, name, position)
      values (path_b, 'fixture lane', 0) returning id into lane;
    insert into public.cells (path_id, lane_id, step_id, content)
      values (path_b, lane, step_b, 'fixture B') returning id into cell_b;

    into_a2 := (public.set_cell_dependency(cell_a1, cell_a2, 'leads_to') ->> 'id')::uuid;
    out_of_a2 := (public.set_cell_dependency(cell_a2, cell_b, 'enables', null, 'kept') ->> 'id')::uuid;
    into_a := (public.set_cell_dependency(cell_b, cell_a1, 'leads_to') ->> 'id')::uuid;

    -- 1. A PATH. Two links touch A2: one comes in, one goes out.
    impact := public.deletion_impact('path', path_a2);
    archive_id := public.delete_path(path_a2);
    select a.payload into archived from public.authoring_changes a where a.id = archive_id;
    if jsonb_array_length(archived -> 'dependencies') <> (impact ->> 'dependency_count')::int
       or (impact ->> 'dependency_count')::int <> 2 then
      raise exception 'the path archive holds % links where % were counted',
        jsonb_array_length(archived -> 'dependencies'), impact ->> 'dependency_count';
    end if;
    if not exists (select 1 from jsonb_array_elements(archived -> 'dependencies') d
                    where (d ->> 'id')::uuid = into_a2) then
      raise exception 'the path archive lost the link that came into it';
    end if;

    -- 3. ITS RESTORE brings the incoming link back, id and all.
    insert into public.paths select * from jsonb_populate_record(null::public.paths, archived -> 'path');
    insert into public.lanes select * from jsonb_populate_recordset(null::public.lanes, archived -> 'lanes');
    insert into public.path_steps select * from jsonb_populate_recordset(null::public.path_steps, archived -> 'path_steps');
    insert into public.cells select * from jsonb_populate_recordset(null::public.cells, archived -> 'cells');
    insert into public.cell_dependencies
      select * from jsonb_populate_recordset(null::public.cell_dependencies, archived -> 'dependencies');
    if not exists (select 1 from public.cell_dependencies d
                    where d.id = into_a2 and d.source_cell_id = cell_a1 and d.target_cell_id = cell_a2)
       or not exists (select 1 from public.cell_dependencies d
                    where d.id = out_of_a2 and d.note = 'kept') then
      raise exception 'restoring the path did not bring its links back';
    end if;

    -- 2. A SCENARIO. B has a link coming in from A2 and one going out to A1.
    impact := public.deletion_impact('scenario', scen_b);
    archive_id := public.delete_scenario(scen_b);
    select a.payload into archived from public.authoring_changes a where a.id = archive_id;
    if jsonb_array_length(archived -> 'dependencies') <> (impact ->> 'dependency_count')::int
       or (impact ->> 'dependency_count')::int <> 2 then
      raise exception 'the scenario archive holds % links where % were counted',
        jsonb_array_length(archived -> 'dependencies'), impact ->> 'dependency_count';
    end if;
    if not exists (select 1 from jsonb_array_elements(archived -> 'dependencies') d
                    where (d ->> 'id')::uuid = out_of_a2) then
      raise exception 'the scenario archive lost the link that came into it';
    end if;

    insert into public.scenarios select * from jsonb_populate_record(null::public.scenarios, archived -> 'scenario');
    insert into public.paths select * from jsonb_populate_recordset(null::public.paths, archived -> 'paths');
    insert into public.steps select * from jsonb_populate_recordset(null::public.steps, archived -> 'steps');
    insert into public.path_steps select * from jsonb_populate_recordset(null::public.path_steps, archived -> 'path_steps');
    insert into public.lanes select * from jsonb_populate_recordset(null::public.lanes, archived -> 'lanes');
    insert into public.cells select * from jsonb_populate_recordset(null::public.cells, archived -> 'cells');
    insert into public.cell_dependencies
      select * from jsonb_populate_recordset(null::public.cell_dependencies, archived -> 'dependencies');
    if not exists (select 1 from public.cell_dependencies d where d.id = out_of_a2)
       or not exists (select 1 from public.cell_dependencies d where d.id = into_a) then
      raise exception 'restoring the scenario did not bring its links back';
    end if;

    -- 4. THE OTHER END GONE. Delete B again, then the cell its incoming link
    -- came from; restoring the links is refused, not half-done.
    archive_id := public.delete_scenario(scen_b);
    select a.payload into archived from public.authoring_changes a where a.id = archive_id;
    perform public.delete_cell(cell_a2);
    insert into public.scenarios select * from jsonb_populate_record(null::public.scenarios, archived -> 'scenario');
    insert into public.paths select * from jsonb_populate_recordset(null::public.paths, archived -> 'paths');
    insert into public.steps select * from jsonb_populate_recordset(null::public.steps, archived -> 'steps');
    insert into public.path_steps select * from jsonb_populate_recordset(null::public.path_steps, archived -> 'path_steps');
    insert into public.lanes select * from jsonb_populate_recordset(null::public.lanes, archived -> 'lanes');
    insert into public.cells select * from jsonb_populate_recordset(null::public.cells, archived -> 'cells');
    begin
      insert into public.cell_dependencies
        select * from jsonb_populate_recordset(null::public.cell_dependencies, archived -> 'dependencies');
      raise exception 'a link whose other end is gone was restored';
    exception when foreign_key_violation then null;
    end;
    if exists (select 1 from public.cell_dependencies d where d.id in (out_of_a2, into_a)) then
      raise exception 'a refused restore left part of its links behind';
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001', message = 'cross-path archive fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'cross-path archive fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'the cross-path archive cases never ran';
  end if;
  if exists (select 1 from public.services where name = 'cross-path archive fixture') then
    raise exception 'the cross-path archive fixture survived the rollback';
  end if;
end
$cross_path_archive$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000325000000_a_slice_may_cross_services_and_be_shared_by_a_link.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Authored 2026-11-01.
-- A slice may cite cells from more than one service, and someone who may
-- confirm can share it as a link. The link opens the slice and the cells it
-- cites, read live, and nothing else.
--
-- What a link holds: a token of 64 lowercase hex characters, made of two
-- `gen_random_uuid()` values (122 random bits each, from the server's strong
-- random source; 244 bits together). The blueprint tables keep only its
-- SHA-256, so neither a table read nor the change log gives a working link
-- back; the reply that hands the link over lives in the sharer's own
-- transcript. A link stops working when it is revoked or its slice is deleted.
--
-- Why a function and not a table policy: the template's blueprint tables carry
-- public SELECT policies, and Postgres ORs a table's policies together, so a
-- token-keyed policy could never narrow what a reader already sees. A link
-- reads through `read_shared_slice` alone, which returns the slice's own
-- fields and its cited cells, resolved at read time. A deployment that
-- revokes anon's table reads keeps every link working unchanged.

create table public.slice_shares (
  id uuid primary key default gen_random_uuid(),
  slice_id uuid not null references public.slices(id) on delete cascade,
  token_hash bytea not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint slice_shares_token_hash_unique unique (token_hash),
  constraint slice_shares_token_hash_is_sha256 check (octet_length(token_hash) = 32)
);
create index slice_shares_slice_id_idx on public.slice_shares (slice_id);

comment on table public.slice_shares is
  'One share link to a slice. Holds only the SHA-256 of the link token, never the token itself. A link opens the slice through read_shared_slice and stops working once revoked_at is set or its slice is deleted.';
comment on column public.slice_shares.token_hash is
  'SHA-256 of the link token. The token itself is returned once, to the person who shared the slice, and is not kept in any blueprint table.';
comment on column public.slice_shares.revoked_at is
  'When the link stopped working; null while it works.';
comment on column public.slice_shares.created_by is
  'The profile that shared the slice.';

-- Every server write captures the rows it changed; a share is one of them.
create trigger capture_agent_prior after insert or update or delete on public.slice_shares
  for each row execute function public.capture_agent_prior_rows();

-- The one read a link makes. Every refusal says the same sentence, so a
-- reader cannot tell a revoked link from one that never existed.
create function public.read_shared_slice(p_token text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare share public.slice_shares; slice public.slices;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This link does not open a slice. Ask the person who sent it for a new one.' using errcode = 'PT404';
  end if;
  select s.* into share from public.slice_shares s
   where s.token_hash = sha256(convert_to(p_token, 'UTF8')) and s.revoked_at is null;
  if share.id is null then
    raise exception 'This link does not open a slice. Ask the person who sent it for a new one.' using errcode = 'PT404';
  end if;
  select sl.* into strict slice from public.slices sl where sl.id = share.slice_id;
  return jsonb_build_object(
    'title', slice.title, 'summary', slice.summary, 'kind', slice.kind, 'actor', slice.actor,
    'slides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', sd.position, 'title', sd.title, 'caption', sd.caption,
        'cells', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id, 'service', sv.name, 'scenario', sc.name, 'lane', l.name, 'step', st.name,
            'content', c.content, 'summary', c.summary) order by cited.ord)
            from unnest(sd.cell_ids) with ordinality cited(cell_id, ord)
            join public.cells c on c.id = cited.cell_id
            join public.lanes l on l.id = c.lane_id
            join public.steps st on st.id = c.step_id
            join public.paths p on p.id = c.path_id
            join public.scenarios sc on sc.id = p.scenario_id
            join public.phases ph on ph.id = sc.phase_id
            join public.services sv on sv.id = ph.service_id), '[]'::jsonb))
        order by sd.position)
        from public.slides sd where sd.slice_id = slice.id), '[]'::jsonb));
end $$;
comment on function public.read_shared_slice(text) is
  'What a share link shows: the slice''s title, summary, kind and actor, and each slide with the cells it cites, read at call time. Refuses a revoked, unknown or malformed token with one sentence.';

-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Short stage label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this scenario; an empty string leaves it blank; omit for none"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"share_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"unshare_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Short label for what happens; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this step; an empty string leaves it blank; omit for none"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

-- A slice's cells may sit in any service; every other write stays inside the
-- service it names. Sharing and unsharing are checked writes like the rest.
do $$
declare body text; previous text;
begin
  body := pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  previous := body;
  body := replace(body,
    $old$if p_service_id is not null and exists(select 1 from public.cells c$old$,
    $new$if p_service_id is not null and p_tool not in ('create_slice','replace_slides') and exists(select 1 from public.cells c$new$);
  if body = previous then raise exception 'Expected the one-service cell check did not match'; end if;
  previous := body;
  body := replace(body,
    $old$      when 'create_finding' then$old$,
    $new$      when 'share_slice' then
        if p_service_id is not null and exists(select 1 from public.slices sl where sl.id=(a->>'slice_id')::uuid and sl.service_id<>p_service_id) then
          raise exception 'That slice is filed under another service; choose its service_id from list_slices.';
        end if;
        id := gen_random_uuid();
        value := to_jsonb(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
        insert into public.slice_shares(id,slice_id,token_hash,created_by)
          values(id,(a->>'slice_id')::uuid,sha256(convert_to(value#>>'{}','UTF8')),profile);
        result := jsonb_build_object('share_id',id,'token',value);
      when 'unshare_slice' then
        if p_service_id is not null and exists(select 1 from public.slices sl where sl.id=(a->>'slice_id')::uuid and sl.service_id<>p_service_id) then
          raise exception 'That slice is filed under another service; choose its service_id from list_slices.';
        end if;
        update public.slice_shares set revoked_at=now() where slice_id=(a->>'slice_id')::uuid and revoked_at is null;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'This slice has no working link to stop; nothing was changed.'; end if;
        result := jsonb_build_object('links_stopped',n);
      when 'create_finding' then$new$);
  if body = previous then raise exception 'Expected the finding branch did not match'; end if;
  previous := body;
  -- The token goes back to the person who shared, never into the change log.
  body := replace(body,
    $old$'service_id',p_service_id,'result',result)$old$,
    $new$'service_id',p_service_id,'result',case when p_tool='share_slice' then result-'token' else result end)$new$);
  if body = previous then raise exception 'Expected the change-log result did not match'; end if;
  execute body;
end $$;

-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
--   1. a link opens exactly the cells its slice cites, from two services, and
--      none of the cells beside them on the same path or in either service;
--   2. a cell changed after sharing shows its new value through the link;
--   3. a revoked link, an unknown token and a malformed token are refused
--      with the same sentence.
--
-- Built and given back inside a sentinel-exception block: a migration may
-- prove a thing, and may not leave the rows it proved it with.
do $shared_slice$
declare
  svc uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  fixture uuid[] := '{}'; cell uuid; phase uuid; scenario uuid; path uuid; lane uuid; step uuid; slice uuid;
  token text := repeat('ab', 32); seen jsonb; ids uuid[]; i int; j int; msg text; done boolean := false;
begin
  begin
    for i in 1..2 loop
      insert into public.services(id, name, slug) values (svc[i], 'link fixture '||i, 'link-fixture-'||svc[i]);
      insert into public.phases(service_id, name, position) values (svc[i], 'fixture phase', 0) returning id into phase;
      insert into public.scenarios(phase_id, name, position) values (phase, 'fixture scenario', 0) returning id into scenario;
      insert into public.paths(scenario_id, name, kind) values (scenario, 'fixture path', 'happy') returning id into path;
      insert into public.lanes(path_id, name, lane_role, position) values (path, 'fixture lane', 'frontstage_actions', 0) returning id into lane;
      for j in 1..2 loop
        insert into public.steps(scenario_id, name) values (scenario, 'fixture step '||j) returning id into step;
        insert into public.path_steps(path_id, step_id, position) values (path, step, j - 1);
        insert into public.cells(path_id, lane_id, step_id, content)
          values (path, lane, step, format($f$service %s cell %s$f$, i, j)) returning id into cell;
        fixture := fixture || cell;
      end loop;
    end loop;
    -- Cited: the first cell of each service. Beside them: each path's second cell.
    insert into public.slices(service_id, kind, title, authorship) values (svc[1], 'custom', 'fixture brief', 'human') returning id into slice;
    insert into public.slides(slice_id, position, cell_ids, cell_keys) values
      (slice, 0, array[fixture[1]], array[fixture[1]::text]),
      (slice, 1, array[fixture[3]], array[fixture[3]::text]);
    insert into public.slice_shares(slice_id, token_hash) values (slice, sha256(convert_to(token, 'UTF8')));

    seen := public.read_shared_slice(token);
    select array_agg((c->>'id')::uuid order by s.ord) into ids
      from jsonb_array_elements(seen->'slides') with ordinality s(slide, ord),
           jsonb_array_elements(s.slide->'cells') c;
    if ids is distinct from array[fixture[1], fixture[3]] then
      raise exception 'a link opened % instead of exactly the cited cells', ids;
    end if;
    if seen::text like '%cell 2%' then raise exception 'a link showed a cell its slice does not cite'; end if;

    update public.cells set content = 'service 2 cell 1, revised' where id = fixture[3];
    if public.read_shared_slice(token)::text not like '%service 2 cell 1, revised%' then
      raise exception 'a link showed a stale value';
    end if;

    update public.slice_shares set revoked_at = now() where slice_id = slice;
    foreach msg in array array[token, repeat('cd', 32), 'not-a-token'] loop
      begin
        perform public.read_shared_slice(msg);
        raise exception 'a link that should not open did';
      exception when sqlstate 'PT404' then null;
      end;
    end loop;
    done := true;
    raise exception 'shared slice fixture rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'shared slice fixture rollback' then raise; end if;
  end;
  if not done then raise exception 'the shared slice cases never ran'; end if;
end
$shared_slice$;
