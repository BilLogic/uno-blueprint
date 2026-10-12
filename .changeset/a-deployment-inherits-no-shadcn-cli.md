---
'uno-blueprint': patch
---

A deployment inherits no shadcn CLI, and with it no `braces` advisory chain. The app's stylesheet imported `shadcn/tailwind.css` out of the package, so `shadcn` sat in `dependencies` and every deployment installed the whole CLI for one CSS file — `ts-morph`, `fast-glob`, `micromatch` and a `braces` with a high advisory and no patched release, seven `npm audit` findings with no fix. That file is now vendored as `src/styles/shadcn-tailwind.css`, under a header naming the upstream version (`shadcn@4.18.0`), and `shadcn` moves to `devDependencies`, where it still serves `npx shadcn add`. The production build is byte-identical. A new guard, `npm run check:vendored-css`, fails when the copy drifts from the installed `shadcn` — a bump nobody re-vendored, or an edit to the copy — and `npm run vendor:shadcn-css` rewrites it. Since v2.8.4 said `braces` sat only in development tooling: that was true of the template's own tree, not of a deployment's, and is true of both now.

Upgrading a deployment: bump the pin and run `npm install`. The seven advisories drop with it; there is nothing else to do.
