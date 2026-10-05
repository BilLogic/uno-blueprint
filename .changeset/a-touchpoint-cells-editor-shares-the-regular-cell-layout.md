---
"uno-blueprint": minor
---

A touchpoint cell's editor shares the regular cell layout. The block under Content now opens with a Touchpoint field, the same one the read-only panel shows, naming the touchpoint as a badge, then the placement's Summary and Role. A name-only placement's Link to registry card sits in that field when the panel was opened on it. The block's heading and explanatory copy are gone, and so is its resources list: a placement's resources stay readable in the Resources tab. When the saved cell holds a touchpoint, Content notes that changing a touchpoint's name there removes its Summary, Role and resources at this step. The interface-schema map now binds Summary to `cell_touchpoints.summary` as well.

Upgrading a deployment: no action; it comes with the pin. A placement's resources cannot be edited from the panel until they move into the Resources tab, so this ships in the same release as that change.
