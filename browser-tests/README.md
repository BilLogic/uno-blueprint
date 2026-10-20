# Local canvas authoring checks

These browser checks mutate the bundled sample through the actual canvas and
Supabase API. Use a disposable local Supabase stack seeded with `supabase/seed.sql`,
a local editing account, and a dev server on its own port (default `5186`).
The API URL in the dev server's gitignored `.env` must be local. Keep credentials
in that file; the tests use the app's existing dev sign-in.

```bash
npm run dev -- --host 127.0.0.1 --port 5186 --strictPort
npx playwright test --config browser-tests/playwright.config.ts
```

Set `CANVAS_AUTHORING_URL` to use a different local canvas port. The runner refuses
port `5173` and non-local origins. Install Chrome, or change the Playwright channel
for your local browser installation. Layer-stack and query-state evidence is
attached to each run under `render-walk-output/authoring`.

The matrix covers lane and step insertion in stacked layout and lane-property
and step-summary edits in stacked and merged layouts, each in light and dark. Merged layout has no insert
handles. Lane and step renaming have no canvas entry point on the current app;
these checks do not claim to exercise unavailable controls.

Run the unit suite with database configuration cleared: it verifies the bundled
fallback as well as isolated query behavior, rather than the live sample stack.

```bash
VITE_SUPABASE_URL='' VITE_SUPABASE_ANON_KEY='' \
VITE_SUPABASE_DEV_EMAIL='' VITE_SUPABASE_DEV_PASSWORD='' npm test
```
