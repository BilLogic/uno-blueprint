---
summary: A dependency (`leads_to` or `enables`) may join any two cells of one service — another path, another scenario — and never two services; the kinds stay the same, the canvas marks a cross-path link on its cell rather than drawing it, and the impact tracer follows it like any other edge.
---

# 35. A link may cross paths within one service

**Status** Accepted — 2026-10-31.
**Context** `supabase/migrations/21000324000000_a_link_may_cross_paths_within_one_service.sql`,
the **Dependency** entry in [`CONTEXT.md`](../../CONTEXT.md),
[0003](0003-a-service-owns-its-journey-and-shares-the-catalog.md)

## Context

A dependency joined two cells on one path. `set_cell_dependency` and
`update_cell_dependency` refused anything else with "Both cells must be in the
same path of the journey", and the IR validator rejected a cross-path edge on
import. The rule came from the canvas: an arrow is drawn inside one path's
grid, and a line leaving that grid has nowhere to land.

Real services hand off between scenarios. A review in one scenario leads to
a weekly report, and the report sits in another scenario, in another phase.
The relationship is a plain `leads_to`; the rule meant it could not be
recorded at all, so it lived in a note, where the impact tracer cannot follow
it.

## Decision

The reach of a dependency is **one service**. Both cells' paths must belong,
through their scenarios and phases, to the same service; a cell of another
service is refused with "Both cells must be in the same service". The
database is where this is enforced, in both write functions. The panel's
client-side check no longer looks at paths.

The **kinds are the same**: `leads_to` and `enables`, read source-first, with
no third kind for "continues elsewhere". A cross-path link is written,
edited, cleared and undone through the same functions as an in-path one, and
deleting either cell removes it through the same cascade.

On the **canvas**, an in-path link keeps its arrow. A link whose other end is
on another path is marked on the cell, naming the other end, and the marker
jumps there.

The **impact tracer**, what-if and map's update mode follow a cross-path link
like any other edge.

## What this rejects

**Links across services.** A service owns its journey ([0003](0003-a-service-owns-its-journey-and-shares-the-catalog.md));
two services share only the catalogue. A link between them would make one
service's change reach into another's journey through a row neither owns,
and would make deleting a service quietly cut edges in a service that stays.

**A new edge kind for cross-path links.** Where an edge's ends sit is a fact
about the cells, not about the relationship. A second kind would split one
relationship across two words and make every reader of `kind` ask both.

**Drawing the arrow across boards.** The board lays out one path at a time;
an arrow to a cell that is not on screen cannot be drawn honestly.

## Consequences

- A cross-path `leads_to` is not an arrow. "Leads to draws" now means "draws
  when both ends are on the board". A cell's marker carries the rest.
  (2026-10-31: the marker shows it — "Continues in …" / "Comes from …" on the
  cell at each end, jumping to the other; #1255.)
- Deleting a path or a scenario archives every link with either end inside
  it, not only the ones that leave it, so a link that came in from elsewhere
  is in the recovery record. Restoring it needs its other end to still exist.
- The IR file must carry cross-path links, and its validator must stop
  rejecting them. That is a published-interface change, made separately
  (#1254); until it lands, an export of a cross-path link will not validate.
- Impact reach grows. A change to one scenario can now name affected cells in
  another, so a trace or a what-if answer may be longer than before for the
  same seed. That is the point, and it is a cost a reader pays.
- Duplicating a path or a scenario copies only the edges with both ends
  inside the copy, as before. A cross-path edge stays with the original.
- The plausible "fix" that undoes this is restoring the same-path check
  because an arrow "has nowhere to render". The marker is where it renders.
