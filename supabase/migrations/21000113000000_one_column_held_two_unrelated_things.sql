-- 21000113000000 — `cells.links` held two concepts, and was named after
-- neither.
--
-- The column stores a jsonb array of `{type, label, url?, description?,
-- picture?, pictures?}`. Two shapes live in it, and the IR schema admits
-- exactly those two:
--
--   type = 'url'               a thing the cell points at. The Resources tab
--                              lists these and nothing else.
--   type = 'tech_description'  prose, a screenshot and a design link about ONE
--                              touchpoint used at this cell, found again by
--                              matching `label` against a line of
--                              `cells.content`.
--
-- One column, two concepts, and no label can be its name: `Links` over the tab
-- would promise both and show one, `Resources` on the column would be wrong
-- for half its rows. CONTEXT.md's interface→schema map has carried that as a
-- recorded divergence since the map was written, and said the fix would be a
-- schema change rather than a naming one. This is that change, and the map row
-- it was holding open goes with it.
--
-- ── The join that is only a string ─────────────────────────────────────────
--
-- A `tech_description` entry finds its touchpoint by comparing its `label` to
-- a line of the cell's own `content`. There is no join but the string, so when
-- the two stop agreeing the prose is not found and nothing says so — a rename
-- in the grid silently orphans the paragraph behind it. Moving the prose onto
-- a row of its own gives it an identity that a rename cannot break.
--
-- ── Two tables, and what each is for ───────────────────────────────────────
--
-- `cell_touchpoints` is the PLACEMENT: this touchpoint, used at this cell,
-- this way. It owns the per-moment `summary`, `screenshots` and `url`, because
-- those are what differ between two uses of the same tool — the second use
-- describes a different screen and points at a different design file.
--
-- `resources` is what a cell — or one placement — points at. A link is one
-- kind of resource, so the table is named for the parent concept and `kind`
-- carries the subtype.
--
-- ── Four decisions inside those two tables ─────────────────────────────────
--
-- 1. A resource attaches to a cell OR to one placement, never both and never
--    neither, enforced by `num_nonnulls(...) = 1` in the schema rather than by
--    agreement in the client — the construction `evidence_exactly_one_target`
--    already uses here. That constraint is what lets a design link belong to
--    the tool it documents rather than to the cell at large.
--
--    NOTHING IS ATTACHED TO A PLACEMENT BY THIS FILE, and nothing in the app
--    writes one yet. Deciding which of a cell's resources really documents one
--    of its touchpoints is an authoring act, and doing it by pattern-matching
--    labels here would be a guess per row. The capability and its constraint
--    ship; the attaching does not. That is stated here rather than left to be
--    found, because a column with no writer is the shape this whole ticket is
--    about — and the constraint is exercised below against the real table, in
--    both directions, so it is a rule rather than a hope.
--
-- 2. `kind` admits `link` and `other`, and the short list is the decision
--    rather than an omission. Every row this file writes is a link, and
--    `other` is the residual every kind column in this schema carries. A value
--    nothing can produce is a vocabulary nobody can check, so the list grows
--    when something produces a second kind.
--
-- 3. `name`, not `label`. This vocabulary gives a NAME to a thing a reader
--    navigates to and a TITLE to authored content a reader reads. A resource
--    is the first: the text names whatever is on the other end of the url.
--    `label` survives on `cell_dependencies` because an edge label genuinely
--    is a tag on a line and not a name for anything.
--
-- 4. `screenshots text[]`, not one `screenshot`. The link shape carries BOTH
--    `picture` and `pictures`, with `pictures` winning where both are set, and
--    `resolveCellDetailPictures` already returns an array to its caller. One
--    array column is what those two fields were always describing, and a
--    single-valued column would silently drop every entry after the first the
--    day an author used the plural field — the loss this file exists to stop.
--
-- ── Provenance goes to `evidence` ──────────────────────────────────────────
--
-- `evidence` exists, has exactly the right columns, and is where a citation
-- belongs. The IR admits two link types and neither is a citation, so a
-- well-formed board has none to move — but the column is jsonb and has
-- accepted anything since it was created, and this file DROPS it, which
-- turns anything left behind from unreachable into gone. So a `ref`-typed
-- entry is carried into `evidence` rather than destroyed, `kind` is `other`
-- because sorting one-line citations into eight buckets by pattern-matching
-- their text is the guess this ticket exists to stop making, and `added_by`
-- records where they came from so the next person can sort them deliberately.
--
-- Anything that is none of the three shapes stops this migration. A fourth
-- shape dropped in silence is how a column comes to hold three things.
--
-- ── One question, one answer: the name of an unnamed resource ──────────────
--
-- Every `url` entry the IR admits carries a label, so the fallback below moves
-- nothing on a well-formed board. It is here because `name` is not null and an
-- entry can arrive without one, and it is the SAME RULE the app applies, in
-- the same characters: `RESOURCE_NAME_FROM_URL` in `src/lib/cellResources.ts`
-- carries this pattern verbatim, and `scripts/tests/one-name-for-an-unnamed-
-- resource.test.ts` fails when the two texts differ. Two answers to "what is
-- this called when nobody said" is how a board starts disagreeing with itself
-- about its own contents.

-- ---------------------------------------------------------------------------
-- The placement
-- ---------------------------------------------------------------------------

create table public.cell_touchpoints (
  id          uuid primary key default gen_random_uuid(),
  cell_id     uuid not null references public.cells (id) on delete cascade,
  -- The touchpoint's name AT THIS CELL. Free text rather than a foreign key
  -- into a catalog: this schema has no catalog of touchpoints, a touchpoint
  -- being a line of `cells.content` today, and inventing one here would mean
  -- deciding for every name whether two spellings are one tool — a guess per
  -- name, in a file whose whole purpose is to stop guessing. A catalog, when
  -- it comes, replaces this column with a reference and moves every placement
  -- at once; until then the placement carries the name it was authored with.
  name        text not null,
  position    int  not null,
  summary     text,
  -- See decision 4. Empty array rather than null: "no screenshots" is one
  -- state, and a reader that has to check for two of them checks for one.
  screenshots text[] not null default '{}'::text[],
  url         text,
  origin      text not null check (origin in ('import', 'app')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A cell names a touchpoint once. Two placements of one name at one moment
  -- are two paragraphs about the same thing with no way to tell them apart,
  -- which is the string join's failure wearing different clothes.
  constraint cell_touchpoints_cell_name_unique unique (cell_id, name),
  -- Deferrable: a reorder swaps two positions inside one transaction and an
  -- immediate check fails halfway through the swap.
  constraint cell_touchpoints_cell_position_unique
    unique (cell_id, position) deferrable initially deferred
);

comment on table public.cell_touchpoints is
  'One touchpoint, used at one cell. Owns the summary, screenshots and design '
  'link for THIS moment, which is what differs between two uses of the same '
  'tool. Replaces the tech_description entries of the old cells.links column, '
  'which found their touchpoint by matching a string.';
comment on column public.cell_touchpoints.name is
  'What the touchpoint is called at this cell. There is no catalog yet; a '
  'catalog replaces this column with a reference.';
comment on column public.cell_touchpoints.screenshots is
  'Screenshots or illustrations for this moment, in author order.';
comment on column public.cell_touchpoints.url is
  'The design file or external reference for THIS moment, not for the tool.';

-- ---------------------------------------------------------------------------
-- The resources
-- ---------------------------------------------------------------------------

create table public.resources (
  id                 uuid primary key default gen_random_uuid(),
  -- Exactly one of these two is set. `cascade` on both: a resource is a
  -- property of the thing it hangs off and outlives neither.
  cell_id            uuid references public.cells (id) on delete cascade,
  cell_touchpoint_id uuid references public.cell_touchpoints (id) on delete cascade,
  kind               text not null default 'link'
                       check (kind in ('link', 'other')),
  name               text not null,
  url                text,
  position           int  not null,
  origin             text not null check (origin in ('import', 'app')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Decision 1, in the schema rather than in the client.
  constraint resources_one_owner
    check (num_nonnulls(cell_id, cell_touchpoint_id) = 1),
  -- A link with no url renders nowhere, which is what a misfiled citation was.
  constraint resources_link_has_url
    check (kind <> 'link' or nullif(btrim(url), '') is not null),
  -- Deferrable for the reason the placement's is.
  constraint resources_cell_position_unique
    unique (cell_id, position) deferrable initially deferred,
  constraint resources_touchpoint_position_unique
    unique (cell_touchpoint_id, position) deferrable initially deferred
);

comment on table public.resources is
  'Things a cell, or one touchpoint placement, points at. A link is one kind '
  'of resource and `kind` carries the subtype. Exactly one of cell_id and '
  'cell_touchpoint_id is set, so a design link can belong to the tool it '
  'documents rather than to the cell at large.';
comment on column public.resources.name is
  'What the thing on the other end is called. `name`, not `label`: a reader '
  'navigates to it.';

-- No separate foreign-key indexes on either table: each unique constraint
-- above leads with its owning column, so `where cell_id = ?` and
-- `where cell_touchpoint_id = ?` are already served by one.

create trigger set_cell_touchpoints_updated_at
  before update on public.cell_touchpoints
  for each row execute function public.set_updated_at();

create trigger set_resources_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- @recipe — RLS and the Supabase role grants for both tables. Another host
-- expresses "anyone may read, only the service account may write" with its own
-- primitives; the tables above are plain Postgres.

alter table public.cell_touchpoints enable row level security;
alter table public.resources enable row level security;

create policy cell_touchpoints_select_anon on public.cell_touchpoints
  for select to anon using (true);
create policy cell_touchpoints_select_auth on public.cell_touchpoints
  for select to authenticated using (true);
create policy cell_touchpoints_insert_service_only on public.cell_touchpoints
  for insert to authenticated with check (public.is_service_account());
create policy cell_touchpoints_update_service_only on public.cell_touchpoints
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy cell_touchpoints_delete_service_only on public.cell_touchpoints
  for delete to authenticated using (public.is_service_account());

create policy resources_select_anon on public.resources
  for select to anon using (true);
create policy resources_select_auth on public.resources
  for select to authenticated using (true);
create policy resources_insert_service_only on public.resources
  for insert to authenticated with check (public.is_service_account());
create policy resources_update_service_only on public.resources
  for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy resources_delete_service_only on public.resources
  for delete to authenticated using (public.is_service_account());

grant select on public.cell_touchpoints, public.resources to anon, authenticated;
grant insert, delete on public.cell_touchpoints, public.resources to authenticated;
-- Column-level, as the authoring migration argues for `cells`: what a row
-- SAYS may move through a direct update; WHICH cell or placement owns it is
-- structure, and structure does not.
grant update (name, position, summary, screenshots, url)
  on public.cell_touchpoints to authenticated;
grant update (kind, name, url, position) on public.resources to authenticated;
-- The platform grants anon these at create time on every relation created in
-- `public`. Nothing anonymous writes, and TRUNCATE is not subject to RLS.
revoke insert, update, delete, truncate
  on public.cell_touchpoints, public.resources from anon;
revoke truncate on public.cell_touchpoints, public.resources from authenticated;

-- @core

-- ---------------------------------------------------------------------------
-- Prove the owner constraint, both ways
--
-- A CHECK that was written and never exercised is indistinguishable from one
-- that was written wrong, and this is the one design point the ticket is firm
-- on. So both halves of `num_nonnulls(...) = 1` are attempted against the real
-- constraint. Neither insert leaves a row: either the constraint refuses it,
-- or it does not and this migration stops.
--
-- The first needs nothing to exist, so it runs on an empty database too. The
-- second needs a placement to point at — there is none yet at this point in
-- the file, so it is deferred until after the data has moved, at the bottom.
-- ---------------------------------------------------------------------------

do $probe$
begin
  begin
    insert into public.resources (kind, name, url, position, origin)
    values ('link', 'ZZ Probe', 'https://example.invalid/', 1, 'app');
    raise exception
      'a resource owned by neither a cell nor a placement was accepted';
  exception
    when check_violation then null;
  end;
end
$probe$;

-- ---------------------------------------------------------------------------
-- The touchpoint prose
--
-- Every `tech_description` entry becomes a placement on the cell that carried
-- it, whether or not its label still matches a line of that cell's content. A
-- label that matches nothing is exactly the orphan the string join produced,
-- and dropping those to a "resolves today" filter would destroy the authored
-- paragraph on the way past. The name it was authored with is preserved, and
-- reattaching an orphan is an edit somebody can now make to a row.
--
-- `with ordinality` keeps the order the author typed. `pictures` wins over
-- `picture` where an entry carries both, which is what the reader already
-- does.
-- ---------------------------------------------------------------------------

insert into public.cell_touchpoints
  (cell_id, name, position, summary, screenshots, url, origin)
select
  c.id,
  btrim(item.link ->> 'label'),
  row_number() over (partition by c.id order by item.ord)::int,
  nullif(btrim(coalesce(item.link ->> 'description', '')), ''),
  coalesce(
    (select array_agg(btrim(picture.value #>> '{}') order by picture.ord)
     from jsonb_array_elements(
            case
              when jsonb_typeof(item.link -> 'pictures') = 'array'
                then item.link -> 'pictures'
              else '[]'::jsonb
            end)
          with ordinality as picture(value, ord)
     where nullif(btrim(picture.value #>> '{}'), '') is not null),
    case
      when nullif(btrim(coalesce(item.link ->> 'picture', '')), '') is not null
        then array[btrim(item.link ->> 'picture')]
      else '{}'::text[]
    end),
  nullif(btrim(coalesce(item.link ->> 'url', '')), ''),
  'import'
from public.cells c
cross join lateral
  jsonb_array_elements(c.links) with ordinality as item(link, ord)
where item.link ->> 'type' = 'tech_description'
  and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- The resources
--
-- `row_number` makes the position 1-based and contiguous per cell, which is
-- what the position constraint and the sync function below both assume. A cell
-- may hold the same url twice — that is the author's business, and there is
-- deliberately no unique on url.
-- ---------------------------------------------------------------------------

insert into public.resources (cell_id, kind, name, url, position, origin)
select
  c.id,
  'link',
  coalesce(
    nullif(btrim(coalesce(item.link ->> 'label', '')), ''),
    nullif(
      regexp_replace(
        lower(btrim(item.link ->> 'url')),
        '^https?://(?:[^@/?#]*@)?(?:www\.)?([^/?#:]+).*$',
        '\1'),
      lower(btrim(item.link ->> 'url'))),
    'Link'),
  btrim(item.link ->> 'url'),
  row_number() over (partition by c.id order by item.ord)::int,
  'import'
from public.cells c
cross join lateral
  jsonb_array_elements(c.links) with ordinality as item(link, ord)
where item.link ->> 'type' = 'url'
  and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- The citations
-- ---------------------------------------------------------------------------

insert into public.evidence
  (service_id, cell_id, cell_key, kind, title, ref, added_by)
select
  ph.service_id,
  c.id,
  -- `evidence_cell_key_paired` demands a key whenever `cell_id` is set, and
  -- `cells.cell_key` is nullable. `mint_cell_key` answers with the key the
  -- import pipeline would have given that cell, which is a derivation rather
  -- than a guess.
  coalesce(c.cell_key, public.mint_cell_key(c.path_id, c.lane_id, c.step_id)),
  'other',
  btrim(item.link ->> 'label'),
  nullif(
    btrim(coalesce(item.link ->> 'ref', item.link ->> 'url', '')),
    ''),
  'cells-links-split'
from public.cells c
join public.paths p on p.id = c.path_id
join public.scenarios s on s.id = p.scenario_id
join public.phases ph on ph.id = s.phase_id
cross join lateral jsonb_array_elements(c.links) as item(link)
where item.link ->> 'type' = 'ref'
  and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null;

-- ---------------------------------------------------------------------------
-- Rewriting a cell's resources is one transaction
--
-- The resources tab replaces a whole list. PostgREST gives every statement its
-- own transaction, and a deferred position constraint only forgives a
-- collision until COMMIT — so a delete followed by an insert over the wire is
-- two transactions and a window where the cell has no resources at all.
--
-- Delete-and-reinsert rather than a diff, and the difference from a placement
-- is the point: a placement carries a per-moment summary and screenshots that
-- a delete would destroy, while a resource carries nothing that is not in the
-- list being written. The simpler operation is also the correct one.
--
-- Placement-attached resources are untouched. This is the CELL's editor, and
-- it reaches only rows whose `cell_id` is this cell.
-- ---------------------------------------------------------------------------

create or replace function public.sync_cell_resources(
  p_cell_id uuid,
  p_rows    jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_nameless int;
begin
  if not exists (select 1 from public.cells c where c.id = p_cell_id) then
    raise exception 'cell % does not exist', p_cell_id;
  end if;

  -- Refused rather than defaulted. The editor already falls back to the url's
  -- host, so a nameless row arriving here means a caller skipped that, and
  -- inventing a name on its behalf hides the bug and adds a second answer to
  -- the question this file's header settles.
  select count(*) into v_nameless
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(kind text, name text, url text)
  where nullif(btrim(coalesce(r.name, '')), '') is null;
  if v_nameless <> 0 then
    raise exception '% resource(s) arrived with no name', v_nameless;
  end if;

  delete from public.resources where cell_id = p_cell_id;

  insert into public.resources (cell_id, kind, name, url, position, origin)
  select p_cell_id,
         coalesce(nullif(btrim(coalesce(r.kind, '')), ''), 'link'),
         btrim(r.name),
         nullif(btrim(coalesce(r.url, '')), ''),
         r.ord::int,
         'app'
  -- `rows from (... as (...)) with ordinality`, not
  -- `jsonb_to_recordset(...) with ordinality as r(...)`. Postgres refuses the
  -- second outright — "WITH ORDINALITY cannot be used with a column definition
  -- list" — and nothing static would catch it: the file parses, a replay
  -- against an empty database never calls the function, and a unit test that
  -- stubs the RPC never reaches it. It takes running the real function against
  -- a real server, which is why this one was.
  from rows from (
    jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as (kind text, name text, url text)
  ) with ordinality as r(kind, name, url, ord);
end
$function$;

comment on function public.sync_cell_resources(uuid, jsonb) is
  'Replace one cell''s resources in a single transaction, in list order. '
  'Placement-attached resources are not this function''s business.';

-- @recipe — the Supabase role that calls it.
grant execute on function public.sync_cell_resources(uuid, jsonb) to authenticated;
-- @core

-- ---------------------------------------------------------------------------
-- The functions that read the column, before it goes
--
-- Two read `cells.links`: `duplicate_path` and `duplicate_scenario`, which
-- copy every authored column of a cell.
--
-- They are rewritten from the definition the DATABASE holds rather than from
-- the file that created them, and that is deliberate. The rename band
-- 21000103..21000112 rewrote these bodies in place, so the newest FILE
-- defining them still says `layers`, `slot_position`, `description` and
-- `service_scenario_id` while the database says none of those. Re-creating
-- from a file that has drifted resurrects whatever it drifted from, and
-- nothing would report it. Reading the catalogue cannot drift by construction.
--
-- Every substitution is asserted to have matched, and a sweep at the bottom of
-- this file proves the rewrite reached both — because a `replace` that
-- silently matched nothing is how a rename comes to look applied while a
-- function still carries the old word, which is what 21000112 was written to
-- clean up.
--
-- The copy carries the new tables rather than losing them. Before this file, a
-- duplicated path carried its resources and its touchpoint prose because both
-- were columns of the row being copied; splitting them into tables would take
-- that away silently. The join onto the copies is (path, lane, step, slot) —
-- the same one the arrows below already use, and for the same reason.
--
-- The `links` anchors name the column AND THE ONE AFTER IT rather than the one
-- before. `picture, links, function,` would be the obvious anchor and is the
-- fragile one: it stops matching the day a neighbour is renamed, and this
-- schema renames neighbours.
-- ---------------------------------------------------------------------------

do $rewrite$
declare
  v_def    text;
  v_next   text;
  v_carry  text;
  v_hits   int := 0;
begin
  -- The two inserts appended to each copy. Written once, with the source
  -- cell's filter left as a token the two substitutions below fill in, so the
  -- copy rule exists in one place rather than twice.
  v_carry := $carry$

    -- The placements and the resources the copied cells carry. Matched to
    -- their copies on (path, lane, step, slot), which is the join the arrows
    -- below use and stops a multi-cell slot from fanning one row out into a
    -- copy per sibling.
    insert into public.cell_touchpoints
      (cell_id, name, position, summary, screenshots, url, origin)
    select nc.id, ct.name, ct.position, ct.summary, ct.screenshots, ct.url, 'app'
    from public.cell_touchpoints ct
    join public.cells c on c.id = ct.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position;

    insert into public.resources
      (cell_id, kind, name, url, position, origin)
    select nc.id, r.kind, r.name, r.url, r.position, 'app'
    from public.resources r
    join public.cells c on c.id = r.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position;

    -- Placement-attached resources, keyed through the placement's name on the
    -- copied cell. Nothing writes one today; carrying them anyway is what
    -- stops the first one that is written from being lost by a copy.
    insert into public.resources
      (cell_touchpoint_id, kind, name, url, position, origin)
    select nct.id, r.kind, r.name, r.url, r.position, 'app'
    from public.resources r
    join public.cell_touchpoints ct on ct.id = r.cell_touchpoint_id
    join public.cells c on c.id = ct.cell_id and @SOURCE@
    join public.cells nc
      on nc.path_id = new_path_id
     and nc.lane_id = (lane_map ->> c.lane_id::text)::uuid
     and nc.step_id = @STEP@
     and nc.position is not distinct from c.position
    join public.cell_touchpoints nct
      on nct.cell_id = nc.id and nct.name = ct.name;
$carry$;

  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '\mc\.links\M'
    order by pg_get_functiondef(p.oid)
  loop
    v_next := v_def;

    -- The column list and the projection of the cells copy.
    v_next := replace(v_next, ', links, function,', ', function,');
    v_next := replace(v_next, ', c.links, c.function,', ', c.function,');

    -- `duplicate_path` copies one path into the same scenario, so the copy
    -- points at the very same `steps` rows.
    v_next := replace(
      v_next,
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = duplicate_path.source_path_id;' || E'\n',
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = duplicate_path.source_path_id;' || E'\n' ||
      replace(
        replace(v_carry,
                '@SOURCE@', 'c.path_id = duplicate_path.source_path_id'),
        '@STEP@', 'c.step_id'));

    -- `duplicate_scenario` mints new steps, so the copy is found through the
    -- step map its own loop built.
    v_next := replace(
      v_next,
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = src_path.id;' || E'\n',
      '    from public.cells c' || E'\n' ||
      '    where c.path_id = src_path.id;' || E'\n' ||
      replace(
        replace(v_carry, '@SOURCE@', 'c.path_id = src_path.id'),
        '@STEP@', '(step_map ->> c.step_id::text)::uuid'));

    if v_next = v_def then
      raise exception
        'a function reads cells.links in a shape this migration does not know: %',
        left(v_def, 200);
    end if;
    if v_next ~ '@SOURCE@|@STEP@' then
      raise exception 'the carry-forward block was spliced in unfilled';
    end if;

    execute v_next;
    v_hits := v_hits + 1;
  end loop;

  if v_hits <> 2 then
    raise exception
      'expected to rewrite duplicate_path and duplicate_scenario, rewrote %',
      v_hits;
  end if;
end
$rewrite$;

-- ---------------------------------------------------------------------------
-- Nothing may be left in the column
--
-- Invariants, not a census. This file has to replay against an empty database,
-- so asserting a row count would fail every empty replay forever. Asserting
-- that the column holds nothing this file did not carry across is vacuously
-- true on an empty table and exactly as strong on a full one.
-- ---------------------------------------------------------------------------

do $left$
declare
  v_lost_detail   int;
  v_lost_resource int;
  v_lost_citation int;
  v_stray         int;
  v_both_owners   int;
begin
  select count(*) into v_lost_detail
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'tech_description'
    and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null
    and not exists (
      select 1 from public.cell_touchpoints ct
      where ct.cell_id = c.id and ct.name = btrim(item.link ->> 'label')
    );
  if v_lost_detail <> 0 then
    raise exception '% touchpoint details did not reach a placement', v_lost_detail;
  end if;

  select count(*) into v_lost_resource
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'url'
    and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is not null
    and not exists (
      select 1 from public.resources r
      where r.cell_id = c.id and r.url = btrim(item.link ->> 'url')
    );
  if v_lost_resource <> 0 then
    raise exception '% resources did not reach the table', v_lost_resource;
  end if;

  select count(*) into v_lost_citation
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where item.link ->> 'type' = 'ref'
    and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is not null
    and not exists (
      select 1 from public.evidence e
      where e.cell_id = c.id
        and e.title = btrim(item.link ->> 'label')
        and e.ref is not distinct from nullif(
          btrim(coalesce(item.link ->> 'ref', item.link ->> 'url', '')),
          '')
    );
  if v_lost_citation <> 0 then
    raise exception '% provenance citations did not reach evidence', v_lost_citation;
  end if;

  -- Anything the three clauses above did not name — including an entry of a
  -- known type with nothing in the field that carries its content. A fourth
  -- shape would otherwise be dropped in silence, which is how this column came
  -- to hold two things in the first place.
  select count(*) into v_stray
  from public.cells c
  cross join lateral jsonb_array_elements(c.links) as item(link)
  where coalesce(item.link ->> 'type', '')
          not in ('url', 'ref', 'tech_description')
     or (item.link ->> 'type' = 'url'
         and nullif(btrim(coalesce(item.link ->> 'url', '')), '') is null)
     or (item.link ->> 'type' in ('ref', 'tech_description')
         and nullif(btrim(coalesce(item.link ->> 'label', '')), '') is null);
  if v_stray <> 0 then
    raise exception
      '% link entries are of a shape this migration does not know', v_stray
      using hint = 'Give the entry the field its type needs, or remove it — '
                   'dropping the column destroys whatever is left in it.';
  end if;

  -- The constraint says this cannot happen. Asserted anyway, for the reason
  -- the probes above exist.
  select count(*) into v_both_owners
  from public.resources
  where num_nonnulls(cell_id, cell_touchpoint_id) <> 1;
  if v_both_owners <> 0 then
    raise exception '% resources name a cell and a placement', v_both_owners;
  end if;
end
$left$;

-- The second half of the owner proof, now that a placement may exist to point
-- at. It says so when there is none rather than passing quietly, so an empty
-- replay cannot be mistaken for a database where the constraint was tested.

do $probe$
declare
  v_cell      uuid;
  v_placement uuid;
begin
  select ct.cell_id, ct.id into v_cell, v_placement
  from public.cell_touchpoints ct limit 1;

  if v_placement is null then
    raise notice
      'no placement exists, so the both-owners proof has nothing to run against';
    return;
  end if;

  begin
    insert into public.resources
      (cell_id, cell_touchpoint_id, kind, name, url, position, origin)
    values (v_cell, v_placement, 'link', 'ZZ Probe',
            'https://example.invalid/', 1, 'app');
    raise exception 'a resource owned by a cell AND a placement was accepted';
  exception
    when check_violation then null;
  end;
end
$probe$;

-- ---------------------------------------------------------------------------
-- And the column goes
-- ---------------------------------------------------------------------------

alter table public.cells drop constraint cells_links_is_array;
alter table public.cells drop column links;

-- The grant that named it is amended at its source, in
-- `20260818000000_authoring_foundation.sql`, and the reason is written there.
-- A superseding grant here would not have worked: the recipe is applied on
-- top of the core in one pass, so by the time any recipe statement runs the
-- column is already gone and the earlier grant has already failed.

-- Nothing in `public` may still read it. `drop column` refuses when a view or
-- an index depends on the column and says nothing at all about a function
-- body, which is the whole reason the rewrite above had to be explicit.

do $sweep$
declare
  v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ~ '(\mc\.links\M|[ (]links,)';
  if v_left is not null then
    raise exception 'these functions still read cells.links: %', v_left;
  end if;
end
$sweep$;

-- ---------------------------------------------------------------------------
-- The compatibility stamp
--
-- Two new tables and a dropped column is the loudest kind of shape change: a
-- target at 2026.08.27 answers to `cells.links` and a target at this number
-- does not. `src/lib/backend/schemaVersion.ts` carries the matching entry, and
-- `check:version` fails if the two disagree.
--
-- Older numbers are not evicted from the supported list, following this
-- series' precedent: a version leaves that list when the migration that would
-- carry it forward stops existing, and that migration is this file.
-- ---------------------------------------------------------------------------

update public.schema_version
set version = '2026.08.31',
    applied_at = now();

do $version$
begin
  if not exists (select 1 from public.schema_version where version = '2026.08.31') then
    raise exception 'schema_version did not take the bump';
  end if;
end
$version$;
