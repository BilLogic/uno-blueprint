---
"uno-blueprint": patch
---

A person who talks to Uno has a profile: the stakeholder they are in the business, the words Uno uses with them, the nudges they dismissed, when Uno last ran with them, and whether they may approve. A person reads and edits only their own profile. Someone who may not approve contributes evidence in their name and a suggested change that waits; only someone who may approve approves it, and approving approves the cell (`cells.approved_by`, `cells.approved_at`). A test project seeds its three pilot profiles with `node scripts/seed-pilot-profiles.mjs --test-project` from a gitignored `supabase/pilot/profiles.json`.

**Upgrading a deployment:** run `supabase db push` to apply `21000314000000_a_person_who_talks_to_uno_has_a_profile.sql`. Nothing else changes for a deployment that does not seed profiles.

The pilot seed requires `.env` to name the linked test project, preserves may-approve on re-run, and checks reused stakeholder kinds. Approval deliberately permits ordinary accounts whose profiles may approve; approvals record their login in the authoring log.
