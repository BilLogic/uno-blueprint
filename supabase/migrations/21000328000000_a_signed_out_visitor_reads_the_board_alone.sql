-- A signed-out visitor reads the board alone.
--
-- Authored 2026-11-01.
--
-- The anon key is the deployed app's key, so whatever `anon` may select is
-- published to anyone holding the URL. Until now that included three things
-- that are not the board:
--
--   * evidence (20260818000000's `evidence_select_anon`) and the
--     `evidence_counts` view over it. An excerpt can hold interview content.
--   * the edit history, `authoring_changes` (21000215000000's
--     `authoring_changes_select`, role `public`, which includes anon), and the
--     `trash` view over it — security-invoker, so readable wherever the log is.
--   * audit findings, `audit_findings_select`, also role `public`.
--
-- `agent_sessions` and `agent_messages` carried anon grants too, inherited
-- from the platform's default privileges. Their only policy names
-- `authenticated`, so anon already read zero rows; the grants served no
-- reader and are revoked in the same spirit.
--
-- After this, `anon` is refused on all seven, and every signed-in reader keeps
-- exactly the reads it had: the two `public` policies are recreated for
-- `authenticated` with the same `using (true)`, and `evidence_select_auth` is
-- untouched. A refusal rather than an empty answer, because only a refusal is
-- something the client can gate on before it asks (`canReadPrivate`).
--
-- The board and the slices cut from it are unchanged: services, phases,
-- scenarios, paths, steps, path_steps, lanes, cells, cell_dependencies,
-- touchpoints, cell_touchpoints, resources and stakeholders, and slices,
-- slides and slide_images, stay readable signed-out. The post-conditions
-- below prove both halves.
--
-- Nothing here changes a table's shape, so the database types are unchanged.

-- @recipe — who may read what is Supabase's enforcement, roles and RLS.

drop policy if exists evidence_select_anon on public.evidence;

drop policy if exists "authoring_changes_select" on public.authoring_changes;
create policy "authoring_changes_select" on public.authoring_changes
  for select to authenticated using (true);

drop policy if exists "audit_findings_select" on public.audit_findings;
create policy "audit_findings_select" on public.audit_findings
  for select to authenticated using (true);

comment on view public.evidence_counts is
  'cell_id -> evidence row count, without content. For signed-in readers, like evidence itself: anon holds no SELECT on either.';

revoke all on
  public.evidence,
  public.evidence_counts,
  public.authoring_changes,
  public.trash,
  public.audit_findings,
  public.agent_sessions,
  public.agent_messages
from anon;

do $closed$
declare
  relation text;
  leak text;
begin
  foreach relation in array array[
    'evidence', 'evidence_counts', 'authoring_changes', 'trash',
    'audit_findings', 'agent_sessions', 'agent_messages'
  ] loop
    if has_table_privilege('anon', format('public.%I', relation), 'select') then
      raise exception 'anon can still select public.%', relation;
    end if;
    if not has_table_privilege('authenticated', format('public.%I', relation), 'select') then
      raise exception 'authenticated lost select on public.%', relation;
    end if;
  end loop;

  -- No select policy on the signed-in-only tables may name anon or public.
  select string_agg(format('%s.%s', tablename, policyname), ', ')
    into leak
  from pg_policies
  where schemaname = 'public'
    and tablename in ('evidence', 'authoring_changes', 'audit_findings',
                      'agent_sessions', 'agent_messages')
    and cmd in ('SELECT', 'ALL')
    and (roles && array['anon', 'public']::name[]);
  if leak is not null then
    raise exception 'a select policy still admits signed-out readers: %', leak;
  end if;

  foreach relation in array array[
    'services', 'phases', 'scenarios', 'paths', 'steps', 'path_steps',
    'lanes', 'cells', 'cell_dependencies', 'touchpoints', 'cell_touchpoints',
    'resources', 'stakeholders', 'slices', 'slides', 'slide_images'
  ] loop
    if not has_table_privilege('anon', format('public.%I', relation), 'select') then
      raise exception 'the board or its slices lost anon select on public.%', relation;
    end if;
  end loop;
end $closed$;
