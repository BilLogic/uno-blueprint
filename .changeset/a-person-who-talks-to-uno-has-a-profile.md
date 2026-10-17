---
"uno-blueprint": patch
---

A person who talks to Uno has a profile: the stakeholder they are in the business, the words Uno uses with them, the nudges they dismissed, when Uno last ran with them, and whether they may confirm. A person reads and edits only their own profile. Someone who may not confirm contributes evidence in their name and a suggested change that waits; only someone who may confirm approves it, and approving owner-confirms the cell (`cells.confirmed_by`, `cells.confirmed_at`). A test project seeds its three pilot profiles with `node scripts/seed-pilot-profiles.mjs` from a gitignored `supabase/pilot/profiles.json`.

**Upgrading a deployment:** run `supabase db push` to apply `21000309000000_a_person_who_talks_to_uno_has_a_profile.sql`. Nothing else changes for a deployment that does not seed profiles.
