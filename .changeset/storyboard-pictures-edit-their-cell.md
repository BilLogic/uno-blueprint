---
"uno-blueprint": patch
---

Edit a storyboard picture and optional caption directly in canvas Edit mode, with guarded navigation and Undo for that exact change. Other cell properties stay in the cell’s own panel.

Upgrading a deployment: apply migration 21000313000000 with the matching app and regenerate database types. Hosts must provide the guarded storyboard cell read, update and restore operations described in the backend contract. Private receipts keep Undo available without allowing it to overwrite newer edits. No data backfill is required.
