---
"uno-blueprint": patch
---

The phone jump check holds on a long cell. The render walk's agent-jump case asked for a cell whose words sit wholly above the sheet, and it measured the clipped lines of a clamped cell too, so a board whose top-left cells say a lot failed a jump that landed correctly. It now asks for a cell's first line of words on screen above the sheet, which moves with the camera and not with the content; a jump that lands under the sheet or off the side of the screen still fails it.
