---
'uno-blueprint': patch
---

`add_step` runs again. The function read the path's scenario into a local variable that shared its name with the column it read, which Postgres refuses as ambiguous, so every call failed — adding a step from the canvas or through an agent included. The body now names the variable and the column apart and is otherwise unchanged. The other authoring functions that take a scenario or a path were called against a fresh replay of the portable core and run; `create_path`, which carried the same fault, is fixed separately.

Upgrading a deployment: apply the migration `21000307000000_add_step_runs_again.sql` (`supabase db push`, or your usual migration step). It replaces one function, keeps its grants, and moves no rows. A deployment that already rewrote `add_step` for itself should compare bodies first — the migration restates the template's body in full.
