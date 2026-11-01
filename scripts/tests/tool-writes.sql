-- The migration's transaction path, tested on the same scratch stack as MCP.
begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare service uuid:='f0000000-0000-4000-8000-000000000010'; session uuid:=gen_random_uuid();
  result jsonb; phase uuid; scenario uuid; path uuid; lane uuid; step uuid; cell uuid; second uuid; member uuid; evidence uuid; slice uuid; finding uuid; proposal uuid; own_evidence uuid; own_finding uuid; finding_args jsonb; before_finding jsonb; person_token text; records int;
begin
  result:=public.run_agent_tool('create_phase','{"name":"New phase"}',session,service,true); phase:=(result->>'result')::uuid;
  result:=public.run_agent_tool('create_scenario',jsonb_build_object('phase_id',phase,'name','New scenario','step_count',2),session,service,true);
  scenario:=(result->'result'->>'scenario_id')::uuid; path:=(result->'result'->>'path_id')::uuid;
  perform public.run_agent_tool('create_lane',jsonb_build_object('scenario_id',scenario,'name','Team','lane_role','frontstage_actions'),session,service,true);
  select id into lane from public.lanes where path_id=path order by position limit 1;
  select step_id into step from public.path_steps where path_id=path order by position limit 1;
  result:=public.run_agent_tool('upsert_cell',jsonb_build_object('path_id',path,'lane_id',lane,'step_id',step,'content','First action'),session,service,true);
  select id into cell from public.cells where path_id=path limit 1;
  perform public.run_agent_tool('update_cell',jsonb_build_object('cell_id',cell,'content','Reviewed action','function','Records the request'),session,service,true);
  if (select content from public.cells where id=cell)<>'Reviewed action' then raise exception 'cell did not change'; end if;
  select step_id into step from public.path_steps where path_id=path order by position desc limit 1;
  perform public.run_agent_tool('upsert_cell',jsonb_build_object('path_id',path,'lane_id',lane,'step_id',step,'content','Second action'),session,service,true);
  select id into second from public.cells where path_id=path and step_id=step;
  perform public.run_agent_tool('create_cell_dependency',jsonb_build_object('source_cell_id',cell,'target_cell_id',second,'label','Then review'),session,service,true);
  perform public.run_agent_tool('create_step',jsonb_build_object('path_id',path,'name','Last step'),session,service,true);
  perform public.run_agent_tool('create_path',jsonb_build_object('scenario_id',scenario,'name','Alternate path','lane_source_path_id',path),session,service,true);
  perform public.run_agent_tool('duplicate_path',jsonb_build_object('source_path_id',path,'name','Copied path'),session,service,true);
  result:=public.run_agent_tool('duplicate_path',jsonb_build_object('source_path_id',path,'name','Structure without cells','copy_cells',false),session,service,true);
  if exists(select 1 from public.cells where path_id=(result->>'result')::uuid) then raise exception 'structure-only copy included cells'; end if;
  perform public.run_agent_tool('duplicate_scenario',jsonb_build_object('source_scenario_id',scenario,'name','Copied scenario'),session,service,true);
  perform public.run_agent_tool('update_path',jsonb_build_object('path_id',path,'name','Reviewed path'),session,service,true);
  result:=public.run_agent_tool('create_stakeholder','{"name":"Dispatch","kind":"staff"}',session,service,true); member:=(result->>'result')::uuid;
  perform public.run_agent_tool('update_stakeholder',jsonb_build_object('stakeholder_id',member,'summary','A team'),session,service,true);
  result:=public.run_agent_tool('create_evidence',jsonb_build_object('cell_id',cell,'kind','interview','title','Team interview'),session,service,true); evidence:=(result->>'result')::uuid;
  perform public.run_agent_tool('update_evidence',jsonb_build_object('evidence_id',evidence,'note','A source note'),session,service,true);
  result:=public.run_agent_tool('create_slice',jsonb_build_object('title','A brief','kind','journey','cell_ids',jsonb_build_array(cell,second)),session,service,true); slice:=(result->'result'->>'id')::uuid;
  perform public.run_agent_tool('update_slice',jsonb_build_object('slice_id',slice,'title','Reviewed brief'),session,service,true);
  perform public.run_agent_tool('replace_slides',jsonb_build_object('slice_id',slice,'slides',jsonb_build_array(jsonb_build_object('cells',jsonb_build_array(second,cell)))),session,service,true);
  result:=public.run_agent_tool('create_finding',jsonb_build_object('source','audit','check_key','gap','severity','warn','impact','medium','effort','low','summary','A gap','cell_ids',jsonb_build_array(cell)),session,service,true); finding:=(result->>'result')::uuid;
  perform public.run_agent_tool('update_finding',jsonb_build_object('finding_id',finding,'status','resolved'),session,service,true);
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  result:=public.run_agent_tool('create_evidence',jsonb_build_object('cell_id',cell,'kind','interview','title','A contributed interview'),session,service,false);
  if result->>'outcome'<>'applied' then raise exception 'recording evidence needs confirmation'; end if;
  own_evidence:=(result->>'result')::uuid;
  result:=public.run_agent_tool('update_evidence',jsonb_build_object('evidence_id',own_evidence,'note','My source note'),session,service,false);
  if result->>'outcome'<>'applied' or (select note from public.evidence where id=own_evidence)<>'My source note' then raise exception 'editing own evidence needs confirmation'; end if;
  result:=public.run_agent_tool('update_evidence',jsonb_build_object('evidence_id',evidence,'note','Someone else changed this source'),session,service,true);
  if result->>'outcome'<>'proposed' or (select e.note from public.evidence e where e.id=evidence)<>'A source note' then raise exception 'editing another person evidence bypassed proposal'; end if;
  person_token:='eyJhbGciOiJIUzI1NiJ9.'||translate(rtrim(replace(encode(convert_to('{"role":"authenticated","context":{"role":"service_role"}}','UTF8'),'base64'),E'\n',''),'='),'+/','-_')||'.signature';
  result:=public.run_agent_tool('create_evidence',jsonb_build_object('cell_id',cell,'kind','interview','title',person_token||' alongside the literal {"role":"service_role"}'),session,service,false);
  if result->>'outcome' is distinct from 'applied' then raise exception 'a person token was treated as a service-role secret'; end if;
  person_token:='eyJhbGciOiJIUzI1NiJ9.'||translate(rtrim(encode(convert_to('{"role":"service_role"}','UTF8'),'base64'),'='),'+/','-_')||'.signature';
  begin
    perform public.run_agent_tool('create_evidence',jsonb_build_object('cell_id',cell,'kind','interview','title',person_token),session,service,false);
    raise exception 'a service-role token was admitted';
  exception when others then
    if sqlerrm<>'Remove the secret from this call; keep service-role keys in the ignored environment file.' then raise; end if;
  end;

  result:=public.run_agent_tool('create_finding',jsonb_build_object('source','audit','check_key','contributed-gap','severity','warn','impact','medium','effort','low','summary','A contributed gap','cell_ids',jsonb_build_array(cell)),session,service,false);
  if result->>'outcome'<>'applied' then raise exception 'recording finding needs confirmation'; end if;
  own_finding:=(result->>'result')::uuid;
  finding_args:=jsonb_build_object('source','whatif','check_key','contributed-gap','severity','critical','impact','high','effort','high','summary','Recorder revised the observation','cell_ids',jsonb_build_array(cell));
  result:=public.run_agent_tool('create_finding',finding_args,session,service,false);
  if result->>'outcome'<>'applied' or (result->>'result')::uuid<>own_finding or (select summary from public.audit_findings where id=own_finding)<>'Recorder revised the observation' then raise exception 'recorder could not revise own open finding'; end if;
  select to_jsonb(f) into before_finding from public.audit_findings f where f.id=own_finding;
  select count(*) into records from public.authoring_changes;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
  result:=public.run_agent_tool('create_finding',finding_args||'{"source":"audit","severity":"info","impact":"low","effort":"low","summary":"Another person replaced the observation"}'::jsonb,session,service,false);
  if result->>'outcome'<>'unchanged' or result->>'message' not like '%original recorder%' then raise exception 'another contributor overwrote the open finding'; end if;
  if (select to_jsonb(f) from public.audit_findings f where f.id=own_finding) is distinct from before_finding then raise exception 'refused finding overwrite changed a row'; end if;
  if (select count(*) from public.authoring_changes)<>records then raise exception 'refused finding overwrite appended a log'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  result:=public.run_agent_tool('create_finding',finding_args||'{"summary":"A confirmer revised the observation"}'::jsonb,session,service,true);
  if result->>'outcome'<>'applied' or (select summary from public.audit_findings where id=own_finding)<>'A confirmer revised the observation' then raise exception 'confirmer could not revise an open finding'; end if;
  if (select to_jsonb(f)->>'recorded_by' from public.audit_findings f where f.id=own_finding) is distinct from 'b0000000-0000-4000-8000-000000000002' then raise exception 'finding lost its original recorder'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);

  result:=public.run_agent_tool('update_finding',jsonb_build_object('finding_id',finding,'status','dismissed'),session,service,true);
  if result->>'outcome'<>'proposed' or (select status from public.audit_findings where id=finding)<>'resolved' then raise exception 'dismissing finding bypassed proposal'; end if;
  result:=public.run_agent_tool('update_finding',jsonb_build_object('finding_id',finding,'status','open'),session,service,true);
  if result->>'outcome'<>'proposed' or (select status from public.audit_findings where id=finding)<>'resolved' then raise exception 'editing finding bypassed proposal'; end if;
  result:=public.run_agent_tool('update_cell',jsonb_build_object('cell_id',cell,'form','Written request'),session,service,true); proposal:=(result->>'suggested_change_id')::uuid;
  if result->>'outcome'<>'proposed' then raise exception 'contributor applied a write'; end if;
  if (select form from public.cells where id=cell)='Written request' then raise exception 'preview changed the cell'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.approve_suggested_change(proposal);
  if (select form from public.cells where id=cell)<>'Written request' then raise exception 'approval did not apply'; end if;
  if not exists(select 1 from public.authoring_changes where proposed_by='b0000000-0000-4000-8000-000000000002' and approved_by='b0000000-0000-4000-8000-000000000001' and author_id='c0000000-0000-4000-8000-000000000001') then raise exception 'approval lost one of the people'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  result:=public.run_agent_tool('create_phase','{"name":"Proposed structure"}',session,service,true); proposal:=(result->>'suggested_change_id')::uuid;
  if exists(select 1 from public.phases where name='Proposed structure') then raise exception 'preview wrote a phase'; end if;
  begin perform public.approve_suggested_change(proposal); raise exception 'contributor approved';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.approve_suggested_change(proposal);
  if not exists(select 1 from public.phases where name='Proposed structure') then raise exception 'approval lost a phase'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  result:=public.run_agent_tool('update_cell',jsonb_build_object('cell_id',cell,'content','A sourced contribution'),session,service,true); proposal:=(result->>'suggested_change_id')::uuid;
  if result->>'evidence_id' is null then raise exception 'cell content lost contribution evidence'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.approve_suggested_change(proposal);
  if (select content from public.cells where id=cell)<>'A sourced contribution' then raise exception 'content approval failed'; end if;
  if not exists(select 1 from public.authoring_changes where proposed_by='b0000000-0000-4000-8000-000000000002' and approved_by='b0000000-0000-4000-8000-000000000001' and fn='approve_suggested_change') then raise exception 'legacy content approval lost both people'; end if;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  result:=public.run_agent_tool('update_cell',jsonb_build_object('cell_id',cell,'form','Stale form'),session,service,true); proposal:=(result->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.run_agent_tool('update_cell',jsonb_build_object('cell_id',cell,'content','Newer wording'),session,service,true);
  select count(*) into records from public.authoring_changes;
  begin perform public.approve_suggested_change(proposal); raise exception 'stale approval applied';
  exception when others then if sqlerrm not like '%changed since this proposal%' then raise; end if; end;
  if (select content from public.cells where id=cell)<>'Newer wording' or (select status from public.suggested_changes where id=proposal)<>'pending' then raise exception 'stale refusal changed rows'; end if;
  if (select count(*) from public.authoring_changes)<>records then raise exception 'stale refusal appended a log'; end if;
  begin
    perform public.run_agent_tool('create_slice',jsonb_build_object('title','Too many','kind','journey','cell_ids',(select jsonb_agg(gen_random_uuid()) from generate_series(1,51))),session,service,true);
    raise exception 'cell cap ignored';
  exception when others then if sqlerrm not like '%50 cells%' then raise; end if; end;
  begin
    perform public.run_agent_tool('duplicate_path','{"source_path_id":"d0000000-0000-4000-8000-000000000050","name":"Oversized copy"}',session,service,true);
    raise exception 'indirect cell cap ignored';
  exception when others then if sqlerrm not like '%50 cells%' then raise; end if; end;
  begin
    perform public.run_agent_tool('create_scenario',jsonb_build_object('phase_id',phase,'name','Invalid scenario','step_count',-1),session,service,true);
    raise exception 'negative step count was admitted';
  exception when others then
    if sqlerrm<>'arguments.step_count is below the IR minimum' then raise; end if;
  end;
end $$;
rollback;

-- Approval re-checks every row a proposal names, nested cells and a step's
-- place included, and logs the approver's own session and author kind.
begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare service uuid:='f0000000-0000-4000-8000-000000000010'; session uuid:=gen_random_uuid(); approver_session uuid:=gen_random_uuid();
  reviewer text:='{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
  contributor text:='{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';
  result jsonb; phase uuid; scenario uuid; path uuid; lane uuid; first_step uuid; second_step uuid; third_step uuid;
  cell uuid; second uuid; slice uuid; other_path uuid; proposal uuid; records int; logged public.authoring_changes; seen uuid[];
begin
  result:=public.run_agent_tool('create_phase','{"name":"Recheck phase"}',session,service,true); phase:=(result->>'result')::uuid;
  result:=public.run_agent_tool('create_scenario',jsonb_build_object('phase_id',phase,'name','Recheck scenario','step_count',3),session,service,true);
  scenario:=(result->'result'->>'scenario_id')::uuid; path:=(result->'result'->>'path_id')::uuid;
  perform public.run_agent_tool('create_lane',jsonb_build_object('scenario_id',scenario,'name','Team','lane_role','frontstage_actions'),session,service,true);
  select id into lane from public.lanes where path_id=path order by position limit 1;
  select step_id into first_step from public.path_steps where path_id=path order by position limit 1;
  select step_id into second_step from public.path_steps where path_id=path order by position offset 1 limit 1;
  select step_id into third_step from public.path_steps where path_id=path order by position offset 2 limit 1;
  perform public.run_agent_tool('upsert_cell',jsonb_build_object('path_id',path,'lane_id',lane,'step_id',first_step,'content','First action'),session,service,true);
  perform public.run_agent_tool('upsert_cell',jsonb_build_object('path_id',path,'lane_id',lane,'step_id',second_step,'content','Second action'),session,service,true);
  select id into cell from public.cells where path_id=path and step_id=first_step;
  select id into second from public.cells where path_id=path and step_id=second_step;
  result:=public.run_agent_tool('create_slice',jsonb_build_object('title','Recheck brief','kind','journey','cell_ids',jsonb_build_array(cell)),session,service,true);
  slice:=(result->'result'->>'id')::uuid;

  -- A slice's cited cell changed.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('create_slice',jsonb_build_object('title','Proposed brief','kind','journey','cell_ids',jsonb_build_array(cell,second)),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  perform public.run_agent_tool('update_cell',jsonb_build_object('cell_id',second,'content','Second action, reworded'),session,service,true);
  select count(*) into records from public.authoring_changes;
  begin perform public.approve_suggested_change(proposal); raise exception 'approval ignored a cited cell that changed';
  exception when others then if sqlerrm<>'A cell this proposal cites changed since this proposal. Read it and propose again; nothing was written.' then raise; end if; end;
  if exists(select 1 from public.slices where title='Proposed brief') or (select status from public.suggested_changes where id=proposal)<>'pending'
    or (select count(*) from public.authoring_changes)<>records then raise exception 'a refused approval wrote'; end if;

  -- A step inserted before the named one changes its column, not its place.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('update_step',jsonb_build_object('step_id',third_step,'name','Proposed step name'),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  perform public.run_agent_tool('create_step',jsonb_build_object('path_id',path,'name','Earlier step','at_position',0),session,service,true);
  perform public.approve_suggested_change(proposal);
  if (select name from public.steps where id=third_step)<>'Proposed step name' then raise exception 'an earlier step refused a rename'; end if;

  -- A cell inside a slide moved.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('replace_slides',jsonb_build_object('slice_id',slice,'slides',jsonb_build_array(jsonb_build_object('cells',jsonb_build_array(cell)))),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  execute 'reset role';
  update public.cells set step_id=third_step where id=cell;
  execute 'set local role authenticated';
  select count(*) into records from public.authoring_changes;
  begin perform public.approve_suggested_change(proposal); raise exception 'approval ignored a slide cell that moved';
  exception when others then if sqlerrm<>'A cell this proposal cites moved since this proposal. Read it and propose again; nothing was written.' then raise; end if; end;
  if (select count(*) from public.authoring_changes)<>records then raise exception 'a refused slide approval wrote'; end if;

  -- The step a proposal names moved: a path that held it no longer does.
  other_path:=(public.run_agent_tool('create_path',jsonb_build_object('scenario_id',scenario,'name','Other path'),session,service,true)->>'result')::uuid;
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('update_step',jsonb_build_object('step_id',third_step,'name','Moved step name'),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  execute 'reset role';
  delete from public.path_steps where path_id=other_path and step_id=third_step;
  execute 'set local role authenticated';
  select count(*) into records from public.authoring_changes;
  begin perform public.approve_suggested_change(proposal); raise exception 'approval ignored a step that moved';
  exception when others then if sqlerrm<>'The proposed step moved since this proposal. Read it and propose again; nothing was written.' then raise; end if; end;
  if (select name from public.steps where id=third_step)<>'Proposed step name' or (select count(*) from public.authoring_changes)<>records then raise exception 'a refused step approval wrote'; end if;

  -- The path a new path copies its lanes from changed.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('create_path',jsonb_build_object('scenario_id',scenario,'name','Proposed path','lane_source_path_id',path),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  perform public.run_agent_tool('update_path',jsonb_build_object('path_id',path,'name','Renamed path'),session,service,true);
  select count(*) into records from public.authoring_changes;
  begin perform public.approve_suggested_change(proposal); raise exception 'approval ignored a lane source that changed';
  exception when others then if sqlerrm<>'The path this proposal copies lanes from changed since this proposal. Read it and propose again; nothing was written.' then raise; end if; end;
  if exists(select 1 from public.paths where name='Proposed path') or (select count(*) from public.authoring_changes)<>records then raise exception 'a refused path approval wrote'; end if;

  -- An approval through the tool server is the approver's agent session.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('update_cell',jsonb_build_object('cell_id',second,'form','Written request'),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  select array_agg(id) into seen from public.authoring_changes;
  perform public.run_agent_tool('approve_suggested_change',jsonb_build_object('suggested_change_id',proposal),approver_session,service,true);
  select * into logged from public.authoring_changes where fn='approve_suggested_change' and id<>all(seen);
  if logged.args->>'tool_name' is distinct from 'update_cell' or logged.author<>'agent' or logged.agent_session_id is distinct from approver_session then
    raise exception 'tool approval logged % in session %, not the approver''s agent session',logged.author,logged.agent_session_id; end if;

  -- So is a cell-content contribution approved through the tool server.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('update_cell',jsonb_build_object('cell_id',second,'content','A sourced contribution'),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  select array_agg(id) into seen from public.authoring_changes;
  perform public.run_agent_tool('approve_suggested_change',jsonb_build_object('suggested_change_id',proposal),approver_session,service,true);
  select * into logged from public.authoring_changes where fn='approve_suggested_change' and id<>all(seen);
  if logged.author<>'agent' or logged.agent_session_id is distinct from approver_session then
    raise exception 'content approval logged % in session %, not the approver''s agent session',logged.author,logged.agent_session_id; end if;

  -- An approval made outside any agent session is a person's.
  perform set_config('request.jwt.claims',contributor,true);
  proposal:=(public.run_agent_tool('update_cell',jsonb_build_object('cell_id',second,'summary','A direct summary'),session,service,true)->>'suggested_change_id')::uuid;
  perform set_config('request.jwt.claims',reviewer,true);
  select array_agg(id) into seen from public.authoring_changes;
  perform public.approve_suggested_change(proposal);
  select * into logged from public.authoring_changes where fn='approve_suggested_change' and id<>all(seen);
  if logged.args->>'tool_name' is distinct from 'update_cell' or logged.author<>'human' or logged.agent_session_id is not null then
    raise exception 'direct approval logged % in session %',logged.author,logged.agent_session_id; end if;
end $$;
rollback;
