-- Synthetic profiles for the search index seam; scratch databases only.
insert into auth.users(id,email) values
 ('c0000000-0000-4000-8000-000000000001','reviewer@example.test'),
 ('c0000000-0000-4000-8000-000000000002','contributor@example.test'),
 ('c0000000-0000-4000-8000-000000000003','peer@example.test') on conflict(id) do nothing;
insert into public.stakeholders(id,name,kind) values
 ('e0000000-0000-4000-8000-000000000001','Reviewing partner','partner'),
 ('e0000000-0000-4000-8000-000000000002','Contributing colleague','staff'),
 ('e0000000-0000-4000-8000-000000000003','Another contributing colleague','staff') on conflict(id) do nothing;
insert into public.profiles(id,stakeholder_id,user_id,display_name,may_approve) values
 ('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Reviewer',true),
 ('b0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','Contributor',false),
 ('b0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','Peer',false);


-- Two existing seeded cells with orthogonal fixture vectors; no provider call.
insert into public.cell_search_embeddings(cell_id,model,embedding,content_hash)
select id,'gemini-embedding-001',
  (array[case when n=1 then 1 else 0 end,case when n=2 then 1 else 0 end]
    || array_fill(0,array[766]))::extensions.vector(768),
  md5(coalesce(content,'') || E'\n' || coalesce(summary,''))
from (select id,content,summary,row_number() over(order by id) as n from public.cells order by id limit 2) c;
