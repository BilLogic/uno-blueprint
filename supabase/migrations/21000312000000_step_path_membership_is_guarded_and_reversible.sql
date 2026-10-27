-- Authored 2026-10-26. Existing steps can join or leave a path without losing recoverable content.

-- Refuse before installing the constraint, with a count and a usable finding
-- query. No existing content is deleted or repaired implicitly.
create function pg_temp.assert_cell_path_steps() returns void language plpgsql as $$
declare orphan_count bigint;
begin
  select count(*) into orphan_count from public.cells c
    left join public.path_steps ps on ps.path_id=c.path_id and ps.step_id=c.step_id
    where ps.step_id is null;
  if orphan_count>0 then
    raise exception 'Cannot upgrade: % % off any path-step. Find them with: SELECT c.id, c.path_id, c.step_id FROM public.cells c LEFT JOIN public.path_steps ps ON ps.path_id=c.path_id AND ps.step_id=c.step_id WHERE ps.step_id IS NULL;', orphan_count, case when orphan_count=1 then 'cell sits' else 'cells sit' end;
  end if;
end $$;
select pg_temp.assert_cell_path_steps();

-- Lock the referenced membership before accepting a cell write. This gives
-- every app, importer and tool caller a readable refusal and closes the race
-- with a concurrent detach. The deferred FK remains the final invariant.
-- The caller's cell RLS still authorizes its write. The trigger owns this
-- lock read because path_steps updates are RPC-only under RLS.
create or replace function public.cells_validate_path_match() returns trigger
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare lane_path uuid;
begin
  select path_id into lane_path from public.lanes where id=new.lane_id;
  if lane_path is null then raise exception 'This lane no longer exists. Reload the canvas'; end if;
  if lane_path<>new.path_id then raise exception 'Choose a lane on this path'; end if;
  perform 1 from public.path_steps ps where ps.path_id=new.path_id and ps.step_id=new.step_id for key share;
  if not found then raise exception 'This step is not on this path. Reload the canvas'; end if;
  return new;
end $$;
create function public.path_step_keeps_saved_cells() returns trigger
language plpgsql set search_path to 'public','pg_catalog','pg_temp' as $$
begin
  if tg_op='UPDATE' and new.path_id=old.path_id and new.step_id=old.step_id then return new; end if;
  -- A parent cascade is intentional deletion; normal remove_step and confirmed
  -- membership removal delete their cells first. An order-only writer cannot.
  if exists(select 1 from public.paths where id=old.path_id)
    and exists(select 1 from public.steps where id=old.step_id)
    and exists(select 1 from public.cells where path_id=old.path_id and step_id=old.step_id) then
    raise exception 'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger path_step_keeps_saved_cells before delete or update of path_id,step_id
  on public.path_steps for each row execute function public.path_step_keeps_saved_cells();
alter table public.cells add constraint cells_path_step_fkey
  foreign key (path_id, step_id) references public.path_steps(path_id, step_id)
  deferrable initially deferred;
create index cells_path_step_idx on public.cells(path_id, step_id);

-- Only the guarded functions read this memento. A client receives its opaque
-- identity, never a payload that it could change and hand back as an inverse.
create table public.structure_membership_receipts (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null,
  path_id uuid not null,
  present boolean not null,
  before_state jsonb not null,
  after_state jsonb not null,
  archive jsonb not null,
  reverted boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.structure_membership_state(p_step uuid, p_path uuid)
returns jsonb language sql stable set search_path to 'public','pg_catalog','pg_temp' as $$
  select jsonb_build_object(
    'step', (select to_jsonb(s) from public.steps s where s.id=p_step),
    'paths', (select coalesce(jsonb_agg(ps.path_id order by ps.path_id),'[]') from public.path_steps ps where ps.step_id=p_step),
    'order', (select coalesce(jsonb_agg(ps.step_id order by ps.position),'[]') from public.path_steps ps where ps.path_id=p_path),
    'positions', (select coalesce(jsonb_agg(jsonb_build_object('step_id',ps.step_id,'position',ps.position) order by ps.position),'[]') from public.path_steps ps where ps.path_id=p_path)
  )
$$;

create function public.change_step_path(
  step_id uuid, path_id uuid, present boolean, at_position integer,
  expected_ids uuid[], expected_path_ids uuid[], confirmed_cells jsonb default null
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_catalog','pg_temp' as $$
declare
  prior jsonb; following jsonb; captured jsonb := '{}'; saved_cells jsonb; confirmed_snapshot jsonb;
  ids uuid[]; ordered uuid[]; new_order uuid[]; memberships uuid[];
  step_scenario uuid; path_scenario uuid; receipt uuid;
begin
  perform public.require_structure_author();
  -- Same path-first lock order as reorder_steps / undo_structure_order.
  perform 1 from public.paths p where p.id=change_step_path.path_id for update;
  select p.scenario_id into path_scenario from public.paths p where p.id=change_step_path.path_id;
  select s.scenario_id into step_scenario from public.steps s where s.id=change_step_path.step_id for update;
  if step_scenario is null or path_scenario is null or step_scenario<>path_scenario then
    raise exception 'That step and path must belong to the same scenario';
  end if;
  perform 1 from public.path_steps ps where ps.step_id=change_step_path.step_id order by ps.path_id for no key update;
  select coalesce(array_agg(ps.step_id order by ps.position),'{}') into ordered from public.path_steps ps where ps.path_id=change_step_path.path_id;
  select coalesce(array_agg(ps.path_id order by ps.path_id),'{}') into memberships from public.path_steps ps where ps.step_id=change_step_path.step_id;
  if expected_ids is distinct from ordered or expected_path_ids is distinct from memberships then
    raise exception 'This path changed. Reload and try again';
  end if;
  if present is null or present=(path_id=any(memberships)) then
    raise exception 'This step changed. Reload and try again';
  end if;
  if not present and cardinality(memberships)<=1 then
    raise exception 'A step must stay on at least one path';
  end if;
  prior := public.structure_membership_state(step_id,path_id);
  if present then
    if at_position is null or at_position<0 or at_position>cardinality(ordered) then
      raise exception 'Choose a position on this path';
    end if;
    if exists(select 1 from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id) then
      raise exception 'This step already has cells on that path. Reload and try again';
    end if;
    new_order := ordered[1:at_position] || array[step_id] || ordered[at_position+1:cardinality(ordered)];
    insert into public.path_steps(path_id,step_id,position) values(path_id,step_id,cardinality(ordered));
  else
    -- Lock the existing cells before capturing any cascade. The membership FK
    -- keeps new inserts out; these row locks keep edits / new references out.
    perform 1 from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id order by c.id for update;
    select coalesce(array_agg(c.id order by c.id),'{}'),
      coalesce(jsonb_agg(jsonb_build_object('id',c.id,'updated_at',c.updated_at) order by c.id),'[]')
      into ids,saved_cells from public.cells c where c.path_id=change_step_path.path_id and c.step_id=change_step_path.step_id;
    if cardinality(ids)>0 then
      if jsonb_typeof(confirmed_cells) is distinct from 'array' then
        raise exception 'The cells on this step changed. Reload and confirm removing them';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'updated_at',x.updated_at) order by x.id),'[]')
        into confirmed_snapshot from jsonb_to_recordset(confirmed_cells) as x(id uuid,updated_at timestamptz);
      if confirmed_snapshot is distinct from saved_cells then
        raise exception 'The cells on this step changed. Reload and confirm removing them';
      end if;
    end if;
    perform 1 from public.cell_touchpoints t where t.cell_id=any(ids) order by t.id for update;
    perform 1 from public.resources t where t.cell_id=any(ids) order by t.id for update;
    perform 1 from public.cell_dependencies t where t.source_cell_id=any(ids) or t.target_cell_id=any(ids) order by t.id for update;
    perform 1 from public.slide_images t where t.cell_id=any(ids) order by t.id for update;
    -- Evidence keeps its provenance identity after a cell is removed. Leave
    -- it intact; restoring the same cell ids reconnects it without rewriting
    -- any evidence that somebody edited in the meantime.
    captured := jsonb_build_object(
      'cells',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from public.cells c where c.id=any(ids)),
      'lanes',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.lanes l where l.id in(select c.lane_id from public.cells c where c.id=any(ids))),
      'placements',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.cell_touchpoints t where t.cell_id=any(ids)),
      'resources',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.resources r where r.cell_id=any(ids)),
      'dependencies',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.cell_dependencies d where d.source_cell_id=any(ids) or d.target_cell_id=any(ids)),
      'images',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.slide_images i where i.cell_id=any(ids))
    );
    delete from public.cells c where c.id=any(ids);
    delete from public.path_steps ps where ps.path_id=change_step_path.path_id and ps.step_id=change_step_path.step_id;
    new_order := array_remove(ordered,step_id);
  end if;
  update public.path_steps ps set position=q.n-1 from unnest(new_order) with ordinality q(id,n)
    where ps.path_id=change_step_path.path_id and ps.step_id=q.id;
  following := public.structure_membership_state(step_id,path_id);
  insert into public.structure_membership_receipts(step_id,path_id,present,before_state,after_state,archive)
    values(step_id,path_id,present,prior,following,captured) returning id into receipt;
  return jsonb_build_object('receipt_id',receipt,'step_id',step_id,'path_id',path_id,'present',present);
end $$;

create function public.undo_step_path_change(receipt_id uuid) returns void
language plpgsql security definer set search_path to 'public','pg_catalog','pg_temp' as $$
declare r public.structure_membership_receipts; prior_order uuid[]; lane_state jsonb;
begin
  perform public.require_structure_author();
  select * into r from public.structure_membership_receipts where id=receipt_id for update;
  if not found or r.reverted then raise exception 'This path change cannot be undone. Reload the canvas'; end if;
  perform 1 from public.paths p where p.id=r.path_id for update;
  perform 1 from public.steps s where s.id=r.step_id for update;
  perform 1 from public.path_steps ps where ps.step_id=r.step_id order by ps.path_id for no key update;
  if public.structure_membership_state(r.step_id,r.path_id) is distinct from r.after_state then
    raise exception 'This step or path changed since your save. Reload before undoing';
  end if;
  if exists(select 1 from public.cells c where c.path_id=r.path_id and c.step_id=r.step_id) then
    raise exception 'This step has content since your save. Remove it explicitly instead';
  end if;
  select coalesce(array_agg(x::uuid),'{}') into prior_order from jsonb_array_elements_text(r.before_state->'order') x;
  if r.present then
    delete from public.path_steps ps where ps.path_id=r.path_id and ps.step_id=r.step_id;
  else
    select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') into lane_state from public.lanes l
      where l.id in(select (x->>'id')::uuid from jsonb_array_elements(r.archive->'lanes') x);
    if lane_state is distinct from r.archive->'lanes' then
      raise exception 'The lanes holding this step changed. Reload before undoing';
    end if;
    insert into public.path_steps(path_id,step_id,position) values(r.path_id,r.step_id,cardinality(prior_order));
    -- No upsert: identity or slot collisions and missing references refuse the
    -- entire inverse rather than overwriting anything written since detach.
    begin
      insert into public.cells select * from jsonb_populate_recordset(null::public.cells,r.archive->'cells');
      insert into public.cell_touchpoints select * from jsonb_populate_recordset(null::public.cell_touchpoints,r.archive->'placements');
      insert into public.resources select * from jsonb_populate_recordset(null::public.resources,r.archive->'resources');
      insert into public.cell_dependencies select * from jsonb_populate_recordset(null::public.cell_dependencies,r.archive->'dependencies');
      insert into public.slide_images select * from jsonb_populate_recordset(null::public.slide_images,r.archive->'images');
    exception when unique_violation or foreign_key_violation then
      raise exception 'Content referenced by this change changed. Reload before undoing';
    end;
  end if;
  -- Restore stored positions too: older paths may have intentional gaps.
  update public.path_steps ps set position=q.position
    from jsonb_to_recordset(r.before_state->'positions') q(step_id uuid,position integer)
    where ps.path_id=r.path_id and ps.step_id=q.step_id;
  update public.structure_membership_receipts set reverted=true, before_state='{}', after_state='{}', archive='{}' where id=r.id;
end $$;

-- @recipe — mementos are server-only; only guarded entry points are callable.
revoke execute on function public.cells_validate_path_match() from public,anon,authenticated;
revoke execute on function public.path_step_keeps_saved_cells() from public,anon,authenticated;
alter table public.structure_membership_receipts enable row level security;
revoke all on public.structure_membership_receipts from public,anon,authenticated;
revoke execute on function public.structure_membership_state(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.change_step_path(uuid,uuid,boolean,integer,uuid[],uuid[],jsonb) from public,anon;
revoke execute on function public.undo_step_path_change(uuid) from public,anon;
grant execute on function public.change_step_path(uuid,uuid,boolean,integer,uuid[],uuid[],jsonb),public.undo_step_path_change(uuid) to authenticated;
-- @core
-- Real attach, detach, round-trip content and stale-state proofs. No fixture survives.
create function pg_temp.expect_membership_refusal(statement text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Unexpected success: %',statement using errcode='ZX001';
  exception when others then
    if sqlerrm<>message then raise; end if;
  end;
end $$;
do $proof$
declare
  svc uuid; ph uuid; sc uuid; a uuid; b uuid; start_id uuid; review_id uuid; end_id uuid;
  la uuid; lb uuid; cell uuid; target_cell uuid; placement uuid; resource uuid; edge uuid; ev uuid;
  slice_id uuid; slide_id uuid; image_id uuid; result jsonb; detached jsonb; proof_order jsonb;
  members uuid[]; confirmation jsonb; original_cell jsonb; original_resource jsonb; original_target jsonb;
begin
  perform set_config('request.jwt.claims','{"app_metadata":{"role":"service"}}',true);
  insert into public.services(name) values('Path membership fixture') returning id into svc;
  insert into public.phases(service_id,name,position) values(svc,'Phase',0) returning id into ph;
  insert into public.scenarios(phase_id,name,position) values(ph,'Scenario',0) returning id into sc;
  insert into public.paths(scenario_id,name,kind) values(sc,'Online','happy') returning id into a;
  insert into public.paths(scenario_id,name,kind) values(sc,'Phone','variant') returning id into b;
  start_id:=public.add_step(a,'Start',0); review_id:=public.add_step(a,'Review',1); end_id:=public.add_step(a,'Finish',2);
  insert into public.path_steps(path_id,step_id,position) values(b,start_id,0),(b,end_id,3);
  insert into public.lanes(path_id,name,position,lane_role) values(a,'Actor',0,'customer_actions') returning id into la;
  insert into public.lanes(path_id,name,position,lane_role) values(b,'Actor',0,'customer_actions') returning id into lb;
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[])',review_id,a,array[start_id,review_id,end_id],array[a]),'A step must stay on at least one path');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,true,1,%L::uuid[],%L::uuid[])',review_id,b,array[end_id,start_id],array[a]),'This path changed. Reload and try again');
  result:=public.change_step_path(review_id,b,true,1,array[start_id,end_id],array[a]);
  if (select array_agg(step_id order by position) from public.path_steps where path_id=b)<>array[start_id,review_id,end_id] then raise exception 'Attach lost its requested placement'; end if;
  perform public.undo_step_path_change((result->>'receipt_id')::uuid);
  if exists(select 1 from public.path_steps where path_id=b and step_id=review_id) then raise exception 'Attach inverse left membership'; end if;
  if (select position from public.path_steps where path_id=b and step_id=end_id)<>3 then raise exception 'Attach inverse lost stored positions'; end if;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',result->>'receipt_id'),'This path change cannot be undone. Reload the canvas');
  result:=public.change_step_path(review_id,b,true,1,array[start_id,end_id],array[a]);
  select array_agg(x order by x) into members from unnest(array[a,b]) x;
  insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,review_id,'Saved review') returning id into cell;
  insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,end_id,'Saved outcome') returning id into target_cell;
  insert into public.cell_touchpoints(cell_id,name,position,origin) values(cell,'Counter',0,'app') returning id into placement;
  insert into public.resources(cell_id,cell_touchpoint_id,name,url,position,origin) values(cell,placement,'Guide','https://example.com/guide',0,'app') returning id into resource;
  insert into public.cell_dependencies(source_cell_id,target_cell_id,kind) values(cell,target_cell,'leads_to') returning id into edge;
  update public.cells set cell_key=cell::text where id=cell;
  insert into public.evidence(service_id,cell_id,cell_key,kind,title) values(svc,cell,(select cell_key from public.cells where id=cell),'observation','Observed review') returning id into ev;
  insert into public.slices(service_id,kind,title) values(svc,'custom','Saved view') returning id into slice_id;
  insert into public.slides(slice_id,position,cell_ids,cell_keys) values(slice_id,0,array[cell],array[cell::text]) returning id into slide_id;
  insert into public.slide_images(slide_id,position,cell_id,image_url) values(slide_id,0,cell,null) returning id into image_id;
  select to_jsonb(c) into original_target from public.cells c where c.id=target_cell;
  select to_jsonb(c) into original_cell from public.cells c where c.id=cell;
  select to_jsonb(r) into original_resource from public.resources r where r.id=resource;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',result->>'receipt_id'),'This step has content since your save. Remove it explicitly instead');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[])',review_id,b,array[start_id,review_id,end_id],members),'The cells on this step changed. Reload and confirm removing them');
  select jsonb_agg(jsonb_build_object('id',c.id,'updated_at',c.updated_at) order by c.id) into confirmation from public.cells c where c.id=cell;
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,false,0,%L::uuid[],%L::uuid[],%L::jsonb)',review_id,b,array[start_id,review_id,end_id],members,'[]'),'The cells on this step changed. Reload and confirm removing them');
  detached:=public.change_step_path(review_id,b,false,0,array[start_id,review_id,end_id],members,confirmation);
  if exists(select 1 from public.cells where id=cell) or exists(select 1 from public.resources where id=resource) then raise exception 'Detach left live cells or resources'; end if;
  if not exists(select 1 from public.evidence where id=ev and cell_id=cell) then raise exception 'Detach removed provenance'; end if;
  if exists(select 1 from public.evidence e join public.cells c on c.id=e.cell_id where e.id=ev) then raise exception 'Detached provenance unexpectedly has a live cell'; end if;
  update public.lanes set owner_team='New ownership' where id=lb;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'The lanes holding this step changed. Reload before undoing');
  update public.lanes set owner_team=null where id=lb;
  delete from public.cells where id=target_cell;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'Content referenced by this change changed. Reload before undoing');
  if exists(select 1 from public.cells where id=cell) or exists(select 1 from public.path_steps where path_id=b and step_id=review_id) then raise exception 'Refused inverse leaked restored rows'; end if;
  insert into public.cells select * from jsonb_populate_record(null::public.cells,original_target);
  -- A newer path order refuses the inverse, and its own inverse restores it.
  proof_order:=public.reorder_steps(b,array[end_id,start_id],array[start_id,end_id]);
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'This step or path changed since your save. Reload before undoing');
  perform public.undo_structure_order(proof_order);
  perform public.undo_step_path_change((detached->>'receipt_id')::uuid);
  if original_cell is distinct from (select to_jsonb(c) from public.cells c where c.id=cell)
     or original_resource is distinct from (select to_jsonb(r) from public.resources r where r.id=resource)
     or not exists(select 1 from public.cell_touchpoints where id=placement)
     or not exists(select 1 from public.cell_dependencies where id=edge)
     or not exists(select 1 from public.slide_images where id=image_id) then raise exception 'Detach inverse failed to restore exact content and related identities'; end if;
  if not exists(select 1 from public.evidence e join public.cells c on c.id=e.cell_id where e.id=ev and c.id=cell) then raise exception 'Undo did not reconnect preserved evidence'; end if;
  if exists(select 1 from public.structure_membership_receipts where id=(detached->>'receipt_id')::uuid and (archive<>'{}' or before_state<>'{}' or after_state<>'{}')) then raise exception 'Spent receipt retained content'; end if;
  -- A changed row cannot be overwritten by membership Undo either.
  detached:=public.change_step_path(review_id,b,false,0,array[start_id,review_id,end_id],members,confirmation);
  update public.steps set summary='A newer summary' where id=review_id;
  perform pg_temp.expect_membership_refusal(format('select public.undo_step_path_change(%L)',detached->>'receipt_id'),'This step or path changed since your save. Reload before undoing');
  perform pg_temp.expect_membership_refusal(format('select public.change_step_path(%L,%L,true,1,%L::uuid[],%L::uuid[])',review_id,b,array[start_id,end_id],members),'This path changed. Reload and try again');
  -- All writers, including legacy set_path_steps and direct writes, refuse
  -- before the FK can emit a raw constraint error.
  perform pg_temp.expect_membership_refusal(format('select public.set_path_steps(%L,%L::uuid[])',b,array[start_id]),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('delete from public.path_steps where path_id=%L and step_id=%L',b,end_id),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('update public.path_steps set step_id=%L where path_id=%L and step_id=%L',review_id,b,end_id),'This step has saved cells on this path. Remove its cells explicitly or use the confirmed path removal');
  perform pg_temp.expect_membership_refusal(format('insert into public.cells(path_id,lane_id,step_id,content) values(%L,%L,%L,%L)',b,lb,review_id,'New cell'),'This step is not on this path. Reload the canvas');
  perform pg_temp.expect_membership_refusal(format('update public.cells set step_id=%L where id=%L',review_id,target_cell),'This step is not on this path. Reload the canvas');
  -- Plant one orphan in a rollback-only subtransaction to prove the exact
  -- migration preflight. The deferred FK is never allowed to commit it.
  set constraints all immediate;
  begin
    alter table public.path_steps disable trigger path_step_keeps_saved_cells;
    set constraints cells_path_step_fkey deferred;
    delete from public.path_steps where path_id=b and step_id=end_id;
    perform pg_temp.assert_cell_path_steps();
    raise exception 'Preflight accepted orphaned cells' using errcode='ZX001';
  exception when others then
    if sqlerrm not like 'Cannot upgrade: 1 cell sits off any path-step. Find them with: SELECT%' then raise; end if;
  end;
  begin
    alter table public.path_steps disable trigger path_step_keeps_saved_cells;
    set constraints cells_path_step_fkey deferred;
    insert into public.cells(path_id,lane_id,step_id,content) values(b,lb,start_id,'Saved start');
    delete from public.path_steps where path_id=b and step_id in(start_id,end_id);
    perform pg_temp.assert_cell_path_steps();
    raise exception 'Preflight accepted two orphaned cells' using errcode='ZX001';
  exception when others then
    if sqlerrm not like 'Cannot upgrade: 2 cells sit off any path-step. Find them with: SELECT%' then raise; end if;
  end;
  perform public.remove_step(b,end_id);
  if exists(select 1 from public.cells where id=target_cell) then raise exception 'Explicit step deletion left its cells'; end if;
  raise exception 'membership proof complete' using errcode='ZX002';
exception when sqlstate 'ZX002' then null;
end $proof$;
drop function pg_temp.expect_membership_refusal(text,text);
drop function pg_temp.assert_cell_path_steps();

-- @recipe — Exercise authorization and direct grants, including the private table.
do $acl$
begin
  if has_table_privilege('anon','public.structure_membership_receipts','select')
    or has_table_privilege('authenticated','public.structure_membership_receipts','insert')
    or has_table_privilege('authenticated','public.structure_membership_receipts','select')
    or has_function_privilege('anon','public.change_step_path(uuid,uuid,boolean,integer,uuid[],uuid[],jsonb)','execute')
    or has_function_privilege('anon','public.undo_step_path_change(uuid)','execute')
    or has_function_privilege('authenticated','public.structure_membership_state(uuid,uuid)','execute') then
    raise exception 'Membership receipt or write privileges are open';
  end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.change_step_path(gen_random_uuid(),gen_random_uuid(),true,0,'{}','{}');
    raise exception 'A reader changed step membership';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.undo_step_path_change(gen_random_uuid());
    raise exception 'A reader undid step membership';
  exception when insufficient_privilege then null;
  end;
end $acl$;
