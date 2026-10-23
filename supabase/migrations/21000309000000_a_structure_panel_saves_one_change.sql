-- Authored 2026-10-22. A structure panel saves its fields and path orders together.

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
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('require_structure_author','check_structure_draft_order','add_step_with_details','add_lane_with_details','undo_structure_add','rename_step','rename_lane','update_step_with_details','update_lane_with_details','restore_step_details','restore_lane_details') loop
    execute format('revoke all on function %s from public',fn);
    for role_name in select r.rolname from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid=fn::oid and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,role_name); end loop;
  end loop;
end $acl$;

-- @recipe — Signed-in callers may attempt the guarded writes; helpers stay private.
grant execute on function public.add_step_with_details(uuid,text,jsonb,text) to authenticated;
grant execute on function public.add_lane_with_details(uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.undo_structure_add(jsonb) to authenticated;
grant execute on function public.rename_step(uuid,text) to authenticated;
grant execute on function public.update_step_with_details(uuid,text,text) to authenticated;
grant execute on function public.update_lane_with_details(uuid,uuid[],text,jsonb) to authenticated;
grant execute on function public.restore_step_details(jsonb) to authenticated;
grant execute on function public.restore_lane_details(jsonb) to authenticated;
grant execute on function public.rename_lane(uuid,text) to authenticated;

-- @core — Atomic write and undo proof; every fixture rolls back.
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

-- @recipe — The new writes and their inverse refuse a caller without the author tier.
do $draft_permissions$
begin
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.add_step_with_details(null::uuid,'Blocked','{}'::jsonb);
    raise exception 'step draft accepted a reader';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_lane_with_details(null::uuid,'Blocked','frontstage_actions','{}'::jsonb);
    raise exception 'lane draft accepted a reader';
  exception when insufficient_privilege then null; end;
  begin
    perform public.undo_structure_add('{}'::jsonb);
    raise exception 'draft undo accepted a reader';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.undo_structure_add(jsonb)','EXECUTE')
    or has_function_privilege('anon','public.add_step_with_details(uuid,text,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.add_lane_with_details(uuid,text,text,jsonb,jsonb)','EXECUTE') then
    raise exception 'an anonymous caller can execute a draft write';
  end if;
end $draft_permissions$;

-- @recipe — Panel edits commit and restore the name and all properties together.
do $panel_edit_proof$
declare svc uuid; ph uuid; sc uuid; p uuid; st uuid; ln uuid; snapshot jsonb;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  if not public.is_service_account() then return; end if;
  insert into public.services(name) values('Panel edit fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Fixture phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Fixture scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Default','happy') returning id into p;
  st := public.add_step(p,'Start',null);
  snapshot := public.update_step_with_details(st,'Review','Review the request.');
  if not exists(select 1 from public.steps where id=st and name='Review' and summary='Review the request.') then raise exception 'step panel fields were not saved together'; end if;
  perform public.restore_step_details(snapshot);
  if not exists(select 1 from public.steps where id=st and name='Start' and summary is null) then raise exception 'step panel inverse lost a field'; end if;
  insert into public.lanes(path_id,name,lane_role,position,owner_team) values(p,'Actor','frontstage_actions',0,'Original team') returning id into ln;
  snapshot := public.update_lane_with_details(ln,array[ln],'Reviewer','{"owner_team":"Operations","stakeholder_id":null,"kpis":["Completion"],"tools":["Queue"]}');
  if not exists(select 1 from public.lanes where id=ln and name='Reviewer' and owner_team='Operations' and kpis='["Completion"]' and tools='["Queue"]') then raise exception 'lane panel fields were not saved together'; end if;
  perform public.restore_lane_details(snapshot);
  if not exists(select 1 from public.lanes where id=ln and name='Actor' and owner_team='Original team' and kpis='[]' and tools='[]') then raise exception 'lane panel inverse lost a field'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.update_step_with_details(st,'Blocked','Blocked');
    raise exception 'step panel accepted a reader';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_lane_with_details(ln,array[ln],'Blocked','{"kpis":[],"tools":[]}');
    raise exception 'lane panel accepted a reader';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_step_details('{}');
    raise exception 'step restore accepted a reader';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_lane_details('{}');
    raise exception 'lane restore accepted a reader';
  exception when insufficient_privilege then null; end;
  raise exception 'panel edit proof complete';
exception when raise_exception then if sqlerrm <> 'panel edit proof complete' then raise; end if;
end $panel_edit_proof$;
