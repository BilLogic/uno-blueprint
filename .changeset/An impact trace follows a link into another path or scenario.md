---
"uno-blueprint": patch
---

The impact tracer, `ub:whatif` and map's update mode now follow a dependency into another path or scenario of the same service, with the same visited set and depth cap as before. A blueprint export carries cross-path links once the IR file accepts them; until then the file rejects them, so a trace over an export still meets only links within one path. When an affected cell sits in another scenario or on another path than the trace's seed, the tracer's result says which, in a new `reached_in` field on that cell, and the what-if report names that scenario and path beside the cell. A what-if whose trace reaches another scenario brings that scenario into its sign-off scope, so accepting the change is refused if that scenario has moved since the analysis. The audit's gap sweep counts a link to or from another path as an answer, not a gap, and its channel-conflict check still compares targets within one path only, since a journey walks one path at a time.

Upgrading a deployment: nothing to apply. A deployment that parses the tracer's output should accept the optional `reached_in` field on each affected cell.
