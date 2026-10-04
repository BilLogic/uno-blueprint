import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'

/**
 * Every view of the bundled sample board, opened in a browser.
 *
 * ── WHAT THIS SEES, AND WHAT IT DOES NOT ───────────────────────────────────
 *
 * It sees a console error, a page error, and a board that came up empty — a
 * spinner that never resolved, an error boundary, a grid with no lanes. Those
 * are the states where the app is broken and every file-reading guard is
 * green, which is the class ADR 0017 names.
 *
 * It does not see a wrong colour, a chip that lost its tint, a rule the
 * browser dropped without complaint. Nothing asserts that a pixel is the
 * right pixel. That half is the screenshots: one per view, named for the
 * address, uploaded by CI, read by a person.
 *
 * ── WHY THE INVENTORY COMES OFF THE PAGE ───────────────────────────────────
 *
 * The phases, the scenarios and the paths are read out of the rendered app —
 * the sidebar's rows and the path selector — and never imported from
 * `src/data/sampleBlueprint.ts`. A deployment enrols this same file against
 * its own `dist` (see the config's header), and its sample board is its own.
 * An inventory compiled in would walk our content over their build, which is
 * a walk that proves nothing about either.
 *
 * Once the ids are known the walk navigates by URL. The board's address is
 * four query params — `phase`, `scenario`, `paths` (repeated), `view` — owned
 * by `src/lib/boardAddress.ts`, and going through the address bar is what
 * makes each view a place a reader can be sent to rather than a sequence of
 * clicks that only this file knows how to reproduce.
 *
 * ── WHAT THIS BORROWS FROM THE APP ─────────────────────────────────────────
 *
 * This file reads `data-nav-row`, `data-cover-page`, the `phase-panel-<id>`
 * region ids, `data-focus-slide-id`, `data-blueprint-cell`,
 * `data-blueprint-column-header`, `data-blueprint-row-header`, and the
 * `Paths shown: …` and `Path display` aria-labels. The app grew them for CSS,
 * annotation and scrolling, not as a test contract — renaming one here is
 * cheap and renaming one there breaks this walk, so the list is written out in
 * `render-walk/README.md` § What the walk reads off the app.
 */

/** The board address's param names — `BOARD_PARAMS` in `boardAddress.ts`. */
const PARAM = {
  phase: 'phase',
  scenario: 'scenario',
  paths: 'paths',
  view: 'view',
} as const

type Layout = 'stacked' | 'merged'

type Scenario = { id: string; title: string }
type Phase = { id: string; title: string; scenarios: Scenario[] }

/** One addressable board: a scenario, a path selection, a layout. */
type View = {
  phase: Phase
  scenario: Scenario
  layout: Layout
  /** Path identities (`kind:name`); empty means the scenario's own default. */
  pathKeys: string[]
}

/** A console error or a page error, with the address it appeared on. */
type Problem = { address: string; detail: string }

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'untitled'
  )
}

function boardAddress(view: Pick<View, 'phase' | 'scenario' | 'layout' | 'pathKeys'>): string {
  const params = new URLSearchParams()
  params.set(PARAM.phase, view.phase.id)
  params.set(PARAM.scenario, view.scenario.id)
  for (const key of view.pathKeys) params.append(PARAM.paths, key)
  params.set(PARAM.view, view.layout)
  return `./?${params.toString()}`
}

function screenshotName(view: View): string {
  const paths = view.pathKeys.length > 0 ? view.pathKeys.join('+') : 'default'
  return [
    slug(view.phase.title),
    slug(view.scenario.title),
    view.layout,
    slug(paths),
  ].join('--')
}

/** The label button of a sidebar row; the chevron beside it is its sibling. */
function rowLabel(row: Locator): Locator {
  return row.locator('button:not([aria-expanded])')
}

/**
 * The phases and their scenarios, read from the sidebar.
 *
 * A phase row is one carrying a chevron over a `phase-panel-…` region; its
 * scenarios are the rows inside that region, and they are only in the DOM
 * once it is expanded. Expanding is one click per phase, and the loop takes
 * the first still-collapsed row each time rather than holding a list across
 * clicks that rebuild it.
 */
async function readInventory(page: Page): Promise<Phase[]> {
  // The cover page first. An address that names no board opens on the cover,
  // which is a full-height overlay over the canvas: the sidebar is drawn
  // behind it and every click on it lands on the cover instead. Its one
  // action — the heading's button, whose LABEL a deployment writes for
  // itself — is the way through, so this reaches for the position rather
  // than the words.
  // The shell must have drawn before the cover is asked about. `count()`
  // answers at once, and on a slow first paint it answers zero before the
  // cover exists: the click is skipped, the cover then lands over the
  // sidebar, and every click meant for a chevron hits the cover instead.
  // Either the cover or a sidebar row is proof the shell is up.
  await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
  const coverCta = page.locator('[data-cover-page] header button')
  if ((await coverCta.count()) > 0) {
    await coverCta.first().click()
    await expect(page.locator('[data-cover-page]')).toHaveCount(0)
  }

  const phaseRows = page.locator('[data-nav-row]:has(button[aria-controls^="phase-panel-"])')
  await expect(phaseRows.first()).toBeVisible()

  const phaseCount = await phaseRows.count()
  for (let index = 0; index < phaseCount; index += 1) {
    const chevron = phaseRows.nth(index).locator('button[aria-controls^="phase-panel-"]')
    if ((await chevron.getAttribute('aria-expanded')) === 'false') {
      await chevron.click()
      await expect(chevron).toHaveAttribute('aria-expanded', 'true')
    }
  }

  const phases: Phase[] = []
  for (let index = 0; index < phaseCount; index += 1) {
    const row = phaseRows.nth(index)
    const id = await row.getAttribute('data-nav-row')
    expect(id, 'a sidebar phase row states its id').toBeTruthy()
    const title = ((await rowLabel(row).innerText()) || '').trim()

    const panel = page.locator(`[id="phase-panel-${id}"]`)
    const scenarioRows = panel.locator('[data-nav-row]')
    const scenarios: Scenario[] = []
    for (let scenarioIndex = 0; scenarioIndex < (await scenarioRows.count()); scenarioIndex += 1) {
      const scenarioRow = scenarioRows.nth(scenarioIndex)
      const scenarioId = await scenarioRow.getAttribute('data-nav-row')
      expect(scenarioId, 'a sidebar scenario row states its id').toBeTruthy()
      scenarios.push({
        id: scenarioId as string,
        title: ((await rowLabel(scenarioRow).innerText()) || '').trim(),
      })
    }

    phases.push({ id: id as string, title, scenarios })
  }

  expect(phases.length, 'the sample board has phases').toBeGreaterThan(0)
  // Per phase, not repo-wide. A phase whose panel yielded no scenario rows
  // contributes no views and, under a total that only has to clear zero, is
  // skipped in silence — a render walk of nothing wearing a green tick, which
  // is the shape this file exists against. Whether the panel is genuinely
  // empty or the rows failed to render, the walk stops and says which phase.
  const emptyPhases = phases.filter((phase) => phase.scenarios.length === 0)
  expect(
    emptyPhases.map((phase) => `${phase.title} (${phase.id})`),
    'every phase on the sample board offers at least one scenario to walk',
  ).toEqual([])
  return phases
}

/**
 * Every path identity this scenario offers, as the address spells them.
 *
 * Read by turning the selector's options all on and taking the keys out of
 * the URL the app then writes — the picker shows a path's NAME and the
 * address carries `kind:name`, and only the app knows which kind a name is
 * under. An address that states the scenario's own default states no `paths`
 * at all (`boardAddress.ts`: absent means "whatever this board says about
 * itself"), so a scenario with one path, selected, yields no keys. That empty
 * list is the answer, and it addresses the same board.
 */
async function readPathKeys(page: Page): Promise<string[]> {
  const trigger = page.locator('[aria-label^="Paths shown:"]')
  await expect(trigger, 'the scenario board offers a path selector').toHaveCount(1)
  await trigger.click()

  // Scoped to THIS popover rather than the page: `li button[aria-pressed]` is
  // a shape several menus in the app take, and a page-wide list would toggle
  // whatever else happened to be open. The trigger names its own popup in
  // `aria-controls` while it is open, which is the one link between the two
  // that does not depend on where the portal put the content.
  const popupId = await trigger.getAttribute('aria-controls')
  expect(popupId, 'the open path selector names its popover').toBeTruthy()
  const options = page.locator(`[id="${popupId}"] li button[aria-pressed]`)
  await expect(options.first()).toBeVisible()
  const count = await options.count()
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    if ((await option.getAttribute('aria-pressed')) !== 'true') {
      await option.click()
      await expect(option).toHaveAttribute('aria-pressed', 'true')
    }
  }

  await page.keyboard.press('Escape')
  await expect(options.first()).toBeHidden()

  const keys = new URLSearchParams(new URL(page.url()).search).getAll(PARAM.paths)
  return keys.filter((key) => key.length > 0)
}

/**
 * Wait until the board has stopped arriving: the camera has landed and the
 * cells have their content.
 *
 * Two things move after the grid is in the DOM. Opening a board flies the
 * canvas to it, so an early screenshot catches the board correct and two
 * hundred pixels wide in a corner. And the cells fill in after their frame
 * is laid out, so an early screenshot catches a grid of empty boxes — which
 * is also exactly what a genuinely broken board looks like.
 *
 * Settled means the artboard's box AND the number of cells carrying text are
 * the same across two consecutive reads. There is no event to listen for,
 * and `networkidle` says nothing: none of this is a request.
 *
 * Returns how many cells hold content, which the caller asserts on.
 *
 * The deadline is a FAILURE, not a reading. Returning the last count at 20s
 * would let a board that never stops moving pass on whatever one cell happened
 * to hold at that moment, which is the silent-pass shape this whole file
 * exists against — so the timeout throws, naming the scenario and the address.
 */
async function waitForBoardSettled(
  board: Locator,
  scenarioTitle: string,
  address: string,
): Promise<number> {
  const deadline = Date.now() + 20 * 1000
  let previous = ''
  while (Date.now() < deadline) {
    const box = await board.boundingBox()
    const filled = (await board.locator('[data-blueprint-cell]').allInnerTexts()).filter(
      (text) => text.trim().length > 0,
    ).length
    const current = box ? `${box.x}:${box.y}:${box.width}:${box.height}:${filled}` : ''
    if (current !== '' && current === previous) return filled
    previous = current
    await board.page().waitForTimeout(150)
  }
  throw new Error(
    `the board for ${scenarioTitle} never settled within 20s at ${address}: ` +
      `last reading ${previous || '(no box)'} (box x:y:width:height:filled cells)`,
  )
}

/**
 * The board rendered content, rather than a spinner, an empty grid or the
 * boundary.
 *
 * Scoped to the addressed scenario's own artboard: the canvas draws every
 * scenario of the service and navigation moves the camera, so a count taken
 * over the page would be satisfied by any other board on it.
 */
async function expectBoardRendered(page: Page, view: View): Promise<void> {
  await expect(
    page.getByText('Something went wrong'),
    'no error boundary on this board',
  ).toHaveCount(0)

  const board = page.locator(`[data-focus-slide-id="${view.scenario.id}"]`)
  await expect(board, `the board for ${view.scenario.title}`).toBeVisible()

  // A grid of empty boxes is the shape a broken board takes — the frame is
  // laid out from the structure and the content is what fails to arrive.
  const filledCells = await waitForBoardSettled(board, view.scenario.title, boardAddress(view))
  expect(filledCells, 'the board’s cells carry content').toBeGreaterThan(0)

  await expect(
    board.locator('[data-blueprint-column-header]').first(),
    'the board has step headers',
  ).toBeVisible()

  expect(
    await board.locator('[data-blueprint-cell]').count(),
    'the board has cells',
  ).toBeGreaterThan(0)

  const laneLabels = (await board.locator('[data-blueprint-row-header]').allInnerTexts())
    .map((text) => text.trim())
    .filter(Boolean)
  expect(laneLabels.length, 'the board has lanes, and they are labelled').toBeGreaterThan(0)

  // The address resolved to the board it named. A scenario id the app cannot
  // resolve degrades to its phase and then to the overview, which still draws
  // a grid — so without this a stale id reads as a pass.
  expect(
    new URL(page.url()).searchParams.get(PARAM.scenario),
    'the address still names this scenario',
  ).toBe(view.scenario.id)

  // The layout, where the app offers the control. It appears from two
  // selected paths up — below that there is nothing to lay out two ways.
  const layoutControl = page.locator('[aria-label="Path display"]')
  if ((await layoutControl.count()) > 0) {
    const segment = layoutControl.locator(
      `[aria-label="${view.layout === 'merged' ? 'Merged' : 'Stacked'}"]`,
    )
    await expect(segment, 'the layout the address asked for is the one shown').toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
}

test.describe('the bundled sample board', () => {
  test('renders every phase, scenario, path and layout without a console error', async ({
    page,
    remoteRequests,
  }) => {
    mkdirSync(VIEW_SCREENSHOT_DIR, { recursive: true })

    /**
     * The guard, watched failing.
     *
     * A run that reports no console errors looks identical whether the app is
     * clean or the listener was never wired up. CI runs this walk twice: once
     * with this variable set, asserting the exit code is non-zero, and once
     * for real. See the `render-walk` job in `.github/workflows/ci.yml`.
     */
    if (process.env.RENDER_WALK_INJECT_CONSOLE_ERROR) {
      await page.addInitScript(() => {
        console.error('render-walk self-test: injected')
      })
    }

    const problems: Problem[] = []
    let address = './'
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push({ address, detail: `console.error: ${message.text()}` })
      }
    })
    page.on('pageerror', (error) => {
      problems.push({ address, detail: `pageerror: ${error.message}` })
    })

    const assertNoProblems = () => {
      if (problems.length === 0) return
      const lines = problems.map((problem) => `  ${problem.address}\n    ${problem.detail}`)
      throw new Error(
        `${problems.length} browser error${problems.length === 1 ? '' : 's'} while walking the sample board:\n${lines.join('\n')}`,
      )
    }

    address = './'
    await page.goto(address)

    const phases = await readInventory(page)

    // NO DATABASE, and the app says so. Asserted on the top nav after the
    // cover is dismissed so the cover's "Sample data shown." line cannot
    // match the same locator. `isSupabaseConfigured()` in `src/lib/supabase.ts`
    // reads `VITE_SUPABASE_URL` at BUILD time, so a `.env` holding real values
    // bakes them into `dist` and the preview then serves somebody's live rows.
    // That walk would be measuring a database's content, and it would go red
    // or green for reasons nothing in this repository controls. Build with
    // the variables cleared — see `render-walk/README.md`.
    await expect(
      page.locator('[data-editor-top-nav]').getByText('sample data', { exact: true }),
      'the preview is in no-database mode, showing the bundled sample board',
    ).toBeVisible()
    assertNoProblems()

    // The palette, opened by its chord and driven by the keyboard alone.
    // With an empty query its first row is a scenario, so Enter has to land
    // the board's address on one — which is the whole claim the surface
    // makes and the one thing no render test of it can see.
    await test.step('the Jump to… palette opens on ⌘K and Enter opens its first row', async () => {
      const addressBefore = page.url()
      await page.keyboard.press('ControlOrMeta+k')
      const palette = page.getByRole('dialog', { name: 'Jump to…' })
      await expect(palette, 'the palette opened, and it is named').toBeVisible()
      await page.keyboard.press('Enter')
      await expect(palette).toBeHidden()
      await expect
        .poll(
          () => new URLSearchParams(new URL(page.url()).search).get(PARAM.scenario),
          { message: 'Enter on the first row opened a scenario' },
        )
        .not.toBeNull()
      expect(page.url(), 'the address moved').not.toBe(addressBefore)
      assertNoProblems()
    })

    const views: View[] = []
    for (const phase of phases) {
      for (const scenario of phase.scenarios) {
        address = boardAddress({ phase, scenario, layout: 'stacked', pathKeys: [] })
        await page.goto(address)
        await expectBoardRendered(page, { phase, scenario, layout: 'stacked', pathKeys: [] })
        const pathKeys = await readPathKeys(page)
        assertNoProblems()

        // Every layout the scenario OFFERS, which is not always two. Stacked
        // shows one path at a time — that is the layout's whole claim — so it
        // gets one view per path. Merged shows them together, and below two
        // paths there is nothing to lay out two ways: the app hides the
        // control, and a `merged` address for a single-path scenario differs
        // from its `stacked` one by the `view=` param alone. That pair is one
        // board walked twice and one screenshot filed twice, so the merged
        // view is added only from two paths up.
        const stacked = pathKeys.length > 0 ? pathKeys.map((key) => [key]) : [[]]
        for (const selection of stacked) {
          views.push({ phase, scenario, layout: 'stacked', pathKeys: selection })
        }
        if (pathKeys.length >= 2) {
          views.push({ phase, scenario, layout: 'merged', pathKeys })
        }
      }
    }

    for (const view of views) {
      address = boardAddress(view)
      await test.step(`${view.scenario.title} — ${view.layout} — ${address}`, async () => {
        await page.goto(address)
        await expectBoardRendered(page, view)
        await page.screenshot({
          path: join(VIEW_SCREENSHOT_DIR, `${screenshotName(view)}.png`),
        })
        assertNoProblems()
      })
    }

    // Said out loud so the run's log states what it covered. A walk that
    // silently visited three views reads exactly like one that visited forty.
    console.log(
      `render-walk: ${views.length} views over ${phases.length} phases and ` +
        `${phases.reduce((total, phase) => total + phase.scenarios.length, 0)} scenarios; ` +
        `screenshots in ${VIEW_SCREENSHOT_DIR}`,
    )
    // And what it did not fetch — why is `render-walk/README.md` § No image from a live bucket.
    console.log(remoteRequests.summary())
  })
})
