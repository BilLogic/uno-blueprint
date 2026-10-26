import { expect } from '@playwright/test'
import { loadEnv } from 'vite'
import { test } from './remote-images'

const canvas = process.env.RENDER_WALK_CANVAS_URL
for (const [kind, membership] of [
  ['step', 'both'],
  ['lane', 'both'],
  ['step', 'other only'],
] as const) {
  test(`structure ${kind} creates on ${
    membership === 'both' ? 'two paths' : 'the other path only'
  } and Undo restores backend orders`, async ({ page }) => {
    test.skip(!canvas, 'Requires the isolated local authoring stack.')
    const env = loadEnv('development', process.cwd(), 'VITE_')
    const api = new URL(env.VITE_SUPABASE_URL)
    if (
      !['localhost', '127.0.0.1'].includes(api.hostname) ||
      api.port !== '55421'
    )
      throw new Error('Requires the isolated local database.')
    await page.goto(canvas!)
    await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
    const cover = page.getByRole('button', {
      name: 'Open the blueprint',
      exact: true,
    })
    if (await cover.count()) await cover.click()
    const expand = page.locator(
      '[data-nav-row] button[aria-controls="phase-panel-f0000000-0000-4000-8000-000700020000"]',
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
      '[data-focus-slide-id="f0000000-0000-4000-8000-200000000001"]',
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
    const paths = (await read(
      'paths?scenario_id=eq.f0000000-0000-4000-8000-200000000001&select=id,name&order=id',
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
                'data-focus-slide-id',
              )}"]`,
            )!
            const zone = current.querySelector(
              `[data-structure-insert-zone="${kind}"]`,
            )
            if (zone) {
              const scale =
                el.getBoundingClientRect().width /
                parseFloat(
                  el.ownerDocument.defaultView!.getComputedStyle(el).width,
                )
              const b = zone.getBoundingClientRect()
              sizes.push((kind === 'step' ? b.width : b.height) / scale)
            }
            el.ownerDocument.defaultView!.requestAnimationFrame(frame)
          }
          const finish = () => {
            const current = el.ownerDocument.querySelector(
              `[data-focus-slide-id="${el.getAttribute('data-focus-slide-id')}"]`,
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
      kind,
    )
    await expect(board).toHaveAttribute('data-draft-sampling', '')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: `Add ${kind}`, exact: true }),
    ).toBeVisible()
    const sizes = await growth
    expect(sizes.length).toBeGreaterThan(3)
    const minimum = Math.min(...sizes),
      maximum = Math.max(...sizes)
    expect(
      maximum - minimum,
      'the narrow preview grows into the draft',
    ).toBeGreaterThan(50)
    expect(
      new Set(
        sizes
          .filter((size) => size > minimum + 1 && size < maximum - 1)
          .map((size) => Math.round(size)),
      ).size,
      'draft opening has intermediate sizes',
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
            `[data-structure-path="${selectedPaths[0].id}"] [data-structure-placeholder]`,
          )
          .first(),
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
          response.request().method() === 'POST',
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
          response.request().timing().responseEnd,
        )}ms`,
      )
      const rows = (await read(
        `${kind === 'step' ? 'steps' : 'lanes'}?name=eq.${encodeURIComponent(
          name,
        )}&select=*`,
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
            (selectedPaths.some((selected) => selected.id === path.id) ? 1 : 0),
        )
      const created = new Set(rows.map((row) => row.id))
      for (const path of paths)
        expect(
          after.filter(
            (row) =>
              row.path_id === path.id && created.has(row.step_id ?? row.id),
          ),
        ).toHaveLength(
          selectedPaths.some((selected) => selected.id === path.id) ? 1 : 0,
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
            }?name=eq.${encodeURIComponent(name)}&select=id`,
          ),
        )
        .toEqual([])
    }
  })
}
