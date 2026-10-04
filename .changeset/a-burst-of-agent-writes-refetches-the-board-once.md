---
"uno-blueprint": patch
---

A burst of agent writes refetches the board once. Structural invalidations now wait a quarter second for the burst to end, so an agent turn of several writes sweeps every open scenario once rather than once per write. Attachment and slide image uploads are stored with a one-year cache lifetime, since their keys are unique and never overwritten.

Upgrading a deployment: no action; it comes with the pin. Images already stored keep their one-hour lifetime.
