import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * The browser render walk — this repository's, and a deployment's.
 *
 * Every other guard in this tree reads a file, a schema or a module graph.
 * None of them opens the application in a browser, and the two findings
 * recorded in `docs/adr/0017-large-component-splits-wait-for-an-end-to-end-
 * round.md` are what that costs: a renamed at-rule whose whole block the
 * browser dropped, and a lane chip that set `backgroundColor` to a role key
 * rather than a colour. Both looked right in the source, both passed every
 * check, and both were broken from the day they shipped.
 *
 * So this config drives Chromium over the built distribution, previewed, with
 * no database configured — the bundled sample board — and walks every phase,
 * every scenario, every path, and every layout the scenario offers.
 *
 * ── WHY THE CONFIG RESOLVES ITS OWN DIRECTORY ──────────────────────────────
 *
 * `render-walk/` is a published path (`docs/adr/0004-reference-paths-are-a-
 * published-interface.md`, and `CONSUMER_IMPORTS` in
 * `scripts/check-reference-paths.mjs` lists all seven of its files). A
 * deployment that installs this package enrols by running `run.mjs` beside
 * this file, from its own root:
 *
 *   node node_modules/uno-blueprint/render-walk/run.mjs
 *
 * That runner copies this directory out of `node_modules` first and hands
 * Playwright the copy, because NEITHER LOADER WILL COMPILE A TYPESCRIPT FILE
 * THAT LIVES UNDER `node_modules` — Playwright's transform hook declines the
 * path and Node's type stripping refuses it outright, neither is configurable,
 * and both rules cover the specs as well as this file. `run.mjs` carries that
 * account in full; what matters here is that the config is read from the copy,
 * at the root of the tree being walked.
 *
 * `testDir` is THIS file's own directory rather than a root, because the specs
 * that travel with this config are the subject wherever the config is read
 * from — staged beside it, or here in this repository — and a `rootDir` would
 * name the deployment's tree and find nothing.
 *
 * ── WHAT THE PREVIEW SERVES ────────────────────────────────────────────────
 *
 * `cwd: process.cwd()` — the run's own root, not the directory this config was
 * staged from. A deployment's `npm run preview` serves its own `dist`, so the
 * walk reads ITS sample board rather than ours. It derives every phase,
 * scenario and path from the rendered page for the same reason: importing
 * `src/data/sampleBlueprint.ts` would hold every deployment to this
 * repository's content.
 *
 * `reuseExistingServer` is false in both places. A preview left running from
 * an earlier build serves an earlier `dist`, and a walk over a stale bundle is
 * a green run that says nothing about the code in the working tree. With
 * `--strictPort` beside it that makes a busy port an ABORT rather than a
 * reuse: if something else already holds the port, the run says so instead of
 * quietly walking whatever that something is serving.
 *
 * ── WHERE THE PORT COMES FROM ──────────────────────────────────────────────
 *
 * `RENDER_WALK_PORT`, and this file does not choose. `run.mjs` decides the
 * port before it starts Playwright — the default below if nothing holds it,
 * the next free port above it otherwise — and sets the variable to what it
 * chose, so two walks running at once preview on ports of their own rather
 * than fighting over one. Its header says why that belongs to the runner.
 *
 * The constant below is therefore the FALLBACK, for the one path the runner is
 * not on: Playwright pointed at this config by hand. That path keeps a fixed
 * port, and the abort above is what a held one gets there — named, with no
 * test run, which is the honest end of a walk that has nowhere to preview.
 *
 * The deployment's `preview` script has to accept `--port` and `--strictPort`,
 * which Vite's own does; see `render-walk/README.md` § Enrolling a deployment.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url))

const PREVIEW_PORT = Number(process.env.RENDER_WALK_PORT || 4173)
if (!Number.isInteger(PREVIEW_PORT) || PREVIEW_PORT < 1 || PREVIEW_PORT > 65535) {
  throw new Error(
    `render-walk: RENDER_WALK_PORT is not a port number: ${JSON.stringify(process.env.RENDER_WALK_PORT)}`,
  )
}

/**
 * The prefix the build under walk was served from — `BASE_PATH`, the same
 * variable the build read, so a walk run in the environment that built `dist`
 * previews it where it was built to live. Unset, it is the root and the walk
 * is the one it always was.
 *
 * The specs navigate RELATIVE to this (`./`, `./?phase=…`), never to `/`:
 * Playwright resolves a leading slash against the origin, which would step
 * out of the prefix and walk nothing. `served-from-a-path.spec.ts` is the case
 * that holds the prefix itself — see `render-walk/README.md` § Served from a
 * path. The rule for the value is `src/lib/basePath.ts`'s, stated inline
 * because this file is staged and run away from the application.
 */
export const BASE_PATH = (() => {
  const value = (process.env.BASE_PATH ?? '').trim()
  // A `.` or `..` segment anywhere is refused too: a prefix that climbs names
  // a folder outside the build, and the build clears the folders it names.
  const climbs = value.split('/').some((segment) => segment === '.' || segment === '..')
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.startsWith('.') ||
    climbs ||
    /[?#]/.test(value)
  ) {
    throw new Error(`render-walk: BASE_PATH must be a path such as /demo/, not ${JSON.stringify(value)}`)
  }
  const segments = value.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
})()

const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}${BASE_PATH}`

/**
 * Everything the run writes, under the root it was started from — not under
 * `node_modules`, where an enrolled deployment would never look for it and a
 * reinstall would wipe it. `.gitignore` covers it here; CI uploads it whole.
 */
export const OUTPUT_DIR = join(process.cwd(), 'render-walk-output')

/** One screenshot per view. The spec takes them; see `screenshot: 'off'`. */
export const VIEW_SCREENSHOT_DIR = join(OUTPUT_DIR, 'views')

export default defineConfig({
  testDir: HERE,
  outputDir: join(OUTPUT_DIR, 'test-results'),
  // One walk, in order, in one browser. The views share a page and a console
  // listener, and the address a console error appeared on is the whole report.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  // The walk is one test over every view of the board, so its budget is the
  // whole walk's rather than one navigation's.
  timeout: 10 * 60 * 1000,
  reporter: [['list']],
  use: {
    baseURL: PREVIEW_URL,
    // A bounded wait per action. Unbounded, one control that never becomes
    // clickable spends the whole walk's budget in a retry loop and the run
    // reports a timeout rather than the control it was waiting on.
    actionTimeout: 15 * 1000,
    // The spec takes its own, one per view, under a name that states the
    // address. Playwright's automatic capture would file them by test name,
    // and there is one test.
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Wider than the device default: a merged board with several paths
        // has more columns than a 1280px viewport shows, and a screenshot
        // nobody can read the right-hand edge of is half a screenshot.
        viewport: { width: 1600, height: 1000 },
      },
    },
    {
      name: 'mobile',
      testMatch: /mobile-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: PREVIEW_URL,
    cwd: process.cwd(),
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
