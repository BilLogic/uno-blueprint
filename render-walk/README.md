---
summary: The browser render walk — Chromium over the built distribution in no-database mode, every phase, every scenario, every path and every layout the scenario offers, plus the annotation-drag case that draws, drags and captures a mark with real mouse moves and the phone agent-jump case that moves the camera from the ✦ sheet with the provider answered from the spec, failing on a console error and filing one screenshot per view; what it borrows from the app's markup, how this repository runs it, and how a deployment enrols by running the runner that ships beside them out of its own node_modules.
---

# The browser render walk

**For** anyone whose render walk just went red, and any deployment that wants
the same walk over its own board.
**Answers** what does this open, what does it catch, and how do I run it?

Every other guard in this repository reads a file, a schema or a module graph.
This one opens the application in a browser.

It builds nothing itself. It previews the built distribution, walks the bundled
sample board and fails on any `console` error or page error, naming the address
it appeared on. Each view is screenshotted under a name that states its
address.

## What a view is

Every phase, every scenario inside it, and then, per scenario, every layout
that scenario actually offers:

- **stacked, once per path.** Showing one path at a time is the layout's whole
  claim, so a scenario with three paths is three views. A scenario the app
  gives no path selector is one view, addressed with no `paths` at all.
- **merged, once — and only from two paths up.** Below two there is nothing to
  lay out two ways: the app hides the layout control, and a `merged` address
  for a single-path scenario is byte-identical to its `stacked` one apart from
  `view=`. Walking it would be the same board twice and the same screenshot
  filed under two names.

So the count is *paths per scenario*, summed, plus one for each scenario with
two or more paths — not *scenarios × 2*. The walk prints it at the end of the
run.

## The phone walk

`mobile-cover.spec.ts` is a second Playwright project at **375×812**. It opens
the cover, follows the CTA onto the first scenario, then walks **one scenario
per phase**, screenshotting each under `render-walk-output/views/mobile/`. It
fails on a console error the same way the desktop walk does, so a blank phone
canvas is a red check rather than a screenshot nobody looks at.

The desktop project ignores the phone specs; the mobile project runs only
those. `npm run check:render-walk` runs both projects.

## The phone agent-jump case

`mobile-agent-jump.spec.ts` runs in the phone project, at the same 375×812.

It is the browser half of `npm run slice:phone-agent-jump`. That slice runs
the whole flow in jsdom in well under a second, with the clock turned by hand
and a dozen lines standing in for the viewport, so three of its claims are not
its to make: that the fit lands inside the navigation tool's 1800 ms deadline
on a real device, that the strip of canvas the sheet leaves is legible through
its wash, and that the destination is visibly inside that strip. This case is
those three.

The agent is driven without a model. The provider endpoint is intercepted and
answered with one canned round — a `tool_use` for `open_scenario` naming a
scenario read off this board's own drawer, then one text turn — and
everything after the response body is the shipped code: the loop, the tool
registry, the navigation tool, the phone's bridge, the shell and the real
viewport. The key is a string this spec seeds into `localStorage` and reaches
no network, because no request leaves the page. That seed is the one thing in
this directory that has to know an installation's storage prefix, which is
`ub-` here and `RENDER_WALK_STORAGE_PREFIX` for a deployment that renamed its
namespace.

What it asserts: the sheet is still up with the conversation in it after the
jump; the tool's own answer in the transcript is the settled sentence rather
than its timeout one, which IS the deadline measured on a real clock; the
destination artboard reaches into the strip above the sheet and cells of it
with words in them are wholly inside it; and the wash over that strip carries
no blur and is a minority of the colour. It screenshots the landed jump to
`render-walk-output/views/mobile/agent-jump.png`, which is the half a person
reads.

The console-error rule below covers this case too, self-test included.

## The annotation-drag case

`annotation-drag.spec.ts` runs beside the walk under the same config, so
`npm run check:render-walk` is four cases rather than one.

It is the browser half of `npm run slice:annotation-drag`. That slice runs the
whole annotation-drag flow in jsdom in a few hundred milliseconds, and stubs
exactly three things — layout, the canvas's live CSS-transform camera, and
pointer capture — because jsdom can do none of them. This case is those three,
unstubbed: it opens the first scenario of the first phase, picks the rectangle
from the real toolbar, draws a box across two cells of one lane with real mouse
moves (the sample board's camera is around 0.47, so every client pixel is more
than two board units), drags that box onto a third cell under a real pointer
capture, and asserts the captured cell ids.

The read-back is the capture menu's **own** download — the `Save N marks` item,
whose JSON carries each mark's `overlaps`. Nothing was added to the app to make
it observable. The menu's other item, **Send to the agent**, is absent here
because it is gated on `canWrite` and this preview has no database configured;
that attachment is the slice's read-back, and both go through the same
`captureMarks` over the same cell rects.

The console-error rule below covers this case too, including the
`RENDER_WALK_INJECT_CONSOLE_ERROR` self-test. It screenshots the dragged mark to
`render-walk-output/annotation-drag.png`.

## Served from a path

`served-from-a-path.spec.ts` holds the app inside the path it is served from.
It opens the app, lands a board through the Jump to… palette, and asserts that
the address a reader would share carries the prefix, that a cold load of that
address comes back to the same board, and that no request the page makes to
its own host falls outside the prefix or fails.

At the root that is a cheap reload check. It earns its place under a prefix,
and CI runs the whole walk a second time over a build with `BASE_PATH=/demo/`:

```bash
BASE_PATH=/demo/ VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build
BASE_PATH=/demo/ npm run check:render-walk
```

The config reads the same `BASE_PATH` the build read and previews at
`http://localhost:<port>/demo/`. `vite preview` reads no `_redirects`, so a
cold load here is answered by the preview's own fallback, not by the rules a
host would use. Those rules — the ones the build writes into
`dist/_redirects` — are read back by `npm run check:hosting -- --built`, which
CI runs over the same build, and
`scripts/tests/a-path-build-writes-its-hosting-rules.test.mjs` resolves them
the way a host does: a deep link reaches the app, `/` goes on to `/demo/`, and
a missing chunk answers 404. Every spec navigates relative to that (`./`,
`./?phase=…`), never to `/`, because Playwright resolves a leading slash
against the origin and would step out of the prefix. Under a prefix, the rest
of the walk also catches a stored image path that lost the prefix: the request
404s, and the browser logs that as a console error.

A deployment served from a path enrols the same way. It runs the walk with its
own `BASE_PATH` set, over a build made with it.

## No image from a live bucket

A walk that runs on every push must not spend a deployment's storage egress.
A no-database build draws a board exported from the live one, and that
board's attachment and frame image URLs still point at the bucket they were
uploaded to, so a walk that fetched them would download every one of them from
the deployment's storage on every run. Measured on one deployment, that was
about 13,000 image requests a day from CI runners against about 250 from
people reading the board, enough on a free plan to use up the storage egress
quota. The walk asserts that a board renders without a console error; it
asserts nothing about the pixels of an attachment.

So every spec takes its `test` from `remote-images.ts`, which routes the
browser context before the first navigation:

- **An image bound for another origin** is answered in the runner with a 1×1
  PNG built into that file. It is answered rather than aborted, because a
  failed image load is a console error and the walk counts those.
- **Anything else bound for another origin** goes through untouched, and its
  host is recorded.
- **The served origin** is never touched, so the app's own assets load as
  themselves.

Any route turns off the browser's HTTP cache for the context it is on, which
costs nothing measurable over a preview on localhost. The config also blocks
service workers, because a deployment's worker would fetch around the route.

The view walk ends by printing how many image requests it answered locally
and any other cross-origin hosts it saw, so a new outside dependency shows up
in the log. `remote-images.spec.ts` puts remote images on the served page
itself and asserts they arrive as the placeholder with no request reaching the
network, beside an icon of the app's own that loads as itself. That proves the
route works even when a board has no remote image, like this repository's
sample board. `scripts/tests/the-walk-draws-no-remote-image.test.mjs` holds
the decision, the placeholder's bytes, and the rule that every spec imports
`test` from `remote-images.ts` rather than from `@playwright/test`. A spec
added later follows that rule.

## What it catches, and what it does not

It catches an error in the console, a page that threw, an error boundary, and a
board that came up without lanes, without step headers or with empty cells.
Those are the states where the app is broken and every file-reading guard is
green — the class
[ADR 0017](../docs/adr/0017-large-component-splits-wait-for-an-end-to-end-round.md)
records two of: a renamed at-rule whose whole block the browser dropped, and a
lane chip that set `backgroundColor` to a role key rather than a colour.

It does not catch a wrong colour. Nothing here asserts that a pixel is the
right pixel, and a chip that renders untinted renders. That half is the
screenshots, which CI uploads and a person reads.

Exploratory walks — "does this import look right, does this deploy look
right" — stay with the `render-checker` agent (`agents/render-checker.md`).
This file is the one that runs unattended.

## Running it here

```bash
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build
npm run check:render-walk
```

The build variables are cleared on purpose. `isSupabaseConfigured()` in
`src/lib/supabase.ts` reads `VITE_SUPABASE_URL` at BUILD time, and Vite bakes
whatever `.env` holds into `dist`. A developer with real values in `.env` who
builds without clearing them gets a preview wired to a live database, and the
walk then measures somebody's rows rather than the bundled sample. The walk
refuses that run: its first assertion is that the app shows the `sample data`
badge.

`npm run check:render-walk` runs `render-walk/run.mjs`, the same runner a
deployment calls out of its `node_modules` — it stages this directory into
`.render-walk-staged/` and hands Playwright the copy, so the enrolled path is
exercised here on every run. It starts its own preview and stops it again
(`reuseExistingServer: false`, so a preview left running from an older build
cannot be mistaken for this one).

## How the port is chosen

The walk asserts against whatever answers on its port, so the port is part of
the subject rather than a detail. It is decided once per run, by the runner,
before Playwright starts:

- **No `RENDER_WALK_PORT`** — 4173 if nothing answers there and no other walk
  has claimed it, otherwise the next free port above it, up to 4204. So
  your own `npm run preview` on 4173, or a second checkout walking at the same
  moment, moves this run along instead of stopping it: two walks started
  together take 4173 and 4174 and each walks its own `dist`. The run says
  which port it chose before it opens anything, and a machine with all
  thirty-two held is a refusal naming the range.
- **`RENDER_WALK_PORT=4273`** — that port and no other. You named it, so a walk
  elsewhere would not be the walk you asked for: if something is already
  listening there, or another walk has claimed it, the runner **refuses by
  name**, tells you how to find out whose it is (`lsof -i :4273`, on macOS and
  Linux), and starts nothing.

```bash
RENDER_WALK_PORT=4273 npm run check:render-walk
```

A port is *claimed* as well as tested, because a free port is not yet a bound
one: the two seconds Playwright spends starting up are two seconds in which a
second walk would read the same port as free. The claim is a file holding this
run's process id, `render-walk-port-<port>` in the system temporary directory,
removed on the way out; one left behind by a walk that was killed names a
process that is gone, and the next walk takes it over rather than believing it.

Either way the walk never reuses a server it did not start. What is already on
a port is somebody else's `dist` — an older build of this tree, or another
tree's altogether — and a green walk over it would be a statement about code
that is not in your working directory. Pointing Playwright at the config by
hand rather than through the runner keeps the fixed 4173, where
`reuseExistingServer: false` aborts on a held port, naming it, and runs no
tests.

Output — one screenshot per view, plus
Playwright's own artifacts — lands in `render-walk-output/`, which is
gitignored here and uploaded by CI.

To watch the guard fail, which is the only way to know it works:

```bash
RENDER_WALK_INJECT_CONSOLE_ERROR=1 npm run check:render-walk   # must exit 1
```

That variable makes the spec inject one `console.error` into every page. CI
runs the walk twice for this reason — once with it set, asserting a non-zero
exit, then once for real.

## Enrolling a deployment

These files are a published path, the same kind of promise as
`references/` and `skills/` —
[ADR 0004](../docs/adr/0004-reference-paths-are-a-published-interface.md), and
`CONSUMER_IMPORTS` in `scripts/check-reference-paths.mjs` lists the runner, the
config and both specs so a move here fails this repository's build rather than
yours. There is no `files` field in `package.json`, so nothing filters them out
of the package, and `exports` carries `"./*"`, so they are reachable by path.

From the root of a deployment that installs this package, one command:

```bash
node node_modules/uno-blueprint/render-walk/run.mjs
```

`npx render-walk` is the same thing through the bin the install links; put
either in your own `package.json` as `check:render-walk` and arguments pass
through (`npm run check:render-walk -- --headed`).

**You need no staging script of your own, and this is not the command earlier
releases gave.** Up to 1.44.9 the instruction was `npx playwright test -c
node_modules/…/render-walk/playwright.config.ts`, and it cannot work: neither
loader will compile a TypeScript file that lives under `node_modules`.
Playwright's transform hook declines any path with a `node_modules` segment, so
Node is handed raw TypeScript and throws `ERR_UNKNOWN_FILE_EXTENSION`; Node's
own type stripping refuses the same file with
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Neither rule is configurable and
both cover the specs as well as the config. So `run.mjs` copies this directory
out of `node_modules` into `.render-walk-staged/` at your root, byte for byte,
and points Playwright at the copy. It is rewritten from the installed package
on every run and read by nothing else, so it cannot drift from the version you
pinned — **add `.render-walk-staged/` to your `.gitignore`**. It is left behind
after the run because Playwright's trace viewer resolves a failing step back to
the spec file it ran.

The runner resolves Playwright out of **your** `node_modules` rather than
through `npx`, so a tree without it is told which version to install instead of
silently downloading some other one. The `webServer` runs `npm run preview` in
your working directory, so the preview serves your `dist`.

The walk's inventory — phases, scenarios, paths — is read off the rendered
page, never imported from `src/data/sampleBlueprint.ts`. Your sample board is
your own, and the walk is over whatever your build shows.

What your side has to provide:

- **`@playwright/test`**, pinned to the same version (`1.62.0` here).
- **The browser**: `npx playwright install chromium` (`--with-deps` on CI).
  Playwright looks for a build number tied to its own version, so the install
  has to be the one your pin asks for.
- **A build made with the Supabase variables cleared**, for the reason above.
- **A `preview` script that takes `--port` and `--strictPort`** — Vite's own
  does, since the config invokes it as
  `npm run preview -- --port <port> --strictPort`. You need no free port of
  your own: the runner finds one, as § How the port is chosen describes.
  `RENDER_WALK_PORT` still names one outright, and a port you name that is
  already held is refused rather than reused.
- **Both halves of your own offline board on the config** — `sample.nav` AND
  `sample.blueprints`. The walk reads its inventory off the rendered page, so
  what it opens is whatever your build shows: nav rows with no registry behind
  them are rows over an empty canvas, and the walk fails on the first board it
  asserts rather than on anything it can name. Both are generated in one run of
  `scripts/generate_fallbacks.py` with `--registry-out` and `--nav-out`, which
  write them as modules of your own that name their types by package name;
  `references/customization.md` § The offline board is two fields has the
  command and the shape.

  **Either form of that second field walks.** `sample.blueprints` takes the
  registry itself or a loader that fetches it
  (`() => import('./data/sampleBlueprints').then((m) => m.SAMPLE_BLUEPRINTS)`),
  and the walk cannot tell them apart: it opens the built preview and reads the
  page, and `DeploymentConfigProvider` renders nothing below it until a loader
  has answered — so by the time there is a cover to click past, the board
  behind it is whole. A no-database build is exactly the build a loader IS
  called in, which is what makes the walk the guard that exercises it. This
  repository's own board is a value, so the run above walks the eager form;
  `references/customization.md` § Eagerly or behind a loader says which to
  supply and why.

A deployment that wants this in its own CI can copy the `render-walk` job out
of `.github/workflows/ci.yml`; nothing in it changes — the job already calls
`npm run check:render-walk`, and this repository's own runs through the same
runner, so the enrolled path is the one CI here exercises.

## What the walk reads off the app

The walk drives the app through markup the app grew for its own reasons — CSS
hooks, annotation anchors, scroll targets, accessible names. None of it was
designed as a test contract, and nothing in the app's source says it is read
from here. It is listed so a rename knows what it breaks:

| What the walk reads | Where the app writes it |
| --- | --- |
| `[data-cover-page]`, and the `header button` inside it | the cover page; the walk clicks that button to get past the overlay |
| `aria-label="Open navigation"` and the sheet's `Close` | the phone top-bar menu opens the drawer; the sheet's own close dismisses it so the canvas is visible again |
| `[data-nav-row]` — value is the phase or scenario id | the sidebar's rows |
| `button[aria-controls^="phase-panel-…"]` and `id="phase-panel-<id>"` | the sidebar's phase disclosure and its panel |
| `[data-focus-slide-id="<scenario id>"]` | the canvas artboard for one scenario |
| `[data-blueprint-cell]`, `[data-blueprint-column-header]`, `[data-blueprint-row-header]` | the board grid |
| `aria-label^="Paths shown:"`, and the `aria-controls` it names while open | the path selector trigger and its popover |
| `aria-label="Path display"`, with `Stacked` / `Merged` inside it | the layout control |
| `[data-canvas-annotation-layer]` and `[data-annotation-id]` inside it | the annotation scratch layer and one mark on it — read by the annotation-drag case |
| `aria-label="Rectangle"`, `aria-label="Rectangle — Shapes tools"` | the annotation toolbar's Shapes slot: the face, and the face once the family holds the tool |
| `aria-label="Save or send these marks"`, and the `Save N marks` menu item | the capture menu's trigger and its download item |
| `[data-slot="sheet-content"]` and `[data-slot="sheet-overlay"]` | the bottom sheet's panel and its scrim — read by the phone agent-jump case for the strip it leaves |
| `aria-label="Ask the agent"`, `New session`, `textarea[data-agent-composer]`, `aria-label="Send"` | the phone's ✦ affordance and the agent panel's session, composer and send controls |
| the `Messages` region, and a tool row's own name inside it | the transcript, and the expandable row a tool call is disclosed from |
| the `Jump to…` dialog, opened by ⌘K | the top nav's Jump to… palette; the walk presses Enter on its first row |

Renaming one of these does not fail a type check or a lint rule; it fails this
walk, with a locator that found nothing. If you are the one renaming it, the
fix belongs here in the same change.
