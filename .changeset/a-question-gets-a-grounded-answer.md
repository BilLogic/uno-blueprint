---
"uno-blueprint": patch
---

Uno answers a question from the cells it read and names them by step and who does it, carrying each cell's source; when the blueprint does not cover a question it says so and offers to map it. Uno's identity, `skills/init/references/uno.md`, is rewritten around that: the blueprint as its memory, and a checkable exit for every answer. The agent harness gains owner-agent cases that play an agent tool after `/ub:init` against the deployed tool server (`npm run agent:harness:tool-server`), signed in as the test caller, with reads over MCP and writes rehearsed.

**Upgrading a deployment:**

- A deployment that overrides `skills/init/references/uno.md`: compare its copy with the template's rewrite and carry the new § Answer from the blueprint across.
