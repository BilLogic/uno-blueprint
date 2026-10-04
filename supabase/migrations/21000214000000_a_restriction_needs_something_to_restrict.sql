-- Twenty restrictive policies stood over verbs no permissive policy opens.
--
-- Under row level security a RESTRICTIVE policy narrows and never admits. A
-- verb with a restrictive policy and no permissive policy therefore matches
-- zero rows for everyone the restriction names — the restriction is standing
-- over a door that was never cut into the wall. Twenty of the forty-six
-- restrictive policies in `public` were in that position. This file removes
-- them and lets the absence of a policy say what it already said.
--
-- ── This is not a security fix ───────────────────────────────────────────
--
-- Nothing that was refused becomes permitted here, and nothing that was
-- permitted was ever in doubt. Read as a patch this file would say the
-- opposite of what is true, so: the posture before it and the posture after
-- it are the same posture, on every database it will ever be replayed
-- against. What changes is that a reader counting policies stops being told
-- a verb is governed when it is simply closed.
--
-- ── What was measured, and where the brief was short ─────────────────────
--
-- Read off a full local replay of the series, `pg_policies` joined to itself:
-- every restrictive policy in `public`, and whether a permissive policy for
-- the same command names any role in common with it.
--
--   audit_findings      delete
--   business_models     delete
--   cell_dependencies   insert · update · delete
--   cells               insert · delete
--   lanes               insert · delete
--   path_steps          insert · update · delete
--   paths               insert · delete
--   phases              insert · delete
--   scenarios           insert · delete
--   steps               insert · delete
--
-- Eleven tables and twenty verbs, not the six tables the ticket named.
-- The six — `cells`, `lanes`, `paths`, `phases`, `scenarios`, `steps` — are
-- the family a reader notices, because each has a permissive UPDATE beside
-- the missing halves and so reads as a table that is half-governed. The other
-- five are the same defect and quieter: `cell_dependencies` and `path_steps`
-- carry no permissive write policy at all, and `audit_findings` and
-- `business_models` are missing only their DELETE. A count of six would have
-- left the schema with five exceptions to the rule this file states.
--
-- ── One loop, and it is the whole cause ──────────────────────────────────
--
-- 20260818002000, the optional service-account tier, loops over thirteen
-- tables and creates all three write policies on each, unconditionally. Its
-- comment says it plainly — "they AND with the permissive policies" — and for
-- nineteen of the thirty-nine there was a permissive policy to AND with. For
-- the other twenty there was not, and there still is not. The loop was
-- written table-wide over a surface that is verb-wide. That is the defect,
-- and it is a defect of expression: no database was ever more open or more
-- closed than its author intended.
--
-- ── Every one of the twenty is RPC-only, and checked as such ─────────────
--
-- The question is not whether the app COULD reach these verbs but whether it
-- does, and the answer was taken from the writers rather than assumed.
-- `scripts/direct-table-writes.mjs` walks `src/` for direct table writes and
-- reports the verbs it finds: `cells`, `lanes`, `paths`, `phases`,
-- `scenarios` and `steps` are UPDATE and nothing else; `audit_findings` is
-- INSERT and UPDATE; `business_models` is UPDATE; `cell_dependencies` and
-- `path_steps` are not written by the app at all. Not one of the twenty
-- verbs above appears.
--
-- What builds and destroys structure instead are the authoring RPCs of
-- 20260818001000 — `upsert_cell`, `delete_cell`, `add_lane`, `remove_lane`,
-- `create_path`, `create_scenario`, `set_cell_dependency`, `set_path_steps`
-- and their siblings. Every one of them is SECURITY DEFINER, and no table
-- here sets FORCE ROW LEVEL SECURITY, so each runs as the function owner and
-- never meets a policy at all; the tier is asserted inside those bodies. A
-- function that were NOT definer would be governed by these policies and the
-- answer for its table would be different — so this was read from
-- `pg_proc.prosecdef` on the replay rather than taken on trust.
--
-- And the grants agree, which is the second and independent reason nothing
-- moves here. `authenticated` holds no privilege at all for any of the
-- twenty: no DELETE on any of the eleven tables, and INSERT only on
-- `audit_findings` and `business_models`, whose INSERT is a full pair and is
-- not touched. Attempted as the role, each of the twenty is refused with
-- 42501 before row level security is consulted. The restrictive policies were
-- inert twice over.
--
-- So all twenty are the ticket's first case — genuinely RPC-only, and the
-- policy is noise. None is the second case. Giving any of them a permissive
-- half would OPEN a direct structural write that
-- docs/connectors/supabase/database.md § Row Level Security rules out in its
-- first bullet: structure goes through RPCs, not tables.
--
-- 21000212000000 reached the same conclusion for `services` and wrote it
-- down: a restrictive policy over a write nobody is admitted to make "would
-- assert nothing and read as though it did", so it gave that table UPDATE
-- only. This file is that decision applied backwards to the ones that already
-- existed.
--
-- ── Which makes the pair convention readable in both directions ──────────
--
-- 21000213000000 settled that a write policy is a PAIR — permissive
-- `<table>_<verb>_auth` for *the panels reach this table directly*, restrictive
-- `<table>_<verb>_service_only` for *and only the editing tier may* — and the
-- reading that earns it: an `_auth` policy with no `_service_only` beside it
-- is a hole. That reading survives a lone permissive policy. It does not
-- survive twenty lone restrictive ones, because a rule of the form "these
-- come in pairs" is worth what its exceptions cost, and eleven tables of
-- exceptions cost all of it. After this file the two halves appear together
-- or not at all, and each absence means one thing: no policy for a verb is
-- the direct write path being closed.
--
-- ── Order, and why there is nothing to sequence ──────────────────────────
--
-- 21000213000000 had to write drop-old · restrictive · permissive so a table
-- was never briefly open. Here there is no such window: only restrictive
-- policies are dropped, dropping a restriction that stands alone leaves the
-- verb closed by RLS's deny-by-default, and no permissive policy is created
-- anywhere in this file. A table is closed for these verbs before the first
-- statement, between every pair of statements, and after the last.
--
-- ── Replaying against an empty database ──────────────────────────────────
--
-- Recipe-only and subtractive: no table, no column, no row, and the schema
-- version does not move (the same stance as 21000212000000 and
-- 21000213000000). `drop policy if exists` makes a partial re-run idempotent
-- and makes the file replay onto a database where the optional tier recipe
-- was deleted and these policies never existed.

-- @recipe — every policy named here names `authenticated`, a role only the
-- recipe creates, and each was created by the optional tier recipe. Who may
-- write a row is this deployment's enforcement of the contract, not part of
-- the contract; another host expresses the same rule its own way.

-- ---------------------------------------------------------------------------
-- The six tables whose UPDATE is a pair and whose INSERT and DELETE are the
-- RPCs'. Each is edited from a panel — a step's summary, a lane's owner, a
-- cell's content — and each is created and destroyed only by a definer RPC.
-- The permissive `<table>_update_auth` and its restrictive partner stay
-- exactly as they are; it is the two verbs with no partner that go.
-- ---------------------------------------------------------------------------

drop policy if exists "cells_insert_service_only" on public.cells;
drop policy if exists "cells_delete_service_only" on public.cells;

drop policy if exists "lanes_insert_service_only" on public.lanes;
drop policy if exists "lanes_delete_service_only" on public.lanes;

drop policy if exists "paths_insert_service_only" on public.paths;
drop policy if exists "paths_delete_service_only" on public.paths;

drop policy if exists "phases_insert_service_only" on public.phases;
drop policy if exists "phases_delete_service_only" on public.phases;

drop policy if exists "scenarios_insert_service_only" on public.scenarios;
drop policy if exists "scenarios_delete_service_only" on public.scenarios;

drop policy if exists "steps_insert_service_only" on public.steps;
drop policy if exists "steps_delete_service_only" on public.steps;

-- ---------------------------------------------------------------------------
-- The two tables the app never writes directly at all. `cell_dependencies` is
-- reached through `set_cell_dependency` / `clear_cell_dependency` and
-- `path_steps` through `set_path_steps` / `add_step` / `remove_step` /
-- `reorder_steps` — an edge and an ordering are shapes, and a half-written
-- shape is the thing those RPCs exist to make impossible. All three verbs go
-- on each: neither table has a permissive write policy of any kind, so all six
-- restrictions stood alone.
-- ---------------------------------------------------------------------------

drop policy if exists "cell_dependencies_insert_service_only" on public.cell_dependencies;
drop policy if exists "cell_dependencies_update_service_only" on public.cell_dependencies;
drop policy if exists "cell_dependencies_delete_service_only" on public.cell_dependencies;

drop policy if exists "path_steps_insert_service_only" on public.path_steps;
drop policy if exists "path_steps_update_service_only" on public.path_steps;
drop policy if exists "path_steps_delete_service_only" on public.path_steps;

-- ---------------------------------------------------------------------------
-- The two derived-layer tables missing only their DELETE. Both are inserted
-- and updated from the app under full pairs, which stay: a finding is raised
-- by a run and closed by moving its `status`, and a business model is one row
-- per service that panels rewrite. Neither is deleted by anything — not by a
-- panel, not by an RPC — so the DELETE restriction had nothing to narrow.
-- ---------------------------------------------------------------------------

drop policy if exists "audit_findings_delete_service_only" on public.audit_findings;

drop policy if exists "business_models_delete_service_only" on public.business_models;

-- ---------------------------------------------------------------------------
-- Proof — what this file makes true, and that it took nothing away.
--
-- Three claims, and they are deliberately different in kind.
--
-- FIRST, the post-condition: no restrictive policy in `public` stands for a
-- command with no permissive policy for that command admitting a role it
-- names. That is an invariant over whatever the catalogue holds, not a count
-- of what this file did — "twenty were dropped" is a census of the database
-- it happened to meet (ADR 0009), and it is also the reading that
-- cannot tell a closed door from a governed one, which is the confusion being
-- removed. It is asked of the whole schema rather than of the tables named
-- above, a fork's own included: a lone restriction is the same silent closed
-- door wherever it stands, and a rule that exempted the reader's own tables
-- would be the rule that let these twenty arrive.
--
-- SECOND, the safety claim, which is the one a reviewer will want: for each
-- verb whose restriction is removed above, NO permissive policy stands for
-- that verb. That is what makes the removal a no-op rather than a widening.
-- On a deployment that has opened one of these verbs, the restriction was
-- doing real work and this file would have taken it away — so that case
-- raises, names the table and the verb, and points at the pair.
--
-- THIRD, the same question asked as the role, because a claim about a policy
-- is not a claim about a write. The proof becomes `authenticated` holding a
-- service claim — the most privileged session that is not the owner — and
-- attempts each of the twenty. An INSERT settles itself: refused, whether
-- by a missing grant or by row level security, it raises 42501, and RLS's
-- WITH CHECK is evaluated before NOT NULL, so a `default values` insert that
-- comes back with anything else is an insert something admitted. An UPDATE or
-- a DELETE cannot settle itself and does not pretend to — a policy that
-- refuses one of those matches zero rows and returns success, which is the
-- silence this repository keeps paying for — so those attempts report the
-- grant and leave the verdict to the second claim, out loud.
--
-- Every attempt is `where false` or a bare `default values`, so no row of any
-- deployment's is read or written even where a grant exists, and each runs
-- inside a subtransaction that ends in a sentinel exception, so the claim and
-- the role are gone before the next one starts.
--
-- And it asks nothing where it cannot get an answer, saying so each time: a
-- session that cannot become `authenticated` would turn the platform's
-- absence into a verdict about these policies. A skipped proof is a proof
-- that did not run, and a reader has to be able to tell that from a green one.
-- ---------------------------------------------------------------------------
do $recipe_proof$
declare
  removed record;
  orphan record;
  attempted integer := 0;
  granted boolean;
begin
  -- FIRST — the post-condition, over the whole schema this template owns.
  for orphan in
    select r.tablename, r.cmd, r.policyname
      from pg_policies r
     where r.schemaname = 'public'
       and r.permissive = 'RESTRICTIVE'
       and not exists (
             select 1
               from pg_policies p
              where p.schemaname = r.schemaname
                and p.tablename = r.tablename
                and p.permissive = 'PERMISSIVE'
                and (p.cmd = r.cmd or p.cmd = 'ALL' or r.cmd = 'ALL')
                and (p.roles && r.roles
                     or 'public' = any (p.roles)
                     or 'public' = any (r.roles)))
     order by r.tablename, r.cmd
  loop
    raise exception
      'proof: % restricts % on public.% and no permissive policy opens that '
      'verb to anyone it names — the restriction stands over a write nobody '
      'may make, which is the shape this file exists to remove',
      orphan.policyname, orphan.cmd, orphan.tablename;
  end loop;

  for removed in
    select *
      from (values
        ('audit_findings', 'delete'),
        ('business_models', 'delete'),
        ('cell_dependencies', 'insert'),
        ('cell_dependencies', 'update'),
        ('cell_dependencies', 'delete'),
        ('cells', 'insert'),
        ('cells', 'delete'),
        ('lanes', 'insert'),
        ('lanes', 'delete'),
        ('path_steps', 'insert'),
        ('path_steps', 'update'),
        ('path_steps', 'delete'),
        ('paths', 'insert'),
        ('paths', 'delete'),
        ('phases', 'insert'),
        ('phases', 'delete'),
        ('scenarios', 'insert'),
        ('scenarios', 'delete'),
        ('steps', 'insert'),
        ('steps', 'delete')
      ) as it(tbl, verb)
     order by 1, 2
  loop
    -- The drop list above and this list have to be the same list. An entry
    -- here whose policy is still standing means one of them was edited and
    -- the other was not, and the half that was missed is the half nobody
    -- would notice.
    if exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename = removed.tbl
            and policyname = removed.tbl || '_' || removed.verb || '_service_only')
    then
      raise exception
        'proof: %_%_service_only is still standing — the statements above and '
        'the list here have drifted apart',
        removed.tbl, removed.verb;
    end if;

    -- SECOND — and this is the claim that makes the removal a no-op.
    if exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename = removed.tbl
            and permissive = 'PERMISSIVE'
            and (cmd = upper(removed.verb) or cmd = 'ALL'))
    then
      raise exception
        'proof: a permissive policy opens % on public.% here, so the '
        'restrictive half removed above was narrowing a real write and this '
        'file has just widened it — this deployment reaches that verb '
        'directly, and it needs BOTH halves of the pair: a permissive '
        '%_%_auth and a restrictive %_%_service_only beside it',
        upper(removed.verb), removed.tbl,
        removed.tbl, removed.verb, removed.tbl, removed.verb;
    end if;

    -- THIRD — the same question, asked as the role rather than of the
    -- catalogue. Skipped as a whole, out loud, where the role cannot be
    -- assumed at all.
    if to_regrole('authenticated') is null
       or not pg_has_role(current_user, 'authenticated', 'USAGE') then
      continue;
    end if;

    granted := has_table_privilege(
      'authenticated', 'public.' || quote_ident(removed.tbl), upper(removed.verb));

    begin
      perform set_config(
        'request.jwt.claims',
        '{"role":"authenticated","app_metadata":{"role":"service"}}',
        true);
      set local role authenticated;
      begin
        if removed.verb = 'insert' then
          execute format('insert into public.%I default values', removed.tbl);
          raise exception
            'proof: an INSERT into public.% was ADMITTED for a signed-in '
            'session — something opens that verb and the restriction removed '
            'above was load-bearing', removed.tbl;
        elsif removed.verb = 'delete' then
          execute format('delete from public.%I where false', removed.tbl);
        else
          -- `updated_at` because the only two tables with an UPDATE entry
          -- here, `cell_dependencies` and `path_steps`, both carry it, and a
          -- column the assignment names is a column the privilege check has
          -- to reach before `where false` empties the plan.
          execute format(
            'update public.%I set updated_at = updated_at where false',
            removed.tbl);
        end if;
      exception
        when insufficient_privilege then
          -- Refused. Which of the two refused it is in the message, and both
          -- are the answer this file needs.
          null;
      end;
      attempted := attempted + 1;
      raise exception 'restriction proof' using errcode = 'UB001';
    exception
      -- Ours, and the only one caught here: it is how the claim and the role
      -- are given back. Anything else — including the two raises above —
      -- propagates and fails the migration.
      when sqlstate 'UB001' then null;
    end;

    if granted and removed.verb <> 'insert' then
      raise notice
        'restriction proof: authenticated holds % on public.% here, so the '
        'attempt could not distinguish a refusal from an empty match — a '
        'refused UPDATE or DELETE matches zero rows and returns success. '
        'What settles it for this verb is the check above: no permissive '
        'policy admits it',
        upper(removed.verb), removed.tbl;
    end if;
  end loop;

  if attempted = 0 then
    raise notice
      'restriction proof: this session cannot become authenticated, so no '
      'write was attempted as the role and only the two catalogue claims '
      'above were asked here; npm run check:seed-load asks the write surface '
      'as both people, against a seeded database';
  end if;
end
$recipe_proof$;
