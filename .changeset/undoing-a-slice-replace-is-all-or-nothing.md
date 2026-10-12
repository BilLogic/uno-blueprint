---
'uno-blueprint': patch
---

Undoing a slice replace is all-or-nothing too: a failed undo no longer empties the slice. The undo of a slide save used to read the slice's slides, delete them, and insert the captured ones as separate requests, so an insert refused after the delete left the slice with nothing. It now goes through one database function, `restore_slides`, which writes the captured slides and their image sets back verbatim, ids and timestamps included, in one transaction, and names the slides it dropped so their uploads are swept after it commits. A slide save whose reply carries no usable capture now says so instead of recording a change that cannot be undone. Separately, a suppressed repeat-read row saved before the `suppressed` field existed now renders neutral rather than as an error.

Upgrading a deployment: apply the migration `21000305000000_undoing_a_slice_replace_is_all_or_nothing.sql` (`supabase db push`, or your usual migration step) before deploying this version. Until it is applied, undoing a slide save fails with "could not find the function", and nothing is written. It defines the function and its grants and moves no rows.
