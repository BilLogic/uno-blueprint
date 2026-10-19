-- A server write and approval use the same transaction. Preview executes it
-- inside a rolled-back subtransaction: constraints and authoring guards run,
-- but neither the mutation nor its log survives proposal-time validation.
-- @core
alter table public.suggested_changes
  alter column cell_id drop not null,
  alter column proposed_content drop not null,
  add column tool_name text,
  add column tool_args jsonb,
  add column service_id uuid references public.services(id) on delete cascade,
  add column base_state jsonb,
  add constraint suggested_changes_payload check (
    (tool_name is null and cell_id is not null and proposed_content is not null and tool_args is null)
    or (tool_name is not null and tool_args is not null and jsonb_typeof(tool_args) = 'object')
  );
alter table public.authoring_changes
  add column proposed_by uuid references public.profiles(id) on delete set null,
  add column approved_by uuid references public.profiles(id) on delete set null;

alter table public.audit_findings
  add column recorded_by uuid references public.profiles(id) on delete set null;
comment on column public.audit_findings.recorded_by is
  'The profile that first recorded this finding through an agent tool. Null when the original recorder is unknown.';

-- The service rename left the phase RPC's parameter ambiguous beside the
-- renamed column. Qualify the parameter before the new boundary calls it.
do $$ declare body text; before text; begin
  body:=pg_get_functiondef('public.create_phase(uuid,text,text)'::regprocedure);
  before:=body;
  body:=replace(body,'p.service_id = service_id','p.service_id = create_phase.service_id');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
  body:=pg_get_functiondef('public.duplicate_scenario(uuid,text)'::regprocedure);
  before:=body;
  body:=replace(body,'kind, label, note','kind, name, note');
  if body=before then raise exception 'Expected duplicate-scenario column patch did not match'; end if;
  before:=body;
  body:=replace(body,'t.label','t.name');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
end $$;

-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Scenario name"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5)","minimum":1},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Step name"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- The tool schemas' JSON Schema subset. Kept in the database so callers cannot
-- bypass validation by posting directly to the transaction RPC.
create function public.agent_check_shape(p_value jsonb, p_schema jsonb, p_path text default 'arguments') returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare k text; v jsonb; s jsonb; ok boolean; t text;
begin
  if p_schema ? 'anyOf' then
    ok := false;
    for s in select value from jsonb_array_elements(p_schema->'anyOf') loop
      begin perform public.agent_check_shape(p_value,s,p_path); ok:=true; exception when others then null; end;
    end loop;
    if not ok then raise exception '% does not fit the tool schema',p_path; end if;
    return;
  end if;
  t:=p_schema->>'type';
  if t='integer' then
    if jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) then
      raise exception '% must be an integer',p_path;
    end if;
  elsif t is not null and jsonb_typeof(p_value)<>t then raise exception '% must be %',p_path,t;
  end if;
  if p_schema ? 'enum' and not (p_schema->'enum' @> jsonb_build_array(p_value)) then raise exception '% is outside the allowed vocabulary',p_path; end if;
  if p_schema ? 'minimum' and (p_value#>>'{}')::numeric < (p_schema->>'minimum')::numeric then raise exception '% is below the IR minimum',p_path; end if;
  if t='string' and length(p_value#>>'{}')<coalesce((p_schema->>'minLength')::int,0) then raise exception '% needs text',p_path; end if;
  if t='object' then
    for k in select jsonb_array_elements_text(coalesce(p_schema->'required','[]')) loop
      if not p_value ? k then raise exception '% needs %',p_path,k; end if;
    end loop;
    for k,v in select * from jsonb_each(p_value) loop
      s:=p_schema->'properties'->k;
      if s is null and p_schema->'additionalProperties'='false'::jsonb then raise exception '% has unknown field %',p_path,k; end if;
      if s is not null then perform public.agent_check_shape(v,s,p_path||'.'||k); end if;
    end loop;
  elsif t='array' then
    if jsonb_array_length(p_value)<coalesce((p_schema->>'minItems')::int,0) then raise exception '% needs members',p_path; end if;
    for v in select value from jsonb_array_elements(p_value) loop perform public.agent_check_shape(v,p_schema->'items',p_path||'[]'); end loop;
  end if;
end $$;

create function public.agent_named_cells(p_args jsonb) returns uuid[]
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare k text; v jsonb; ids uuid[]:='{}'; nested uuid[];
begin
  if jsonb_typeof(p_args)='array' then
    for v in select value from jsonb_array_elements(p_args) loop ids:=ids||public.agent_named_cells(v); end loop;
  elsif jsonb_typeof(p_args)='object' then
    for k,v in select * from jsonb_each(p_args) loop
      if k='cell_id' or k like '%\_cell_id' escape '\' then ids:=array_append(ids,(v#>>'{}')::uuid);
      elsif k in ('cell_ids','cells') and jsonb_typeof(v)='array' then
        select coalesce(array_agg(value::uuid),'{}') into nested from jsonb_array_elements_text(v); ids:=ids||nested;
      else ids:=ids||public.agent_named_cells(v); end if;
    end loop;
  end if;
  return array(select distinct unnest(ids));
end $$;

create function public.agent_refuse_secrets(p_args jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'The host must supply secret validation before applying agent tools.';
end $$;
-- @recipe — refuse a Supabase JWT whose own decoded role is service_role.
create or replace function public.agent_refuse_secrets(p_args jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare part text[]; payload jsonb; encoded text;
begin
  for part in select regexp_matches(p_args::text,'eyJ[A-Za-z0-9_-]{5,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{5,}','g') loop
    encoded:=translate(part[1],'-_','+/');
    begin payload:=convert_from(decode(rpad(encoded,((length(encoded)+3)/4)*4,'='),'base64'),'UTF8')::jsonb; exception when others then payload:='{}'; end;
    if payload->>'role'='service_role' then raise exception 'Remove the secret from this call; keep service-role keys in the ignored environment file.'; end if;
  end loop;
end $$;
-- @core

-- Capture the rows a proposal names. Lock them at approval, so a concurrent
-- edit cannot slip between the comparison and the normal write path.
create function public.agent_tool_state(p_args jsonb) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp as $$
declare state jsonb:='{}'; k text; v jsonb; tab text; row_data jsonb; id uuid;
begin
  for k,v in select * from jsonb_each(p_args) loop
    tab:=case k when 'cell_id' then 'cells' when 'source_cell_id' then 'cells' when 'target_cell_id' then 'cells' when 'path_id' then 'paths'
      when 'source_path_id' then 'paths' when 'source_scenario_id' then 'scenarios'
      when 'scenario_id' then 'scenarios' when 'phase_id' then 'phases'
      when 'stakeholder_id' then 'stakeholders' when 'evidence_id' then 'evidence'
      when 'slice_id' then 'slices' when 'finding_id' then 'audit_findings' end;
    if tab is not null then
      id:=(v#>>'{}')::uuid;
      execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into row_data using id;
      if row_data is null then raise exception 'The % no longer exists; read the blueprint and propose again.',replace(k,'_id',''); end if;
      state:=state||jsonb_build_object(k,row_data);
    end if;
  end loop;
  return state;
end $$;

create function public.agent_tool_transaction(p_tool text,p_args jsonb,p_service_id uuid,p_session_id uuid,
  p_preview boolean,p_proposer uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  a jsonb:=p_args; result jsonb; id uuid; before_cell public.cells;
  ids uuid[]; n int; value jsonb; slides jsonb; sid uuid; profile uuid:=public.caller_profile_id();
  old_gate text:=current_setting('ub.agent_transaction',true); state jsonb; free boolean; v_fingerprint text; existing public.audit_findings;
begin
  if profile is null then raise exception 'Sign in with a linked profile before writing.' using errcode='42501'; end if;
  perform public.agent_refuse_secrets(a);
  if public.agent_write_contracts()->p_tool is null then raise exception 'No write tool named %',p_tool; end if;
  perform public.agent_check_shape(a,public.agent_write_contracts()->p_tool);
  -- IR numeric fields are whole positions; scale advice is never a cap.
  if a ? 'at_position' and ((a->>'at_position')::numeric<0 or (a->>'at_position')::numeric<>trunc((a->>'at_position')::numeric)) then raise exception 'at_position must be a non-negative integer'; end if;
  if a ? 'step_count' and ((a->>'step_count')::numeric<1 or (a->>'step_count')::numeric<>trunc((a->>'step_count')::numeric)) then raise exception 'step_count must be a positive integer'; end if;
  for value in select val from jsonb_each(a) x(key,val) where key in ('name','title','content','summary','function','form','owner','perceived_owner') loop
    if btrim(value#>>'{}')='' then raise exception 'Name the text to write; blank text does not replace an existing value.'; end if;
  end loop;
  state:=public.agent_tool_state(a);
  free:=p_tool in ('create_finding','create_evidence') or (p_tool='update_evidence' and exists(
    select 1 from public.evidence e where e.id=(a->>'evidence_id')::uuid and e.contributed_by=profile));
  if not p_preview and not free then perform public.confirming_profile_id(); end if;
  ids:=public.agent_named_cells(a);
  n:=cardinality(ids);
  if p_tool='duplicate_path' and coalesce((a->>'copy_cells')::boolean,true) then select count(*) into n from public.cells where path_id=(a->>'source_path_id')::uuid;
  elsif p_tool='duplicate_scenario' then select count(*) into n from public.cells c join public.paths p on p.id=c.path_id where p.scenario_id=(a->>'source_scenario_id')::uuid; end if;
  if n>50 then raise exception 'This call touches more than 50 cells. Split it into calls touching at most 50 cells each.'; end if;
  if exists(select 1 from unnest(ids) x where not exists(select 1 from public.cells c where c.id=x)) then raise exception 'A named cell no longer exists; read the blueprint and try again.'; end if;
  if p_service_id is not null and exists(select 1 from public.cells c join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id join public.phases ph on ph.id=s.phase_id where c.id=any(ids) and ph.service_id<>p_service_id) then raise exception 'A named cell belongs to another service.'; end if;
  -- The private gate widens legacy authoring RPCs only inside this checked
  -- transaction. It never alters a JWT or a person's stored permissions.
  begin
    perform set_config('ub.agent_transaction','on',true);
    case p_tool
      when 'create_phase' then
        if p_service_id is null then raise exception 'Pass service_id from list_blueprint before creating under a service.'; end if;
        result:=to_jsonb(public.create_phase(p_service_id,a->>'name',a->>'summary'));
      when 'create_scenario' then result:=public.create_scenario((a->>'phase_id')::uuid,a->>'name','stacked',(a->>'lane_source_path_id')::uuid,'[]',coalesce((a->>'step_count')::int,5),coalesce(a->>'path_name','Happy Path'));
      when 'create_path' then result:=to_jsonb(public.create_path((a->>'scenario_id')::uuid,a->>'name',coalesce(a->>'kind','variant'),(a->>'lane_source_path_id')::uuid));
      when 'duplicate_path' then result:=to_jsonb(public.duplicate_path((a->>'source_path_id')::uuid,a->>'name',coalesce(a->>'kind','variant'),coalesce((a->>'copy_cells')::boolean,true),coalesce((a->>'copy_cells')::boolean,true)));
      when 'duplicate_scenario' then result:=to_jsonb(public.duplicate_scenario((a->>'source_scenario_id')::uuid,a->>'name'));
      when 'create_step' then result:=to_jsonb(public.add_step((a->>'path_id')::uuid,a->>'name',(a->>'at_position')::int));
      when 'create_lane' then result:=to_jsonb(public.add_lane((a->>'scenario_id')::uuid,a->>'name',a->>'lane_role',(a->>'at_position')::int));
      when 'update_path' then
        perform public.rename_path((a->>'path_id')::uuid,a->>'name'); result:='"Path renamed."';
      when 'upsert_cell' then
        if exists(select 1 from public.cells where path_id=(a->>'path_id')::uuid and lane_id=(a->>'lane_id')::uuid and step_id=(a->>'step_id')::uuid) then raise exception 'That slot is already filled; use update_cell.'; end if;
        result:=public.upsert_cell((a->>'path_id')::uuid,(a->>'lane_id')::uuid,(a->>'step_id')::uuid,a->>'content');
      when 'update_cell' then
        select * into strict before_cell from public.cells where cells.id=(a->>'cell_id')::uuid for update;
        if not (a ?| array['content','summary','owner','perceived_owner','function','form','value_props']) then raise exception 'Name at least one cell field to change.'; end if;
        update public.cells set content=coalesce(a->>'content',content),summary=coalesce(a->>'summary',summary),
          owner=coalesce(a->>'owner',owner),perceived_owner=coalesce(a->>'perceived_owner',perceived_owner),
          function=coalesce(a->>'function',function),form=coalesce(a->>'form',form),value_props=coalesce(a->'value_props',value_props),confirmed_by=profile,confirmed_at=now(),updated_at=now()
          where cells.id=before_cell.id;
        if a ? 'content' then perform public.sync_cell_touchpoints(before_cell.id,regexp_split_to_array(a->>'content',E'[\\r\\n,]+')); end if;
        result:=jsonb_build_object('cell_id',before_cell.id);
      when 'create_cell_dependency' then result:=public.set_cell_dependency((a->>'source_cell_id')::uuid,(a->>'target_cell_id')::uuid,coalesce(a->>'kind','leads_to'),null,a->>'label');
      when 'create_stakeholder' then
        insert into public.stakeholders(name,kind,summary,aliases) values(a->>'name',a->>'kind',a->>'summary',array(select jsonb_array_elements_text(coalesce(a->'aliases','[]')))) returning stakeholders.id into id; result:=to_jsonb(id);
      when 'update_stakeholder' then
        update public.stakeholders set name=coalesce(a->>'name',name),kind=coalesce(a->>'kind',kind),summary=coalesce(a->>'summary',summary),aliases=case when a ? 'aliases' then array(select jsonb_array_elements_text(a->'aliases')) else aliases end where stakeholders.id=(a->>'stakeholder_id')::uuid returning stakeholders.id into id;
        result:=to_jsonb(id);
      when 'create_evidence' then
        select ph.service_id into sid from public.cells c join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id join public.phases ph on ph.id=s.phase_id where c.id=(a->>'cell_id')::uuid;
        insert into public.evidence(service_id,cell_id,cell_key,kind,title,note,contributed_by) values(sid,(a->>'cell_id')::uuid,a->>'cell_id',a->>'kind',a->>'title',a->>'note',profile) returning evidence.id into id; result:=to_jsonb(id);
      when 'update_evidence' then
        update public.evidence set kind=coalesce(a->>'kind',kind),title=coalesce(a->>'title',title),note=coalesce(a->>'note',note),updated_at=now() where evidence.id=(a->>'evidence_id')::uuid returning evidence.id into id; result:=to_jsonb(id);
      when 'create_slice' then
        if p_service_id is null then raise exception 'Pass service_id from list_blueprint before creating a slice.'; end if;
        if cardinality(ids)=0 then raise exception 'A slice needs existing cell ids.'; end if;
        select jsonb_agg(jsonb_build_object('cell_ids',jsonb_build_array(x),'cell_keys',jsonb_build_array(x),'shows_all_images',true,'images','[]'::jsonb) order by ord) into slides from jsonb_array_elements(a->'cell_ids') with ordinality item(x,ord);
        result:=public.create_slice(p_service_id,a->>'title',coalesce(a->>'summary',''),a->>'kind',coalesce(a->>'actor',''),slides);
      when 'update_slice' then
        update public.slices set title=coalesce(a->>'title',title),summary=coalesce(a->>'summary',summary),actor=coalesce(a->>'actor',actor),kind=coalesce(a->>'kind',kind),updated_at=now() where slices.id=(a->>'slice_id')::uuid returning slices.id into id; result:=to_jsonb(id);
      when 'replace_slides' then
        if jsonb_array_length(a->'slides')=0 then raise exception 'slides must be a non-empty array.'; end if;
        select jsonb_agg(jsonb_build_object('cell_ids',v->'cells','cell_keys',v->'cells','title',v->>'title','caption',v->>'caption','shows_all_images',true,'images','[]'::jsonb) order by ord) into slides from jsonb_array_elements(a->'slides') with ordinality x(v,ord);
        result:=public.replace_slides((a->>'slice_id')::uuid,slides);
      when 'create_finding' then
        if p_service_id is null then raise exception 'Pass service_id before recording a finding.'; end if;
        if n=0 and coalesce(a->>'scope','')='' then raise exception 'A zero-cell finding needs a scope.'; end if;
        v_fingerprint:=(a->>'check_key')||':'||case when n=0 then a->>'scope' else
          (select encode(sha256(convert_to(string_agg(x::text,E'\n' order by x::text),'UTF8')),'hex') from unnest(ids) x) end;
        select * into existing from public.audit_findings f where f.service_id=p_service_id and f.fingerprint=v_fingerprint
          order by case f.status when 'open' then 0 when 'dismissed' then 1 else 2 end,updated_at desc limit 1 for update;
        if existing.status='dismissed' then
          perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
          return jsonb_build_object('outcome','suppressed','message','A person dismissed this finding; nothing was recorded.');
        elsif existing.status='open' then
          if existing.recorded_by is distinct from profile and not exists(
            select 1 from public.profiles p where p.id=profile and p.may_confirm
          ) then
            perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
            return jsonb_build_object('outcome','unchanged','result',existing.id,
              'message','An open finding already records this check. Only its original recorder or someone who may confirm can revise it; nothing was changed.');
          end if;
          update public.audit_findings set run_id=coalesce((a->>'run_id')::uuid,gen_random_uuid()),source=a->>'source',severity=a->>'severity',impact=a->>'impact',effort=a->>'effort',summary=a->>'summary',cell_ids=ids,cell_keys=array(select x::text from unnest(ids) x),updated_at=now() where audit_findings.id=existing.id;
          id:=existing.id;
        else
          insert into public.audit_findings(service_id,run_id,source,check_key,severity,impact,effort,summary,cell_ids,cell_keys,fingerprint,recorded_by)
            values(p_service_id,coalesce((a->>'run_id')::uuid,gen_random_uuid()),a->>'source',a->>'check_key',a->>'severity',a->>'impact',a->>'effort',a->>'summary',ids,array(select x::text from unnest(ids) x),v_fingerprint,profile)
            returning audit_findings.id into id;
        end if;
        result:=to_jsonb(id);
      when 'update_finding' then
        update public.audit_findings set status=a->>'status',updated_at=now() where audit_findings.id=(a->>'finding_id')::uuid returning audit_findings.id into id; result:=to_jsonb(id);
      else raise exception 'This write has no transactional implementation: %',p_tool;
    end case;
    insert into public.authoring_changes(fn,args,author,author_id,agent_session_id,proposed_by,approved_by)
      values(p_tool,a||jsonb_build_object('service_id',p_service_id,'result',result),'agent',(select user_id from public.profiles where profiles.id=profile),p_session_id,p_proposer,
        case when free then null else profile end);
    perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);
    if p_preview then raise exception using errcode='UB001',message='preview'; end if;
  exception when sqlstate 'UB001' then null;
  end;
  return jsonb_build_object('outcome',case when p_preview then 'validated' else 'applied' end,'result',result,'base_state',state);
end $$;

create function public.run_agent_tool(p_tool text,p_args jsonb,p_session_id uuid,p_service_id uuid default null,p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare profile public.profiles; preview jsonb; proposal uuid; free boolean;
begin
  if p_tool in ('approve_suggested_change','decline_suggested_change') then
    perform public.agent_refuse_secrets(p_args);
    perform public.agent_check_shape(p_args,public.agent_write_contracts()->p_tool);
  end if;
  if p_tool='approve_suggested_change' then return public.approve_suggested_change((p_args->>'suggested_change_id')::uuid); end if;
  if p_tool='decline_suggested_change' then perform public.decline_suggested_change((p_args->>'suggested_change_id')::uuid); return jsonb_build_object('outcome','declined'); end if;
  select * into profile from public.profiles where id=public.caller_profile_id();
  if profile.id is null then raise exception 'Sign in with a linked profile before writing.' using errcode='42501'; end if;
  free:=p_tool in ('create_finding','create_evidence') or (p_tool='update_evidence' and exists(
    select 1 from public.evidence e where e.id=(p_args->>'evidence_id')::uuid and e.contributed_by=profile.id));
  if (profile.may_confirm and p_confirmed) or free then
    return public.agent_tool_transaction(p_tool,p_args,p_service_id,p_session_id,false);
  end if;
  preview:=public.agent_tool_transaction(p_tool,p_args,p_service_id,p_session_id,true);
  if p_tool='update_cell' and p_args ? 'content' and (p_args-'cell_id'-'content')='{}'::jsonb then
    preview:=public.record_contribution((p_args->>'cell_id')::uuid,'Told to Uno in a tool call',p_args->>'content',p_args->>'content');
    return jsonb_build_object('outcome','proposed','suggested_change_id',preview->'suggested_change_id','evidence_id',preview->'evidence_id','message','Recorded the contribution as evidence and a pending cell-content suggestion; the cell is unchanged.');
  end if;
  insert into public.suggested_changes(tool_name,tool_args,service_id,base_state,suggested_by)
    values(p_tool,p_args,p_service_id,preview->'base_state',profile.id) returning id into proposal;
  return jsonb_build_object('outcome','proposed','suggested_change_id',proposal,'message','Recorded a proposal; the blueprint is unchanged. A person who may confirm must review and approve it.');
end $$;

-- The existing approval function is retained for old cell-content proposals.
alter function public.approve_suggested_change(uuid) rename to approve_cell_content_suggestion;
do $$ declare body text; before text; begin
  body:=pg_get_functiondef('public.approve_cell_content_suggestion(uuid)'::regprocedure);
  before:=body;
  body:=replace(body,'(author, author_id, fn, args, revert)','(author, author_id, proposed_by, approved_by, fn, args, revert)');
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  before:=body;
  body:=replace(body,$old$('human', (select user_id from public.profiles where id = v_profile),$old$,$new$('human', (select user_id from public.profiles where id = v_profile), v_change.suggested_by, v_profile,$new$);
  if body=before then raise exception 'Expected function body patch did not match: %',before; end if;
  execute body;
end $$;
create function public.approve_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare proposal public.suggested_changes; approver uuid:=public.confirming_profile_id(); result jsonb;
begin
  select * into proposal from public.suggested_changes where id=p_id for update;
  if proposal.id is null then raise exception 'That proposal no longer exists.'; end if;
  if proposal.status<>'pending' then raise exception 'That proposal is already %.',proposal.status; end if;
  if proposal.tool_name is null then
    if proposal.base_state is not null and public.agent_tool_state(jsonb_build_object('cell_id',proposal.cell_id)) is distinct from proposal.base_state then
      raise exception 'The proposed target changed since this proposal. Read it and propose again; nothing was written.';
    end if;
    perform public.agent_tool_transaction('update_cell',jsonb_build_object('cell_id',proposal.cell_id,'content',proposal.proposed_content),null,gen_random_uuid(),true);
    result:=public.approve_cell_content_suggestion(p_id);
    return result;
  end if;
  if public.agent_tool_state(proposal.tool_args) is distinct from proposal.base_state then
    raise exception 'The proposed target changed since this proposal. Read it and propose again; nothing was written.';
  end if;
  result:=public.agent_tool_transaction(proposal.tool_name,proposal.tool_args,proposal.service_id,gen_random_uuid(),false,proposal.suggested_by);
  update public.suggested_changes set status='approved',decided_by=approver,decided_at=now() where id=p_id;
  return result;
end $$;

-- Old cell-content contributions remain one kind in this same queue. Their
-- creation and approval now pass the same preview checks as tool proposals.
create function public.validate_cell_content_suggestion() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.tool_name is null then
    perform public.agent_tool_transaction('update_cell',jsonb_build_object('cell_id',new.cell_id,'content',new.proposed_content),null,gen_random_uuid(),true);
    new.base_state:=public.agent_tool_state(jsonb_build_object('cell_id',new.cell_id));
  end if;
  return new;
end $$;
create trigger validate_cell_content_suggestion before insert on public.suggested_changes
  for each row execute function public.validate_cell_content_suggestion();

revoke all on function public.agent_check_shape(jsonb,jsonb,text),public.agent_named_cells(jsonb),public.agent_refuse_secrets(jsonb),public.validate_cell_content_suggestion(),public.agent_tool_state(jsonb),public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid),public.agent_write_contracts(),public.approve_cell_content_suggestion(uuid),public.run_agent_tool(text,jsonb,uuid,uuid,boolean),public.approve_suggested_change(uuid) from public;
-- @recipe — grant the authenticated entry points; helpers stay private.
revoke all on function public.agent_check_shape(jsonb,jsonb,text),public.agent_named_cells(jsonb),public.agent_refuse_secrets(jsonb),public.validate_cell_content_suggestion(),public.agent_tool_state(jsonb),public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid),public.agent_write_contracts(),public.approve_cell_content_suggestion(uuid) from anon,authenticated;
revoke all on function public.run_agent_tool(text,jsonb,uuid,uuid,boolean),public.approve_suggested_change(uuid) from public,anon;
grant execute on function public.run_agent_tool(text,jsonb,uuid,uuid,boolean),public.approve_suggested_change(uuid) to authenticated;

-- @recipe
-- Preserve the deployment's SQL tier decision, including the permissive
-- core seam. Only the checked transaction adds another permitted path.
do $$
declare body text; source text; patched text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into body, source
    from pg_proc p join pg_language l on l.oid=p.prolang
    where p.oid='public.is_service_account()'::regprocedure and l.lanname='sql';
  if source is null then raise exception 'The service-account tier must supply a SQL boolean decision'; end if;
  patched:=replace(body,source,'select ('||regexp_replace(source,';[[:space:]]*$','')||
    ') or (current_setting(''ub.agent_transaction'',true)=''on'' and public.caller_profile_id() is not null)');
  if patched=body then raise exception 'Expected service-account tier body patch did not match'; end if;
  execute patched;
end $$;
comment on function public.is_service_account() is
  'The deployment tier decision, or the checked agent transaction for a linked profile. The transaction gate is local to its call; ordinary calls keep the deployment tier decision.';
-- Proof: public entry points admit authenticated callers only. Helpers cannot
-- be invoked to open the private authoring gate or apply unchecked payloads.
do $$ declare signature text; begin
  if has_function_privilege('anon','public.run_agent_tool(text,jsonb,uuid,uuid,boolean)','execute') then raise exception 'anon can run agent writes'; end if;
  foreach signature in array array[
    'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)',
    'public.agent_check_shape(jsonb,jsonb,text)', 'public.agent_named_cells(jsonb)',
    'public.agent_refuse_secrets(jsonb)', 'public.agent_tool_state(jsonb)',
    'public.agent_write_contracts()', 'public.validate_cell_content_suggestion()',
    'public.approve_cell_content_suggestion(uuid)'
  ] loop
    if has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute') then raise exception 'caller can bypass proposal admission through %',signature; end if;
  end loop;
  if not has_function_privilege('authenticated','public.approve_suggested_change(uuid)','execute') then raise exception 'signed-in approval is missing'; end if;
end $$;
