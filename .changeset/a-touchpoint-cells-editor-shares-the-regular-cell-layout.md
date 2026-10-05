---
"uno-blueprint": minor
---

A touchpoint cell's editor shares the regular cell layout. The block under Content now opens with a Touchpoint field naming the touchpoint as a badge, with an Edit touchpoint button beside it for a registry touchpoint (disabled until the touchpoint editor lands; a name-only placement keeps its Link to registry card instead), then the placement's Summary and Role. The block's heading and explanatory copy are gone, and so is its resources list: a placement's resources stay readable in the Resources tab. When the cell holds a touchpoint, Content says to rename it from Edit touchpoint, because changing its name there removes that placement's Summary, Role and resources. The interface-schema map now binds Summary to `cell_touchpoints.summary` as well.

Upgrading a deployment: no action; it comes with the pin. A placement's resources cannot be edited from the panel until they move into the Resources tab.
