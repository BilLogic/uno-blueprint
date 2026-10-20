/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

// These checks write only to a disposable, locally seeded Supabase stack.
async function openSample(page: Page, layout: string, theme: string) {
  // Refuse hosted API calls even if the dev server was configured incorrectly.
  await page.route('**/rest/v1/**', async (route) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
      throw new Error('Authoring checks refuse a hosted database.')
    }
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the blueprint', exact: true }).click()
  await page.getByRole('button', { name: 'Open Map your service scenario', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const trigger = page.locator('[aria-label^="Paths shown:"]')
  await trigger.click()
  const popup = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`)
  const options = popup.locator('li button[aria-pressed]')
  await expect(options.first()).toBeVisible()
  for (let index = 0; index < await options.count(); index++) {
    if (await options.nth(index).getAttribute('aria-pressed') !== 'true') await options.nth(index).click()
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: layout, exact: true }).click()
  await expect(page.getByRole('button', { name: layout, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(async () => {
    // @ts-expect-error browser loads the dev module by URL
    const { queryClient } = await import('/src/lib/queryClient.ts')
    return queryClient.isFetching()
  })).toBe(0)
  // Entering Merged opens its reading preset before an author edits properties.
  const closeDifferences = page.getByRole('button', { name: 'Close the difference ledger', exact: true })
  if (await closeDifferences.isVisible()) await closeDifferences.click()
  await page.evaluate((value) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(value)
  }, theme)
  return page.locator('[data-canvas-focus-active][data-phase-scenario-panel]')
}

async function queryState(page: Page) {
  return page.evaluate(async () => {
    // Vite-only diagnostic seam; no instrumentation ships in the app.
    // @ts-expect-error browser loads the dev module by URL
    const { queryClient } = await import('/src/lib/queryClient.ts')
    return queryClient.getQueryCache().getAll()
      .filter((q: { queryKey: unknown[] }) => /canvas-blueprints|step-spec|lane-spec/.test(String(q.queryKey[0])))
      .map((q: { queryKey: unknown[]; state: unknown }) => ({ key: q.queryKey, state: q.state }))
  })
}

for (const theme of ['light', 'dark']) {
  test(`lane naming is above the sticky rail and saves without reload, ${theme}`, async ({ page }, testInfo) => {
    const board = await openSample(page, 'Stacked', theme)
    const before = await queryState(page)
    await board.getByRole('button', { name: 'Insert a lane here', exact: true }).nth(2).click()
    const input = page.getByPlaceholder('Lane name')
    await expect(input).toBeFocused()
    const layers = await input.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const contexts = []
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.zIndex !== 'auto' || style.transform !== 'none' || style.isolation === 'isolate') {
          contexts.push({ tag: node.tagName, className: node.getAttribute('class'), z: style.zIndex, transform: style.transform, isolation: style.isolation })
        }
      }
      return { hittable: hit === el, hit: hit?.outerHTML.slice(0, 200), contexts }
    })
    await testInfo.attach('layer-stack', { body: JSON.stringify(layers, null, 2), contentType: 'application/json' })
    expect(layers.hittable).toBe(true)
    // Exercise actual pointer focus, not only programmatic filling through an occluder.
    await input.click()
    const name = `Sample ${theme} review lane ${Date.now()}`
    await input.fill(name)
    await input.press('Enter')
    await expect(input).toBeHidden()
    await expect(board.getByRole('button', { name: `Lane properties: ${name}`, exact: true }).first()).toBeVisible()
    await testInfo.attach('queries-before-after', { body: JSON.stringify({ before, after: await queryState(page) }), contentType: 'application/json' })
  })

  for (const layout of ['Stacked', 'Merged']) {
    test(`reopened lane properties follow the saved response, ${layout}, ${theme}`, async ({ page }, testInfo) => {
      const board = await openSample(page, layout, theme)
      const header = board.getByRole('button', { name: /^(Lane properties:|View details:) Pipeline scripts$/ }).first()
      await header.click()
      const input = page.locator('[data-panel-editor] input').first()
      await expect(input).toBeVisible()
      const previous = await input.inputValue()
      const owner = `Sample ${layout} ${theme} owner ${Date.now()}`
      const before = await queryState(page)
      await input.fill(owner)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close lane properties', exact: true })).toBeHidden()
      await header.click()
      await expect(input).toHaveValue(owner)
      await testInfo.attach('queries-before-after', { body: JSON.stringify({ before, after: await queryState(page) }), contentType: 'application/json' })
      await input.fill(previous)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close lane properties', exact: true })).toBeHidden()
    })

    test(`reopened summary follows the saved response, ${layout}, ${theme}`, async ({ page }, testInfo) => {
      const board = await openSample(page, layout, theme)
      const header = board.getByRole('button', { name: 'View details: Invoke ub:map', exact: true })
      await header.click()
      const input = page.locator('[data-panel-editor] textarea')
      await expect(input).toBeVisible()
      const previous = await input.inputValue()
      const summary = `Sample summary ${layout} ${theme} ${Date.now()}`
      const before = await queryState(page)
      await input.fill(summary)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close step properties', exact: true })).toBeHidden()
      await header.click()
      await expect(input).toHaveValue(summary)
      await testInfo.attach('queries-before-after', { body: JSON.stringify({ before, after: await queryState(page) }), contentType: 'application/json' })
      await input.fill(previous)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close step properties', exact: true })).toBeHidden()
    })
  }
}

for (const theme of ['light', 'dark']) {
  test(`step insertion uses the pointed-to stored position, ${theme}`, async ({ page }, testInfo) => {
    const board = await openSample(page, 'Stacked', theme)
    const before = await queryState(page)
    const firstBand = board.locator('[data-blueprint-column-handles]').first().locator('..')
    const names = await firstBand.locator('button[aria-label^="Select the "]').allTextContents()
    const insert = firstBand.getByRole('button', { name: 'Insert a step at position 2', exact: true })
    await insert.locator('span').last().click()
    await expect(firstBand.locator('button[aria-label^="Select the "]')).toHaveText([
      names[0], 'Untitled step', ...names.slice(1),
    ])
    await testInfo.attach('queries-before-after', { body: JSON.stringify({ before, after: await queryState(page) }), contentType: 'application/json' })
  })
}
