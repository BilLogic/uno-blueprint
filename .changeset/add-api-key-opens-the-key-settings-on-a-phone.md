---
'uno-blueprint': patch
---

Add API key… opens the key settings on a phone. The agent's no-key state asks to show the key settings through the shared flag in `lib/agent/settings`, which only the desktop rail's ⚙ popover listened to, so on a phone, where there is no rail, the tap did nothing. The phone shell now answers the same ask: the agent sheet steps aside and the nav drawer opens on its Settings surface with the provider, model and key fields. The phone clears the flag as soon as it acts on it, so a second tap opens the settings again, and closing the drawer brings back the agent sheet and the drawer surface the reader had before. The desktop popover is unchanged.

Upgrading a deployment: no action; it comes with the pin.
