-- Authored 2026-10-19.
-- Server inverse data is an audit capture, never a canvas RevertSpec.
-- Capture actual row changes, including RPC side effects, in the write's
-- transaction. Preview rollback also rolls back its transaction-local capture.
create function public.capture_agent_prior_rows() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if current_setting('ub.agent_transaction',true)='on'
     and current_setting('ub.capture_agent_prior',true)='on' then
    perform set_config('ub.agent_prior_rows',
      (coalesce(nullif(current_setting('ub.agent_prior_rows',true),''),'[]')::jsonb
        || jsonb_build_array(jsonb_build_object('table',tg_table_name,
          'before',case when tg_op='INSERT' then null else to_jsonb(old) end,
          'after',case when tg_op='DELETE' then null else to_jsonb(new) end)))::text,true);
  end if;
  return null;
end $$;
revoke all on function public.capture_agent_prior_rows() from public;
-- @recipe — host request roles must not call the trigger helper.
revoke all on function public.capture_agent_prior_rows() from anon,authenticated;
-- @core

-- Capture the canonical authored surface and the structural RPC side effects.
-- run-authoring-db checks this against PANEL_WRITE_SURFACE.
-- Private profiles and conversations are outside this capture.
do $$ declare relation text; begin
  foreach relation in array array['services','business_models','phases','scenarios','paths','steps','path_steps',
    'lanes','cells','cell_dependencies','stakeholders','evidence','slices','slides',
    'slide_images','audit_findings','cell_touchpoints','touchpoints','resources'] loop
    execute format('create trigger capture_agent_prior after insert or update or delete on public.%I for each row execute function public.capture_agent_prior_rows()',relation);
  end loop;
end $$;

do $$ declare body text; previous text; begin
  body:=pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  previous:=body;
  body:=replace(body,'old_gate text:=',
    $patch$old_capture text:=current_setting('ub.capture_agent_prior',true); old_rows text:=current_setting('ub.agent_prior_rows',true);
  old_gate text:=$patch$);
  if body=previous then raise exception 'The transaction capture declaration did not match'; end if;
  previous:=body;
  body:=replace(body,$old$perform set_config('ub.agent_transaction','on',true);$old$,
    $patch$perform set_config('ub.agent_transaction','on',true);
    perform set_config('ub.agent_prior_rows','[]',true);
    perform set_config('ub.capture_agent_prior','on',true);$patch$);
  if body=previous then raise exception 'The transaction capture entry did not match'; end if;
  previous:=body;
  body:=replace(body,'(fn,args,author,author_id,agent_session_id,proposed_by,approved_by)',
    '(fn,args,author,author_id,agent_session_id,proposed_by,approved_by,revert)');
  if body=previous then raise exception 'The inverse column did not match'; end if;
  previous:=body;
  body:=replace(body,'case when free then null else profile end);',
    $patch$case when free then null else profile end,
        jsonb_build_object('kind','captured_rows','rows',current_setting('ub.agent_prior_rows')::jsonb));$patch$);
  if body=previous then raise exception 'The inverse data did not match'; end if;
  previous:=body;
  body:=replace(body,$old$perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);$old$,
    $patch$perform set_config('ub.capture_agent_prior',coalesce(old_capture,''),true);
    perform set_config('ub.agent_prior_rows',coalesce(old_rows,''),true);
    perform set_config('ub.agent_transaction',coalesce(old_gate,''),true);$patch$);
  if body=previous then raise exception 'The transaction capture exit did not match'; end if;
  previous:=body;
  body:=replace(body,'values(p_tool,a||jsonb_build_object(',
    $patch$values(case when p_proposer is null then p_tool else 'approve_suggested_change' end,a||jsonb_build_object('tool_name',p_tool,$patch$);
  if body=previous then raise exception 'The tool approval action label did not match'; end if;
  execute body;
  body:=pg_get_functiondef('public.approve_cell_content_suggestion(uuid)'::regprocedure);
  previous:=body;
  -- Change only the action label; its captured inverse remains a cell update.
  body:=replace(body,$old$'update_cell_content', jsonb_build_object('cell_id', v_change.cell_id$old$,
    $patch$'approve_suggested_change', jsonb_build_object('cell_id', v_change.cell_id$patch$);
  if body=previous then raise exception 'The approval action label did not match'; end if;
  execute body;
end $$;

comment on column public.authoring_changes.revert is
  'Audit-only inverse data: browser writes and existing cell-content approvals hold a RevertSpec; server tool transactions and their approvals hold captured_rows with before and after values. Durable rows are never replayed by canvas undo.';
