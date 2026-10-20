begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare target public.cells; previous jsonb; log public.authoring_changes; result jsonb; suggestion uuid; n int; begin
  select * into target from public.cells order by id limit 1;
  select to_jsonb(target) into previous;
  result:=public.run_agent_tool('update_cell',jsonb_build_object('cell_id',target.id,'content','A new request action'),gen_random_uuid(),null,true);
  if result->>'outcome'<>'applied' then raise exception 'The write was not applied'; end if;
  select * into log from public.authoring_changes where fn='update_cell' and args->>'cell_id'=target.id::text order by at desc limit 1;
  if log.author_id is distinct from auth.uid() then raise exception 'The log lost the caller'; end if;
  if log.revert->>'kind' is distinct from 'captured_rows' then raise exception 'The server write did not capture inverse data'; end if;
  if not exists(select 1 from jsonb_array_elements(log.revert->'rows') r where r->>'table'='cells' and r->'before'=previous and r->'after'->>'content'='A new request action') then
    raise exception 'The prior cell was not captured verbatim'; end if;
  if not exists(select 1 from jsonb_array_elements(log.revert->'rows') r where r->>'table'='cell_touchpoints' and r->'before'->>'summary'='A prior placement description' and r->'before'->>'touchpoint_id' is not null and r->'after'->>'touchpoint_id' is null) then
    raise exception 'Changed touchpoint placements were not captured'; end if;
  select count(*) into n from public.authoring_changes;
  perform public.run_agent_tool('update_cell',jsonb_build_object('cell_id',target.id,'summary','Preview only'),gen_random_uuid(),null,false);
  if (select count(*) from public.authoring_changes)<>n then raise exception 'A preview left a log row'; end if;
  if (select content from public.cells where id=target.id)<>'A new request action' then raise exception 'A preview changed the cell'; end if;
  result:=public.record_contribution(target.id,'Fixture conversation','A proposed action','A proposed action');
  suggestion:=(result->>'suggested_change_id')::uuid;
  perform public.approve_suggested_change(suggestion);
  if not exists(select 1 from public.authoring_changes where fn='approve_suggested_change' and args->>'cell_id'=target.id::text and revert->'args'->'update'->>'content'='A new request action') then
    raise exception 'The approval lost its distinct label or prior content'; end if;
  result:=public.run_agent_tool('update_cell',jsonb_build_object('cell_id',target.id,'summary','A proposed summary'),gen_random_uuid(),null,false);
  suggestion:=(result->>'suggested_change_id')::uuid;
  perform public.approve_suggested_change(suggestion);
  if not exists(select 1 from public.authoring_changes where fn='approve_suggested_change' and args->>'tool_name'='update_cell' and revert->>'kind'='captured_rows') then
    raise exception 'A tool approval lost its distinct label or captured rows'; end if;
end $$;
select 'authoring_rows=' || count(*) from public.authoring_changes;
rollback;
