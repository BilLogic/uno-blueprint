-- An approval re-checks every row its proposal touches.
--
-- Authored 2026-11-01.
--
-- A proposal's base state held only its top-level targets, so a cell a slice
-- cited, a cell inside a slide, a step's place on its path and the path a new
-- path copies its lanes from could all change between proposal and approval
-- and the approval still applied. The base state now holds each of those
-- rows, and the refusal names what changed, or moved, in a sentence.
--
-- The policy is the rows the proposal NAMES, never every member of what it
-- touches: a slice's other slides, or a cell beside the cited one, can change
-- without invalidating the proposal. A step's place is the paths that hold
-- it: taken off a path or added to another, it moved; a step inserted before
-- it changes its column, not its meaning.
--
-- A proposal recorded before this migration has no state for the new keys.
-- Approval checks the keys its base state holds, so that queue keeps the
-- check it was recorded with rather than being refused wholesale.
--
-- The approval's log row is the approver's: their agent session and agent
-- author kind when the tool server or the canvas agent approves, a person's
-- row with no session when the approval is made outside one.

-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Short stage label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this scenario; an empty string leaves it blank; omit for none"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Short label for what happens; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this step; an empty string leaves it blank; omit for none"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (reuse a tag from list_owner_tags unless starting a new one deliberately); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (reuse a tag from list_owner_tags unless starting a new one deliberately); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS
-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

-- Capture the rows a proposal names. Lock them at approval, so a concurrent
-- edit cannot slip between the comparison and the normal write path. The body
-- is restated whole rather than patched, because each branch it gains reads
-- more plainly in place than as three replacements.
create or replace function public.agent_tool_state(p_args jsonb) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp as $$
declare state jsonb:='{}'; k text; v jsonb; tab text; row_data jsonb; v_id uuid; top_cells uuid[]:='{}'; cited jsonb:='{}'; places jsonb;
begin
  for k,v in select * from jsonb_each(p_args) loop
    tab:=case k when 'cell_id' then 'cells' when 'source_cell_id' then 'cells' when 'target_cell_id' then 'cells' when 'path_id' then 'paths'
      when 'source_path_id' then 'paths' when 'lane_source_path_id' then 'paths' when 'source_scenario_id' then 'scenarios'
      when 'scenario_id' then 'scenarios' when 'phase_id' then 'phases' when 'step_id' then 'steps' when 'lane_id' then 'lanes'
      when 'stakeholder_id' then 'stakeholders' when 'evidence_id' then 'evidence'
      when 'slice_id' then 'slices' when 'finding_id' then 'audit_findings' end;
    if tab is not null then
      v_id:=(v#>>'{}')::uuid;
      execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into row_data using v_id;
      if row_data is null then raise exception 'The % no longer exists; read the blueprint and propose again.',public.agent_state_noun(k); end if;
      state:=state||jsonb_build_object(k,row_data);
      if tab='cells' then top_cells:=array_append(top_cells,v_id); end if;
      -- A step's place is the paths that hold it. Its column moves whenever a
      -- step is inserted before it, which changes nothing a step id means.
      if k='step_id' then
        select coalesce(jsonb_agg(ps.path_id order by ps.path_id),'[]') into places
          from (select path_id from public.path_steps where path_steps.step_id=v_id for update) ps;
        state:=state||jsonb_build_object('step_places',places);
      end if;
    end if;
  end loop;
  -- Cells named inside arrays: a slice's cited cells, the cells on each slide.
  -- A missing one is recorded as null; the transaction names it after the cap.
  for v_id in select x from unnest(public.agent_named_cells(p_args)) x where x<>all(top_cells) loop
    select to_jsonb(c) into row_data from public.cells c where c.id=v_id for update;
    cited:=cited||jsonb_build_object(v_id::text,coalesce(row_data,'null'::jsonb));
  end loop;
  if cited<>'{}' then state:=state||jsonb_build_object('cited_cells',cited); end if;
  return state;
end $$;

-- The word a refusal uses for one state key: `lane_source_path_id` is a path.
create function public.agent_state_noun(p_key text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select replace(regexp_replace(p_key,'^(lane_source_|source_|target_)',''),'_id','')
$$;

-- The subject of a drift sentence: a row the proposal copies from is not the
-- row it proposes.
create function public.agent_state_subject(p_key text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_key
    when 'lane_source_path_id' then 'The path this proposal copies lanes from'
    when 'source_path_id' then 'The path this proposal copies'
    when 'source_scenario_id' then 'The scenario this proposal copies'
    else 'The proposed '||public.agent_state_noun(p_key) end
$$;

-- The sentence for the first named row that changed or moved since the
-- proposal, or null when every row its base state holds is as it was.
create function public.agent_state_drift(p_base jsonb, p_now jsonb) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare k text; was jsonb; now_row jsonb; cell_key text; tail text:=' Read it and propose again; nothing was written.';
begin
  for k,was in select * from jsonb_each(coalesce(p_base,'{}')) loop
    now_row:=p_now->k;
    continue when now_row is not distinct from was;
    if k='cited_cells' then
      for cell_key,was in select * from jsonb_each(p_base->'cited_cells') loop
        now_row:=p_now->'cited_cells'->cell_key;
        continue when now_row is not distinct from was;
        if now_row is null or jsonb_typeof(now_row)='null' then return 'A cell this proposal cites no longer exists.'||tail; end if;
        if public.agent_state_moved(was,now_row) then return 'A cell this proposal cites moved since this proposal.'||tail; end if;
        return 'A cell this proposal cites changed since this proposal.'||tail;
      end loop;
    elsif k='step_places' then
      return 'The proposed step moved since this proposal.'||tail;
    elsif public.agent_state_moved(was,now_row) then
      return public.agent_state_subject(k)||' moved since this proposal.'||tail;
    else
      return public.agent_state_subject(k)||' changed since this proposal.'||tail;
    end if;
  end loop;
  return null;
end $$;

-- Whether a row changed its place: its container or its position.
create function public.agent_state_moved(p_was jsonb, p_now jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select exists(select 1 from unnest(array['phase_id','scenario_id','path_id','lane_id','step_id','position']) key
    where p_was ? key and p_was->key is distinct from p_now->key)
$$;

-- The approval in a session: the tool server passes its own, and null is a
-- person's approval. Private; the signed-in entry point keeps its signature,
-- so a host that calls it, and its grant, are unchanged.
create function public.approve_proposal_in_session(p_id uuid, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare proposal public.suggested_changes; approver uuid:=public.confirming_profile_id(); result jsonb; drift text;
begin
  select * into proposal from public.suggested_changes where id=p_id for update;
  if proposal.id is null then raise exception 'That proposal no longer exists.'; end if;
  if proposal.status<>'pending' then raise exception 'That proposal is already %.',proposal.status; end if;
  if proposal.tool_name is null then
    if proposal.base_state is not null then
      drift:=public.agent_state_drift(proposal.base_state,public.agent_tool_state(jsonb_build_object('cell_id',proposal.cell_id)));
      if drift is not null then raise exception '%',drift; end if;
    end if;
    perform public.agent_tool_transaction('update_cell',jsonb_build_object('cell_id',proposal.cell_id,'content',proposal.proposed_content),null,gen_random_uuid(),true);
    return public.approve_cell_content_in_session(p_id,p_session_id);
  end if;
  drift:=public.agent_state_drift(proposal.base_state,public.agent_tool_state(proposal.tool_args));
  if drift is not null then raise exception '%',drift; end if;
  result:=public.agent_tool_transaction(proposal.tool_name,proposal.tool_args,proposal.service_id,p_session_id,false,proposal.suggested_by);
  update public.suggested_changes set status='approved',decided_by=approver,decided_at=now() where id=p_id;
  return result;
end $$;

create or replace function public.approve_suggested_change(p_id uuid) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select public.approve_proposal_in_session(p_id,null)
$$;

do $$ declare body text; previous text; begin
  -- A write with no agent session is a person's, and the log says so.
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  previous:=body;
  body:=replace(body,$old$'result',result),'agent',(select user_id$old$,
    $new$'result',result),case when p_session_id is null then 'human' else 'agent' end,(select user_id$new$);
  if body=previous then raise exception 'The transaction author kind did not match'; end if;
  execute body;

  -- The tool server hands its session to the approval.
  body:=pg_get_functiondef('public.run_agent_tool(text,jsonb,uuid,uuid,boolean)'::regprocedure);
  previous:=body;
  body:=replace(body,$old$public.approve_suggested_change((p_args->>'suggested_change_id')::uuid)$old$,
    $new$public.approve_proposal_in_session((p_args->>'suggested_change_id')::uuid,p_session_id)$new$);
  if body=previous then raise exception 'The tool-server approval call did not match'; end if;
  execute body;

  -- A cell-content approval records the same session and author kind.
  body:=pg_get_functiondef('public.approve_cell_content_suggestion(uuid)'::regprocedure);
  previous:=body;
  body:=replace(body,'public.approve_cell_content_suggestion(p_id uuid)','public.approve_cell_content_in_session(p_id uuid, p_session_id uuid)');
  if body=previous then raise exception 'The content approval signature did not match'; end if;
  previous:=body;
  body:=replace(body,'(author, author_id, proposed_by, approved_by, fn, args, revert)',
    '(author, agent_session_id, author_id, proposed_by, approved_by, fn, args, revert)');
  if body=previous then raise exception 'The content approval columns did not match'; end if;
  previous:=body;
  body:=replace(body,$old$values ('human', (select user_id$old$,
    $new$values (case when p_session_id is null then 'human' else 'agent' end, p_session_id, (select user_id$new$);
  if body=previous then raise exception 'The content approval author did not match'; end if;
  execute body;
end $$;
-- Kept, not dropped: earlier recipe statements revoke it by this signature,
-- and the generated recipe runs after the whole core.
create or replace function public.approve_cell_content_suggestion(p_id uuid) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select public.approve_cell_content_in_session(p_id,null)
$$;

revoke all on function public.agent_state_noun(text),public.agent_state_subject(text),public.agent_state_drift(jsonb,jsonb),public.agent_state_moved(jsonb,jsonb),
  public.approve_cell_content_in_session(uuid,uuid),public.approve_proposal_in_session(uuid,uuid) from public;
-- @recipe — the helpers stay private; the signed-in approval keeps its grant.
revoke all on function public.agent_state_noun(text),public.agent_state_subject(text),public.agent_state_drift(jsonb,jsonb),public.agent_state_moved(jsonb,jsonb),
  public.approve_cell_content_in_session(uuid,uuid),public.approve_proposal_in_session(uuid,uuid) from anon,authenticated;
-- Proof: only the approval is callable, and only when signed in.
do $$ declare signature text; begin
  if has_function_privilege('anon','public.approve_suggested_change(uuid)','execute') then raise exception 'anon can approve'; end if;
  if not has_function_privilege('authenticated','public.approve_suggested_change(uuid)','execute') then raise exception 'signed-in approval is missing'; end if;
  foreach signature in array array['public.agent_state_noun(text)','public.agent_state_subject(text)','public.agent_state_drift(jsonb,jsonb)',
    'public.agent_state_moved(jsonb,jsonb)','public.approve_cell_content_in_session(uuid,uuid)',
    'public.approve_proposal_in_session(uuid,uuid)'] loop
    if has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute') then
      raise exception 'caller can reach the approval helper %',signature; end if;
  end loop;
end $$;
