---
'uno-blueprint': minor
---

The canvas ground is a dot grid. Under the board, the flat grey becomes the site's motif: a 1px dot on a 20px pitch at zoom 1, in `--border-strong`, in both themes. The grid is one CSS background on the viewport. It pans and zooms with the board, because the camera writes its tile size and position on every frame. Zoomed far out, the pitch doubles in world space so dots on screen are never closer than 10px. The dot alpha falls with the square of the pitch, so the ground's average tone holds steady across each step. Print and forced-colors mode keep a plain ground.

**Upgrading a deployment**

- Nothing to do. A deployment that styles `[data-zoom-pan-viewport]`'s `background` shorthand in its own stylesheet will hide the grid. Set `background-color` instead to keep it.
