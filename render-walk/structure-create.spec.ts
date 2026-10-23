import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'

// Authoring needs a real caller session. The ordinary no-database walk skips
// this case; the local canvas supplies its existing synthetic editing account.
const canvas = process.env.RENDER_WALK_CANVAS_URL
if (canvas) {
  const url = new URL(canvas)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port === '5173'
  )
    throw new Error(
      'The authoring walk requires an isolated local canvas, away from port 5173.',
    )
}

for (const camera of ['overview', '100%'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const layout of ['stacked', 'merged'] as const) {
      test(`create panels and insert focus — ${layout}, ${theme}, ${camera}`, async ({
        page,
      }) => {
        test.skip(
          !canvas,
          'Set RENDER_WALK_CANVAS_URL to a local development canvas with a seeded local database and synthetic editing account.',
        )
        test.setTimeout(90_000)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text())
        })
        page.on('request', (request) => {
          if (/\/(rest|auth)\/v1\//.test(request.url())) {
            const host = new URL(request.url()).hostname
            if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
              errors.push('The authoring walk reached a non-local database.')
          }
        })
        await page.goto(canvas!)
        await page
          .locator('[data-cover-page], [data-nav-row]')
          .first()
          .waitFor()
        const cover = page.getByRole('button', {
          name: 'Open the blueprint',
          exact: true,
        })
        if (await cover.count()) await cover.click()
        const phases = page.locator(
          '[data-nav-row] button[aria-controls^="phase-panel-"]',
        )
        await expect(phases.first()).toBeVisible()
        for (const phase of await phases.all())
          if ((await phase.getAttribute('aria-expanded')) === 'false')
            await phase.click()
        const scenarios = page.locator('[id^="phase-panel-"] [data-nav-row]')
        await expect(scenarios.first()).toBeVisible()
        let found = false
        for (const scenario of await scenarios.all()) {
          await scenario.locator('button:not([aria-expanded])').first().click()
          await page.waitForLoadState('networkidle')
          const picker = page.locator('[aria-label^="Paths shown:"]')
          if (!(await picker.count())) continue
          await picker.click()
          const popupId = await picker.getAttribute('aria-controls')
          const paths = page.locator(
            `[id="${popupId}"] li button[aria-pressed]`,
          )
          await paths.first().waitFor()
          const count = await paths.count()
          if (count > 1) {
            for (const path of await paths.all())
              if ((await path.getAttribute('aria-pressed')) !== 'true')
                await path.click()
            found = true
          }
          await page.keyboard.press('Escape')
          if (found) break
        }
        expect(found, 'the local sample has a scenario with two paths').toBe(
          true,
        )
        const themeSwitch = page.getByRole('button', {
          name: `Switch to ${theme} theme`,
          exact: true,
        })
        if (await themeSwitch.count()) await themeSwitch.click()
        await page
          .locator('[aria-label="Path display"]')
          .getByRole('button', {
            name: layout === 'merged' ? 'Merged' : 'Stacked',
            exact: true,
          })
          .click()
        await page.getByRole('button', { name: 'Edit', exact: true }).click()
        await page.waitForLoadState('networkidle')
        const scenarioId = new URL(page.url()).searchParams.get('scenario')
        const board = page.locator(`[data-focus-slide-id="${scenarioId}"]`)
        for (const kind of ['lane', 'step'] as const) {
          const seams = board.getByRole('button', {
            name: new RegExp(`^Add a ${kind}`),
          })
          const opener = kind === 'step' ? seams.last() : seams.first()
          await page.keyboard.press('Tab')
          if (camera === '100%') {
            const viewport = page.locator('[data-zoom-pan-viewport]').first()
            const box = await viewport.boundingBox()
            await page.mouse.move(
              box!.x + box!.width / 2,
              box!.y + box!.height / 2,
            )
            const scale = () =>
              page
                .locator('[data-zoom-pan-content]')
                .first()
                .evaluate((el) =>
                  Number(
                    el.getAttribute('style')?.match(/scale\(([^)]+)\)/)?.[1],
                  ),
                )
            await page.keyboard.down('Control')
            try {
              for (let attempt = 0; attempt < 32; attempt++) {
                const current = await scale()
                if (Math.abs(current - 1) < 0.001) break
                await page.mouse.wheel(
                  0,
                  Math.max(-16, Math.min(16, Math.log(current) / 0.01)),
                )
                await expect.poll(scale).not.toBe(current)
              }
            } finally {
              await page.keyboard.up('Control')
            }
            await expect.poll(scale).toBeCloseTo(1, 2)
          }
          // Keyboard focus reveals the seam's top-left corner at full scale;
          // blur before probing the closed target with the pointer.
          await page.keyboard.press('Tab')
          await opener.focus()
          await page.getByRole('button', { name: 'Edit', exact: true }).focus()
          await expect(opener).not.toHaveAttribute('data-open', '')
          const closed = await opener.boundingBox()

          const axis = kind === 'step' ? 'width' : 'height'
          expect(closed?.[axis]).toBeGreaterThanOrEqual(11.9)
          // Aim in the label rail for lane seams, where the sticky label used to intercept it.
          await page.mouse.move(closed!.x + 6, closed!.y + 6)
          await expect(opener).toHaveAttribute('data-open', '')
          await expect(opener.locator('svg')).toHaveCount(1)
          await expect(opener).toHaveAttribute('data-open', '')
          await expect
            .poll(async () => {
              const slot = await opener.boundingBox()
              const axis = kind === 'step' ? 'width' : 'height'
              return slot?.[axis] ?? 0
            })
            .toBeGreaterThanOrEqual(33)
          const phantom = board
            .locator(`[data-structure-seam-track="${kind}"]`)
            .first()
          await expect(phantom).toBeAttached()
          await expect
            .poll(async () => {
              const slot = await opener.boundingBox()
              const gap = await phantom.boundingBox()
              if (!slot || !gap) return false
              const start = kind === 'step' ? 'x' : 'y'
              const size = kind === 'step' ? 'width' : 'height'
              return {
                kind,
                offset: Math.round(slot[start] - gap[start]),
                size: Math.round(slot[size] - gap[size]),
              }
            })
            .toEqual({ kind, offset: 0, size: 0 })
          await page.mouse.move(24, 24)
          await opener.focus()
          await expect(opener).toBeFocused()
          await expect(opener).toHaveAttribute('data-open', '')
          const requests: string[] = []
          const track = (request: import('@playwright/test').Request) => {
            if (
              request.url().includes('/rest/v1/rpc/') &&
              request.method() === 'POST'
            )
              requests.push(request.url())
          }
          page.on('request', track)
          await page.screenshot({
            path: join(
              VIEW_SCREENSHOT_DIR,
              `seam-${kind}-${layout}-${theme}-${camera}.png`,
            ),
          })
          await page.keyboard.press('Enter')
          const name = page.getByRole('textbox', { name: 'Name', exact: true })
          await expect(name).toBeFocused()
          await expect(name).toHaveAttribute('required', '')
          if (kind === 'step')
            await expect
              .poll(async () => {
                return page
                  .locator('[role="status"][aria-label="New step position"]')
                  .first()
                  .evaluate((marker) => {
                    const panel = marker.ownerDocument
                      .querySelector('[role="dialog"]')
                      ?.getBoundingClientRect()
                    const bounds = marker.getBoundingClientRect()
                    return Boolean(panel && bounds.right <= panel.x - 8)
                  })
              })
              .toBe(true)
          await expect(
            page.getByRole('status', { name: `New ${kind} position` }).first(),
          ).toBeVisible()
          const add = page.getByRole('button', {
            name: new RegExp(`^Add ${kind}(?: to [0-9]+ paths)?$`),
          })
          await expect(add).toBeEnabled()
          await name.fill('Review')
          if (kind === 'lane') {
            await expect(add).toBeEnabled()
            const role = page.getByRole('combobox', {
              name: 'Role',
              exact: true,
            })
            await page.keyboard.press('Tab')
            await expect(role).toBeFocused()
            await role.click()
            await page
              .getByRole('option')
              .filter({ hasText: /^Frontstage\s*Staff actions/ })
              .click()
          }
          await expect(add).toBeEnabled()
          const rail = page
            .getByRole('region', { name: 'Add to paths' })
            .getByRole('list')
          const rows = rail.getByRole('button')
          const rowCount = await rows.count()
          const firstName = await rows.first().getAttribute('aria-label')
          const from = await rows
            .nth(firstName?.startsWith('Move Review in ') ? 1 : 0)
            .boundingBox()
          const to = await rows.last().boundingBox()
          expect(from && to).toBeTruthy()
          await page.mouse.move(
            from!.x + from!.width / 2,
            from!.y + from!.height / 2,
          )
          await page.mouse.down()
          await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
            steps: 12,
          })
          await page.mouse.up()
          await expect(page.getByText('Moved', { exact: true })).toBeVisible()
          await page.screenshot({
            path: join(
              VIEW_SCREENSHOT_DIR,
              `rail-moved-${kind}-${layout}-${theme}-${camera}.png`,
            ),
          })
          const current = rail.getByRole('button', { name: /^Move Review in / })
          await current.press(kind === 'step' ? 'ArrowUp' : 'ArrowDown')
          await expect(rows).toHaveCount(rowCount)
          await page
            .getByRole('button', { name: 'Reset order', exact: true })
            .click()
          await expect(page.getByText('Moved', { exact: true })).toHaveCount(0)
          await expect(rail.locator('li')).toHaveCount(rowCount)
          // A reset starts a new layout animation after the DOM order changes.
          // Require settled geometry across successive frames before capturing it.
          let settledAt = 0
          await expect
            .poll(async () => {
              const settled = await rail.locator('li').evaluateAll((items) =>
                items.every((item, index) => {
                  const bounds = item.getBoundingClientRect()
                  return (
                    (!item.style.transform || item.style.transform === 'none') &&
                    bounds.height > 0 &&
                    (index === 0 ||
                      items[index - 1].getBoundingClientRect().bottom <=
                        bounds.top + 0.5)
                  )
                }),
              )
              if (!settled) settledAt = 0
              else if (!settledAt) settledAt = Date.now()
              return settled && Date.now() - settledAt >= 200
            })
            .toBe(true)
          const dir = join(VIEW_SCREENSHOT_DIR, 'structure-create')
          mkdirSync(dir, { recursive: true })
          await page.screenshot({
            path: join(dir, `${kind}-${layout}-${theme}-${camera}.png`),
          })
          if (kind === 'lane')
            await page
              .getByRole('button', { name: 'Cancel', exact: true })
              .click()
          else await page.keyboard.press('Escape')
          await expect(
            page.getByRole('status', { name: `New ${kind} position` }),
          ).toHaveCount(0)
          await expect(opener).toBeFocused()
          expect(
            requests,
            'opening and cancelling a draft never writes',
          ).toEqual([])
          const returned = await opener.boundingBox()
          await page.mouse.move(returned!.x + 6, returned!.y + 6)
          await expect(opener).toHaveAttribute('data-open', '')
          const opened = await opener.boundingBox()
          await page.mouse.click(opened!.x + 6, opened!.y + 6)
          await expect(name).toBeFocused()
          await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .click()
          await expect(
            page.getByRole('status', { name: `New ${kind} position` }),
          ).toHaveCount(0)
          expect(requests).toEqual([])
          page.off('request', track)
        }
        expect(errors).toEqual([])
      })
    }
  }
}
