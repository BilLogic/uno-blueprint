# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/BilLogic/uno-blueprint/security/advisories/new).
Please don't open a public issue for a vulnerability — an issue is visible
to everyone, including before there is a fix.

Expect an acknowledgement within a week.

## What this template is, security-wise

This is a template you deploy, not a hosted service, so most of the risk
lives in *your* deployment rather than in this repo. Two properties are
worth understanding before you put anything real in one.

**The board carries a public `SELECT` policy.** A deployed blueprint is
readable by anyone who has the URL and the anon key, which is shipped to
the browser and is therefore public by construction. That is the intended
design — the app is a reader. What is *not* the board is closed to that key:
evidence and its counts, the edit history and its recovery list, audit
findings and agent transcripts are readable only by a signed-in account.
Even so:

- Don't put client-confidential material in a public deployment.
- Don't treat the anon key as a secret. It isn't one.
- If you need private blueprints, put authentication in front of the
  deployment and tighten the RLS policies; the schema is yours to change.

**The service-role key is a different thing entirely.** It bypasses RLS
and can write anything. It belongs in a local `.env` or a CI secret store,
never in a committed file, never in the browser, never in an agent's
context. The repo ships a hook (`hooks/`) that refuses edits which would
commit one, and secret-scanning push protection is enabled on this
repository — but neither is a substitute for not pasting it somewhere.

## For contributors

CI runs on `pull_request`, never `pull_request_target`. A run from a fork
gets a read-only token and no secrets. If you are adding a workflow, keep
it that way: `pull_request_target` combined with checking out the PR head
gives anyone who opens a pull request code execution with this
repository's token.
