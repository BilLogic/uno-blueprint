-- The reader seam: persisted rows from other sessions, on the scratch stack.
insert into auth.users(id,email) values
 ('c0000000-0000-4000-8000-000000000001','reader@example.test'),
 ('c0000000-0000-4000-8000-000000000002','other-reader@example.test');
insert into public.stakeholders(id,name,kind) values
 ('e0000000-0000-4000-8000-000000000001','Reviewing partner','partner');
insert into public.profiles(id,stakeholder_id,user_id,display_name,may_confirm) values
 ('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Reader profile',true);
update public.cells set owner='Fixture owner' where id='f0000000-0000-4000-8000-110300010001';
insert into public.business_models(service_id,pricing) values
 ('f0000000-0000-4000-8000-000000000010','A persisted pricing fact');
insert into public.evidence(id,service_id,cell_id,cell_key,kind,title,note) values
 ('d0000000-0000-4000-8000-000000000101','f0000000-0000-4000-8000-000000000010','f0000000-0000-4000-8000-110300010001','fixture-cell','interview','Reader seam interview','A persisted source note');
insert into public.authoring_changes(fn,args,author,author_id,agent_session_id) values
 ('update_cell_content','{"cell_id":"f0000000-0000-4000-8000-110300010001","note":"Written by another session"}','agent','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000099');
insert into public.audit_findings(service_id,run_id,source,check_key,severity,impact,effort,summary,cell_ids,cell_keys,fingerprint) values
 ('f0000000-0000-4000-8000-000000000010',gen_random_uuid(),'audit','reader-gap','warn','high','low','A persisted finding',array['f0000000-0000-4000-8000-110300010001'::uuid],array['f0000000-0000-4000-8000-110300010001'],'reader-gap:fixture');
insert into public.cell_dependencies(source_cell_id,target_cell_id,kind,note)
 select c.id,other.id,'enables','A persisted condition' from public.cells c
 cross join lateral(select id from public.cells where path_id=c.path_id and id<>c.id order by id limit 1) other
 where c.id='f0000000-0000-4000-8000-110300010001'
 on conflict(source_cell_id,target_cell_id,kind) do update set note=excluded.note;

-- A real PostgREST RPC over a seeded row. The external embedding provider is
-- a test transport; this function requires its vector and model on the wire.
create function public.search_blueprint(q text,granularity text[],match_count int,
 filter_phase text default null,filter_scenario text default null,filter_path_kind text default null,
 filter_lane_role text default null,query_embedding text default null,embed_model text default null)
returns table(kind text,id uuid,snippet text,matched_by text,total_matched bigint)
language plpgsql as $$ begin
 if embed_model<>'read-test-index' or query_embedding<>'[1,0]' then raise exception 'The server embedding did not reach search.'; end if;
 return query select 'cell'::text,c.id,'A remote search result'::text,'meaning'::text,1::bigint
 from public.cells c where c.id='f0000000-0000-4000-8000-110300010001';
end $$;
grant execute on function public.search_blueprint(text,text[],int,text,text,text,text,text,text) to authenticated;
