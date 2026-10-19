-- An approval records the cell edit in the same shape as other text edits.
-- Authored 2026-10-17. The log is audit-only; it does not replay an undo.
-- The prior confirmation pair belongs inside the captured update, so a
-- consumer restoring that update can restore an unconfirmed value too.

create or replace function public.approve_suggested_change(p_id uuid) returns jsonb
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
    'update_cell_content', jsonb_build_object('cell_id', v_change.cell_id, 'update',
      jsonb_build_object('content', v_change.proposed_content, 'confirmed_by', v_profile, 'confirmed_at', now())),
    jsonb_build_object('fn', 'update_cell_content', 'args',
      jsonb_build_object('cell_id', v_previous.id, 'update',
        jsonb_build_object('content', v_previous.content, 'summary', coalesce(v_previous.summary, ''),
          'owner', coalesce(v_previous.owner, ''), 'perceivedOwner', coalesce(v_previous.perceived_owner, ''),
          'status', v_previous.status, 'confirmed_by', v_previous.confirmed_by,
          'confirmed_at', v_previous.confirmed_at))));
  return jsonb_build_object('cell_id', v_change.cell_id, 'confirmed_by', v_profile);
end
$$;

comment on function public.approve_suggested_change(uuid) is
  'Apply a pending suggested change to its cell and owner-confirm the cell in the caller''s name. Refused unless the caller''s profile may confirm.';

