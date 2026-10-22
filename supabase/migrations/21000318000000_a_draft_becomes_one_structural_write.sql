-- A create panel commits its required name and optional properties together.
-- Existing add operations remain available to callers that do not carry a draft.

create or replace function public.add_lane_with_details(
  scenario_id uuid, name text, lane_role text, at_position integer default null,
  details jsonb default '{}'::jsonb
) returns uuid[] language plpgsql security definer
set search_path to 'public', 'pg_catalog', 'pg_temp' as $$
declare ids uuid[];
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if nullif(trim(name), '') is null or nullif(trim(lane_role), '') is null then
    raise exception 'A lane needs a name and role';
  end if;
  if jsonb_typeof(coalesce(details->'kpis', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(details->'tools', '[]'::jsonb)) <> 'array' then
    raise exception 'KPIs and tools must be lists';
  end if;
  ids := public.add_lane(scenario_id, trim(name), lane_role, at_position);
  if coalesce(cardinality(ids), 0) = 0 then raise exception 'That scenario has no paths'; end if;
  update public.lanes set
    owner_team = nullif(trim(details->>'owner_team'), ''),
    stakeholder_id = nullif(details->>'stakeholder_id', '')::uuid,
    kpis = coalesce(details->'kpis', '[]'::jsonb),
    tools = coalesce(details->'tools', '[]'::jsonb)
  where id = any(ids);
  return ids;
end $$;

create or replace function public.add_step_with_details(
  path_id uuid, name text, at_position integer default null,
  summary text default null, frames jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer
set search_path to 'public', 'pg_catalog', 'pg_temp' as $$
declare step uuid; frame jsonb; lane uuid;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if nullif(trim(name), '') is null then raise exception 'A step needs a name'; end if;
  if jsonb_typeof(frames) <> 'array' then raise exception 'Storyboard frames must be a list'; end if;
  step := public.add_step(path_id, trim(name), at_position);
  update public.steps set summary = nullif(trim(add_step_with_details.summary), '') where id = step;
  for frame in select * from jsonb_array_elements(frames) loop
    lane := (frame->>'lane_id')::uuid;
    if not exists(select 1 from public.lanes l where l.id = lane and l.path_id = add_step_with_details.path_id
      and coalesce(l.lane_role, '') not in ('storyboard', 'frontstage_touchpoints', 'backstage_touchpoints')) then
      raise exception 'Choose an actor lane on this path for the storyboard frame';
    end if;
    if nullif(trim(frame->>'url'), '') is null or frame->>'url' !~ '^https?://' then raise exception 'A storyboard frame needs an HTTP image URL'; end if;
    insert into public.cells(path_id, lane_id, step_id, content, frame, origin)
    values(add_step_with_details.path_id, lane, step, '', frame->>'url', 'app');
  end loop;
  return step;
end $$;

create or replace function public.rename_step(step_id uuid, new_name text)
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

create or replace function public.rename_lane(lane_id uuid, new_name text)
returns void language plpgsql security definer
set search_path to 'public', 'pg_catalog', 'pg_temp' as $$
declare scen uuid; previous text;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;
  if nullif(trim(new_name), '') is null then raise exception 'A lane needs a name'; end if;
  select p.scenario_id, l.name into scen, previous from public.lanes l join public.paths p on p.id = l.path_id
  where l.id = lane_id for update of l;
  if not found then raise exception 'That lane no longer exists'; end if;
  if exists(select 1 from public.lanes l join public.paths p on p.id = l.path_id
    where p.scenario_id = scen and l.name = trim(new_name) and l.name <> previous) then
    raise exception 'That lane name already exists in this scenario';
  end if;
  update public.lanes l set name = trim(new_name) from public.paths p
  where p.id = l.path_id and p.scenario_id = scen and l.name = previous;
end $$;

revoke all on function public.add_lane_with_details(uuid,text,text,integer,jsonb) from public;
revoke all on function public.add_step_with_details(uuid,text,integer,text,jsonb) from public;
revoke all on function public.rename_lane(uuid,text) from public;
revoke all on function public.rename_step(uuid,text) from public;
-- Clear explicit host defaults as well as PUBLIC before any recipe is applied.
-- A host may grant every new function to its reader role by name.
do $draft_acl$
declare fn regprocedure; grantee_name text;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('add_lane_with_details','add_step_with_details','rename_lane','rename_step')
  loop
    for grantee_name in select r.rolname from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join pg_roles r on r.oid=a.grantee
      where p.oid=fn::oid and a.grantee<>p.proowner
    loop execute format('revoke all on function %s from %I', fn, grantee_name); end loop;
  end loop;
end $draft_acl$;

-- @recipe — Only signed-in callers can attempt these guarded authoring operations.
grant execute on function public.add_lane_with_details(uuid,text,text,integer,jsonb) to authenticated;
grant execute on function public.add_step_with_details(uuid,text,integer,text,jsonb) to authenticated;
grant execute on function public.rename_lane(uuid,text) to authenticated;
grant execute on function public.rename_step(uuid,text) to authenticated;

-- @core — The atomic draft and rename operations, performed without retaining fixtures.
do $draft_proof$
declare
  svc uuid; ph uuid; scen uuid; pth uuid; pth2 uuid; lane_ids uuid[]; step uuid;
begin
  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then return; end if;
  insert into public.services(name) values ('Panel draft fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Fixture phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Fixture scenario',0) returning id into scen;
  insert into public.paths(scenario_id,name,kind) values(scen,'Default','happy') returning id into pth;
  insert into public.paths(scenario_id,name,kind) values(scen,'Alternative','variant') returning id into pth2;
  lane_ids := public.add_lane_with_details(scen,'Reviewer','frontstage_actions',4,'{"owner_team":"Operations","kpis":["Completion"],"tools":["Queue"]}'::jsonb);
  if cardinality(lane_ids) <> 2 or (select count(*) from public.lanes where id = any(lane_ids) and owner_team='Operations' and kpis='["Completion"]'::jsonb and position=4) <> 2 then raise exception 'lane details or fan-out missing'; end if;
  begin
    perform public.add_step_with_details(pth,'Rejected draft',4,'Must not remain',jsonb_build_array(jsonb_build_object('lane_id',(select id from public.lanes where id=any(lane_ids) and path_id=pth2),'url','https://example.org/frame.png')));
    raise exception 'a cross-path frame was accepted' using errcode='P0003';
  exception when raise_exception then null;
  end;
  if exists(select 1 from public.steps where scenario_id=scen and name='Rejected draft') then raise exception 'a rejected draft left a step behind'; end if;
  step := public.add_step_with_details(pth,'Review',4,'Review the request.',jsonb_build_array(jsonb_build_object('lane_id',(select id from public.lanes where id = any(lane_ids) and path_id=pth),'url','https://example.org/frame.png')));
  -- The returned ids need not be ordered by path.
  if (select summary from public.steps where id=step) <> 'Review the request.' then raise exception 'step summary missing'; end if;
  perform public.rename_step(step,'Decision');
  perform public.rename_step(step,'Review');
  perform public.rename_lane(lane_ids[1],'Approver');
  if (select count(*) from public.lanes where id = any(lane_ids) and name='Approver') <> 2 then raise exception 'lane rename did not fan out'; end if;
  perform public.rename_lane(lane_ids[1],'Reviewer');
  raise exception 'draft proof rollback' using errcode = 'P0004';
exception when sqlstate 'P0004' then null;
end $draft_proof$;


-- @recipe — The recipe's identity guard refuses every new write without a service claim.
do $draft_refusals$
declare statement text;
begin
  perform set_config('request.jwt.claims', '{}', true);
  foreach statement in array array[
    'select public.rename_step(null, ''Forbidden'')',
    'select public.rename_lane(null, ''Forbidden'')',
    'select public.add_step_with_details(null, ''Forbidden'')',
    'select public.add_lane_with_details(null, ''Forbidden'', ''frontstage_actions'')'
  ] loop
    begin
      execute statement;
      raise exception 'an unauthenticated structural write was accepted' using errcode='P0003';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $draft_refusals$;
