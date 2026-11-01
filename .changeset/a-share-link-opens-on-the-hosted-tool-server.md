---
"uno-blueprint": patch
---

A share link opens on the hosted tool server. The platform hands a function its request path without the public `/functions/v1` prefix, so the share route matched no request there and every link was answered by the sign-in gate. The route now matches the share path as the tail of the tool server's public path.

**Upgrading a deployment:** redeploy the `uno-tools` function. No migration.
