---
"uno-blueprint": minor
---

A dependency may now join two cells on different paths or scenarios of the same service, as a `leads_to` or an `enables`. Before, the database refused any link between two paths with "Both cells must be in the same path of the journey"; now it refuses only a link between two services, with "Both cells must be in the same service". The agent's connect tool takes a cross-path target the same way, and editing, clearing, Undo and deleting either cell behave as for a link within one path. Deleting a path or a scenario now keeps, in its recovery record, the links that came into it from elsewhere as well as the ones that left it. The canvas does not draw a cross-path link yet, and a blueprint file that carries one does not yet validate.

Upgrading a deployment: apply migration 21000324000000. No database-type change and no data backfill are needed. A deployment that supplies its own `move_cell` should refuse a move only when it would leave a dependency joining two services, not when it leaves one crossing paths.
