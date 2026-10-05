---
"uno-blueprint": patch
---

A touchpoint's URL and icon URL are checked before they are stored. In the Edit touchpoint dialog, a URL that is not https (a `javascript:` or `http:` link, a relative path, or text that is not a link) shows the same message a resource link would and keeps Save touchpoint disabled; a bare `figma.com/file/x` is saved as `https://figma.com/file/x`. An uploaded icon still saves, and Clear icon still clears it. A new migration, `21000302000000`, makes `update_touchpoint` refuse the same values with a sentence the dialog shows, so the map skill, the agent and seeds meet the rule too: a changed URL or icon URL must be an absolute https address, or empty. A value the row already holds is kept as it stands, so an entry stored before this, such as one with a seeded logo path, can still have its other fields edited; existing rows are not rewritten. A save that matches the row still writes nothing and returns `changed: false`.

Upgrading a deployment: port the new migration, `21000302000000`, under the deployment's own version and apply it (`supabase db push`), then bump the pin. A deployment that holds the generated recipe byte-identical takes the new copy with it.
