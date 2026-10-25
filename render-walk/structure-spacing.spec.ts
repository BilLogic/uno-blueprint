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
      return {content:fill.content,titleGap:(t.top-h.top)/scale-parseFloat(fill.top),cardGap:(face.top-b.top)/scale-parseFloat(wash.top)}
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
    })).toBeGreaterThan(27)
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`reported-insert-spacing-${theme}.png`)})
  })
}

for (const theme of ['dark', 'light']) {
  test(`header alignment and closing seam geometry — ${theme}`, async ({ page }) => {
    test.skip(!canvas, 'Requires the isolated local sample canvas.')
    await page.goto(canvas!)
    await page.locator('[data-cover-page], [data-nav-row]').first().waitFor()
    const cover=page.getByRole('button',{name:'Open the blueprint',exact:true})
    if(await cover.count()) await cover.click()
    const expand=page.locator('[data-nav-row] button[aria-controls="phase-panel-f0000000-0000-4000-8000-000700020000"]')
    await expect(expand).toBeVisible()
    if(await expand.getAttribute('aria-expanded') === 'false') await expand.click()
    const scenario=page.locator('[data-nav-row]').getByRole('button',{name:'Map your service',exact:true})
    await scenario.click()
    await expect(scenario).toHaveAttribute('aria-current','true')
    await page.waitForLoadState('networkidle')
    const themeSwitch=page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true})
    if(await themeSwitch.count()) await themeSwitch.click()
    const stacked=page.locator('[aria-label="Path display"]').getByRole('button',{name:'Stacked',exact:true})
    if(await stacked.count()) await stacked.click()
    await page.getByRole('button',{name:'Edit',exact:true}).click()
    const board=page.locator('[data-focus-slide-id="f0000000-0000-4000-8000-200000000001"]')
    const titleGaps=[]
    const labelColors=[]
    for(const name of ['Stakeholders','Blueprint owner','Claude in the IDE']) {
      const title=board.getByRole('button',{name,exact:true}).first()
      await title.hover()
      await page.waitForTimeout(250)
      labelColors.push(await title.evaluate(el=>{
        const h=el.closest('[data-structure-header-cell]')!, b=el.closest('[data-structure-board]')!, view=el.ownerDocument.defaultView!
        return {header:view.getComputedStyle(h,'::before').backgroundColor,wash:view.getComputedStyle(b,'::after').backgroundColor}
      }))
      titleGaps.push(await title.evaluate(el=>{
        const h=el.closest('[data-structure-header-cell]')!, b=h.getBoundingClientRect(), s=el.ownerDocument.defaultView!.getComputedStyle(h,'::before')
        const board=el.closest('[data-structure-board]')!, scale=board.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(board).width)
        return (el.getBoundingClientRect().top-b.top)/scale-parseFloat(s.top)
      }))
      await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`header-alignment-${name.split(' ')[0].toLowerCase()}-${theme}.png`)})
      await page.mouse.move(24,24)
    }
    for(const colors of labelColors) expect(colors.wash,'the axis wash uses the same neutral colour as the header').toBe(colors.header)
    expect(Math.max(...titleGaps)-Math.min(...titleGaps),'arrow corridors must not change header paint padding').toBeLessThan(1)
    const step=board.getByRole('button',{name:'View details: Invoke ub:map',exact:true}).first()
    await step.hover()
    await page.waitForTimeout(250)
    const gripGap=await step.evaluate(el=>{
      const h=el.closest('[data-blueprint-column-header]')!, b=h.getBoundingClientRect(), s=el.ownerDocument.defaultView!.getComputedStyle(h,'::before')
      const board=el.closest('[data-structure-board]')!, scale=board.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(board).width)
      const grip=el.querySelector('[data-structure-grip]')!.getBoundingClientRect()
      return (grip.left-b.left)/scale-parseFloat(s.left)
    })
    expect(gripGap,'the step grip sits inside the fill with padding').toBeGreaterThanOrEqual(7.9)
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`step-header-padding-${theme}.png`)})
    await page.mouse.move(24,24)
    const seam=board.getByRole('button',{name:'Add a lane below Stakeholders',exact:true}).first()
    const lineCount=await board.locator('[data-blueprint-swimlane-divider]').count()
    expect(lineCount).toBeGreaterThan(0)
    await expect(seam.locator('[data-structure-hint]')).toHaveCSS('opacity','1')
    await expect(async()=>{
      const bounds=await seam.boundingBox()
      await page.waitForTimeout(200)
      expect(await seam.boundingBox()).toEqual(bounds)
    }).toPass()
    const closed=await seam.boundingBox()
    await seam.hover()
    await expect(seam).toHaveAttribute('data-open','')
    await page.waitForTimeout(400)
    await expect(seam.locator('[data-structure-hint]')).toHaveCSS('opacity','0')
    await expect(board.locator('[data-blueprint-swimlane-divider]')).toHaveCount(lineCount-1)
    const fill=await seam.locator('[data-structure-slot-fill]').boundingBox()
    expect(Math.abs(fill!.y+fill!.height/2-closed!.y-closed!.height/2),'the ordinary divider opens around its own centre').toBeLessThan(1)
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`centred-divider-insertion-${theme}.png`)})
    const owner=board.getByRole('button',{name:'Blueprint owner',exact:true}).first()
    await owner.hover()
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    await expect(board.locator('[data-blueprint-swimlane-divider]')).toHaveCount(lineCount)
    const error=await owner.evaluate(el=>{
      const b=el.closest('[data-structure-board]')!, origin=b.getBoundingClientRect(), scale=origin.width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(b).width)
      const path=el.closest('[data-structure-path]')!
      const face=path.querySelector('[data-lane-name="Blueprint owner"] [data-blueprint-cell-anchor]')!.getBoundingClientRect()
      const wash=el.ownerDocument.defaultView!.getComputedStyle(b,'::after')
      return Math.abs((face.top-origin.top)/scale-8-parseFloat(wash.top))
    })
    expect(error,'the highlight follows the row as the insertion gap closes').toBeLessThan(1)
    await page.mouse.move(24,24)
    const stepSeam=board.getByRole('button',{name:'Add a step after Invoke ub:map',exact:true}).first()
    await stepSeam.hover()
    await expect(stepSeam).toHaveAttribute('data-open','')
    await page.waitForTimeout(400)
    const nextStep=board.getByRole('button',{name:'View details: Route by what exists',exact:true}).first()
    await nextStep.hover()
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    const columnError=await nextStep.evaluate(el=>{
      const b=el.closest('[data-structure-board]')!, origin=b.getBoundingClientRect(), scale=origin.width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(b).width)
      const index=el.closest('[data-step-index]')!.getAttribute('data-step-index')
      const cell=b.querySelector(`[data-blueprint-cell-shell][data-step-index="${index}"]`)!.getBoundingClientRect()
      return Math.abs((cell.left-origin.left)/scale+8-parseFloat(el.ownerDocument.defaultView!.getComputedStyle(b,'::after').left))
    })
    expect(columnError,'closing the inserted column keeps the highlight on the same step').toBeLessThan(1)
    await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`closing-column-highlight-${theme}.png`)})

    // Every visible indicator grows around the resting hint, including edge
    // positions and each independently reachable side of a named separator.
    for (const [name, axis] of [
      ['Add a step before Invoke ub:map', 'x'],
      ['Add a step after Deploy', 'x'],
      ['Add a lane above Journey figures', 'y'],
      ['Add a lane below References & guardrails', 'y'],
      ['Add a lane above Line of interaction', 'y'],
      ['Add a lane below Blueprint owner', 'y'],
      ['Add a lane above Line of visibility', 'y'],
      ['Add a lane below Claude in the IDE', 'y'],
    ] as const) {
      await page.mouse.move(24,24)
      await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
      const target=board.getByRole('button',{name,exact:true}).first()
      await expect(async()=>{
        const box=await target.boundingBox()
        await page.waitForTimeout(100)
        expect(await target.boundingBox()).toEqual(box)
      }).toPass()
      const hint=await target.locator('[data-structure-hint]').boundingBox()
      const center=axis === 'x' ? hint!.x+hint!.width/2 : hint!.y+hint!.height/2
      const measure=()=>target.evaluate((el,{axis,center})=>new Promise<number[]>(resolve=>{
        const errors:number[]=[]
        const start=performance.now()
        const sample=()=>{
          for(const selector of ['[data-structure-trigger]','[data-structure-slot-fill]']) {
            const node=el.querySelector(selector)!, box=node.getBoundingClientRect()
            const size=axis === 'x' ? box.width : box.height
            if(size>1 && parseFloat(el.ownerDocument.defaultView!.getComputedStyle(node).opacity)>0.1)
              errors.push(Math.abs((axis === 'x' ? box.left+box.width/2 : box.top+box.height/2)-center))
          }
          if(performance.now()-start<650) el.ownerDocument.defaultView!.requestAnimationFrame(sample)
          else resolve(errors)
        }
        el.ownerDocument.defaultView!.requestAnimationFrame(sample)
      }),{axis,center})
      const samples=measure()
      const hit=await target.boundingBox()
      await page.mouse.move(axis === 'y' ? hit!.x+3 : name.includes('before') ? hit!.x+3 : hit!.x+hit!.width-3, axis === 'x' ? hit!.y+hit!.height/2 : name.includes('above Line') ? hit!.y+hit!.height-1 : hit!.y+1)
      await expect(target).toHaveAttribute('data-open','')
      const errors=await samples
      await expect(target).toHaveAttribute('data-open','')
      expect(errors.length,`${name} produced visible growth frames`).toBeGreaterThan(3)
      expect(Math.max(...errors),`${name} expands around the resting hint`).toBeLessThan(1)
      const closing=measure()
      await page.mouse.move(24,24)
      const closingErrors=await closing
      expect(closingErrors.length,`${name} produced visible closing frames`).toBeGreaterThan(3)
      expect(Math.max(...closingErrors),`${name} closes around the same centre`).toBeLessThan(1)
    }

  })
}
