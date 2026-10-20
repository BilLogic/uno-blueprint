-- Synthetic profiles for attribution; scratch databases only.
-- Unlike tool-writes.sql, the second profile may confirm: both callers
-- make approved writes rather than testing a non-confirmer proposal.
insert into auth.users(id,email) values
 ('c0000000-0000-4000-8000-000000000001','reviewer@example.test'),
 ('c0000000-0000-4000-8000-000000000002','contributor@example.test'),
 ('c0000000-0000-4000-8000-000000000003','peer@example.test') on conflict(id) do nothing;
insert into public.stakeholders(id,name,kind) values
 ('e0000000-0000-4000-8000-000000000001','Reviewing partner','partner'),
 ('e0000000-0000-4000-8000-000000000002','Contributing colleague','staff'),
 ('e0000000-0000-4000-8000-000000000003','Another contributing colleague','staff') on conflict(id) do nothing;
insert into public.profiles(id,stakeholder_id,user_id,display_name,may_confirm) values
 ('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Reviewer',true),
 ('b0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','Contributor',true),
 ('b0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','Peer',false);

-- A linked placement whose own prose must survive in the inverse capture.
insert into public.touchpoints(id,name,origin) values('a0000000-0000-4000-8000-000000000001','Prior fixture tool','app');
insert into public.cell_touchpoints(cell_id,touchpoint_id,position,summary,origin)
select c.id,'a0000000-0000-4000-8000-000000000001',coalesce((select max(position)+1 from public.cell_touchpoints where cell_id=c.id),0),'A prior placement description','app'
from public.cells c order by c.id limit 1;
