---
'uno-blueprint': patch
---

The render walk draws no image from a live bucket. A no-database build draws a board exported from the live one, whose attachment and frame image URLs still point at the deployment's storage bucket, so every walk downloaded every one of those images on every run. Every walk spec now takes its `test` from `render-walk/remote-images.ts`, which answers each image request bound for another origin with a 1×1 placeholder built in the runner, lets other cross-origin requests through and records their hosts, and leaves the served origin alone. The view walk prints how many images it answered locally and any other outside hosts it saw, and `render-walk/remote-images.spec.ts` watches the route work in a browser.

Upgrading a deployment: no action; the walk comes with the pin, and a deployment's CI stops downloading its bucket's images on every run.
