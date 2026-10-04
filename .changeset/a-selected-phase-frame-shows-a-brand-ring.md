---
'uno-blueprint': patch
---

A selected phase frame shows a brand ring. Clicking a phase on the overview now gives its frame a brand edge and a soft brand ring (`0 0 0 3px` of `--brand` at 16%), so the click registers before the camera moves. The ring arrives on `--ease-structural` over `--motion-micro` and appears at once under reduced motion. It follows the editor's selection, so Escape, Home, the breadcrumb and picking another phase clear or move it, and a scenario focused inside the phase is the selection instead. Keyboard focus keeps the `--ring` token, so a focused phase and a selected one stay distinguishable. A deployment that retunes `--brand` gets the ring in its own colour.
