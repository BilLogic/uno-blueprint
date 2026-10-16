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
