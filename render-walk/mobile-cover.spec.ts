import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'

/**
 * Phone render walk: cover, CTA landing, one scenario per phase.
 *
 * A blank phone canvas is the failure this exists to catch. Desktop's walk
 * never opens at 375×812, so a cover that never yields to a board on a phone
 * was invisible to every other guard.
 */

const MOBILE_SCREENSHOT_DIR = join(VIEW_SCREENSHOT_DIR, 'mobile')

type Problem = { address: string; detail: string }

/**
 * Wait until a board's cells carry content. Same shape as the desktop walk:
 * an empty grid is what a broken board looks like, so a timeout here is a
 * failure, not a reading.
 *
 * @param board - Artboard locator.
 * @param label - Scenario name for the timeout error.
 * @param address - Where the failure happened.
 */
async function waitForBoardSettled(
  board: Locator,
  label: string,
  address: string,
): Promise<number> {
  const deadline = Date.now() + 20 * 1000
  let previous = ''
  while (Date.now() < deadline) {
    const box = await board.boundingBox()
    const filled = (
      await board.locator('[data-blueprint-cell]').allInnerTexts()
    ).filter((text) => text.trim().length > 0).length
    const current = box
      ? `${box.x}:${box.y}:${box.width}:${box.height}:${filled}`
      : ''
    if (current !== '' && current === previous) return filled
    previous = current
    await board.page().waitForTimeout(150)
  }
  throw new Error(
    `the phone board for ${label} never settled within 20s at ${address}: ` +
      `last reading ${previous || '(no box)'}`,
  )
}

test.describe('the phone cover walk', () => {
  test('opens the cover, follows the CTA, and walks one scenario per phase', async ({
    page,
  }) => {
    mkdirSync(MOBILE_SCREENSHOT_DIR, { recursive: true })

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

    /**
     * Fail the walk if any console or page error was recorded.
     */
    function assertNoProblems() {
      expect(problems, problems.map((item) => `${item.address}: ${item.detail}`).join('\n')).toEqual(
        [],
      )
    }

    await page.goto('./')
    const cover = page.locator('[data-cover-page]')
    await expect(cover).toBeVisible()
    await page.screenshot({ path: join(MOBILE_SCREENSHOT_DIR, 'cover.png') })
    assertNoProblems()

    await cover.locator('header button').first().click()
    await expect(page.locator('[data-cover-page]')).toHaveCount(0)

    const landingBoard = page.locator('[data-focus-slide-id]').first()
    await expect(landingBoard).toBeVisible()
    const landingId = await landingBoard.getAttribute('data-focus-slide-id')
    expect(landingId, 'the CTA lands on a scenario artboard').toBeTruthy()
    address = page.url()
    const filled = await waitForBoardSettled(
      landingBoard,
      'CTA landing',
      address,
    )
    expect(filled, 'the phone canvas draws its cells').toBeGreaterThan(0)
    await page.screenshot({
      path: join(MOBILE_SCREENSHOT_DIR, 'cta-landing.png'),
    })
    assertNoProblems()

    await page.getByRole('button', { name: 'Open navigation' }).click()
    const phaseToggles = page.locator('[data-nav-row] button[aria-expanded]')
    await expect(phaseToggles.first()).toBeVisible()
    const phaseCount = await phaseToggles.count()
    expect(phaseCount, 'the drawer lists phases').toBeGreaterThan(0)

    const firstScenarioByPhase: string[] = []
    for (let index = 0; index < phaseCount; index += 1) {
      const toggle = phaseToggles.nth(index)
      if ((await toggle.getAttribute('aria-expanded')) === 'false') {
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      }
      const phaseRow = toggle.locator('xpath=ancestor::*[@data-nav-row][1]')
      const firstScenario = phaseRow.locator(
        'xpath=following-sibling::*//*[@data-nav-row]',
      ).first()
      await expect(firstScenario).toBeVisible()
      const scenarioId = await firstScenario.getAttribute('data-nav-row')
      expect(scenarioId, 'each phase offers a scenario').toBeTruthy()
      firstScenarioByPhase.push(scenarioId as string)
    }

    await page.getByRole('button', { name: 'Close' }).click()

    for (const [index, scenarioId] of firstScenarioByPhase.entries()) {
      address = `scenario:${scenarioId}`
      if (scenarioId !== landingId) {
        await page.getByRole('button', { name: 'Open navigation' }).click()
        await page.locator(`[data-nav-row="${scenarioId}"] button`).first().click()
        await expect(page.locator('[data-cover-page]')).toHaveCount(0)
      }
      const board = page.locator(`[data-focus-slide-id="${scenarioId}"]`)
      await expect(board, `phase ${index + 1} first scenario`).toBeVisible()
      const cellCount = await waitForBoardSettled(
        board,
        scenarioId,
        page.url(),
      )
      expect(cellCount, 'the phone canvas draws its cells').toBeGreaterThan(0)
      await page.screenshot({
        path: join(MOBILE_SCREENSHOT_DIR, `phase-${index + 1}.png`),
      })
      assertNoProblems()
    }
  })
})
