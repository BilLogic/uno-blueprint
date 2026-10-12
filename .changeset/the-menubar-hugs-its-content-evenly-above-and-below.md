---
'uno-blueprint': patch
---

The menubar hugs its content: the service, phase and scenario bars drop their fixed `h-[3.25rem]` for `py-2` around the identity block's pinned two-line height, and the room above the title now matches the room below the description (9px each, up from roughly 8px above and 4px below). The bar is 56px plus its border and holds that height with or without a summary line. The cell-detail drawer's fallback top follows the new height. A bar showing only a summary line, such as a failure or "No database connected", keeps that line centred.

Upgrading a deployment: nothing to do.
