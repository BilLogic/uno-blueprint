-- The icon comment says what its file says.
--
-- Authored 2026-10-04.
--
-- `21000124000000` comments `touchpoints.icon_url`, and the text of that
-- comment was reworded in the file after databases had already applied it. A
-- migration that has run does not run again, so a database that applied the
-- earlier text still carries it in `pg_description`, and `schema_comments()`
-- ships it to agents as the column's meaning. Reading the file says one thing
-- and asking the database says another.
--
-- So the comment is issued again, with the file's text, and asserted to have
-- landed. On a database that already carries this text the statement changes
-- nothing; on an empty replay it is the second write of the same string.
--
-- The text is stated once, in the block below, so the write and its proof
-- cannot disagree. It must match `21000124000000`'s text word for word.
--
-- The whole migration is portable core: a comment on a plain column.

do $proof$
declare
  v_comment constant text :=
    'A stable URL for the touchpoint''s stock icon or logo — the mark a '
    'well-known tool shows in the detail panel. A property of the thing the '
    'service owns, authored once per (service, name), not per placement. Blueprint '
    'data, not app config: the template ships it null and draws nothing, and a '
    'deployment seeds its own asset URL. The renderer reads this row rather than '
    'matching a tool name against a table baked into code.';
  v_attnum smallint;
begin
  execute format('comment on column public.touchpoints.icon_url is %L', v_comment);

  select attnum into v_attnum
    from pg_attribute
   where attrelid = 'public.touchpoints'::regclass
     and attname = 'icon_url'
     and not attisdropped;

  if col_description('public.touchpoints'::regclass, v_attnum) is distinct from v_comment then
    raise exception 'proof: touchpoints.icon_url does not carry the current comment';
  end if;
end
$proof$;
