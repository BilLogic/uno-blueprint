---
'uno-blueprint': patch
---

A base-path build leaves only the host files at the root

A build under `BASE_PATH` writes the app into `dist/<prefix>/`, and Vite
empties only that folder, so whatever an earlier root build wrote at the root
of `dist/` stayed there — in a local `dist/`, or restored by a host's build
cache. A host serves a file that is there before a rule that is not forced, so
a stale root `index.html` answered `/` with the old app instead of sending it
on to the prefix. The build now clears the root of `dist/` when it starts,
keeping only the path down to the prefix, and ends with nothing there but the
prefix's folder, `_headers` and `_redirects`.

`npm run check:hosting -- --built` holds the root to exactly that under a
prefix, and names anything else it finds there. A root build is unchanged.

Upgrading a deployment: `vite.config.ts` changes, and a deployment holds it
byte-identical, so it takes the new bytes with the pin bump. A host that
caches its build directory between deploys can still hand the first build
after the upgrade a stale root; the build clears it, and
`check:hosting -- --built` confirms it.
