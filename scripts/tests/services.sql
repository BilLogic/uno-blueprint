begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare result jsonb; service uuid; session uuid:=gen_random_uuid(); begin
  result:=public.run_agent_tool('create_service','{"name":"Request support","summary":"Help with an existing request"}',session,null,true);
  if result->>'outcome'<>'applied' then raise exception 'A confirmer did not create the service'; end if;
  service:=(result->>'result')::uuid;
  if not exists(select 1 from public.services where id=service and name='Request support') then raise exception 'Service is not readable as its caller'; end if;
  perform public.run_agent_tool('create_phase','{"name":"Arrival"}',session,service,true);
  if not exists(select 1 from public.phases where service_id=service and name='Arrival') then raise exception 'The returned service id cannot hold a phase'; end if;
  if not exists(select 1 from public.authoring_changes where fn='create_service' and author_id='c0000000-0000-4000-8000-000000000001' and agent_session_id=session) then raise exception 'Service creation has no caller attribution'; end if;
end $$;
do $$ declare proposal jsonb; applied jsonb; n int; begin
  select count(*) into n from public.services;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  proposal:=public.run_agent_tool('create_service','{"name":"Another offering"}',gen_random_uuid(),null,true);
  if proposal->>'outcome'<>'proposed' or (select count(*) from public.services)<>n then raise exception 'A contributor changed services instead of proposing'; end if;
  if not exists(select 1 from public.suggested_changes where id=(proposal->>'suggested_change_id')::uuid and suggested_by='b0000000-0000-4000-8000-000000000002') then raise exception 'Proposal lost its recorder'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  applied:=public.approve_suggested_change((proposal->>'suggested_change_id')::uuid);
  if applied->>'outcome'<>'applied' or (select count(*) from public.services)<>n+1 then raise exception 'A confirmer cannot approve the proposed service'; end if;
  begin
    perform public.run_agent_tool('create_phase','{"name":"No service"}',gen_random_uuid(),null,true);
    raise exception 'Missing service was accepted';
  exception when raise_exception then
    if position('create_service' in sqlerrm)=0 then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
  begin
    perform public.run_agent_tool('create_service','{"name":"Unlinked person"}',gen_random_uuid(),null,true);
    raise exception 'An unlinked identity created a service';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.services where name='Unlinked person') then raise exception 'Unlinked write reached this business'; end if;
end $$;
select 'services_checked='||count(*) from public.services;
rollback;
