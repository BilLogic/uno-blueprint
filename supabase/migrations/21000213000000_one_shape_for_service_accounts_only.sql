-- Two tables spell "service accounts only" the way the other twelve do.
--
-- Fourteen tables are on the write surface — the tables the panels reach
-- directly, under the caller's own privileges, rather than through the
-- definer RPCs (scripts/panel-write-surface.mjs holds the list). Twelve of
-- them express "only the editing tier may write this" as a PAIR: a permissive
-- `<table>_<verb>_auth` with `using (true)`, and a RESTRICTIVE
-- `<table>_<verb>_service_only` whose predicate is `public.is_service_account()`.
-- `stakeholders` and `cell_touchpoints`, until this file, expressed it as a
-- SINGLE PERMISSIVE policy whose whole predicate was that same call.
--
-- ── This is not a security fix ────────────────────────────────────────────
--
-- Both shapes admit exactly a service account and refuse exactly everyone
-- else. There is no hole here and this file closes none. Read as a patch it
-- would say the opposite of what is true, so: the posture before this
-- migration and the posture after it are the same posture, on every database
-- it will ever be replayed against. What changes is that one rule stops being
-- written two ways.
--
-- ── How the second shape arrived ──────────────────────────────────────────
--
-- 20260818002000, the optional service-account tier, hung the restrictive
-- half on the thirteen tables that already had a permissive write policy for
-- it to narrow. `stakeholders` (21000125000000) and `cell_touchpoints`
-- (21000113000000) joined the surface afterwards. Each was written from
-- scratch rather than by amending an existing permissive policy, so each
-- reached for the shortest thing that was correct: one policy, one call. Both
-- authors were right about the rule and neither had anywhere to read the
-- shape, because nothing stated it. That is the defect — not the SQL, the
-- absence of a written convention. So the other half of this change is a
-- paragraph in docs/connectors/supabase/database.md § Row Level Security
-- saying which shape a write policy takes, which is the half that stops the
-- next table from arriving with a third one.
--
-- ── Why the pair wins ─────────────────────────────────────────────────────
--
-- The two shapes are equally correct, so this is a decision about which is
-- clearer rather than which is right. Three things decide it.
--
-- It is the majority and the established one. A reader meets the pair twelve
-- times before meeting the exception, 20260818002000 built it, and
-- 21000212000000 followed it for `services`. Collapsing the other way would
-- rewrite twelve tables to accommodate two.
--
-- It keeps two decisions apart that have two different owners. The permissive
-- half is the base template's: this table is edited from the browser rather
-- than through an RPC. The restrictive half is the OPTIONAL tier recipe's:
-- and only by the editing tier. Under the single-policy shape a base-template
-- migration names a function whose whole purpose belongs to a recipe the
-- deployer is invited to delete, and is correct only because the core seam's
-- default body happens to be `select true`. That is a coupling nothing at the
-- call site shows.
--
-- And it makes the absence of a restriction legible. `services` carried a
-- permissive `using (true)` and no restrictive partner until 21000212000000,
-- one release ago. A surface table with an `_auth` policy and no
-- `_service_only` beside it is a hole — but that reading is only sound once
-- every table on the surface is expected to carry the pair, because until now
-- a lone permissive policy might equally have been the other legitimate
-- shape. The single-policy form is the one that most resembles the defect,
-- which is what cost the time.
--
-- ── A single-tier deployment is untouched ─────────────────────────────────
--
-- `public.is_service_account()` is the CORE seam (20260818001000) and its
-- default body is `select true`: every signed-in session edits, the template
-- default. Only the optional tier recipe replaces it with a read of the JWT.
-- So where that recipe was skipped these policies admit everyone, exactly as
-- the single policies they replace did, and that is the posture the
-- deployment chose. The proof below therefore asserts AGREEMENT with the seam
-- rather than a flat refusal: after this file a write to either table is
-- admitted exactly when `is_service_account()` says so, whichever body that
-- function carries.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Recipe-only and additive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000128000000 and
-- 21000212000000). A policy's permissiveness cannot be altered in place, so
-- each is dropped and recreated, and the `drop policy if exists` makes a
-- partial re-run idempotent. The order the statements are written in is the
-- one that never widens: see the note above each table.
--
-- The proof stands its own rows up inside subtransactions it then aborts. It
-- can only do so for `cell_touchpoints` where a cell exists to hang one on,
-- so on an empty replay that half says out loud that it was skipped. The
-- populated case is covered where it belongs: `npm run check:seed-load`
-- attempts every one of these writes as an author and again as a viewer,
-- against a seeded database, and never reads `pg_policies`.

-- @recipe — a policy names `authenticated`, a role only the recipe creates,
-- and the tier it enforces is the recipe's too. Who may write a row is this
-- deployment's enforcement of the contract, not part of the contract; another
-- host expresses the same rule its own way.

-- ---------------------------------------------------------------------------
-- stakeholders — the cast. The panel inserts it, updates it and deletes it.
--
-- Order matters, and it is: old spelling out, restrictive half in, permissive
-- half last. A policy's permissiveness cannot be altered in place, so each has
-- to be dropped and recreated, and the order decides what the table looks like
-- in between. This one leaves it CLOSED — with no permissive write policy
-- standing, nothing matches for anyone — and the permissive half arrives last,
-- re-opening it to a tier the restrictive half is already there to enforce.
-- The reverse order would open it to every signed-in session for the width of
-- two statements.
-- ---------------------------------------------------------------------------

drop policy if exists "stakeholders_insert_service_only" on public.stakeholders;
drop policy if exists "stakeholders_update_service_only" on public.stakeholders;
drop policy if exists "stakeholders_delete_service_only" on public.stakeholders;

create policy "stakeholders_insert_service_only" on public.stakeholders
  as restrictive for insert to authenticated
  with check (public.is_service_account());
create policy "stakeholders_update_service_only" on public.stakeholders
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy "stakeholders_delete_service_only" on public.stakeholders
  as restrictive for delete to authenticated
  using (public.is_service_account());

drop policy if exists "stakeholders_insert_auth" on public.stakeholders;
create policy "stakeholders_insert_auth" on public.stakeholders
  for insert to authenticated with check (true);
drop policy if exists "stakeholders_update_auth" on public.stakeholders;
create policy "stakeholders_update_auth" on public.stakeholders
  for update to authenticated using (true) with check (true);
drop policy if exists "stakeholders_delete_auth" on public.stakeholders;
create policy "stakeholders_delete_auth" on public.stakeholders
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- cell_touchpoints — the cell's placement rows. The panel updates them; the
-- structural RPCs place and remove them, and those are SECURITY DEFINER, so
-- they never meet a policy and assert the tier in their own bodies. All three
-- verbs are rewritten all the same: they are one rule, and leaving any of them
-- in the old spelling would leave this table an exception on the axis that
-- matters.
--
-- Order matters, and it is: old spelling out, restrictive half in, permissive
-- half last. A policy's permissiveness cannot be altered in place, so each has
-- to be dropped and recreated, and the order decides what the table looks like
-- in between. This one leaves it CLOSED — with no permissive write policy
-- standing, nothing matches for anyone — and the permissive half arrives last,
-- re-opening it to a tier the restrictive half is already there to enforce.
-- The reverse order would open it to every signed-in session for the width of
-- two statements.
-- ---------------------------------------------------------------------------

drop policy if exists "cell_touchpoints_insert_service_only" on public.cell_touchpoints;
drop policy if exists "cell_touchpoints_update_service_only" on public.cell_touchpoints;
drop policy if exists "cell_touchpoints_delete_service_only" on public.cell_touchpoints;

create policy "cell_touchpoints_insert_service_only" on public.cell_touchpoints
  as restrictive for insert to authenticated
  with check (public.is_service_account());
create policy "cell_touchpoints_update_service_only" on public.cell_touchpoints
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());
create policy "cell_touchpoints_delete_service_only" on public.cell_touchpoints
  as restrictive for delete to authenticated
  using (public.is_service_account());

drop policy if exists "cell_touchpoints_insert_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_insert_auth" on public.cell_touchpoints
  for insert to authenticated with check (true);
drop policy if exists "cell_touchpoints_update_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_update_auth" on public.cell_touchpoints
  for update to authenticated using (true) with check (true);
drop policy if exists "cell_touchpoints_delete_auth" on public.cell_touchpoints;
create policy "cell_touchpoints_delete_auth" on public.cell_touchpoints
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Proof — the post-condition, asked as the role.
--
-- An owner run cannot see this one. The migration role bypasses row level
-- security outright, and a policy that refuses does not raise — it matches
-- zero rows and returns success — so a proof that reads the catalogue, or one
-- that writes as the owner, is satisfied by any database at all. So the proof
-- BECOMES `authenticated`, holds each of the two claims in turn, and attempts
-- the writes the panels make.
--
-- It asserts only what this file makes true, and that is a statement about
-- posture, not about policies: a service account writes both tables; a
-- session without a service claim writes only where the seam still says
-- `select true`. It counts nothing in `pg_policies` — a census of the
-- database it happened to meet is not a post-condition (ADR 0009), and it is
-- also precisely the reading that could not tell these two shapes apart.
--
-- Each attempt stands its own row up and ends in a sentinel exception, so the
-- row, the claim and the role are all gone before the next attempt starts and
-- none of them survives the migration.
--
-- It asks nothing where it cannot get an answer, and says so out loud each
-- time: a session that cannot become `authenticated`, an `authenticated` that
-- cannot read the table, or a `cell_touchpoints` with no cell to hang a
-- fixture row on would each turn an absence into a verdict about these
-- policies. A skipped proof is a proof that did not run, and a reader has to
-- be able to tell that from a green one.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  probe record;
  changed bigint;
  wrote jsonb := '{}'::jsonb;
  skipped text[] := '{}';
  seam_admits_a_viewer boolean;
  key text;
begin
  -- Three things the question needs before it can be put at all, and each
  -- says so out loud rather than being swallowed.
  --
  -- The role has to exist and be assumable.
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice
      'one-shape proof skipped: this session cannot become authenticated, so '
      'the policies could not be asked whether they answer to the seam';
    return;
  end if;

  -- And `authenticated` has to hold every privilege the attempted writes
  -- need. A write needs SELECT on the columns its WHERE and its assignment
  -- read; a refused INSERT and a missing INSERT grant are the same 42501.
  -- Both tables get these grants from this recipe rather than from the
  -- platform, so they are present even on a bare replay behind the shim — but
  -- a proof that assumed them would report a future revoke as these policies
  -- refusing a write.
  if not has_column_privilege('authenticated', 'public.stakeholders', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.stakeholders', 'summary', 'SELECT')
     or not has_column_privilege('authenticated', 'public.stakeholders', 'summary', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.stakeholders', 'INSERT')
     or not has_table_privilege('authenticated', 'public.stakeholders', 'DELETE')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'summary', 'SELECT')
     or not has_column_privilege('authenticated', 'public.cell_touchpoints', 'summary', 'UPDATE') then
    raise notice
      'one-shape proof skipped: authenticated does not hold the grants these '
      'writes need here, so an attempt would be refused for want of a grant '
      'rather than answered by the policy';
    return;
  end if;

  -- And `cell_touchpoints.cell_id` is NOT NULL, so its fixture row needs a
  -- cell to hang on. An empty replay has none; a seeded target does.
  if not exists (select 1 from public.cells) then
    skipped := array_append(skipped, 'cell_touchpoints');
    raise notice
      'one-shape proof: public.cells is empty, so no cell_touchpoints fixture '
      'could be stood up and that table was not asked here; check:seed-load '
      'asks it, as both people, against a seeded database';
  end if;

  for probe in
    select *
      from (values
        ('viewer', '{"role":"authenticated","app_metadata":{}}'),
        ('author', '{"role":"authenticated","app_metadata":{"role":"service"}}')
      ) as who(persona, claims)
     cross join (values
        ('stakeholders', 'update'),
        ('stakeholders', 'insert'),
        ('stakeholders', 'delete'),
        ('cell_touchpoints', 'update')
      ) as what(tbl, verb)
  loop
    continue when probe.tbl = any (skipped);
    key := probe.persona || ' ' || probe.verb || ' ' || probe.tbl;
    begin
      -- Rows of the proof's own, so a zero means permission and nothing else.
      -- An empty table matches zero rows for a reason that has nothing to do
      -- with row level security, and a zero that means something else is the
      -- whole failure being proved against.
      insert into public.stakeholders (name, kind)
      values ('one-shape proof', 'team');
      if probe.tbl = 'cell_touchpoints' then
        insert into public.cell_touchpoints (cell_id, name, position, origin)
        select id, 'one-shape proof', 2147483647, 'app'
          from public.cells order by id limit 1;
      end if;

      perform set_config('request.jwt.claims', probe.claims, true);
      set local role authenticated;
      if probe.persona = 'viewer' then
        seam_admits_a_viewer := public.is_service_account();
      end if;

      if probe.verb = 'insert' then
        -- An INSERT the policy refuses RAISES 42501; an UPDATE or a DELETE it
        -- refuses matches zero rows and returns success. Same verdict, two
        -- shapes of answer, so the raise is turned back into the count the
        -- other two give — which is safe here only because the gate above has
        -- already established that the grant is not what raised it.
        begin
          insert into public.stakeholders (name, kind)
          values ('one-shape proof, again', 'team');
          get diagnostics changed = row_count;
        exception
          when insufficient_privilege then changed := 0;
        end;
      elsif probe.verb = 'delete' then
        delete from public.stakeholders where name = 'one-shape proof';
        get diagnostics changed = row_count;
      elsif probe.tbl = 'stakeholders' then
        update public.stakeholders set summary = summary
         where name = 'one-shape proof';
        get diagnostics changed = row_count;
      else
        update public.cell_touchpoints set summary = summary
         where name = 'one-shape proof';
        get diagnostics changed = row_count;
      end if;
      wrote := wrote || jsonb_build_object(key, changed);

      raise exception 'one-shape proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught out here: it is how the rows, the claim
      -- and the role are given back. Anything else — a grant this file assumed
      -- and the database does not have — propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;
  end loop;

  if wrote = '{}'::jsonb then
    raise exception
      'proof: no write was attempted at all, so nothing above was asked';
  end if;

  if seam_admits_a_viewer then
    -- Single-tier deployment: the seam is still `select true`, so these
    -- policies admit every signed-in session by construction. That is the
    -- template default and not a failure — but a viewer REFUSED here would
    -- mean a policy denying a write the seam allows.
    raise notice
      'one-shape proof: the optional tier recipe is not in force here, so '
      'these policies admit every signed-in session, as this deployment chose';
  end if;

  for key in select jsonb_object_keys(wrote) loop
    if key like 'author %' and (wrote ->> key)::bigint = 0 then
      raise exception
        'proof: a service account could not % — after this file the pair on '
        'that table has to admit the editing tier, and one of its halves does '
        'not; the panel would save nothing and report the row as deleted',
        substr(key, 8);
    end if;
    if key like 'viewer %' then
      if seam_admits_a_viewer and (wrote ->> key)::bigint = 0 then
        raise exception
          'proof: a signed-in session was refused % on a database whose tier '
          'seam admits every signed-in session', substr(key, 8);
      end if;
      if not seam_admits_a_viewer and (wrote ->> key)::bigint <> 0 then
        raise exception
          'proof: a signed-in session holding no service claim still did % — '
          'the restrictive policy did not take, and a member outside the '
          'editing tier can rewrite the cast or the board', substr(key, 8);
      end if;
    end if;
  end loop;
end
$recipe_proof$;
