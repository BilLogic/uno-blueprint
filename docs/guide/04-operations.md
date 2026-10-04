---
summary: Running a deployed blueprint — which account may do what, how a change reaches the board, what is published to anonymous readers, and what to check after a deploy.
---

# Operations

**For** whoever runs a deployed blueprint.
**Answers** who may do what, and what happens when it changes?

## 1. Who may do what

Capability follows the account a surface uses, not the surface itself.

| Account | Can |
| --- | --- |
| no account, published blueprint | read what is published |
| a signed-in member outside the editing tier | read, and chat to the agent read-only |
| a signed-in member in the editing tier | read, and author through the app or its agent |
| the service account used by an import | write a whole blueprint transactionally |

Whether those middle two rows are one row or two is the deployment's choice.
The optional service-account tier is what splits them, and applying every
shipped migration applies it; a deployment that deletes that migration gives
every signed-in member the editing tier. The app asks the database which of
those it is talking to, so neither posture needs a build of its own.

The keys behind those rows are handled by rule, not convention: the
publishable key may be written to `.env` only after the skill verifies the
file is git-ignored, and the service-role key is never written to disk and
never pasted into a session
([adapter-contract.md §"Secrets"](../../references/adapter-contract.md)).

A Slack bot a deployment builds on top, holding only the publishable key,
can therefore answer questions and link to cells, and cannot change anything,
without anyone having to remember that rule. The template ships no such bot;
it is the read-consumer pattern in [guide/02](./02-using-it-in-practice.md).

## 2. The schema

The schema migrations live in
[`supabase/migrations/`](../../supabase/migrations/). They carry `-- @recipe` /
`-- @core` marks, and
[`supabase/generated/`](../../supabase/generated/) holds the two halves those
marks emit: the portable Postgres core, which CI applies to a stock
`postgres:17`, and the Supabase recipe applied on top of it. Both are
generated — edit a migration, then run `npm run generate:portable-core`. The
attribute-level ERD is at [`docs/erd.mmd`](../erd.mmd).

Import order is enforced by the `cells_validate_path_match` trigger:
`paths → steps → path_steps → lanes → cells → cell_dependencies`.

## 3. Changing a live blueprint

Every change goes through one guarded path. Imports are idempotent: the
same content hash re-imported is a no-op, which is what makes re-running an
import safe after a failed deploy.

Slices survive re-import because they refer to cells by key. Findings carry their own
service — `open`, `resolved`, `dismissed` — so triage is not lost when the
blueprint underneath them moves.

## 4. Deploying

Two files tell the host what to do, and nothing in a build, a test or a page
load reads either of them.

`netlify.toml` carries the build command, the `dist/` publish directory, the
node version, and the redirect table: a 404 for `/assets/*`, then the SPA
fallback for everything else, in that order.

`public/_headers` carries the CSP for every path, and the one-year immutable
cache for `/assets/*` alone.

The order, the absence of forcing on either rule and the cache are held by
`npm run check:hosting`; what each failure means, and why each rule reads the
way it does, is in [engineering/checks.md](../engineering/checks.md).

Any static host works; the same two rules have an equivalent everywhere.
Live-database mode needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **at
build time**. Blueprint-specific gotchas are in
[`skills/map/references/deploy-notes.md`](../../skills/map/references/deploy-notes.md).

### Serving from a path

By default the app is served from the root of a domain. To serve it under a
path instead, such as `https://example.org/demo/`, set one build-time
variable, `BASE_PATH`, and nothing else. A host's build settings are enough,
or the configuration file:

```toml
# netlify.toml
[build.environment]
  NODE_VERSION = "22"
  BASE_PATH = "/demo/"
```

Unset or `/`, nothing changes: the output is `dist/`, and every URL is what it
was. Set, three things follow from the one value:

- **The build is written under the path.** The output lands in `dist/demo/`
  (its `index.html`, its `assets/` and the `public/` files beside them), so
  every file sits at the URL the browser asks for. The publish
  directory stays `dist`. `_headers` and `_redirects` are moved back up to
  `dist/`, the only place a host reads them.
- **Every URL the app reads or writes keeps the prefix.** The board address,
  deep links, the service slug in the path, the magic-link redirect, and
  root-relative image paths stored in the data (`/cover/…`, touchpoint logos)
  all resolve under `/demo/`. `src/lib/basePath.ts` is where they cross it.
- **The build writes the hosting rules for the path.** `netlify.toml` stays
  written for the root, and the build puts the prefixed rules in
  `dist/_redirects`, which a host reads before it:

```
/  /demo/  301
/demo/assets/*  /demo/assets/:splat  404
/demo/*  /demo/index.html  200
```

The site root goes on to the app, a hashed chunk the deploy no longer ships
answers 404, and every other path under the prefix is the app. In
`dist/_headers` the year-long cache moves from `/assets/*` to
`/demo/assets/*` (the `/*` CSP block already covers the path).
`npm run check:hosting -- --built` reads both files back after a build and
holds them to the same order and cache as the committed ones.

A `public/_redirects` of your own is kept, above the generated rules, so a
rule in it for a path of its own (`/old`, `/demo/api/*`) still applies. A line
that states one of the generated rules exactly is dropped, since the build
writes it below. Any other rule that answers `/`, the prefix itself, or every
path under it — through a splat or a `:placeholder`, as `/*`, `/demo/*` or
`/demo/:slug` do — would answer in place of the generated ones, and the build
refuses it with one line naming it. `npm run check:hosting` finds the same
line before a build does.

**Writing the rules by hand.** A deployment that prefers its rules in
`netlify.toml` can still write them there. `npm run check:hosting` reads
`BASE_PATH` (from the environment, or from `[build.environment]` above), and
holds a table that names the prefix to the whole prefixed set — the same
order and cache:

```toml
[[redirects]]
  from = "/"
  to = "/demo/"
  status = 301

[[redirects]]
  from = "/demo/assets/*"
  to = "/demo/assets/:splat"
  status = 404

[[redirects]]
  from = "/demo/*"
  to = "/demo/index.html"
  status = 200
```

and, in `public/_headers`, the long cache moves to `/demo/assets/*`:

```
/demo/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

The build still writes `dist/_redirects`, with the same rules, and leaves
headers that already name `/demo/assets/*` as they are.

**Behind a proxy on another site.** When the path belongs to a different
site (a marketing site that shows the app at `/demo/`), build and deploy the
app on its own site exactly as above, with the same `BASE_PATH`. Then add one
rewrite to the other site's `netlify.toml`:

```toml
[[redirects]]
  from = "/demo/*"
  to = "https://your-app-site.netlify.app/demo/:splat"
  status = 200
  force = true
```

The proxy forwards the path unchanged. Because the app's files already sit
under `/demo/` on its own site, the same request works both ways: directly at
`https://your-app-site.netlify.app/demo/…` and through the proxy at
`https://example.org/demo/…`. That rule is forced because the other site may
have files of its own under the path. It lives in the other site's
configuration, not in this template's `netlify.toml`, so `check:hosting` never
reads it.

With a database behind the app, add the prefixed URL to the Supabase
project's redirect allow-list, so a magic link lands back on the app. A magic
link returns to the origin it was sent from, so when the app is reachable
both ways, list both: `https://example.org/demo/` for the proxy, and
`https://your-app-site.netlify.app/demo/` for the site itself.

Nothing is served at the app site's own root any more, and the generated
redirect sends `/` there on to `/demo/`. A local build under a
path empties only `dist/demo/`, so delete `dist/` first if an earlier root
build left files beside it. The render walk runs over a prefixed build
too: build with `BASE_PATH=/demo/`, then run `BASE_PATH=/demo/ npm run
check:render-walk`
([render-walk/README.md § Served from a path](../../render-walk/README.md#served-from-a-path)).
