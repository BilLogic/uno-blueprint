---
'uno-blueprint': patch
---

A failed initialiser publish says why. The publish step in `publish-initialiser.yml` now runs with `--loglevel verbose`, so the run's log keeps npm's trusted-publishing exchange. When the registry does not trust the workflow, npm falls back to a placeholder token and the registry answers only `404 Not Found`; the verbose lines show that the exchange is what failed.
