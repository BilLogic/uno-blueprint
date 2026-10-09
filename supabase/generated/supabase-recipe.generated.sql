-- The Supabase recipe — one conformant reference implementation.
--
-- ⚠ GENERATED FILE — DO NOT EDIT. Every line below was emitted from the
-- partition marks in supabase/migrations/. Edit the migration, then run
-- `npm run generate:portable-core`. A hand-edit is reverted by CI, which
-- regenerates this file and fails on any difference.
--
-- ⚠ GENERATED, and also OPTIONAL. Applied on top of the portable core, this
-- is how *Supabase* enforces the contract: request-scoped attribution from
-- `auth.uid()`, the anon / authenticated / service_role grants, the RLS
-- policies, the storage bucket for slice illustrations, and the optional
-- service-account tier.
--
-- It is fully supported — this is what the shipped app runs on. It is not
-- the contract. Another host writes its own recipe against the same core and
-- is just as conformant, which is the point of the partition.
--
-- Applying this needs the Supabase primitives to exist. In CI that is
-- supabase/portable/supabase-shim.sql, a harness and not something an
-- adopter installs.
--
-- Fragments carry the CURRENT vocabulary, not the one their migration was
-- written in: the core's renames are followed through. See the generator.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 20260716200000_template_schema.sql
-- ─────────────────────────────────────────────────────────────────────────

-- RLS and the read-only anon policies.
-- ---------------------------------------------------------------------------
-- Row Level Security (read-only for anon until auth is added)
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.phases enable row level security;
alter table public.scenarios enable row level security;
alter table public.paths enable row level security;
alter table public.lanes enable row level security;
alter table public.steps enable row level security;
alter table public.path_steps enable row level security;
alter table public.cells enable row level security;
alter table public.cell_dependencies enable row level security;

create policy "services_select" on public.services for select using (true);
create policy "phases_select" on public.phases for select using (true);
create policy "scenarios_select" on public.scenarios for select using (true);
create policy "paths_select" on public.paths for select using (true);
create policy "lanes_select" on public.lanes for select using (true);
create policy "steps_select" on public.steps for select using (true);
create policy "path_steps_select" on public.path_steps for select using (true);
create policy "cells_select" on public.cells for select using (true);
create policy "cell_dependencies_select" on public.cell_dependencies for select using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 20260729120000_derived_layer.sql
-- ─────────────────────────────────────────────────────────────────────────

-- RLS, the role grants, and the storage bucket the app uploads to.
-- ============================================================
-- 4. RLS + grants
-- ============================================================
-- Attribution stamps the caller. On another host it is that host's
-- request-scoped identity; the COLUMN is core, the value it takes is not.
alter table public.slices   alter column created_by set default auth.uid();
alter table public.evidence alter column created_by set default auth.uid();

-- REQUIRED companion (deploy step, not SQL): disable public sign-ups in Auth settings
-- and use shouldCreateUser:false in the frontend — otherwise "authenticated" means
-- anyone on the internet. TO authenticated is authentication, not authorization:
-- acceptable for a closed team only.

alter table public.slices enable row level security;
alter table public.slides enable row level security;
alter table public.audit_findings enable row level security;
alter table public.evidence enable row level security;
alter table public.business_models enable row level security;

-- slices / slides: public read, authenticated write
create policy "slices_select" on public.slices for select using (true);
create policy "slices_insert_auth" on public.slices
  for insert to authenticated with check (true);
create policy "slices_update_auth" on public.slices
  for update to authenticated using (true) with check (true);
create policy "slices_delete_auth" on public.slices
  for delete to authenticated using (true);

create policy "slice_items_select" on public.slides for select using (true);
create policy "slice_items_insert_auth" on public.slides
  for insert to authenticated with check (true);
create policy "slice_items_update_auth" on public.slides
  for update to authenticated using (true) with check (true);
create policy "slice_items_delete_auth" on public.slides
  for delete to authenticated using (true);

-- audit_findings: public read; humans may flip STATUS only (column grant below); no
-- insert/delete for authenticated — skills write via service key.
create policy "findings_select" on public.audit_findings for select using (true);
create policy "findings_update_auth" on public.audit_findings
  for update to authenticated using (true) with check (true);
revoke insert, update, delete on public.audit_findings from authenticated;
grant update (status) on public.audit_findings to authenticated;

-- evidence / business_models: restricted read (interview excerpts, pricing are not
-- world-readable on public deploys); authenticated write.
create policy "evidence_select_auth" on public.evidence
  for select to authenticated using (true);
create policy "evidence_insert_auth" on public.evidence
  for insert to authenticated with check (true);
create policy "evidence_update_auth" on public.evidence
  for update to authenticated using (true) with check (true);
create policy "evidence_delete_auth" on public.evidence
  for delete to authenticated using (true);

create policy "propositions_select_auth" on public.business_models
  for select to authenticated using (true);
create policy "propositions_insert_auth" on public.business_models
  for insert to authenticated with check (true);
create policy "propositions_update_auth" on public.business_models
  for update to authenticated using (true) with check (true);

-- evidence_counts view: public (counts only, no content)
grant select on public.evidence_counts to anon, authenticated;

-- Human-editable spec columns on IR-owned tables: column-scoped UPDATE only.
-- (Content columns stay service-key-only.)
create policy "cells_update_auth" on public.cells
  for update to authenticated using (true) with check (true);
revoke update on public.cells from authenticated;
grant update (function, form, value_props, owner, perceived_owner)
  on public.cells to authenticated;

create policy "lanes_update_auth" on public.lanes
  for update to authenticated using (true) with check (true);
revoke update on public.lanes from authenticated;
grant update (owner_team, kpis, tools) on public.lanes to authenticated;

create policy "phases_update_auth" on public.phases
  for update to authenticated using (true) with check (true);
revoke update on public.phases from authenticated;
grant update (business_impact, operational_requirements) on public.phases to authenticated;

-- ============================================================
-- 5. Storage bucket for slice illustrations
-- ============================================================
-- Object paths come only from DB ids/positions:
--   slices/<slice_id>/frame-<position>.png, slices/<slice_id>/character-ref.png

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slice-illustrations', 'slice-illustrations', true, 5242880, array['image/png'])
on conflict (id) do nothing;

-- storage.objects policies fail on hosted Supabase when the migration role doesn't own
-- the table ("must be owner"): apply where possible, degrade visibly otherwise (writes
-- then go through the service key only; see deploy notes).
do $$
begin
  create policy "slice_illustrations_insert" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/(frame-[0-9]+|character-ref)\.png$'
    );
  create policy "slice_illustrations_select" on storage.objects
    for select to authenticated
    using (bucket_id = 'slice-illustrations');
  create policy "slice_illustrations_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'slice-illustrations')
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/(frame-[0-9]+|character-ref)\.png$'
    );
exception
  when insufficient_privilege then
    raise notice 'storage.objects policies skipped (not owner): bucket writes are service-key only until policies are added via the dashboard.';
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260730090000_derived_layer_grants_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────

-- F1 is entirely about the anon / authenticated roles.
-- ---- F1: explicit exposure grants ----
grant select on public.slices, public.slides, public.audit_findings to anon, authenticated;
grant select on public.evidence, public.business_models to authenticated;
grant insert, update, delete on public.slices, public.slides, public.evidence to authenticated;
grant insert, update on public.business_models to authenticated;
grant select on public.evidence_counts to anon, authenticated;

-- Defense-in-depth: strip legacy write privileges from anon (RLS already blocks the
-- DML, but TRUNCATE is not subject to RLS) and TRUNCATE from both roles everywhere.
revoke insert, update, delete, truncate on public.slices, public.slides,
  public.audit_findings, public.evidence, public.business_models from anon;
revoke select on public.evidence, public.business_models from anon;
revoke truncate on public.slices, public.slides, public.audit_findings,
  public.evidence, public.business_models, public.cells, public.lanes, public.phases
  from anon, authenticated;
revoke insert, update, delete on public.evidence_counts from anon, authenticated;

-- who "the caller" is, on Supabase.
alter table public.slides  alter column created_by set default auth.uid();
alter table public.business_models alter column created_by set default auth.uid();

-- ─────────────────────────────────────────────────────────────────────────
-- 20260818000000_authoring_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────



-- Readable by anyone who can read the blueprint (the recovery list is part of
-- the editor);

-- ---------------------------------------------------------------------------
-- Ordinary column writes the panel does directly (no function needed): the
-- blueprint's own text, and the resource links. Structural shape stays behind
-- the RPCs. Column grants accumulate on top of the derived layer's spec-field
-- grants (cells: function/form/value_props/owner/perceived_owner; lanes:
-- owner_team/kpis/tools; phases: business_impact/operational_requirements).
-- ---------------------------------------------------------------------------
-- AMENDED. This granted `links` too, until `21000113000000` dissolved that
-- column into `resources`, `cell_touchpoints` and `evidence`.
--
-- An applied migration normally keeps the statement it was written with, and
-- this repository means that rule. It is spent here because leaving it made
-- the PORTABLE CORE UNAPPLIABLE — the artifact this template exists to ship.
-- The recipe is generated by flattening the series and is applied on top of
-- the core in one pass, so this grant ran after the drop and failed with
-- `column "links" of relation "cells" does not exist`. No superseding grant
-- later in the series can fix that; the statement has to stop naming a column
-- that will not exist.
--
-- `check:portable-core` compares the generated files against the migrations
-- and both agreed, so it stayed green. What caught it is the CI job that
-- APPLIES the recipe to a real Postgres. The two are not redundant.
grant update (content, summary) on public.cells to authenticated;
grant update (name, lane_role) on public.lanes to authenticated;
grant update (name) on public.steps to authenticated;
grant update (name, summary, note, kind) on public.paths to authenticated;
grant update (name, summary, layout) on public.scenarios to authenticated;

-- cells/lanes/phases already carry update policies from the derived layer;
-- steps, paths and scenarios gain theirs here.
drop policy if exists "steps_update_auth" on public.steps;
create policy "steps_update_auth" on public.steps
  for update to authenticated using (true) with check (true);
drop policy if exists "paths_update_auth" on public.paths;
create policy "paths_update_auth" on public.paths
  for update to authenticated using (true) with check (true);
drop policy if exists "scenarios_update_auth" on public.scenarios;
create policy "scenarios_update_auth" on public.scenarios
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Evidence is display content, and the deployed app is a read-only viewer:
-- every other content table (cells, slices) already grants anon SELECT.
-- Evidence being authenticated-only surfaced as "permission denied for table
-- evidence" in the panel's Evidence tab for every visitor. Writes stay
-- authenticated-only, unchanged.
--
-- ⚠ Adopter decision: this makes evidence rows (including interview
-- excerpts) readable on public deploys. If your evidence holds sensitive
-- excerpts, drop this policy + grant AND revert the evidence_counts
-- security_invoker change below (the owner-rights view is what keeps the
-- anonymous assumption-lens count working without content access).
-- ---------------------------------------------------------------------------
grant select on public.evidence to anon;
drop policy if exists evidence_select_anon on public.evidence;
create policy evidence_select_anon on public.evidence
  for select to anon using (true);

-- With evidence publicly readable, the counts view's owner-rights execution
-- guards nothing (security-definer-view advisor ERROR): run it as the
-- querying user. Coupled to the anon-read decision above — see the warning.
alter view public.evidence_counts set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Findings canvas writes, in their final hardened form: the in-app agent
-- records audit_findings directly, same as the IDE flow's service-key writes.
-- A finding may only be INSERTED as open — the dedupe rule is "dismissed
-- stays dismissed", so an insert that could set status directly would let one
-- forged row permanently suppress a real finding from every future audit run.
-- The UPDATE grant is column-narrowed: the derived layer's "humans may flip
-- STATUS only" widened only to the columns record-finding update-in-place
-- actually writes. Delete stays revoked everywhere;
-- findings_open_fingerprint_idx remains the dedupe backstop.
-- ---------------------------------------------------------------------------
drop policy if exists "findings_insert_auth" on public.audit_findings;
create policy "findings_insert_auth" on public.audit_findings
  for insert to authenticated with check (status = 'open');

grant insert on public.audit_findings to authenticated;
revoke update on public.audit_findings from authenticated;
grant update (status, summary, severity, run_id, cell_ids, cell_keys, source)
  on public.audit_findings to authenticated;

-- the storage bucket and its object policies.

-- ---------------------------------------------------------------------------
-- Storyboard uploads: people drop JPEGs and WebPs, and a mime rejection reads
-- like a bug rather than a rule.
-- ---------------------------------------------------------------------------
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'slice-illustrations';

-- The bucket's write policies name the *only* paths that may be written, and
-- the derived layer's pattern accepts none of the paths the app builds:
--
--   1. It hard-codes `\.png$`, so widening the mime types above would have
--      changed nothing — a JPEG would clear the bucket check and then be
--      refused by the policy.
--   2. It keys a frame's image by *position* (`frame-3.png`). Positions move:
--      splitting or reordering frames renumbers them, so every image would
--      silently repoint at a different frame. The app keys by `slides.id`
--      instead, which is stable across every edit that is not a delete.
--
-- The old names stay accepted so anything already uploaded keeps resolving.
-- Guarded: on hosted Supabase the migration role may not own storage.objects.
do $$
begin
  drop policy if exists "slice_illustrations_insert" on storage.objects;
  drop policy if exists "slice_illustrations_update" on storage.objects;

  create policy "slice_illustrations_insert" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$'
    );
  create policy "slice_illustrations_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'slice-illustrations')
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$'
    );
exception
  when insufficient_privilege then
    raise notice 'storage.objects policies skipped (not owner): bucket writes stay service-key only until these are added via the dashboard.';
end $$;
-- 6 statement(s) on public.deleted_structure are not here: a later
-- migration drops that table, and its policy and grants went with it.


-- ─────────────────────────────────────────────────────────────────────────
-- 20260818001000_authoring_operations.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the seam is core; naming the Supabase roles that may read it
-- is not.
grant execute on function public.is_service_account() to anon, authenticated;

-- Grants, part 2: the Supabase roles.
--
-- Read helpers stay open to anon on purpose: stable/immutable, no writes,
-- and they only describe data already readable through the SELECT policies.
-- The writes are revoked from anon and granted to `authenticated`, which
-- names the one role supposed to hold them. Another host substitutes its own
-- caller classes here; the PUBLIC revoke above stands either way.

-- Read helpers: open to anon.
grant execute on function public.key_slug(text) to anon, authenticated;
grant execute on function public.cell_natural_key(uuid) to anon, authenticated;
grant execute on function public.mint_cell_key(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.slices_referencing(uuid[]) to anon, authenticated;
-- Named without its argument list, because a later migration changes it. The
-- generated recipe is applied after the WHOLE core, so this line runs against
-- the signature the last core migration left behind, not the one that existed
-- the day it was written — and a grant naming `(text, uuid)` would fail on
-- `function public.deletion_impact(text, uuid) does not exist`. Postgres
-- resolves the bare name whenever it is unique, and errors if it is not, which
-- is the behaviour wanted either way.
grant execute on function public.deletion_impact to anon, authenticated;

-- Writes: anon loses what PUBLIC already lost …
revoke execute on function public.create_scenario(uuid, text, text, uuid, jsonb, int, text) from anon;
revoke execute on function public.duplicate_scenario(uuid, text) from anon;
revoke execute on function public.create_phase(uuid, text, text) from anon;
revoke execute on function public.create_path(uuid, text, text, uuid) from anon;
revoke execute on function public.duplicate_path(uuid, text, text, boolean, boolean) from anon;
revoke execute on function public.add_step(uuid, text, int) from anon;
revoke execute on function public.add_lane(uuid, text, text, int) from anon;
revoke execute on function public.reorder_steps(uuid, uuid[]) from anon;
revoke execute on function public.set_path_steps(uuid, uuid[]) from anon;
revoke execute on function public.reorder_lanes(uuid, text[]) from anon;
revoke execute on function public.upsert_cell(uuid, uuid, uuid, text) from anon;
revoke execute on function public.set_cell_dependency(uuid, uuid, text, text, text) from anon;
revoke execute on function public.clear_cell_dependency(uuid) from anon;
revoke execute on function public.rename_phase(uuid, text) from anon;
revoke execute on function public.rename_scenario(uuid, text) from anon;
revoke execute on function public.rename_path(uuid, text) from anon;
revoke execute on function public.rename_owner_tag(text, text) from anon;
revoke execute on function public.delete_scenario(uuid) from anon;
revoke execute on function public.delete_path(uuid) from anon;
revoke execute on function public.remove_step(uuid, uuid) from anon;
revoke execute on function public.remove_lane(uuid, text) from anon;
revoke execute on function public.remove_lanes(uuid[]) from anon;
revoke execute on function public.delete_cell(uuid) from anon;

-- … and `authenticated` is named as the role that holds them.
grant execute on function public.create_scenario(uuid, text, text, uuid, jsonb, int, text) to authenticated;
grant execute on function public.duplicate_scenario(uuid, text) to authenticated;
grant execute on function public.create_phase(uuid, text, text) to authenticated;
grant execute on function public.create_path(uuid, text, text, uuid) to authenticated;
grant execute on function public.duplicate_path(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.add_step(uuid, text, int) to authenticated;
grant execute on function public.add_lane(uuid, text, text, int) to authenticated;
grant execute on function public.reorder_steps(uuid, uuid[]) to authenticated;
grant execute on function public.set_path_steps(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_lanes(uuid, text[]) to authenticated;
grant execute on function public.upsert_cell(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.set_cell_dependency(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.clear_cell_dependency(uuid) to authenticated;
grant execute on function public.rename_phase(uuid, text) to authenticated;
grant execute on function public.rename_scenario(uuid, text) to authenticated;
grant execute on function public.rename_path(uuid, text) to authenticated;
grant execute on function public.rename_owner_tag(text, text) to authenticated;
grant execute on function public.delete_scenario(uuid) to authenticated;
grant execute on function public.delete_path(uuid) to authenticated;
grant execute on function public.remove_step(uuid, uuid) to authenticated;
grant execute on function public.remove_lane(uuid, text) to authenticated;
grant execute on function public.remove_lanes(uuid[]) to authenticated;
grant execute on function public.delete_cell(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260818002000_service_account_tier.sql
-- ─────────────────────────────────────────────────────────────────────────

-- this whole migration is the tier recipe. It is named that in
-- its own header: it reads a Supabase JWT, hangs a trigger on auth.users and
-- policies on storage.objects. Only the config table it reads is core.
create or replace function public.is_service_account()
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'service',
    false
  )
$$;

comment on function public.is_service_account() is
  'True when the JWT app_metadata.role is service. Set via auth.users.raw_app_meta_data (service role only) or the service_account_emails config table — users cannot self-assign (user_metadata is ignored on purpose).';

grant execute on function public.is_service_account() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RESTRICTIVE write policies on every blueprint + derived-layer table. They
-- AND with the permissive policies, so a non-service session keeps its reads
-- but loses every direct write.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'phases', 'scenarios', 'paths', 'steps', 'path_steps',
    'lanes', 'cells', 'cell_dependencies', 'slices', 'slides',
    'evidence', 'business_models', 'audit_findings'
  ] loop
    execute format('drop policy if exists %I on public.%I',
      t || '_insert_service_only', t);
    execute format('drop policy if exists %I on public.%I',
      t || '_update_service_only', t);
    execute format('drop policy if exists %I on public.%I',
      t || '_delete_service_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_service_account())',
      t || '_insert_service_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.is_service_account()) with check (public.is_service_account())',
      t || '_update_service_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.is_service_account())',
      t || '_delete_service_only', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage joins the tier: the slice-illustration policies check only bucket
-- and filename shape, so without this a viewer could upload and overwrite
-- any illustration in a public bucket. Guarded: on hosted Supabase the
-- migration role may not own storage.objects.
-- ---------------------------------------------------------------------------
do $$
begin
  drop policy if exists "slice_illustrations_service_only" on storage.objects;
  create policy "slice_illustrations_service_only"
    on storage.objects as restrictive for all to authenticated
    using (bucket_id <> 'slice-illustrations' or public.is_service_account())
    with check (bucket_id <> 'slice-illustrations' or public.is_service_account());
exception
  when insufficient_privilege then
    raise notice 'storage.objects tier policy skipped (not owner): add slice_illustrations_service_only via the dashboard.';
end $$;

-- ---------------------------------------------------------------------------
-- Enrollment config: which emails become service accounts at sign-up.
--
-- Empty by default — the adopter fills it. Service-role only: this table is
-- an operator control surface, not app data. (No RLS policies = no access
-- for anon/authenticated once RLS is enabled; service_role bypasses RLS.)
-- ---------------------------------------------------------------------------
alter table public.service_account_emails enable row level security;
revoke all on public.service_account_emails from public, anon, authenticated;

-- Stamp the role at account creation for allowlisted emails.
create or replace function public.flag_service_accounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1 from public.service_account_emails e
    where lower(e.email) = lower(new.email)
  ) then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"service"}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists flag_service_accounts on auth.users;
create trigger flag_service_accounts
  before insert on auth.users
  for each row execute function public.flag_service_accounts();

-- Operator routine; it has no business on the public REST surface. The grant
-- that would expose it is the PUBLIC default (a per-role revoke alone is a
-- no-op), so PUBLIC is revoked explicitly.
revoke execute on function public.flag_service_accounts() from public;
revoke execute on function public.flag_service_accounts()
  from anon, authenticated;
grant execute on function public.flag_service_accounts() to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260819000000_agent_surface.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the caller stamp, RLS, the owner-scoped policies, and the
-- audit_findings grants: every one of them names a Supabase primitive.
alter table public.agent_sessions
  alter column created_by set default auth.uid();

alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;

-- Transcripts are private to their author. The app never writes created_by —
-- the column default stamps the caller, which is exactly what the WITH CHECK
-- requires, so inserts pass and every read/update/delete is filtered to the
-- caller's own rows.
create policy "agent sessions are owner-scoped"
  on public.agent_sessions
  for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "agent messages are owner-scoped"
  on public.agent_messages
  for all
  to authenticated
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agent_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Findings: let the in-app agent record and triage through the signed-in
-- session, restoring the foundation migration's hardened form
-- (20260818000000) rather than a blanket grant:
--
--   * A finding may only be INSERTED as open — the dedupe rule is "dismissed
--     stays dismissed", so an insert that could set status directly would let
--     one forged pre-dismissed row permanently suppress a real finding from
--     every future audit run. record_finding inserts without status and takes
--     the column default ('open').
--   * The UPDATE grant is column-narrowed to what record-finding's
--     update-in-place and human triage actually write. Delete stays revoked
--     everywhere; findings_open_fingerprint_idx remains the dedupe backstop.
--
-- The tier recipe's RESTRICTIVE policies (when applied) still confine every
-- one of these writes to service accounts.
-- ---------------------------------------------------------------------------
grant insert on public.audit_findings to authenticated;
revoke update on public.audit_findings from authenticated;
grant update (status, summary, severity, run_id, cell_ids, cell_keys, source)
  on public.audit_findings to authenticated;

drop policy if exists "findings_insert_auth" on public.audit_findings;
create policy "findings_insert_auth" on public.audit_findings
  for insert to authenticated with check (status = 'open');

-- ─────────────────────────────────────────────────────────────────────────
-- 21000101000000_schema_version_is_a_table.sql
-- ─────────────────────────────────────────────────────────────────────────

-- another host re-expresses these with its own primitives: the
-- version is world-readable and nobody but a migration writes it.

alter table public.schema_version enable row level security;

create policy "schema_version_select" on public.schema_version for select using (true);

grant select on public.schema_version to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000113000000_one_column_held_two_unrelated_things.sql
-- ─────────────────────────────────────────────────────────────────────────

-- RLS and the Supabase role grants for both tables. Another host
-- expresses "anyone may read, only the service account may write" with its own
-- primitives; the tables above are plain Postgres.

alter table public.cell_touchpoints enable row level security;
alter table public.resources enable row level security;

create policy cell_touchpoints_select_anon on public.cell_touchpoints
  for select to anon using (true);
create policy cell_touchpoints_select_auth on public.cell_touchpoints
  for select to authenticated using (true);
create policy cell_touchpoints_insert_service_only on public.cell_touchpoints
  for insert to authenticated with check (public.is_service_account());
create policy cell_touchpoints_update_service_only on public.cell_touchpoints
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy cell_touchpoints_delete_service_only on public.cell_touchpoints
  for delete to authenticated using (public.is_service_account());

create policy resources_select_anon on public.resources
  for select to anon using (true);
create policy resources_select_auth on public.resources
  for select to authenticated using (true);
create policy resources_insert_service_only on public.resources
  for insert to authenticated with check (public.is_service_account());
create policy resources_update_service_only on public.resources
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy resources_delete_service_only on public.resources
  for delete to authenticated using (public.is_service_account());

grant select on public.cell_touchpoints, public.resources to anon, authenticated;
grant insert, delete on public.cell_touchpoints, public.resources to authenticated;
-- Column-level, as the authoring migration argues for `cells`: what a row
-- SAYS may move through a direct update; WHICH cell or placement owns it is
-- structure, and structure does not.
grant update (name, position, summary)
  on public.cell_touchpoints to authenticated;
grant update (kind, name, url, position) on public.resources to authenticated;
-- The platform grants anon these at create time on every relation created in
-- `public`. Nothing anonymous writes, and TRUNCATE is not subject to RLS.
revoke insert, update, delete, truncate
  on public.cell_touchpoints, public.resources from anon;
revoke truncate on public.cell_touchpoints, public.resources from authenticated;

-- the Supabase role that calls it.
grant execute on function public.sync_cell_resources(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000115000000_a_slide_a_frame_and_a_title.sql
-- ─────────────────────────────────────────────────────────────────────────

-- policies exist only where the Supabase recipe was applied, and
-- their names are the one dependent kind the core cannot carry.

alter policy "slice_items_select"      on public.slides rename to "slides_select";
alter policy "slice_items_insert_auth" on public.slides rename to "slides_insert_auth";
alter policy "slice_items_update_auth" on public.slides rename to "slides_update_auth";
alter policy "slice_items_delete_auth" on public.slides rename to "slides_delete_auth";

-- ─────────────────────────────────────────────────────────────────────────
-- 21000116000000_one_spelling_each.sql
-- ─────────────────────────────────────────────────────────────────────────

-- policies exist only where the Supabase recipe was applied, and
-- their names are the one dependent kind the core cannot carry.

-- Policies are renamed from the CATALOG, not by literal name, and this is the
-- one place in this migration where that is forced rather than preferred.
--
-- The two supported build paths disagree about what these policies are called
-- when this file runs:
--
--   REPLAY (a real project) applies migrations in timestamp order, so the
--   policies exist by the time `21000111000000`'s sweep runs, and it renames
--   them `propositions_*` → `business_model_*`.
--
--   THE TWO HALVES (core, then shim, then recipe) run the entire core first —
--   sweep included — while no policy exists yet. The recipe then creates them
--   as `propositions_*`, and nothing ever sweeps them.
--
-- Same series, same statements, two different catalogs. A literal `alter
-- policy` can only satisfy one of them, which is exactly why `21000111000000`
-- swept rather than listing: its own header says these names "appear nowhere
-- in the source as literals". They appear in two forms instead.
--
-- So this keys on the RETIRED WORDS and renames whatever it finds. The static
-- readers lose nothing here: the words being retired are written out below in
-- plain text, so a search for `findings` or `business_model` still lands on
-- this block.
do $policies$
declare
  target record;
  renamed int := 0;
begin
  for target in
    select pol.polname as name, cls.relname as rel
      from pg_policy pol
      join pg_class cls on cls.oid = pol.polrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
     where nsp.nspname = 'public'
       and cls.relname in ('audit_findings', 'business_models')
       and (pol.polname like 'findings%'
            or pol.polname like 'propositions%'
            or pol.polname like 'business\_model\_%')
  loop
    execute format(
      'alter policy %I on public.%I rename to %I',
      target.name,
      target.rel,
      case
        when target.name like 'findings%' then
          'audit_' || target.name
        else
          'business_models_' || regexp_replace(target.name, '^(propositions|business_model)_', '')
      end);
    renamed := renamed + 1;
  end loop;

  -- Vacuous where policies were never created (a core-only database), and a
  -- real assertion where they were: no count, just "nothing was left behind".
  if exists (
    select 1
      from pg_policy pol
      join pg_class cls on cls.oid = pol.polrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
     where nsp.nspname = 'public'
       and (pol.polname like 'findings%'
            or pol.polname like 'propositions%'
            or pol.polname like 'business\_model\_%')
  ) then
    raise exception 'a policy still carries a retired table name';
  end if;
end
$policies$;

-- The recreated RPCs did not widen. This is a RECIPE proof and not a core one
-- because `anon` is a role only the recipe creates: the core drops and replays
-- whatever ACL it found, and the question "did anon keep its revoke" can only
-- be asked where anon exists. Asking it in the core would make the portable
-- core name the host it exists to be independent of.
do $anon$
declare
  widened text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into widened
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_path', 'create_scenario', 'duplicate_path',
                       'set_cell_dependency')
     and has_function_privilege('anon', p.oid, 'execute');
  if widened is not null then
    raise exception 'the drop-and-recreate widened an RPC to anon: %', widened;
  end if;
end
$anon$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000117000000_a_scenario_left_merged_opens_merged.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the Supabase roles: a fresh function is executable by PUBLIC.
revoke execute on function public.update_scenario_layout(uuid, text) from public, anon;
grant execute on function public.update_scenario_layout(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000118000000_a_resource_keeps_its_id_and_knows_its_cell.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the Supabase roles. A fresh function is executable by PUBLIC,
-- and the cell's list was an invoker function until now.
revoke execute on function public.sync_cell_resources(uuid, jsonb) from public, anon;
grant execute on function public.sync_cell_resources(uuid, jsonb) to authenticated;
revoke execute on function public.sync_placement_resources(uuid, jsonb) from public, anon;
grant execute on function public.sync_placement_resources(uuid, jsonb) to authenticated;
revoke execute on function public.set_featured_resource(uuid, boolean) from public, anon;
grant execute on function public.set_featured_resource(uuid, boolean) to authenticated;
revoke execute on function public.restore_featured_resources(jsonb) from public, anon;
grant execute on function public.restore_featured_resources(jsonb) to authenticated;
-- the four writes are closed to the public role and open to the
-- signed-in one.
do $recipe_proof$
declare
  fn text;
begin
  foreach fn in array array[
    'public.sync_cell_resources(uuid, jsonb)',
    'public.sync_placement_resources(uuid, jsonb)',
    'public.set_featured_resource(uuid, boolean)',
    'public.restore_featured_resources(jsonb)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated cannot execute %', fn;
    end if;
  end loop;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000119000000_a_placement_says_what_a_tool_does_here.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the panel's column-scoped edit gains the new column; the two
-- dropped ones took their grants with them.
grant update (role) on public.cell_touchpoints to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000120000000_a_touchpoint_is_a_thing_the_service_owns.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the registry's RLS and grants, the same shape as every other
-- root-scoped table; the five structural writes closed to anon.
alter table public.touchpoints enable row level security;

create policy touchpoints_select_anon on public.touchpoints
  for select to anon using (true);
create policy touchpoints_select_auth on public.touchpoints
  for select to authenticated using (true);
create policy touchpoints_insert_service_only on public.touchpoints
  for insert to authenticated with check (public.is_service_account());
create policy touchpoints_update_service_only on public.touchpoints
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy touchpoints_delete_service_only on public.touchpoints
  for delete to authenticated using (public.is_service_account());

grant select on public.touchpoints to anon, authenticated;
grant insert, delete on public.touchpoints to authenticated;
grant update (name, kind, summary, url) on public.touchpoints to authenticated;
revoke insert, update, delete, truncate on public.touchpoints from anon;
revoke truncate on public.touchpoints from authenticated;

revoke execute on function public.sync_cell_touchpoints(uuid, text[]) from public, anon;
grant execute on function public.sync_cell_touchpoints(uuid, text[]) to authenticated;
revoke execute on function public.restore_cell_touchpoints(uuid, jsonb) from public, anon;
grant execute on function public.restore_cell_touchpoints(uuid, jsonb) to authenticated;
revoke execute on function public.set_placement_touchpoint(uuid, uuid, text) from public, anon;
grant execute on function public.set_placement_touchpoint(uuid, uuid, text) to authenticated;
revoke execute on function public.remove_placement(uuid) from public, anon;
grant execute on function public.remove_placement(uuid) to authenticated;
revoke execute on function public.restore_placement(jsonb, jsonb) from public, anon;
grant execute on function public.restore_placement(jsonb, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000121000000_an_upload_is_an_attachment_with_a_stable_url.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the bucket, its policies, and their proof.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cell-attachments', 'cell-attachments', true, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cell_attachments_select" on storage.objects;
drop policy if exists "cell_attachments_insert" on storage.objects;
drop policy if exists "cell_attachments_update" on storage.objects;
drop policy if exists "cell_attachments_delete" on storage.objects;

create policy "cell_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'cell-attachments');

create policy "cell_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^cells/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

create policy "cell_attachments_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cell-attachments' and public.is_service_account())
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^cells/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

create policy "cell_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cell-attachments' and public.is_service_account());

do $proof$
declare
  bad int;
begin
  if not exists (select 1 from storage.buckets where id = 'cell-attachments' and public) then
    raise exception 'the cell-attachments bucket is missing or not public';
  end if;

  select count(*) into bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('cell_attachments_select', 'cell_attachments_insert',
                        'cell_attachments_update', 'cell_attachments_delete');
  if bad <> 4 then
    raise exception 'expected four cell_attachments policies on storage.objects, found %', bad;
  end if;

  select count(*) into bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('cell_attachments_insert', 'cell_attachments_update', 'cell_attachments_delete')
     and ('anon' = any(roles) or 'public' = any(roles)
          or coalesce(qual, '') || coalesce(with_check, '') not like '%is_service_account()%');
  if bad <> 0 then
    raise exception '% cell_attachments write policies are open to anon or unguarded', bad;
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000125000000_an_entity_has_a_status_and_a_lane_names_its_actor.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the cast's RLS and grants, the same shape as every other
-- root-scoped catalog; the lane's actor is one more column the panel writes.
alter table public.stakeholders enable row level security;

create policy stakeholders_select_anon on public.stakeholders
  for select to anon using (true);
create policy stakeholders_select_auth on public.stakeholders
  for select to authenticated using (true);
create policy stakeholders_insert_service_only on public.stakeholders
  for insert to authenticated with check (public.is_service_account());
create policy stakeholders_update_service_only on public.stakeholders
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy stakeholders_delete_service_only on public.stakeholders
  for delete to authenticated using (public.is_service_account());

grant select on public.stakeholders to anon, authenticated;
grant insert, delete on public.stakeholders to authenticated;
-- The platform's default privilege hands a new table's whole UPDATE to
-- authenticated; take it back before naming the columns the panel may write,
-- or the list narrows nothing there.
revoke update on public.stakeholders from authenticated;
grant update (name, kind, summary, aliases) on public.stakeholders to authenticated;
revoke insert, update, delete, truncate on public.stakeholders from anon;
revoke truncate on public.stakeholders from authenticated;

-- The three columns the editors that follow will write. cells' table-wide
-- UPDATE was revoked long ago, so its column grants ARE the surface; paths is
-- granted the same way so the two behave alike on any host.
grant update (stakeholder_id) on public.lanes to authenticated;
grant update (status) on public.cells to authenticated;
grant update (status) on public.paths to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000126000000_a_step_says_what_its_moment_is.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the write surface is the Supabase roles' business: `authenticated`
-- is a role only the recipe creates, and a column grant is how this deployment
-- says which fields a signed-in author may write directly.

-- The step's caption. `steps` was revoked and re-granted column by column in
-- 20260818000000, so its column grants ARE the surface and a new field has to
-- be named or the panel's save is refused.
grant update (summary) on public.steps to authenticated;

-- The Service panel's two fields. `services` was never narrowed, so this adds
-- a floor rather than replacing a posture — see the header.
grant update (summary, entity_examples) on public.services to authenticated;

-- The three columns the panels write, each reachable by the signed-in role.
-- An invariant: it reads the same on a database where the grant was already
-- wider as on one where this file is what put it there.
do $recipe_proof$
declare
  target text;
begin
  foreach target in array array[
    'steps.summary',
    'services.summary',
    'services.entity_examples'
  ] loop
    if not has_column_privilege(
      'authenticated',
      format('public.%I', split_part(target, '.', 1)),
      split_part(target, '.', 2),
      'UPDATE'
    ) then
      raise exception 'proof: authenticated cannot UPDATE public.%; the grant did not take', target;
    end if;
  end loop;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000127000000_a_phase_may_say_what_it_is.sql
-- ─────────────────────────────────────────────────────────────────────────

grant update (summary) on public.phases to authenticated;

do $recipe_proof$
begin
  if not has_column_privilege('authenticated', 'public.phases', 'summary', 'UPDATE') then
    raise exception 'proof: authenticated cannot UPDATE public.phases.summary; the grant did not take';
  end if;
  -- The two the panel already wrote, still there: this file widens, it does
  -- not re-posture.
  if not has_column_privilege('authenticated', 'public.phases', 'business_impact', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.phases', 'operational_requirements', 'UPDATE') then
    raise exception 'proof: the phase panel''s existing columns lost their grant';
  end if;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000128000000_a_grant_is_not_a_policy.sql
-- ─────────────────────────────────────────────────────────────────────────

-- a policy names `authenticated`, a role only the recipe creates.
-- Who may write a row is this deployment's enforcement of the contract, not
-- part of the contract; another host expresses the same rule its own way.

drop policy if exists "services_update_auth" on public.services;
create policy "services_update_auth" on public.services
  for update to authenticated using (true) with check (true);

-- The question the panel's save asks, asked here: is there an UPDATE policy on
-- `services` that a signed-in author is inside. Without one the save matches
-- zero rows and reports a deletion that never happened.
do $recipe_proof$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'services'
       and cmd = 'UPDATE'
       and 'authenticated' = any (roles)
  ) then
    raise exception 'proof: public.services has no UPDATE policy for authenticated; the grant is not a policy and the panel save would match zero rows';
  end if;
  -- The grant half, still there: this file adds the missing half, it does not
  -- re-posture the surface 21000126000000 named.
  if not has_column_privilege('authenticated', 'public.services', 'summary', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.services', 'entity_examples', 'UPDATE') then
    raise exception 'proof: the service panel''s columns lost their grant';
  end if;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000129000000_a_sql_body_keeps_the_name_it_was_written_with.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the three policies belong to the optional service-account tier
-- (20260818002000), which is a recipe: they exist only on a database where that
-- migration was applied, so the statement that moves them belongs to that half.
--
-- Guarded, because the generated recipe already speaks the current vocabulary:
-- on the two-halves database the tier's loop created these three as
-- `slides_*_service_only` and there is nothing here to rename. Only a replay of
-- the series carries the old names, and `alter policy` has no `if exists`.
do $$
declare
  v_command text;
  v_old text;
  v_new text;
begin
  foreach v_command in array array['insert', 'update', 'delete'] loop
    v_old := 'slice_items_' || v_command || '_service_only';
    v_new := 'slides_' || v_command || '_service_only';

    if exists (
      select 1
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'slides'
         and p.polname = v_old
    ) then
      execute format('alter policy %I on public.slides rename to %I', v_old, v_new);
    end if;
  end loop;
end
$$;

do $$
declare
  v_stale text;
begin
  -- The invariant rather than a census: NO policy in `public` names the retired
  -- table. It reads the same on a replay, where three were just moved, as on
  -- the two halves, where there was never anything to move — and it fails on
  -- the next policy created from a list somebody forgot to update.
  select string_agg(p.polname, ', ' order by p.polname) into v_stale
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and p.polname like '%slice_items%';

  if v_stale is not null then
    raise exception
      'a policy still names public.slice_items, which is public.slides now: %',
      v_stale;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000131000000_a_touchpoint_belongs_to_the_deployment.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the ACL the two rewrites had to preserve, asserted where the
-- roles exist. `create or replace` keeps a function's ACL, so nothing is
-- re-granted here; this is the check that the sentence is true.
do $posture$
declare
  fn text;
begin
  foreach fn in array array[
    'public.sync_cell_touchpoints(uuid, text[])',
    'public.set_placement_touchpoint(uuid, uuid, text)'
  ] loop
    if not has_function_privilege('authenticated', fn::regprocedure, 'execute') then
      raise exception 'authenticated lost execute on %', fn;
    end if;
    if has_function_privilege('anon', fn::regprocedure, 'execute') then
      raise exception 'anon gained execute on %', fn;
    end if;
  end loop;
end
$posture$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000201000000_a_touchpoint_names_its_owner.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the owner is one more column the registry panel writes, and
-- `authenticated` is the caller class that writes it. The table's other
-- column grants were written in `21000120000000`; this extends that surface
-- by one column and changes nothing else about the posture.
grant update (stakeholder_id) on public.touchpoints to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000202000000_a_rename_moves_the_word_in_every_cell.sql
-- ─────────────────────────────────────────────────────────────────────────

-- who may call it. The same posture as every other placement
-- function in `21000120000000`: closed to `public` and `anon`, open to
-- `authenticated`, with the service-account guard inside the body deciding
-- which authenticated caller may actually author.
revoke execute on function public.rename_content_item(text, text, text) from public, anon;
grant execute on function public.rename_content_item(text, text, text) to authenticated;
revoke execute on function public.rename_touchpoint(uuid, text) from public, anon;
grant execute on function public.rename_touchpoint(uuid, text) to authenticated;

-- The other half of this slice is a placement's per-moment writing, which
-- `src/lib/touchpointMutations.ts` saves as a column-scoped update rather than
-- through a function — it writes two columns of one row by id and needs no
-- transaction to do it. `21000119000000` granted `role` when the column
-- arrived; `summary` was granted to nobody, because until now nothing wrote
-- it outside `sync_cell_touchpoints` and `restore_cell_touchpoints`, which are
-- SECURITY DEFINER and never consulted a column grant.
--
-- Column privileges are checked against the SET LIST, not against what the
-- statement changes, so a writer naming both columns is refused on `summary`
-- before it reaches a single row. The grant lands in the same slice as the
-- writer on purpose: a write surface with no writer is a row every posture
-- check has to account for before any mutation touches the column.
--
-- `cell_touchpoints_update_service_only` still stands over it, so this widens
-- WHICH COLUMN an author may write and not WHO may write one.
grant update (summary) on public.cell_touchpoints to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000206000000_the_first_account_holds_the_keys.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the whole file, header included. It rewrites the tier recipe's
-- own trigger function and reads `auth.users`, a Supabase table, so nothing
-- here belongs to a backend that is not Supabase.

-- The first account holds the keys.
--
-- Authored 2026-09-08. The version is an allocation counter, not a date.
--
-- The service-account tier ships with an allowlist and no way to get onto it.
-- `service_account_emails` is created empty, and nothing in this package —
-- no seed, no script, no documented step — ever inserts a row. So an adopter
-- who runs the setup as written gets the strict database with NO account in
-- the editing tier: every signed-in session, including the one belonging to
-- the person who just created the project, is a viewer. The way out is a
-- hand-written `update auth.users` whose text lives in the header of another
-- migration.
--
-- That is worse than it sounds, because the strict database is what the setup
-- produces by DEFAULT. `supabase db reset` applies every file in
-- `supabase/migrations/`, and the tier recipe is one of them — it is optional
-- in the sense that an adopter may delete the file, not in the sense that
-- skipping it is the default. Reaching the single-tier posture the package
-- calls its default takes a deliberate deletion.
--
-- So the trigger gains a second way to enroll: the FOUNDING account.
--
-- ── Why the first user, and not an empty allowlist ─────────────────────────
--
-- "The allowlist is empty" is the other predicate that closes the same gap,
-- and it is the dangerous one. An adopter who enables sign-ups and never
-- fills the allowlist — the exact adopter this fixes — would stamp EVERY
-- account created in that window. The gap it opens is unbounded and it grows
-- with the deployment's popularity.
--
-- "There are no accounts yet" stamps exactly one account, ever, and it is the
-- one belonging to whoever stood the project up. After that the allowlist
-- governs, as it already did. The bound is arithmetic rather than
-- procedural — the same trade the migration band makes.
--
-- Two things follow from it being a BEFORE INSERT row trigger. The new row is
-- not in the table yet, so the founding account sees a genuinely empty
-- `auth.users` and enrolls. And two accounts created in the same instant on a
-- brand-new project could both see it empty; both would be stamped, which is
-- the intended outcome for a project whose owner is signing up twice and an
-- accepted one otherwise.
--
-- ── Why it stays in the recipe ─────────────────────────────────────────────
--
-- Stamping matters only where something reads the stamp, and the only reader
-- is the tier recipe's own `is_service_account()`. Delete the recipe and the
-- seam is `select true` again: every signed-in session edits, there is no
-- tier to be enrolled in, and a role claim written onto `auth.users` would be
-- a value nothing consults. Moving the trigger into the core would hang
-- Supabase-specific auth machinery on adopters who chose the single-tier
-- posture, to no effect.
--
-- What made that argument look the other way was a client that decided the
-- tier by reading the claim: such a client goes read-only against a
-- permissive database, so the stamp had to exist everywhere to keep it
-- honest. The client now asks `is_service_account()` instead of guessing,
-- and is right in both postures without any stamp at all. The stamp is back
-- to doing one job — giving the strict posture an owner — which is the
-- recipe's job.

create or replace function public.flag_service_accounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  enroll boolean;
begin
  enroll := exists (
    select 1 from public.service_account_emails e
    where lower(e.email) = lower(new.email)
  );

  if not enroll then
    -- The founding account. Guarded because the alternative to a `false`
    -- here is an exception, and an exception in a BEFORE INSERT trigger on
    -- auth.users means nobody can create an account at all — a failure that
    -- surfaces at the first sign-up rather than at migration time.
    begin
      enroll := not exists (select 1 from auth.users);
    exception
      when insufficient_privilege then
        enroll := false;
    end;
  end if;

  if enroll then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"service"}'::jsonb;
  end if;

  return new;
end;
$$;

comment on function public.flag_service_accounts() is
  'BEFORE INSERT on auth.users: stamps app_metadata.role=service on an account whose email is on service_account_emails, and on the first account a project ever has, so a fresh deployment of the tier recipe has an editor without a hand-written update.';

-- The trigger already exists and points at this function by name; replacing
-- the body is the whole change. Re-created only to keep a database that
-- somehow lost it whole.
drop trigger if exists flag_service_accounts on auth.users;
create trigger flag_service_accounts
  before insert on auth.users
  for each row execute function public.flag_service_accounts();

revoke execute on function public.flag_service_accounts() from public;
revoke execute on function public.flag_service_accounts()
  from anon, authenticated;
grant execute on function public.flag_service_accounts() to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000207000000_a_count_is_true_of_the_delete_that_follows.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grant names the Supabase roles. The function itself is core;
-- who may call it over PostgREST is this deployment's business. Dropping the
-- two-argument form dropped its grants with it, so this restores them on the
-- signature that exists now.

grant execute on function public.deletion_impact(text, uuid, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000210000000_an_upsert_says_which_half_it_took.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grants name the Supabase roles. The functions themselves are
-- core; who may call them is this deployment's enforcement of the contract.
-- `set_cell_dependency` was dropped above and took its grants with it, so this
-- restores them on the recreated signature; `restore_cell_dependency` is new
-- and gets the same terms as every other authoring write.

revoke execute on function public.set_cell_dependency(uuid, uuid, text, text, text) from anon;
grant execute on function public.set_cell_dependency(uuid, uuid, text, text, text) to authenticated;
revoke execute on function public.restore_cell_dependency(uuid, text, text) from anon;
grant execute on function public.restore_cell_dependency(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000211000000_the_other_upsert_says_which_half_it_took.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grants name the Supabase roles. The functions themselves are
-- core; who may call them is this deployment's enforcement of the contract.
-- `upsert_cell` was dropped above and took its grants with it, so this restores
-- them on the recreated signature; `restore_cell_content` is new and gets the
-- same terms as every other authoring write.

revoke execute on function public.upsert_cell(uuid, uuid, uuid, text) from anon;
grant execute on function public.upsert_cell(uuid, uuid, uuid, text) to authenticated;
revoke execute on function public.restore_cell_content(uuid, text) from anon;
grant execute on function public.restore_cell_content(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000212000000_the_service_record_joins_the_tier.sql
-- ─────────────────────────────────────────────────────────────────────────

-- a policy names `authenticated`, a role only the recipe creates,
-- and the tier it enforces is the recipe's too. Who may write a row is this
-- deployment's enforcement of the contract, not part of the contract; another
-- host expresses the same rule its own way.

drop policy if exists "services_update_service_only" on public.services;
create policy "services_update_service_only" on public.services
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());

-- ---------------------------------------------------------------------------
-- Proof — the post-condition, asked as the role.
--
-- An owner run cannot see this one. The migration role bypasses row level
-- security outright, and a policy that refuses does not raise — it matches
-- zero rows and returns success — so a proof that reads the catalogue, or one
-- that writes as the owner, is satisfied by the database this file exists to
-- change. So the proof BECOMES `authenticated`, holds each of the two claims
-- in turn, and attempts the write the Service panel makes.
--
-- Each attempt stands up a service row of its own and ends in a sentinel
-- exception, so the row, the claim and the role are all gone before the next
-- attempt starts and none of them survives the migration.
--
-- It asks nothing where it cannot get an answer, and names what was missing:
-- a session that cannot become `authenticated`, or an `authenticated` that
-- cannot read `public.services`, would turn the platform's absence into a
-- verdict about this policy. Both are notices, checked before anything is
-- written.
--
-- What it asserts is only what this file makes true: the answer is
-- `is_service_account()`'s, both ways. A service claim writes; a session
-- without one writes only where the seam still says `select true`. It asserts
-- nothing about how many policies exist, which would be a census of the
-- database it happened to meet.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  probe record;
  changed bigint;
  wrote jsonb := '{}'::jsonb;
  seam_admits_a_viewer boolean;
begin
  -- Two things the question needs before it can be put at all, and each says
  -- so out loud rather than being swallowed: a skipped proof is a proof that
  -- did not run, and a reader has to be able to tell that from a green one.
  --
  -- The role has to exist and be assumable.
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice
      'services tier proof skipped: this session cannot become authenticated, '
      'so the policy could not be asked whether it refuses a viewer';
    return;
  end if;

  -- And `authenticated` has to be able to READ the row it is asked to write.
  -- An UPDATE needs SELECT on every column its assignment and its WHERE clause
  -- read, and that SELECT is the PLATFORM's, not the recipe's: Supabase grants
  -- it at project creation on every table in `public`, and no migration here
  -- states it (21000113000000 says so). So on a real project, and on the
  -- deployer's replay that stands the platform default up first, the proof
  -- runs. On a bare replay behind the shim alone there is no such grant, and a
  -- probe that ran anyway would report the platform's absence as this policy
  -- refusing a write.
  if not has_column_privilege('authenticated', 'public.services', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.services', 'summary', 'SELECT') then
    raise notice
      'services tier proof skipped: authenticated cannot read public.services '
      'here, so an attempted UPDATE would be refused for want of the platform''s '
      'SELECT rather than answered by the policy';
    return;
  end if;

  for probe in
    select *
      from (values
        ('viewer', '{"role":"authenticated","app_metadata":{}}'),
        ('author', '{"role":"authenticated","app_metadata":{"role":"service"}}')
      ) as v(who, claims)
  loop
    begin
      -- A row of the proof's own. An empty `services` would match zero rows
      -- for a reason that has nothing to do with permission, and the whole
      -- failure being proved against is a zero that means something else.
      insert into public.services (name) values ('services tier proof');
      perform set_config('request.jwt.claims', probe.claims, true);
      set local role authenticated;
      if probe.who = 'viewer' then
        seam_admits_a_viewer := public.is_service_account();
      end if;
      update public.services set summary = summary
       where name = 'services tier proof';
      get diagnostics changed = row_count;
      wrote := wrote || jsonb_build_object(probe.who, changed);
      raise exception 'services tier proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught: it is how the row, the claim and the
      -- role are given back. Anything else — a grant this file assumed and the
      -- database does not have — propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;
  end loop;

  if (wrote ->> 'author')::bigint = 0 then
    raise exception
      'proof: a service account cannot UPDATE public.services; the restrictive '
      'policy refuses the very tier it names, and the Service panel would save '
      'nothing and report the service as deleted';
  end if;

  if seam_admits_a_viewer then
    -- Single-tier deployment: the seam is still `select true`, so this policy
    -- admits every signed-in session by construction. That is the template
    -- default and not a failure — but a viewer REFUSED here would mean the
    -- policy is denying a write the seam allows.
    raise notice
      'services tier proof: the optional tier recipe is not in force here, so '
      'the new policy admits every signed-in session, as this deployment chose';
    if (wrote ->> 'viewer')::bigint = 0 then
      raise exception
        'proof: a signed-in session was refused UPDATE on public.services on a '
        'database whose tier seam admits every signed-in session';
    end if;
  elsif (wrote ->> 'viewer')::bigint <> 0 then
    raise exception
      'proof: a signed-in session holding no service claim still UPDATEd '
      'public.services; the restrictive policy did not take, and a member '
      'outside the editing tier can rewrite the service record';
  end if;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000213000000_one_shape_for_service_accounts_only.sql
-- ─────────────────────────────────────────────────────────────────────────

-- a policy names `authenticated`, a role only the recipe creates,
-- and the tier it enforces is the recipe's too. Who may write a row is this
-- deployment's enforcement of the contract, not part of the contract; another
-- host expresses the same rule its own way.

-- ---------------------------------------------------------------------------
-- stakeholders — the cast. The panel inserts it, updates it and deletes it.
--
-- Order matters, and it is: old spelling out, restrictive half in, permissive
-- half last. A policy's permissiveness cannot be altered in place, so each has
-- to be dropped and recreated, and the order decides what the table looks like
-- in between. This one leaves it CLOSED — with no permissive write policy
-- standing, nothing matches for anyone — and the permissive half arrives last,
-- re-opening it to a tier the restrictive half is already there to enforce.
-- The reverse order would open it to every signed-in session for the width of
-- two statements.
-- ---------------------------------------------------------------------------

drop policy if exists "stakeholders_insert_service_only" on public.stakeholders;
drop policy if exists "stakeholders_update_service_only" on public.stakeholders;
drop policy if exists "stakeholders_delete_service_only" on public.stakeholders;

create policy "stakeholders_insert_service_only" on public.stakeholders
  as restrictive for insert to authenticated
  with check (public.is_service_account());
create policy "stakeholders_update_service_only" on public.stakeholders
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy "stakeholders_delete_service_only" on public.stakeholders
  as restrictive for delete to authenticated
  using (public.is_service_account());

drop policy if exists "stakeholders_insert_auth" on public.stakeholders;
create policy "stakeholders_insert_auth" on public.stakeholders
  for insert to authenticated with check (true);
drop policy if exists "stakeholders_update_auth" on public.stakeholders;
create policy "stakeholders_update_auth" on public.stakeholders
  for update to authenticated using (true) with check (true);
drop policy if exists "stakeholders_delete_auth" on public.stakeholders;
create policy "stakeholders_delete_auth" on public.stakeholders
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- cell_touchpoints — the cell's placement rows. The panel updates them; the
-- structural RPCs place and remove them, and those are SECURITY DEFINER, so
-- they never meet a policy and assert the tier in their own bodies. All three
-- verbs are rewritten all the same: they are one rule, and leaving any of them
-- in the old spelling would leave this table an exception on the axis that
-- matters.
--
-- Order matters, and it is: old spelling out, restrictive half in, permissive
-- half last. A policy's permissiveness cannot be altered in place, so each has
-- to be dropped and recreated, and the order decides what the table looks like
-- in between. This one leaves it CLOSED — with no permissive write policy
-- standing, nothing matches for anyone — and the permissive half arrives last,
-- re-opening it to a tier the restrictive half is already there to enforce.
-- The reverse order would open it to every signed-in session for the width of
-- two statements.
-- ---------------------------------------------------------------------------

drop policy if exists "cell_touchpoints_insert_service_only" on public.cell_touchpoints;
drop policy if exists "cell_touchpoints_update_service_only" on public.cell_touchpoints;
drop policy if exists "cell_touchpoints_delete_service_only" on public.cell_touchpoints;

create policy "cell_touchpoints_insert_service_only" on public.cell_touchpoints
  as restrictive for insert to authenticated
  with check (public.is_service_account());
create policy "cell_touchpoints_update_service_only" on public.cell_touchpoints
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy "cell_touchpoints_delete_service_only" on public.cell_touchpoints
  as restrictive for delete to authenticated
  using (public.is_service_account());

drop policy if exists "cell_touchpoints_insert_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_insert_auth" on public.cell_touchpoints
  for insert to authenticated with check (true);
drop policy if exists "cell_touchpoints_update_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_update_auth" on public.cell_touchpoints
  for update to authenticated using (true) with check (true);
drop policy if exists "cell_touchpoints_delete_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_delete_auth" on public.cell_touchpoints
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Proof — the post-condition, asked as the role.
--
-- An owner run cannot see this one. The migration role bypasses row level
-- security outright, and a policy that refuses does not raise — it matches
-- zero rows and returns success — so a proof that reads the catalogue, or one
-- that writes as the owner, is satisfied by any database at all. So the proof
-- BECOMES `authenticated`, holds each of the two claims in turn, and attempts
-- the writes the panels make.
--
-- It asserts only what this file makes true, and that is a statement about
-- posture, not about policies: a service account writes both tables; a
-- session without a service claim writes only where the seam still says
-- `select true`. It counts nothing in `pg_policies` — a census of the
-- database it happened to meet is not a post-condition (ADR 0009), and it is
-- also precisely the reading that could not tell these two shapes apart.
--
-- Each attempt stands its own row up and ends in a sentinel exception, so the
-- row, the claim and the role are all gone before the next attempt starts and
-- none of them survives the migration.
--
-- It asks nothing where it cannot get an answer, and says so out loud each
-- time: a session that cannot become `authenticated`, an `authenticated` that
-- cannot read the table, or a `cell_touchpoints` with no cell to hang a
-- fixture row on would each turn an absence into a verdict about these
-- policies. A skipped proof is a proof that did not run, and a reader has to
-- be able to tell that from a green one.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  probe record;
  changed bigint;
  wrote jsonb := '{}'::jsonb;
  skipped text[] := '{}';
  seam_admits_a_viewer boolean;
  key text;
begin
  -- Three things the question needs before it can be put at all, and each
  -- says so out loud rather than being swallowed.
  --
  -- The role has to exist and be assumable.
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice
      'one-shape proof skipped: this session cannot become authenticated, so '
      'the policies could not be asked whether they answer to the seam';
    return;
  end if;

  -- And `authenticated` has to hold every privilege the attempted writes
  -- need. A write needs SELECT on the columns its WHERE and its assignment
  -- read; a refused INSERT and a missing INSERT grant are the same 42501.
  -- Both tables get these grants from this recipe rather than from the
  -- platform, so they are present even on a bare replay behind the shim — but
  -- a proof that assumed them would report a future revoke as these policies
  -- refusing a write.
  if not has_column_privilege('authenticated', 'public.stakeholders', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.stakeholders', 'summary', 'SELECT')
     or not has_column_privilege('authenticated', 'public.stakeholders', 'summary', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.stakeholders', 'INSERT')
     or not has_table_privilege('authenticated', 'public.stakeholders', 'DELETE')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'summary', 'SELECT')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'summary', 'UPDATE') then
    raise notice
      'one-shape proof skipped: authenticated does not hold the grants these '
      'writes need here, so an attempt would be refused for want of a grant '
      'rather than answered by the policy';
    return;
  end if;

  -- And `cell_touchpoints.cell_id` is NOT NULL, so its fixture row needs a
  -- cell to hang on. An empty replay has none; a seeded target does.
  if not exists (select 1 from public.cells) then
    skipped := array_append(skipped, 'cell_touchpoints');
    raise notice
      'one-shape proof: public.cells is empty, so no cell_touchpoints fixture '
      'could be stood up and that table was not asked here; check:seed-load '
      'asks it, as both people, against a seeded database';
  end if;

  for probe in
    select *
      from (values
        ('viewer', '{"role":"authenticated","app_metadata":{}}'),
        ('author', '{"role":"authenticated","app_metadata":{"role":"service"}}')
      ) as who(persona, claims)
     cross join (values
        ('stakeholders', 'update'),
        ('stakeholders', 'insert'),
        ('stakeholders', 'delete'),
        ('cell_touchpoints', 'update')
      ) as what(tbl, verb)
  loop
    continue when probe.tbl = any (skipped);
    key := probe.persona || ' ' || probe.verb || ' ' || probe.tbl;
    begin
      -- Rows of the proof's own, so a zero means permission and nothing else.
      -- An empty table matches zero rows for a reason that has nothing to do
      -- with row level security, and a zero that means something else is the
      -- whole failure being proved against.
      insert into public.stakeholders (name, kind)
      values ('one-shape proof', 'team');
      if probe.tbl = 'cell_touchpoints' then
        insert into public.cell_touchpoints (cell_id, name, position, origin)
        select id, 'one-shape proof', 2147483647, 'app'
          from public.cells order by id limit 1;
      end if;

      perform set_config('request.jwt.claims', probe.claims, true);
      set local role authenticated;
      if probe.persona = 'viewer' then
        seam_admits_a_viewer := public.is_service_account();
      end if;

      if probe.verb = 'insert' then
        -- An INSERT the policy refuses RAISES 42501; an UPDATE or a DELETE it
        -- refuses matches zero rows and returns success. Same verdict, two
        -- shapes of answer, so the raise is turned back into the count the
        -- other two give — which is safe here only because the gate above has
        -- already established that the grant is not what raised it.
        begin
          insert into public.stakeholders (name, kind)
          values ('one-shape proof, again', 'team');
          get diagnostics changed = row_count;
        exception
          when insufficient_privilege then changed := 0;
        end;
      elsif probe.verb = 'delete' then
        delete from public.stakeholders where name = 'one-shape proof';
        get diagnostics changed = row_count;
      elsif probe.tbl = 'stakeholders' then
        update public.stakeholders set summary = summary
         where name = 'one-shape proof';
        get diagnostics changed = row_count;
      else
        update public.cell_touchpoints set summary = summary
         where name = 'one-shape proof';
        get diagnostics changed = row_count;
      end if;
      wrote := wrote || jsonb_build_object(key, changed);

      raise exception 'one-shape proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught out here: it is how the rows, the claim
      -- and the role are given back. Anything else — a grant this file assumed
      -- and the database does not have — propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;
  end loop;

  if wrote = '{}'::jsonb then
    raise exception
      'proof: no write was attempted at all, so nothing above was asked';
  end if;

  if seam_admits_a_viewer then
    -- Single-tier deployment: the seam is still `select true`, so these
    -- policies admit every signed-in session by construction. That is the
    -- template default and not a failure — but a viewer REFUSED here would
    -- mean a policy denying a write the seam allows.
    raise notice
      'one-shape proof: the optional tier recipe is not in force here, so '
      'these policies admit every signed-in session, as this deployment chose';
  end if;

  for key in select jsonb_object_keys(wrote) loop
    if key like 'author %' and (wrote ->> key)::bigint = 0 then
      raise exception
        'proof: a service account could not % — after this file the pair on '
        'that table has to admit the editing tier, and one of its halves does '
        'not; the panel would save nothing and report the row as deleted',
        substr(key, 8);
    end if;
    if key like 'viewer %' then
      if seam_admits_a_viewer and (wrote ->> key)::bigint = 0 then
        raise exception
          'proof: a signed-in session was refused % on a database whose tier '
          'seam admits every signed-in session', substr(key, 8);
      end if;
      if not seam_admits_a_viewer and (wrote ->> key)::bigint <> 0 then
        raise exception
          'proof: a signed-in session holding no service claim still did % — '
          'the restrictive policy did not take, and a member outside the '
          'editing tier can rewrite the cast or the board', substr(key, 8);
      end if;
    end if;
  end loop;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000214000000_a_restriction_needs_something_to_restrict.sql
-- ─────────────────────────────────────────────────────────────────────────

-- every policy named here names `authenticated`, a role only the
-- recipe creates, and each was created by the optional tier recipe. Who may
-- write a row is this deployment's enforcement of the contract, not part of
-- the contract; another host expresses the same rule its own way.

-- ---------------------------------------------------------------------------
-- The six tables whose UPDATE is a pair and whose INSERT and DELETE are the
-- RPCs'. Each is edited from a panel — a step's summary, a lane's owner, a
-- cell's content — and each is created and destroyed only by a definer RPC.
-- The permissive `<table>_update_auth` and its restrictive partner stay
-- exactly as they are; it is the two verbs with no partner that go.
-- ---------------------------------------------------------------------------

drop policy if exists "cells_insert_service_only" on public.cells;
drop policy if exists "cells_delete_service_only" on public.cells;

drop policy if exists "lanes_insert_service_only" on public.lanes;
drop policy if exists "lanes_delete_service_only" on public.lanes;

drop policy if exists "paths_insert_service_only" on public.paths;
drop policy if exists "paths_delete_service_only" on public.paths;

drop policy if exists "phases_insert_service_only" on public.phases;
drop policy if exists "phases_delete_service_only" on public.phases;

drop policy if exists "scenarios_insert_service_only" on public.scenarios;
drop policy if exists "scenarios_delete_service_only" on public.scenarios;

drop policy if exists "steps_insert_service_only" on public.steps;
drop policy if exists "steps_delete_service_only" on public.steps;

-- ---------------------------------------------------------------------------
-- The two tables the app never writes directly at all. `cell_dependencies` is
-- reached through `set_cell_dependency` / `clear_cell_dependency` and
-- `path_steps` through `set_path_steps` / `add_step` / `remove_step` /
-- `reorder_steps` — an edge and an ordering are shapes, and a half-written
-- shape is the thing those RPCs exist to make impossible. All three verbs go
-- on each: neither table has a permissive write policy of any kind, so all six
-- restrictions stood alone.
-- ---------------------------------------------------------------------------

drop policy if exists "cell_dependencies_insert_service_only" on public.cell_dependencies;
drop policy if exists "cell_dependencies_update_service_only" on public.cell_dependencies;
drop policy if exists "cell_dependencies_delete_service_only" on public.cell_dependencies;

drop policy if exists "path_steps_insert_service_only" on public.path_steps;
drop policy if exists "path_steps_update_service_only" on public.path_steps;
drop policy if exists "path_steps_delete_service_only" on public.path_steps;

-- ---------------------------------------------------------------------------
-- The two derived-layer tables missing only their DELETE. Both are inserted
-- and updated from the app under full pairs, which stay: a finding is raised
-- by a run and closed by moving its `status`, and a business model is one row
-- per service that panels rewrite. Neither is deleted by anything — not by a
-- panel, not by an RPC — so the DELETE restriction had nothing to narrow.
-- ---------------------------------------------------------------------------

drop policy if exists "audit_findings_delete_service_only" on public.audit_findings;

drop policy if exists "business_models_delete_service_only" on public.business_models;

-- ---------------------------------------------------------------------------
-- Proof — what this file makes true, and that it took nothing away.
--
-- Three claims, and they are deliberately different in kind.
--
-- FIRST, the post-condition: no restrictive policy in `public` stands for a
-- command with no permissive policy for that command admitting a role it
-- names. That is an invariant over whatever the catalogue holds, not a count
-- of what this file did — "twenty were dropped" is a census of the database
-- it happened to meet (ADR 0009), and it is also the reading that
-- cannot tell a closed door from a governed one, which is the confusion being
-- removed. It is asked of the whole schema rather than of the tables named
-- above, a fork's own included: a lone restriction is the same silent closed
-- door wherever it stands, and a rule that exempted the reader's own tables
-- would be the rule that let these twenty arrive.
--
-- SECOND, the safety claim, which is the one a reviewer will want: for each
-- verb whose restriction is removed above, NO permissive policy stands for
-- that verb. That is what makes the removal a no-op rather than a widening.
-- On a deployment that has opened one of these verbs, the restriction was
-- doing real work and this file would have taken it away — so that case
-- raises, names the table and the verb, and points at the pair.
--
-- THIRD, the same question asked as the role, because a claim about a policy
-- is not a claim about a write. The proof becomes `authenticated` holding a
-- service claim — the most privileged session that is not the owner — and
-- attempts each of the twenty. An INSERT settles itself: refused, whether
-- by a missing grant or by row level security, it raises 42501, and RLS's
-- WITH CHECK is evaluated before NOT NULL, so a `default values` insert that
-- comes back with anything else is an insert something admitted. An UPDATE or
-- a DELETE cannot settle itself and does not pretend to — a policy that
-- refuses one of those matches zero rows and returns success, which is the
-- silence this repository keeps paying for — so those attempts report the
-- grant and leave the verdict to the second claim, out loud.
--
-- Every attempt is `where false` or a bare `default values`, so no row of any
-- deployment's is read or written even where a grant exists, and each runs
-- inside a subtransaction that ends in a sentinel exception, so the claim and
-- the role are gone before the next one starts.
--
-- And it asks nothing where it cannot get an answer, saying so each time: a
-- session that cannot become `authenticated` would turn the platform's
-- absence into a verdict about these policies. A skipped proof is a proof
-- that did not run, and a reader has to be able to tell that from a green one.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  removed record;
  orphan record;
  attempted integer := 0;
  granted boolean;
begin
  -- FIRST — the post-condition, over the whole schema this template owns.
  for orphan in
    select r.tablename, r.cmd, r.policyname
      from pg_policies r
     where r.schemaname = 'public'
       and r.permissive = 'RESTRICTIVE'
       and not exists (
             select 1
               from pg_policies p
              where p.schemaname = r.schemaname
                and p.tablename = r.tablename
                and p.permissive = 'PERMISSIVE'
                and (p.cmd = r.cmd or p.cmd = 'ALL' or r.cmd = 'ALL')
                and (p.roles && r.roles
                     or 'public' = any (p.roles)
                     or 'public' = any (r.roles)))
     order by r.tablename, r.cmd
  loop
    raise exception
      'proof: % restricts % on public.% and no permissive policy opens that '
      'verb to anyone it names — the restriction stands over a write nobody '
      'may make, which is the shape this file exists to remove',
      orphan.policyname, orphan.cmd, orphan.tablename;
  end loop;

  for removed in
    select *
      from (values
        ('audit_findings', 'delete'),
        ('business_models', 'delete'),
        ('cell_dependencies', 'insert'),
        ('cell_dependencies', 'update'),
        ('cell_dependencies', 'delete'),
        ('cells', 'insert'),
        ('cells', 'delete'),
        ('lanes', 'insert'),
        ('lanes', 'delete'),
        ('path_steps', 'insert'),
        ('path_steps', 'update'),
        ('path_steps', 'delete'),
        ('paths', 'insert'),
        ('paths', 'delete'),
        ('phases', 'insert'),
        ('phases', 'delete'),
        ('scenarios', 'insert'),
        ('scenarios', 'delete'),
        ('steps', 'insert'),
        ('steps', 'delete')
      ) as it(tbl, verb)
     order by 1, 2
  loop
    -- The drop list above and this list have to be the same list. An entry
    -- here whose policy is still standing means one of them was edited and
    -- the other was not, and the half that was missed is the half nobody
    -- would notice.
    if exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename = removed.tbl
            and policyname = removed.tbl || '_' || removed.verb || '_service_only')
    then
      raise exception
        'proof: %_%_service_only is still standing — the statements above and '
        'the list here have drifted apart',
        removed.tbl, removed.verb;
    end if;

    -- SECOND — and this is the claim that makes the removal a no-op.
    if exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename = removed.tbl
            and permissive = 'PERMISSIVE'
            and (cmd = upper(removed.verb) or cmd = 'ALL'))
    then
      raise exception
        'proof: a permissive policy opens % on public.% here, so the '
        'restrictive half removed above was narrowing a real write and this '
        'file has just widened it — this deployment reaches that verb '
        'directly, and it needs BOTH halves of the pair: a permissive '
        '%_%_auth and a restrictive %_%_service_only beside it',
        upper(removed.verb), removed.tbl,
        removed.tbl, removed.verb, removed.tbl, removed.verb;
    end if;

    -- THIRD — the same question, asked as the role rather than of the
    -- catalogue. Skipped as a whole, out loud, where the role cannot be
    -- assumed at all.
    if to_regrole('authenticated') is null
       or not pg_has_role(current_user, 'authenticated', 'USAGE') then
      continue;
    end if;

    granted := has_table_privilege(
      'authenticated', 'public.' || quote_ident(removed.tbl), upper(removed.verb));

    begin
      perform set_config(
        'request.jwt.claims',
        '{"role":"authenticated","app_metadata":{"role":"service"}}',
        true);
      set local role authenticated;
      begin
        if removed.verb = 'insert' then
          execute format('insert into public.%I default values', removed.tbl);
          raise exception
            'proof: an INSERT into public.% was ADMITTED for a signed-in '
            'session — something opens that verb and the restriction removed '
            'above was load-bearing', removed.tbl;
        elsif removed.verb = 'delete' then
          execute format('delete from public.%I where false', removed.tbl);
        else
          -- `updated_at` because the only two tables with an UPDATE entry
          -- here, `cell_dependencies` and `path_steps`, both carry it, and a
          -- column the assignment names is a column the privilege check has
          -- to reach before `where false` empties the plan.
          execute format(
            'update public.%I set updated_at = updated_at where false',
            removed.tbl);
        end if;
      exception
        when insufficient_privilege then
          -- Refused. Which of the two refused it is in the message, and both
          -- are the answer this file needs.
          null;
      end;
      attempted := attempted + 1;
      raise exception 'restriction proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught here: it is how the claim and the role
      -- are given back. Anything else — including the two raises above —
      -- propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;

    if granted and removed.verb <> 'insert' then
      raise notice
        'restriction proof: authenticated holds % on public.% here, so the '
        'attempt could not distinguish a refusal from an empty match — a '
        'refused UPDATE or DELETE matches zero rows and returns success. '
        'What settles it for this verb is the check above: no permissive '
        'policy admits it',
        upper(removed.verb), removed.tbl;
    end if;
  end loop;

  if attempted = 0 then
    raise notice
      'restriction proof: this session cannot become authenticated, so no '
      'write was attempted as the role and only the two catalogue claims '
      'above were asked here; npm run check:seed-load asks the write surface '
      'as both people, against a seeded database';
  end if;
end
$recipe_proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000215000000_every_authoring_write_leaves_a_record.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the caller stamp, row-level security and the role grants. The log
-- itself is plain Postgres; who may read it is the host's enforcement.
alter table public.authoring_changes alter column author_id set default auth.uid();

alter table public.authoring_changes enable row level security;

-- Readable by anyone who can read the blueprint — the change list and the
-- recovery list are both part of the editor. Written only through the
-- functions below, all of which are definer.
drop policy if exists "authoring_changes_select" on public.authoring_changes;
create policy "authoring_changes_select" on public.authoring_changes
  for select using (true);

grant select on public.authoring_changes to anon, authenticated;
revoke insert, update, delete, truncate on public.authoring_changes
  from anon, authenticated;
-- Postgres grants EXECUTE to PUBLIC at CREATE time, so the revoke is
-- the operative statement of the pair and the grant names the one role meant
-- to hold it. A deployment that serves the board to readers stays read-only.
revoke execute on function
  public.record_authoring_change(text, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function
  public.record_authoring_change(text, jsonb, jsonb, text, uuid) to authenticated;
-- who may read the recovery list.
grant select on public.trash to anon, authenticated;
-- the two post-conditions that are about roles, and therefore about
-- the host rather than about the log.
do $posture$
declare
  bad int;
begin
  -- THE CLIENT'S APPEND IS NOT REACHABLE BY anon. Reachable by anon it is a
  -- write surface on a read-only deployment.
  if has_function_privilege(
       'anon',
       'public.record_authoring_change(text, jsonb, jsonb, text, uuid)',
       'execute') then
    raise exception 'anon can execute record_authoring_change';
  end if;

  -- anon AND authenticated HOLD NO DIRECT WRITE ON THE LOG. Asserting it here
  -- means the migration that introduces the table cannot be the one that
  -- breaks the posture.
  select count(*) into bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'authoring_changes'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if bad <> 0 then
    raise exception '% direct write grants survive on public.authoring_changes', bad;
  end if;
end
$posture$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000216000000_an_actor_can_be_part_of_another.sql
-- ─────────────────────────────────────────────────────────────────────────

-- UPDATE on this table is granted column by column, so a new column
-- is not editable until it is named. Everything above is plain Postgres; this
-- is the one line that is about a role, and roles are Supabase's half.

grant update (part_of_id) on public.stakeholders to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000217000000_an_actor_is_part_of_another.sql
-- ─────────────────────────────────────────────────────────────────────────

-- UPDATE is granted column by column on this table, and a renamed
-- column keeps the grant under its new name. Naming it again is belt and
-- braces on a host that replayed the grant rather than the rename.

grant update (part_of_id) on public.stakeholders to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000218000000_a_slide_chooses_from_its_images.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the pool and the choice are authored, so the role that authors
-- needs them. `slides` is granted whole-table UPDATE rather than column by
-- column, so this is a no-op restatement wherever that grant is already in
-- place; it is here so a host that reads only this file still arrives at the
-- same permissions.

grant update on public.slides to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000219000000_a_slides_prose_is_a_caption.sql
-- ─────────────────────────────────────────────────────────────────────────

-- `slides` is granted whole-table UPDATE, so a renamed column keeps
-- the grant under its new name. Naming it again is belt and braces on a host
-- that replayed the grant rather than the rename.

grant update on public.slides to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000220000000_a_slide_shows_a_set_of_its_cells_frames.sql
-- ─────────────────────────────────────────────────────────────────────────

-- anyone may read the set; a signed-in author writes it the
-- same way they write `slides`. The app replaces the set rather than
-- patching members, so INSERT and DELETE are the verbs, not UPDATE.

alter table public.slide_images enable row level security;

create policy slide_images_select_anon on public.slide_images
  for select to anon using (true);
create policy slide_images_select_auth on public.slide_images
  for select to authenticated using (true);
create policy slide_images_insert_auth on public.slide_images
  for insert to authenticated with check (true);
create policy slide_images_delete_auth on public.slide_images
  for delete to authenticated using (true);

grant select on public.slide_images to anon, authenticated;
grant insert, delete on public.slide_images to authenticated;
grant update on public.slides to authenticated;

-- An owner DO block never meets these policies. The probe below is the
-- same question the editor asks: a signed-in session, with the author
-- JWT claims the write-surface check uses, inserting one member.

do $rls$
declare
  svc uuid;
  ph uuid;
  sc uuid;
  pa uuid;
  ln uuid;
  st uuid;
  cell uuid;
  slc uuid;
  sld uuid;
  n integer;
begin
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice 'slide_images rls probe skipped: no authenticated role';
    return;
  end if;

  insert into public.services (name) values ('slide-images-rls') returning id into svc;
  insert into public.phases (service_id, name, position) values (svc, 'p', 0) returning id into ph;
  insert into public.scenarios (phase_id, name, position) values (ph, 's', 0) returning id into sc;
  insert into public.paths (scenario_id, name, kind) values (sc, 'happy', 'happy') returning id into pa;
  insert into public.lanes (path_id, name, position) values (pa, 'lane', 0) returning id into ln;
  insert into public.steps (scenario_id, name) values (sc, 'step') returning id into st;
  insert into public.path_steps (path_id, step_id, position) values (pa, st, 0);
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'one', 0) returning id into cell;
  insert into public.slices (service_id, kind, title)
  values (svc, 'custom', 'rls') returning id into slc;
  insert into public.slides (slice_id, position, cell_ids, cell_keys, shows_all_images)
  values (slc, 0, array[cell], array['k'], false)
  returning id into sld;

  begin
    perform set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"service"}}',
      true);
    set local role authenticated;
    begin
      insert into public.slide_images (slide_id, position, cell_id, image_url)
      values (sld, 0, cell, null);
      get diagnostics n = row_count;
    exception
      when insufficient_privilege then n := 0;
    end;
    if n is distinct from 1 then
      raise exception
        'a signed-in author could not insert a slide_images member (row_count=%)',
        n;
    end if;
    raise exception 'slide-images rls' using errcode = 'UB001';
  exception
    when sqlstate 'UB001' then null;
  end;

  delete from public.services where id = svc;
end
$rls$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000224000000_a_slide_upload_lives_in_a_folder_of_its_own.sql
-- ─────────────────────────────────────────────────────────────────────────

-- buckets and their policies are Supabase's. The whole file, header
-- included: the portable core has no Storage, and a backend without one keeps
-- slide uploads wherever it keeps files and writes their URLs into
-- `slide_images.image_url`.

-- A slide's uploads live in a folder of their own, and the bucket admits them.
--
-- `21000222000000` made a slide's images a SET, and one kind of member is a
-- file somebody uploaded. That half of the feature lives in Storage rather
-- than in `public`, and the object key changed shape when the set did:
--
--   before   slices/<slice id>/<slide id>.png          one image per slide
--   after    slices/<slice id>/<slide id>/<id>.png     a folder per slide
--
-- The old key was an upsert target. A slide had one image, so replacing it
-- overwrote the object at its own name. A set does not overwrite: every
-- upload is its own object under its own name, so a new image is a new URL
-- and a slide can hold several at once — and the folder is what makes
-- "remove this slide's uploads" a thing that can be asked at all, which
-- deleting a slice needs and no per-object name gives you.
--
-- ── This file exists because the bucket refuses the new key ───────────────
--
-- `slice_illustrations_insert` matches the object name against a pattern with
-- exactly two path segments after `slices/`:
-- `^slices/<36>/(<36>|frame-[0-9]+|character-ref)\.(png|jpg|webp)$`
-- (`20260818000000`, widening `20260729120000`). The key `illustrationPath`
-- builds has three. So every slide upload was refused by row-level security
-- AFTER the whole file had gone over the wire — a 403 at the end of an
-- upload, from a policy no screen can explain — and a stock install of this
-- template could not accept a slide image at all unless somebody had set the
-- policy by hand.
--
-- The old spellings stay accepted. Objects uploaded under them are still in
-- the bucket and still named by rows; a pattern that stopped matching them
-- would delete nothing and merely make those objects unwritable.
--
-- ── And the delete nobody could perform ──────────────────────────────────
--
-- There has never been a DELETE policy on this bucket. That was harmless
-- while nothing ever asked to remove an object, and stopped being harmless
-- when the app started calling `removeSlideUploadObjects` on the two paths
-- where a slide's folder becomes unreachable: a slice deleted outright, and
-- an undo that drops a slide the inverse does not restore. With no policy
-- that call matches no rows and reports success, which is the worst of the
-- three available outcomes — the objects leak, and the code says they were
-- handled. `illustrationUpload.ts` now counts the removed rows rather than
-- reading a non-error return as a yes, so the two halves fail together.
--
-- The delete is bounded by the same name pattern as the insert, so a session
-- cannot reach past the slices tree, and it takes its tier gate from the same
-- place the insert does: the restrictive `slice_illustrations_service_only`
-- companion `20260818002000` installed over every command on this bucket,
-- DELETE included. That is checked below, because if it ever goes these three
-- permissive policies become the whole rule and a signed-in reader inherits
-- them.
--
-- ── What is NOT here ─────────────────────────────────────────────────────
--
-- No sweep of the objects already in the bucket, and no orphan purge.
-- Dropping an image from a slide's set leaves its object ON PURPOSE: a
-- duplicated slice copies members verbatim and an undo restores the
-- `image_url` it captured, so an object deleted the moment its last row went
-- would break a slide nobody asked to change. `replaceSlides` leaves the
-- folders of dropped slides for the same reason — the inverse still names
-- those URLs. What this file makes possible is removing the folder of a slide
-- that cannot come back, and nothing wider.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- The shim models `storage.buckets` and `storage.objects`, so the policies
-- replay. The proof is an INVARIANT and counts no objects: the pattern
-- decides the right way about eight names, and the pattern it decided about
-- is the one the three policies actually carry, read back out of the catalog.

do $policies$
begin
  drop policy if exists "slice_illustrations_insert" on storage.objects;
  drop policy if exists "slice_illustrations_update" on storage.objects;
  drop policy if exists "slice_illustrations_delete" on storage.objects;

  create policy "slice_illustrations_insert" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}/[0-9a-f-]{36}|[0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$'
    );

  create policy "slice_illustrations_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'slice-illustrations')
    with check (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}/[0-9a-f-]{36}|[0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$'
    );

  create policy "slice_illustrations_delete" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'slice-illustrations'
      and name ~ '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}/[0-9a-f-]{36}|[0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$'
    );
exception
  when insufficient_privilege then
    raise exception
      'storage.objects is owned by another role here, so the slice-illustration '
      'policies were not moved. Slide uploads stay refused until they are added '
      'through the dashboard: the insert pattern must accept '
      'slices/<slice>/<slide>/<id>.<ext>, and a DELETE policy must exist.';
end
$policies$;

do $the_pattern$
declare
  pattern text :=
    '^slices/[0-9a-f-]{36}/([0-9a-f-]{36}/[0-9a-f-]{36}|[0-9a-f-]{36}|frame-[0-9]+|character-ref)\.(png|jpg|webp)$';
  slice text := '11111111-1111-4111-8111-111111111111';
  slide text := '22222222-2222-4222-8222-222222222222';
  object text := '33333333-3333-4333-8333-333333333333';
  name text;
  installed int;
begin
  -- The key `illustrationPath` writes today, in each extension it can pick.
  name := format('slices/%s/%s/%s.png', slice, slide, object);
  if name !~ pattern then
    raise exception 'the bucket would refuse a slide upload: %', name;
  end if;
  if format('slices/%s/%s/%s.jpg', slice, slide, object) !~ pattern then
    raise exception 'the bucket would refuse a JPEG slide upload';
  end if;
  if format('slices/%s/%s/%s.webp', slice, slide, object) !~ pattern then
    raise exception 'the bucket would refuse a WebP slide upload';
  end if;

  -- The keys already in the bucket, which must keep resolving.
  if format('slices/%s/%s.png', slice, slide) !~ pattern then
    raise exception 'the bucket stopped admitting the one-image-per-slide key';
  end if;
  if format('slices/%s/frame-3.png', slice) !~ pattern then
    raise exception 'the bucket stopped admitting a frame key';
  end if;
  if format('slices/%s/character-ref.jpg', slice) !~ pattern then
    raise exception 'the bucket stopped admitting the character reference key';
  end if;

  -- And what it must still refuse: a key outside the slices tree, a fourth
  -- segment, and an extension the bucket's mime list does not allow.
  if format('other/%s/%s.png', slice, slide) ~ pattern then
    raise exception 'the pattern admits a key outside the slices tree';
  end if;
  if format('slices/%s/%s/%s/%s.png', slice, slide, object, object) ~ pattern then
    raise exception 'the pattern admits a fourth path segment';
  end if;
  if format('slices/%s/%s/%s.svg', slice, slide, object) ~ pattern then
    raise exception 'the pattern admits an extension the bucket does not allow';
  end if;

  -- The three write policies exist, each carries the pattern proved above,
  -- and none of them names anon.
  select count(*) into installed
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('slice_illustrations_insert', 'slice_illustrations_update',
                        'slice_illustrations_delete')
     and position(pattern in coalesce(qual, '') || coalesce(with_check, '')) > 0
     and not ('anon' = any(roles) or 'public' = any(roles));
  if installed <> 3 then
    raise exception
      'expected three slice_illustrations write policies carrying this pattern '
      'and named to authenticated, found %', installed;
  end if;

  -- The tier gate is the restrictive companion, and it is what stands between
  -- a signed-in reader and this bucket. The three policies above assume it.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'slice_illustrations_service_only'
       and permissive = 'RESTRICTIVE'
       and coalesce(qual, '') like '%is_service_account()%'
       and coalesce(with_check, '') like '%is_service_account()%'
  ) then
    raise exception
      'the restrictive service gate on slice-illustrations is gone, so these '
      'policies are the whole rule and a signed-in reader may write the bucket';
  end if;
end
$the_pattern$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000225000000_a_comment_is_prose_that_ships_to_agents.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grant names the Supabase roles. The function itself is core;
-- who may call it over PostgREST is this deployment's business.

grant execute on function public.schema_comments() to anon, authenticated, service_role;

do $proof$
begin
  if not has_function_privilege('anon', 'public.schema_comments()', 'execute') then
    raise exception 'proof: anon cannot execute schema_comments()';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000226000000_a_dependency_can_be_edited_where_it_sits.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grants name the Supabase roles. The function is core; who may
-- call it is this deployment's enforcement of the contract, on the same terms
-- as every other authoring write.

revoke execute on function public.update_cell_dependency(uuid, text, uuid, text) from anon;
grant execute on function public.update_cell_dependency(uuid, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000227000000_a_featured_image_is_the_frame.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grants name the Supabase roles, on the same terms as every
-- other authoring write.

revoke execute on function public.set_cell_featured_image(uuid, text) from anon;
grant execute on function public.set_cell_featured_image(uuid, text) to authenticated;

-- the ACL the two rewrites had to preserve, and the new function's,
-- asserted where the roles exist.
do $posture$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_cell_featured_image(uuid, text)',
    'public.sync_cell_touchpoints(uuid, text[])',
    'public.set_placement_touchpoint(uuid, uuid, text)'
  ] loop
    if not has_function_privilege('authenticated', fn::regprocedure, 'execute') then
      raise exception 'authenticated cannot execute %', fn;
    end if;
    if has_function_privilege('anon', fn::regprocedure, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
  end loop;
end
$posture$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000301000000_one_write_edits_a_touchpoint_whole.sql
-- ─────────────────────────────────────────────────────────────────────────

-- who may call it, and where an uploaded icon may be put.
--
-- The same posture as `rename_touchpoint`: closed to `public` and `anon`,
-- open to `authenticated`, with the guard in the body deciding which
-- authenticated caller may actually author.
revoke execute on function public.update_touchpoint(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_touchpoint(uuid, text, text, text, text, text) to authenticated;

-- The two write policies that check a key, rewritten with one more prefix.
-- Select and delete check no key and are left as they stand.
drop policy if exists "cell_attachments_insert" on storage.objects;
drop policy if exists "cell_attachments_update" on storage.objects;

create policy "cell_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^(cells|touchpoints)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

create policy "cell_attachments_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cell-attachments' and public.is_service_account())
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^(cells|touchpoints)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

do $proof$
declare
  admitted int;
begin
  select count(*) into admitted
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('cell_attachments_insert', 'cell_attachments_update')
     and coalesce(with_check, '') like '%touchpoints%'
     and coalesce(with_check, '') like '%is_service_account()%'
     and not ('anon' = any(roles) or 'public' = any(roles));
  if admitted <> 2 then
    raise exception
      'proof: expected both cell_attachments key policies to admit touchpoints/ behind the service guard, found %', admitted;
  end if;

  if has_function_privilege('anon',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: anon can call update_touchpoint';
  end if;
end
$proof$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000302000000_a_touchpoint_link_is_https.sql
-- ─────────────────────────────────────────────────────────────────────────

-- the grants `create or replace` kept, asserted where the roles exist.
do $posture$
begin
  if not has_function_privilege('authenticated',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: authenticated lost execute on update_touchpoint';
  end if;
  if has_function_privilege('anon',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: anon can call update_touchpoint';
  end if;
end
$posture$;

-- ─────────────────────────────────────────────────────────────────────────
-- 21000303000000_a_finding_says_what_fixing_it_is_worth.sql
-- ─────────────────────────────────────────────────────────────────────────

-- an audit re-run rewrites an open finding's ratings in place, so
-- the role that records findings may update the two new columns, and only
-- those beside the ones it already could.

grant update (impact, effort) on public.audit_findings to authenticated;
