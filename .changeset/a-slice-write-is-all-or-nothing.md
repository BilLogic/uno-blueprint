---
'uno-blueprint': patch
---

A slice write is all-or-nothing: a failed replace no longer empties the slice. Replacing a slice's slides used to delete them all and then insert the new set as a separate request, so an insert refused by one bad cell id left the slice with no slides; creating a slice inserted the row and then its slides, so the same refusal left an empty slice behind. Both now go through one database function each, `replace_slides` and `create_slice`, which write in one transaction: a refusal leaves the slice's prior slides and their image sets exactly as they were, and a refused create leaves no slice row. A cell that is not an id is refused in a sentence naming the slide. The editor's Save and the agent's slice tools both take the new path, and the change list and its undo behave as before — the undo of a replace now puts back the slides as the database held them when it removed them.

Upgrading a deployment: apply the migration `21000304000000_a_slice_write_is_all_or_nothing.sql` (`supabase db push`, or your usual migration step) before deploying this version. Until it is applied, every slice create and every slide save fails with "could not find the function", and nothing is written. It defines the two functions and their grants and moves no rows.
