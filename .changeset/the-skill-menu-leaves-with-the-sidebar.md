---
'uno-blueprint': patch
---

The skill menu leaves with the sidebar: a `/` typed in the docked agent's composer opens the skill menu, and going back to the cover page, starting a presentation or collapsing the sidebar now shuts it, where it used to stay floating over the page that replaced the workspace. The draft is kept, and the menu reopens on it when the sidebar comes back. `AgentDock` gains an optional `concealed` prop for this; the floating agent is unaffected.

Upgrading a deployment: nothing to do.
