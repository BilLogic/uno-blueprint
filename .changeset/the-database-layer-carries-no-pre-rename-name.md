---
'uno-blueprint': patch
---

The database layer carries no pre-rename name. A new migration, `21000228000000`, issues the comment on `touchpoints.icon_url` again with the text its migration file now holds, and asserts that it landed. A database that applied the earlier wording kept it in `pg_description`, so `schema_comments()` handed agents a column meaning the files no longer state. The custom SQLSTATE that the proof blocks and the write-surface probe raise to roll themselves back is now `UB001`. Each block raises and catches it inside itself, so nothing outside one block ever sees it, and no behaviour changes. The generated recipe follows.

Upgrading a deployment:

- Apply the new migration (`supabase db push`). It changes only a column comment, and on a database that already carries the current text it changes nothing.
- The four migrations whose proofs used the old SQLSTATE have already run everywhere and do not run again; only their text changed. A deployment that holds the generated recipe or `panel-write-surface.mjs` byte-identical takes the new copies with the pin.
