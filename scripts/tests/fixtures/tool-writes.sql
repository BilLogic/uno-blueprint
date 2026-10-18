-- Synthetic profiles for the MCP write seam; scratch databases only.
insert into auth.users(id,email) values
 ('c0000000-0000-4000-8000-000000000001','reviewer@example.test'),
 ('c0000000-0000-4000-8000-000000000002','contributor@example.test') on conflict(id) do nothing;
insert into public.stakeholders(id,name,kind) values
 ('e0000000-0000-4000-8000-000000000001','Reviewing partner','partner'),
 ('e0000000-0000-4000-8000-000000000002','Contributing colleague','staff') on conflict(id) do nothing;
insert into public.profiles(id,stakeholder_id,user_id,display_name,may_confirm) values
 ('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Reviewer',true),
 ('b0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','Contributor',false);

-- A source whose actual copy exceeds the cell cap, despite naming one id.
do $$ declare scenario uuid; step uuid; lane uuid; i int; begin
  select scenario_id,id into scenario,step from public.steps order by id limit 1;
  insert into public.paths(id,scenario_id,name,kind) values
    ('d0000000-0000-4000-8000-000000000050',scenario,'Large copy source','variant');
  insert into public.path_steps(path_id,step_id,position) values('d0000000-0000-4000-8000-000000000050',step,0);
  for i in 1..51 loop
    insert into public.lanes(path_id,name,lane_role,position) values
      ('d0000000-0000-4000-8000-000000000050','Fixture actor '||i,'frontstage_actions',i-1) returning id into lane;
    insert into public.cells(path_id,lane_id,step_id,content) values
      ('d0000000-0000-4000-8000-000000000050',lane,step,'A fixture action');
  end loop;
end $$;
