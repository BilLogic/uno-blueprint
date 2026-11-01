-- Authored 2026-10-31. Undo of an Add restores the numbering it found, whatever it started from.

-- `undo_structure_add` (last written by 21000311) required every `before`
-- position to equal its array index: 0, 1, 2, … Many existing paths number
-- their steps and lanes from 1, or carry gaps from older edits. The Add
-- itself renumbers the path from 0, so its receipt captures the original
-- numbering in `before`, and that numbering then failed the rule: Undo of
-- every Add on such a path was refused with "This change cannot be undone.
-- Reload the canvas".
--
-- The `before` array order is the path order. The rule it needs is that the
-- numbering agrees with that order: each position is a non-negative integer,
-- and positions strictly increase along the array, which also makes them
-- distinct. Every other guard is unchanged: identities, memberships, the
-- after-order matching the path as it is now, and content added since.
--
-- The other inverses were audited for the same assumption and need no change.
-- `undo_structure_order` and `undo_step_path_change` restore the stored
-- positions without comparing them to an ordinal, and the forward writes
-- compare identities, never positions. The proof below performs each round
-- trip on a path numbered from 1.
--
-- `create or replace` keeps the function's oid and with it every grant.

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
      or exists(select 1 from jsonb_array_elements(snapshot->'before'->p::text) q(value)
        where coalesce(q.value->>'position','') !~ '^(0|[1-9][0-9]*)$')
      -- The array order is the path order: its numbering must strictly rise.
      or exists(select 1 from (
          select (q.value->>'position')::numeric as position,
                 lag((q.value->>'position')::numeric) over (order by q.n) as previous
          from jsonb_array_elements(snapshot->'before'->p::text) with ordinality q(value,n)) w
        where w.position<=w.previous)
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

-- Paths numbered from 1, or with gaps, round-trip through every structure
-- Undo; a numbering that disagrees with its order is still refused. Fixtures
-- roll back.
create function pg_temp.expect_numbering_refusal(statement text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Unexpected success: %',statement using errcode='ZX001';
  exception when others then
    if sqlerrm is distinct from message then raise exception 'Expected %, got %',message,sqlerrm; end if;
  end;
end $$;
create function pg_temp.step_numbering(p uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',step_id,'position',position) order by position),'[]') from public.path_steps where path_id=p
$$;
create function pg_temp.lane_numbering(p uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position) order by position),'[]') from public.lanes where path_id=p
$$;
do $proof$
declare svc uuid; ph uuid; sc uuid; a uuid; g uuid; s1 uuid; s2 uuid; s3 uuid; t1 uuid; t2 uuid; t3 uuid; l1 uuid; l2 uuid;
  found_steps jsonb; found_lanes jsonb; found_gaps jsonb; added jsonb; moved jsonb;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Numbered from one fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Counter','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Kiosk','variant') returning id into g;
  insert into public.steps(scenario_id,name,origin) values(sc,'Arrive','app') returning id into s1;
  insert into public.steps(scenario_id,name,origin) values(sc,'Order','app') returning id into s2;
  insert into public.steps(scenario_id,name,origin) values(sc,'Leave','app') returning id into s3;
  insert into public.path_steps(path_id,step_id,position) values(a,s1,1),(a,s2,2),(a,s3,3);
  insert into public.steps(scenario_id,name,origin) values(sc,'Scan','app') returning id into t1;
  insert into public.steps(scenario_id,name,origin) values(sc,'Pay','app') returning id into t2;
  insert into public.steps(scenario_id,name,origin) values(sc,'Collect','app') returning id into t3;
  insert into public.path_steps(path_id,step_id,position) values(g,t1,1),(g,t2,3),(g,t3,7);
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Guest','customer_actions',1) returning id into l1;
  insert into public.lanes(path_id,name,lane_role,position) values(a,'Host','frontstage_actions',2) returning id into l2;
  found_steps:=pg_temp.step_numbering(a); found_lanes:=pg_temp.lane_numbering(a); found_gaps:=pg_temp.step_numbering(g);

  -- A step added between the second and third step of a path numbered 1, 2, 3.
  added:=public.add_step_with_details(a,'Review',jsonb_build_object(a,jsonb_build_array(s1,s2,'new',s3)));
  if added->'before'->a::text is distinct from found_steps then raise exception 'Add captured %, expected %',added->'before'->a::text,found_steps; end if;
  -- A numbering that disagrees with the path order is still refused.
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'1','position'],'1')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'5')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'-1')),'This change cannot be undone. Reload the canvas');
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'0','position'],'"one"')),'This change cannot be undone. Reload the canvas');
  perform public.undo_structure_add(added);
  if pg_temp.step_numbering(a) is distinct from found_steps then raise exception 'Step Undo left %, expected %',pg_temp.step_numbering(a),found_steps; end if;

  -- Gaps (1, 3, 7) come back exactly.
  added:=public.add_step_with_details(g,'Wait',jsonb_build_object(g,jsonb_build_array(t1,'new',t2,t3)));
  perform public.undo_structure_add(added);
  if pg_temp.step_numbering(g) is distinct from found_gaps then raise exception 'Gap Undo left %, expected %',pg_temp.step_numbering(g),found_gaps; end if;

  -- A lane added first on a lane set numbered 1, 2.
  added:=public.add_lane_with_details(sc,'Runner','backstage_actions',jsonb_build_object(a,jsonb_build_array('new',l1,l2)));
  if added->'before'->a::text is distinct from found_lanes then raise exception 'Lane Add captured %, expected %',added->'before'->a::text,found_lanes; end if;
  perform pg_temp.expect_numbering_refusal(format('select public.undo_structure_add(%L::jsonb)',jsonb_set(added,array['before',a::text,'1','position'],'1')),'This change cannot be undone. Reload the canvas');
  perform public.undo_structure_add(added);
  if pg_temp.lane_numbering(a) is distinct from found_lanes then raise exception 'Lane Undo left %, expected %',pg_temp.lane_numbering(a),found_lanes; end if;

  -- Reorder Undo restores the numbering it found, for steps and lanes.
  moved:=public.reorder_steps(a,array[s3,s1,s2],array[s1,s2,s3]);
  perform public.undo_structure_order(moved);
  if pg_temp.step_numbering(a) is distinct from found_steps then raise exception 'Step Move Undo left %, expected %',pg_temp.step_numbering(a),found_steps; end if;
  moved:=public.reorder_steps(g,array[t2,t3,t1],array[t1,t2,t3]);
  perform public.undo_structure_order(moved);
  if pg_temp.step_numbering(g) is distinct from found_gaps then raise exception 'Gap Move Undo left %, expected %',pg_temp.step_numbering(g),found_gaps; end if;
  moved:=public.reorder_lanes(a,array[l2,l1],array[l1,l2]);
  perform public.undo_structure_order(moved);
  if pg_temp.lane_numbering(a) is distinct from found_lanes then raise exception 'Lane Move Undo left %, expected %',pg_temp.lane_numbering(a),found_lanes; end if;

  -- Every fixture above disappears even when this proof passes.
  raise exception 'numbering proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_numbering_refusal(text,text);
drop function pg_temp.step_numbering(uuid);
drop function pg_temp.lane_numbering(uuid);

-- @recipe — The replacement keeps its grant: authors only.
do $grants$
begin
  if not has_function_privilege('authenticated','public.undo_structure_add(jsonb)','execute')
    or has_function_privilege('anon','public.undo_structure_add(jsonb)','execute') then
    raise exception 'undo_structure_add lost its author-only grant';
  end if;
end $grants$;
