---
'uno-blueprint': patch
---

A suppressed repeat read renders as neutral, not as an error: the row the agent leaves when it declines to re-run a read the turn already answered now carries a muted minus icon in the row's usual colour, where it used to wear the red error icon and red tool name, so a turn that behaved correctly no longer reads as failing. Tool rows gain an optional `suppressed` field for this, separate from `isError`; genuine tool failures still render as errors. A suppressed row saved before the field existed is recognised by its summary and renders neutral too.

Upgrading a deployment: nothing to do.
