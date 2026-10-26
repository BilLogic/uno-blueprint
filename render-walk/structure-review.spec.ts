import { expect, type Page } from '@playwright/test'
import { test } from './remote-images'
import { join } from 'node:path'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'
const canvas = process.env.RENDER_WALK_CANVAS_URL
async function open(page: Page) {
  test.skip(!canvas, 'Requires the isolated local authoring stack.')
  const url = new URL('/keeping-a-blueprint-true', canvas)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port === '5173')
    throw new Error('Use the isolated local stack')
  await page.goto(url.href)
  await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
  const cover = page.getByRole('button', {
    name: 'Open the blueprint',
    exact: true,
  })
  if (await cover.count()) await cover.click()
  const expand = page.locator(
    '[data-nav-row] button[aria-controls="phase-panel-f0000000-0000-4000-8000-000700020000"]',
  )
  if ((await expand.getAttribute('aria-expanded')) === 'false')
    await expand.click()
  await page
    .locator('[data-nav-row]')
    .getByRole('button', { name: 'Map your service', exact: true })
    .click()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  return page.locator(
    '[data-focus-slide-id="f0000000-0000-4000-8000-200000000001"]',
  )
}
test('review regressions: saving headers, lost capture, and user-owned draft camera', async ({
  page,
}) => {
  const board = await open(page)
  let reorderRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/reorder_steps')) reorderRequests += 1
  })
  const headers = board.locator(
    '[data-blueprint-column-header] [data-structure-reorder="step"]',
  )
  const before = await headers.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-structure-id')),
  )
  expect(before.length).toBeGreaterThan(2)
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const writes: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/reorder_steps', async (route) => {
    writes.push(route.request().postDataJSON())
    await gate
    await route.continue()
  })
  await headers.first().press('Alt+ArrowRight')
  await expect(board.locator('[data-structure-save-busy]')).toHaveCount(1)
  await expect(headers.first()).toHaveAttribute('aria-disabled', 'true')
  await headers.first().press('Alt+ArrowRight')
  await page.screenshot({
    path: join(VIEW_SCREENSHOT_DIR, 'review-reorder-busy.png'),
  })
  expect(writes).toHaveLength(1)
  expect(writes[0].expected_ids).toEqual(before)
  release()
  await expect(board.locator('[data-structure-save-busy]')).toHaveCount(0)
  const moved = [before[1], before[0], ...before.slice(2)]
  await expect
    .poll(() =>
      headers.evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-structure-id')),
      ),
    )
    .toEqual(moved)
  await page
    .locator('[data-write-failures]')
    .getByRole('button', { name: 'Undo', exact: true })
    .click()
  await expect
    .poll(() =>
      headers.evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-structure-id')),
      ),
    )
    .toEqual(before)
  await page.unroute('**/rest/v1/rpc/reorder_steps')
  // Actual browser pointer capture is released without pointerup; the lift must reset.
  const source = headers.first(),
    box = await source.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 20, box!.y + box!.height / 2)
  await expect(board.locator('[data-structure-lift-frame]')).toHaveCount(1)
  expect(await source.evaluate((el) => el.hasPointerCapture(1))).toBe(true)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(board.locator('[data-structure-save-busy]')).toHaveCount(0)
  expect(reorderRequests).toBe(1)
  await expect(board.locator('[data-structure-lift-frame]')).toHaveCount(1)
  await source.evaluate((el) => el.releasePointerCapture(1))
  // Chromium delivers the pending capture change before the next pointer event.
  await page.mouse.move(box!.x + box!.width / 2 + 21, box!.y + box!.height / 2)
  await expect(board.locator('[data-structure-lift-frame]')).toHaveCount(0)
  await page.mouse.up()
  await expect(page.locator('[data-cell-detail-panel]')).toHaveCount(0)
  // A new gesture still works after capture was lost, then window blur cancels it.
  const again = await source.boundingBox()
  await page.mouse.move(
    again!.x + again!.width / 2,
    again!.y + again!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    again!.x + again!.width / 2 + 20,
    again!.y + again!.height / 2,
  )
  await expect(board.locator('[data-structure-lift-frame]')).toHaveCount(1)
  await page.locator('html').evaluate((el) => {
    const event = el.ownerDocument.createEvent('Event')
    event.initEvent('blur', false, false)
    el.ownerDocument.defaultView!.dispatchEvent(event)
  })
  await expect(board.locator('[data-structure-lift-frame]')).toHaveCount(0)
  await page.mouse.up()
  await expect(page.locator('[data-cell-detail-panel]')).toHaveCount(0)
  const opener = board
    .getByRole('button', { name: 'Add a step after Deploy', exact: true })
    .first()
  await page.keyboard.press('Tab')
  await opener.focus()
  await page.keyboard.press('Enter')
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toBeFocused()
  await expect(
    board.getByRole('status', { name: 'New step position' }),
  ).toHaveCount(1)
  await page.waitForTimeout(500)
  const content = page.locator('[data-zoom-pan-content]:visible').first()
  const transform = () => content.getAttribute('style')
  const viewport = page.locator('[data-zoom-pan-viewport]:visible').first(),
    v = await viewport.boundingBox()
  await page.mouse.move(v!.x + 20, v!.y + 60)
  await page.mouse.wheel(80, 0)
  const panned = await transform()
  await name.fill('Manual camera ownership')
  expect(await transform()).toBe(panned)
  await page.mouse.move(v!.x + 20, v!.y + 60)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -12)
  await page.keyboard.up('Control')
  const zoomed = await transform()
  expect(zoomed).not.toBe(panned)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    board.getByRole('status', { name: 'New step position' }),
  ).toHaveCount(0)
  expect(await transform()).toBe(zoomed)
  await page.screenshot({
    path: join(VIEW_SCREENSHOT_DIR, 'review-camera-after-cancel.png'),
  })
})

test('review regression: a merged lane highlight follows its identity', async ({
  page,
}) => {
  const board = await open(page)
  const picker = page.locator('[aria-label^="Paths shown:"]')
  await picker.click()
  const popup = await picker.getAttribute('aria-controls')
  for (const path of await page
    .locator(`[id="${popup}"] li button[aria-pressed]`)
    .all())
    if ((await path.getAttribute('aria-pressed')) !== 'true') await path.click()
  await page.keyboard.press('Escape')
  await page
    .locator('[aria-label="Path display"]')
    .getByRole('button', { name: 'Merged', exact: true })
    .click()
  const title = board
    .getByRole('button', { name: 'Blueprint owner', exact: true })
    .first()
  await title.hover()
  const measured = await title.evaluate((el) => {
    const label = el.closest('[data-structure-lane-label]')!,
      id = label.getAttribute('data-structure-lane-label')!,
      board = el.closest('[data-structure-board]')!
    const rows = Array.from(
      board.querySelectorAll(`[data-blueprint-row][data-lane-id="${id}"]`),
    )
    const typedRows = rows as (typeof el)[]
    const rect = board.getBoundingClientRect(),
      scale =
        rect.width /
        parseFloat(el.ownerDocument.defaultView!.getComputedStyle(board).width),
      inset = parseFloat(
        el.ownerDocument
          .defaultView!.getComputedStyle(board)
          .getPropertyValue('--structure-highlight-inset'),
      )
    const left = Math.min(
        ...typedRows.map((row) => row.getBoundingClientRect().left),
      ),
      right = Math.max(
        ...typedRows.map((row) => row.getBoundingClientRect().right),
      )
    return {
      count: rows.length,
      error: Math.abs(
        parseFloat(
          el.ownerDocument
            .defaultView!.getComputedStyle(board)
            .getPropertyValue('--structure-highlight-width'),
        ) -
          ((right - left) / scale - 2 * inset),
      ),
    }
  })
  expect(measured.count).toBeGreaterThan(0)
  expect(measured.error).toBeLessThan(1)
  const error = await board
    .locator('[data-structure-board]')
    .evaluate((el) =>
      parseFloat(
        el.ownerDocument
          .defaultView!.getComputedStyle(el)
          .getPropertyValue('--structure-highlight-width'),
      ),
    )
  expect(error).toBeGreaterThan(0)
  await page.screenshot({
    path: join(VIEW_SCREENSHOT_DIR, 'review-merged-lane-highlight.png'),
  })
})

test('review regression: keyboard pan also takes ownership of the draft camera', async ({
  page,
}) => {
  const board = await open(page)
  const opener = board
    .getByRole('button', { name: 'Add a step after Deploy', exact: true })
    .first()
  await page.keyboard.press('Tab')
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toBeFocused()
  await expect(
    board.getByRole('status', { name: 'New step position' }),
  ).toHaveCount(1)
  await page.waitForTimeout(500)
  const content = page.locator('[data-zoom-pan-content]:visible').first()
  const assisted = await content.getAttribute('style')
  await page.locator('[data-zoom-pan-viewport]:visible').first().focus()
  await page.keyboard.press('ArrowRight')
  const chosen = await content.getAttribute('style')
  expect(chosen).not.toBe(assisted)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    board.getByRole('status', { name: 'New step position' }),
  ).toHaveCount(0)
  expect(await content.getAttribute('style')).toBe(chosen)
})
