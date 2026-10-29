-- Authored 2026-10-29. A storyboard row edits one existing cell aggregate.
-- @core
create table public.cell_storyboard_receipts (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.cells(id) on delete cascade,
  actor text not null,
  uploaded_ids uuid[] not null,
  before_state jsonb not null,
  after_state jsonb not null
);
alter table public.cell_storyboard_receipts enable row level security;
revoke all on public.cell_storyboard_receipts from public;

-- Canonical state is also the expected-state contract. Resources include
-- placement-owned rows because content synchronization can remove placements.
create function public.read_cell_storyboard(p_cell_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare result jsonb;
begin
 perform public.require_structure_author();
 select jsonb_build_object('cell_id', c.id, 'path_id',c.path_id,'lane_id',c.lane_id,'step_id',c.step_id,
   'content',c.content,'summary',c.summary,'frame',c.frame,
   'placements',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.cell_touchpoints t where t.cell_id=c.id),'[]'::jsonb),
   'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.resources r where r.cell_id=c.id),'[]'::jsonb))
 into result from public.cells c where c.id=p_cell_id;
 if result is null then raise exception 'That cell no longer exists'; end if;
 return result;
end $$;

create function public.update_cell_storyboard(p_cell_id uuid,p_content text,p_summary text,p_frame text,p_expected jsonb,p_attachments jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare before_state jsonb; after_state jsonb; receipt_id uuid; attachment jsonb; next_position int; next_frame text; uploaded_id uuid; uploaded_ids uuid[] := array[]::uuid[];
begin
 perform public.require_structure_author();
 perform 1 from public.cells where id=p_cell_id for update;
 perform 1 from public.cell_touchpoints where cell_id=p_cell_id for update;
 perform 1 from public.resources where cell_id=p_cell_id for update;
 before_state := public.read_cell_storyboard(p_cell_id);
 if p_expected is null or before_state <> p_expected then raise exception 'This cell changed. Reopen it before saving.' using errcode='40001'; end if;
 if coalesce(btrim(p_content),'')='' then raise exception 'Text is required'; end if;
 next_frame := nullif(btrim(p_frame),'');
 if next_frame is not null and next_frame !~ '^(https://|/[^/\\])' then raise exception 'A featured image is an https address or a path on this site'; end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' then raise exception 'Attachments must be an array'; end if;
 select coalesce(max(position),-1)+1 into next_position from public.resources where cell_id=p_cell_id and cell_touchpoint_id is null;
 for attachment in select value from jsonb_array_elements(p_attachments) loop
   if attachment->>'kind' is distinct from 'attachment' or coalesce(btrim(attachment->>'name'),'')='' or coalesce(attachment->>'url','') !~ '^https://' or coalesce(attachment->>'objectKey','')='' or attachment->>'objectKey' not like 'cells/'||p_cell_id::text||'/%' or right(attachment->>'url',length('/cell-attachments/'|| (attachment->>'objectKey'))) <> '/cell-attachments/'||(attachment->>'objectKey') or attachment ? 'id' or attachment ? 'cell_touchpoint_id' then
     raise exception 'Invalid staged attachment';
   end if;
   insert into public.resources(cell_id,kind,name,url,position,origin) values(p_cell_id,'attachment',attachment->>'name',attachment->>'url',next_position,'app') returning id into uploaded_id;
   uploaded_ids := array_append(uploaded_ids,uploaded_id);
   next_position := next_position+1;
 end loop;
 perform public.sync_cell_touchpoints(p_cell_id, regexp_split_to_array(p_content,E'\\r?\\n|,'));
 -- Explicit choice follows synchronization, which may fill an empty frame.
 update public.cells set content=p_content,summary=nullif(btrim(p_summary),''),frame=next_frame where id=p_cell_id;
 after_state := public.read_cell_storyboard(p_cell_id);
 insert into public.cell_storyboard_receipts(cell_id,actor,uploaded_ids,before_state,after_state)
 values(p_cell_id,coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',''),uploaded_ids,before_state,after_state) returning id into receipt_id;
 return jsonb_build_object('cell_id',p_cell_id,'receipt_id',receipt_id,'before',before_state,'after',after_state);
end $$;

create function public.restore_cell_storyboard(p_receipt_id uuid) returns void
language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
declare receipt public.cell_storyboard_receipts; current_state jsonb;
begin
 perform public.require_structure_author();
 select * into receipt from public.cell_storyboard_receipts where id=p_receipt_id for update;
 if receipt.id is null or receipt.actor <> coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','') then raise exception 'This edit receipt is unavailable'; end if;
 perform 1 from public.cells where id=receipt.cell_id for update;
 perform 1 from public.cell_touchpoints where cell_id=receipt.cell_id for update;
 perform 1 from public.resources where cell_id=receipt.cell_id for update;
 current_state := public.read_cell_storyboard(receipt.cell_id);
 if current_state <> receipt.after_state then raise exception 'This cell changed after this edit. Undo refused.' using errcode='40001'; end if;
 -- Only this transaction's captured upload IDs may be removed by Undo.
 -- Retained resources are untouched; sync-removed rows recover their own IDs.
 if exists(select 1 from jsonb_populate_recordset(null::public.cell_touchpoints,receipt.before_state->'placements') b join public.cell_touchpoints t on t.id=b.id where t.cell_id<>receipt.cell_id)
 or exists(select 1 from jsonb_populate_recordset(null::public.resources,receipt.before_state->'resources') b join public.resources r on r.id=b.id where r.cell_id<>receipt.cell_id) then raise exception 'A captured identity is now owned elsewhere'; end if;
 delete from public.resources where cell_id=receipt.cell_id and id=any(receipt.uploaded_ids);
 delete from public.cell_touchpoints t where t.cell_id=receipt.cell_id and not exists(select 1 from jsonb_array_elements(receipt.before_state->'placements') b where b->>'id'=t.id::text);
 insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,receipt.before_state->'placements')
 on conflict(id) do update set name=excluded.name,position=excluded.position,summary=excluded.summary,role=excluded.role,touchpoint_id=excluded.touchpoint_id;
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,receipt.before_state->'resources') on conflict(id) do nothing;
 update public.cells set content=receipt.before_state->>'content', summary=receipt.before_state->>'summary',frame=receipt.before_state->>'frame' where id=receipt.cell_id;
 delete from public.cell_storyboard_receipts where id=p_receipt_id;
end $$;
revoke execute on function public.read_cell_storyboard(uuid), public.update_cell_storyboard(uuid,text,text,text,jsonb,jsonb),public.restore_cell_storyboard(uuid) from public;
-- @recipe
revoke all on public.cell_storyboard_receipts from anon,authenticated;
revoke execute on function public.read_cell_storyboard(uuid), public.update_cell_storyboard(uuid,text,text,text,jsonb,jsonb),public.restore_cell_storyboard(uuid) from anon;
grant execute on function public.read_cell_storyboard(uuid), public.update_cell_storyboard(uuid,text,text,text,jsonb,jsonb),public.restore_cell_storyboard(uuid) to authenticated;
-- @core

-- Every fixture lives in a rolled-back subtransaction, including failed writes.
do $storyboard_proof$
declare s uuid; ph uuid; sc uuid; p uuid; st uuid; ln uuid; c uuid; other_cell uuid; tp uuid; placement uuid; resource uuid;
 before_state jsonb; receipt jsonb; uploaded jsonb; after_state jsonb; refused boolean; bad text; original_resources jsonb;
begin
 begin
 insert into public.services(name) values ('storyboard aggregate proof') returning id into s;
 insert into public.phases(service_id,name,position) values(s,'phase',0) returning id into ph;
 insert into public.scenarios(phase_id,name,position) values(ph,'scenario',0) returning id into sc;
 insert into public.paths(scenario_id,name,kind) values(sc,'path','happy') returning id into p;
 insert into public.steps(scenario_id,name) values(sc,'step') returning id into st;
 insert into public.path_steps(path_id,step_id,position) values(p,st,0);
 insert into public.lanes(path_id,name,position) values(p,'actor',0) returning id into ln;
 insert into public.cells(path_id,lane_id,step_id,content,owner) values(p,ln,st,'','preserve') returning id into c;
 before_state := public.read_cell_storyboard(c);
 receipt := public.update_cell_storyboard(c,'New text','New summary','https://example.test/image.png',before_state,'[]');
 if (select content <> 'New text' or summary <> 'New summary' or frame <> 'https://example.test/image.png' or owner <> 'preserve' from public.cells where id=c) then raise exception 'aggregate save failed'; end if;
 update public.cells set owner='new unrelated owner',status='planned' where id=c;
 perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid);
 if public.read_cell_storyboard(c) <> before_state or (select owner<>'new unrelated owner' or status<>'planned' from public.cells where id=c) then raise exception 'blank-cell inverse or unrelated-field preservation failed'; end if;
 -- Consumed/foreign/malformed tokens cannot replay an inverse.
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when others then refused:=true; end;
 if not refused then raise exception 'receipt replay accepted'; end if;
 refused:=false; begin perform public.restore_cell_storyboard(gen_random_uuid()); exception when others then refused:=true; end;
 if not refused then raise exception 'foreign token accepted'; end if;
 -- Validation and stale expected state are checked before any aggregate mutation.
 foreach bad in array array['blank','url','stale','missing','attachment','foreign_attachment'] loop
 refused:=false;
 begin
   perform public.update_cell_storyboard(case when bad='missing' then gen_random_uuid() else c end,
    case when bad='blank' then '   ' else 'New text' end,'Changed',case when bad='url' then 'javascript:bad' else '/image.png' end,
    case when bad='stale' then '{}'::jsonb else before_state end,
    case when bad='attachment' then '[{"kind":"attachment","name":"File","url":"javascript:bad","objectKey":"bad"}]'::jsonb
     when bad='foreign_attachment' then '[{"id":"11111111-1111-4111-8111-111111111111","kind":"attachment","name":"File","url":"https://example.test/file","objectKey":"bad"}]'::jsonb else '[]'::jsonb end);
 exception when others then refused:=true; end;
 if not refused or public.read_cell_storyboard(c)<>before_state then raise exception 'invalid % did not roll back the aggregate',bad; end if;
 end loop;
 -- Existing placements on actor cells still follow full-cell content rules.
 insert into public.touchpoints(name,origin) values('Original tool','app') returning id into tp;
 insert into public.cell_touchpoints(cell_id,touchpoint_id,position,origin,summary) values(c,tp,0,'app','Keep placement writing') returning id into placement;
 insert into public.resources(cell_id,kind,name,url,position,origin,featured) values(c,'link','Original link','https://example.test/link',0,'app',true) returning id into resource;
 insert into public.resources(cell_id,cell_touchpoint_id,kind,name,url,position,origin) values(c,placement,'link','Placement link','https://example.test/placement',0,'app');
 before_state := public.read_cell_storyboard(c); original_resources:=before_state->'resources';
 uploaded:=jsonb_build_array(jsonb_build_object('kind','attachment','name','Uploaded image','objectKey','cells/'||c||'/image.png','url','https://example.test/storage/v1/object/public/cell-attachments/cells/'||c||'/image.png'));
 receipt := public.update_cell_storyboard(c,'New tool','Updated','https://example.test/storage/v1/object/public/cell-attachments/cells/'||c||'/image.png',before_state,uploaded);
 after_state:=public.read_cell_storyboard(c);
 if jsonb_array_length(after_state->'resources')<>3 or not exists(select 1 from public.cell_touchpoints where id=placement and touchpoint_id is null and name='Original tool') then raise exception 'upload or content synchronization failed'; end if;
 -- Resource edits refuse Undo; original IDs/flags/order survive the refused attempt.
 update public.resources set name='Later resource edit' where id=resource;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused then raise exception 'Undo overwrote a newer resource edit'; end if;
 -- Roll back that simulated later edit without using a timestamp-changing update.
 delete from public.resources where id=resource;
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,after_state->'resources') r where r.id=resource;
 -- A newer placement edit also refuses Undo.
 update public.cell_touchpoints set summary='Later placement edit' where id=placement;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused then raise exception 'Undo overwrote a newer placement edit'; end if;
 -- Restore the fixture snapshot by exact rows, then test the real inverse.
 delete from public.resources where cell_id=c;
 delete from public.cell_touchpoints where cell_id=c;
 insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,after_state->'placements');
 insert into public.resources select * from jsonb_populate_recordset(null::public.resources,after_state->'resources');
 perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid);
 if (public.read_cell_storyboard(c)->'resources')<>original_resources or not exists(select 1 from public.cell_touchpoints where id=placement and touchpoint_id=tp and summary='Keep placement writing') then raise exception 'Undo lost original resource IDs or placement state'; end if;
 before_state:=public.read_cell_storyboard(c);
 receipt:=public.update_cell_storyboard(c,'Latest','Summary','/latest.png',before_state,'[]');
 update public.cells set content='Newer text' where id=c;
 refused:=false; begin perform public.restore_cell_storyboard((receipt->>'receipt_id')::uuid); exception when serialization_failure then refused:=true; end;
 if not refused or (select content<>'Newer text' from public.cells where id=c) then raise exception 'Undo overwrote newer text'; end if;
 raise exception using errcode='P0002',message='storyboard fixture rollback';
 exception when no_data_found then if sqlerrm<>'storyboard fixture rollback' then raise; end if; end;
end $storyboard_proof$;

-- @recipe — Final ACL and in-body denial proofs, after this migration's grants.
-- Core replay builds every function before historical recipe proofs run. The
-- shared require_structure_author gate has the same check as other aggregate
-- operations; this final proof checks these names after their own ACLs land.
do $storyboard_permissions$
begin
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.read_cell_storyboard(null); raise exception 'reader read accepted'; exception when insufficient_privilege then null; end;
 begin perform public.update_cell_storyboard(null,'text','summary',null,'{}','[]'); raise exception 'reader save accepted'; exception when insufficient_privilege then null; end;
 begin perform public.restore_cell_storyboard(null); raise exception 'reader undo accepted'; exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.read_cell_storyboard(uuid)','EXECUTE')
 or has_function_privilege('anon','public.update_cell_storyboard(uuid,text,text,text,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.restore_cell_storyboard(uuid)','EXECUTE')
 or has_table_privilege('authenticated','public.cell_storyboard_receipts','SELECT')
 or has_table_privilege('anon','public.cell_storyboard_receipts','SELECT') then raise exception 'storyboard grants are open'; end if;
end $storyboard_permissions$;
