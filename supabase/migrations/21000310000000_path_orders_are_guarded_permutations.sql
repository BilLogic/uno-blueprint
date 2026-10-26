-- Authored 2026-10-24. Path orders use complete identity permutations.
-- @core — Each reorder owns one path and captures the exact inverse.
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
-- @recipe — The guarded entry points accept authenticated authors only.
grant execute on function public.reorder_steps(uuid,uuid[]) to authenticated;
grant execute on function public.reorder_lanes(uuid,uuid[]) to authenticated;
grant execute on function public.reorder_lanes(uuid,text[]) to authenticated;
grant execute on function public.undo_structure_order(jsonb) to authenticated;

-- @core — Real rows, both kinds, exact undo, malformed orders and reader refusal; all rolled back.
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

-- @recipe — Anonymous callers cannot enter a reorder or its inverse.
do $permissions$ begin
  if has_function_privilege('anon','public.reorder_steps(uuid,uuid[])','execute') or has_function_privilege('anon','public.reorder_lanes(uuid,uuid[])','execute') or has_function_privilege('anon','public.undo_structure_order(jsonb)','execute') then raise exception 'anonymous reorder exposed'; end if;
end $permissions$;

-- @recipe — The host's reader identity cannot enter a write or undo.
do $reader$
begin
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.reorder_steps(gen_random_uuid(),'{}'::uuid[]); raise exception 'reader reordered steps';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reorder_lanes(gen_random_uuid(),'{}'::uuid[]); raise exception 'reader reordered lanes';
  exception when insufficient_privilege then null; end;
  begin
    perform public.undo_structure_order('{}'); raise exception 'reader undid order';
  exception when insufficient_privilege then null; end;
end $reader$;
