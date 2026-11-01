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

-- @core

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

-- @recipe — `create or replace` keeps every grant: authors only.
do $grants$
begin
  if not has_function_privilege('authenticated',
       'public.set_cell_dependency(uuid, uuid, text, text, text)', 'execute')
    or has_function_privilege('anon',
       'public.set_cell_dependency(uuid, uuid, text, text, text)', 'execute')
    or not has_function_privilege('authenticated',
       'public.update_cell_dependency(uuid, text, uuid, text)', 'execute')
    or has_function_privilege('anon',
       'public.update_cell_dependency(uuid, text, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.delete_path(uuid)', 'execute')
    or has_function_privilege('anon', 'public.delete_path(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.delete_scenario(uuid)', 'execute')
    or has_function_privilege('anon', 'public.delete_scenario(uuid)', 'execute') then
    raise exception 'a rewritten write lost its author-only grant';
  end if;
end $grants$;
