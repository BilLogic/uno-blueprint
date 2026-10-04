---
'uno-blueprint': patch
---

A base-path build leaves only the host files at the root. Under `BASE_PATH`, Vite empties only `dist/<prefix>/`, so files an earlier root build wrote at the root of `dist/` stayed there, left locally or restored by a host's build cache. A host serves a file that is there before a rule that is not forced, so a stale root `index.html` answered `/` with the old app instead of sending it on to the prefix. The build now clears the root of `dist/` when it starts, keeping only the path down to the prefix, and ends with nothing there but the prefix's folder, `_headers` and `_redirects`. It refuses to clear anything outside `dist/`, and never follows a symlink in the prefix's path. `npm run check:hosting -- --built` holds the root to exactly that under a prefix, and names anything else it finds there. A root build is unchanged.

`BASE_PATH` now refuses a `.` or `..` segment anywhere in the value (`/../x/`, `/a/../b/`, `/./x/`), the same way in the build, the hosting check, the application and the render walk. Before, only a leading `.` was refused.

**Upgrading a deployment**

- Take the new bytes of `vite.config.ts`, which a deployment holds byte-identical, with the pin bump. `render-walk/playwright.config.ts` changes the same way and comes with the package.
- A `BASE_PATH` with a `.` or `..` segment now stops the build. Set the prefix as a plain path, such as `/demo/`.
- A host that keeps its build directory between deploys may hand the first build after the upgrade a stale root. The build clears it, and `npm run check:hosting -- --built` confirms it.
