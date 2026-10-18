-- A person who talks to Uno has a profile, and only some may confirm.
--
-- Authored 2026-10-17.
--
-- Uno serves people, and it has to know who is talking: who they are in the
-- business, how they want to be spoken to, and whether what they say may
-- change the blueprint. A **profile** (CONTEXT.md) records one person:
--
--   stakeholder_id    the existing cast-list row that says who they are in
--                     the business; no new stakeholder kind
--   user_id           their login account, when one exists
--   may_confirm       whether they approve changes and make a cell
--                     owner-confirmed; separate from who they are
--   register          everyday or precise words
--   dismissed_nudges  nudges they asked not to see again
--   last_run_at       when Uno last ran with them
--
-- ── Who may confirm, and what everyone else does ─────────────────────────
--
-- A person who may not confirm still contributes. `record_contribution`
-- writes what they said as evidence on the cell, in their name, and a
-- suggested change to the cell's content that waits. `approve_suggested_change`
-- applies it, and `confirm_cell` vouches for a cell as it stands; both refuse
-- a caller whose profile does not hold may_confirm. Approving owner-confirms
-- the cell, because the person who approved it now stands behind its value.
--
-- ── Who the caller is ────────────────────────────────────────────────────
--
-- The functions read the caller from the request's JWT claims — the
-- `request.jwt.claims` setting PostgREST fills — and find the profile whose
-- user_id is the claim's `sub`. That is portable: a stock Postgres with no
-- claims has no caller, and every check that needs one refuses. An operator
-- acting for a named person sets the claim in the same transaction.
--
-- ── What a cell carries ──────────────────────────────────────────────────
--
-- `cells.confirmed_by` and `cells.confirmed_at`: who confirmed the value and
-- when, both or neither. No role is granted UPDATE on either; only the two
-- functions above write them.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references public.stakeholders (id) on delete restrict,
  user_id uuid unique,
  display_name text not null constraint profiles_display_name_check check (btrim(display_name) <> ''),
  may_confirm boolean not null default false,
  register text not null default 'everyday'
    constraint profiles_register_check check (register in ('everyday', 'precise')),
  dismissed_nudges text[] not null default '{}',
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_stakeholder_id_idx on public.profiles (stakeholder_id);

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'One person who talks to Uno: the stakeholder they are in the business, how Uno works with them, and whether they may confirm. Not a stakeholder: the stakeholder says who someone is, the profile says how Uno works with them. A person reads and edits only their own; list_profile_stakeholders shows everyone''s stakeholder link.';
comment on column public.profiles.stakeholder_id is
  'The cast-list row that says who this person is in the business.';
comment on column public.profiles.user_id is
  'The login account this person signs in with, when one exists. Linked by email by the pilot seed.';
comment on column public.profiles.display_name is
  'What Uno calls this person.';
comment on column public.profiles.may_confirm is
  'Whether this person approves changes to the blueprint and makes a cell owner-confirmed. Set by an operator, never by the person.';
comment on column public.profiles.register is
  'everyday | precise. The words Uno uses with this person.';
comment on column public.profiles.dismissed_nudges is
  'Nudges this person dismissed, so Uno does not bring them again unless something changes.';
comment on column public.profiles.last_run_at is
  'When Uno last ran with this person: where the next session reads changes from.';

alter table public.cells
  add column confirmed_by uuid references public.profiles (id) on delete set null,
  add column confirmed_at timestamptz,
  add constraint cells_confirmed_paired check ((confirmed_by is null) = (confirmed_at is null));

comment on column public.cells.confirmed_by is
  'The profile that confirmed this cell''s value: set when someone who may confirm approves a change to it or vouches for it. Null when nobody has. Owner-confirmed outranks anything Uno inferred.';
comment on column public.cells.confirmed_at is
  'When confirmed_by confirmed this cell''s value. Set with it, cleared with it.';

alter table public.evidence
  add column contributed_by uuid references public.profiles (id) on delete set null;

comment on column public.evidence.contributed_by is
  'The profile whose words this evidence records, when a person told Uno. Only that person can set it to themselves.';

create table public.suggested_changes (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.cells (id) on delete cascade,
  evidence_id uuid references public.evidence (id) on delete set null,
  proposed_content text not null,
  suggested_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending'
    constraint suggested_changes_status_check check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint suggested_changes_decision_paired check ((status = 'pending') = (decided_at is null))
);

create index suggested_changes_cell_id_idx on public.suggested_changes (cell_id);

comment on table public.suggested_changes is
  'A change to a cell''s content that someone who may not confirm suggested, waiting for someone who may. Written and decided through record_contribution and approve_suggested_change only.';
comment on column public.suggested_changes.proposed_content is
  'The cell content the suggestion would set.';
comment on column public.suggested_changes.status is
  'pending | approved | declined.';

-- ── The caller ───────────────────────────────────────────────────────────

create function public.caller_profile_id() returns uuid
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select null::uuid $$;

-- @recipe — the host supplies the authenticated account identity.
create or replace function public.caller_profile_id() returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return (select p.id
    from public.profiles p
   where p.user_id = auth.uid());
end
$$;
-- @core

comment on function public.caller_profile_id() is
  'The profile of the person making this request, identified by auth.uid(); null when the caller has none.';

-- Evidence is writable by any signed-in author, so its attribution is held
-- here: a request that carries claims may attribute evidence to its own
-- caller and nobody else. A write with no claims at all is an operator's at
-- the database, which is trusted to say whose words these are.
create function public.evidence_contributor_is_the_caller() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.contributed_by is not null
     and new.contributed_by is distinct from (case when tg_op = 'UPDATE' then old.contributed_by end)
     and new.contributed_by is distinct from public.caller_profile_id()
     and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'evidence can be attributed only to the person giving it'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger evidence_contributor_is_the_caller
  before insert or update of contributed_by on public.evidence
  for each row execute function public.evidence_contributor_is_the_caller();

create function public.list_profile_stakeholders()
returns table (profile_id uuid, stakeholder_id uuid, display_name text)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if public.caller_profile_id() is null then
    return;
  end if;
  return query
    select p.id, p.stakeholder_id, p.display_name
      from public.profiles p
     order by p.display_name;
end
$$;

comment on function public.list_profile_stakeholders() is
  'Every profile''s stakeholder link and name, for a caller who has a profile: who else in the business talks to Uno. Nothing else about another person''s profile.';

-- The confirmer: the caller's profile, refused unless it may confirm.
create function public.confirming_profile_id() returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = public.caller_profile_id();
  if v_profile.id is null or not v_profile.may_confirm then
    raise exception 'only someone who may confirm can approve a change or confirm a cell'
      using errcode = '42501';
  end if;
  return v_profile.id;
end
$$;

create function public.record_contribution(
  p_cell_id uuid,
  p_title text,
  p_note text,
  p_proposed_content text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.caller_profile_id();
  v_cell public.cells;
  v_service uuid;
  v_evidence uuid;
  v_suggestion uuid;
begin
  if v_profile is null then
    raise exception 'a contribution needs the profile of the person giving it'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'a contribution needs a title saying where it came from';
  end if;
  select * into v_cell from public.cells where id = p_cell_id;
  if v_cell.id is null then
    raise exception 'no cell %', p_cell_id;
  end if;
  select ph.service_id into v_service
    from public.paths pa
    join public.scenarios sc on sc.id = pa.scenario_id
    join public.phases ph on ph.id = sc.phase_id
   where pa.id = v_cell.path_id;

  insert into public.evidence (service_id, cell_id, cell_key, kind, title, note, contributed_by)
  values (v_service, v_cell.id, coalesce(v_cell.cell_key, v_cell.id::text), 'interview', btrim(p_title),
          nullif(btrim(coalesce(p_note, '')), ''), v_profile)
  returning id into v_evidence;

  if p_proposed_content is not null then
    insert into public.suggested_changes (cell_id, evidence_id, proposed_content, suggested_by)
    values (v_cell.id, v_evidence, p_proposed_content, v_profile)
    returning id into v_suggestion;
  end if;

  return jsonb_build_object('evidence_id', v_evidence, 'suggested_change_id', v_suggestion);
end
$$;

comment on function public.record_contribution(uuid, text, text, text) is
  'Guard: the caller must have a profile. Records evidence in that profile''s name and an optional pending suggestion; leaves the cell as it is. Returns {evidence_id, suggested_change_id}.';

create function public.approve_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
  v_change public.suggested_changes;
  v_previous public.cells;
begin
  select * into v_change from public.suggested_changes where id = p_id for update;
  if v_change.id is null then
    raise exception 'no suggested change %', p_id;
  end if;
  if v_change.status <> 'pending' then
    raise exception 'suggested change % is already %', p_id, v_change.status;
  end if;
  select * into strict v_previous from public.cells where id = v_change.cell_id for update;
  update public.cells
     set content = v_change.proposed_content,
         confirmed_by = v_profile,
         confirmed_at = now(),
         updated_at = now()
   where id = v_change.cell_id;
  update public.suggested_changes
     set status = 'approved', decided_by = v_profile, decided_at = now()
   where id = p_id;
  insert into public.authoring_changes (author, author_id, fn, args, revert)
  values ('human', (select user_id from public.profiles where id = v_profile),
    'approve_suggested_change', jsonb_build_object('p_id', p_id, 'cell_id', v_change.cell_id),
    jsonb_build_object('fn', 'update_cell_content', 'args',
      jsonb_build_object('cell_id', v_previous.id, 'update',
        jsonb_build_object('content', v_previous.content, 'summary', coalesce(v_previous.summary, ''),
          'owner', coalesce(v_previous.owner, ''), 'perceivedOwner', coalesce(v_previous.perceived_owner, ''),
          'status', v_previous.status), 'confirmed_by', v_previous.confirmed_by,
          'confirmed_at', v_previous.confirmed_at)));
  return jsonb_build_object('cell_id', v_change.cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.approve_suggested_change(uuid) is
  'Apply a pending suggested change to its cell and owner-confirm the cell in the caller''s name. Refused unless the caller''s profile may confirm.';

create function public.confirm_cell(p_cell_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
begin
  update public.cells
     set confirmed_by = v_profile, confirmed_at = now(), updated_at = now()
   where id = p_cell_id;
  if not found then
    raise exception 'no cell %', p_cell_id;
  end if;
  return jsonb_build_object('cell_id', p_cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.confirm_cell(uuid) is
  'Owner-confirm a cell as it stands, in the caller''s name. Refused unless the caller''s profile may confirm.';

create function public.decline_suggested_change(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile uuid := public.confirming_profile_id();
begin
  update public.suggested_changes
     set status = 'declined', decided_by = v_profile, decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'no pending suggested change %', p_id;
  end if;
  return jsonb_build_object('suggested_change_id', p_id, 'decided_by', v_profile);
end
$$;

comment on function public.decline_suggested_change(uuid) is
  'Guard: the caller''s profile must hold may_confirm. Declines a pending suggestion without changing its cell.';

-- @recipe — who may read and write, in Supabase's roles.
--
-- A profile is private to its person: they read their own row and change
-- only how Uno works with them. Who may confirm, and which stakeholder and
-- login a profile is, are an operator's to set. Suggested changes are read by
-- anyone in the business who has a profile, and written only through the
-- functions.
alter table public.profiles
  add constraint profiles_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete set null;

alter table public.profiles enable row level security;
alter table public.suggested_changes enable row level security;

revoke all on public.profiles, public.suggested_changes from public, anon, authenticated, service_role;
grant select on public.profiles, public.suggested_changes to authenticated;
grant update (register, dismissed_nudges, last_run_at) on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "suggested_changes_select_in_business" on public.suggested_changes
  for select to authenticated using (public.caller_profile_id() is not null);

revoke execute on function public.caller_profile_id() from public, anon;
grant execute on function public.caller_profile_id() to authenticated;
revoke execute on function public.confirming_profile_id() from public, anon, authenticated;
revoke execute on function public.list_profile_stakeholders() from public, anon;
grant execute on function public.list_profile_stakeholders() to authenticated;
revoke execute on function public.record_contribution(uuid, text, text, text) from public, anon;
grant execute on function public.record_contribution(uuid, text, text, text) to authenticated;
revoke execute on function public.approve_suggested_change(uuid) from public, anon;
grant execute on function public.approve_suggested_change(uuid) to authenticated;
revoke execute on function public.confirm_cell(uuid) from public, anon;
grant execute on function public.confirm_cell(uuid) to authenticated;
revoke execute on function public.decline_suggested_change(uuid) from public, anon;
grant execute on function public.decline_suggested_change(uuid) to authenticated;

-- A table UPDATE grant also grants UPDATE on future columns. Preserve any
-- existing cell-column grants while removing that shortcut on hosted projects.
do $column_grants$
declare
  r record;
  columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns
    from pg_attribute where attrelid = 'public.cells'::regclass and attnum > 0
      and not attisdropped and attname not in ('confirmed_by', 'confirmed_at');
  for r in select distinct x.grantee, roles.rolname
    from pg_class c cross join lateral aclexplode(c.relacl) x
    left join pg_roles roles on roles.oid = x.grantee
    where c.oid = 'public.cells'::regclass and x.privilege_type = 'UPDATE'
      and x.grantee <> c.relowner
  loop
    execute format('revoke update on public.cells from %s',
      case when r.grantee = 0 then 'public' else quote_ident(r.rolname) end);
    execute format('grant update (%s) on public.cells to %s', columns,
      case when r.grantee = 0 then 'public' else quote_ident(r.rolname) end);
  end loop;
end
$column_grants$;

-- Proof — actual ACLs, including hosted defaults. Owners and superusers have
-- implicit rights; no granted role may update the protected columns.
do $profile_proof$
declare
  reachable text;
begin
  select string_agg(p.proname, ', ') into reachable from pg_proc p
    where p.oid in (
      'public.caller_profile_id()'::regprocedure,
      'public.confirming_profile_id()'::regprocedure,
      'public.list_profile_stakeholders()'::regprocedure,
      'public.record_contribution(uuid,text,text,text)'::regprocedure,
      'public.approve_suggested_change(uuid)'::regprocedure,
      'public.confirm_cell(uuid)'::regprocedure,
      'public.decline_suggested_change(uuid)'::regprocedure)
      and has_function_privilege('anon', p.oid, 'execute');
  if reachable is not null then
    raise exception 'proof: anon can execute profile RPC(s): %', reachable;
  end if;
  if exists (
    select from pg_attribute a join pg_class c on c.oid = a.attrelid
    cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[]) || coalesce(c.relacl, '{}'::aclitem[])) x
    where (a.attrelid = 'public.profiles'::regclass and a.attname = 'may_confirm'
      or a.attrelid = 'public.cells'::regclass and a.attname in ('confirmed_by', 'confirmed_at'))
      and x.privilege_type = 'UPDATE' and x.grantee <> c.relowner
  ) then
    raise exception 'proof: a role holds UPDATE on a protected profile or cell column';
  end if;
  if exists (select from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
        is distinct from (a.attname in ('register', 'dismissed_nudges', 'last_run_at'))) then
    raise exception 'proof: authenticated can update other than the three profile preferences';
  end if;
end
$profile_proof$;
-- @core
