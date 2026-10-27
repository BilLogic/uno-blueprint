---
"uno-blueprint": patch
---

Existing step and lane panels now show the same path and order rail as creation. Move an item, add a step to another path, or remove it from a path with a saved change and Undo. Removing saved cells asks first; a step always keeps at least one path.

Undo notices remain clickable above an open panel when the canvas is narrow.

Upgrading a deployment: apply migration 312 with the matching app, then regenerate database types. Custom hosts must provide the guarded `change_step_path` and `undo_step_path_change` contracts and keep their receipts server-only. The migration enforces the existing cell-to-path-step rule with a foreign key; repair any pre-existing orphaned cells by restoring their membership before upgrading. It does not delete them to make the migration pass.

Run this preflight before upgrading; restore the listed memberships before applying 312. The migration refuses with the orphan count and this query if any remain:

```sql
SELECT c.id, c.path_id, c.step_id
FROM public.cells c
LEFT JOIN public.path_steps ps ON ps.path_id=c.path_id AND ps.step_id=c.step_id
WHERE ps.step_id IS NULL;
```
