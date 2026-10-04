---
'uno-blueprint': patch
---

Add API key… opens the key settings on a phone. The agent's no-key state asked for the key settings through the desktop rail popover's open flag, so on a phone, where there is no rail, the tap did nothing. `lib/agent/settings` now separates the ask from that open state: `openAgentSettings()` goes to any layout subscribed with the new `onAgentSettingsAsked`, and opens the desktop popover only when none is. An ask nobody was subscribed to stays pending until the popover closes or a subscriber takes it. The phone shell subscribes: the agent sheet steps aside and the nav drawer opens on its Settings surface with the provider, model and key fields. Dismissing the drawer brings back the agent sheet and the surface the drawer was on; closing it by navigating restores nothing. Every tap asks again. The desktop popover is unchanged.

Upgrading a deployment: no action; it comes with the pin.
