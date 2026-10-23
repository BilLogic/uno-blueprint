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
        const laneHeader = board
          .getByRole('button', { name: 'Journey figures', exact: true })
          .first()
        expect(
          await laneHeader.evaluate((el) => {
            const box = el.getBoundingClientRect()
            return (
              el.ownerDocument
                .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
                ?.closest('button') === el
            )
          }),
          'insertion detection must not steal the lane name',
        ).toBe(true)
        for (const axis of ['lane', 'step'] as const) {
          const label =
            axis === 'lane'
              ? laneHeader
              : board
                  .getByRole('button', {
                    name: 'View details: Invoke ub:map',
                    exact: true,
                  })
                  .first()
          const box = await label.boundingBox()
          await page.mouse.move(
            box!.x + box!.width / 2,
            box!.y + box!.height / 2,
          )
          const highlighted = board.locator('[data-axis-highlight]')
          await expect(highlighted).toHaveAttribute('data-axis-highlight', axis)
          expect(
            await highlighted
              .locator('[data-structure-highlight="cells"]')
              .count(),
          ).toBe(0)
          expect(
            await highlighted
              .locator('[data-structure-highlight="label"]')
              .evaluate((el) =>
                parseFloat(
                  el.ownerDocument.defaultView!.getComputedStyle(el)
                    .borderRadius,
                ),
              ),
          ).toBeGreaterThan(0)
          await page.screenshot({
            path: join(
              VIEW_SCREENSHOT_DIR,
              `highlight-${axis}-${layout}-${theme}-${camera}.png`,
            ),
          })
          await page.mouse.move(24, 24)
        }
        const semanticEdge = board
          .getByRole('button', {
            name: 'Add a lane below Blueprint owner',
            exact: true,
          })
          .first()
        const boundaryBefore = await semanticEdge.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const scope =
            el.closest('[data-structure-path]') ??
            el.closest('[data-structure-board]')!
          const line = (
            Array.from(
              scope.querySelectorAll('[data-blueprint-divider]'),
            ) as (typeof el)[]
          )
            .filter(
              (node) => node.getBoundingClientRect().bottom <= box.top + 1,
            )
            .at(-1)!
          const bounds = line.getBoundingClientRect()
          return {
            top: bounds.top,
            height: bounds.height,
            kind: line.getAttribute('data-blueprint-divider'),
          }
        })
        const edgeBox = await semanticEdge.boundingBox()
        await page.mouse.move(edgeBox!.x + 6, edgeBox!.y + 22)
        await expect(semanticEdge).toHaveAttribute('data-open', '')
        expect(
          await semanticEdge.evaluate((el) => {
            const scope =
              el.closest('[data-structure-path]') ??
              el.closest('[data-structure-board]')!
            const gap = scope
              .querySelector('[data-structure-seam-track="lane"]')!
              .getBoundingClientRect()
            const line = (
              Array.from(
                scope.querySelectorAll('[data-blueprint-divider]'),
              ) as (typeof el)[]
            )
              .filter(
                (node) => node.getBoundingClientRect().bottom <= gap.top + 1,
              )
              .at(-1)!
            const bounds = line.getBoundingClientRect()
            return {
              top: Math.round(bounds.top),
              height: Math.round(bounds.height),
              kind: line.getAttribute('data-blueprint-divider'),
              beside: Math.abs(gap.top - bounds.bottom) < 1,
            }
          }),
        ).toEqual({
          top: Math.round(boundaryBefore.top),
          height: Math.round(boundaryBefore.height),
          kind: boundaryBefore.kind,
          beside: true,
        })
        await page.mouse.move(24, 24)
        await expect(semanticEdge).not.toHaveAttribute('data-open', '')
        // Merged path badges overlap the top of columns. In Stacked, that
        // space is clear; farther down meets the first lane's crossing seam.
        const stepProbeInset = layout === 'merged' ? 44 : 6
        for (const kind of ['lane', 'step'] as const) {
          const seams = board.getByRole('button', {
            name: new RegExp(`^Add a ${kind}`),
          })
          const opener = seams.nth(1)
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
          // Camera reveal can outlast the seam's close delay. Aim only once
          // the closed target is stationary in screen coordinates.
          let targetPosition = ''
          let targetSettledAt = 0
          await expect
            .poll(async () => {
              const bounds = await opener.boundingBox()
              const position = JSON.stringify(bounds)
              if (position !== targetPosition) {
                targetPosition = position
                targetSettledAt = Date.now()
              }
              return Boolean(bounds) && Date.now() - targetSettledAt >= 200
            })
            .toBe(true)
          const closed = await opener.boundingBox()

          const axis = kind === 'step' ? 'width' : 'height'
          expect(closed?.[axis]).toBeGreaterThanOrEqual(43.9)
          // Aim in the label rail for lane seams, where the sticky label used to intercept it.
          await page.mouse.move(
            closed!.x + (kind === 'step' ? closed!.width / 2 : 6),
            closed!.y + (kind === 'lane' ? closed!.height / 2 : stepProbeInset),
          )
          expect(
            await opener.evaluate(
              (el, { itemKind, inset }) => {
                const bounds = el.getBoundingClientRect()
                const hit = el.ownerDocument.elementFromPoint(
                  bounds.left + (itemKind === 'step' ? bounds.width / 2 : 6),
                  bounds.top +
                    (itemKind === 'lane' ? bounds.height / 2 : inset),
                )
                return hit
                  ?.closest('[data-structure-seam]')
                  ?.getAttribute('aria-label')
              },
              { itemKind: kind, inset: stepProbeInset },
            ),
          ).toBe(await opener.getAttribute('aria-label'))
          await expect(opener).toHaveAttribute('data-open', '')
          await expect(opener.locator('svg')).toHaveCount(1)
          await expect(opener).toHaveAttribute('data-open', '')
          await expect
            .poll(async () => {
              const slot = await opener
                .locator('[data-structure-slot]')
                .boundingBox()
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
              const slot = await opener
                .locator('[data-structure-slot]')
                .boundingBox()
              const gap = await phantom.boundingBox()
              if (!slot || !gap) return false
              const start = kind === 'step' ? 'x' : 'y'
              const size = kind === 'step' ? 'width' : 'height'
              return {
                kind,
                offset: Math.round(Math.abs(slot[start] - gap[start])),
                size: Math.round(Math.abs(slot[size] - gap[size])),
              }
            })
            .toEqual({ kind, offset: 0, size: 0 })
          const centeredSlot = await opener
            .locator('[data-structure-slot]')
            .boundingBox()
          const centerAxis = kind === 'step' ? 'x' : 'y'
          const centerSize = kind === 'step' ? 'width' : 'height'
          expect(
            Math.abs(
              centeredSlot![centerAxis] +
                centeredSlot![centerSize] / 2 -
                closed![centerAxis] -
                closed![centerSize] / 2,
            ),
          ).toBeLessThan(1)
          const crossings = await opener.evaluate((el, itemKind) => {
            const bounds = el.getBoundingClientRect()
            const board = el.closest('[data-structure-board]')!
            const others = Array.from(
              board.querySelectorAll('[data-structure-seam]'),
            ) as (typeof el)[]
            return others
              .filter((other) =>
                other
                  .getAttribute('aria-label')
                  ?.startsWith(
                    `Add a ${itemKind === 'step' ? 'lane' : 'step'}`,
                  ),
              )
              .map((other) => {
                const box = other.getBoundingClientRect()
                return {
                  x:
                    (Math.max(bounds.left, box.left) +
                      Math.min(bounds.right, box.right)) /
                    2,
                  y:
                    (Math.max(bounds.top, box.top) +
                      Math.min(bounds.bottom, box.bottom)) /
                    2,
                  intersects:
                    box.right > bounds.left &&
                    box.left < bounds.right &&
                    box.bottom > bounds.top &&
                    box.top < bounds.bottom,
                }
              })
              .filter(
                (point) =>
                  point.intersects &&
                  point.x > 300 &&
                  point.x < el.ownerDocument.documentElement.clientWidth - 40 &&
                  point.y > 150 &&
                  point.y < el.ownerDocument.documentElement.clientHeight - 80,
              )
              .filter((point) =>
                el.ownerDocument
                  .elementFromPoint(point.x, point.y)
                  ?.closest('[data-structure-seam]'),
              )
              .slice(0, 3)
          }, kind)
          expect(crossings.length).toBeGreaterThan(0)
          for (const point of crossings) {
            for (const offset of [-5, 0, 5, 0]) {
              await page.mouse.move(point.x + offset, point.y + offset)
              await page.waitForTimeout(180)
              await expect(opener).toHaveAttribute('data-open', '')
              await expect(
                board.locator('[data-structure-seam][data-open]'),
              ).toHaveCount(1)
            }
          }
          await page.mouse.move(24, 24)
          await opener.focus()
          await expect(opener).toBeFocused()
          await expect(opener).toHaveAttribute('data-open', '')
          const semanticDividers = await board
            .locator('[data-blueprint-divider]')
            .evaluateAll((items) =>
              items.map((el) => el.getAttribute('data-blueprint-divider')),
            )
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
          let releaseMetadata!: () => void
          const metadataGate = new Promise<void>((resolve) => {
            releaseMetadata = resolve
          })
          const metadataRequest = (url: URL) =>
            url.pathname.endsWith('/rest/v1/paths') &&
            Boolean(url.searchParams.get('select')?.includes('lanes('))
          await page.route(metadataRequest, async (route) => {
            await metadataGate
            try {
              await route.fallback()
            } catch (error) {
              if (!route.request().failure()) throw error
            }
          })
          const crossing = crossings.at(-1)!
          await page.mouse.click(crossing.x, crossing.y)
          await expect(
            page.getByRole('heading', { name: `Add ${kind}`, exact: true }),
          ).toBeVisible()
          const name = page.getByRole('textbox', { name: 'Name', exact: true })
          await expect(
            board.locator(`[data-structure-insert-zone="${kind}"]`).first(),
          ).toBeVisible()
          await expect(name).toBeFocused()
          await expect(name).toHaveAttribute('required', '')
          releaseMetadata()
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
          expect(
            await board
              .locator('[data-blueprint-divider]')
              .evaluateAll((items) =>
                items.map((el) => el.getAttribute('data-blueprint-divider')),
              ),
          ).toEqual(semanticDividers)
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
          const current = rail.getByRole('button', {
            name: /^Move Review in /,
          })
          await current.press(kind === 'step' ? 'ArrowUp' : 'ArrowDown')
          expect(
            await current.evaluate((el) => {
              const row = el.closest('li')!
              const card = row.querySelector('[data-order-card]')!
              const view = el.ownerDocument.defaultView!
              return {
                node: view.getComputedStyle(el).outlineStyle,
                nodeShadow: view.getComputedStyle(el).boxShadow,
                row: view.getComputedStyle(row).outlineStyle,
                card: view.getComputedStyle(card).outlineStyle,
              }
            }),
          ).toEqual({
            node: 'none',
            nodeShadow: 'none',
            row: 'none',
            card: 'solid',
          })
          await expect(rows).toHaveCount(rowCount)
          await page
            .getByRole('button', { name: 'Reset order', exact: true })
            .click()
          await expect(page.getByText('Moved', { exact: true })).toHaveCount(0)
          expect(
            await rail
              .locator('li')
              .evaluateAll((items) =>
                items.every((item) => !item.style.outline.includes('solid')),
              ),
          ).toBe(true)
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
                    (!item.style.transform ||
                      item.style.transform === 'none') &&
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
          await page.mouse.move(
            returned!.x + 6,
            returned!.y + (kind === 'step' ? stepProbeInset : 6),
          )
          await expect(opener).toHaveAttribute('data-open', '')
          const opened = await opener
            .locator('[data-structure-slot]')
            .boundingBox()
          await page.mouse.click(
            opened!.x + 6,
            opened!.y + (kind === 'step' ? stepProbeInset : 6),
          )
          await expect(name).toBeFocused()
          await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .click()
          await expect(
            page.getByRole('status', { name: `New ${kind} position` }),
          ).toHaveCount(0)
          expect(requests).toEqual([])
          await opener.press('Enter')
          await expect(name).toBeFocused()
          await expect(
            page.getByRole('heading', { name: `Add ${kind}`, exact: true }),
          ).toBeVisible()
          await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .click()
          expect(requests).toEqual([])
          page.off('request', track)
        }
        expect(errors).toEqual([])
      })
    }
  }
}
