---
"uno-blueprint": patch
---

Dragged lanes and steps keep a correctly sized landing outline when neighbouring rows differ in height. The dashed destination stays distinct in light and dark themes, and surrounding rows slide into their actual new positions at every zoom.

The landing outline glides between destinations with the surrounding items, and moves instantly when reduced motion is enabled.

Dropped rows and columns keep their destination preview until the board renders the saved order, eliminating the old-seat flash. Lane insertion panels show the relevant section with clear board-edge bounds and roles; Undo notices align with the canvas controls.
