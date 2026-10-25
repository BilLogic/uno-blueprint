import { expect } from '@playwright/test'
import { test } from './remote-images'
import { VIEW_SCREENSHOT_DIR } from './playwright.config'
import { join } from 'node:path'

const canvas=process.env.RENDER_WALK_CANVAS_URL
for (const theme of ['dark','light']) {
  test(`highlight breathing room in the reported first scenario — ${theme}`,async ({page})=>{
    test.skip(!canvas,'Requires the isolated local sample canvas.')
    const target=new URL('/keeping-a-blueprint-true?phase=f0000000-0000-4000-8000-000700010000&scenario=f0000000-0000-4000-8000-100000000001',canvas)
    if (!['localhost','127.0.0.1'].includes(target.hostname) || target.port === '5173') throw new Error('Requires an isolated local canvas.')
    await page.goto(target.href)
    const cover=page.getByRole('button',{name:'Open the blueprint',exact:true})
    await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
    if(await cover.count()) await cover.click()
    const expand=page.getByRole('button',{name:'Expand Discover',exact:true})
    if(await expand.count()) await expand.click()
    const scenario=page.locator('[data-nav-row]').getByRole('button',{name:'Find the template and see what it does',exact:true})
    await scenario.click()
    await expect(scenario).toHaveAttribute('aria-current','true')
    await page.waitForLoadState('networkidle')
    const switchTheme=page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true})
    await page.getByRole('button',{name:'Jump to…',exact:true}).waitFor()
    if(await switchTheme.count()) await switchTheme.click()
    await page.getByRole('button',{name:'Edit',exact:true}).click()
    const board=page.locator('[data-focus-slide-id="f0000000-0000-4000-8000-100000000001"]')
    const owner=board.getByRole('button',{name:'Blueprint owner',exact:true})
    await owner.hover()
    const measured=await owner.evaluate(el=>{
      const header=el.closest('[data-structure-header-cell]')!, board=el.closest('[data-structure-board]')!
      const view=el.ownerDocument.defaultView!, h=header.getBoundingClientRect(), t=el.getBoundingClientRect(), b=board.getBoundingClientRect(), scale=b.width/parseFloat(board.ownerDocument.defaultView!.getComputedStyle(board).width)
      const fill=view.getComputedStyle(header,'::before'), wash=view.getComputedStyle(board,'::after')
      const face=board.querySelector('[data-blueprint-row][data-lane-name="Blueprint owner"] [data-blueprint-cell-shell] [data-blueprint-cell-anchor]')!.getBoundingClientRect()
      return {content:fill.content,titleGap:(t.top-h.top)/scale-(h.height/scale-parseFloat(fill.height))/2,cardGap:(face.top-b.top)/scale-parseFloat(wash.top)}
    })
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`reported-hover-spacing-${theme}.png`)})
    expect(measured.titleGap).toBeGreaterThan(5.9)
    expect(measured.cardGap).toBeGreaterThan(5.9)
    expect(measured.content).not.toBe('none')
    await page.mouse.move(24,24)
    const upper=board.getByRole('button',{name:'Add a lane above Line of visibility',exact:true})
    await upper.hover()
    await expect(upper).toHaveAttribute('data-open','')
    await expect.poll(()=>upper.evaluate(el=>{
      const b=el.closest('[data-structure-board]')!, scale=b.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(b).width)
      return el.querySelector('[data-structure-slot-fill]')!.getBoundingClientRect().height/scale
    })).toBeGreaterThan(19)
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`reported-insert-spacing-${theme}.png`)})
  })
}
