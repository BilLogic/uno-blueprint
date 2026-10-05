---
"uno-blueprint": minor
---

Edit touchpoint opens a dialog over the cell panel. A placement the registry holds now has an Edit touchpoint button beside its name; it opens the registry entry's Name, Kind, Summary, URL and Icon (upload a PNG, JPEG or WebP, or clear it), says how many steps the change reaches, and saves through `update_touchpoint` with its own Save touchpoint. Save touchpoint stays disabled until a field changes, and Cancel, Escape and the close button write nothing. The panel's unsaved edits are left as they were. A rename rewrites this cell's text in the database, so untouched Content moves to the new name and the panel's next Save keeps the placement; while Content is edited, the dialog refuses the rename and says to save or cancel the panel first. An open panel keeps the placement it was opened on across a rename, and follows an undo of that rename back: untouched Content returns to the old name, and an edited Content that still says the undone name cannot be saved until it names the placement again. The interface-schema map binds Name, URL and Icon to `touchpoints`, and Kind and Summary to `touchpoints.kind` and `touchpoints.summary` as well.

Upgrading a deployment: no action; it comes with the pin. It needs the `update_touchpoint` migration from the release that added it.
