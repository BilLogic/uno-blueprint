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


create or replace function public.apply_structure_order(path_id uuid,kind text,ids uuid[]) returns jsonb
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  perform public.require_structure_author();
  raise exception 'This path changed. Reload and try again';
end $$;

-- Explicit ACLs include the renamed helper and overloads; none inherit PUBLIC access.
do $acl$
declare fn regprocedure; role_name text;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('undo_structure_add','rename_step_name','rename_lane','rename_lane_checked','update_step_with_details','update_lane_with_details','restore_step_details','restore_lane_details','apply_structure_order','reorder_steps','reorder_lanes','undo_structure_order') loop
  execute format('revoke all on function %s from public',fn);
  for role_name in select r.rolname from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid=fn::oid and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,role_name); end loop;
 end loop;
end $acl$;
-- @recipe — Only guarded author entry points are exposed.
grant execute on function public.undo_structure_add(jsonb), public.rename_step_name(uuid,text), public.rename_lane(uuid,text), public.update_step_with_details(uuid,text,text), public.update_lane_with_details(uuid,uuid[],text,jsonb), public.restore_step_details(jsonb), public.restore_lane_details(jsonb), public.reorder_steps(uuid,uuid[],uuid[]), public.reorder_lanes(uuid,uuid[],uuid[]), public.undo_structure_order(jsonb) to authenticated;

-- @core — Real content and concurrent edits must survive Undo; fixtures roll back.
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
  if to_regprocedure('public.reorder_steps(uuid,uuid[],uuid[])') is null then
    perform public.reorder_steps(a,array[t,s]);
    perform pg_temp.expect_structure_refusal(format('select public.reorder_steps(%L::uuid,%L::uuid[])',a,array[s,t]),'This path changed. Reload and try again');
  else
    perform public.reorder_steps(a,array[t,s],array[s,t]);
    perform pg_temp.expect_structure_refusal(format('select public.reorder_steps(%L::uuid,%L::uuid[],%L::uuid[])',a,array[s,t],array[s,t]),'This path changed. Reload and try again');
  end if;
  -- Every fixture above disappears even when this proof passes.
  raise exception 'structure review proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_structure_refusal(text,text);

-- @recipe — Exercise the replacement entry points as a reader, not just as the owner.
do $reader$
begin
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.undo_structure_add('{}'); raise exception 'reader undid Add'; exception when insufficient_privilege then null; end;
 begin perform public.reorder_steps(gen_random_uuid(),'{}'::uuid[],'{}'::uuid[]); raise exception 'reader reordered steps'; exception when insufficient_privilege then null; end;
 begin perform public.reorder_lanes(gen_random_uuid(),'{}'::uuid[],'{}'::uuid[]); raise exception 'reader reordered lanes'; exception when insufficient_privilege then null; end;
 begin perform public.restore_step_details('{}'); raise exception 'reader restored step'; exception when insufficient_privilege then null; end;
 begin perform public.restore_lane_details('{}'); raise exception 'reader restored lane'; exception when insufficient_privilege then null; end;
end $reader$;
