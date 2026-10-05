-- One write edits a touchpoint whole: its name, kind, summary, link and icon.
--
-- Authored 2026-10-05.
--
-- The registry row has five fields an author edits — what the tool is
-- called, what sort of thing it is, what it is for the service, where it
-- lives, and the mark it shows — and until now the template wrote exactly
-- one of them. `rename_touchpoint` (`21000202000000`) moves the name and the
-- word in every bearing cell; nothing wrote the other four, and `icon_url`
-- had no writer of any kind, so a deployment could seed a logo and no author
-- could ever change or remove it.
--
-- An editor that saved the five as a rename followed by a row update would
-- be two requests, and PostgREST gives each its own transaction. The rename
-- could land and the update be refused — or the reverse — and the panel
-- would be left showing a half-saved entry whose undo has to guess which
-- half happened. That is the failure the rename function exists to end for
-- the name and its text; this extends the same answer to the whole row. One
-- call, one transaction, one ledger entry, one undo.
--
-- ── Why it calls `rename_touchpoint` rather than repeating it ─────────────
--
-- The rename is the delicate half — whole-item matching, delimiters kept,
-- the post-condition that refuses to finish while any bearing cell still
-- names the old word — and it is already proven where it lives. A second
-- copy of that body here would be a second answer to the same question, and
-- the two would drift the first time either was fixed. So this function
-- calls it, inside its own transaction: a rename that raises takes the other
-- four fields down with it, and a refusal on any of the four takes the
-- rename back out of every cell. It is called only when the name actually
-- changes, so an edit to the summary alone rewrites no text and bumps nothing
-- it did not touch.
--
-- ── The arguments are the whole entry, not a patch ────────────────────────
--
-- Positional `p_` parameters, the shape `rename_touchpoint` takes, rather than
-- a jsonb patch. Every argument is the field's NEXT value, and null means
-- empty — so clearing the icon is `p_icon_url => null`, which is a thing an
-- author does, and not "leave it alone", which a patch would have to spell
-- some other way. The panel holds the whole entry anyway, and a full-state
-- write is its own inverse: what the function returns as the row's previous
-- values is exactly the argument list that puts the row back, name and cell
-- text included. The ledger records that and nothing else.
--
-- Blank prose is stored as null rather than `''`, the house rule every other
-- registry write follows — two spellings of empty is how a field ends up
-- rendering an empty frame instead of nothing at all. The kind's vocabulary
-- is the table's CHECK and is not restated here, so it cannot drift from it.
--
-- ── Why `icon_url` gets no column grant ────────────────────────────────────
--
-- Like every placement and registry function since `21000120000000`, this is
-- `security definer` behind an explicit `is_service_account()` guard, so it
-- never consults a column grant. Granting `update (icon_url)` to
-- `authenticated` as well would open a second, direct write surface with no
-- writer behind it — a column every posture check then has to account for
-- before anything uses it. The function is the writer.
--
-- ── Where an uploaded icon lives ───────────────────────────────────────────
--
-- In `cell-attachments`, the bucket resource uploads already use
-- (`21000121000000`): public-read, service-account write, one object per
-- file under an id-only key. Its write policies admitted `cells/<id>/<id>`
-- keys and nothing else, so they are widened by one prefix, `touchpoints/`,
-- under the same pattern and the same guard. The key names the touchpoint's
-- id, never its name, so a rename moves no URL. No purge on replace or
-- clear, for the reason that migration gives: an object without a row is a
-- bounded cost on a bucket this size.
--
-- ── Replaying against an empty database ────────────────────────────────────
--
-- A function definition and two policy rewrites; no rows are read or moved.
-- The proofs are invariants about the function's own posture and about the
-- policies, which an empty replay satisfies exactly as a populated target
-- does. What the function does to rows is held by
-- `scripts/tests/update-touchpoint.test.sh`, which replays this series onto a
-- loaded seed and calls it as an author and as a reader.

-- ── The write ─────────────────────────────────────────────────────────────

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
  'A save matching the row writes nothing and returns changed = false. '
  'Returns the previous values, which are the arguments that undo the call.';

-- @recipe — who may call it, and where an uploaded icon may be put.
--
-- The same posture as `rename_touchpoint`: closed to `public` and `anon`,
-- open to `authenticated`, with the guard in the body deciding which
-- authenticated caller may actually author.
revoke execute on function public.update_touchpoint(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_touchpoint(uuid, text, text, text, text, text) to authenticated;

-- The two write policies that check a key, rewritten with one more prefix.
-- Select and delete check no key and are left as they stand.
drop policy if exists "cell_attachments_insert" on storage.objects;
drop policy if exists "cell_attachments_update" on storage.objects;

create policy "cell_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^(cells|touchpoints)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

create policy "cell_attachments_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cell-attachments' and public.is_service_account())
  with check (
    bucket_id = 'cell-attachments'
    and public.is_service_account()
    and name ~ '^(cells|touchpoints)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$'
  );

do $proof$
declare
  admitted int;
begin
  select count(*) into admitted
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('cell_attachments_insert', 'cell_attachments_update')
     and coalesce(with_check, '') like '%touchpoints%'
     and coalesce(with_check, '') like '%is_service_account()%'
     and not ('anon' = any(roles) or 'public' = any(roles));
  if admitted <> 2 then
    raise exception
      'proof: expected both cell_attachments key policies to admit touchpoints/ behind the service guard, found %', admitted;
  end if;

  if has_function_privilege('anon',
       'public.update_touchpoint(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'proof: anon can call update_touchpoint';
  end if;
end
$proof$;
-- @core

-- ── Prove the function's posture ───────────────────────────────────────────
--
-- SECURITY DEFINER, because the guard in its body is what decides who may
-- author and no column grant is consulted; and present with the six
-- arguments the client posts, since PostgREST resolves a call by its keys.

do $proof$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.oid = to_regprocedure('public.update_touchpoint(uuid, text, text, text, text, text)');

  if v_definer is null then
    raise exception 'proof: update_touchpoint(uuid, text, text, text, text, text) was not created';
  end if;
  if not v_definer then
    raise exception
      'proof: update_touchpoint must be SECURITY DEFINER — the guard in its body is what decides who may author';
  end if;
end
$proof$;
