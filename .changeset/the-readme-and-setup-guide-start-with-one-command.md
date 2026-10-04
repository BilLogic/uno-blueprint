---
'uno-blueprint': patch
---

The README and the setup guide start with one command. Both now open their run-it-yourself steps with `create uno-blueprint` in its four forms (npm, pnpm, Yarn 1 and Bun), with the clone path kept below it for working on the template. The setup guide names the package managers that work and says Yarn 2 and later are refused, that pnpm and Yarn resolve dependencies afresh instead of reading npm's lock file, and that a new workspace needs `git init` and `git add -A` before the guards run.
