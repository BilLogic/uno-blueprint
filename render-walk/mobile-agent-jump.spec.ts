import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'

/**
 * The phone's agent jump, in a real browser at 375×812.
 *
 * ── WHY THIS EXISTS BESIDE THE JSDOM SLICE ─────────────────────────────────
 *
 * `src/slices/phoneAgentJump.slice.test.tsx` runs the same flow end to end
 * over the real shell, sheet, bridge and navigation tools, and it is the
 * faster guard by two orders of magnitude. But it runs in jsdom, which lays
 * nothing out and schedules no frames, so it turns the clock by hand and
 * stands a dozen lines in for the viewport. Three of its claims are therefore
 * not its to make, and they are the ones a reader would notice first:
 *
 *   1. **The wall clock.** The slice advances fake timers, so the tool's
 *      1800 ms verification deadline and the caret watcher's 2000 ms one are
 *      never actually raced. Here they are: the fade, the remount, the fit
 *      and the poll all take the time they take, and the sentence the tool
 *      answers with — settled, or "not verified before timeout" — is the
 *      deadline, measured.
 *   2. **The strip above the sheet is legible.** The slice asserts a NUMBER
 *      reached the camera. Whether the wash over that strip is thin enough to
 *      read the canvas through is a fact about a compositor, and this case
 *      asserts the overlay's weight and files the screenshot a person reads.
 *   3. **The destination rendered above the sheet, legibly.** The board the
 *      agent was asked for has a box, the sheet has a box, a strip-full of
 *      the first is above the second, and cells with words in them are wholly
 *      inside the strip. It renders there because the phone's fit floor
 *      anchors the board to its top-left, NOT because the sheet's height was
 *      handed to the camera — the slice owns that the number is delivered,
 *      the camera hook's flight test owns what a number like it frames, and
 *      no assertion on this page can tell the two apart. See the note over
 *      that block.
 *
 * ── HOW THE AGENT IS DRIVEN WITHOUT A MODEL ────────────────────────────────
 *
 * The provider endpoint is intercepted and answered with a canned round: one
 * `tool_use` for `open_scenario` naming a scenario read off this board, then
 * one text turn. Everything after the response body is the shipped code —
 * the loop, the tool registry, `open_scenario`, the bridge, the shell, the
 * viewport — which is the whole point: what is faked is the model, not the
 * app. The key is a string in this file's own `localStorage` seed and reaches
 * no network, because no request leaves the page.
 *
 * ── WHAT IT BORROWS FROM THE APP ───────────────────────────────────────────
 *
 * `data-cover-page`, `data-nav-row`, `data-focus-slide-id`, the
 * `sheet-content` / `sheet-overlay` slots, the `Messages` region, and the
 * `Open navigation` / `Close` / `Ask the agent` / `New session` / `Send`
 * accessible names. They are listed in `render-walk/README.md` § What the
 * walk reads off the app.
 *
 * The storage prefix is this template's own (`ub-`), and a deployment that
 * renamed its namespace passes `RENDER_WALK_STORAGE_PREFIX`: the seed below
 * is the one thing in this directory that has to know an installation's
 * prefix, because nothing on the page publishes it.
 *
 * The console-error rule of the walk applies here as well: any `console.error`
 * or page error during the flow fails this test, and
 * `RENDER_WALK_INJECT_CONSOLE_ERROR` makes it fail on purpose.
 */

/**
 * The browser globals the page-side callbacks below touch.
 *
 * `render-walk/` is typechecked in this repository's NODE program — these
 * files are Node programs that DRIVE a browser — so the DOM lib is out of
 * scope here even though the bodies handed to `addInitScript` and `evaluate`
 * are evaluated in the page. Declaring exactly what those bodies use keeps
 * the config honest for every other file in that program, and keeps the
 * surface this spec assumes of the page written down.
 */
declare const window: {
  localStorage: { setItem(key: string, value: string): void }
}
declare function getComputedStyle(node: unknown): {
  backdropFilter: string
  webkitBackdropFilter: string
  backgroundColor: string
  opacity: string
}
declare const document: {
  createRange(): {
    selectNodeContents(node: unknown): void
    getClientRects(): ArrayLike<{
      left: number
      right: number
      top: number
      bottom: number
      width: number
      height: number
    }>
  }
}

const MOBILE_SCREENSHOT_DIR = join(VIEW_SCREENSHOT_DIR, 'mobile')

/** The namespace this installation's keys live under — see the header. */
const STORAGE_PREFIX = process.env.RENDER_WALK_STORAGE_PREFIX ?? 'ub-'

/** What a landed scenario jump answers with, from `lib/agent/uiBridge.ts`. */
const CAMERA_SETTLED = 'Opened the scenario and settled its canvas camera.'

/** The halves of a send this spec reads back off the intercepted request. */
type SentRound = {
  /** Every system block's text, joined — the role, the skills, the board. */
  system: string
  /** The tool specs, in the order the adapter serialised them. */
  tools: Array<{ name?: unknown; input_schema?: unknown }>
}

/**
 * Answer the provider with one tool call and then one sentence, and keep
 * what was SENT.
 *
 * Stateful by design: the loop sends again with the tool's result, and a
 * handler that replied `tool_use` twice would loop until the round cap.
 *
 * The rounds are collected because a canned answer only exercises the
 * adapter's response half. A broken tools or system serialisation — a tool
 * array the shape of nothing, an empty system block — is a 400 from the real
 * provider and green here, so the caller asserts on the first round's body
 * and the interception becomes a two-way check.
 */
async function scriptTheModel(page: Page, scenarioId: string) {
  const sent: SentRound[] = []
  let rounds = 0
  await page.route('https://api.anthropic.com/**', async (route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    rounds += 1
    const request = route.request().postDataJSON() as {
      system?: Array<{ text?: string }>
      tools?: Array<{ name?: unknown; input_schema?: unknown }>
    }
    sent.push({
      system: (request.system ?? []).map((block) => block.text ?? '').join('\n'),
      tools: request.tools ?? [],
    })
    const body =
      rounds === 1
        ? {
            content: [
              {
                type: 'tool_use',
                id: 'call-1',
                name: 'open_scenario',
                input: { scenario_id: scenarioId },
              },
            ],
            stop_reason: 'tool_use',
          }
        : {
            content: [{ type: 'text', text: 'Taken you there.' }],
            stop_reason: 'end_turn',
          }
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  })
  return sent
}

/**
 * The alpha of a computed colour, whichever notation the engine answers in.
 *
 * Chromium returns the modern space the theme is authored in
 * (`oklab(L a b / 0.4)`) and the legacy one (`rgba(r, g, b, 0.4)`) depending
 * on the declaration, and a reader of one form only would score a translucent
 * wash as opaque and pass an assertion meant to catch exactly that.
 */
function alphaOf(colour: string): number {
  const slashed = /\/\s*([\d.]+)%?\s*\)/.exec(colour)
  if (slashed) return Number(slashed[1]) / (colour.includes('%)') ? 100 : 1)
  const legacy = /rgba?\([^)]*?,\s*([\d.]+)\s*\)$/.exec(colour)
  return legacy ? Number(legacy[1]) : 1
}

test.describe('the phone agent jump', () => {
  test('moves the camera with the sheet up, above it, inside the deadline', async ({
    page,
  }) => {
    mkdirSync(MOBILE_SCREENSHOT_DIR, { recursive: true })

    const prefix = STORAGE_PREFIX
    await page.addInitScript(
      ([keyPrefix]) => {
        window.localStorage.setItem(
          `${keyPrefix}agent-settings`,
          JSON.stringify({
            provider: 'anthropic',
            models: {},
            keys: { anthropic: 'render-walk-key' },
          }),
        )
      },
      [prefix],
    )

    if (process.env.RENDER_WALK_INJECT_CONSOLE_ERROR) {
      await page.addInitScript(() => {
        console.error('render-walk self-test: injected')
      })
    }

    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error')
        problems.push(`console.error: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
    /** Fail the flow if any console or page error was recorded. */
    const assertNoProblems = (where: string) =>
      expect(problems, `${where}: ${problems.join('\n')}`).toEqual([])

    await page.goto('./')
    const cover = page.locator('[data-cover-page]')
    await expect(cover).toBeVisible()
    await cover.locator('header button').first().click()
    await expect(page.locator('[data-cover-page]')).toHaveCount(0)

    const landing = page.locator('[data-focus-slide-id]').first()
    await expect(landing).toBeVisible()
    const landingId = await landing.getAttribute('data-focus-slide-id')
    assertNoProblems('on the CTA landing')

    // The destination, read off the drawer rather than out of
    // `sampleBlueprint.ts`: this walk runs against a deployment's OWN sample
    // board. The LAST phase's first scenario, so the jump is a real move off
    // the phase the CTA landed on.
    await page.getByRole('button', { name: 'Open navigation' }).click()
    const phaseToggles = page.locator('[data-nav-row] button[aria-expanded]')
    await expect(phaseToggles.first()).toBeVisible()
    const lastPhase = phaseToggles.last()
    if ((await lastPhase.getAttribute('aria-expanded')) === 'false') {
      await lastPhase.click()
      await expect(lastPhase).toHaveAttribute('aria-expanded', 'true')
    }
    const destination = await lastPhase
      .locator('xpath=ancestor::*[@data-nav-row][1]')
      .locator('xpath=following-sibling::*//*[@data-nav-row]')
      .first()
      .getAttribute('data-nav-row')
    expect(destination, 'the last phase offers a scenario').toBeTruthy()
    expect(
      destination,
      'the destination is not the scenario already on screen',
    ).not.toBe(landingId)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0)

    const sent = await scriptTheModel(page, destination as string)

    // The reader opens the ✦ sheet and asks for the move.
    await page.getByRole('button', { name: 'Ask the agent' }).click()
    // The ✦ sheet by its ROLE and by its OWN title, with the composer read
    // out of it — not by "a bottom sheet is up somewhere". The index drawer
    // is a bottom sheet too, and a dialog layered over this one (the session
    // rename) takes the sheet under it out of the accessibility tree while a
    // bare `[data-slot="sheet-content"]` still finds the node. That is a real
    // failure this flow hit in jsdom, and this is the check the slice makes
    // for it.
    const sheet = page
      .getByRole('dialog')
      .filter({ has: page.locator('[data-slot="sheet-title"]:text-is("Agent")') })
    await expect(sheet).toBeVisible()
    await page.getByRole('button', { name: 'New session' }).click()
    const composer = sheet.locator('textarea[data-agent-composer]')
    await expect(composer).toBeEnabled()
    await composer.fill('Take me to the last phase.')
    const askedAt = Date.now()
    await page.getByRole('button', { name: 'Send' }).click()

    // THE TOOL'S OWN ANSWER IS THE DEADLINE, MEASURED. `open_scenario` waits
    // on the selection and on the camera's published verdict for at most
    // 1800 ms and says which it got; the row below carries that sentence, so
    // a fit that landed too late for a real device reads as a timeout here
    // rather than as a pass.
    const messages = page.getByRole('region', { name: 'Messages' })
    const toolRow = messages
      .getByText('open_scenario', { exact: true })
      .locator('xpath=ancestor::button[1]')
    await expect(toolRow).toBeVisible({ timeout: 30_000 })
    await toolRow.click()
    await expect(
      messages.getByText(CAMERA_SETTLED, { exact: false }),
    ).toBeVisible()
    const settledIn = Date.now() - askedAt

    // THE SHEET STAYED, with the conversation in it.
    await expect(sheet).toBeVisible()
    await expect(composer).toBeVisible()

    // THE DESTINATION RENDERED ABOVE THE SHEET, LEGIBLY. That is all this
    // block claims, and the narrower claim is deliberate.
    //
    // It used to say it caught a shell that had thrown the sheet's height
    // away as a fit inset. It does not, and no assertion on this page could:
    // the phone floors its fit zoom (`MOBILE_MIN_FIT_ZOOM`, and the note on
    // `minFitZoom` in `ServiceOverviewView`), so a scenario board — 705 px
    // wide against a 375 px screen — is framed from its top-left and
    // overflows rather than being centred in whatever rectangle the insets
    // leave. Zeroing `occludedBottomPx` in `getCanvasFocusFitInsets` and
    // walking this flow again produces the destination's box to the pixel:
    // x 20, y 124, 705 × 737, sheet top 325, both times.
    //
    // So the board above the sheet here is the ANCHORING, and saying the
    // inset put it there — as this file, the shell and a release note once
    // did — reads a delivered value as a framing. The two claims are pinned
    // apart: the jsdom slice holds that the measured height reaches the fit
    // (`camera.fits.at(-1)` carrying `occludedBottomPx`), and
    // `src/hooks/useZoomPanViewport.cameraFlight.test.tsx` holds what such a
    // number frames at this same floor — centred inside the strip for a board
    // that fits it vertically, and out of the solution entirely for one that
    // does not. Neither is this case, which is why it is not mutation-checked
    // against a dropped inset: it no longer claims to catch one.
    //
    // What is left is still worth a browser: that the destination the agent
    // was asked for is the board on screen, that a strip-full of it sits
    // above the sheet rather than a sliver, and that cells with words in them
    // land wholly inside the visible strip — a fact about layout and a
    // compositor that jsdom cannot answer either way.
    const viewport = page.viewportSize()
    expect(viewport, 'the phone project sets a viewport').toBeTruthy()
    const board = page.locator(`[data-focus-slide-id="${destination}"]`)
    await expect(board).toBeVisible()
    const boardBox = await board.boundingBox()
    const sheetBox = await sheet.boundingBox()
    expect(boardBox, 'the destination artboard has a box').toBeTruthy()
    expect(sheetBox, 'the sheet has a box').toBeTruthy()
    expect(
      boardBox!.y,
      'the destination rendered above the sheet',
    ).toBeLessThan(sheetBox!.y)
    expect(
      Math.min(boardBox!.y + boardBox!.height, sheetBox!.y) -
        Math.max(boardBox!.y, 0),
      'and a strip-full of it is up there, not a sliver of its edge',
    ).toBeGreaterThan(sheetBox!.y / 3)
    // Wholly inside in BOTH directions — the horizontal used to ask for
    // overlap only, which scored a cell 90% off the side of the screen as
    // legible, and that tightening is kept.
    //
    // What is measured is the WORDS, not the cell that holds them. A cell's
    // box carries its padding and its row's height, and both of those belong
    // to the destination BOARD rather than to the camera that framed it: a
    // deployment whose first row is a little taller would score zero on a
    // jump that put a perfectly readable strip on screen, which is a fact
    // about the board's own spacing and nothing this case is asking about.
    // A range over the cell's contents answers where the text actually
    // landed, and it does so whatever markup the cell is built from — they
    // differ. The horizontal protection survives the move unharmed, because
    // words carried off the side of the screen go off it with their cell.
    const cells = board.locator('[data-blueprint-cell]')
    let readable = 0
    for (let index = 0; index < (await cells.count()); index += 1) {
      const cell = cells.nth(index)
      const words = (await cell.innerText()).trim()
      if (words.length === 0) continue
      const box = await cell.evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const rects = Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        )
        if (rects.length === 0) return null
        const left = Math.min(...rects.map((rect) => rect.left))
        const right = Math.max(...rects.map((rect) => rect.right))
        const top = Math.min(...rects.map((rect) => rect.top))
        const bottom = Math.max(...rects.map((rect) => rect.bottom))
        return { x: left, y: top, width: right - left, height: bottom - top }
      })
      if (!box) continue
      if (
        box.y >= 0 &&
        box.y + box.height <= sheetBox!.y &&
        box.x >= 0 &&
        box.x + box.width <= viewport!.width
      )
        readable += 1
    }
    expect(
      readable,
      'cells of the destination are wholly on screen above the sheet',
    ).toBeGreaterThan(0)

    // AND THE SEND WAS WELL FORMED. The canned answer above exercises only
    // the adapter's response half; these two are the request half, which a
    // real provider would answer with a 400 rather than a tool call.
    expect(
      sent.length,
      'the loop sent a round, then a second carrying the tool result',
    ).toBeGreaterThanOrEqual(2)
    expect(
      sent[0]!.tools.map((tool) => tool.name),
      'the send carried the navigation tool specs',
    ).toContain('open_scenario')
    expect(
      sent[0]!.tools.every(
        (tool) => typeof tool.input_schema === 'object' && tool.input_schema,
      ),
      'each with a schema the provider could read',
    ).toBe(true)
    expect(
      sent[0]!.system.length,
      'and a system prompt with the role and the board in it',
    ).toBeGreaterThan(500)

    // THE STRIP IS LEGIBLE THROUGH THE WASH. Not a judgement — two facts the
    // browser can answer: nothing is blurred behind the overlay, and the wash
    // is a minority of the colour over the canvas. The screenshot below is
    // the half a person reads.
    const overlay = page.locator('[data-slot="sheet-overlay"]')
    await expect(overlay).toBeVisible()
    const wash = await overlay.evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
        background: style.backgroundColor,
        opacity: style.opacity,
      }
    })
    expect(wash.backdropFilter, 'no blur over the strip').toMatch(/^(none|)$/)
    expect(
      alphaOf(wash.background) * Number(wash.opacity),
      'the wash over the strip is a minority of the colour',
    ).toBeLessThan(0.6)

    await page.screenshot({
      path: join(MOBILE_SCREENSHOT_DIR, 'agent-jump.png'),
    })
    assertNoProblems('after the agent jump')

    console.log(
      `render-walk: phone agent jump to ${destination} settled in ${settledIn} ms; ` +
        `screenshot in ${join(MOBILE_SCREENSHOT_DIR, 'agent-jump.png')}`,
    )
  })
})
