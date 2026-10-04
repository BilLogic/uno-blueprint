import { expect } from '@playwright/test'
import { test } from './remote-images'
import { BASE_PATH } from './playwright.config'

/**
 * The app stays inside the path it is served from.
 *
 * A host may serve the build under a prefix — `https://host/demo/…` — rather
 * than at the root of a domain. Everything that reads or writes the address,
 * and every file the page asks for, then has to stay under that prefix: a
 * chunk, a font or a storyboard frame requested from `/assets/…` rather than
 * `/demo/assets/…` is a request to somebody else's site, and an address
 * written as `/?scenario=…` is a link that opens somebody else's page.
 *
 * So this case opens the app at the prefix, lands a board through the Jump
 * to… palette, and asserts the three things a reader of a prefixed deploy
 * meets first:
 *
 *   1. **The address a reader would share carries the prefix.** The board's
 *      address is the share link — there is no other — so the address bar
 *      after landing a board is what is asserted.
 *   2. **That address survives a reload.** A fresh load of it is a deep link:
 *      the host's fallback has to answer it with the app, and the app has to
 *      read the board back out of it. Here the preview's own fallback answers;
 *      the rules a host uses, which the build writes into `dist/_redirects`,
 *      are resolved for deep links by
 *      `scripts/tests/a-path-build-writes-its-hosting-rules.test.mjs`.
 *   3. **Nothing the page asks this host for falls outside the prefix, and
 *      nothing it asks for fails.** Chunks, styles, fonts, the icon, the
 *      public images — every same-origin request, over the whole case.
 *
 * At the root (`BASE_PATH` unset) the same three hold trivially and the case
 * is a cheap reload check. It is under a prefix that it earns its place: CI
 * builds with `BASE_PATH=/demo/` and runs the whole walk again, this case
 * included — see `render-walk/README.md` § Served from a path.
 *
 * Borrowed from the app: `data-cover-page`, `data-nav-row`,
 * `data-editor-top-nav`, `data-blueprint-cell`, and the `Jump to…` dialog
 * name — all already listed in the README.
 */
test('the app stays inside the path it is served from', async ({ page, baseURL }) => {
  expect(baseURL, 'the config names where the preview is served').toBeTruthy()
  const served = new URL(baseURL as string)
  expect(served.pathname, 'the preview is served at BASE_PATH').toBe(BASE_PATH)

  const outside: string[] = []
  const failed: string[] = []
  const problems: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== served.origin) return
    if (!url.pathname.startsWith(BASE_PATH)) outside.push(url.pathname)
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin !== served.origin) return
    if (response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  if (process.env.RENDER_WALK_INJECT_CONSOLE_ERROR) {
    await page.addInitScript(() => console.error('render-walk: injected console error'))
  }

  const assertStayedInside = () => {
    expect(outside, `requests outside ${BASE_PATH}`).toEqual([])
    expect(failed, 'same-origin requests that failed').toEqual([])
    expect(problems, 'browser errors').toEqual([])
  }

  await page.goto('./')
  await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
  const coverCta = page.locator('[data-cover-page] header button')
  if ((await coverCta.count()) > 0) {
    await coverCta.first().click()
    await expect(page.locator('[data-cover-page]')).toHaveCount(0)
  }
  await expect(
    page.locator('[data-editor-top-nav]').getByText('sample data', { exact: true }),
    'the preview is in no-database mode, showing the bundled sample board',
  ).toBeVisible()

  // Land a board the way a reader does, and read the address it leaves.
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Jump to…' })
  await expect(palette).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('scenario'), {
      message: 'Enter on the first row opened a scenario',
    })
    .not.toBeNull()
  await expect(page.locator('[data-blueprint-cell]').first()).toBeVisible()

  const shared = new URL(page.url())
  expect(
    shared.pathname.startsWith(BASE_PATH),
    `the shareable address ${shared.pathname}${shared.search} is under ${BASE_PATH}`,
  ).toBe(true)
  assertStayedInside()

  // The deep link, loaded cold.
  await page.goto(shared.href)
  await expect(page.locator('[data-blueprint-cell]').first()).toBeVisible()
  const reloaded = new URL(page.url())
  expect(reloaded.pathname, 'the reload stayed on the same path').toBe(shared.pathname)
  expect(
    reloaded.searchParams.get('scenario'),
    'the reload read the same board back out of the address',
  ).toBe(shared.searchParams.get('scenario'))
  assertStayedInside()
})
