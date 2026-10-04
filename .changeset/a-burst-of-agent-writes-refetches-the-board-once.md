---
"uno-blueprint": patch
---

A burst of agent writes refetches the board once. The first structural write still refreshes the board at once; further writes within a quarter second of each other collapse into one more refresh when they stop, so an agent turn of several writes no longer refetches every open scenario once per write. Attachment and slide image uploads are stored with a one-year cache lifetime, since their keys are unique and never overwritten.

Upgrading a deployment: no action; it comes with the pin. Images already stored keep their one-hour lifetime.
