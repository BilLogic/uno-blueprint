---
"uno-blueprint": patch
---

One plain word for what a person may change: someone who **may approve** makes a cell **approved**, where the glossary, Uno's role prompt, the tool descriptions and their replies said "may confirm" and "owner-confirmed". The database follows: `profiles.may_approve`, `cells.approved_by` and `cells.approved_at`, `approving_profile_id()` and `approve_cell(uuid)`.

**Upgrading a deployment:** run `supabase db push` to apply `21000327000000_a_person_who_may_approve_makes_a_cell_approved.sql`, re-apply `scripts/recipes/cell-search.sql` if the deployment installed it (its embedding write calls the renamed guard), then redeploy the `uno-tools` function. A caller that selects `may_confirm` or `confirmed_by`, or calls `confirm_cell`, moves to the new names; there are no compatibility names.
