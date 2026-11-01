-- Authored 2026-11-01.
-- A slice may cite cells from more than one service, and someone who may
-- confirm can share it as a link. The link opens the slice and the cells it
-- cites, read live, and nothing else.
--
-- What a link holds: a token of 64 lowercase hex characters, made of two
-- `gen_random_uuid()` values (122 random bits each, from the server's strong
-- random source; 244 bits together). Only its SHA-256 is stored, so neither a
-- database read nor the change log can give a working link back. A link stops
-- working when it is revoked or its slice is deleted.
--
-- Why a function and not a table policy: the template's blueprint tables carry
-- public SELECT policies, and Postgres ORs a table's policies together, so a
-- token-keyed policy could never narrow what a reader already sees. A link
-- reads through `read_shared_slice` alone, which returns the slice's own
-- fields and its cited cells, resolved at read time. A deployment that
-- revokes anon's table reads keeps every link working unchanged.

create table public.slice_shares (
  id uuid primary key default gen_random_uuid(),
  slice_id uuid not null references public.slices(id) on delete cascade,
  token_hash bytea not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint slice_shares_token_hash_unique unique (token_hash),
  constraint slice_shares_token_hash_is_sha256 check (octet_length(token_hash) = 32)
);
create index slice_shares_slice_id_idx on public.slice_shares (slice_id);

comment on table public.slice_shares is
  'One share link to a slice. Holds only the SHA-256 of the link token, never the token. A link opens the slice through read_shared_slice and stops working once revoked_at is set or its slice is deleted.';
comment on column public.slice_shares.token_hash is
  'SHA-256 of the link token. The token itself is returned once, to the person who shared the slice, and is not stored.';
comment on column public.slice_shares.revoked_at is
  'When the link stopped working; null while it works.';
comment on column public.slice_shares.created_by is
  'The profile that shared the slice.';

-- Every server write captures the rows it changed; a share is one of them.
create trigger capture_agent_prior after insert or update or delete on public.slice_shares
  for each row execute function public.capture_agent_prior_rows();

-- The one read a link makes. Every refusal says the same sentence, so a
-- reader cannot tell a revoked link from one that never existed.
create function public.read_shared_slice(p_token text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare share public.slice_shares; slice public.slices;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This link does not open a slice. Ask the person who sent it for a new one.' using errcode = 'PT404';
  end if;
  select s.* into share from public.slice_shares s
   where s.token_hash = sha256(convert_to(p_token, 'UTF8')) and s.revoked_at is null;
  if share.id is null then
    raise exception 'This link does not open a slice. Ask the person who sent it for a new one.' using errcode = 'PT404';
  end if;
  select sl.* into strict slice from public.slices sl where sl.id = share.slice_id;
  return jsonb_build_object(
    'title', slice.title, 'summary', slice.summary, 'kind', slice.kind, 'actor', slice.actor,
    'slides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', sd.position, 'title', sd.title, 'caption', sd.caption,
        'cells', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id, 'service', sv.name, 'scenario', sc.name, 'lane', l.name, 'step', st.name,
            'content', c.content, 'summary', c.summary) order by cited.ord)
            from unnest(sd.cell_ids) with ordinality cited(cell_id, ord)
            join public.cells c on c.id = cited.cell_id
            join public.lanes l on l.id = c.lane_id
            join public.steps st on st.id = c.step_id
            join public.paths p on p.id = c.path_id
            join public.scenarios sc on sc.id = p.scenario_id
            join public.phases ph on ph.id = sc.phase_id
            join public.services sv on sv.id = ph.service_id), '[]'::jsonb))
        order by sd.position)
        from public.slides sd where sd.slice_id = slice.id), '[]'::jsonb));
end $$;
comment on function public.read_shared_slice(text) is
  'What a share link shows: the slice''s title, summary, kind and actor, and each slide with the cells it cites, read at call time. Refuses a revoked, unknown or malformed token with one sentence.';

-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Short stage label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this scenario; an empty string leaves it blank; omit for none"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"share_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"unshare_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Short label for what happens; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this step; an empty string leaves it blank; omit for none"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (an existing tag; see list_owner_tags); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may confirm for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

-- A slice's cells may sit in any service; every other write stays inside the
-- service it names. Sharing and unsharing are checked writes like the rest.
do $$
declare body text; previous text;
begin
  body := pg_get_functiondef('public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure);
  previous := body;
  body := replace(body,
    $old$if p_service_id is not null and exists(select 1 from public.cells c$old$,
    $new$if p_service_id is not null and p_tool not in ('create_slice','replace_slides') and exists(select 1 from public.cells c$new$);
  if body = previous then raise exception 'Expected the one-service cell check did not match'; end if;
  previous := body;
  body := replace(body,
    $old$      when 'create_finding' then$old$,
    $new$      when 'share_slice' then
        id := gen_random_uuid();
        value := to_jsonb(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
        insert into public.slice_shares(id,slice_id,token_hash,created_by)
          values(id,(a->>'slice_id')::uuid,sha256(convert_to(value#>>'{}','UTF8')),profile);
        result := jsonb_build_object('share_id',id,'token',value);
      when 'unshare_slice' then
        update public.slice_shares set revoked_at=now() where slice_id=(a->>'slice_id')::uuid and revoked_at is null;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'This slice has no working link to stop; nothing was changed.'; end if;
        result := jsonb_build_object('links_stopped',n);
      when 'create_finding' then$new$);
  if body = previous then raise exception 'Expected the finding branch did not match'; end if;
  previous := body;
  -- The token goes back to the person who shared, never into the change log.
  body := replace(body,
    $old$'service_id',p_service_id,'result',result)$old$,
    $new$'service_id',p_service_id,'result',case when p_tool='share_slice' then result-'token' else result end)$new$);
  if body = previous then raise exception 'Expected the change-log result did not match'; end if;
  execute body;
end $$;

-- ── THE BEHAVIOUR, PERFORMED ──────────────────────────────────────────────
--
--   1. a link opens exactly the cells its slice cites, from two services, and
--      none of the cells beside them on the same path or in either service;
--   2. a cell changed after sharing shows its new value through the link;
--   3. a revoked link, an unknown token and a malformed token are refused
--      with the same sentence.
--
-- Built and given back inside a sentinel-exception block: a migration may
-- prove a thing, and may not leave the rows it proved it with.
do $shared_slice$
declare
  svc uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  fixture uuid[] := '{}'; cell uuid; phase uuid; scenario uuid; path uuid; lane uuid; step uuid; slice uuid;
  token text := repeat('ab', 32); seen jsonb; ids uuid[]; i int; j int; msg text; done boolean := false;
begin
  begin
    for i in 1..2 loop
      insert into public.services(id, name, slug) values (svc[i], 'link fixture '||i, 'link-fixture-'||svc[i]);
      insert into public.phases(service_id, name, position) values (svc[i], 'fixture phase', 0) returning id into phase;
      insert into public.scenarios(phase_id, name, position) values (phase, 'fixture scenario', 0) returning id into scenario;
      insert into public.paths(scenario_id, name, kind) values (scenario, 'fixture path', 'happy') returning id into path;
      insert into public.lanes(path_id, name, lane_role, position) values (path, 'fixture lane', 'frontstage_actions', 0) returning id into lane;
      for j in 1..2 loop
        insert into public.steps(scenario_id, name) values (scenario, 'fixture step '||j) returning id into step;
        insert into public.path_steps(path_id, step_id, position) values (path, step, j - 1);
        insert into public.cells(path_id, lane_id, step_id, content)
          values (path, lane, step, format($f$service %s cell %s$f$, i, j)) returning id into cell;
        fixture := fixture || cell;
      end loop;
    end loop;
    -- Cited: the first cell of each service. Beside them: each path's second cell.
    insert into public.slices(service_id, kind, title, authorship) values (svc[1], 'custom', 'fixture brief', 'human') returning id into slice;
    insert into public.slides(slice_id, position, cell_ids, cell_keys) values
      (slice, 0, array[fixture[1]], array[fixture[1]::text]),
      (slice, 1, array[fixture[3]], array[fixture[3]::text]);
    insert into public.slice_shares(slice_id, token_hash) values (slice, sha256(convert_to(token, 'UTF8')));

    seen := public.read_shared_slice(token);
    select array_agg((c->>'id')::uuid order by s.ord) into ids
      from jsonb_array_elements(seen->'slides') with ordinality s(slide, ord),
           jsonb_array_elements(s.slide->'cells') c;
    if ids is distinct from array[fixture[1], fixture[3]] then
      raise exception 'a link opened % instead of exactly the cited cells', ids;
    end if;
    if seen::text like '%cell 2%' then raise exception 'a link showed a cell its slice does not cite'; end if;

    update public.cells set content = 'service 2 cell 1, revised' where id = fixture[3];
    if public.read_shared_slice(token)::text not like '%service 2 cell 1, revised%' then
      raise exception 'a link showed a stale value';
    end if;

    update public.slice_shares set revoked_at = now() where slice_id = slice;
    foreach msg in array array[token, repeat('cd', 32), 'not-a-token'] loop
      begin
        perform public.read_shared_slice(msg);
        raise exception 'a link that should not open did';
      exception when sqlstate 'PT404' then null;
      end;
    end loop;
    done := true;
    raise exception 'shared slice fixture rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'shared slice fixture rollback' then raise; end if;
  end;
  if not done then raise exception 'the shared slice cases never ran'; end if;
end
$shared_slice$;

-- @recipe — a link is opened by anyone holding it; the table is no role's to read.
alter table public.slice_shares enable row level security;
revoke all on public.slice_shares from public, anon, authenticated;
revoke all on function public.read_shared_slice(text) from public;
grant execute on function public.read_shared_slice(text) to anon, authenticated;
do $grants$
declare privilege text;
begin
  foreach privilege in array array['select','insert','update','delete'] loop
    if has_table_privilege('anon', 'public.slice_shares', privilege)
      or has_table_privilege('authenticated', 'public.slice_shares', privilege) then
      raise exception 'slice_shares is open to a request role (%)', privilege;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.read_shared_slice(text)', 'execute') then
    raise exception 'a link cannot be opened without signing in';
  end if;
end $grants$;
-- @core
