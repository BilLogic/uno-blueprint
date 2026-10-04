---
'uno-blueprint': minor
---

Empty states draw a mini-blueprint. The empty canvas, the empty phase and panel frames, and the cell drawer with nothing selected now show a small picture of a blueprint above their copy: three lane rows, each a lane-colour square and a label bar, then cells holding one skeleton bar, with the missing cells dashed. It is drawn from theme tokens (the lane role colours, the border steps and the radius ladder), so it follows light and dark and a deployment's own lane palette with no change. It is hidden from assistive tech and does not animate, and it is left off when the phases could not be loaded, since a failed read is not an empty board. The copy is unchanged but for the empty canvas, which said to pick a path "under Paths in the sidebar", where there is no such section: a focused scenario now points at the paths menu in the header, and a phase canvas, which has no paths menu, says none of its scenarios has a path to draw and points at the sidebar.
