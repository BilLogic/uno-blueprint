---
"uno-blueprint": patch
---

Uno offers the canvas when someone asks to see the blueprint, never on its own. On a yes, `skills/init/scripts/canvas.py start` runs it on the person's machine against the project in `.env` and gives the link. Asked to share it, Uno offers a Netlify site or a GitHub repository in the person's own account, says what becomes public first, and leaves the project's values in the site's settings to the person; the deploy reads them from there.
