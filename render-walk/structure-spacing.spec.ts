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
    await upper.locator('[data-structure-hint]').hover({force:true})
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
    const empty=board.locator('[data-blueprint-row][data-lane-name="Stakeholders"] [data-blueprint-empty-slot]').first()
    await empty.hover()
    await page.waitForTimeout(150)
    expect(await empty.locator('[data-blueprint-empty-preview]').evaluate(el=>parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).opacity))).toBeLessThan(0.05)
    await expect(empty.locator('[data-blueprint-empty-preview]')).toHaveCSS('opacity','1')
    await expect(page.locator('[data-slot="tooltip-content"]').filter({hasText:'Add a cell here'})).toHaveCount(0)
    await page.mouse.move(24,24)
    await expect(empty.locator('[data-blueprint-empty-preview]')).toHaveCSS('opacity','0')
    for (const label of ['Blueprints','Slices']) {
      const icon=page.locator('[data-editor-rail]').getByRole('button',{name:label,exact:true})
      await icon.hover()
      await page.waitForTimeout(150)
      await expect(page.locator('[data-slot="tooltip-content"]').filter({hasText:label})).toHaveCount(0)
      await expect(page.locator('[data-slot="tooltip-content"]').filter({hasText:label})).toBeVisible()
      await page.mouse.move(24,24)
    }
    const gesture=board.getByRole('button',{name:'Add a step before Invoke ub:map',exact:true}).first()
    await gesture.locator('[data-structure-hint]').hover({force:true})
    await expect(gesture).toHaveAttribute('data-open','')
    await page.mouse.wheel(0,80)
    await page.waitForTimeout(600)
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    const hintGaps=await board.evaluate(el=>{
      const headers=Array.from(el.querySelectorAll('[data-blueprint-column-header]')) as (typeof el)[]
      const hints=(Array.from(el.querySelectorAll('[data-blueprint-column-handles] [data-structure-hint]')) as (typeof el)[]).map(node=>{const b=node.getBoundingClientRect();return b.left+b.width/2})
      const scale=el.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).width)
      return headers.map(header=>{const b=header.getBoundingClientRect();const left=b.left+4*scale;const hint=hints.filter(x=>x<left).at(-1)!;return (left-hint)/scale})
    })
    expect(Math.max(...hintGaps)-Math.min(...hintGaps),'first-column feedforward has the same clearance as interior columns').toBeLessThan(1)
    for(const [line,preceding,following] of [
      ['Line of interaction','Blueprint owner','App & skill surface'],
      ['Line of visibility','Claude in the IDE','Pipeline scripts'],
    ]) {
      const spacing=await board.evaluate((el,{line,preceding,following})=>{
        const root=el.querySelector('[data-structure-board]')!
        const scale=root.getBoundingClientRect().width/parseFloat(root.ownerDocument.defaultView!.getComputedStyle(root).width)
        const rect=(name:string)=>{
          const row=root.querySelector(`[data-blueprint-row][data-lane-name="${name}"]`)!, box=row.getBoundingClientRect(), style=el.ownerDocument.defaultView!.getComputedStyle(row)
          return {top:box.top+((parseFloat(style.getPropertyValue('--structure-row-inset-top'))||0)+8)*scale,bottom:box.bottom-((parseFloat(style.getPropertyValue('--structure-row-inset-bottom'))||0)+8)*scale}
        }
        const caption=root.querySelector(`[role="separator"][aria-label="${line}"] [data-blueprint-row-header]`)!.getBoundingClientRect()
        const middle=(name:string)=>{const box=root.querySelector(`[data-structure-seam][aria-label="${name}"] [data-structure-hint]`)!.getBoundingClientRect();return box.top+box.height/2}
        return {above:Math.abs(2*middle(`Add a lane above ${line}`)-rect(preceding).bottom-caption.top)/scale,below:Math.abs(2*middle(`Add a lane below ${preceding}`)-caption.bottom-rect(following).top)/scale}
      },{line,preceding,following})
      expect(spacing.above,'upper hint splits the clear header-to-caption space evenly').toBeLessThan(1)
      expect(spacing.below,'lower hint splits the clear caption-to-header space evenly').toBeLessThan(1)
    }
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
    await seam.locator('[data-structure-hint]').hover({force:true})
    await expect(seam).toHaveAttribute('data-open','')
    await page.waitForTimeout(400)
    await expect(seam.locator('[data-structure-hint]')).toHaveCSS('opacity','0')
    for(const hint of await board.locator('[data-structure-hint]').all()) await expect(hint).toHaveCSS('opacity','0')
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
    await stepSeam.locator('[data-structure-hint]').hover({force:true})
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
              {
              const board=el.closest('[data-structure-board]')!, scale=board.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(board).width)
              const offset=parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).getPropertyValue('--structure-indicator-offset'))||0
              const expected=center-offset*scale
              errors.push(Math.abs((axis === 'x' ? box.left+box.width/2 : box.top+box.height/2)-expected))
            }
          }
          if(performance.now()-start<1100) el.ownerDocument.defaultView!.requestAnimationFrame(sample)
          else resolve(errors)
        }
        el.ownerDocument.defaultView!.requestAnimationFrame(sample)
      }),{axis,center})
      const samples=measure()
      await page.mouse.move(hint!.x+hint!.width/2, hint!.y+hint!.height/2)
      await expect(target).toHaveAttribute('data-open','')
      const errors=await samples
      await expect(target).toHaveAttribute('data-open','')
      expect(errors.length,`${name} produced visible growth frames`).toBeGreaterThan(3)
      expect(Math.max(...errors),`${name} header and preview grow around the same track centre`).toBeLessThan(1)
      const alignment=await target.evaluate((el,axis)=>{
        const a=el.querySelector('[data-structure-trigger]')!.getBoundingClientRect(),b=el.querySelector('[data-structure-slot-fill]')!.getBoundingClientRect()
        const board=el.closest('[data-structure-board]')!,scale=board.getBoundingClientRect().width/parseFloat(el.ownerDocument.defaultView!.getComputedStyle(board).width)
        return Math.abs(axis==='x' ? a.left+a.width/2-b.left-b.width/2 : a.top+a.height/2-b.top-b.height/2)/scale
      },axis)
      expect(alignment,`${name} plus block aligns with its canvas preview`).toBeLessThan(1)
      if (name==='Add a step before Invoke ub:map' || name==='Add a lane above Line of interaction')
        await page.screenshot({path:join(VIEW_SCREENSHOT_DIR,`insertion-alignment-${axis}-${theme}.png`)})
      const closing=measure()
      await page.mouse.move(24,24)
      const closingErrors=await closing
      expect(closingErrors.length,`${name} produced visible closing frames`).toBeGreaterThan(3)
      expect(Math.max(...closingErrors),`${name} header and preview close around the same track centre`).toBeLessThan(1)
      await expect(target).not.toHaveAttribute('data-open','')
      await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
      await page.waitForTimeout(350)
      await expect(target).not.toHaveAttribute('data-open','')
    }
    const restored=board.getByRole('button',{name:'Add a step before Invoke ub:map',exact:true}).first()
    await page.mouse.click(1540,145)
    await restored.evaluate(el=>el.focus())
    expect(await restored.evaluate(el=>el.matches(':focus-visible'))).toBe(false)
    await expect(restored).not.toHaveAttribute('data-open','')
    await page.keyboard.press('Tab')
    await restored.focus()
    await expect(restored).toHaveAttribute('data-open','')
    await page.mouse.move(1550,155)
    await expect(restored).not.toHaveAttribute('data-open','')
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    const entry=await restored.locator('[data-structure-hint]').boundingBox()
    await page.mouse.move(entry!.x+entry!.width/2,entry!.y+entry!.height/2)
    await expect(restored).toHaveAttribute('data-open','')
    await restored.evaluate(el=>{
      const event=el.ownerDocument.createEvent('Event')
      event.initEvent('blur',false,false)
      el.ownerDocument.defaultView!.dispatchEvent(event)
    })
    await expect(restored).not.toHaveAttribute('data-open','')
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)

    // Moving through header gaps must not continually reflow the board.
    const candidates=board.locator('[data-blueprint-column-handles] [data-structure-seam]')
    for(let lap=0;lap<2;lap++) {
      for(let index=0;index<3;index++) {
        const mark=await candidates.nth(index).locator('[data-structure-hint]').boundingBox()
        await page.mouse.move(mark!.x+mark!.width/2,mark!.y+mark!.height/2)
        await page.waitForTimeout(100)
        await expect(board.locator('[data-structure-seam][data-open]')).toHaveCount(0)
      }
    }
    await page.mouse.move(24,24)
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    const mark=await restored.locator('[data-structure-hint]').boundingBox()
    const pointer={x:mark!.x+mark!.width/2,y:mark!.y+mark!.height/2}
    await page.mouse.move(pointer.x,pointer.y)
    await expect(restored).toHaveAttribute('data-open','')
    await page.mouse.wheel(0,80)
    await expect(board.locator('[data-structure-seam-track]')).toHaveCount(0)
    await page.waitForTimeout(500)
    await expect(board.locator('[data-structure-seam][data-open]')).toHaveCount(0)
    for(const hint of await board.locator('[data-structure-hint]').all())
      await expect(hint).toHaveCSS('opacity','1')

  })
}
