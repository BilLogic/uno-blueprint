---
'uno-blueprint': patch
---

The README says what v2.8.0 ships. The exposure note no longer claims every table is publicly readable. It names the three exceptions: `agent_sessions` and `agent_messages` (agent chat transcripts) are readable only by their author, `business_models` (propositions) only after sign-in, and `service_account_emails` only by the service role. The repo map's domain-language row drops "need", the dependency kind the schema retired, and names touchpoint and the line of visibility as the glossary spells them. The audit helpers' row lists what they do now, ranking included, and the repo map gains the `.agents/skills/` mirror and the `create-uno-blueprint` initialiser.

Upgrading a deployment: no action; it comes with the pin.
