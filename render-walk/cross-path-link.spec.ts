import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './remote-images'
import { OUTPUT_DIR } from './playwright.config'

/**
 * A link that leaves its path, followed in a real browser.
 *
 * A dependency may join cells on two paths or two scenarios of one service
 * (ADR 0035). The board never draws it as an arrow; the cell at each end
 * wears a marker — "Continues in …" where it leaves, "Comes from …" where it
 * arrives — and the marker goes to the other end. jsdom proves which target a
 * marker hands the jump and what the jump asks of the navigation; it cannot
 * prove that the camera lands, that the far scenario opens with the far
 * cell's path on it, or that the far cell's panel opens. This case is those.
 *
 * ── WHICH LINK ─────────────────────────────────────────────────────────────
 *
 * Whichever the sample board carries: every scenario is opened on its default
 * path and the first leaving marker found is followed. This repository's
 * sample carries one, from Map your service to the audit roster. A
 * deployment's sample may carry none, and then this case says so and skips —
 * a deployment whose board has no cross-path link has nothing here to break.
 *
 * ── WHAT IT ASSERTS ────────────────────────────────────────────────────────
 *
 * Followed by click and then by Enter from the keyboard: the address lands on
 * the far cell (`cell=`) in the far scenario, the far cell is drawn, its panel
 * is open, and the board it landed on marks the same link arriving. Then the
 * console-error rule of the walk, as everywhere.
 *
 * ── WHAT IT BORROWS FROM THE APP ───────────────────────────────────────────
 *
 * `data-nav-row`, `data-cover-page`, the `phase-panel-<id>` region ids,
 * `data-focus-slide-id`, `data-blueprint-cell` and `data-cell-detail-panel`,
 * shared with the other specs; and the marker's own `data-cross-path-link`
 * (`out` / `in`) and `data-cross-path-target` (the far cell's id), listed in
 * `render-walk/README.md` § What the walk reads off the app.
 */

const SCREENSHOT_DIR = join(OUTPUT_DIR, 'views')

type ScenarioAddress = { phaseId: string; scenarioId: string }

/** Every scenario on the sample board, read from the sidebar. */
async function readScenarios(page: Page): Promise<ScenarioAddress[]> {
  await page.goto('./')
  await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
  const coverCta = page.locator('[data-cover-page] header button')
  if ((await coverCta.count()) > 0) {
    await coverCta.first().click()
    await expect(page.locator('[data-cover-page]')).toHaveCount(0)
  }

  const phaseRows = page.locator('[data-nav-row]:has(button[aria-controls^="phase-panel-"])')
  await expect(phaseRows.first()).toBeVisible()
  const scenarios: ScenarioAddress[] = []
  const phaseCount = await phaseRows.count()
  for (let index = 0; index < phaseCount; index += 1) {
    const row = phaseRows.nth(index)
    const phaseId = await row.getAttribute('data-nav-row')
    const chevron = row.locator('button[aria-controls^="phase-panel-"]')
    if ((await chevron.getAttribute('aria-expanded')) === 'false') {
      await chevron.click()
      await expect(chevron).toHaveAttribute('aria-expanded', 'true')
    }
    const rows = page.locator(`[id="phase-panel-${phaseId}"] [data-nav-row]`)
    for (let scenarioIndex = 0; scenarioIndex < (await rows.count()); scenarioIndex += 1) {
      const scenarioId = await rows.nth(scenarioIndex).getAttribute('data-nav-row')
      if (phaseId && scenarioId) scenarios.push({ phaseId, scenarioId })
    }
  }
  expect(scenarios.length, 'the sample board offers scenarios').toBeGreaterThan(0)
  return scenarios
}

function addressOf({ phaseId, scenarioId }: ScenarioAddress): string {
  return `./?${new URLSearchParams({ phase: phaseId, scenario: scenarioId }).toString()}`
}

/** The board's cells have arrived and stopped arriving. */
async function waitForCells(board: Locator): Promise<void> {
  await expect(board).toBeVisible()
  await expect
    .poll(async () => board.locator('[data-blueprint-cell]').count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  let previous = -1
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await board.locator('[data-blueprint-cell]').count()
    if (count === previous) return
    previous = count
    await board.page().waitForTimeout(150)
  }
}

/** The first leaving marker on any scenario's default board, and where it sits. */
async function findLeavingMarker(
  page: Page,
  scenarios: ScenarioAddress[],
): Promise<{ from: ScenarioAddress; targetId: string } | null> {
  for (const scenario of scenarios) {
    await page.goto(addressOf(scenario))
    const board = page.locator(`[data-focus-slide-id="${scenario.scenarioId}"]`)
    await waitForCells(board)
    const marker = board.locator('[data-cross-path-link="out"]').first()
    if ((await marker.count()) > 0) {
      const targetId = await marker.getAttribute('data-cross-path-target')
      if (targetId) return { from: scenario, targetId }
    }
  }
  return null
}

/** The jump landed: far cell addressed, drawn, panel open, link marked arriving. */
async function expectLandedOn(page: Page, targetId: string): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('cell'), {
      message: 'the address names the far cell',
      timeout: 10_000,
    })
    .toBe(targetId)
  const scenarioId = new URL(page.url()).searchParams.get('scenario')
  const board = page.locator(`[data-focus-slide-id="${scenarioId}"]`)
  await expect(
    board.locator(`[data-blueprint-cell="${targetId}"]`).first(),
    'the far cell is drawn on the board the jump landed on',
  ).toBeVisible()
  await expect(
    page.locator('[data-cell-detail-panel]').first(),
    'the far cell’s panel is open',
  ).toBeVisible()
  await expect(
    board.locator('[data-cross-path-link="in"]').first(),
    'the board at the far end marks the link arriving',
  ).toBeVisible()
}

test.describe('a cross-path link', () => {
  test('its marker goes to the other end, by click and by Enter', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

    const scenarios = await readScenarios(page)
    const found = await findLeavingMarker(page, scenarios)
    test.skip(
      found === null,
      'no scenario’s default board carries a link to another path — nothing to follow',
    )
    if (!found) return

    await test.step('by click', async () => {
      await page.goto(addressOf(found.from))
      const board = page.locator(`[data-focus-slide-id="${found.from.scenarioId}"]`)
      await waitForCells(board)
      await board
        .locator(`[data-cross-path-link="out"][data-cross-path-target="${found.targetId}"]`)
        .first()
        .click()
      await expectLandedOn(page, found.targetId)
      mkdirSync(SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({ path: join(SCREENSHOT_DIR, 'cross-path-link-landed.png') })
    })

    await test.step('by Enter', async () => {
      await page.goto(addressOf(found.from))
      const board = page.locator(`[data-focus-slide-id="${found.from.scenarioId}"]`)
      await waitForCells(board)
      const marker = board
        .locator(`[data-cross-path-link="out"][data-cross-path-target="${found.targetId}"]`)
        .first()
      await marker.focus()
      await page.keyboard.press('Enter')
      await expectLandedOn(page, found.targetId)
    })

    expect(problems, 'no browser errors while following the link').toEqual([])
  })
})
