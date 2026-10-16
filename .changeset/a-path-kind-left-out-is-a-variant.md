---
'uno-blueprint': patch
---

A path made without a kind is a variant, and `create_path` runs again. `create_path` defaulted `kind` to `alternative`, a spelling the path kind check refuses, so any call that left `kind` out failed; it now defaults to `variant`, as `duplicate_path` does. Making it provable turned up a larger fault: the function chose the path to copy lanes from with a reference that was both an argument and a column, which Postgres refuses as ambiguous, so every call failed whatever it passed. The body now names each reference unambiguously and is otherwise unchanged.

Upgrading a deployment: apply the migration `21000306000000_a_path_kind_left_out_is_a_variant.sql` (`supabase db push`, or your usual migration step). It replaces one function, keeps its grants, and moves no rows. A deployment that already rewrote `create_path` for itself should compare bodies first — the migration restates the template's body in full.
