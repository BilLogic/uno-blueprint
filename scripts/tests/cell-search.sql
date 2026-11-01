begin;
set local role authenticated;
do $$
declare first_id uuid; second_id uuid; result_id uuid; n integer;
  question text := '[1,0,' || array_to_string(array_fill(0,array[766]),',') || ']';
begin
  begin
    perform public.search_blueprint('request',array['phase'],10);
    raise exception 'A cell-only search silently accepted another level';
  exception when raise_exception then
    if sqlerrm <> 'This search recipe searches cells only; use granularity cell.' then raise; end if;
  end;
  select id into first_id from public.cells order by id limit 1;
  select id into second_id from public.cells where id<>first_id order by id limit 1;
  select id into result_id from public.search_blueprint('__meaning_probe__',array['cell'],1,
    query_embedding=>question,embed_model=>'gemini-embedding-001');
  if result_id is distinct from first_id then raise exception 'Cosine ranking did not return the nearest indexed cell'; end if;
  select count(*) into n from public.search_blueprint((select content from public.cells where id=first_id),array['cell'],100);
  if n<1 then raise exception 'Keyword fallback returned no seeded cell'; end if;
  begin
    perform public.search_blueprint('__meaning_probe__',array['cell'],1,query_embedding=>question,embed_model=>'another-model');
    raise exception 'A different embedding space was accepted';
  exception when raise_exception then
    if sqlerrm<>'embedding model mismatch' then raise; end if;
  end;
  if has_function_privilege('anon','public.search_blueprint(text,text[],integer,text,text,text,text,text,text)','execute') then
    raise exception 'Anonymous callers can execute search';
  end if;
end $$;
reset role;
-- A stale document loses its meaning match, while current indexed cells stay.
update public.cells set summary='A newer fixture description' where id=(select id from public.cells order by id limit 1);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.search_blueprint('__meaning_probe__',array['cell'],100,
    query_embedding=>('[1,0,' || array_to_string(array_fill(0,array[766]),',') || ']'),embed_model=>'gemini-embedding-001');
  if n<>1 then raise exception 'A stale document vector was used'; end if;
  begin
    perform public.store_cell_search_embedding((select id from public.cells order by id limit 1),'gemini-embedding-001','[1,0]','old-hash');
    raise exception 'A caller whose profile may not approve wrote an embedding';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare target uuid; hash text; question text := '[1,0,' || array_to_string(array_fill(0,array[766]),',') || ']'; begin
  select id,md5(coalesce(content,'') || E'\n' || coalesce(summary,'')) into target,hash from public.cells order by id limit 1;
  if public.store_cell_search_embedding(target,'gemini-embedding-001',question,'stale-hash') then
    raise exception 'A stale embedding replaced the index'; end if;
  if not public.store_cell_search_embedding(target,'gemini-embedding-001',question,hash) then
    raise exception 'An approving caller could not index an existing cell'; end if;
  if exists(select 1 from public.cell_search_pending() where cell_id=target) then
    raise exception 'A freshly indexed cell is still pending'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.store_cell_search_embedding((select id from public.cells order by id limit 1),'gemini-embedding-001','[1,0]','old-hash');
    raise exception 'A caller who may not approve wrote an embedding';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'indexed_cells=' || count(*) from public.cell_search_embeddings;
rollback;
