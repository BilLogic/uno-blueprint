---
"uno-blueprint": patch
---

Undo of an added step or lane works again on paths whose steps or lanes are numbered from 1, or have gaps. Before, the server refused it with "This change cannot be undone. Reload the canvas" on any path not numbered 0, 1, 2, …, and Undo now puts back exactly the numbering the path had.

Upgrading a deployment: apply migration 21000323000000. No app change, no database-type change and no data backfill are needed.
