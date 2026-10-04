---
'uno-blueprint': minor
---

The canvas ground is a dot grid. Under the board, the flat grey becomes the site's motif: a 1px dot on a 20px pitch at zoom 1, in `--border-strong`, in both themes. The grid is one CSS background on a new composited layer, `[data-zoom-pan-ground]`, under the board. It pans and zooms with the board, and a pan only translates the layer, so panning repaints nothing, as before. Zoomed far out, the pitch doubles in world space so dots on screen are never closer than 10px. The dot alpha falls with the square of the pitch, so the ground's average tone holds steady across each step. The grid appears with the first fit, so it never snaps into place. Print and forced-colors mode keep a plain ground.

**Upgrading a deployment**

- Nothing to do. A deployment that wants the flat ground back can hide the layer in its own stylesheet: `[data-zoom-pan-ground] { display: none; }`.
