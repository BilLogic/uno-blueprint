import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'

// Visual dimensions are board-relative; hit targets remain screen-relative.
async function slotSize(target: Locator, kind: 'step' | 'lane') {
  return target.locator('[data-structure-slot]').evaluate((el, axis) => {
    const board=el.closest('[data-structure-board]')!
    const scale=board.getBoundingClientRect().width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
    const b=el.getBoundingClientRect()
    return (axis === 'step' ? b.width : b.height)/scale
  }, kind)
}

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
          const scenarioButton = scenario.locator('button:not([aria-expanded])').first()
          await scenarioButton.click()
          await expect(scenarioButton).toHaveAttribute('aria-current','true')
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
        expect(await board.getByRole('button', {name:/^Add a lane/}).first().evaluate((el) => {
          const scope = el.closest('[data-structure-path]') ?? el.closest('[data-structure-board]')!
          const backdrop = scope.querySelector('[data-structure-label-backdrop]')!
          const view = el.ownerDocument.defaultView!
          return Number(view.getComputedStyle(el.parentElement!).zIndex) > Number(view.getComputedStyle(backdrop).zIndex)
        }), 'the header indicator paints above the opaque label backdrop').toBe(true)
        const headerCount = await board.locator('[data-blueprint-column-header]').count()
        await expect.poll(async () => {
          return board.evaluate((el) => {
            const headers = Array.from(el.querySelectorAll('[data-blueprint-column-header]')) as (typeof el)[]
            const triggers = (Array.from(el.querySelectorAll('[data-structure-seam]')) as (typeof el)[]).filter(node => node.getAttribute('aria-label')?.startsWith('Add a step'))
            const box = headers[0].getBoundingClientRect()
            return {count: triggers.length, outside: triggers.flatMap(node => {
              const target = node.getBoundingClientRect()
              return Math.abs(target.top - box.top) < 1.5 && Math.abs(target.bottom - box.bottom) < 1.5 ? [] : [{label:node.getAttribute('aria-label'),top:target.top,bottom:target.bottom,headerTop:box.top,headerBottom:box.bottom}]
            })}
          })
        }).toEqual({count:headerCount + 1, outside:[]})
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
        await expect(
          board.getByRole('button', { name: /^Select the .* step$/ }),
        ).toHaveCount(0)
        for (const axis of ['lane', 'step'] as const) {
          const label =
            axis === 'lane'
              ? laneHeader.locator('xpath=ancestor::*[@data-structure-header-cell][1]')
              : board
                  .getByRole('button', {
                    name: 'View details: Invoke ub:map',
                    exact: true,
                  })
                  .first()
          await expect(async () => {
            const a = await label.boundingBox()
            await page.waitForTimeout(100)
            expect(await label.boundingBox()).toEqual(a)
          }).toPass()
          const box = await label.boundingBox()
          await page.mouse.move(
            box!.x + box!.width / 2,
            box!.y + box!.height / 2,
          )
          // A stationary header hover must survive the insertion intent delay.
          await page.waitForTimeout(250)
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
          expect(await highlighted.locator('[data-structure-highlight="label"]').evaluate(el => {
            const view=el.ownerDocument.defaultView!
            return {outline:view.getComputedStyle(el).outlineStyle,stroke:view.getComputedStyle(el.closest('[data-structure-board]')!,'::after').boxShadow}
          }), 'pointer hover uses fill without an outline').toEqual({outline:'none',stroke:'none'})
          if (axis === 'lane') {
            const breathingRoom = await highlighted.locator('[data-structure-highlight="label"]').evaluate(el => {
              const title=el.querySelector('[data-structure-header-title]')!
              const b=el.getBoundingClientRect(), t=title.getBoundingClientRect()
              const board=el.closest('[data-structure-board]')!
              const scale=board.getBoundingClientRect().width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
              const fill=el.ownerDocument.defaultView!.getComputedStyle(el,'::before')
              return {top:(t.top-b.top)/scale-parseFloat(fill.top),left:(t.left-b.left)/scale-parseFloat(fill.left)}
            })
            expect(breathingRoom.top, 'the header fill has padding above its title').toBeGreaterThanOrEqual(6)
            expect(breathingRoom.left, 'the header fill has padding before its title').toBeGreaterThanOrEqual(6)
            expect(
              await highlighted
                .locator('[data-structure-highlight="label"]')
                .evaluate((el) => el.matches('[data-structure-header-cell]')),
              'hover fills the whole row-header cell',
            ).toBe(true)
          }
          await page.screenshot({
            path: join(
              VIEW_SCREENSHOT_DIR,
              `highlight-${axis}-${layout}-${theme}-${camera}.png`,
            ),
          })
          await page.mouse.move(24, 24)
        }
        // Arrow-routing corridors belong to the row and its header alike.
        const ownerHeader = board.locator('[data-structure-lane-label]').filter({has:page.getByRole('button',{name:'Blueprint owner',exact:true})}).first()
        const aligned = await ownerHeader.evaluate(el => {
          const header = el.querySelector('[data-structure-header-cell]') ?? el
          const scope = el.closest('[data-structure-path]') ?? el.closest('[data-structure-board]')!
          const row = scope.querySelector('[data-blueprint-row][data-lane-name="Blueprint owner"]')!
          const a=header.getBoundingClientRect(), b=row.getBoundingClientRect()
          return {top:Math.abs(a.top-b.top),bottom:Math.abs(a.bottom-b.bottom)}
        })
        for (const name of ['Blueprint owner','App & skill surface']) {
          const shell=board.locator(`[data-blueprint-row][data-lane-name="${name}"] [data-blueprint-cell-shell]`).first()
          const pad=await shell.evaluate(el=>{
            const s=el.ownerDocument.defaultView!.getComputedStyle(el)
            return [parseFloat(s.paddingTop),parseFloat(s.paddingBottom)]
          })
          expect(pad[0]).toBeGreaterThan(0)
          expect(pad[1], 'cells reserve the same padding before a semantic line').toBe(pad[0])
        }
        await ownerHeader.getByRole('button',{name:'Blueprint owner',exact:true}).hover()
        const contentRoom=await ownerHeader.evaluate(el=>{
          const board=el.closest('[data-structure-board]')!
          const scope=el.closest('[data-structure-path]') ?? board
          const row=scope.querySelector('[data-blueprint-row][data-lane-name="Blueprint owner"]')!
          const face=row.querySelector('[data-blueprint-cell-shell] [data-blueprint-cell-anchor]')!
          const origin=board.getBoundingClientRect(), scale=origin.width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
          const wash=board.ownerDocument.defaultView!.getComputedStyle(board,'::after')
          const top=parseFloat(wash.top), left=parseFloat(wash.left)
          const card=face.getBoundingClientRect(), bounds=row.getBoundingClientRect()
          return {aboveCard:(card.top-origin.top)/scale-top,beforeCard:(card.left-origin.left)/scale-left,aboveWash:top-(bounds.top-origin.top)/scale}
        })
        for (const gap of Object.values(contentRoom)) expect(gap, 'the wash has space inside and outside its content').toBeGreaterThan(5.9)
        await page.mouse.move(24,24)
        expect(aligned.top, 'row header and content start together').toBeLessThan(1)
        expect(aligned.bottom, 'row header includes the bottom arrow corridor').toBeLessThan(1)
        if (camera === 'overview') {
          await ownerHeader.getByRole('button',{name:'Blueprint owner',exact:true}).hover()
          await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`header-divider-alignment-${layout}-${theme}.png`)})
          await page.mouse.move(24,24)
        }
        if (layout === 'stacked') {
          await expect(board.locator('[data-canvas-reorder]')).toHaveCount(0)
          const picker = page.locator('[aria-label^="Paths shown:"]')
          await picker.click()
          let popup = await picker.getAttribute('aria-controls')
          let choices = page.locator(`[id="${popup}"] li button[aria-pressed]`)
          for (let index = 1; index < (await choices.count()); index++)
            if (
              (await choices.nth(index).getAttribute('aria-pressed')) === 'true'
            )
              await choices.nth(index).click()
          await page.keyboard.press('Escape')
          await page.waitForLoadState('networkidle')
          await expect(
            board.locator('[data-canvas-reorder-global]'),
          ).toHaveCount(1)
          const path = board.locator('[data-canvas-reorder]').first()
          for (const kind of ['step', 'lane'] as const) {
            // A drag can begin while the preceding hover gap is still closing.
            const hover = path
              .getByRole('button', { name: new RegExp(`^Add a ${kind}`) })
              .nth(1)
            await expect(async () => {
              const a = await hover.boundingBox()
              await page.waitForTimeout(100)
              expect(await hover.boundingBox()).toEqual(a)
            }).toPass()
            const hoverBox = await hover.boundingBox()
            await page.mouse.move(
              hoverBox!.x + (kind === 'step' ? hoverBox!.width / 2 : 6),
              hoverBox!.y + hoverBox!.height / 2,
            )
            await expect(hover).toHaveAttribute('data-open', '')
            await expect
              .poll(async () => {
                return slotSize(hover, kind)
              })
              .toBeGreaterThan(35)
            const headers =
              kind === 'step'
                ? board.locator('[data-step-header-affordance]')
                : path.locator('[data-structure-reorder="lane"]')
            const firstId = await headers
              .nth(0)
              .getAttribute('data-structure-id')
            const nextId = await headers
              .nth(1)
              .getAttribute('data-structure-id')
            const source =
              kind === 'step'
                ? board.locator(
                    `[data-step-header-affordance][data-structure-id="${firstId}"]`,
                  )
                : headers.nth(0)
            const target =
              kind === 'step'
                ? board.locator(
                    `[data-step-header-affordance][data-structure-id="${nextId}"]`,
                  )
                : headers.nth(1)
            await expect(async () => {
              const a = await source.boundingBox()
              await page.waitForTimeout(100)
              const b = await source.boundingBox()
              expect(b).toEqual(a)
            }).toPass()
            const before = await source.boundingBox()
            const writes: string[] = []
            const requestedOrders: string[][] = []
            const collect = (request: import('@playwright/test').Request) => {
              if (
                request.url().endsWith(`/rpc/reorder_${kind}s`) ||
                request.url().endsWith('/rpc/undo_structure_order')
              ) {
                writes.push(request.url())
                const body = request.postDataJSON() as Record<string, unknown>
                if (Array.isArray(body[`${kind}_ids`]))
                  requestedOrders.push(body[`${kind}_ids`] as string[])
              }
            }
            page.on('request', collect)
            await page.mouse.move(
              before!.x + before!.width / 2,
              before!.y + before!.height / 2,
            )
            await page.mouse.down()
            const settledDestination = await target.boundingBox()
            await page.mouse.move(
              settledDestination!.x + settledDestination!.width / 2,
              settledDestination!.y + settledDestination!.height / 2,
              { steps: 12 },
            )
            await expect(
              path.locator('[data-structure-landing]'),
              `the ${kind} drag keeps its landing slot`,
            ).toBeVisible()
            expect(
              await path.locator('[data-structure-lift]').count(),
            ).toBeGreaterThan(1)
            expect(writes).toHaveLength(0)
            await page.screenshot({
              path: join(
                VIEW_SCREENSHOT_DIR,
                `drag-${kind}-${theme}-${camera}.png`,
              ),
            })
            await page.mouse.up()
            await expect(
              page
                .locator('[data-write-failures]')
                .getByText(new RegExp(`Moved the .+ ${kind}$`)),
            ).toBeVisible()
            expect(writes).toHaveLength(1)
            expect(requestedOrders[0][0]).toBe(nextId)
            await page.waitForLoadState('networkidle')
            await expect(headers.nth(0)).toHaveAttribute(
              'data-structure-id',
              nextId!,
            )
            const notice = page.locator('[data-write-failures]').getByRole('status')
            await expect(notice).toHaveCount(1)
            const noticeBox = await notice.boundingBox()
            const toolbarBox = await page.locator('[data-annotation-toolbar]:visible').first().boundingBox()
            expect(noticeBox!.y + noticeBox!.height, 'the notice stays above the canvas toolbar').toBeLessThan(toolbarBox!.y - 8)
            expect(await notice.evaluate((el) => {
              const box = el.getBoundingClientRect()
              return (Array.from(el.querySelectorAll('button')) as (typeof el)[]).every(button => {
                const action = button.getBoundingClientRect()
                return action.top >= box.top && action.bottom <= box.bottom && action.left >= box.left && action.right <= box.right
              })
            }), 'notification actions stay within the shared Alert').toBe(true)
            await page.screenshot({path:join(VIEW_SCREENSHOT_DIR, `undo-notice-${kind}-${theme}-${camera}.png`)})
            await page
              .locator('[data-write-failures]')
              .getByRole('button', { name: 'Undo', exact: true })
              .click()
            await expect(page.locator('[data-write-failures]')).toHaveCount(0)
            await page.waitForLoadState('networkidle')
            expect(writes).toHaveLength(2)
            await expect(headers.nth(0)).toHaveAttribute(
              'data-structure-id',
              firstId!,
            )
            await expect(
              board.locator(
                '[data-blueprint-column-header][style*="translateX"]',
              ),
            ).toHaveCount(0)
            expect(writes).toHaveLength(2)
            page.off('request', collect)
            await page.mouse.move(24, 24)
          }
          await picker.click()
          popup = await picker.getAttribute('aria-controls')
          choices = page.locator(`[id="${popup}"] li button[aria-pressed]`)
          for (const choice of await choices.all())
            if ((await choice.getAttribute('aria-pressed')) !== 'true')
              await choice.click()
          await page.keyboard.press('Escape')
          await page.waitForLoadState('networkidle')
        } else {
          await expect(board.locator('[data-canvas-reorder]')).toHaveCount(0)
        }
        // Sample the real lane track, not the slot's painted opacity.
        const motionSeam = board
          .getByRole('button', {
            name: 'Add a lane below Journey figures',
            exact: true,
          })
          .first()
        await expect(async () => {
          const a = await motionSeam.boundingBox()
          await page.waitForTimeout(100)
          expect(await motionSeam.boundingBox()).toEqual(a)
        }).toPass()
        const motionBox = await motionSeam.boundingBox()
        const frames = motionSeam.evaluate(
          (element, center) =>
            new Promise<{ sizes: number[]; drift: number[] }>((resolve) => {
              const samples: number[] = []
              const drift: number[] = []
              const start = performance.now()
              const sample = () => {
                const slot = element
                  .querySelector('[data-structure-slot]')
                  ?.getBoundingClientRect()
                if (slot && slot.height > 1)
                  drift.push(Math.abs(slot.y + slot.height / 2 - center))
                const board=element.closest('[data-structure-board]')!
                const scale=board.getBoundingClientRect().width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
                samples.push((
                  element.ownerDocument
                    .querySelector('[data-structure-seam-track="lane"]')
                    ?.getBoundingClientRect().height ?? 0) / scale,
                )
                if (performance.now() - start < 1200)
                  element.ownerDocument.defaultView!.requestAnimationFrame(
                    sample,
                  )
                else resolve({ sizes: samples, drift })
              }
              element.ownerDocument.defaultView!.requestAnimationFrame(sample)
            }),
          motionBox!.y + motionBox!.height / 2,
        )
        await page.mouse.move(
          motionBox!.x + motionBox!.width / 2,
          motionBox!.y + motionBox!.height / 2,
        )
        const { sizes, drift } = await frames
        expect(
          Math.max(...drift),
          'the slot stays centered while the board grows',
        ).toBeLessThan(1)
        expect(
          new Set(
            sizes
              .filter((size) => size > 1 && size < 35)
              .map((size) => Math.round(size)),
          ).size,
          'the board must grow through intermediate sizes',
        ).toBeGreaterThan(3)
        await page.mouse.move(24, 24)
        await expect(
          board.locator('[data-structure-seam-track="lane"]'),
        ).toHaveCount(0)
        // The header block must grow with its actual empty track, rather than
        // painting its final width over neighbouring content during the move.
        for (const kind of ['step', 'lane'] as const) {
          const animated = board.getByRole('button', {
            name: kind === 'step' ? /^Add a step after Invoke ub:map/ : 'Add a lane below Journey figures',
            exact: kind === 'lane',
          }).first()
          const probe = await animated.boundingBox()
          const observe = () => animated.evaluate((element, axis) => new Promise<{overlap:number[]; mismatch:number[]; earlyIcon:number[]}>((resolve) => {
            const overlap:number[] = [], mismatch:number[] = [], earlyIcon:number[] = []
            const start = performance.now()
            const frame = () => {
              const scope = element.closest('[data-structure-board]')!
              const track = scope.querySelector(`[data-structure-seam-track="${axis}"]`)?.getBoundingClientRect()
              const trigger = element.querySelector('[data-structure-trigger]')!.getBoundingClientRect()
              const slot = element.querySelector('[data-structure-slot]')!.getBoundingClientRect()
              const icon = element.querySelector('[data-structure-trigger] svg')!
              const style = element.ownerDocument.defaultView!.getComputedStyle(icon)
              if (track) {
                const size = axis === 'step' ? track.width : track.height
                const painted = axis === 'step' ? trigger.width : trigger.height
                overlap.push(Math.max(0, painted - size))
                mismatch.push(axis === 'step' ? Math.abs(slot.left-track.left) : Math.abs(slot.top-track.top))
                const board=element.closest('[data-structure-board]')!
                const scale=board.getBoundingClientRect().width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
                if (size / scale < 16) earlyIcon.push(Number(style.opacity))
              }
              if (performance.now()-start < 1100) element.ownerDocument.defaultView!.requestAnimationFrame(frame)
              else resolve({overlap,mismatch,earlyIcon})
            }
            element.ownerDocument.defaultView!.requestAnimationFrame(frame)
          }), kind)
          const opening = observe()
          await page.mouse.move(probe!.x+probe!.width/2, probe!.y+probe!.height/2)
          const sequence = await opening
          expect(sequence.overlap.length, `${kind} opening was sampled`).toBeGreaterThan(4)
          expect(Math.max(...sequence.overlap), `${kind} header block fits the space on every frame`).toBeLessThan(1)
          expect(Math.max(...sequence.mismatch), `${kind} preview follows the actual track on every frame`).toBeLessThan(1)
          expect(Math.max(0,...sequence.earlyIcon), `${kind} plus waits for room`).toBe(0)
          const closing = observe()
          await page.mouse.move(24,24)
          const reverse = await closing
          expect(reverse.overlap.length, `${kind} closing was sampled`).toBeGreaterThan(4)
          expect(Math.max(...reverse.overlap), `${kind} header shrinks with the closing track`).toBeLessThan(1)
          expect(Math.max(...reverse.mismatch), `${kind} closing preview follows the track`).toBeLessThan(1)
          expect(Math.max(0,...reverse.earlyIcon), `${kind} plus disappears before the gap closes`).toBe(0)
          await expect(board.locator(`[data-structure-seam-track="${kind}"]`)).toHaveCount(0)
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
        await page.mouse.move(edgeBox!.x + 6, edgeBox!.y + edgeBox!.height / 2)
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
        if (camera === 'overview') {
          for (const line of ['Line of interaction', 'Line of visibility']) {
            const upper = board.getByRole('button',{name:`Add a lane above ${line}`,exact:true}).first()
            const rect = await upper.boundingBox()
            expect(rect, `an upper-side target exists for ${line}`).toBeTruthy()
            await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height - 2)
            await expect(upper).toHaveAttribute('data-open','')
            await page.waitForTimeout(200)
            await page.mouse.move(rect!.x + rect!.width / 2 + 1, rect!.y + rect!.height - 2)
            await page.waitForTimeout(200)
            await expect(upper, 'the upper entry remains reachable while the gap grows').toHaveAttribute('data-open','')
            await expect(async () => {
              expect(await upper.evaluate((el, name) => {
                const scope=el.closest('[data-structure-path]') ?? el.closest('[data-structure-board]')!
                const rule=scope.querySelector(`[data-blueprint-divider][aria-label="${name}"]`)!.getBoundingClientRect()
                const slot=el.querySelector('[data-structure-slot]')!.getBoundingClientRect()
                return Math.abs(slot.bottom-rule.top)
              },line), 'the upper slot meets the line without covering it').toBeLessThan(1)
            }).toPass()
            await page.mouse.move(24,24)
            await expect(upper).not.toHaveAttribute('data-open','')
            await expect(board.locator('[data-structure-seam-track="lane"]')).toHaveCount(0)
          }
        }
        // Merged path badges overlap the top of columns. In Stacked, that
        // space is clear; farther down meets the first lane's crossing seam.
        const stepProbeInset = 6
        for (const kind of ['lane', 'step'] as const) {
          const seams = board.getByRole('button', {
            name: new RegExp(`^Add a ${kind}`),
          })
          const opener = seams.nth(1)
          await page.keyboard.press('Tab')
          if (camera === '100%') {
            const viewport = page
              .locator('[data-zoom-pan-viewport]:visible')
              .first()
            const wheelPoint = await viewport.evaluate((el) => {
              const b = el.getBoundingClientRect()
              for (const [x, y] of [
                [b.left + 8, b.top + 8],
                [b.right - 8, b.top + 8],
                [b.left + 24, b.top + 32],
                [b.right - 24, b.bottom - 32],
              ]) {
                const hit = el.ownerDocument.elementFromPoint(x, y)
                if (
                  hit &&
                  el.contains(hit) &&
                  !hit.closest(
                    'button, a, input, [role=button], [data-blueprint-cell-anchor]',
                  )
                )
                  return { x, y }
              }
              throw new Error('No clear canvas ground for the zoom probe')
            })
            await page.mouse.move(wheelPoint.x, wheelPoint.y)
            const scale = () =>
              viewport
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
          if (camera === '100%') {
            // Put the crossing clear of the toolbar before aiming at it.
            const viewport = page
              .locator('[data-zoom-pan-viewport]:visible')
              .first()
            const view = await viewport.boundingBox()
            const target = await opener.boundingBox()
            await page.mouse.move(view!.x + 8, view!.y + 8)
            await page.mouse.wheel(
              target!.x + target!.width / 2 - view!.x - view!.width * (kind === 'lane' ? 0.25 : 0.5),
              target!.y + target!.height / 2 - view!.y - view!.height * (kind === 'step' ? 0.25 : 0.5),
            )
            await expect(async () => {
              const a = await opener.boundingBox()
              await page.waitForTimeout(100)
              expect(await opener.boundingBox()).toEqual(a)
            }).toPass()
          }
          const closed = await opener.boundingBox()

          const axis = kind === 'step' ? 'width' : 'height'
          expect(closed?.[axis]).toBeGreaterThan(8)
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
              return slotSize(opener, kind)
            })
            .toBeGreaterThanOrEqual(35)
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
          const visibleSize = await opener.locator('[data-structure-slot-fill]').evaluate((el, axis) => {
            const board=el.closest('[data-structure-board]')!
            const scale=board.getBoundingClientRect().width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
            const b=el.getBoundingClientRect(), slot=el.parentElement!.getBoundingClientRect()
            return {size:(axis === 'step' ? b.width : b.height)/scale,gutter:(axis === 'step' ? b.left-slot.left : b.top-slot.top)/scale}
          },kind)
          expect(visibleSize.size, 'the visible preview scales with the board').toBeCloseTo(28, 0)
          expect(visibleSize.gutter, 'the preview reserves space beside boundaries').toBeCloseTo(4, 0)
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
          const slotPoints = await opener.evaluate((el, itemKind) => {
            const slot = el.querySelector('[data-structure-slot]')!.getBoundingClientRect()
            const scope = el.closest('[data-structure-path]') ?? el.closest('[data-structure-board]')!
            const frame = scope.querySelector('[data-structure-content-frame]')!.getBoundingClientRect()
            const viewport = el.ownerDocument.documentElement
            if (slot.left < frame.left - 1 || slot.right > frame.right + 1 || slot.top < frame.top - 1 || slot.bottom > frame.bottom + 1)
              throw new Error('The insertion preview left its path frame')
            const left = Math.max(slot.left + 4, 310), right = Math.min(slot.right - 4, viewport.clientWidth - 40)
            const top = Math.max(slot.top + 4, 155), bottom = Math.min(slot.bottom - 4, viewport.clientHeight - 90)
            return [0.25, 0.5, 0.75].map(t => ({
              x: itemKind === 'lane' ? left + (right - left) * t : slot.left + slot.width / 2,
              y: itemKind === 'step' ? top + (bottom - top) * t : slot.top + slot.height / 2,
            })).filter(point => el.ownerDocument.elementFromPoint(point.x, point.y)?.closest('[data-structure-seam]') === el)
          }, kind)
          expect(slotPoints.length).toBeGreaterThan(0)
          for (const point of slotPoints) {
            await page.mouse.move(point.x, point.y)
            await page.waitForTimeout(180)
            await expect(opener).toHaveAttribute('data-open', '')
            await expect(board.locator('[data-structure-seam][data-open]')).toHaveCount(1)
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
          const insertionPoint = slotPoints.at(-1)!
          await page.mouse.click(insertionPoint.x, insertionPoint.y)
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
          await expect(rows.first()).toBeVisible()
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
        if (layout === 'stacked') {
        const emptyCell = board.locator('[data-lane-name="Stakeholders"] [data-blueprint-empty-slot]').first()
        await expect(emptyCell).toHaveCount(1)
        await page.getByRole('button', {name:'Jump to…', exact:true}).focus()
        await emptyCell.hover()
        expect(await emptyCell.evaluate(el => {
          const view=el.ownerDocument.defaultView!, preview=el.querySelector('[data-blueprint-empty-preview]')!
          const b=el.getBoundingClientRect(), p=preview.getBoundingClientRect()
          return {border:view.getComputedStyle(el).borderTopWidth,outline:view.getComputedStyle(preview).outlineStyle,insets:[p.left-b.left,p.top-b.top,b.right-p.right,b.bottom-p.bottom]}
        }), 'an empty cell paints one borderless fill with equal breathing room').toEqual({border:'0px',outline:'none',insets:expect.arrayContaining([expect.any(Number)])})
        const gaps=await emptyCell.evaluate(el=>{
          const b=el.getBoundingClientRect(), p=el.querySelector('[data-blueprint-empty-preview]')!.getBoundingClientRect()
          return [p.left-b.left,p.top-b.top,b.right-p.right,b.bottom-p.bottom]
        })
        expect(Math.min(...gaps)).toBeGreaterThan(1)
        expect(Math.max(...gaps)-Math.min(...gaps)).toBeLessThan(1)
        const emptyPreview=emptyCell.locator('[data-blueprint-empty-preview]')
        await expect(emptyPreview).toHaveCSS('opacity','1')
        await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`empty-cell-hover-${theme}-${camera}.png`)})
        await emptyCell.press('Shift')
        await expect(emptyPreview).toHaveCSS('outline-style','solid')
        await page.getByRole('button',{name:'Jump to…',exact:true}).focus()
        await emptyCell.hover()
        const emptyBox = await emptyCell.boundingBox()
        expect(emptyBox!.height, 'an empty lane still has a usable cell target').toBeGreaterThan(8)
        await page.mouse.move(emptyBox!.x + emptyBox!.width / 2, emptyBox!.y + 2)
        await page.waitForTimeout(200)
        await expect(board.locator('[data-structure-seam][data-open]')).toHaveCount(0)
        await page.mouse.click(emptyBox!.x + emptyBox!.width / 2, emptyBox!.y + 2)
        await expect(page.getByRole('heading', {name:'New cell', exact:true})).toBeVisible()
        await page.getByRole('button', {name:'Discard new cell', exact:true}).click()
        }
        await laneHeader.press('Shift')
        await page.mouse.move(24, 24)
        expect(
          await laneHeader.evaluate((el) => {
            const view = el.ownerDocument.defaultView!
            const cell = el.closest('[data-structure-header-cell]')!
            const style = view.getComputedStyle(cell)
            return (
              el.matches(':focus-visible') &&
              style.outlineStyle === 'solid' &&
              parseFloat(style.outlineWidth) > 0 &&
              view.getComputedStyle(el).boxShadow === 'none'
            )
          }),
          'keyboard focus stays on the whole cell without a second name ring',
        ).toBe(true)
        await page.screenshot({
          path: join(VIEW_SCREENSHOT_DIR, `row-focus-${layout}-${theme}-${camera}.png`),
        })
        await page.getByRole('button', {name:'Jump to…', exact:true}).focus()
        await laneHeader.click()
        await page.mouse.move(24, 24)
        expect(await laneHeader.evaluate(el => el.closest('[data-structure-header-cell]')?.hasAttribute('data-structure-highlight')), 'pointer focus does not keep a stale hover outline').toBe(false)
        expect(errors).toEqual([])
      })
    }
  }
}
