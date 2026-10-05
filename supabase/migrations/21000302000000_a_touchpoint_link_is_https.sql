-- A touchpoint's link is https, and its icon an address it can draw, before
-- either is stored.
--
-- Authored 2026-10-05.
--
-- `update_touchpoint` (`21000301000000`) stored whatever text arrived in
-- `url` and `icon_url`. A `javascript:` link, a `data:` image, an `http:`
-- address, a relative path or a sentence that is not a link at all all went
-- into the registry, and the panel draws the one as a link and the other as
-- an image source. A resource link has met a stricter bar on the way in for
-- some time — https only, refused with a reason — and a touchpoint's link
-- now meets the same one; its icon meets a near relative of it.
--
-- The dialog refuses first, with its own validator's sentence, so a person
-- sees why Save is dark. This is the other half, for the same reason
-- resources have one: the map skill, the agent and a seed reach the function
-- without passing the dialog.
--
-- ── The rule ───────────────────────────────────────────────────────────────
--
-- A link is an absolute https address: the scheme, then a host, then
-- anything without whitespace. The client upgrades a bare `figma.com/…` to
-- https before it posts, because typing the scheme is not something anyone
-- should have to remember; the function does not, because a caller that
-- skipped the dialog can spell the scheme itself, and guessing at what an
-- agent meant is how a link ends up pointing somewhere nobody chose. So an
-- agent or map-skill write sends the scheme: a bare host is refused here.
--
-- An icon is empty, which is how it is cleared, or one of three shapes, each
-- owed to where an icon comes from. An https address, which is what an upload
-- yields on a hosted project. A path on this site — `/…`, never `//…` or
-- `/\…`, which a browser reads as another host — which is how a deployment
-- seeds its logos, and which the renderer resolves under the base path. And
-- http on a loopback host (`localhost`, `127.0.0.1`, `[::1]`, any port),
-- because an upload's public URL is http on the local stack, and refusing it
-- would refuse every icon uploaded in development. http on any other host,
-- `javascript:`, `data:`, a protocol-relative or a bare-host address is
-- refused. The dialog's `validateIconUrl` holds the same rule.
--
-- ── Only a value that changes is checked ──────────────────────────────────
--
-- Existing rows are not rewritten, and they must stay editable. A deployment
-- seeds its logos as paths on its own site, and an entry imported before this
-- may carry an http link; if the rule held every argument, a save of such an
-- entry's summary would be refused for a link nobody touched. So a value that
-- matches what the row already holds passes as it stands, and the no-op path
-- — a save matching the row returns `changed: false` and writes nothing — is
-- unchanged. Rendering keeps its own guard for whatever was stored before.
--
-- A seeded logo path is an icon the rule takes, so undoing its replacement
-- puts it back. The cost that remains is the link's: an undo that puts back a
-- pre-existing `http:` or other non-https URL after it was replaced is a new
-- value to this function, and is refused with the same sentence. That is the
-- rule doing its job on a value it never chose.
--
-- ── Why the sentences read the way they do ────────────────────────────────
--
-- They are for the writes that never pass the dialog — the agent, the map
-- skill, a seed — and for a dialog whose own check was somehow bypassed; a
-- person in the dialog sees its validator's sentence first. The client passes
-- a raised message through only when it reads as a sentence — capitalised, no
-- identifier punctuation, nothing shaped like `host.tld` — and replaces
-- anything else with a line pointing at the console. So they name no value
-- back.
--
-- ── What else is kept exactly ─────────────────────────────────────────────
--
-- The signature, `security definer`, the guard, the lock, the rename path,
-- the no-op reply and the shape of the result are the previous body's, and
-- `create or replace` keeps the grants. The checks sit after the lock and
-- before the rename, so a refused link writes nothing anywhere: no row, no
-- cell text, and — because the call raises — no ledger entry on the client.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- A function definition and a proof that builds its own fixture and gives it
-- back inside a sentinel-exception block, as `21000227000000` does.

create or replace function public.update_touchpoint(
  p_touchpoint_id uuid,
  p_name          text,
  p_kind          text,
  p_summary       text,
  p_url           text,
  p_icon_url      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_kind     text := btrim(coalesce(p_kind, ''));
  v_summary  text := nullif(btrim(coalesce(p_summary, '')), '');
  v_url      text := nullif(btrim(coalesce(p_url, '')), '');
  v_icon_url text := nullif(btrim(coalesce(p_icon_url, '')), '');
  -- An absolute https address: scheme, a host, and no whitespace anywhere.
  v_https    constant text := '^https://[^\s/?#]+([/?#]\S*)?$';
  -- What an icon may be besides that: a path on this site, or http on a
  -- loopback host, any port.
  v_on_site  constant text := '^/[^/\\\s]\S*$';
  v_loopback constant text := '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?([/?#]\S*)?$';
  v_previous public.touchpoints;
  v_renamed  jsonb;
  v_written  int;
begin
  if not public.is_service_account() then
    raise exception 'This account cannot edit the blueprint' using errcode = '42501';
  end if;

  -- Refused here as well as inside the rename, because an unchanged name never
  -- reaches the rename — and an empty one must never reach the row.
  if v_name = '' then
    raise exception 'a touchpoint needs a name — an empty one is a blank pill';
  end if;

  if v_kind = '' then
    raise exception 'a touchpoint is one of its kinds — a blank one is none of them';
  end if;

  -- Locked, and read whole: this is the row the inverse will put back.
  select * into v_previous
    from public.touchpoints
   where id = p_touchpoint_id
     for update;

  if v_previous.id is null then
    raise exception 'touchpoint % does not exist', p_touchpoint_id;
  end if;

  -- The two links, checked only where they change: a value the row already
  -- holds was stored before this rule and is not this save's to refuse.
  if v_url is not null
     and v_url is distinct from v_previous.url
     and v_url !~* v_https then
    if v_url ~* '^http:' then
      raise exception 'A touchpoint’s link has to be https — that one is http, which is not secure.';
    end if;
    raise exception 'A touchpoint’s link has to be a full address that starts with https.';
  end if;

  if v_icon_url is not null
     and v_icon_url is distinct from v_previous.icon_url
     and v_icon_url !~* v_https
     and v_icon_url !~ v_on_site
     and v_icon_url !~* v_loopback then
    raise exception 'A touchpoint’s icon has to be an https address, a path on this site, or nothing at all.';
  end if;

  -- A save that matches the row as it stands is not an edit. Nothing is
  -- written and `updated_at` is not stamped, and the reply says so, so the
  -- caller records no ledger entry — an undo of nothing is a row in the sheet
  -- that does nothing when clicked.
  if (v_previous.name, v_previous.kind, v_previous.summary, v_previous.url, v_previous.icon_url)
     is not distinct from (v_name, v_kind, v_summary, v_url, v_icon_url) then
    return jsonb_build_object(
      'touchpoint_id', p_touchpoint_id,
      'name', v_name,
      'previous_name', v_previous.name,
      'cell_ids', '[]'::jsonb,
      'changed', false,
      'previous', jsonb_build_object(
        'name', v_previous.name,
        'kind', v_previous.kind,
        'summary', v_previous.summary,
        'url', v_previous.url,
        'icon_url', v_previous.icon_url
      )
    );
  end if;

  -- The name first, through the one function that knows how to move it. If it
  -- raises, nothing below runs and nothing above has been written.
  if v_previous.name <> v_name then
    v_renamed := public.rename_touchpoint(p_touchpoint_id, v_name);
  end if;

  update public.touchpoints
     set kind       = v_kind,
         summary    = v_summary,
         url        = v_url,
         icon_url   = v_icon_url,
         updated_at = now()
   where id = p_touchpoint_id;

  -- A zero-row write is a failure, not a no-op: the caller is about to record
  -- an inverse for an edit that never happened.
  get diagnostics v_written = row_count;
  if v_written <> 1 then
    raise exception 'editing touchpoint % wrote % rows', p_touchpoint_id, v_written;
  end if;

  return jsonb_build_object(
    'touchpoint_id', p_touchpoint_id,
    'name', v_name,
    'previous_name', v_previous.name,
    'cell_ids', coalesce(v_renamed -> 'cell_ids', '[]'::jsonb),
    'changed', true,
    -- The argument list that undoes this call, as the row stood under the
    -- lock — never as the caller remembered it.
    'previous', jsonb_build_object(
      'name', v_previous.name,
      'kind', v_previous.kind,
      'summary', v_previous.summary,
      'url', v_previous.url,
      'icon_url', v_previous.icon_url
    )
  );
end
$function$;

comment on function public.update_touchpoint(uuid, text, text, text, text, text) is
  'Edit a touchpoint''s registry entry whole — name, kind, summary, url and '
  'icon_url — in one transaction. A changed name goes through rename_touchpoint, '
  'so every bearing cell''s content moves with it. Blank prose is stored as null. '
  'A changed url must be an absolute https address, or empty; a changed icon_url '
  'an https address, a path on this site, an http loopback address, or empty. '
  'A value the row already holds is kept as it stands. '
  'A save matching the row writes nothing and returns changed = false. '
  'Returns the previous values, which are the arguments that undo the call.';

-- ── Prove the posture survived the rewrite ─────────────────────────────────

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.oid = to_regprocedure('public.update_touchpoint(uuid, text, text, text, text, text)');

  if v_definer is null then
    raise exception 'proof: update_touchpoint(uuid, text, text, text, text, text) was not replaced';
  end if;
  if not v_definer then
    raise exception
      'proof: update_touchpoint must stay SECURITY DEFINER — the guard in its body is what decides who may author';
  end if;
end
$proof$;

-- ── The rule, performed ────────────────────────────────────────────────────
--
--   1. an entry carrying an http link and a path icon from before the rule
--      can still have its summary edited, and keeps both as they stand;
--   2. a save matching the row still returns changed = false;
--   3. a `javascript:`, `http:`, relative or non-link URL is refused with the
--      function's sentence, and leaves the row as it stood;
--   4. an icon outside the rule — http on a real host, `javascript:`,
--      `data:`, protocol-relative, a bare host — is refused the same way;
--   5. each icon shape the rule takes is stored: https, a path on this site,
--      and http on each loopback host;
--   6. undoing the replacement of a seeded logo path puts it back;
--   7. an https link is stored, and an empty icon and an empty link clear.
do $touchpoint_links$
declare
  entry uuid;
  legacy_url  constant text := 'http://legacy.example/tool';
  legacy_icon constant text := '/touchpoint-logos/example-logo.png';
  uploaded    constant text :=
    'https://example.supabase.co/storage/v1/object/public/cell-attachments/touchpoints/'
    || '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png';
  link_http    constant text := 'A touchpoint’s link has to be https — that one is http, which is not secure.';
  link_refused constant text := 'A touchpoint’s link has to be a full address that starts with https.';
  icon_refused constant text :=
    'A touchpoint’s icon has to be an https address, a path on this site, or nothing at all.';
  reply jsonb;
  now_row public.touchpoints;
  candidate text;
  expected text;
  done boolean := false;
  msg text;
begin
  perform set_config(
    'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);
  if not public.is_service_account() then
    perform set_config('request.jwt.claims', '', true);
    raise notice
      'touchpoint-link proof skipped: this environment cannot hold a service claim, so the guarded write cannot run here';
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform set_config(
      'request.jwt.claims', '{"app_metadata":{"role":"service"}}', true);

    insert into public.touchpoints (name, kind, origin, url, icon_url)
      values ('touchpoint-link fixture', 'app', 'app', legacy_url, legacy_icon)
      returning id into entry;

    -- 1. WHAT THE ROW ALREADY HOLDS PASSES AS IT STANDS.
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    select * into now_row from public.touchpoints where id = entry;
    if reply ->> 'changed' <> 'true' or now_row.summary is distinct from 'edited'
       or now_row.url is distinct from legacy_url
       or now_row.icon_url is distinct from legacy_icon then
      raise exception 'proof: an edit beside a pre-rule link did not land as it was: %', reply;
    end if;

    -- 2. A SAVE MATCHING THE ROW IS STILL NOT AN EDIT.
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    if reply ->> 'changed' <> 'false' then
      raise exception 'proof: a save matching the row did not say it changed nothing: %', reply;
    end if;

    -- 3. A URL THAT IS NOT AN ABSOLUTE HTTPS ADDRESS IS REFUSED.
    foreach candidate in array array[
      'javascript:alert(1)', 'http://example.com', '/relative/path', 'not a link',
      'data:text/html,hi', 'https://', '//evil.example/x'
    ] loop
      expected := case when candidate ~* '^http:' then link_http else link_refused end;
      begin
        perform public.update_touchpoint(
          entry, 'touchpoint-link fixture', 'app', 'edited', candidate, legacy_icon);
        raise exception 'proof: the link % was accepted', candidate;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> expected then raise; end if;
      end;
    end loop;

    -- 4. AN ICON OUTSIDE THE RULE IS REFUSED.
    foreach candidate in array array[
      'http://cdn.example/x.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)',
      '//evil.example/x.png', '/\evil.example/x.png', 'cdn.example/x.png',
      'http://localhost.evil.example/x.png', 'http://localhost@evil.example/x.png',
      'https://', '/'
    ] loop
      begin
        perform public.update_touchpoint(
          entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, candidate);
        raise exception 'proof: the icon % was accepted', candidate;
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg <> icon_refused then raise; end if;
      end;
    end loop;

    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is distinct from legacy_url
       or now_row.icon_url is distinct from legacy_icon
       or now_row.summary is distinct from 'edited' then
      raise exception 'proof: a refused link changed the row: % %', now_row.url, now_row.icon_url;
    end if;

    -- 5. EVERY SHAPE THE ICON RULE TAKES IS STORED.
    foreach candidate in array array[
      uploaded,
      '/touchpoint-logos/another-logo.png',
      'http://127.0.0.1:54321/storage/v1/object/public/cell-attachments/touchpoints/a/b.png',
      'http://localhost/x.png',
      'http://[::1]:8080/x.png'
    ] loop
      perform public.update_touchpoint(
        entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, candidate);
      select * into now_row from public.touchpoints where id = entry;
      if now_row.icon_url is distinct from candidate then
        raise exception 'proof: the icon % was stored as %', candidate, now_row.icon_url;
      end if;
    end loop;

    -- 6. UNDOING A REPLACED SEEDED LOGO PUTS THE PATH BACK.
    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, legacy_icon);
    reply := public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', legacy_url, uploaded);
    perform public.update_touchpoint(
      entry, reply -> 'previous' ->> 'name', reply -> 'previous' ->> 'kind',
      reply -> 'previous' ->> 'summary', reply -> 'previous' ->> 'url',
      reply -> 'previous' ->> 'icon_url');
    select * into now_row from public.touchpoints where id = entry;
    if now_row.icon_url is distinct from legacy_icon then
      raise exception 'proof: undoing a replaced seeded logo left %', now_row.icon_url;
    end if;

    -- 7. AN HTTPS LINK IS STORED, AND EMPTY STILL CLEARS.
    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', ' https://figma.com/file/x ', uploaded);
    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is distinct from 'https://figma.com/file/x'
       or now_row.icon_url is distinct from uploaded then
      raise exception 'proof: an https link and an uploaded icon were stored as % and %',
        now_row.url, now_row.icon_url;
    end if;

    perform public.update_touchpoint(
      entry, 'touchpoint-link fixture', 'app', 'edited', '', '');
    select * into now_row from public.touchpoints where id = entry;
    if now_row.url is not null or now_row.icon_url is not null then
      raise exception 'proof: clearing left % and %', now_row.url, now_row.icon_url;
    end if;

    perform set_config('request.jwt.claims', '', true);
    done := true;
    raise exception using errcode = 'P0001',
      message = 'touchpoint-link fixture rollback';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    get stacked diagnostics msg = message_text;
    if msg <> 'touchpoint-link fixture rollback' then raise; end if;
  end;

  if not done then
    raise exception 'proof: the touchpoint-link cases never ran';
  end if;
  if exists (select 1 from public.touchpoints where name = 'touchpoint-link fixture') then
    raise exception 'proof: the touchpoint-link fixture survived the rollback';
  end if;
end
$touchpoint_links$;

-- @recipe — the grants `create or replace` kept, asserted where the roles exist.
do $posture$
begin
  if not has_function_privilege('authenticated',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: authenticated lost execute on update_touchpoint';
  end if;
  if has_function_privilege('anon',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: anon can call update_touchpoint';
  end if;
end
$posture$;
