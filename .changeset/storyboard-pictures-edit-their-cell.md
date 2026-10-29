---
"uno-blueprint": patch
---

Edit a storyboard picture's cell inline, with one Save for its image, text and summary, guarded navigation and Undo for that exact change.

Upgrading a deployment: apply migration 21000313000000 with the matching app and regenerate database types. Hosts must provide the guarded storyboard cell read, update and restore operations described in the backend contract. Private receipts keep Undo available without allowing it to overwrite newer edits. No data backfill is required.
