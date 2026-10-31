import { expect, type Page } from '@playwright/test'
import { loadEnv } from 'vite'
import { test } from './remote-images'

const canvas = process.env.RENDER_WALK_CANVAS_URL
async function openAuthoringCanvas(page: Page) {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const api = new URL(env.VITE_SUPABASE_URL)
  if (
    !['localhost', '127.0.0.1'].includes(api.hostname) ||
    !process.env.RENDER_WALK_SUPABASE_URL ||
    api.origin !== new URL(process.env.RENDER_WALK_SUPABASE_URL).origin ||
    api.port === '55421'
  )
    throw new Error('Requires an explicitly selected, owned local database; shared authoring ports are refused.')
  await page.goto(canvas!)
  await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
  const cover = page.getByRole('button', {
    name: 'Open the blueprint',
    exact: true,
  })
  if (await cover.count()) await cover.click()
  await page.waitForLoadState('networkidle')
  const expand = page.locator(
    '[data-nav-row] button[aria-controls="phase-panel-f0000000-0000-4000-8000-000700020000"]'
  )
  await expect(expand).toBeVisible()
  if ((await expand.getAttribute('aria-expanded')) === 'false')
    await expand.click()
  await page
    .locator('[data-nav-row]')
    .getByRole('button', { name: 'Map your service', exact: true })
    .click()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const board = page.locator(
    '[data-focus-slide-id="f0000000-0000-4000-8000-200000000001"]'
  )
  const read = async (path: string) => {
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (key.startsWith('sb-') && key.endsWith('-auth-token'))
          return JSON.parse(localStorage.getItem(key)!).access_token as string
      }
      throw new Error('Local author session missing')
    })
    const response = await page.request.get(`${api.origin}/rest/v1/${path}`, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  return { board, read }
}

for (const [kind, membership] of [
  ['step', 'both'],
  ['lane', 'both'],
  ['step', 'other only'],
] as const) {
  test(`structure ${kind} creates on ${
    membership === 'both' ? 'two paths' : 'the other path only'
  } and Undo restores backend orders`, async ({ page }) => {
    test.skip(!canvas, 'Requires the isolated local authoring stack.')
    const { board, read } = await openAuthoringCanvas(page)
    const paths = (await read(
      'paths?scenario_id=eq.f0000000-0000-4000-8000-200000000001&select=id,name&order=id'
    )) as { id: string; name: string }[]
    expect(paths).toHaveLength(2)
    const ids = paths.map((path) => path.id).join(',')
    const query =
      kind === 'step'
        ? `path_steps?path_id=in.(${ids})&select=path_id,step_id,position&order=path_id,position`
        : `lanes?path_id=in.(${ids})&select=id,path_id,name,position,lane_role&order=path_id,position`
    const before = await read(query)
    const target = board
      .getByRole('button', { name: new RegExp(`^Add a ${kind}`) })
      .nth(1)
    await page.keyboard.press('Tab')
    await target.focus()
    await expect(target).toHaveAttribute('data-open', '')
    const growth = board.evaluate(
      (el, kind) =>
        new Promise<number[]>((resolve) => {
          el.setAttribute('data-draft-sampling', '')
          const sizes: number[] = []
          let done = false
          const frame = () => {
            if (done) return
            const current = el.ownerDocument.querySelector(
              `[data-focus-slide-id="${el.getAttribute(
                'data-focus-slide-id'
              )}"]`
            )!
            const zone = current.querySelector(
              `[data-structure-insert-zone="${kind}"]`
            )
            if (zone) {
              const scale =
                el.getBoundingClientRect().width /
                parseFloat(
                  el.ownerDocument.defaultView!.getComputedStyle(el).width
                )
              const b = zone.getBoundingClientRect()
              sizes.push((kind === 'step' ? b.width : b.height) / scale)
            }
            el.ownerDocument.defaultView!.requestAnimationFrame(frame)
          }
          const finish = () => {
            const current = el.ownerDocument.querySelector(
              `[data-focus-slide-id="${el.getAttribute(
                'data-focus-slide-id'
              )}"]`
            )!
            // A seam may still be finishing. Sample through the draft's own clock,
            // including when browser input delivery takes longer than one animation.
            if (!current.querySelector('[data-structure-placeholder]')) return
            frame()
            done = true
            current.removeAttribute('data-draft-sampling')
            el.ownerDocument.removeEventListener('structure-motion-end', finish)
            resolve(sizes)
          }
          el.ownerDocument.addEventListener('structure-motion-end', finish)
          el.ownerDocument.defaultView!.requestAnimationFrame(frame)
        }),
      kind
    )
    await expect(board).toHaveAttribute('data-draft-sampling', '')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: `Add ${kind}`, exact: true })
    ).toBeVisible()
    const sizes = await growth
    expect(sizes.length).toBeGreaterThan(3)
    const minimum = Math.min(...sizes),
      maximum = Math.max(...sizes)
    expect(
      maximum - minimum,
      'the narrow preview grows into the draft'
    ).toBeGreaterThan(50)
    expect(
      new Set(
        sizes
          .filter((size) => size > minimum + 1 && size < maximum - 1)
          .map((size) => Math.round(size))
      ).size,
      'draft opening has intermediate sizes'
    ).toBeGreaterThan(3)
    const name = `Integration ${kind} ${Date.now()}`
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    const group = page.getByRole('group', {
      name: 'Add to paths',
      exact: true,
    })
    await expect(group).toHaveAttribute('data-required', 'true')
    const original = await group
      .getByRole('checkbox', { checked: true })
      .first()
      .getAttribute('aria-label')
    const selectedPaths =
      membership === 'both'
        ? paths
        : paths.filter((path) => `Add to ${path.name}` !== original)
    for (const path of paths)
      await group
        .getByRole('checkbox', { name: `Add to ${path.name}`, exact: true })
        .check()
    if (membership !== 'both')
      await group
        .getByRole('checkbox', { name: original!, exact: true })
        .uncheck()
    if (membership !== 'both')
      await expect(
        board
          .locator(
            `[data-structure-path="${selectedPaths[0].id}"] [data-structure-placeholder]`
          )
          .first()
      ).toBeVisible()
    if (kind === 'step')
      await page
        .getByRole('textbox', { name: 'Summary', exact: true })
        .fill('Verified through the local create panel.')
    else {
      await page.getByRole('combobox', { name: 'Role', exact: true }).click()
      await page
        .getByRole('option')
        .filter({ hasText: /^Frontstage\s*Staff actions/ })
        .click()
      await page
        .getByRole('combobox', { name: 'Owner team', exact: true })
        .fill('Integration fixture')
    }
    try {
      const write = page.waitForResponse(
        (response) =>
          response.url().includes(`/rest/v1/rpc/add_${kind}_with_details`) &&
          response.request().method() === 'POST'
      )
      await page
        .getByRole('button', {
          name:
            selectedPaths.length > 1 ? `Add ${kind} to 2 paths` : `Add ${kind}`,
          exact: true,
        })
        .click()
      const response = await write
      expect(response.ok()).toBe(true)
      await response.finished()
      console.log(
        `local ${kind} create RPC: ${Math.round(
          response.request().timing().responseEnd
        )}ms`
      )
      const rows = (await read(
        `${kind === 'step' ? 'steps' : 'lanes'}?name=eq.${encodeURIComponent(
          name
        )}&select=*`
      )) as Record<string, unknown>[]
      expect(rows).toHaveLength(kind === 'step' ? 1 : 2)
      if (kind === 'step')
        expect(rows[0].summary).toBe('Verified through the local create panel.')
      else
        for (const row of rows) {
          expect(row.lane_role).toBe('frontstage_actions')
          expect(row.owner_team).toBe('Integration fixture')
        }
      const after = (await read(query)) as {
        path_id: string
        step_id?: string
        id?: string
      }[]
      for (const path of paths)
        expect(after.filter((row) => row.path_id === path.id)).toHaveLength(
          before.filter((row: { path_id: string }) => row.path_id === path.id)
            .length +
            (selectedPaths.some((selected) => selected.id === path.id) ? 1 : 0)
        )
      const created = new Set(rows.map((row) => row.id))
      for (const path of paths)
        expect(
          after.filter(
            (row) =>
              row.path_id === path.id && created.has(row.step_id ?? row.id)
          )
        ).toHaveLength(
          selectedPaths.some((selected) => selected.id === path.id) ? 1 : 0
        )
    } finally {
      const undo = page.getByRole('button', { name: 'Undo', exact: true })
      if (await undo.count()) await undo.click()
      await expect.poll(() => read(query)).toEqual(before)
      await expect
        .poll(() =>
          read(
            `${
              kind === 'step' ? 'steps' : 'lanes'
            }?name=eq.${encodeURIComponent(name)}&select=id`
          )
        )
        .toEqual([])
    }
  })
}

// Existing-item rails cross the actual PostgREST/readback boundary as well.
test('saved structure Paths attach, detach with confirmation, reorder and Undo', async ({
  page,
}) => {
  test.skip(!canvas, 'Requires the isolated local authoring stack.')
  // At this width the centred toast overlaps the open panel. Undo must remain
  // reachable above that non-modal drawer, not merely present in the DOM.
  await page.setViewportSize({ width: 1038, height: 900 })
  const { board, read } = await openAuthoringCanvas(page)
  const paths = (await read(
    'paths?scenario_id=eq.f0000000-0000-4000-8000-200000000001&select=id,name&order=id'
  )) as Array<{ id: string; name: string }>
  const pathIds = paths.map((path) => path.id).join(',')
  const orderQuery = `path_steps?path_id=in.(${pathIds})&select=path_id,step_id,position&order=path_id,position`
  const before = (await read(orderQuery)) as Array<{
    path_id: string
    step_id: string
    position: number
  }>
  const steps = (await read(
    'steps?scenario_id=eq.f0000000-0000-4000-8000-200000000001&select=id,name'
  )) as Array<{ id: string; name: string }>
  const reading = steps.find((step) => step.name === 'Read the sources')!
  const origin = paths.find((path) =>
    before.some((row) => row.path_id === path.id && row.step_id === reading.id)
  )!
  const other = paths.find((path) => path.id !== origin.id)!
  const undo = async () => {
    const reverted = page.waitForResponse((response) =>
      /\/rpc\/(undo_step_path_change|undo_structure_order)$/.test(response.url())
    )
    await page
      .locator('[data-write-failures]')
      .getByRole('button', { name: 'Undo', exact: true })
      .click()
    expect((await reverted).ok()).toBe(true)
  }
  await board
    .getByRole('button', {
      name: 'View details: Read the sources',
      exact: true,
    })
    .click()
  let group = page.getByRole('group', { name: 'Paths', exact: true })
  await expect(group).toBeVisible()
  await expect(
    group.getByRole('checkbox', { name: `Take off ${origin.name}`, exact: true })
  ).toBeDisabled()
  await group
    .getByRole('checkbox', { name: `Add to ${other.name}`, exact: true })
    .check()
  await expect(
    page
      .locator('[data-write-failures]')
      .getByText(new RegExp(`Added the Read the sources step to`))
  ).toBeVisible()
  const attached = (await read(orderQuery)) as typeof before
  const original = before.filter((row) => row.path_id === origin.id)
  const predecessor =
    original[original.findIndex((row) => row.step_id === reading.id) - 1]
      .step_id
  const newRows = attached.filter((row) => row.path_id === other.id)
  expect(newRows.findIndex((row) => row.step_id === reading.id)).toBe(
    newRows.findIndex((row) => row.step_id === predecessor) + 1
  )
  await undo()
  expect(await read(orderQuery)).toEqual(before)
  // A key move is one guarded reorder, with the same rail used for creation.
  if (!(await group.isVisible())) await board.getByRole('button', {
    name: 'View details: Read the sources', exact: true,
  }).click()
  const originRail = group.getByRole('button', {
    name: `Move Read the sources in ${origin.name}`, exact: true,
  })
  if (!(await originRail.isVisible())) await group.getByRole('button', {
    name: `${origin.name} Required`, exact: true,
  }).click()
  await group
    .getByRole('button', {
      name: `Move Read the sources in ${origin.name}`,
      exact: true,
    })
    .press('ArrowDown')
  await expect(
    page.locator('[data-write-failures]').getByText(/Saved the step order on/)
  ).toBeVisible()
  await undo()
  expect(await read(orderQuery)).toEqual(before)
  await page
    .getByRole('button', { name: 'Close step properties', exact: true })
    .click()
  await board
    .getByRole('button', { name: 'View details: Invoke ub:map', exact: true })
    .click()
  group = page.getByRole('group', { name: 'Paths', exact: true })
  const invoke = steps.find((step) => step.name === 'Invoke ub:map')!
  const cellsQuery = `cells?path_id=eq.${other.id}&step_id=eq.${invoke.id}&select=*&order=id`
  const cellsBefore = (await read(cellsQuery)) as Array<{ id: string }>
  expect(cellsBefore.length).toBeGreaterThan(0)
  const ids = cellsBefore.map((cell) => cell.id).join(',')
  const relatedQueries = [
    `cell_touchpoints?cell_id=in.(${ids})&select=*&order=id`,
    `resources?cell_id=in.(${ids})&select=*&order=id`,
    `slide_images?cell_id=in.(${ids})&select=*&order=id`,
    `evidence?cell_id=in.(${ids})&select=*&order=id`,
    `cell_dependencies?or=(source_cell_id.in.(${ids}),target_cell_id.in.(${ids}))&select=*&order=id`,
  ]
  const relatedBefore = await Promise.all(
    relatedQueries.map((query) => read(query))
  )
  const tick = group.getByRole('checkbox', {
    name: `Take off ${other.name}`,
    exact: true,
  })
  await tick.uncheck()
  let confirm = page.getByRole('dialog', {
    name: 'Remove step from this path?',
    exact: true,
  })
  await expect(confirm).toContainText(`${cellsBefore.length} saved cells`)
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(tick).toBeChecked()
  expect(await read(cellsQuery)).toEqual(cellsBefore)
  await tick.uncheck()
  confirm = page.getByRole('dialog', {
    name: 'Remove step from this path?',
    exact: true,
  })
  await confirm
    .getByRole('button', { name: 'Remove from path', exact: true })
    .click()
  await expect(
    page
      .locator('[data-write-failures]')
      .getByText(/Removed the Invoke ub:map step from/)
  ).toBeVisible()
  expect(await read(cellsQuery)).toEqual([])
  await undo()
  expect(await read(cellsQuery)).toEqual(cellsBefore)
  expect(await Promise.all(relatedQueries.map((query) => read(query)))).toEqual(
    relatedBefore
  )
  expect(await read(orderQuery)).toEqual(before)
  await page
    .getByRole('button', { name: 'Close step properties', exact: true })
    .click()
  const laneQuery = `lanes?path_id=eq.${origin.id}&select=id,name,position&order=position`
  const lanesBefore = await read(laneQuery)
  await board.getByRole('button', { name: 'Stakeholders', exact: true }).click()
  group = page.getByRole('group', { name: 'Paths', exact: true })
  await expect(group.getByRole('checkbox')).toHaveCount(0)
  const laneRail = group.getByRole('button', {
    name: `Move Stakeholders in ${origin.name}`,
    exact: true,
  })
  // Stakeholders ends the recipient section; crossing it must not write.
  await laneRail.press('ArrowDown')
  expect(await read(laneQuery)).toEqual(lanesBefore)
  await laneRail.press('ArrowUp')
  await expect(
    page.locator('[data-write-failures]').getByText(/Saved the lane order on/)
  ).toBeVisible()
  await undo()
  expect(await read(laneQuery)).toEqual(lanesBefore)
})
