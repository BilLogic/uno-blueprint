-- The service record joins the tier every other table already answers to.
--
-- `public.services` is the one table on the write surface a plain signed-in
-- member can UPDATE. Every other table there admits only a service account.
-- docs/guide/04-operations.md says a member outside the editing tier may read
-- and not write; of this table that was never true.
--
-- ── How the gap opened ────────────────────────────────────────────────────
--
-- Two migrations, neither wrong on its own.
--
-- 20260818002000 introduced the service-account tier and hung a RESTRICTIVE
-- `*_service_only` policy on the tables that had a write policy to restrict.
-- `services` had none yet — the spine's root was read-only, the IR builds a
-- service and nothing edited one — so it got none.
--
-- 21000128000000 then gave `services` the write policy it was missing,
-- `services_update_auth` with `using (true)`, so the Service panel could save.
-- It restored the half that was missing and did not add the half the earlier
-- migration would have. Nothing anywhere argues that the service record should
-- be the one row an ordinary member may rewrite: it is an oversight with two
-- authors, and this file is the third.
--
-- ── Shape ─────────────────────────────────────────────────────────────────
--
-- RESTRICTIVE, which is the whole of the fix. A permissive policy naming
-- `is_service_account()` would OR with `services_update_auth`'s `using (true)`
-- and change nothing at all. Restrictive policies AND, so this one narrows the
-- permissive policy it stands beside — the same shape 20260818002000 built for
-- its thirteen tables, and the same one `stakeholders` and `cell_touchpoints`
-- were given when they joined the surface later. Written out rather than
-- looped, because it is one table.
--
-- UPDATE only, and deliberately. `services` carries no INSERT or DELETE policy
-- for `authenticated` at all, so both verbs already match zero rows under row
-- level security; a restrictive policy over a write nobody is admitted to make
-- would assert nothing and read as though it did. Nothing under `src/` inserts
-- or deletes a service either — the write surface finds one verb on this table
-- — and the RPCs that do build one are SECURITY DEFINER, so they never meet a
-- policy and assert the tier in their own bodies instead.
--
-- ── A single-tier deployment is untouched ─────────────────────────────────
--
-- `public.is_service_account()` is the CORE seam (20260818001000) and its
-- default body is `select true`: every signed-in session edits, the template
-- default. Only the OPTIONAL tier recipe replaces it with a read of the JWT.
-- So on a deployment that skipped that recipe this policy admits everyone and
-- changes nothing, which is the posture that deployment chose and this file
-- must not overrule. That is also why the proof below asserts AGREEMENT with
-- the seam rather than a flat refusal: after this migration an UPDATE of
-- `services` is admitted exactly when `is_service_account()` says so,
-- whichever body that function carries.
--
-- ── Replaying against an empty database ───────────────────────────────────
--
-- Recipe-only and additive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000128000000). The
-- `drop policy if exists` makes a partial re-run idempotent. The proof stands
-- its own service row up inside a subtransaction it then aborts, so it asks
-- the same question of an empty replay as of a loaded target and leaves
-- nothing behind on either.

-- @recipe — a policy names `authenticated`, a role only the recipe creates,
-- and the tier it enforces is the recipe's too. Who may write a row is this
-- deployment's enforcement of the contract, not part of the contract; another
-- host expresses the same rule its own way.

drop policy if exists "services_update_service_only" on public.services;
create policy "services_update_service_only" on public.services
  as restrictive for update to authenticated
  using (public.is_service_account())
  with check (public.is_service_account());

-- ---------------------------------------------------------------------------
-- Proof — the post-condition, asked as the role.
--
-- An owner run cannot see this one. The migration role bypasses row level
-- security outright, and a policy that refuses does not raise — it matches
-- zero rows and returns success — so a proof that reads the catalogue, or one
-- that writes as the owner, is satisfied by the database this file exists to
-- change. So the proof BECOMES `authenticated`, holds each of the two claims
-- in turn, and attempts the write the Service panel makes.
--
-- Each attempt stands up a service row of its own and ends in a sentinel
-- exception, so the row, the claim and the role are all gone before the next
-- attempt starts and none of them survives the migration.
--
-- It asks nothing where it cannot get an answer, and names what was missing:
-- a session that cannot become `authenticated`, or an `authenticated` that
-- cannot read `public.services`, would turn the platform's absence into a
-- verdict about this policy. Both are notices, checked before anything is
-- written.
--
-- What it asserts is only what this file makes true: the answer is
-- `is_service_account()`'s, both ways. A service claim writes; a session
-- without one writes only where the seam still says `select true`. It asserts
-- nothing about how many policies exist, which would be a census of the
-- database it happened to meet.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  probe record;
  changed bigint;
  wrote jsonb := '{}'::jsonb;
  seam_admits_a_viewer boolean;
begin
  -- Two things the question needs before it can be put at all, and each says
  -- so out loud rather than being swallowed: a skipped proof is a proof that
  -- did not run, and a reader has to be able to tell that from a green one.
  --
  -- The role has to exist and be assumable.
  if to_regrole('authenticated') is null
     or not pg_has_role(current_user, 'authenticated', 'USAGE') then
    raise notice
      'services tier proof skipped: this session cannot become authenticated, '
      'so the policy could not be asked whether it refuses a viewer';
    return;
  end if;

  -- And `authenticated` has to be able to READ the row it is asked to write.
  -- An UPDATE needs SELECT on every column its assignment and its WHERE clause
  -- read, and that SELECT is the PLATFORM's, not the recipe's: Supabase grants
  -- it at project creation on every table in `public`, and no migration here
  -- states it (21000113000000 says so). So on a real project, and on the
  -- deployer's replay that stands the platform default up first, the proof
  -- runs. On a bare replay behind the shim alone there is no such grant, and a
  -- probe that ran anyway would report the platform's absence as this policy
  -- refusing a write.
  if not has_column_privilege('authenticated', 'public.services', 'name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.services', 'summary', 'SELECT') then
    raise notice
      'services tier proof skipped: authenticated cannot read public.services '
      'here, so an attempted UPDATE would be refused for want of the platform''s '
      'SELECT rather than answered by the policy';
    return;
  end if;

  for probe in
    select *
      from (values
        ('viewer', '{"role":"authenticated","app_metadata":{}}'),
        ('author', '{"role":"authenticated","app_metadata":{"role":"service"}}')
      ) as v(who, claims)
  loop
    begin
      -- A row of the proof's own. An empty `services` would match zero rows
      -- for a reason that has nothing to do with permission, and the whole
      -- failure being proved against is a zero that means something else.
      insert into public.services (name) values ('services tier proof');
      perform set_config('request.jwt.claims', probe.claims, true);
      set local role authenticated;
      if probe.who = 'viewer' then
        seam_admits_a_viewer := public.is_service_account();
      end if;
      update public.services set summary = summary
       where name = 'services tier proof';
      get diagnostics changed = row_count;
      wrote := wrote || jsonb_build_object(probe.who, changed);
      raise exception 'services tier proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught: it is how the row, the claim and the
      -- role are given back. Anything else — a grant this file assumed and the
      -- database does not have — propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;
  end loop;

  if (wrote ->> 'author')::bigint = 0 then
    raise exception
      'proof: a service account cannot UPDATE public.services; the restrictive '
      'policy refuses the very tier it names, and the Service panel would save '
      'nothing and report the service as deleted';
  end if;

  if seam_admits_a_viewer then
    -- Single-tier deployment: the seam is still `select true`, so this policy
    -- admits every signed-in session by construction. That is the template
    -- default and not a failure — but a viewer REFUSED here would mean the
    -- policy is denying a write the seam allows.
    raise notice
      'services tier proof: the optional tier recipe is not in force here, so '
      'the new policy admits every signed-in session, as this deployment chose';
    if (wrote ->> 'viewer')::bigint = 0 then
      raise exception
        'proof: a signed-in session was refused UPDATE on public.services on a '
        'database whose tier seam admits every signed-in session';
    end if;
  elsif (wrote ->> 'viewer')::bigint <> 0 then
    raise exception
      'proof: a signed-in session holding no service claim still UPDATEd '
      'public.services; the restrictive policy did not take, and a member '
      'outside the editing tier can rewrite the service record';
  end if;
end
$recipe_proof$;
