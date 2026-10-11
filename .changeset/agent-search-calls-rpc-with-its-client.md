---
'uno-blueprint': patch
---

Agent search works on deployments again: `search_blueprint` calls the database function with its client still attached, where every call used to fail with `this.rest` undefined before any request went out. Only deployments that turn on `agent.search` reached the broken call; nothing else changes.
