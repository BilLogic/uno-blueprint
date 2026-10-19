---
summary: The public-key consent arrival route shows the verified client, signed-in person, scopes and callback before an explicit Allow or Decline.
claims:
  - src/components/cover/OAuthConsent.tsx
---

# OAuth consent

The consent route is an arrival page before the board opens. It uses the
public Auth client and keeps the authorization request through sign-in.
Sign-in accepts a password or an emailed code, keeps account creation disabled,
and returns to the same authorization request after authentication.
Auth supplies the client name, person, requested scopes and callback address;
the page shows those details before the person chooses Allow or Decline.

A decision follows only the callback returned by Auth. A missing, expired or
failed request gives a retry instruction. Provider error bodies stay out of
the page, and the board providers do not mount on this route.

`src/lib/oauthConsentRoute.ts` recognizes the configured base path and accepts
a trailing slash. The App route tests cover both URL forms, and the consent
component tests cover sign-in, explicit approval, denial and safe failures.
