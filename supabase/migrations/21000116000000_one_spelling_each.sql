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

-- @recipe — policies exist only where the Supabase recipe was applied, and
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

-- @core

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
