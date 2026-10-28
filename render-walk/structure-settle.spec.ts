import { expect } from '@playwright/test'
import { test } from './remote-images'
import { writeFileSync } from 'node:fs'

const canvas = process.env.RENDER_WALK_CANVAS_URL
test.use({ video: 'on' })

for (const theme of ['light', 'dark'] as const) {
  for (const { kind, name, neighbour } of [
    { kind: 'lane', name: 'Journey figures', neighbour: 'Blueprint owner' },
    { kind: 'lane', name: 'App & skill surface', neighbour: 'Claude in the IDE' },
    { kind: 'step', name: 'first step', neighbour: '' },
  ] as const) {
    test(`a ${name} drop never paints its old seat — ${theme}`, async ({ page }, info) => {
      test.setTimeout(60_000)
      test.skip(!canvas, 'Requires the isolated local authoring stack.')
      await page.goto(new URL('/keeping-a-blueprint-true', canvas).href)
      await page.getByRole('button', { name: 'Open the blueprint', exact: true }).click()
      await page.getByRole('button', { name: 'Open Setup phase', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Expand Setup', exact: true }).click()
      await page.locator('[data-nav-row]').getByRole('button', { name: 'Map your service', exact: true }).click()
      await page.waitForLoadState('networkidle')
      const themeSwitch = page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true })
      if (await themeSwitch.count()) await themeSwitch.click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      const board = page.locator('[data-focus-slide-id="f0000000-0000-4000-8000-200000000001"]')
      const source = kind === 'lane'
        ? board.getByRole('button', { name, exact: true })
        : board.locator('[data-blueprint-column-header] [data-structure-reorder="step"]').first()
      const id = await source.getAttribute('data-structure-id')
      const parts = kind === 'lane' ? '[data-structure-lane-label]' : '[data-blueprint-column-header]'
      const headers = board.locator(`${parts}:has([data-structure-reorder="${kind}"])`)
      const geometry = () => headers.evaluateAll(nodes => nodes.map(el => ({
        id: el.textContent,
        rect: el.getBoundingClientRect().toJSON(),
        style: el.getAttribute('style'),
      })))
      const beforeGeometry = await geometry()
      const index = await headers.evaluateAll((nodes, id) => nodes.findIndex(el => el.querySelector(`[data-structure-id="${id}"]`)), id)
      const target = kind === 'lane'
        ? headers.filter({ has: page.getByRole('button', { name: neighbour, exact: true }) })
        : headers.nth(index + 1)
      const from = await source.boundingBox(), to = await target.boundingBox()
      await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
      await page.mouse.down()
      await page.mouse.move(kind === 'step' ? to!.x + to!.width / 2 : from!.x + from!.width / 2, kind === 'lane' ? to!.y + to!.height / 2 : from!.y + from!.height / 2, { steps: 12 })
      const slot = board.locator('[data-structure-landing]')
      await expect(slot).toBeVisible()
      // Lift chrome is ready once the dragged parts are marked and the landing
      // track has a painted size — not after an arbitrary sleep.
      await expect(board.locator('[data-structure-lift]').first()).toBeVisible()
      await expect
        .poll(async () => {
          const box = await slot.boundingBox()
          return box ? Math.max(box.width, box.height) : 0
        })
        .toBeGreaterThan(4)
      await page.screenshot({ path: info.outputPath(`${kind}-lifted.png`) })
      // Start sampling inside pointerup, before the application handles it.
      const samples = board.evaluate((el, { id, kind }) => new Promise<number[]>(resolve => {
        const document = el.ownerDocument
        const view = document.defaultView!
        const selector = `[data-structure-reorder="${kind}"][data-structure-id="${id}"]`
        const read = () => {
          const box = document.querySelector(selector)!.getBoundingClientRect()
          return kind === 'lane' ? box.top : box.left
        }
        document.addEventListener('pointerup', () => {
          const points: number[] = []
          const frame = () => {
            points.push(read())
            if (points.length < 40) view.requestAnimationFrame(frame)
            else resolve(points)
          }
          view.requestAnimationFrame(frame)
        }, { capture: true, once: true })
        el.setAttribute('data-drop-sampling', '')
      }), { id, kind })
      await expect(board).toHaveAttribute('data-drop-sampling', '')
      await page.mouse.up()
      const positions = await samples
      writeFileSync(info.outputPath('frames.json'), JSON.stringify(positions))
      await info.attach('post-drop-frames', { body: JSON.stringify(positions), contentType: 'application/json' })
      await page.screenshot({ path: info.outputPath(`${kind}-settled.png`) })
      const undo = page.locator('[data-write-failures]').getByRole('button', { name: 'Undo', exact: true })
      await expect(undo).toBeVisible()
      const finalBox = await board.locator(`[data-structure-reorder="${kind}"][data-structure-id="${id}"]`).evaluate(el => el.getBoundingClientRect().toJSON())
      const savedSeat = kind === 'lane' ? finalBox.top : finalBox.left
      // Count named boundaries; the content grid paints an unlabelled copy.
      await expect(board.getByRole('separator', { name: 'Line of visibility', exact: true })).toHaveCount(1)
      writeFileSync(info.outputPath('geometry.json'), JSON.stringify({ before: beforeGeometry, after: await geometry() }, null, 2))
      await undo.click()
      expect(Math.max(...positions) - Math.min(...positions), 'every painted frame stays at the saved seat').toBeLessThan(1)
      expect(Math.abs(positions.at(-1)! - savedSeat), 'the parked preview agrees with the saved layout').toBeLessThan(1)
    })
  }
}
