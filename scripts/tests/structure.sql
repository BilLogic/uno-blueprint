begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare service uuid; phase uuid; scenario uuid; path uuid; step uuid; lane uuid;
  result jsonb; proposal jsonb; item record; prior text; after_name text; session uuid:=gen_random_uuid(); checked int:=0; wrong_service uuid; failure text; bad record;
begin
  result:=public.run_agent_tool('create_service','{"name":"Structure test only"}',session,null,true);
  service:=(result->>'result')::uuid;
  result:=public.run_agent_tool('create_phase','{"name":"Initial phase"}',session,service,true);
  phase:=(result->>'result')::uuid;
  result:=public.run_agent_tool('create_scenario',jsonb_build_object('phase_id',phase,'name','Initial scenario','step_names',jsonb_build_array('Choose support','Describe request')),session,service,true);
  scenario:=(result->'result'->>'scenario_id')::uuid; path:=(result->'result'->>'path_id')::uuid;
  if (select array_agg(s.name order by ps.position) from public.steps s join public.path_steps ps on ps.step_id=s.id where ps.path_id=path) is distinct from array['Choose support','Describe request'] then raise exception 'Initial names did not persist in order'; end if;
  result:=public.run_agent_tool('create_step',jsonb_build_object('path_id',path,'name','Receive answer'),session,service,true);
  step:=(result->>'result')::uuid;
  perform public.run_agent_tool('create_lane',jsonb_build_object('scenario_id',scenario,'name','Initial lane'),session,service,true);
  select id into strict lane from public.lanes where path_id=path and name='Initial lane';
  wrong_service:=(public.run_agent_tool('create_service','{"name":"Other test only service"}',session,null,true)->>'result')::uuid;
  for item in select * from (values ('phase',phase,'phases'),('scenario',scenario,'scenarios'),('step',step,'steps'),('lane',lane,'lanes')) t(level,id,tab) loop
    execute format('select name from public.%I where id=$1',item.tab) into prior using item.id;
    if item.level in ('step','lane') then
      for bad in select * from (values
        (gen_random_uuid(),'Missing',service,'no longer exists'),
        (item.id,'   ',service,'blank'),
        (item.id,'Outside scope',wrong_service,'another service')
      ) t(id,name,service_id,reason) loop
        failure:=null;
        begin
          perform public.run_agent_tool('update_'||item.level,jsonb_build_object(item.level||'_id',bad.id,'name',bad.name),session,bad.service_id,true);
        exception when raise_exception then failure:=sqlerrm;
        end;
        if failure is null or position(bad.reason in failure)=0 then
          raise exception 'Expected actionable % refusal for %, got %',bad.reason,item.level,failure;
        end if;
        execute format('select name from public.%I where id=$1',item.tab) into after_name using item.id;
        if after_name is distinct from prior then raise exception 'A refused rename changed %',item.level; end if;
      end loop;
    end if;
    result:=public.run_agent_tool('update_'||item.level,jsonb_build_object(item.level||'_id',item.id,'name','Named '||item.level),session,service,true);
    if result->>'outcome'<>'applied' then raise exception 'Rename was not applied: %',item.level; end if;
    execute format('select name from public.%I where id=$1',item.tab) into after_name using item.id;
    if after_name<>'Named '||item.level then raise exception 'Rename did not persist: %',item.level; end if;
    if not exists(select 1 from public.authoring_changes c, jsonb_array_elements(c.revert->'rows') r where c.fn='update_'||item.level and c.author_id='c0000000-0000-4000-8000-000000000001' and c.agent_session_id=session and r->>'table'=item.tab and r->'before'->>'name'=prior) then raise exception 'Prior name or caller missing: %',item.level; end if;
    perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
    proposal:=public.run_agent_tool('update_'||item.level,jsonb_build_object(item.level||'_id',item.id,'name','Proposed '||item.level),session,service,true);
    if proposal->>'outcome'<>'proposed' then raise exception 'A contributor did not propose: %',item.level; end if;
    execute format('select name from public.%I where id=$1',item.tab) into after_name using item.id;
    if after_name<>'Named '||item.level then raise exception 'Preview changed a row: %',item.level; end if;
    perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
    perform public.approve_suggested_change((proposal->>'suggested_change_id')::uuid);
    execute format('select name from public.%I where id=$1',item.tab) into after_name using item.id;
    if after_name<>'Proposed '||item.level then raise exception 'Approval did not rename: %',item.level; end if;
    perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
    proposal:=public.run_agent_tool('update_'||item.level,jsonb_build_object(item.level||'_id',item.id,'name','Stale proposal'),session,service,true);
    perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
    perform public.run_agent_tool('update_'||item.level,jsonb_build_object(item.level||'_id',item.id,'name','Newer name'),session,service,true);
    begin
      perform public.approve_suggested_change((proposal->>'suggested_change_id')::uuid);
      raise exception 'A stale rename was accepted';
    exception when raise_exception then
      if sqlerrm='A stale rename was accepted' then raise; end if;
    end;
    execute format('select name from public.%I where id=$1',item.tab) into after_name using item.id;
    if after_name<>'Newer name' then raise exception 'A stale approval changed a name'; end if;
    checked:=checked+1;
  end loop;
  perform set_config('ub.structure_checked',checked::text,true);
end $$;
select 'structure_checked='||current_setting('ub.structure_checked');
rollback;

-- Explanations travel beside labels and retain their prior values in the log.
begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare service uuid; phase uuid; scenario uuid; path uuid; step uuid; result jsonb; item record; recorded jsonb;
begin
  service:=(public.run_agent_tool('create_service','{"name":"Summary test only"}',gen_random_uuid(),null,true)->>'result')::uuid;
  phase:=(public.run_agent_tool('create_phase','{"name":"Original phase","summary":"Original phase explanation"}',gen_random_uuid(),service,true)->>'result')::uuid;
  result:=public.run_agent_tool('create_scenario',jsonb_build_object('phase_id',phase,'name','Original scenario','summary','Original scenario explanation','step_names',jsonb_build_array('Arrival')),gen_random_uuid(),service,true);
  scenario:=(result->'result'->>'scenario_id')::uuid; path:=(result->'result'->>'path_id')::uuid;
  step:=(public.run_agent_tool('create_step',jsonb_build_object('path_id',path,'name','Original step','summary','Original step explanation'),gen_random_uuid(),service,true)->>'result')::uuid;
  if (select position from public.path_steps where path_id=path and step_id=step) is distinct from 1 then raise exception 'A new step did not append'; end if;
  for item in select * from (values ('phase',phase,'phases'),('scenario',scenario,'scenarios'),('step',step,'steps')) t(kind,id,tab) loop
    perform public.run_agent_tool('update_'||item.kind,jsonb_build_object(item.kind||'_id',item.id,'name','Short '||item.kind,'summary','New explanation for '||item.kind),gen_random_uuid(),service,true);
    execute format('select to_jsonb(t) from public.%I t where id=$1',item.tab) into recorded using item.id;
    if recorded->>'name' is distinct from ('Short '||item.kind) or recorded->>'summary' is distinct from ('New explanation for '||item.kind) then raise exception 'Name and summary did not land together for %',item.kind; end if;
    if not exists(select 1 from public.authoring_changes c, jsonb_array_elements(c.revert->'rows') entry where c.fn='update_'||item.kind and entry->>'table'=item.tab
      and entry->'before'->>'name'='Original '||item.kind and entry->'before'->>'summary'='Original '||item.kind||' explanation'
) then raise exception 'Both prior fields must be logged for %',item.kind; end if;
    if not exists(select 1 from public.authoring_changes c, jsonb_array_elements(c.revert->'rows') entry where c.fn='update_'||item.kind and entry->>'table'=item.tab and entry->'after'->>'name'='Short '||item.kind and entry->'after'->>'summary'='New explanation for '||item.kind) then raise exception 'Final fields must be logged for %',item.kind; end if;
    -- Omitted summary preserves the explanation, even for a deliberately long name.
    perform public.run_agent_tool('update_'||item.kind,jsonb_build_object(item.kind||'_id',item.id,'name','A person may choose a label longer than the guidance'),gen_random_uuid(),service,true);
    execute format('select to_jsonb(t) from public.%I t where id=$1',item.tab) into recorded using item.id;
    if recorded->>'summary' is distinct from ('New explanation for '||item.kind) then raise exception 'Omitting summary discarded it'; end if;
    perform public.run_agent_tool('update_'||item.kind,jsonb_build_object(item.kind||'_id',item.id,'name','Cleared summary','summary',''),gen_random_uuid(),service,true);
    execute format('select to_jsonb(t) from public.%I t where id=$1',item.tab) into recorded using item.id;
    if recorded->>'summary' is distinct from '' then raise exception 'Empty summary did not clear it'; end if;
  end loop;
end $$;
select 'structure_summaries_checked=3';
rollback;
