---
'uno-blueprint': minor
---

Ubuntu Sans Mono replaces Source Code Pro as the mono face, so command copy, ids and code read in the same family as the Ubuntu Sans body. It is self-hosted from `@fontsource-variable/ubuntu-sans-mono` and the Source Code Pro package is gone. The mono override seam is now `--app-font-mono`, mirroring `--app-font-sans`. The old name, `--font-source-code-pro`, keeps working: an embedding app that sets it still swaps the mono face, and `--app-font-mono` wins when both are set.
