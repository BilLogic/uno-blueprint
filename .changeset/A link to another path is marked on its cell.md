---
"uno-blueprint": minor
---

A link to another path is marked on its cell. A `leads_to` whose other end is on another path or scenario no longer vanishes from the board: the cell at each end shows "Continues in …" or "Comes from …", naming the other path when it is in the same scenario and the other scenario otherwise, and clicking it (or Enter) adds the far cell's path to what its scenario shows, flies the camera there and opens the far cell. The marker shows on the open scenario's board; the overview and phase rows, where cells are inert, draw none. Such a link is never drawn as an arrow, in Stacked or Merged, even with both paths on screen. The cell panel's Follows, Leads to, Enabled by and Enables lists now show these links with the other end's path, scenario and phase, and remove them like any other; the Add dependency picker offers cells on the service's other paths.
