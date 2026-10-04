-- A slide shows an ordered set of its cells' frames.
--
-- `21000218000000` gave a slide a pool and a single choice: all its frames,
-- or one member. The useful middle — some of the frames, in an order the
-- author chose, including none — was still unreachable, and an upload still
-- replaced the board rather than joining it.
--
-- The set is a table. Each member names exactly one source: a cited cell, or
-- (from the next ticket) an uploaded URL. `shows_all_images` is the
-- untouched default; the first tick writes rows and clears it.

alter table public.slides
  add column shows_all_images boolean not null default true;

comment on column public.slides.shows_all_images is
  'True until an author ticks or unticks the set. True means show every '
  'cited cell''s frame and keep doing so as the board changes. False means '
  'show exactly slide_images, including none.';

create table public.slide_images (
  id        uuid primary key default gen_random_uuid(),
  slide_id  uuid not null references public.slides (id) on delete cascade,
  position  integer not null,
  cell_id   uuid references public.cells (id) on delete cascade,
  image_url text,
  constraint slide_images_one_source
    check (num_nonnulls(cell_id, image_url) = 1),
  constraint slide_images_position_unique unique (slide_id, position)
);

comment on table public.slide_images is
  'The ordered set of images a slide shows once an author has chosen. '
  'Empty with slides.shows_all_images false is "show nothing"; empty with '
  'shows_all_images true is the untouched default and is not stored.';

comment on column public.slide_images.cell_id is
  'Show this cell''s frame. Cascades away if the cell is deleted.';

comment on column public.slide_images.image_url is
  'Show this uploaded image. Unused until a slide can carry uploads in the set.';

-- Carry the single choice forward as a one-member set.
insert into public.slide_images (slide_id, position, cell_id)
select id, 0, active_frame_cell_id
  from public.slides
 where active_frame_cell_id is not null;

insert into public.slide_images (slide_id, position, image_url)
select id, 0, active_illustration
  from public.slides
 where active_illustration is not null;

update public.slides
   set shows_all_images = false
 where active_frame_cell_id is not null
    or active_illustration is not null;

alter table public.slides
  drop constraint if exists slides_one_active_image,
  drop constraint if exists slides_active_illustration_is_in_the_pool;

alter table public.slides
  drop column illustrations,
  drop column active_frame_cell_id,
  drop column active_illustration;

-- @recipe — anyone may read the set; a signed-in author writes it the
-- same way they write `slides`. The app replaces the set rather than
-- patching members, so INSERT and DELETE are the verbs, not UPDATE.

alter table public.slide_images enable row level security;

create policy slide_images_select_anon on public.slide_images
  for select to anon using (true);
create policy slide_images_select_auth on public.slide_images
  for select to authenticated using (true);
create policy slide_images_insert_auth on public.slide_images
  for insert to authenticated with check (true);
create policy slide_images_delete_auth on public.slide_images
  for delete to authenticated using (true);

grant select on public.slide_images to anon, authenticated;
grant insert, delete on public.slide_images to authenticated;
grant update on public.slides to authenticated;

-- An owner DO block never meets these policies. The probe below is the
-- same question the editor asks: a signed-in session, with the author
-- JWT claims the write-surface check uses, inserting one member.

do $rls$
declare
  svc uuid;
  ph uuid;
  sc uuid;
  pa uuid;
  ln uuid;
  st uuid;
  cell uuid;
  slc uuid;
  sld uuid;
  n integer;
begin
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice 'slide_images rls probe skipped: no authenticated role';
    return;
  end if;

  insert into public.services (name) values ('slide-images-rls') returning id into svc;
  insert into public.phases (service_id, name, position) values (svc, 'p', 0) returning id into ph;
  insert into public.scenarios (phase_id, name, position) values (ph, 's', 0) returning id into sc;
  insert into public.paths (scenario_id, name, kind) values (sc, 'happy', 'happy') returning id into pa;
  insert into public.lanes (path_id, name, position) values (pa, 'lane', 0) returning id into ln;
  insert into public.steps (scenario_id, name) values (sc, 'step') returning id into st;
  insert into public.path_steps (path_id, step_id, position) values (pa, st, 0);
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'one', 0) returning id into cell;
  insert into public.slices (service_id, kind, title)
  values (svc, 'custom', 'rls') returning id into slc;
  insert into public.slides (slice_id, position, cell_ids, cell_keys, shows_all_images)
  values (slc, 0, array[cell], array['k'], false)
  returning id into sld;

  begin
    perform set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"service"}}',
      true);
    set local role authenticated;
    begin
      insert into public.slide_images (slide_id, position, cell_id, image_url)
      values (sld, 0, cell, null);
      get diagnostics n = row_count;
    exception
      when insufficient_privilege then n := 0;
    end;
    if n is distinct from 1 then
      raise exception
        'a signed-in author could not insert a slide_images member (row_count=%)',
        n;
    end if;
    raise exception 'slide-images rls' using errcode = 'UB001';
  exception
    when sqlstate 'UB001' then null;
  end;

  delete from public.services where id = svc;
end
$rls$;

-- @core

do $rehearse$
declare
  svc uuid;
  ph uuid;
  sc uuid;
  pa uuid;
  ln uuid;
  st uuid;
  c1 uuid;
  c2 uuid;
  slc uuid;
  sld uuid;
  n integer;
  refused boolean;
begin
  insert into public.services (name) values ('slide-images-rehearsal') returning id into svc;
  insert into public.phases (service_id, name, position) values (svc, 'p', 0) returning id into ph;
  insert into public.scenarios (phase_id, name, position) values (ph, 's', 0) returning id into sc;
  insert into public.paths (scenario_id, name, kind) values (sc, 'happy', 'happy') returning id into pa;
  insert into public.lanes (path_id, name, position) values (pa, 'lane', 0) returning id into ln;
  insert into public.steps (scenario_id, name) values (sc, 'step') returning id into st;
  insert into public.path_steps (path_id, step_id, position) values (pa, st, 0);
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'one', 0) returning id into c1;
  insert into public.cells (path_id, lane_id, step_id, content, position)
  values (pa, ln, st, 'two', 1) returning id into c2;
  insert into public.slices (service_id, kind, title)
  values (svc, 'custom', 'rehearsal') returning id into slc;
  insert into public.slides (slice_id, position, cell_ids, cell_keys, shows_all_images)
  values (slc, 0, array[c1, c2], array['k1','k2'], false)
  returning id into sld;

  -- Mixed set accepted.
  insert into public.slide_images (slide_id, position, cell_id, image_url)
  values (sld, 0, c1, null),
         (sld, 1, null, 'https://example.com/a.png');

  -- Both sources refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id, image_url)
    values (sld, 2, c2, 'https://example.com/b.png');
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'both sources were accepted';
  end if;

  -- Neither refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id, image_url)
    values (sld, 3, null, null);
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'neither source was accepted';
  end if;

  -- Duplicate position refused.
  refused := false;
  begin
    insert into public.slide_images (slide_id, position, cell_id)
    values (sld, 0, c2);
  exception
    when unique_violation then refused := true;
  end;
  if not refused then
    raise exception 'duplicate position was accepted';
  end if;

  -- Deleting a cell removes only its own member.
  delete from public.cells where id = c1;
  select count(*) into n from public.slide_images where slide_id = sld;
  if n <> 1 then
    raise exception 'deleting a cell removed % members, expected 1 remaining', n;
  end if;
  if exists (select 1 from public.slide_images where slide_id = sld and cell_id = c1) then
    raise exception 'the deleted cell''s member is still there';
  end if;

  delete from public.services where id = svc;
end
$rehearse$;
