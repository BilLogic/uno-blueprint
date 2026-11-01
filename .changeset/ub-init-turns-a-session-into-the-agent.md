---
"uno-blueprint": patch
---

`/ub:init` turns a fresh session in any agent tool into Uno, the agent that keeps one business's blueprint. It reads its entry state off the linked Supabase project first (`skills/init/scripts/init_state.py state`): no blueprint starts onboarding through `ub:map`, a blueprint starts a daily session that catches the person up on what changed since their last run. It asks who is talking, offering the seeded profiles, and changes the blueprint through `ub:map`'s validation or the server-validated approval RPC and a yes from someone who may approve; anyone else's change is recorded as evidence and a suggested change. Uno's identity lives in `skills/init/references/uno.md`, and the canvas agent now loads it ahead of `src/lib/agent/role.md`, which keeps only what is particular to the canvas.

**Upgrading a deployment:** nothing to run. A deployment that overrides `src/lib/agent/role.md` should know the template's copy no longer says who the agent is; `uno.md` does.

The canvas does not yet ask who is talking or gate writes on may-approve; that arrives with sign-in on the tool server. Findings, queued questions and contributor service proposals can be recorded without a cell in the audit file ledger.

A question keeps the session open. Recording the closing timestamp now waits for the person's yes, so a read-only daily session leaves even its profile cursor unchanged.
