import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './remote-images'
import { OUTPUT_DIR } from './playwright.config'

/**
 * The annotation-drag flow, in a real browser.
 *
 * ── WHY THIS EXISTS BESIDE THE JSDOM SLICE ─────────────────────────────────
 *
 * `src/slices/annotationDrag.slice.test.tsx` runs the same flow end to end
 * over the real toolbar, layer, provider and capture menu, and it is the
 * faster guard by two orders of magnitude. But it stubs exactly three things,
 * and those three are the three jsdom cannot do at all:
 *
 *   1. **Layout.** Every rectangle in the slice is a value the test wrote.
 *      Here the cells are wherever the grid put them, and the mark's box is
 *      whatever the browser lays out.
 *   2. **The camera.** The slice stamps an on-screen rect and an
 *      `offsetWidth` that stand for a zoom. Here the canvas is under a live
 *      CSS transform — the board this walk opens is around 0.47 — and
 *      `clientToLocal` / `getLayerScale` recover it from a real
 *      `getBoundingClientRect` the way they do in front of a person.
 *   3. **Pointer capture.** jsdom implements neither
 *      `setPointerCapture` nor `releasePointerCapture`, so the slice hands
 *      the layer two no-ops. Here the layer really takes the pointer, and a
 *      drag whose moves went somewhere else would land on the wrong cell.
 *
 * So this case is not a duplicate of the slice; it is the part of the slice
 * that was stubbed, unstubbed. A split of `CanvasAnnotationLayer.tsx` that
 * dropped the scale term out of the un-projection stays green in jsdom at
 * zoom 1 and goes red here.
 *
 * ── WHAT IT ASSERTS, AND HOW THE CAPTURE IS OBSERVED ───────────────────────
 *
 * The capture is read back through the app, not through a hook: the capture
 * menu's own **Save N marks** item writes the captured JSON as a download, and
 * that file carries each mark's `overlaps` — the cell ids the flow exists to
 * get right. Nothing was added to the app to make this readable. (The menu's
 * other item, **Send to the agent**, is absent here on purpose: it is gated on
 * `canWrite`, and the walk previews a build with no database configured. The
 * agent attachment is the slice's read-back; the download is this one's, and
 * both are `captureMarks` over the same cell rects.)
 *
 * ── WHAT IT BORROWS FROM THE APP ───────────────────────────────────────────
 *
 * `data-nav-row`, `data-cover-page`, the `phase-panel-<id>` region ids,
 * `data-focus-slide-id`, `data-blueprint-cell`,
 * `data-canvas-annotation-layer`, `data-annotation-id`, and the `Rectangle` /
 * `Rectangle — Shapes tools` / `Save or send these marks` accessible names.
 * The first six are shared with `sample-board.spec.ts` and listed in
 * `render-walk/README.md` § What the walk reads off the app, where the last
 * three are listed too.
 *
 * The console-error rule of the walk applies here as well: any `console.error`
 * or page error during the flow fails this test, and
 * `RENDER_WALK_INJECT_CONSOLE_ERROR` makes it fail on purpose.
 */

/** A cell as the browser laid it out: its id and its box on screen. */
type CellBox = { id: string; x: number; y: number; width: number; height: number }

/**
 * Open the first scenario of the first phase.
 *
 * Which board it is does not matter — this case needs three cells side by
 * side in one lane, which every board on every deployment's sample has, and
 * the ids come off the page rather than out of `sampleBlueprint.ts` for the
 * same reason the sample-board walk reads its inventory there.
 */
async function openFirstBoard(page: Page): Promise<Locator> {
  await page.goto('./')

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

  await expect(
    page.locator('[data-editor-top-nav]').getByText('sample data', { exact: true }),
    'the preview is in no-database mode, showing the bundled sample board',
  ).toBeVisible()

  const phaseRows = page.locator(
    '[data-nav-row]:has(button[aria-controls^="phase-panel-"])',
  )
  await expect(phaseRows.first()).toBeVisible()
  const chevron = phaseRows
    .first()
    .locator('button[aria-controls^="phase-panel-"]')
  if ((await chevron.getAttribute('aria-expanded')) === 'false') {
    await chevron.click()
    await expect(chevron).toHaveAttribute('aria-expanded', 'true')
  }
  const panelId = await chevron.getAttribute('aria-controls')
  expect(panelId, 'the first phase names its panel').toBeTruthy()

  const scenarioRow = page.locator(`[id="${panelId}"] [data-nav-row]`).first()
  const scenarioId = await scenarioRow.getAttribute('data-nav-row')
  expect(scenarioId, 'the first phase offers a scenario').toBeTruthy()
  await scenarioRow.locator('button:not([aria-expanded])').click()

  const board = page.locator(`[data-focus-slide-id="${scenarioId}"]`)
  await expect(board, 'the first scenario board is on screen').toBeVisible()
  return board
}

/**
 * Three cells of one lane, left to right, once the camera has stopped moving.
 *
 * Opening a board flies the canvas to it, so every box read before the flight
 * lands is a box that will have moved by the time the mouse gets there — the
 * same settling `sample-board.spec.ts` waits for, watched here on the boxes
 * this case is about to press on rather than on the artboard.
 *
 * Boxes are deduplicated by cell id: a cell's frame and its inner content can
 * both carry `data-blueprint-cell`, and the capture menu's own cell sweep sees
 * those the same way.
 */
async function readThreeCellsInALane(board: Locator): Promise<CellBox[]> {
  const deadline = Date.now() + 20 * 1000
  let previous = ''
  let settled: CellBox[] = []

  while (Date.now() < deadline) {
    const cells = board.locator('[data-blueprint-cell]')
    const count = await cells.count()
    const byId = new Map<string, CellBox>()
    for (let index = 0; index < count; index += 1) {
      const cell = cells.nth(index)
      const id = await cell.getAttribute('data-blueprint-cell')
      if (!id || byId.has(id)) continue
      const box = await cell.boundingBox()
      if (!box || box.width === 0 || box.height === 0) continue
      // Reachable by the mouse, and clear of the floating toolbar at the
      // bottom of the viewport, which would swallow a press meant for a cell.
      if (box.y < 120 || box.y + box.height > 900) continue
      byId.set(id, { id, ...box })
    }

    // One lane is one row of boxes at the same top edge. Rounding to five
    // pixels is what makes "the same lane" a question the layout can answer.
    const lanes = new Map<number, CellBox[]>()
    for (const box of byId.values()) {
      const lane = Math.round(box.y / 5)
      lanes.set(lane, [...(lanes.get(lane) ?? []), box])
    }
    const widest = [...lanes.values()]
      .map((lane) => lane.slice().sort((left, right) => left.x - right.x))
      .filter((lane) => lane.length >= 3)
      .sort((left, right) => right.length - left.length)[0]

    const current = widest
      ? widest.map((box) => `${box.id}@${box.x}:${box.y}`).join('|')
      : ''
    if (current !== '' && current === previous) {
      settled = widest as CellBox[]
      break
    }
    previous = current
    await board.page().waitForTimeout(150)
  }

  expect(
    settled.length,
    'a lane of this board offers three cells side by side, at rest',
  ).toBeGreaterThanOrEqual(3)
  return settled.slice(0, 3)
}

/** Press, move in steps, release — a gesture the layer sees as many samples. */
async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps,
    )
    // A frame between samples, because the drag publishes once a frame and
    // a gesture delivered in one tick would prove nothing about the queue.
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

/**
 * What the app says the marks cover, taken from the capture menu's download.
 *
 * One cell id list per mark, in the menu's own order.
 */
async function captureCoveredCells(page: Page): Promise<string[][]> {
  await page.locator('button[aria-label="Save or send these marks"]').click()
  const save = page.getByRole('menuitem', { name: /Save \d+ mark/ })
  await expect(save, 'the capture menu offers the save item').toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await save.click()
  const download = await downloadPromise
  // The download starts inside the item's click handler, before the menu has
  // gone. The menu is modal while it is mounted — the page under it takes no
  // pointer — so a press sent before it unmounts lands on nothing, and the
  // drag that follows this read-back would silently not start. Wait for the
  // menu to be gone before handing the page back.
  await expect(save, 'the capture menu has closed').toBeHidden()

  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    marks: Array<{ type: string; overlaps: string[] }>
  }
  return payload.marks.map((mark) => mark.overlaps)
}


test.describe('the annotation layer, in a browser', () => {
  test('a box drawn across two cells drags onto a third, and the capture says so', async ({
    page,
  }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true })

    // The same self-test the sample-board walk carries: a run that reports no
    // console errors looks identical whether the page was clean or the
    // listener was never wired up.
    if (process.env.RENDER_WALK_INJECT_CONSOLE_ERROR) {
      await page.addInitScript(() => {
        console.error('render-walk self-test: injected')
      })
    }

    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(`console.error: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => {
      problems.push(`pageerror: ${error.message}`)
    })
    const assertNoProblems = (when: string) => {
      if (problems.length === 0) return
      throw new Error(
        `${problems.length} browser error${problems.length === 1 ? '' : 's'} ${when}:\n${problems.map((detail) => `    ${detail}`).join('\n')}`,
      )
    }

    const board = await openFirstBoard(page)
    const [first, second, third] = await readThreeCellsInALane(board)
    assertNoProblems('while opening the board')

    // Annotation mode, from the real toolbar. The Shapes slot's face is the
    // rectangle, and picking it is what makes the layer take the pointer.
    await page.locator('button[aria-label="Rectangle"]').click()
    await expect(
      page.locator('button[aria-label="Rectangle — Shapes tools"]'),
      'the rectangle tool is the live one',
    ).toHaveAttribute('aria-pressed', 'true')

    // A box that spans the gap between the first two cells: narrow enough to
    // fit inside ONE cell after the drag, which is what makes the read-back
    // change from two ids to one rather than from two to two others.
    const laneMiddle = first.y + first.height / 2
    await dragMouse(
      page,
      { x: first.x + first.width - 6, y: first.y + 6 },
      { x: second.x + 6, y: first.y + first.height - 6 },
    )
    // A new mark opens in text-edit, and a drag starts only once that is
    // dismissed. The editor takes focus a frame
    // later. Escape belongs to whichever surface is up: with the editor
    // focused it closes the editor; sent before that, it reaches the canvas
    // as the return to the overview, and the board zooms out from under the
    // mark. Wait for the editor before dismissing it.
    await expect(
      page.locator('[data-canvas-annotation-layer] [data-annotation-id] textarea'),
      'the new mark opened its editor and took focus',
    ).toBeFocused()
    await page.keyboard.press('Escape')

    const mark = page.locator('[data-canvas-annotation-layer] [data-annotation-id]')
    await expect(mark, 'the drawn box is on the layer').toHaveCount(1)
    const drawnBox = await mark.first().boundingBox()
    expect(drawnBox, 'the drawn box has a box on screen').toBeTruthy()

    expect(
      (await captureCoveredCells(page)).map((cells) => cells.slice().sort()),
      'the capture names the two cells the box was drawn over',
    ).toEqual([[first.id, second.id].sort()])
    assertNoProblems('while drawing the box')

    // Now drag it onto the third cell. The press is six pixels inside the top
    // edge: the mark's own label takes a press in the middle of the box and
    // opens the editor instead of starting a drag.
    const grab = {
      x: drawnBox!.x + drawnBox!.width / 2,
      y: drawnBox!.y + 6,
    }
    await dragMouse(page, grab, {
      x: third.x + third.width / 2,
      y: grab.y,
    })

    const draggedBox = await mark.first().boundingBox()
    expect(draggedBox, 'the dragged box has a box on screen').toBeTruthy()
    expect(
      draggedBox!.x,
      'the mark moved right, by about what the mouse moved',
    ).toBeGreaterThan(drawnBox!.x + (third.x - first.x) / 2)
    expect(
      draggedBox!.y,
      'a horizontal drag did not move the mark vertically',
    ).toBeCloseTo(drawnBox!.y, 0)
    expect(
      laneMiddle > draggedBox!.y &&
        laneMiddle < draggedBox!.y + draggedBox!.height,
      'the mark is still in the lane it was drawn in',
    ).toBe(true)

    await page.screenshot({ path: join(OUTPUT_DIR, 'annotation-drag.png') })

    expect(
      await captureCoveredCells(page),
      'the capture now names only the cell the box was dragged onto',
    ).toEqual([[third.id]])
    assertNoProblems('while dragging the box')

    console.log(
      `render-walk: annotation drag over ${first.id} + ${second.id} → ${third.id}; ` +
        `screenshot in ${join(OUTPUT_DIR, 'annotation-drag.png')}`,
    )
  })
})
