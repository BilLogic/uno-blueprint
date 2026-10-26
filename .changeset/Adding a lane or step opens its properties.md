---
"uno-blueprint": patch
---

Lane and step headers show subtle insertion hints, padded grips and neutral hover surfaces. Insertion slots grow from ordinary dividers with room around the plus, and highlights follow the content as slots close. Creation opens the properties panel with path placement and Undo. Insertion previews grow and close around a fixed centre at edge positions as well as between headers. Delay explanatory hints consistently, centre feedforward marks in the clear header gaps, grow insertion previews into drafts, and require at least one path before creating. Align open header indicators with their canvas preview and dismiss insertion after pointer exit or lost window focus.

Require a steady header hover before opening insertion; dismiss during camera gestures and coordinate reversals, closing tracks and resting marks on one motion clock.

Protect Add-Undo and saved-field inverses from later edits, guard reordering against stale orders, keep lane properties path-local, bind Undo to each write's receipt, and recover interrupted gestures without taking the camera back from the person editing.

Upgrade the database and app together: apply migrations 309–311 as one upgrade; drag reordering breaks at intermediate versions. Regenerate database types. Custom and host callers of `reorder_steps` and `reorder_lanes` must pass `expected_ids` and accept a JSON receipt. Older app calls receive “Reload: the app was updated.” Lane properties are now per path. Undo history from before the upgrade is refused; start a fresh session after upgrading.
