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

for (const theme of ['light', 'dark'] as const) {
  for (const layout of ['stacked', 'merged'] as const) {
    test(`create panels and insert focus — ${layout}, ${theme}`, async ({
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
      await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
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
        const paths = page.locator(`[id="${popupId}"] li button[aria-pressed]`)
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
      expect(found, 'the local sample has a scenario with two paths').toBe(true)
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
        const opener = board
          .getByRole('button', { name: new RegExp(`^Add a ${kind}`) })
          .first()
        await page.keyboard.press('Tab')
        await opener.focus()
        await expect(opener).toBeFocused()
        const ink = opener.locator('span').first()
        await expect(ink).toHaveCSS('opacity', '1')
        const requests: string[] = []
        const track = (request: import('@playwright/test').Request) => {
          if (
            request.url().includes('/rest/v1/rpc/') &&
            request.method() === 'POST'
          )
            requests.push(request.url())
        }
        page.on('request', track)
        await page.keyboard.press('Enter')
        const name = page.getByRole('textbox', { name: 'Name', exact: true })
        await expect(name).toBeFocused()
        await expect(name).toHaveAttribute('required', '')
        await expect(
          page.getByRole('status', { name: `New ${kind} position` }).first(),
        ).toBeVisible()
        const add = page.getByRole('button', {
          name: `Add ${kind}`,
          exact: true,
        })
        await expect(add).toBeDisabled()
        await name.fill('Review')
        if (kind === 'lane') {
          await expect(add).toBeDisabled()
          const role = page.getByRole('combobox', { name: 'Role', exact: true })
          await page.keyboard.press('Tab')
          await expect(role).toBeFocused()
          await role.click()
          await page
            .getByRole('option')
            .filter({ hasText: /^Frontstage\s*Staff actions/ })
            .click()
        }
        await expect(add).toBeEnabled()
        const dir = join(VIEW_SCREENSHOT_DIR, 'structure-create')
        mkdirSync(dir, { recursive: true })
        await page.screenshot({
          path: join(dir, `${kind}-${layout}-${theme}.png`),
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
        expect(requests, 'opening and cancelling a draft never writes').toEqual(
          [],
        )
        await opener.hover()
        await expect(ink).toHaveCSS('opacity', '1')
        await opener.click()
        await expect(name).toBeFocused()
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
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
