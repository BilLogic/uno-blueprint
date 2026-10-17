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
