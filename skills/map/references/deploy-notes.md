# Deploy Notes — blueprint-specific gotchas ONLY

Hosting a static Vite app is generic agent competence; this file deliberately
contains **only what's specific to blueprint deployments**. The template
ships a ready `netlify.toml` (build command, `dist/` publish dir, an
`/assets/*` 404 above the SPA redirect, node version) as the worked example;
hosts are interchangeable.

## ⚠ REQUIRED — public-exposure warning, BEFORE anything goes live

Deploying makes the content **public**: the static site is world-readable
and, in live-DB mode, anon SELECT is enabled on all tables. Client
operational data often qualifies as sensitive. Surface this warning and get
explicit confirmation before the first deploy (and again if the audience
changes). Access-control options, costs stated honestly:

- **Netlify password protection is a paid feature** — do not present it as
  the free fix.
- Free-tier alternatives: edge/basic-auth via the host's edge functions, an
  auth proxy, or simply not deploying publicly (share the print/PDF export
  instead).

## Build gate (always, both modes)

Run `tsc --noEmit` && `vite build` **before** deploying. Type errors in
generated data modules (CJK escaping is the classic) are an ingestion/
generation bug to fix at the generator — never hand-edit generated files or
the template to get a build through.

## `VITE_SUPABASE_*` are build-time (live-DB mode)

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are baked in at build time,
not read at runtime. Set them in the host's build environment before the
build runs; changing them requires a rebuild, not a redeploy of old
artifacts. Fallback mode needs neither. The anon key is publishable by
design — it may live in host build-env settings, but in the repo only in a
verified-gitignored `.env`.

## SPA redirect (the classic silent failure)

Deep links (`/scenario/...`) 404 on any static host without an SPA rewrite
to `/index.html` (Netlify: `/* /index.html 200`, already in the template's
`netlify.toml`; other hosts have equivalents). The app "works" from the root
and breaks on every shared link — check a deep link after every first
deploy on a new host.

The rewrite goes BELOW an `/assets/*` → 404 rule, never above it: a catch-all
that is reached first answers a missing hashed chunk with the app shell, and
the browser reports that as a module it could not import rather than as a
missing file. Building the equivalent pair on another host means building the
order too.

Served from a path rather than a domain root, both rules move under it: build
with `BASE_PATH=/demo/`, and the pair becomes `/demo/assets/*` → 404, then
the SPA fallback from `/demo/*` to the app shell under the path. Check a deep
link under the path, not at the root. The full recipe, including the rewrite
for showing the app under a path on another site, is
`docs/guide/04-operations.md` § Serving from a path.

## One site per locale

Per-locale artifact sets mean **one deployment (and one target) per locale**
— e.g. two Netlify sites for EN + ZH. There is no locale column and no
in-app switcher (v1); pointing one site at both locales' data renders
duplicate trees. Record each locale's `deploy_url` in
`blueprint-workspace.json`.

## Bare static hosts

The `dist/` output must serve correctly from any bare static server —
if it doesn't, that's a template bug, not a hosting quirk to patch around.

## After deploying

Verify with `render-checker` against the deployed URL (every scenario ×
view type renders, no console errors), then update `blueprint-workspace.json`
targets and regenerate `HANDOFF.md` if targets changed.

Done when a deep link under each `deploy_url` loads, `render-checker`
passes, and each `deploy_url` is recorded in `blueprint-workspace.json`.
