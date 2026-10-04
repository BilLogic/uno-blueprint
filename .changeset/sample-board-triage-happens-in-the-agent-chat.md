---
'uno-blueprint': patch
---

The sample board no longer claims a findings panel

The audit scenario's surface cells described a findings panel with severity
badges and triage buttons, and one step was named "Triage on the canvas". The
app has none of these. Findings are rows the agent lists in the chat (it can box
the cells they cite on request), and anyone triages one by asking the agent,
in the app or through `ub:audit`, with `open`, `resolved` and `dismissed`
as the only statuses. The cells now say that, the step is "Triage the
findings", and neither the owner's cell nor the path summary offers an
"accept" status that doesn't exist.

The step rename changes the path key of the four cells under it, so a
database re-seeded from `supabase/seed.sql` treats them as new rows.
