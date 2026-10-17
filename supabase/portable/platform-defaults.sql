-- The one Supabase primitive the recipe assumes but never states: the grant
-- the platform performs at project creation.
--
-- supabase-shim.sql stands in for the role NAMES and the auth/storage
-- functions the recipe fragments call. This file stands in for the other thing
-- the recipe leans on without saying so — the SELECT the `anon` and
-- `authenticated` roles hold on every table in `public`.
--
-- The recipe never grants that on the blueprint spine (`services`, `phases`,
-- `scenarios`, `paths`, `steps`, `lanes`, `cells`, …). It says so in a
-- migration comment (21000113000000): "The platform grants anon these at
-- create time on every relation created in `public`." Supabase wires it once,
-- at project init, as a default privilege, so every table a later migration
-- creates is reachable by the Data API roles without a per-table GRANT — and
-- the recipe issues only the SURGICAL grants and revokes that DEPART from that
-- baseline (evidence and business_models are revoked from anon on top of it).
--
-- ⚠️ NOT part of the portable core, and not something an adopter installs — the
-- same status as supabase-shim.sql. It is a CI harness: a stock `postgres:17`
-- has no project-init step, so the seed-load check performs the platform's
-- default grant itself, BEFORE the core creates any table, and then lets the
-- recipe's surgical revokes land on top exactly as they do on a real project.
-- That is the whole reason the ordering matters: default first, tables next,
-- recipe's departures last.
--
-- Applied by `npm run check:seed-load` only. It exists so a keyless read — the
-- `anon` key the deployed app carries — returns the seeded content, which is
-- the thing that check is there to prove. Another host expresses the same
-- baseline with its own auth; here it is one ALTER DEFAULT PRIVILEGES.

grant usage on schema public to anon, authenticated, service_role;

-- The default privileges, set before the core runs, and set the way project
-- creation sets them: ALL, not only SELECT, on every table, function and
-- sequence the migrations create in `public`, to each of the three Data API
-- roles BY NAME. Verified against a hosted project created 2026-10-17:
-- `pg_default_acl` for role `postgres` in `public` carries
-- `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm` on
-- tables and `anon=X`, `authenticated=X`, `service_role=X` on functions.
-- Without `for role` these attach to whichever role runs this file, which is
-- the role that then runs the migrations — `postgres`, as on a real project.
--
-- The SELECT is what a keyless read needs. The rest is what makes this a
-- rehearsal of a real push rather than a friendlier one: the INSERT grant
-- `authenticated` holds means a write is refused by row level security, or by
-- a BEFORE ROW trigger that meets the row first, rather than by a missing
-- grant; and the function grant to `anon` by name is one a migration's
-- `revoke … from public` does not take away, which a stock Postgres would
-- never show. Both shapes stopped a fresh hosted `supabase db push` before
-- this file stood them in (21000116000000, 21000214000000). The recipe's own
-- GRANTs and REVOKEs apply on top, so its departures still win.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
