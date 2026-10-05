-- The portable core, as the database it builds.
--
-- ⚠ GENERATED FILE — DO NOT EDIT. `pg_dump --schema-only` of a stock
-- Postgres that replayed portable-core.generated.sql. Edit the migration,
-- then run `npm run generate:portable-schema`. CI regenerates this file and
-- fails on any difference.
--
-- The series beside it is what a backend applies; this is what it holds
-- afterwards, with only the names it holds them under. Read this one.
-- ─────────────────────────────────────────────────────────────────────────

--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: entity_status; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.entity_status AS text
	CONSTRAINT entity_status_check CHECK ((VALUE = ANY (ARRAY['proposed'::text, 'planned'::text, 'built'::text, 'live'::text, 'at_risk'::text, 'deprecated'::text])));

--
-- Name: DOMAIN entity_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON DOMAIN public.entity_status IS 'How far along the thing an entity describes is. One vocabulary shared by cells and paths — a second list would drift from the first within a month.';

--
-- Name: add_lane(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_lane(scenario_id uuid, name text, lane_role text DEFAULT NULL::text, at_position integer DEFAULT NULL::integer) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

  select coalesce(max(l.position) + 1, 0) into target
  from public.lanes l
  join public.paths p on p.id = l.path_id
  where p.scenario_id = add_lane.scenario_id;
  target := coalesce(at_position, target);

  update public.lanes l
    set position = l.position + 1
    from public.paths p
    where p.id = l.path_id
      and p.scenario_id = add_lane.scenario_id
      and l.position >= target;

  with inserted as (
    insert into public.lanes (path_id, name, lane_role, position, origin)
    select p.id, add_lane.name, nullif(add_lane.lane_role, ''), target, 'app'
    from public.paths p
    where p.scenario_id = add_lane.scenario_id
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into created from inserted;

  return created;
end;
$$;

--
-- Name: add_step(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_step(path_id uuid, name text, at_position integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  scenario_id uuid;
  new_step_id uuid;
  target int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select scenario_id into scenario_id from public.paths where id = add_step.path_id;
  if scenario_id is null then
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
  values (scenario_id, coalesce(nullif(trim(name), ''), 'Untitled step'), 'app')
  returning id into new_step_id;

  insert into public.path_steps (path_id, step_id, position)
  values (add_step.path_id, new_step_id, target);

  return new_step_id;
end;
$$;

--
-- Name: authoring_changes_are_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authoring_changes_are_append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
begin
  raise exception 'public.authoring_changes is append-only; % is not permitted on it', tg_op
    using errcode = '42501';
end;
$$;

--
-- Name: cell_natural_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cell_natural_key(cell_id uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $_$
  select c.cell_key from public.cells c where c.id = $1;
$_$;

--
-- Name: cells_validate_path_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cells_validate_path_match() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  lane_path uuid;
  step_on_path boolean;
begin
  select path_id into lane_path from public.lanes where id = new.lane_id;

  select exists (
    select 1
    from public.path_steps ps
    where ps.path_id = new.path_id
      and ps.step_id = new.step_id
  ) into step_on_path;

  if lane_path is null then
    raise exception 'cells: lane_id does not exist';
  end if;

  if lane_path <> new.path_id then
    raise exception 'cells.path_id must match lanes.path_id';
  end if;

  if not step_on_path then
    raise exception 'cells.step_id must be linked to cells.path_id in path_steps';
  end if;

  return new;
end;
$$;

--
-- Name: clear_cell_dependency(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_cell_dependency(dependency_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  delete from public.cell_dependencies where id = dependency_id;
end;
$$;

--
-- Name: create_path(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_path(scenario_id uuid, name text, kind text DEFAULT 'alternative'::text, lane_source_path_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
    (select id from public.paths where scenario_id = scenario_id order by created_at limit 1)
  );

  insert into public.paths (scenario_id, name, kind, origin)
  values (scenario_id, name, kind, 'app')
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

--
-- Name: create_phase(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_phase(service_id uuid, name text, summary text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
    select 1 from public.services sl where sl.id = service_id
  ) then
    raise exception 'Unknown service';
  end if;

  -- Names are how a phase is read in the sidebar and in every cell key, so
  -- two phases sharing one is a genuine ambiguity rather than a cosmetic
  -- clash: `mint_cell_key` would produce the same key for cells in both.
  if exists (
    select 1 from public.phases p
    where p.service_id = service_id
      and lower(trim(p.name)) = lower(trim(create_phase.name))
  ) then
    raise exception 'This service already has a phase called %', trim(name);
  end if;

  select coalesce(max(p.position), -1) + 1 into next_order
  from public.phases p where p.service_id = service_id;

  insert into public.phases (
    service_id, name, summary, position, origin
  )
  values (
    service_id, trim(create_phase.name),
    nullif(trim(create_phase.summary), ''), next_order, 'app'
  )
  returning id into new_phase_id;

  return new_phase_id;
end;
$$;

--
-- Name: create_scenario(uuid, text, text, uuid, jsonb, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_scenario(phase_id uuid, name text, layout text DEFAULT 'stacked'::text, lane_source_path_id uuid DEFAULT NULL::uuid, lane_set jsonb DEFAULT '[]'::jsonb, step_count integer DEFAULT 5, path_name text DEFAULT 'Happy Path'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: delete_cell(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_cell(cell_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('delete_cell', 'cell', coalesce(public.cell_natural_key(cell_id), 'cell'), payload,
          public.slices_referencing(array[cell_id]))
  returning id into archive_id;

  delete from public.cells where id = cell_id;
  return archive_id;
end;
$$;

--
-- Name: delete_path(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_path(path_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
                     join public.cells c on c.id = t.source_cell_id
                     where c.path_id = p.id)
  ) into payload
  from public.paths p where p.id = path_id;

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('delete_path', 'path', impact ->> 'label', payload, impact -> 'affected_slices')
  returning id into archive_id;

  delete from public.paths where id = path_id;
  return archive_id;
end;
$$;

--
-- Name: delete_scenario(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_scenario(scenario_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
                     join public.cells c on c.id = t.source_cell_id
                     join public.paths p on p.id = c.path_id
                     where p.scenario_id = sc.id)
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
$$;

--
-- Name: deletion_impact(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deletion_impact(kind text, target_id uuid, scope_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: duplicate_path(uuid, text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.duplicate_path(source_path_id uuid, name text, kind text DEFAULT 'variant'::text, copy_cells boolean DEFAULT true, copy_dependencies boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  v_scenario_id uuid;
  new_path_id uuid;
  -- old lane id → new lane id, as jsonb rather than a temp table: this runs
  -- inside one PostgREST statement and a temp table would outlive it.
  lane_map jsonb := '{}'::jsonb;
  src_lane record;
  new_lane_id uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  select p.scenario_id into v_scenario_id
  from public.paths p
  where p.id = duplicate_path.source_path_id;

  if v_scenario_id is null then
    raise exception 'Unknown path';
  end if;

  insert into public.paths
    (scenario_id, name, kind, summary, note, origin)
  select v_scenario_id, duplicate_path.name, duplicate_path.kind,
         p.summary, p.note, 'app'
  from public.paths p
  where p.id = duplicate_path.source_path_id
  returning id into new_path_id;

  -- Lanes first, then path_steps, then cells: the order the
  -- `cells_validate_path_match` trigger requires.
  for src_lane in
    select l.id, l.name, l.lane_role, l.position,
           l.owner_team, l.kpis, l.tools
    from public.lanes l
    where l.path_id = duplicate_path.source_path_id
    order by l.position
  loop
    insert into public.lanes
      (path_id, name, lane_role, position, owner_team, kpis, tools, origin)
    values (new_path_id, src_lane.name, src_lane.lane_role,
            src_lane.position, src_lane.owner_team, src_lane.kpis,
            src_lane.tools, 'app')
    returning id into new_lane_id;
    lane_map := lane_map || jsonb_build_object(src_lane.id::text, new_lane_id);
  end loop;

  -- Columns are scenario-scoped, so the copy points at the very same `steps`
  -- rows in the same order — exactly as the source does.
  insert into public.path_steps (path_id, step_id, position)
  select new_path_id, ps.step_id, ps.position
  from public.path_steps ps
  where ps.path_id = duplicate_path.source_path_id;

  if copy_cells then
    insert into public.cells
      (path_id, lane_id, step_id, position, content, summary,
       frame, function, form, value_props, owner, perceived_owner,
       origin)
    select new_path_id,
           (lane_map ->> c.lane_id::text)::uuid,
           c.step_id, c.position, c.content, c.summary,
           c.frame, c.function, c.form, c.value_props,
           c.owner, c.perceived_owner, 'app'
    from public.cells c
    where c.path_id = duplicate_path.source_path_id;

    -- The placements and the resources the copied cells carry. Matched to
    -- their copies on (path, lane, step, slot), which is the join the arrows
    -- below use and stops a multi-cell slot from fanning one row out into a
    -- copy per sibling.
    insert into public.cell_touchpoints
      (cell_id, touchpoint_id, name, position, summary, role, origin)
    select nc.id, ct.touchpoint_id, ct.name, ct.position, ct.summary, ct.role, 'app'
    from public.cell_touchpoints ct
    join public.cells c on c.id = ct.cell_id and c.path_id = duplicate_path.source_path_id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = c.step_id
     and nc.position is not distinct from c.position;

    insert into public.resources
      (cell_id, kind, name, url, position, featured, origin)
    select nc.id, r.kind, r.name, r.url, r.position, r.featured, 'app'
    from public.resources r
    join public.cells c on c.id = r.cell_id and r.cell_touchpoint_id is null and c.path_id = duplicate_path.source_path_id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = c.step_id
     and nc.position is not distinct from c.position;

    -- Placement-attached resources, keyed through the placement's name on the
    -- copied cell. Nothing writes one today; carrying them anyway is what
    -- stops the first one that is written from being lost by a copy.
    insert into public.resources
      (cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
    select nc.id, nct.id, r.kind, r.name, r.url, r.position, r.featured, 'app'
    from public.resources r
    join public.cell_touchpoints ct on ct.id = r.cell_touchpoint_id
    join public.cells c on c.id = ct.cell_id and c.path_id = duplicate_path.source_path_id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = c.step_id
     and nc.position is not distinct from c.position
    join public.cell_touchpoints nct
      on nct.cell_id = nc.id and nct.touchpoint_id is not distinct from ct.touchpoint_id and nct.name is not distinct from ct.name;

    if copy_dependencies then
      -- The join is (path, lane, step, slot). The slot term is what stops a
      -- multi-cell slot from fanning one arrow out into a copy per sibling.
      insert into public.cell_dependencies
        (source_cell_id, target_cell_id, kind, name, note)
      select ns.id, nt.id, t.kind, t.name, t.note
      from public.cell_dependencies t
      join public.cells os
        on os.id = t.source_cell_id
       and os.path_id = duplicate_path.source_path_id
      join public.cells ot
        on ot.id = t.target_cell_id
       and ot.path_id = duplicate_path.source_path_id
      join public.cells ns
        on ns.path_id = new_path_id
       and ns.lane_id = (lane_map ->> os.lane_id::text)::uuid
       and ns.step_id = os.step_id
       and ns.position is not distinct from os.position
      join public.cells nt
        on nt.path_id = new_path_id
       and nt.lane_id = (lane_map ->> ot.lane_id::text)::uuid
       and nt.step_id = ot.step_id
       and nt.position is not distinct from ot.position
      on conflict do nothing;
    end if;
  end if;

  return new_path_id;
end;
$$;

--
-- Name: duplicate_scenario(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.duplicate_scenario(source_scenario_id uuid, name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  source_phase_id uuid;
  new_scenario_id uuid;
  next_order int;
  -- old id → new id, as jsonb rather than temp tables: these functions run
  -- inside one PostgREST statement and a temp table would outlive it.
  step_map jsonb := '{}'::jsonb;
  lane_map jsonb := '{}'::jsonb;
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
  from public.scenarios sc
  where sc.id = source_scenario_id;

  if source_phase_id is null then
    raise exception 'Unknown blueprint';
  end if;

  -- The copy lands at the end of its phase. Same rule as create_scenario:
  -- inserting mid-sequence is a reorder, and reordering is a different
  -- operation.
  select coalesce(max(sc.position), -1) + 1 into next_order
  from public.scenarios sc
  where sc.phase_id = source_phase_id;

  insert into public.scenarios
    (phase_id, name, summary, position, layout, origin)
  select source_phase_id, duplicate_scenario.name, sc.summary,
         next_order, sc.layout, 'app'
  from public.scenarios sc
  where sc.id = source_scenario_id
  returning id into new_scenario_id;

  -- Columns first: they belong to the scenario, not to a path, so they are
  -- copied once and every path below points at this one new set.
  for src_step in
    select s.id, s.name
    from public.steps s
    where s.scenario_id = source_scenario_id
    order by s.created_at
  loop
    insert into public.steps (scenario_id, name, origin)
    values (new_scenario_id, src_step.name, 'app')
    returning id into new_step_id;
    step_map := step_map || jsonb_build_object(src_step.id::text, new_step_id);
  end loop;

  -- Then each path, in the order the `cells_validate_path_match` trigger
  -- requires: lanes → path_steps → cells.
  for src_path in
    select p.id, p.name, p.kind, p.summary, p.note
    from public.paths p
    where p.scenario_id = source_scenario_id
    order by p.created_at
  loop
    insert into public.paths
      (scenario_id, name, kind, summary, note, origin)
    values (new_scenario_id, src_path.name, src_path.kind,
            src_path.summary, src_path.note, 'app')
    returning id into new_path_id;
    path_map := path_map || jsonb_build_object(src_path.id::text, new_path_id);

    for src_lane in
      select l.id, l.name, l.lane_role, l.position,
             l.owner_team, l.kpis, l.tools
      from public.lanes l
      where l.path_id = src_path.id
      order by l.position
    loop
      insert into public.lanes
        (path_id, name, lane_role, position, owner_team, kpis, tools, origin)
      values (new_path_id, src_lane.name, src_lane.lane_role,
              src_lane.position, src_lane.owner_team, src_lane.kpis,
              src_lane.tools, 'app')
      returning id into new_lane_id;
      lane_map := lane_map || jsonb_build_object(src_lane.id::text, new_lane_id);
    end loop;

    insert into public.path_steps (path_id, step_id, position)
    select new_path_id, (step_map ->> ps.step_id::text)::uuid, ps.position
    from public.path_steps ps
    where ps.path_id = src_path.id;

    insert into public.cells
      (path_id, lane_id, step_id, position, content, summary,
       frame, function, form, value_props, owner, perceived_owner,
       origin)
    select new_path_id,
           (lane_map ->> c.lane_id::text)::uuid,
           (step_map ->> c.step_id::text)::uuid,
           c.position, c.content, c.summary,
           c.frame, c.function, c.form, c.value_props,
           c.owner, c.perceived_owner, 'app'
    from public.cells c
    where c.path_id = src_path.id;

    -- The placements and the resources the copied cells carry. Matched to
    -- their copies on (path, lane, step, slot), which is the join the arrows
    -- below use and stops a multi-cell slot from fanning one row out into a
    -- copy per sibling.
    insert into public.cell_touchpoints
      (cell_id, touchpoint_id, name, position, summary, role, origin)
    select nc.id, ct.touchpoint_id, ct.name, ct.position, ct.summary, ct.role, 'app'
    from public.cell_touchpoints ct
    join public.cells c on c.id = ct.cell_id and c.path_id = src_path.id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = (step_map ->> c.step_id::text)::uuid
     and nc.position is not distinct from c.position;

    insert into public.resources
      (cell_id, kind, name, url, position, featured, origin)
    select nc.id, r.kind, r.name, r.url, r.position, r.featured, 'app'
    from public.resources r
    join public.cells c on c.id = r.cell_id and r.cell_touchpoint_id is null and c.path_id = src_path.id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = (step_map ->> c.step_id::text)::uuid
     and nc.position is not distinct from c.position;

    -- Placement-attached resources, keyed through the placement's name on the
    -- copied cell. Nothing writes one today; carrying them anyway is what
    -- stops the first one that is written from being lost by a copy.
    insert into public.resources
      (cell_id, cell_touchpoint_id, kind, name, url, position, featured, origin)
    select nc.id, nct.id, r.kind, r.name, r.url, r.position, r.featured, 'app'
    from public.resources r
    join public.cell_touchpoints ct on ct.id = r.cell_touchpoint_id
    join public.cells c on c.id = ct.cell_id and c.path_id = src_path.id
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = (step_map ->> c.step_id::text)::uuid
     and nc.position is not distinct from c.position
    join public.cell_touchpoints nct
      on nct.cell_id = nc.id and nct.touchpoint_id is not distinct from ct.touchpoint_id and nct.name is not distinct from ct.name;
  end loop;

  -- Arrows last, once every cell they could point at exists. Only arrows
  -- with BOTH endpoints inside the source scenario are copied: an arrow with
  -- one foot outside would render as a line leaving the blueprint it belongs
  -- to. Cross-scenario arrows are left pointing at the original, which is
  -- where they still belong.
  insert into public.cell_dependencies (source_cell_id, target_cell_id, kind, label, note)
  select ns.id, nt.id, t.kind, t.label, t.note
  from public.cell_dependencies t
  join public.cells os on os.id = t.source_cell_id
  join public.cells ot on ot.id = t.target_cell_id
  join public.cells ns
    on ns.path_id = (path_map ->> os.path_id::text)::uuid
   and ns.lane_id = (lane_map ->> os.lane_id::text)::uuid
   and ns.step_id = (step_map ->> os.step_id::text)::uuid
   and ns.position is not distinct from os.position
  join public.cells nt
    on nt.path_id = (path_map ->> ot.path_id::text)::uuid
   and nt.lane_id = (lane_map ->> ot.lane_id::text)::uuid
   and nt.step_id = (step_map ->> ot.step_id::text)::uuid
   and nt.position is not distinct from ot.position
  where path_map ? os.path_id::text
    and path_map ? ot.path_id::text
  on conflict do nothing;

  return new_scenario_id;
end;
$$;

--
-- Name: is_service_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_service_account() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$ select true $$;

--
-- Name: FUNCTION is_service_account(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_service_account() IS 'Tier seam asserted inside every write RPC. Default: true (every authenticated session edits). The optional tier recipe migration replaces this to read the JWT app_metadata role.';

--
-- Name: key_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.key_slug(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: mint_cell_key(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mint_cell_key(path_id uuid, lane_id uuid, step_id uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $_$
  select concat_ws('/',
    public.key_slug(sl.name),
    public.key_slug(sc.name),
    coalesce(public.key_slug(p.name), public.key_slug(p.kind)),
    public.key_slug(l.name),
    public.key_slug(s.name)
  )
  from public.paths p
  join public.scenarios sc on sc.id = p.scenario_id
  join public.phases ph on ph.id = sc.phase_id
  join public.services sl on sl.id = ph.service_id
  join public.lanes l on l.id = $2
  join public.steps s on s.id = $3
  where p.id = $1;
$_$;

--
-- Name: record_authoring_change(text, jsonb, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_authoring_change(fn text, args jsonb DEFAULT '{}'::jsonb, revert jsonb DEFAULT NULL::jsonb, author text DEFAULT 'human'::text, agent_session_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: FUNCTION record_authoring_change(fn text, args jsonb, revert jsonb, author text, agent_session_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_authoring_change(fn text, args jsonb, revert jsonb, author text, agent_session_id uuid) IS 'Append one authoring write to public.authoring_changes. Called by src/lib/authoringLog.ts after the write it records has already succeeded, so the log can never claim a change the database does not have.';

--
-- Name: remove_lane(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_lane(scenario_id uuid, lane_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
  join public.lanes l on l.id = c.lane_id
  join public.paths p on p.id = l.path_id
  where p.scenario_id = remove_lane.scenario_id and l.name = lane_name;
  affected := coalesce(affected, array[]::uuid[]);

  select jsonb_build_object(
    'scenario_id', remove_lane.scenario_id,
    'lane_name', lane_name,
    'lanes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.lanes l
               join public.paths p on p.id = l.path_id
               where p.scenario_id = remove_lane.scenario_id and l.name = lane_name),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.id = any(affected))
  ) into payload;

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('remove_lane', 'lane', lane_name, payload, public.slices_referencing(affected))
  returning id into archive_id;

  delete from public.lanes l
    using public.paths p
    where p.id = l.path_id
      and p.scenario_id = remove_lane.scenario_id
      and l.name = lane_name;

  return archive_id;
end;
$$;

--
-- Name: remove_lanes(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_lanes(lane_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
  if not exists (select 1 from public.lanes where id = any(lane_ids)) then
    raise exception 'Those lanes no longer exist';
  end if;

  select min(l.name) into label
  from public.lanes l where l.id = any(lane_ids);

  select coalesce(array_agg(c.id), array[]::uuid[]) into affected
  from public.cells c where c.lane_id = any(lane_ids);

  select jsonb_build_object(
    'lane_ids', to_jsonb(lane_ids),
    'lane_name', label,
    'lanes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
               from public.lanes l where l.id = any(lane_ids)),
    'cells', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
              from public.cells c where c.id = any(affected))
  ) into payload;

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('remove_lanes', 'lane', coalesce(label, 'lane'), payload,
          public.slices_referencing(affected))
  returning id into archive_id;

  delete from public.lanes where id = any(lane_ids);

  return archive_id;
end;
$$;

--
-- Name: remove_placement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_placement(p_placement_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION remove_placement(p_placement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.remove_placement(p_placement_id uuid) IS 'Deletes one placement and returns the row and its resources for restore_placement.';

--
-- Name: remove_step(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_step(path_id uuid, step_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

  insert into public.authoring_changes (fn, deleted_kind, label, payload, affected_slices)
  values ('remove_step', 'step', impact ->> 'label', payload, impact -> 'affected_slices')
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

--
-- Name: rename_content_item(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_content_item(p_content text, p_from text, p_to text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
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
$_$;

--
-- Name: FUNCTION rename_content_item(p_content text, p_from text, p_to text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rename_content_item(p_content text, p_from text, p_to text) IS 'Replace one whole item in a delimited cell content string. The match is against the trimmed item, never a substring, so renaming Zoom leaves Zoom Recording alone.';

--
-- Name: rename_owner_tag(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_owner_tag(from_name text, to_name text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: rename_path(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_path(path_id uuid, new_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
    where p.scenario_id = (
        select scenario_id from public.paths where id = path_id
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

--
-- Name: rename_phase(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_phase(phase_id uuid, new_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
    where p.service_id = (
        select service_id from public.phases where id = phase_id
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

--
-- Name: rename_scenario(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_scenario(scenario_id uuid, new_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  if coalesce(trim(new_name), '') = '' then
    raise exception 'A scenario needs a name';
  end if;

  if exists (
    select 1 from public.scenarios s
    where s.phase_id = (
        select phase_id from public.scenarios where id = scenario_id
      )
      and s.id <> scenario_id
      and lower(trim(s.name)) = lower(trim(new_name))
  ) then
    raise exception 'This phase already has a scenario called %', trim(new_name);
  end if;

  update public.scenarios set name = trim(new_name)
  where id = scenario_id;
  if not found then
    raise exception 'Unknown scenario';
  end if;
end;
$$;

--
-- Name: rename_touchpoint(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_touchpoint(p_touchpoint_id uuid, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION rename_touchpoint(p_touchpoint_id uuid, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rename_touchpoint(p_touchpoint_id uuid, p_name text) IS 'Rename a touchpoint: the registry row and the matching item in every bearing cell''s content, in one transaction. Returns the previous name and the cells rewritten, so the caller can record an inverse that restores both halves.';

--
-- Name: reorder_lanes(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_lanes(scenario_id uuid, lane_names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  for i in 1 .. array_length(lane_names, 1) loop
    update public.lanes l
      set position = i - 1
      from public.paths p
      where p.id = l.path_id
        and p.scenario_id = reorder_lanes.scenario_id
        and l.name = lane_names[i];
  end loop;
end;
$$;

--
-- Name: reorder_steps(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_steps(path_id uuid, step_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  i int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint'
      using errcode = '42501';
  end if;

  for i in 1 .. array_length(step_ids, 1) loop
    update public.path_steps
      set position = i - 1
      where path_steps.path_id = reorder_steps.path_id
        and path_steps.step_id = step_ids[i];
  end loop;
end;
$$;

--
-- Name: restore_cell_content(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_cell_content(cell_id uuid, content text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: restore_cell_dependency(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_cell_dependency(dependency_id uuid, name text, note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: restore_cell_touchpoints(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_cell_touchpoints(p_cell_id uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION restore_cell_touchpoints(p_cell_id uuid, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_cell_touchpoints(p_cell_id uuid, p_rows jsonb) IS 'The inverse of a sync: summary and role back by name, linked or name-only; resources re-created for a row that has none.';

--
-- Name: restore_featured_resources(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_featured_resources(p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION restore_featured_resources(p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_featured_resources(p_rows jsonb) IS 'The inverse of set_featured_resource: each {id, featured} written back as captured, no clearing rule.';

--
-- Name: restore_placement(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_placement(p_row jsonb, p_resources jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION restore_placement(p_row jsonb, p_resources jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_placement(p_row jsonb, p_resources jsonb) IS 'The inverse of remove_placement: the row back under its own id, resources included.';

--
-- Name: schema_comments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schema_comments() RETURNS TABLE(relation text, column_name text, comment text)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
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

--
-- Name: FUNCTION schema_comments(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.schema_comments() IS 'Every table, view and column comment in public. A comment is prose that ships to agents, so the agent-account generator renders the schema section from it rather than restating the catalog.';

--
-- Name: set_cell_dependency(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_cell_dependency(source_cell_id uuid, target_cell_id uuid, kind text DEFAULT 'leads_to'::text, name text DEFAULT NULL::text, note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: set_cell_featured_image(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_cell_featured_image(cell_id uuid, image_url text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION set_cell_featured_image(cell_id uuid, image_url text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_cell_featured_image(cell_id uuid, image_url text) IS 'Sets a cell''s featured image, which is its frame: an https address, a path on this site, or null to clear. Returns the frame as it stood, which is the inverse.';

--
-- Name: set_featured_resource(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_featured_resource(p_resource_id uuid, p_featured boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION set_featured_resource(p_resource_id uuid, p_featured boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_featured_resource(p_resource_id uuid, p_featured boolean) IS 'One row''s featured flag. Featuring an attachment clears the owner''s previous featured attachment in the same transaction and returns both before-states, which is the inverse.';

--
-- Name: set_path_steps(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_path_steps(path_id uuid, step_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
    insert into public.path_steps (path_id, step_id, position)
    values (set_path_steps.path_id, set_path_steps.step_ids[i], i - 1)
    on conflict on constraint path_steps_pkey
      do update set position = excluded.position;
  end loop;
end;
$$;

--
-- Name: set_placement_touchpoint(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_placement_touchpoint(p_placement_id uuid, p_touchpoint_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  v_row public.cell_touchpoints;
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
    -- The registry is the deployment's (ADR 0003), so an entry is in it
    -- or it is not; there is no service to scope the lookup by.
    if not exists (select 1 from public.touchpoints tp
                    where tp.id = p_touchpoint_id) then
      raise exception 'that touchpoint is not in the registry';
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

  return jsonb_build_object('touchpoint_id', v_row.touchpoint_id, 'name', v_row.name);
end
$$;

--
-- Name: FUNCTION set_placement_touchpoint(p_placement_id uuid, p_touchpoint_id uuid, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_placement_touchpoint(p_placement_id uuid, p_touchpoint_id uuid, p_name text) IS 'Names a placement''s touchpoint one way — an entry in the deployment''s registry, or a name the registry lacks — and returns the previous pair, which is the inverse.';

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: slices_referencing(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slices_referencing(cell_ids uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $_$
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
$_$;

--
-- Name: slide_images_drop_uncited_cells(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slide_images_drop_uncited_cells() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: FUNCTION slide_images_drop_uncited_cells(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.slide_images_drop_uncited_cells() IS 'When a slide''s cell_ids change, drop slide_images rows whose cell is no longer cited. Positions of remaining members are left as they are.';

--
-- Name: stakeholders_part_of_is_flat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stakeholders_part_of_is_flat() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: FUNCTION stakeholders_part_of_is_flat(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stakeholders_part_of_is_flat() IS 'Holds the cast list to one level of nesting. Both directions, because either edit breaks it: taking a parent that has one, or taking a parent while being one.';

--
-- Name: sync_cell_resources(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_cell_resources(p_cell_id uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION sync_cell_resources(p_cell_id uuid, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_cell_resources(p_cell_id uuid, p_rows jsonb) IS 'The cell''s own list, reconciled in order: delete the rows not named, update the named ones in place (name, url, position — never kind or featured), insert the rest. Refuses another cell''s id and a placement''s.';

--
-- Name: sync_cell_touchpoints(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_cell_touchpoints(p_cell_id uuid, p_names text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  v_lane_role  text;
  v_bearing    boolean;
  v_removed    jsonb;
  v_wanted     jsonb;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  select ln.lane_role
    into v_lane_role
    from public.cells c
    join public.lanes ln on ln.id = c.lane_id
    join public.paths p on p.id = c.path_id
    join public.scenarios s on s.id = p.scenario_id
    join public.phases ph on ph.id = s.phase_id
   where c.id = p_cell_id;

  if not found then
    raise exception 'cell % is not attached to a service', p_cell_id;
  end if;

  -- Content on an actor lane is a sentence about what somebody did; syncing
  -- it would file that sentence in the registry as a tool.
  select v_lane_role in ('frontstage_touchpoints', 'backstage_touchpoints')
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

  insert into public.touchpoints (name, origin)
  select w.name, 'app'
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
  on conflict (name) do nothing;

  -- A name typed back links the name-only row that was keeping its
  -- writing, rather than inserting a second row beside it.
  update public.cell_touchpoints ct
     set touchpoint_id = tp.id,
         name          = null,
         updated_at    = now()
    from jsonb_to_recordset(v_wanted) as w(name text, position int)
    join public.touchpoints tp
      on tp.name = w.name
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

  -- A placement it inserts on a touchpoint with a logo fills an empty
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
     and nullif(btrim(c.frame), '') is null;

  return jsonb_build_object('skipped', false, 'removed', v_removed);
end
$$;

--
-- Name: FUNCTION sync_cell_touchpoints(p_cell_id uuid, p_names text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_cell_touchpoints(p_cell_id uuid, p_names text[]) IS 'Brings a cell''s placements into line with its text. A new name mints a registry row for the deployment; a name typed back links the name-only row; a removed placement with anything on it becomes name-only, one with nothing is deleted. Returns what it removed, for restore_cell_touchpoints.';

--
-- Name: sync_placement_resources(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_placement_resources(p_placement_id uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: FUNCTION sync_placement_resources(p_placement_id uuid, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_placement_resources(p_placement_id uuid, p_rows jsonb) IS 'The touchpoint''s list at one cell, replaced in order: delete the rows not named, update the named ones (name, url, position — never kind or featured), insert the rest. Refuses another placement''s id and a placement that is gone.';

--
-- Name: update_cell_dependency(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_cell_dependency(dependency_id uuid, kind text, target_cell_id uuid, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

--
-- Name: update_scenario_layout(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_scenario_layout(scenario_id uuid, layout text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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

--
-- Name: FUNCTION update_scenario_layout(scenario_id uuid, layout text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_scenario_layout(scenario_id uuid, layout text) IS 'The header toggle''s write: how this scenario''s board is drawn, stacked or merged. Its inverse is itself with the previous value.';

--
-- Name: update_touchpoint(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_touchpoint(p_touchpoint_id uuid, p_name text, p_kind text, p_summary text, p_url text, p_icon_url text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_kind     text := btrim(coalesce(p_kind, ''));
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

  -- The name first, through the one function that knows how to move it. If it
  -- raises, nothing below runs and nothing above has been written.
  if v_previous.name <> v_name then
    v_renamed := public.rename_touchpoint(p_touchpoint_id, v_name);
  end if;

  update public.touchpoints
     set kind       = v_kind,
         summary    = nullif(btrim(coalesce(p_summary, '')), ''),
         url        = nullif(btrim(coalesce(p_url, '')), ''),
         icon_url   = nullif(btrim(coalesce(p_icon_url, '')), ''),
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
$$;

--
-- Name: FUNCTION update_touchpoint(p_touchpoint_id uuid, p_name text, p_kind text, p_summary text, p_url text, p_icon_url text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_touchpoint(p_touchpoint_id uuid, p_name text, p_kind text, p_summary text, p_url text, p_icon_url text) IS 'Edit a touchpoint''s registry entry whole — name, kind, summary, url and icon_url — in one transaction. A changed name goes through rename_touchpoint, so every bearing cell''s content moves with it. Blank prose is stored as null. Returns the previous values, which are the arguments that undo the call.';

--
-- Name: upsert_cell(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_cell(path_id uuid, lane_id uuid, step_id uuid, content text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
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
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    seq bigint NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_messages_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text, 'status'::text])))
);

--
-- Name: TABLE agent_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_messages IS 'Transcript events of an agent session, ordered by seq. Payload mirrors the app''s TranscriptEvent.';

--
-- Name: agent_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_sessions (
    id uuid NOT NULL,
    title text DEFAULT 'New session'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE agent_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_sessions IS 'One in-app agent conversation (the agent panel''s session list). Owned by created_by; RLS keeps transcripts per-user.';

--
-- Name: audit_findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    run_id uuid NOT NULL,
    source text NOT NULL,
    check_key text NOT NULL,
    severity text NOT NULL,
    cell_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    cell_keys text[] DEFAULT '{}'::text[] NOT NULL,
    summary text,
    fingerprint text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_findings_keys_match_ids CHECK ((cardinality(cell_ids) = cardinality(cell_keys))),
    CONSTRAINT audit_findings_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warn'::text, 'critical'::text]))),
    CONSTRAINT audit_findings_source_check CHECK ((source = ANY (ARRAY['audit'::text, 'whatif'::text, 'import-sweep'::text]))),
    CONSTRAINT audit_findings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])))
);

--
-- Name: TABLE audit_findings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_findings IS 'Audit / whatif / import-sweep outputs. Never hand-created; humans may only change status.';

--
-- Name: COLUMN audit_findings.run_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_findings.run_id IS 'Audit-run identity. Intentionally FK-less — no runs table by design.';

--
-- Name: COLUMN audit_findings.check_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_findings.check_key IS 'Which check raised this. A key, not a sentence: it is matched against, not read.';

--
-- Name: COLUMN audit_findings.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_findings.summary IS 'The finding''s own sentence — what is wrong. A summary rather than a note: it is the point of the row, not an aside beside it.';

--
-- Name: COLUMN audit_findings.fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_findings.fingerprint IS 'check_key + sorted cell_keys hash. Dedupe/reopen identity across runs.';

--
-- Name: authoring_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authoring_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    author text DEFAULT 'human'::text NOT NULL,
    author_id uuid,
    agent_session_id uuid,
    fn text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    revert jsonb,
    deleted_kind text,
    label text,
    payload jsonb,
    affected_slices jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT authoring_changes_affected_slices_check CHECK ((jsonb_typeof(affected_slices) = 'array'::text)),
    CONSTRAINT authoring_changes_agent_session_check CHECK (((author = 'agent'::text) = (agent_session_id IS NOT NULL))),
    CONSTRAINT authoring_changes_args_check CHECK ((jsonb_typeof(args) = 'object'::text)),
    CONSTRAINT authoring_changes_author_check CHECK ((author = ANY (ARRAY['human'::text, 'agent'::text]))),
    CONSTRAINT authoring_changes_deleted_kind_check CHECK ((deleted_kind = ANY (ARRAY['scenario'::text, 'path'::text, 'lane'::text, 'step'::text, 'cell'::text]))),
    CONSTRAINT authoring_changes_fn_check CHECK ((btrim(fn) <> ''::text)),
    CONSTRAINT authoring_changes_payload_check CHECK (((deleted_kind IS NULL) = (payload IS NULL))),
    CONSTRAINT authoring_changes_revert_check CHECK (((revert IS NULL) OR (jsonb_typeof(revert) = 'object'::text)))
);

--
-- Name: TABLE authoring_changes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authoring_changes IS 'Append-only record of every authoring write. Audit-only: the in-memory stack in src/lib/authoringSession.ts is still the undo affordance, and nothing replays `revert` from here. A row with `deleted_kind` set is a deletion and carries the rows it destroyed; `public.trash` is the view over exactly those.';

--
-- Name: COLUMN authoring_changes.agent_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authoring_changes.agent_session_id IS 'The agent conversation this write belongs to. No foreign key on purpose: the record has to outlive the session it names.';

--
-- Name: COLUMN authoring_changes.fn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authoring_changes.fn IS 'The operation: an authoring RPC name, or one of the direct-table mutation names the client logs under. Matches the WriteFn union in src/lib/authoringSession.ts.';

--
-- Name: COLUMN authoring_changes.args; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authoring_changes.args IS 'Exactly what was sent. Ids, not names — a name is resolved at render because a name is a thing that changes.';

--
-- Name: COLUMN authoring_changes.revert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authoring_changes.revert IS 'The captured inverse, {fn, args}, where one exists. Recorded so a row can say what would undo it. Nothing replays it — see the header.';

--
-- Name: business_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_models (
    service_id uuid NOT NULL,
    funding text,
    pricing text,
    delivery_cost text,
    revenue_model text,
    partners text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

--
-- Name: TABLE business_models; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_models IS 'One business-model record per service. The three validation questions live as evidence rows keyed understand|value|usability. Restricted SELECT.';

--
-- Name: COLUMN business_models.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_models.created_by IS 'The caller at insert; null for service-key writes.';

--
-- Name: cell_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_cell_id uuid NOT NULL,
    target_cell_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'leads_to'::text NOT NULL,
    name text,
    note text,
    CONSTRAINT cell_dependencies_kind_check CHECK ((kind = ANY (ARRAY['leads_to'::text, 'enables'::text]))),
    CONSTRAINT cell_dependencies_no_self_reference CHECK ((source_cell_id <> target_cell_id))
);

--
-- Name: TABLE cell_dependencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cell_dependencies IS 'Dependency from one cell to another. kind: leads_to (makes it happen) | enables (makes it possible). Both read source-first and upstream-first.';

--
-- Name: COLUMN cell_dependencies.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_dependencies.kind IS 'leads_to = makes it happen (draws an arrow) | enables = makes it possible (panel only). Both read source-first.';

--
-- Name: COLUMN cell_dependencies.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_dependencies.name IS 'What this edge is called on the canvas. A name, not a label: it is what a reader navigates by.';

--
-- Name: COLUMN cell_dependencies.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_dependencies.note IS 'The why-line shown in the cell panel dependencies tab.';

--
-- Name: cell_touchpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_touchpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cell_id uuid NOT NULL,
    name text,
    "position" integer NOT NULL,
    summary text,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role text,
    touchpoint_id uuid,
    CONSTRAINT cell_touchpoints_name_not_blank CHECK (((name IS NULL) OR (btrim(name) <> ''::text))),
    CONSTRAINT cell_touchpoints_one_identity CHECK (((touchpoint_id IS NULL) <> (name IS NULL))),
    CONSTRAINT cell_touchpoints_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text]))),
    CONSTRAINT cell_touchpoints_role_check CHECK ((role = ANY (ARRAY['core'::text, 'peripheral'::text])))
);

--
-- Name: TABLE cell_touchpoints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cell_touchpoints IS 'One touchpoint used at one cell: its own summary and role at this moment. Named by touchpoint_id into the registry, or by name alone when the registry lacks it. What it points at is in resources.';

--
-- Name: COLUMN cell_touchpoints.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_touchpoints.name IS 'The touchpoint''s name when the registry lacks it. Exactly one of name and touchpoint_id is set; linking to the registry clears it.';

--
-- Name: COLUMN cell_touchpoints.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_touchpoints.role IS 'core = the moment happens through this touchpoint; peripheral = present at it but not what it turns on. Null = nobody has judged this placement, which is the common state and renders nothing.';

--
-- Name: COLUMN cell_touchpoints.touchpoint_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cell_touchpoints.touchpoint_id IS 'The registry entry this placement names, or null for a name-only placement.';

--
-- Name: cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path_id uuid NOT NULL,
    lane_id uuid NOT NULL,
    step_id uuid NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    frame text,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    function text,
    form text,
    value_props jsonb DEFAULT '[]'::jsonb NOT NULL,
    owner text,
    perceived_owner text,
    origin text DEFAULT 'import'::text NOT NULL,
    cell_key text,
    "position" integer DEFAULT 0 NOT NULL,
    status public.entity_status DEFAULT 'live'::text NOT NULL,
    CONSTRAINT cells_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text]))),
    CONSTRAINT cells_value_props_is_array CHECK ((jsonb_typeof(value_props) = 'array'::text))
);

--
-- Name: TABLE cells; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cells IS 'Content at lane × step intersection';

--
-- Name: COLUMN cells.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.content IS 'Cell Label — primary blueprint text entered in the grid';

--
-- Name: COLUMN cells.frame; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.frame IS 'The frame: one image on this cell. A step''s frames across the lanes are its strip.';

--
-- Name: COLUMN cells.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.summary IS 'Optional longer cell summary (detail panel, not grid label)';

--
-- Name: COLUMN cells.function; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.function IS 'Spec: role/responsibility/requirements of this cell (what it must do).';

--
-- Name: COLUMN cells.form; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.form IS 'Spec: communication/look/feel/sound (what it must convey).';

--
-- Name: COLUMN cells.value_props; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.value_props IS 'Array of {for, value} — value generated per beneficiary (user, business, actor).';

--
-- Name: COLUMN cells.owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.owner IS 'Actual owning team/party for this cell.';

--
-- Name: COLUMN cells.perceived_owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.perceived_owner IS 'Who the customer believes owns this moment (mismatch = deception risk).';

--
-- Name: COLUMN cells.cell_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.cell_key IS 'Authored key: service/scenario/path/lane/step. Written by the import pipeline for origin=import, minted by upsert_cell for origin=app. Survives re-import; slides.cell_keys matches against it.';

--
-- Name: COLUMN cells."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells."position" IS 'Ordering within one (lane, step) slot. 0 for single-cell slots; tech-lane touchpoints occupy 0..n.';

--
-- Name: COLUMN cells.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cells.status IS 'How far along the thing this cell describes is. Defaults to live — a current-state blueprint documents what is in use.';

--
-- Name: evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    cell_id uuid,
    cell_key text,
    proposition_question_key text,
    kind text NOT NULL,
    title text NOT NULL,
    note text,
    observed_at date,
    added_by text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT evidence_cell_key_paired CHECK (((cell_id IS NULL) = (cell_key IS NULL))),
    CONSTRAINT evidence_exactly_one_target CHECK ((num_nonnulls(cell_id, proposition_question_key) = 1)),
    CONSTRAINT evidence_kind_check CHECK ((kind = ANY (ARRAY['interview'::text, 'survey'::text, 'analytics'::text, 'doc'::text, 'meeting'::text, 'decision'::text, 'observation'::text, 'other'::text]))),
    CONSTRAINT evidence_question_key_check CHECK (((proposition_question_key IS NULL) OR (proposition_question_key = ANY (ARRAY['understand'::text, 'value'::text, 'usability'::text]))))
);

--
-- Name: TABLE evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.evidence IS 'Provenance rows for cells and proposition questions. A cell with zero rows is an ASSUMPTION (derived, never stored). Restricted SELECT: a note may hold interview content.';

--
-- Name: COLUMN evidence.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evidence.note IS 'The one thing worth keeping about this source, in the author''s own words: a quotation, an observation, or a link. A URL written here renders as a link wherever the source is displayed.';

--
-- Name: COLUMN evidence.observed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evidence.observed_at IS 'Date-only by design (timestamps could re-identify participants).';

--
-- Name: COLUMN evidence.added_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evidence.added_by IS 'Agent name or participant-coded author. Never the interviewee.';

--
-- Name: evidence_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.evidence_counts AS
 SELECT cell_id,
    (count(*))::integer AS n
   FROM public.evidence
  WHERE (cell_id IS NOT NULL)
  GROUP BY cell_id;

--
-- Name: VIEW evidence_counts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.evidence_counts IS 'cell_id -> evidence row count. Public: powers the assumption lens without exposing evidence content.';

--
-- Name: lanes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lanes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path_id uuid NOT NULL,
    name text NOT NULL,
    lane_role text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_team text,
    kpis jsonb DEFAULT '[]'::jsonb NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    origin text DEFAULT 'import'::text NOT NULL,
    stakeholder_id uuid,
    CONSTRAINT lanes_kpis_is_array CHECK ((jsonb_typeof(kpis) = 'array'::text)),
    CONSTRAINT lanes_lane_role_check CHECK (((lane_role IS NULL) OR (lane_role = ANY (ARRAY['customer_actions'::text, 'frontstage_actions'::text, 'backstage_actions'::text, 'partner_actions'::text, 'frontstage_touchpoints'::text, 'backstage_touchpoints'::text, 'support_actions'::text, 'storyboard'::text])))),
    CONSTRAINT lanes_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text]))),
    CONSTRAINT lanes_tools_is_array CHECK ((jsonb_typeof(tools) = 'array'::text))
);

--
-- Name: TABLE lanes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lanes IS 'Blueprint row (swimlane) within a path';

--
-- Name: COLUMN lanes.lane_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lanes.lane_role IS 'Semantic role key that drives rendering (touchpoint cells, storyboard rows, divider-line anchoring); the display name stays in lanes.name and is free-form in any language. Canonical values: customer_actions, frontstage_actions, backstage_actions, partner_actions, frontstage_touchpoints, backstage_touchpoints, support_actions, storyboard. Null = generic swimlane (e.g. actor lanes), and is permitted on purpose. Constrained by lanes_lane_role_check — a custom role is not allowed, because an unconstrained column is how a lane goes unclassified.';

--
-- Name: COLUMN lanes.owner_team; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lanes.owner_team IS 'Team that staffs/owns this lane (feeds KPI-alignment audit).';

--
-- Name: COLUMN lanes.kpis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lanes.kpis IS 'String array: metrics this lane''s team is measured on.';

--
-- Name: COLUMN lanes.tools; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lanes.tools IS 'String array: systems/tools this lane''s actors use.';

--
-- Name: COLUMN lanes.stakeholder_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lanes.stakeholder_id IS 'The actor whose work this lane holds, or null for a structural lane — the storyboard, the touchpoint rows — that names nobody. An association, not a parent: the lane is the service''s, the actor is the deployment''s, and an actor taken out of the cast un-names its lanes rather than pinning itself.';

--
-- Name: path_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.path_steps (
    path_id uuid NOT NULL,
    step_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE path_steps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.path_steps IS 'Steps included on a path and their column order';

--
-- Name: COLUMN path_steps."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.path_steps."position" IS 'Blueprint column index for this step on this path';

--
-- Name: paths; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paths (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid NOT NULL,
    name text NOT NULL,
    summary text,
    note text,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'import'::text NOT NULL,
    status public.entity_status DEFAULT 'live'::text NOT NULL,
    CONSTRAINT paths_kind_check CHECK ((kind = ANY (ARRAY['happy'::text, 'variant'::text, 'exception'::text]))),
    CONSTRAINT paths_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text])))
);

--
-- Name: TABLE paths; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.paths IS 'Service blueprint path (happy, unhappy, exception, alternative)';

--
-- Name: COLUMN paths.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paths.summary IS 'Optional summary of what this path variant represents';

--
-- Name: COLUMN paths.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paths.note IS 'Optional path note shown alongside path metadata (e.g. parallel scenario context)';

--
-- Name: COLUMN paths.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paths.kind IS 'happy, variant or exception. `variant` replaced `unhappy` and `alternative`, which were two spellings of the same thing; `exception` already carries "this went wrong".';

--
-- Name: COLUMN paths.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paths.status IS 'How far along this route is. Defaults to live. A badge renders from this row, never from a prefix in the name.';

--
-- Name: phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    name text NOT NULL,
    summary text,
    "position" integer DEFAULT 0 NOT NULL,
    loops_to_phase_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_impact text,
    operational_requirements text,
    origin text DEFAULT 'import'::text NOT NULL,
    CONSTRAINT phases_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text])))
);

--
-- Name: TABLE phases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.phases IS 'Ordered phase within a service';

--
-- Name: COLUMN phases.loops_to_phase_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.phases.loops_to_phase_id IS 'When set, UI shows a return transition from this phase to the target phase';

--
-- Name: COLUMN phases.business_impact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.phases.business_impact IS 'Commercial impact notes: opex, NPS, brand, retention, growth.';

--
-- Name: COLUMN phases.operational_requirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.phases.operational_requirements IS 'Process / system / people / legal requirements for this phase.';

--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cell_id uuid NOT NULL,
    cell_touchpoint_id uuid,
    kind text DEFAULT 'link'::text NOT NULL,
    name text NOT NULL,
    url text,
    "position" integer NOT NULL,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    CONSTRAINT resources_has_url CHECK ((NULLIF(btrim(url), ''::text) IS NOT NULL)),
    CONSTRAINT resources_kind_check CHECK ((kind = ANY (ARRAY['link'::text, 'attachment'::text]))),
    CONSTRAINT resources_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text]))),
    CONSTRAINT resources_url_absolute CHECK (((url IS NULL) OR (url !~ '^/'::text)))
);

--
-- Name: TABLE resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.resources IS 'Things a cell points at. Every row carries its cell; a row a touchpoint placement owns carries the placement as well, and the composite key holds the two to one row. A link is one kind of resource and `kind` carries the subtype.';

--
-- Name: COLUMN resources.cell_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resources.cell_id IS 'The cell this resource belongs to — always. A placement-owned resource carries its placement in cell_touchpoint_id as well.';

--
-- Name: COLUMN resources.cell_touchpoint_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resources.cell_touchpoint_id IS 'The touchpoint placement this resource belongs to, when it is a placement''s: a link or the image a touchpoint shows at this cell. Still the cell''s row; edited from the touchpoint.';

--
-- Name: COLUMN resources.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resources.kind IS 'link = a place on the web; attachment = a file the cell points at, today a site-relative image path, after #113 an object in Storage. Both carry a url. Host and file type are read at render, never stored.';

--
-- Name: COLUMN resources.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resources.name IS 'What the thing on the other end is called. `name`, not `label`: a reader navigates to it.';

--
-- Name: COLUMN resources.featured; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resources.featured IS 'The resource its owner leads with. One featured attachment per placement or per cell (the image it shows); any number of featured links.';

--
-- Name: CONSTRAINT resources_url_absolute ON resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT resources_url_absolute ON public.resources IS 'A resource points at a URL, never at a path inside whatever site deployed this template. An uploaded file''s URL is its object''s in the cell-attachments bucket (21000121000000).';

--
-- Name: scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    name text NOT NULL,
    summary text,
    "position" integer DEFAULT 0 NOT NULL,
    layout text DEFAULT 'stacked'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'import'::text NOT NULL,
    note text,
    CONSTRAINT scenarios_layout_check CHECK ((layout = ANY (ARRAY['stacked'::text, 'merged'::text]))),
    CONSTRAINT scenarios_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text])))
);

--
-- Name: TABLE scenarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scenarios IS 'Scenario within a phase';

--
-- Name: COLUMN scenarios.layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scenarios.layout IS 'How this scenario opens: stacked = one full band per path on a shared step axis; merged = the paths combined into one blueprint. The header toggle writes it, so a scenario left merged opens merged.';

--
-- Name: COLUMN scenarios.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scenarios.note IS 'An aside about the scenario, beside the summary that says what it is: most often what else may be running at the same time ("this scenario can run in parallel with goal setting and help requests"). Blueprint data, not app configuration — it replaces the Record keyed on hardcoded scenario ids that a deployment would otherwise keep in code. A scenario''s fact, held once, rather than the same sentence copied onto each of its paths through paths.note. Free prose in the author''s own language rather than a structured flag the renderer would have to compose a sentence from.';

--
-- Name: schema_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_version (
    singleton boolean DEFAULT true NOT NULL,
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schema_version_format CHECK ((version ~ '^\d{4}\.\d{2}\.\d{2}$'::text)),
    CONSTRAINT schema_version_is_singleton CHECK (singleton)
);

--
-- Name: TABLE schema_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schema_version IS 'The template schema version this database carries. Exactly one row. Read by the adapter contract''s compatibility check (references/adapter-contract.md § 2); bumped by the migration that changes the shape.';

--
-- Name: COLUMN schema_version.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schema_version.version IS 'Date-stamped template schema version, e.g. 2026.07.16 — the same value an IR carries in its schema_version field.';

--
-- Name: service_account_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_account_emails (
    email text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE service_account_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.service_account_emails IS 'Adopter-configured allowlist: accounts created with these emails are stamped app_metadata.role=service by the flag_service_accounts trigger. Operator-only (service role). Existing accounts are stamped directly on auth.users — see the header of this migration.';

--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_examples jsonb DEFAULT '{}'::jsonb NOT NULL,
    slug text
);

--
-- Name: TABLE services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.services IS 'The service this blueprint describes, end to end';

--
-- Name: COLUMN services.entity_examples; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.services.entity_examples IS 'Per-service authored examples, one free-text value per core kind (service, phase, scenario, path, step, lane), shown under each kind''s definition to ground it in this deployment. Blueprint data, not app config: it rides the service block so a re-map round-trips it. A jsonb object with no CHECK — the six-key shape is the app''s, and an unwritten key simply does not render.';

--
-- Name: COLUMN services.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.services.slug IS 'A service''s stable route slug: `/<slug>` opens it, and a scoped agent read names it. Its own identity, not derived from the name — a rename does not move the URL, and the unique constraint stops two services colliding. Backfilled from the name-derived slug (public.key_slug) when added; nullable so a cleared slug falls back to the name-derived route in the app. Editable by the deployer through a later panel write, which adds the UPDATE grant then.';

--
-- Name: slices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    summary text,
    actor text,
    locale text DEFAULT 'en'::text NOT NULL,
    authorship text DEFAULT 'generated'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slices_kind_check CHECK ((kind = ANY (ARRAY['journey'::text, 'step'::text, 'lane'::text, 'cell'::text, 'custom'::text]))),
    CONSTRAINT slices_origin_check CHECK ((authorship = ANY (ARRAY['generated'::text, 'customized'::text, 'human'::text])))
);

--
-- Name: TABLE slices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slices IS 'Saved 1D cuts through the blueprint grid. Reference cells only — never copy or create them.';

--
-- Name: COLUMN slices.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slices.kind IS 'Which cut through the grid this is: journey, step, lane, cell or custom.';

--
-- Name: COLUMN slices.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slices.summary IS 'What this slice is for, in a sentence.';

--
-- Name: COLUMN slices.authorship; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slices.authorship IS 'Who wrote it: generated, customized or human. Named for the act, not the source, because a human may author a slice outright.';

--
-- Name: slide_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slide_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slide_id uuid NOT NULL,
    "position" integer NOT NULL,
    cell_id uuid,
    image_url text,
    CONSTRAINT slide_images_one_source CHECK ((num_nonnulls(cell_id, image_url) = 1))
);

--
-- Name: TABLE slide_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slide_images IS 'The ordered set of images a slide shows once an author has chosen. Empty with slides.shows_all_images false is "show nothing"; empty with shows_all_images true is the untouched default and is not stored.';

--
-- Name: COLUMN slide_images.cell_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slide_images.cell_id IS 'Show this cell''s frame. Cascades away if the cell is deleted.';

--
-- Name: COLUMN slide_images.image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slide_images.image_url IS 'Show this uploaded image. It joins the slide''s set; it does not replace the cited cells'' frames.';

--
-- Name: slides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slice_id uuid NOT NULL,
    "position" integer NOT NULL,
    cell_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    cell_keys text[] DEFAULT '{}'::text[] NOT NULL,
    title text,
    caption text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    shows_all_images boolean DEFAULT true NOT NULL,
    CONSTRAINT slides_keys_match_ids CHECK ((cardinality(cell_ids) = cardinality(cell_keys)))
);

--
-- Name: TABLE slides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slides IS 'One slide of a slice. It shows the frames of the cells it references — that strip is what the slide shows, so the two cannot disagree — and carries the words written over them. Empty cell_ids = a title-only divider slide.';

--
-- Name: COLUMN slides.cell_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.cell_ids IS 'SOFT refs to cells (no FK — must survive scenario re-import). Same order as cell_keys.';

--
-- Name: COLUMN slides.cell_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.cell_keys IS 'IR key-paths paired with cell_ids for orphan recovery after key renames.';

--
-- Name: COLUMN slides.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.title IS 'The words over this slide. A title rather than a name: it is authored content a reader reads, not structure a reader navigates.';

--
-- Name: COLUMN slides.caption; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.caption IS 'The sentence a reader meets under this slide''s images. Authored content, not a story the slide tells.';

--
-- Name: COLUMN slides.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.created_by IS 'The caller at insert; null for service-key writes.';

--
-- Name: COLUMN slides.shows_all_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slides.shows_all_images IS 'True until an author ticks or unticks the set. True means show every cited cell''s frame and keep doing so as the board changes. False means show exactly slide_images, including none.';

--
-- Name: stakeholders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stakeholders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    summary text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    part_of_id uuid,
    CONSTRAINT stakeholders_kind_check CHECK ((kind = ANY (ARRAY['recipient'::text, 'staff'::text, 'partner'::text, 'provider'::text, 'team'::text]))),
    CONSTRAINT stakeholders_part_of_not_self CHECK (((part_of_id IS NULL) OR (part_of_id <> id)))
);

--
-- Name: TABLE stakeholders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stakeholders IS 'Deployment-level cast list: one pool of actors a lane picks from, unique by name across the deployment. A lane references a stakeholder; no service owns one (ADR 0003).';

--
-- Name: COLUMN stakeholders.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stakeholders.name IS 'The identity: unique across the deployment, so the same actor recurs across services by name rather than as one row per service.';

--
-- Name: COLUMN stakeholders.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stakeholders.kind IS 'recipient | staff | partner | provider | team. Who this is to the service. A team is a group a lane can be; staff are the people in it, and they are actors too.';

--
-- Name: COLUMN stakeholders.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stakeholders.summary IS 'Who this actor IS, for the deployment — not what they do at any one cell.';

--
-- Name: COLUMN stakeholders.aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stakeholders.aliases IS 'Other spellings this blueprint has used for the same actor, so a match by name finds them.';

--
-- Name: COLUMN stakeholders.part_of_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stakeholders.part_of_id IS 'The actor this one is part of, or null when it is not part of another. Exactly one level: an actor that is part of something is part of nothing further. A lane still names the specific actor; this is what lets a reader roll those up.';

--
-- Name: steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'import'::text NOT NULL,
    summary text,
    CONSTRAINT steps_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text])))
);

--
-- Name: TABLE steps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.steps IS 'Blueprint column (journey step) scoped to a service scenario';

--
-- Name: COLUMN steps.scenario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.steps.scenario_id IS 'Scenario that owns this canonical step';

--
-- Name: COLUMN steps.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.steps.summary IS 'What this moment is, across every lane — the one sentence that makes the column legible without reading five cells. Shown as the caption on the storyboard frame. Null until an author writes it.';

--
-- Name: touchpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.touchpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    summary text,
    url text,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon_url text,
    stakeholder_id uuid,
    tone text,
    aliases text[],
    CONSTRAINT touchpoints_kind_check CHECK ((kind = ANY (ARRAY['app'::text, 'document'::text, 'physical'::text, 'channel'::text, 'service'::text, 'other'::text]))),
    CONSTRAINT touchpoints_origin_check CHECK ((origin = ANY (ARRAY['import'::text, 'app'::text])))
);

--
-- Name: TABLE touchpoints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.touchpoints IS 'The deployment''s registry of touchpoints — the apps, documents, channels and things a moment happens through. One row per name across the whole deployment; a service references an entry, no service owns one (ADR 0003). A placement in cell_touchpoints is one use of one at one cell.';

--
-- Name: COLUMN touchpoints.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.name IS 'The identity: unique across the deployment, so a second service reuses an entry by naming the same tool the same way rather than minting its own, and a rename moves the tool everywhere it appears.';

--
-- Name: COLUMN touchpoints.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.kind IS 'app | document | physical | channel | service | other. What sort of thing this is; defaulted to other and judged later, never guessed from a name.';

--
-- Name: COLUMN touchpoints.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.summary IS 'What this touchpoint IS, for the deployment — not what it does at any one cell.';

--
-- Name: COLUMN touchpoints.url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.url IS 'Where the touchpoint itself lives, when it has a home; a placement''s own link is a resource on the placement.';

--
-- Name: COLUMN touchpoints.icon_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.icon_url IS 'A stable URL for the touchpoint''s stock icon or logo — the mark a well-known tool shows in the detail panel. A property of the thing the service owns, authored once per (service, name), not per placement. Blueprint data, not app config: the template ships it null and draws nothing, and a deployment seeds its own asset URL. The renderer reads this row rather than matching a tool name against a table baked into code.';

--
-- Name: COLUMN touchpoints.stakeholder_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.stakeholder_id IS 'The actor who owns this touchpoint — who runs the app, publishes the document, staffs the channel — or null when nobody has said yet, which is the ordinary state for a row the sync minted from a cell''s text. An association, not a parent: both the tool and the actor are the deployment''s (ADR 0003), and an actor taken out of the cast un-names its touchpoints rather than pinning itself, exactly as it un-names its lanes.';

--
-- Name: COLUMN touchpoints.tone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.tone IS 'The palette family this touchpoint''s face is drawn in — the deployment''s own choice, one of the renderer''s tone names (crimson, gold, indigo, purple, red, tomato, yellow). A product fact ("our scheduling tool is blue"), not a styling one, which is why it is a row and not a literal in touchpointColors.ts. Deliberately unconstrained: the tone vocabulary belongs to the token model (ADR 0006) and a CHECK here would be a second copy of it, free to drift. Null means no preference — the renderer falls back deterministically, exactly as it does for a tool the seed map never named.';

--
-- Name: COLUMN touchpoints.aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.touchpoints.aliases IS 'The other spellings that mean this touchpoint — an older name the service has stopped using, a label that carried its own specification, a lower-case one a person typed into a cell. The name is the identity; these resolve to it. The deployment''s own history, which is why it is a column and not a literal in touchpointColors.ts. Nullable rather than NOT NULL DEFAULT ''{}'' like stakeholders.aliases: null means no aliases have been considered, which is what every row means until somebody says otherwise. Uniqueness against other names and aliases is not constrained here — that rule settles a read, so it belongs with the resolver, which resolves a collision in favour of the name.';

--
-- Name: trash; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.trash WITH (security_invoker='true') AS
 SELECT id,
    at AS deleted_at,
    author_id AS deleted_by,
    deleted_kind AS kind,
    label,
    payload,
    affected_slices
   FROM public.authoring_changes c
  WHERE (deleted_kind IS NOT NULL);

--
-- Name: VIEW trash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.trash IS 'The deletions in public.authoring_changes, in the shape the retired deleted_structure table had. A filter over the one log, so the recovery list cannot drift from the record of what happened.';

--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);

--
-- Name: agent_messages agent_messages_session_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_session_id_seq_key UNIQUE (session_id, seq);

--
-- Name: agent_sessions agent_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_pkey PRIMARY KEY (id);

--
-- Name: audit_findings audit_findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_findings
    ADD CONSTRAINT audit_findings_pkey PRIMARY KEY (id);

--
-- Name: authoring_changes authoring_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authoring_changes
    ADD CONSTRAINT authoring_changes_pkey PRIMARY KEY (id);

--
-- Name: business_models business_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_models
    ADD CONSTRAINT business_models_pkey PRIMARY KEY (service_id);

--
-- Name: cell_dependencies cell_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_dependencies
    ADD CONSTRAINT cell_dependencies_pkey PRIMARY KEY (id);

--
-- Name: cell_dependencies cell_dependencies_source_target_kind_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_dependencies
    ADD CONSTRAINT cell_dependencies_source_target_kind_unique UNIQUE (source_cell_id, target_cell_id, kind);

--
-- Name: cell_touchpoints cell_touchpoints_cell_id_touchpoint_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_cell_id_touchpoint_id_key UNIQUE (cell_id, touchpoint_id);

--
-- Name: cell_touchpoints cell_touchpoints_cell_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_cell_position_unique UNIQUE (cell_id, "position") DEFERRABLE INITIALLY DEFERRED;

--
-- Name: cell_touchpoints cell_touchpoints_id_cell_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_id_cell_id_key UNIQUE (id, cell_id);

--
-- Name: cell_touchpoints cell_touchpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_pkey PRIMARY KEY (id);

--
-- Name: cells cells_lane_step_slot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_lane_step_slot_unique UNIQUE (lane_id, step_id, "position");

--
-- Name: cells cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_pkey PRIMARY KEY (id);

--
-- Name: evidence evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence
    ADD CONSTRAINT evidence_pkey PRIMARY KEY (id);

--
-- Name: lanes lanes_path_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_path_position_unique UNIQUE (path_id, "position") DEFERRABLE INITIALLY DEFERRED;

--
-- Name: CONSTRAINT lanes_path_position_unique ON lanes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT lanes_path_position_unique ON public.lanes IS 'One lane per slot in a path. Deferred because reorder_lanes renumbers one statement per lane and add_lane opens a slot with a single self-colliding UPDATE; both are checked at commit, not mid-flight.';

--
-- Name: lanes lanes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_pkey PRIMARY KEY (id);

--
-- Name: path_steps path_steps_path_column_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.path_steps
    ADD CONSTRAINT path_steps_path_column_unique UNIQUE (path_id, "position") DEFERRABLE INITIALLY DEFERRED;

--
-- Name: path_steps path_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.path_steps
    ADD CONSTRAINT path_steps_pkey PRIMARY KEY (path_id, step_id);

--
-- Name: paths paths_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paths
    ADD CONSTRAINT paths_pkey PRIMARY KEY (id);

--
-- Name: phases phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_pkey PRIMARY KEY (id);

--
-- Name: resources resources_cell_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_cell_position_unique EXCLUDE USING btree (cell_id WITH =, "position" WITH =) WHERE ((cell_touchpoint_id IS NULL)) DEFERRABLE INITIALLY DEFERRED;

--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);

--
-- Name: resources resources_touchpoint_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_touchpoint_position_unique UNIQUE (cell_touchpoint_id, "position") DEFERRABLE INITIALLY DEFERRED;

--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);

--
-- Name: schema_version schema_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version
    ADD CONSTRAINT schema_version_pkey PRIMARY KEY (singleton);

--
-- Name: service_account_emails service_account_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_account_emails
    ADD CONSTRAINT service_account_emails_pkey PRIMARY KEY (email);

--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

--
-- Name: services services_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_slug_key UNIQUE (slug);

--
-- Name: CONSTRAINT services_slug_key ON services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT services_slug_key ON public.services IS 'One slug per service, per deployment. Two services whose names slugify alike are refused rather than colliding on a shared route.';

--
-- Name: slices slices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slices
    ADD CONSTRAINT slices_pkey PRIMARY KEY (id);

--
-- Name: slide_images slide_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slide_images
    ADD CONSTRAINT slide_images_pkey PRIMARY KEY (id);

--
-- Name: slide_images slide_images_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slide_images
    ADD CONSTRAINT slide_images_position_unique UNIQUE (slide_id, "position");

--
-- Name: slides slides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slides
    ADD CONSTRAINT slides_pkey PRIMARY KEY (id);

--
-- Name: slides slides_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slides
    ADD CONSTRAINT slides_position_unique UNIQUE (slice_id, "position") DEFERRABLE INITIALLY DEFERRED;

--
-- Name: stakeholders stakeholders_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stakeholders
    ADD CONSTRAINT stakeholders_name_key UNIQUE (name);

--
-- Name: stakeholders stakeholders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stakeholders
    ADD CONSTRAINT stakeholders_pkey PRIMARY KEY (id);

--
-- Name: steps steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steps
    ADD CONSTRAINT steps_pkey PRIMARY KEY (id);

--
-- Name: touchpoints touchpoints_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.touchpoints
    ADD CONSTRAINT touchpoints_name_key UNIQUE (name);

--
-- Name: CONSTRAINT touchpoints_name_key ON touchpoints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT touchpoints_name_key ON public.touchpoints IS 'One row per touchpoint name, deployment-wide. Distinct tools take distinct names; an identical name means the identical thing.';

--
-- Name: touchpoints touchpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.touchpoints
    ADD CONSTRAINT touchpoints_pkey PRIMARY KEY (id);

--
-- Name: agent_messages_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_messages_session_idx ON public.agent_messages USING btree (session_id, seq);

--
-- Name: audit_findings_cell_ids_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_findings_cell_ids_idx ON public.audit_findings USING gin (cell_ids);

--
-- Name: audit_findings_open_fingerprint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_findings_open_fingerprint_idx ON public.audit_findings USING btree (service_id, fingerprint) WHERE (status = 'open'::text);

--
-- Name: audit_findings_service_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_findings_service_id_idx ON public.audit_findings USING btree (service_id);

--
-- Name: authoring_changes_agent_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authoring_changes_agent_session_idx ON public.authoring_changes USING btree (agent_session_id) WHERE (agent_session_id IS NOT NULL);

--
-- Name: authoring_changes_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authoring_changes_at_idx ON public.authoring_changes USING btree (at DESC);

--
-- Name: authoring_changes_deleted_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authoring_changes_deleted_kind_idx ON public.authoring_changes USING btree (deleted_kind, at DESC) WHERE (deleted_kind IS NOT NULL);

--
-- Name: cell_dependencies_source_cell_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cell_dependencies_source_cell_id_idx ON public.cell_dependencies USING btree (source_cell_id);

--
-- Name: cell_dependencies_target_cell_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cell_dependencies_target_cell_id_idx ON public.cell_dependencies USING btree (target_cell_id);

--
-- Name: cell_touchpoints_cell_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cell_touchpoints_cell_name_key ON public.cell_touchpoints USING btree (cell_id, lower(name)) WHERE (name IS NOT NULL);

--
-- Name: cells_cell_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cells_cell_key_unique ON public.cells USING btree (cell_key) WHERE (cell_key IS NOT NULL);

--
-- Name: cells_lane_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cells_lane_id_idx ON public.cells USING btree (lane_id);

--
-- Name: cells_path_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cells_path_id_idx ON public.cells USING btree (path_id);

--
-- Name: cells_step_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cells_step_id_idx ON public.cells USING btree (step_id);

--
-- Name: evidence_cell_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_cell_id_idx ON public.evidence USING btree (cell_id);

--
-- Name: evidence_service_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_service_id_idx ON public.evidence USING btree (service_id);

--
-- Name: lanes_path_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lanes_path_id_idx ON public.lanes USING btree (path_id);

--
-- Name: lanes_stakeholder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lanes_stakeholder_id_idx ON public.lanes USING btree (stakeholder_id);

--
-- Name: path_steps_path_column_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX path_steps_path_column_idx ON public.path_steps USING btree (path_id, "position");

--
-- Name: path_steps_step_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX path_steps_step_id_idx ON public.path_steps USING btree (step_id);

--
-- Name: paths_scenario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paths_scenario_id_idx ON public.paths USING btree (scenario_id);

--
-- Name: phases_loops_to_phase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phases_loops_to_phase_id_idx ON public.phases USING btree (loops_to_phase_id);

--
-- Name: phases_service_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phases_service_id_idx ON public.phases USING btree (service_id);

--
-- Name: phases_service_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phases_service_order_idx ON public.phases USING btree (service_id, "position");

--
-- Name: resources_one_featured_attachment_per_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resources_one_featured_attachment_per_cell ON public.resources USING btree (cell_id) WHERE (featured AND (kind = 'attachment'::text) AND (cell_touchpoint_id IS NULL));

--
-- Name: resources_one_featured_attachment_per_placement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resources_one_featured_attachment_per_placement ON public.resources USING btree (cell_touchpoint_id) WHERE (featured AND (kind = 'attachment'::text) AND (cell_touchpoint_id IS NOT NULL));

--
-- Name: scenarios_phase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scenarios_phase_id_idx ON public.scenarios USING btree (phase_id);

--
-- Name: scenarios_phase_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scenarios_phase_order_idx ON public.scenarios USING btree (phase_id, "position");

--
-- Name: slices_service_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slices_service_id_idx ON public.slices USING btree (service_id);

--
-- Name: slides_cell_ids_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slides_cell_ids_idx ON public.slides USING gin (cell_ids);

--
-- Name: slides_slice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slides_slice_id_idx ON public.slides USING btree (slice_id);

--
-- Name: steps_scenario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX steps_scenario_id_idx ON public.steps USING btree (scenario_id);

--
-- Name: touchpoints_stakeholder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX touchpoints_stakeholder_id_idx ON public.touchpoints USING btree (stakeholder_id);

--
-- Name: authoring_changes authoring_changes_no_rewrite; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER authoring_changes_no_rewrite BEFORE DELETE OR UPDATE ON public.authoring_changes FOR EACH ROW EXECUTE FUNCTION public.authoring_changes_are_append_only();

--
-- Name: authoring_changes authoring_changes_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER authoring_changes_no_truncate BEFORE TRUNCATE ON public.authoring_changes FOR EACH STATEMENT EXECUTE FUNCTION public.authoring_changes_are_append_only();

--
-- Name: cells cells_validate_path_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cells_validate_path_match BEFORE INSERT OR UPDATE ON public.cells FOR EACH ROW EXECUTE FUNCTION public.cells_validate_path_match();

--
-- Name: audit_findings set_audit_findings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_audit_findings_updated_at BEFORE UPDATE ON public.audit_findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: business_models set_business_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_business_models_updated_at BEFORE UPDATE ON public.business_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: cell_dependencies set_cell_dependencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cell_dependencies_updated_at BEFORE UPDATE ON public.cell_dependencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: cell_touchpoints set_cell_touchpoints_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cell_touchpoints_updated_at BEFORE UPDATE ON public.cell_touchpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: cells set_cells_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cells_updated_at BEFORE UPDATE ON public.cells FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: evidence set_evidence_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_evidence_updated_at BEFORE UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: lanes set_lanes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_lanes_updated_at BEFORE UPDATE ON public.lanes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: path_steps set_path_steps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_path_steps_updated_at BEFORE UPDATE ON public.path_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: paths set_paths_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_paths_updated_at BEFORE UPDATE ON public.paths FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: phases set_phases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_phases_updated_at BEFORE UPDATE ON public.phases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: resources set_resources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: scenarios set_scenarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_scenarios_updated_at BEFORE UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: services set_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: slices set_slices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_slices_updated_at BEFORE UPDATE ON public.slices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: slides set_slides_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: stakeholders set_stakeholders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_stakeholders_updated_at BEFORE UPDATE ON public.stakeholders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: steps set_steps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_steps_updated_at BEFORE UPDATE ON public.steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: touchpoints set_touchpoints_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_touchpoints_updated_at BEFORE UPDATE ON public.touchpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: slides slides_drop_uncited_slide_images; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER slides_drop_uncited_slide_images AFTER UPDATE OF cell_ids ON public.slides FOR EACH ROW EXECUTE FUNCTION public.slide_images_drop_uncited_cells();

--
-- Name: stakeholders stakeholders_part_of_is_flat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stakeholders_part_of_is_flat BEFORE INSERT OR UPDATE OF part_of_id ON public.stakeholders FOR EACH ROW EXECUTE FUNCTION public.stakeholders_part_of_is_flat();

--
-- Name: agent_messages agent_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.agent_sessions(id) ON DELETE CASCADE;

--
-- Name: audit_findings audit_findings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_findings
    ADD CONSTRAINT audit_findings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

--
-- Name: business_models business_models_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_models
    ADD CONSTRAINT business_models_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

--
-- Name: cell_dependencies cell_dependencies_source_cell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_dependencies
    ADD CONSTRAINT cell_dependencies_source_cell_id_fkey FOREIGN KEY (source_cell_id) REFERENCES public.cells(id) ON DELETE CASCADE;

--
-- Name: cell_dependencies cell_dependencies_target_cell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_dependencies
    ADD CONSTRAINT cell_dependencies_target_cell_id_fkey FOREIGN KEY (target_cell_id) REFERENCES public.cells(id) ON DELETE CASCADE;

--
-- Name: cell_touchpoints cell_touchpoints_cell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_cell_id_fkey FOREIGN KEY (cell_id) REFERENCES public.cells(id) ON DELETE CASCADE;

--
-- Name: cell_touchpoints cell_touchpoints_touchpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_touchpoints
    ADD CONSTRAINT cell_touchpoints_touchpoint_id_fkey FOREIGN KEY (touchpoint_id) REFERENCES public.touchpoints(id) ON DELETE RESTRICT;

--
-- Name: cells cells_lane_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_lane_id_fkey FOREIGN KEY (lane_id) REFERENCES public.lanes(id) ON DELETE CASCADE;

--
-- Name: cells cells_path_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_path_id_fkey FOREIGN KEY (path_id) REFERENCES public.paths(id) ON DELETE CASCADE;

--
-- Name: cells cells_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.steps(id) ON DELETE CASCADE;

--
-- Name: evidence evidence_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence
    ADD CONSTRAINT evidence_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

--
-- Name: lanes lanes_path_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_path_id_fkey FOREIGN KEY (path_id) REFERENCES public.paths(id) ON DELETE CASCADE;

--
-- Name: lanes lanes_stakeholder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lanes
    ADD CONSTRAINT lanes_stakeholder_id_fkey FOREIGN KEY (stakeholder_id) REFERENCES public.stakeholders(id) ON DELETE SET NULL;

--
-- Name: path_steps path_steps_path_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.path_steps
    ADD CONSTRAINT path_steps_path_id_fkey FOREIGN KEY (path_id) REFERENCES public.paths(id) ON DELETE CASCADE;

--
-- Name: path_steps path_steps_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.path_steps
    ADD CONSTRAINT path_steps_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.steps(id) ON DELETE CASCADE;

--
-- Name: paths paths_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paths
    ADD CONSTRAINT paths_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;

--
-- Name: phases phases_loops_to_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_loops_to_phase_id_fkey FOREIGN KEY (loops_to_phase_id) REFERENCES public.phases(id) ON DELETE SET NULL;

--
-- Name: phases phases_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

--
-- Name: resources resources_cell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_cell_id_fkey FOREIGN KEY (cell_id) REFERENCES public.cells(id) ON DELETE CASCADE;

--
-- Name: resources resources_placement_in_cell_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_placement_in_cell_fkey FOREIGN KEY (cell_touchpoint_id, cell_id) REFERENCES public.cell_touchpoints(id, cell_id) ON DELETE CASCADE;

--
-- Name: scenarios scenarios_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;

--
-- Name: slices slices_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slices
    ADD CONSTRAINT slices_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

--
-- Name: slide_images slide_images_cell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slide_images
    ADD CONSTRAINT slide_images_cell_id_fkey FOREIGN KEY (cell_id) REFERENCES public.cells(id) ON DELETE CASCADE;

--
-- Name: slide_images slide_images_slide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slide_images
    ADD CONSTRAINT slide_images_slide_id_fkey FOREIGN KEY (slide_id) REFERENCES public.slides(id) ON DELETE CASCADE;

--
-- Name: slides slides_slice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slides
    ADD CONSTRAINT slides_slice_id_fkey FOREIGN KEY (slice_id) REFERENCES public.slices(id) ON DELETE CASCADE;

--
-- Name: stakeholders stakeholders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stakeholders
    ADD CONSTRAINT stakeholders_parent_id_fkey FOREIGN KEY (part_of_id) REFERENCES public.stakeholders(id) ON DELETE SET NULL;

--
-- Name: steps steps_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.steps
    ADD CONSTRAINT steps_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;

--
-- Name: touchpoints touchpoints_stakeholder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.touchpoints
    ADD CONSTRAINT touchpoints_stakeholder_id_fkey FOREIGN KEY (stakeholder_id) REFERENCES public.stakeholders(id) ON DELETE SET NULL;

--
-- PostgreSQL database dump complete
--
