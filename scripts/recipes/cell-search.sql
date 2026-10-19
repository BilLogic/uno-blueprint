-- Optional deployment-owned cell search, not part of the template migrations.
-- Apply with an operator connection. Provider credentials never enter SQL.
begin;
create schema if not exists extensions;
grant usage on schema extensions to authenticated;
create extension if not exists vector with schema extensions;
create table if not exists public.cell_search_embeddings (
  cell_id uuid primary key references public.cells(id) on delete cascade,
  model text not null check (model = 'gemini-embedding-001'),
  embedding extensions.vector(768) not null,
  content_hash text not null
);
alter table public.cell_search_embeddings enable row level security;
revoke all on public.cell_search_embeddings from public, anon, authenticated;
grant select on public.cell_search_embeddings to authenticated;
drop policy if exists cell_search_read on public.cell_search_embeddings;
create policy cell_search_read on public.cell_search_embeddings for select to authenticated
  using (exists (select 1 from public.cells c where c.id = cell_id));
create index if not exists cell_search_cosine on public.cell_search_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.search_blueprint(
  q text, granularity text[], match_count integer,
  filter_phase text default null, filter_scenario text default null,
  filter_path_kind text default null, filter_lane_role text default null,
  query_embedding text default null, embed_model text default null
) returns table(kind text, id uuid, snippet text, description text,
  phase text, scenario text, path text, step text, lane text,
  matched_by text, total_matched bigint)
language plpgsql stable security invoker
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare question extensions.vector(768);
begin
  if query_embedding is not null then
    if embed_model is distinct from 'gemini-embedding-001' then
      raise exception 'embedding model mismatch';
    end if;
    question := query_embedding::extensions.vector(768);
  end if;
  return query
  with candidates as (
    select c.id, c.content, c.summary, ph.name as phase_name,
      sc.name as scenario_name, p.name as path_name, st.name as step_name,
      l.name as lane_name,
      to_tsvector('simple', coalesce(c.content, '') || ' ' || coalesce(c.summary, ''))
        @@ plainto_tsquery('simple', q) as words,
      case when question is not null and e.cell_id is not null
        then 1 - (e.embedding <=> question) end as similarity
    from public.cells c
    join public.paths p on p.id = c.path_id
    join public.scenarios sc on sc.id = p.scenario_id
    join public.phases ph on ph.id = sc.phase_id
    join public.steps st on st.id = c.step_id
    join public.lanes l on l.id = c.lane_id
    left join public.cell_search_embeddings e on e.cell_id = c.id
      and e.model = embed_model
      and e.content_hash = md5(coalesce(c.content, '') || E'\n' || coalesce(c.summary, ''))
    where 'cell' = any(granularity)
      and (filter_phase is null or lower(ph.name) = lower(filter_phase))
      and (filter_scenario is null or lower(sc.name) = lower(filter_scenario))
      and (filter_path_kind is null or p.kind = filter_path_kind)
      and (filter_lane_role is null or l.lane_role = filter_lane_role)
  ), matches as (
    select * from candidates where words or similarity is not null
  )
  select 'cell'::text, m.id, m.content, m.summary,
    m.phase_name, m.scenario_name, m.path_name, m.step_name, m.lane_name,
    case when m.words and m.similarity is not null then 'words and meaning'
      when m.words then 'words' else 'meaning' end,
    count(*) over ()
  from matches m
  order by m.similarity desc nulls last, m.words desc, m.id
  limit greatest(1, least(coalesce(match_count, 15), 100));
end;
$$;
revoke all on function public.search_blueprint(text,text[],integer,text,text,text,text,text,text) from public, anon;
grant execute on function public.search_blueprint(text,text[],integer,text,text,text,text,text,text) to authenticated;
-- Indexers can read pending document text as the caller, but only a confirmer
-- can store a vector. A cell changed during its provider call is left pending.
create or replace function public.cell_search_pending(p_limit integer default 5)
returns table(cell_id uuid, document text, content_hash text)
language sql stable security invoker set search_path = pg_catalog, public, pg_temp as $$
  select c.id, coalesce(c.content,'') || E'\n' || coalesce(c.summary,''),
    md5(coalesce(c.content,'') || E'\n' || coalesce(c.summary,''))
  from public.cells c left join public.cell_search_embeddings e on e.cell_id=c.id
  where btrim(coalesce(c.content,'') || coalesce(c.summary,''))<>''
    and (e.cell_id is null or e.model<>'gemini-embedding-001'
      or e.content_hash<>md5(coalesce(c.content,'') || E'\n' || coalesce(c.summary,'')))
  order by c.id limit greatest(1,least(coalesce(p_limit,5),5));
$$;
create or replace function public.store_cell_search_embedding(
  p_cell_id uuid,p_model text,p_embedding text,p_content_hash text
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare current_hash text;
begin
  perform public.confirming_profile_id();
  if p_model is distinct from 'gemini-embedding-001' then raise exception 'embedding model mismatch'; end if;
  select md5(coalesce(c.content,'') || E'\n' || coalesce(c.summary,'')) into current_hash
    from public.cells c where c.id=p_cell_id for share;
  if current_hash is null or current_hash is distinct from p_content_hash then return false; end if;
  insert into public.cell_search_embeddings(cell_id,model,embedding,content_hash)
    values(p_cell_id,p_model,p_embedding::extensions.vector(768),p_content_hash)
    on conflict(cell_id) do update set model=excluded.model,embedding=excluded.embedding,content_hash=excluded.content_hash;
  return true;
end $$;
revoke all on function public.cell_search_pending(integer),public.store_cell_search_embedding(uuid,text,text,text) from public,anon;
grant execute on function public.cell_search_pending(integer),public.store_cell_search_embedding(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
