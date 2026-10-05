---
"uno-blueprint": minor
---

One write updates a touchpoint's registry entry, icon included, and undoes as one. A new migration, `21000301000000`, adds `update_touchpoint`, which saves a touchpoint's name, kind, summary, url and icon in one transaction behind the same service-account guard as every other authoring function. A changed name goes through `rename_touchpoint`, so every cell that places the touchpoint has the word replaced in its text, a refusal on any field writes nothing at all, and a save that matches the row as it stands writes nothing and records no undo. The client gains `updateTouchpoint`, which records one entry in the session ledger whose revert puts back all five fields and the name in cell text, and `uploadTouchpointIcon`, which stores a PNG, JPEG or WebP image (never SVG) in the `cell-attachments` bucket under `touchpoints/<id>/` and returns its URL; saving the entry with no icon URL clears it. Undoing a rename now also refreshes the touchpoint registry and pickers, not only the boards. No UI uses the new write yet.

Upgrading a deployment:

- Apply the new migration (`supabase db push`). It adds one function and rewrites the `cell_attachments_insert` and `cell_attachments_update` storage policies to admit `touchpoints/` keys beside `cells/` ones, with the same service-account guard; nothing else about the bucket changes.
- A deployment that holds the generated recipe or `src/types/database.ts` byte-identical takes the new copies with the pin.
