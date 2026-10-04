---
'uno-blueprint': patch
---

Ubuntu Sans Mono replaces Source Code Pro as the mono face, so command copy, ids and code read in the same family as the Ubuntu Sans body. It is self-hosted from `@fontsource-variable/ubuntu-sans-mono` and the Source Code Pro package is gone. The mono override seam is now `--app-font-mono`, mirroring `--app-font-sans`: an embedding app that set `--font-source-code-pro` to swap the mono face sets `--app-font-mono` instead.
