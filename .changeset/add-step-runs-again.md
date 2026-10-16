---
'uno-blueprint': patch
---

`add_step` runs again. It failed on every call, from the canvas and from an agent alike. The function kept the path's scenario in a local variable with the same name as the column it read, and Postgres refuses that as ambiguous. The variable and the column are now named apart, and nothing else in the body changes. The other authoring functions that take a scenario or a path were called against a fresh replay of the portable core and run; `create_path`, which carried the same fault, is fixed separately.

Upgrading a deployment: apply the migration `21000307000000_add_step_runs_again.sql` (`supabase db push`, or your usual migration step). It replaces one function, keeps its grants, and moves no rows. A deployment that already rewrote `add_step` for itself should compare bodies first — the migration restates the template's body in full.
