---
"uno-blueprint": patch
---

The impact tracer, `ub:whatif` and map's update mode now follow a dependency into another path or scenario of the same service, with the same visited set and depth cap as before. When an affected cell sits in another scenario or on another path than the cell it was reached from, the tracer's result says which, in a new `elsewhere` field on that cell, and the what-if report names that scenario and path beside the cell. A what-if whose trace reaches another scenario brings that scenario into its sign-off scope, so accepting the change is refused if that scenario has moved since the analysis. The audit's gap sweep counts a link to or from another path as an answer, not a gap, and its channel-conflict check still compares targets within one path only, since a journey walks one path at a time.

Upgrading a deployment: nothing to apply. A deployment that parses the tracer's output should accept the optional `elsewhere` field on each affected cell.
