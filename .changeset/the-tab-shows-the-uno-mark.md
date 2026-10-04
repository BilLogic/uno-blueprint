---
'uno-blueprint': patch
---

The tab shows the Uno mark. `public/favicon.svg` is no longer Vite's bolt: it draws the Uno mark, a black tile in a light tab strip and a white one in a dark strip, switching on `prefers-color-scheme` inside the file, with the teal dot in both. `index.html` links it after a plain `favicon.png` (192px, the black tile) for a browser that does not take an SVG icon, and an `apple-touch-icon.png` (180px) for a home screen.

Upgrading a deployment:

- A deployment keeps its own `public/` and `index.html`, so its tab is unchanged. To show the Uno mark, copy `public/favicon.svg`, `public/favicon.png` and `public/apple-touch-icon.png` from the template and add the three `<link>` lines from its `index.html`. A deployment with its own icon needs no change.
