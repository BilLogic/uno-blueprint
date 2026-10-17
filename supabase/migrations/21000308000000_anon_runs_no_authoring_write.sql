-- anon runs no authoring write: the two authoring RPCs a rename handed to
-- anon on a hosted project are taken back, and the rule is asserted over the
-- whole schema.
--
-- Authored 2026-10-17.
--
-- A hosted Supabase project carries default privileges for role `postgres`
-- in schema `public` that grant ALL on every new function to `anon`,
-- `authenticated` and `service_role` — a grant to each role by name, beside
-- Postgres's own default to PUBLIC. A migration that creates a function and
-- then says `revoke … from public` has not taken anon's grant away; only a
-- revoke that names anon does.
--
-- 20260818001000 names anon for every authoring RPC it creates, so its own
-- functions are closed. The rename series then dropped and recreated two of
-- them — `add_lane` in 21000104000000 (`at_row` → `at_position` forces a
-- drop) and `create_phase` in 21000106000000 — through the body rewriter in
-- 21000102000000, which restores the captured ACL by revoking PUBLIC and
-- re-granting what was there. On a stock Postgres that lands exactly where it
-- started. On a hosted project the recreate also lands anon's own grant, the
-- revoke from PUBLIC leaves it, and nothing afterwards asked. So on any
-- hosted deployment whose project carries those defaults, `anon` can execute
-- both. Each is SECURITY DEFINER and checks `is_service_account()` before it
-- writes, which an anon key never satisfies, so neither has been a write
-- path — but the posture this schema states is that anon calls no authoring
-- function at all, and the in-body check was the only thing holding it.
--
-- 21000116000000 rewrote four more functions the same way, and its own proof
-- stopped a fresh hosted push there; that file now revokes every grantee the
-- recreate landed on before replaying the captured ACL. The rewriter in
-- 21000102000000 was dropped by 21000109000000 and is not restated: what it
-- left behind is repaired here instead, where an existing deployment's push
-- reaches it too.
--
-- No row is read or moved, the schema version does not move, and on a
-- database where anon held neither grant — every stock Postgres, every CI
-- replay — the two revokes change nothing.

-- @recipe — `anon` is a role only the Supabase recipe creates, and which role
-- may call a function is this deployment's enforcement of the contract, not
-- the contract itself.

revoke execute on function public.add_lane(uuid, text, text, integer) from anon;
revoke execute on function public.create_phase(uuid, text, text) from anon;

-- ---------------------------------------------------------------------------
-- Proof — no authoring write is executable by `anon`.
--
-- An authoring write is a SECURITY DEFINER function in `public` that guards
-- itself with `is_service_account()`: every structural RPC, and every one a
-- fork writes the same way. Asked of the whole schema rather than of the two
-- named above, because the census that missed these two was a census of the
-- functions someone remembered to check.
--
-- Not every definer function: a deployment may supply a definer READ for the
-- anon key on purpose — the ranked `search_blueprint` this schema leaves to
-- the deployment is the expected one — and a rule that refused it would be a
-- rule about how a deployment writes its search, which this file has no
-- standing to make.
-- ---------------------------------------------------------------------------
do $anon_definer$
declare
  reachable text;
begin
  select string_agg(format('%s(%s)', p.proname,
                           pg_get_function_identity_arguments(p.oid)),
                    ', ' order by p.proname)
    into reachable
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.prosrc ~ 'is_service_account\s*\('
     and has_function_privilege('anon', p.oid, 'execute');

  if reachable is not null then
    raise exception
      'proof: anon can execute authoring write(s) in public: % — a definer '
      'function runs as its owner, so revoke execute from anon by name (a '
      'revoke from public does not take a role''s own grant away)',
      reachable;
  end if;
end
$anon_definer$;
