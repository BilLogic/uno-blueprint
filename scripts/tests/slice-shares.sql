-- A slice across two services, shared by a link, through the checked write
-- transaction; the link read as the anonymous role. Scratch databases only.
begin;
-- A second service with one path of two cells, beside the seeded service.
insert into public.services(id,name,slug) values ('f0000000-0000-4000-8000-0000000000a0','A second service','a-second-service');
insert into public.phases(id,service_id,name,position) values ('f0000000-0000-4000-8000-0000000000a1','f0000000-0000-4000-8000-0000000000a0','Second phase',0);
insert into public.scenarios(id,phase_id,name,position) values ('f0000000-0000-4000-8000-0000000000a2','f0000000-0000-4000-8000-0000000000a1','Second scenario',0);
insert into public.paths(id,scenario_id,name,kind) values ('f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000a2','Second path','happy');
insert into public.lanes(id,path_id,name,lane_role,position) values ('f0000000-0000-4000-8000-0000000000a4','f0000000-0000-4000-8000-0000000000a3','Second team','frontstage_actions',0);
insert into public.steps(id,scenario_id,name) values
  ('f0000000-0000-4000-8000-0000000000a5','f0000000-0000-4000-8000-0000000000a2','Second first step'),
  ('f0000000-0000-4000-8000-0000000000a6','f0000000-0000-4000-8000-0000000000a2','Second next step');
insert into public.path_steps(path_id,step_id,position) values
  ('f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000a5',0),
  ('f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000a6',1);
insert into public.cells(id,path_id,lane_id,step_id,content) values
  ('f0000000-0000-4000-8000-0000000000b1','f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000a4','f0000000-0000-4000-8000-0000000000a5','Second service, cited'),
  ('f0000000-0000-4000-8000-0000000000b2','f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000a4','f0000000-0000-4000-8000-0000000000a6','Second service, not cited');
create temporary table shared_link(slice uuid, token text, beside uuid, cited uuid) on commit drop;
grant all on shared_link to authenticated, anon;

select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare service uuid:='f0000000-0000-4000-8000-000000000010'; session uuid:=gen_random_uuid();
  other uuid:='f0000000-0000-4000-8000-0000000000b1'; cited uuid; beside uuid; slice uuid; result jsonb; token text; logged text;
begin
  -- Two cells on one seeded path: one cited, one beside it.
  select c.id into cited from public.cells c join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id
    join public.phases ph on ph.id=s.phase_id where ph.service_id=service order by c.path_id, c.step_id limit 1;
  select c.id into beside from public.cells c where c.path_id=(select path_id from public.cells where id=cited) and c.id<>cited limit 1;
  if beside is null then raise exception 'the fixture needs a second cell on the cited cell''s path'; end if;

  result:=public.run_agent_tool('create_slice',jsonb_build_object('title','A brief for two services','kind','custom','cell_ids',jsonb_build_array(cited,other)),session,service,true);
  slice:=(result->'result'->>'id')::uuid;
  if (select array_agg(cell_ids[1] order by position) from public.slides where slice_id=slice) is distinct from array[cited,other] then
    raise exception 'a slice across two services was not written whole';
  end if;
  perform public.run_agent_tool('replace_slides',jsonb_build_object('slice_id',slice,'slides',jsonb_build_array(
    jsonb_build_object('cells',jsonb_build_array(other),'title','Over there'),jsonb_build_object('cells',jsonb_build_array(cited)))),session,service,true);
  -- A write that is not a slice still stays inside its service.
  begin
    perform public.run_agent_tool('create_finding',jsonb_build_object('source','audit','check_key','cross','severity','info','impact','low','effort','low','summary','Across','cell_ids',jsonb_build_array(other)),session,service,true);
    raise exception 'a finding named another service''s cell';
  exception when others then if sqlerrm<>'A named cell belongs to another service.' then raise; end if; end;

  result:=public.run_agent_tool('share_slice',jsonb_build_object('slice_id',slice),session,service,true);
  token:=result->'result'->>'token';
  if result->>'outcome'<>'applied' or token !~ '^[0-9a-f]{64}$' then raise exception 'sharing returned %',result; end if;
  select string_agg(args::text||coalesce(revert::text,''),' ') into logged from public.authoring_changes where fn='share_slice';
  if logged is null then raise exception 'sharing left no change record'; end if;
  if position(token in logged)>0 then raise exception 'the change log holds a working link'; end if;
  insert into shared_link values (slice,token,beside,cited);

  -- Someone who may not approve records a proposal; no link is made.
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  result:=public.run_agent_tool('share_slice',jsonb_build_object('slice_id',slice),session,service,true);
  if result->>'outcome'<>'proposed' or result::text like '%token%' then raise exception 'a contributor made a link: %',result; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
end $$;

-- The table of links is no request role's to read.
do $$ begin
  perform 1 from public.slice_shares;
  raise exception 'a signed-in person read the links table';
exception when insufficient_privilege then null; end $$;

reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
do $$
declare link shared_link; seen jsonb; ids uuid[];
begin
  select * into link from shared_link;
  seen:=public.read_shared_slice(link.token);
  select array_agg((cell.item->>'id')::uuid order by s.ord, cell.ord) into ids
    from jsonb_array_elements(seen->'slides') with ordinality s(slide,ord),
         jsonb_array_elements(s.slide->'cells') with ordinality cell(item,ord);
  if ids is distinct from array['f0000000-0000-4000-8000-0000000000b1'::uuid,link.cited] then raise exception 'the link opened %',ids; end if;
  if seen::text like '%Second service, not cited%' then raise exception 'the link showed another service''s uncited cell'; end if;
  if seen::text like '%'||link.beside||'%' then raise exception 'the link showed the cell beside a cited one'; end if;
  if seen->'slides'->0->'cells'->0->>'service'<>'A second service' then raise exception 'a cited cell does not say its service'; end if;
  begin perform 1 from public.slice_shares; raise exception 'anon read the links table';
  exception when insufficient_privilege then null; end;
end $$;

-- A changed cell shows its new value through the link.
reset role;
update public.cells set content='Second service, cited and revised' where id='f0000000-0000-4000-8000-0000000000b1';
set local role anon;
do $$ begin
  if public.read_shared_slice((select token from shared_link))::text not like '%cited and revised%' then raise exception 'the link showed a stale value'; end if;
end $$;

-- Unsharing stops the link; a second unshare has nothing to stop.
reset role;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare result jsonb; slice uuid:=(select slice from shared_link);
begin
  result:=public.run_agent_tool('unshare_slice',jsonb_build_object('slice_id',slice),gen_random_uuid(),'f0000000-0000-4000-8000-000000000010',true);
  if (result->'result'->>'links_stopped')::int<>1 then raise exception 'unsharing returned %',result; end if;
  begin
    perform public.run_agent_tool('unshare_slice',jsonb_build_object('slice_id',slice),gen_random_uuid(),'f0000000-0000-4000-8000-000000000010',true);
    raise exception 'a second unshare stopped something';
  exception when others then if sqlerrm not like 'This slice has no working link%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
do $$ begin
  perform public.read_shared_slice((select token from shared_link));
  raise exception 'a revoked link still opened';
exception when sqlstate 'PT404' then null; end $$;
rollback;
