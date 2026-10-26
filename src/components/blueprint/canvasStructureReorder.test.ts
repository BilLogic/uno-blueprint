// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { registerCanvasStructureReorder } from './canvasStructureReorder'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
for (const kind of ['lane', 'step'] as const) {
  it(`lifts the complete ${kind} only after intent, then saves one drop`, () => {
    const body = document.createElement('div')
    document.body.append(body)
    const boxes = [
      new DOMRect(0, 0, 100, 100),
      new DOMRect(
        kind === 'step' ? 100 : 0,
        kind === 'lane' ? 100 : 0,
        100,
        100,
      ),
    ]
    const items = ['one', 'two'].map((id, index) => {
      const header = document.createElement('button')
      header.dataset.structureReorder = kind
      header.dataset.structureId = id
      const content = document.createElement('div')
      content.dataset.structurePart = id
      body.append(header, content)
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(boxes[index])
      vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(boxes[index])
      return { id, name: id, parts: [header, content] }
    })
    const save = vi.fn()
    const insert = vi.fn()
    body.addEventListener('click', insert, true)
    const dispose = registerCanvasStructureReorder(body, {
      items: () => items,
      save,
      scale: () => 0.5,
    })
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    }
    items[0].parts[0].dispatchEvent(pointer('pointerdown', 25, 25))
    document.dispatchEvent(pointer('pointermove', 27, 27))
    expect(body.querySelector('[data-structure-lift]')).toBeNull()
    document.dispatchEvent(
      pointer(
        'pointermove',
        kind === 'step' ? 150 : 25,
        kind === 'lane' ? 150 : 25,
      ),
    )
    expect(
      items[0].parts.every((part) => part.hasAttribute('data-structure-lift')),
    ).toBe(true)
    expect(save).not.toHaveBeenCalled()
    document.dispatchEvent(pointer('pointerup', 150, 150))
    expect(save).toHaveBeenCalledExactlyOnceWith(kind, 'one', ['two', 'one'], ['one','two'])
    expect(body.querySelector('[data-structure-lift]')).toBeNull()
    items[1].parts[0].dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))
    expect(insert).not.toHaveBeenCalled()
    dispose()
  })
}
it('preserves click intent, cancels a drag, and supports Alt movement without plain-arrow writes', () => {
  const body = document.createElement('div')
  document.body.append(body)
  const button = document.createElement('button')
  button.dataset.structureReorder = 'lane'
  button.dataset.structureId = 'one'
  body.append(button)
  const save = vi.fn()
  const dispose = registerCanvasStructureReorder(body, {
    items: () => [
      { id: 'one', name: 'One', parts: [button] },
      { id: 'two', name: 'Two', parts: [] },
    ],
    save,
    scale: () => 1,
  })
  button.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  )
  expect(save).not.toHaveBeenCalled()
  button.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      altKey: true,
      bubbles: true,
    }),
  )
  expect(save).toHaveBeenCalledExactlyOnceWith('lane', 'one', ['two', 'one'], ['one','two'])
  dispose()
})

it('keeps a click usable, ignores movement on the other axis and cancels a lifted row with Escape', () => {
  const body = document.createElement('div'),
    button = document.createElement('button'),
    content = document.createElement('div'),
    other = document.createElement('div')
  document.body.append(body)
  body.append(button, content, other)
  button.dataset.structureReorder = 'lane'
  button.dataset.structureId = 'one'
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100),
  )
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 0, 100, 100),
  )
  vi.spyOn(other, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 100, 200, 100),
  )
  const save = vi.fn(),
    click = vi.fn()
  button.addEventListener('click', click)
  const dispose = registerCanvasStructureReorder(body, {
    items: () => [
      { id: 'one', name: 'One', parts: [button, content] },
      { id: 'two', name: 'Two', parts: [other] },
    ],
    scale: () => 0.25,
    save,
  })
  const pointer = (type: string, x: number, y: number) => {
    const e = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    })
    Object.defineProperty(e, 'pointerId', { value: 1 })
    return e
  }
  button.dispatchEvent(pointer('pointerdown', 25, 25))
  document.dispatchEvent(pointer('pointermove', 125, 25))
  expect(body.querySelector('[data-structure-lift]')).toBeNull()
  document.dispatchEvent(pointer('pointerup', 125, 25))
  button.click()
  expect(click).toHaveBeenCalledTimes(1)
  button.dispatchEvent(pointer('pointerdown', 25, 25))
  document.dispatchEvent(pointer('pointermove', 125, 100))
  expect(content.style.translate).toBe('0 300px')
  button.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  document.dispatchEvent(pointer('pointerup', 125, 100))
  expect(save).not.toHaveBeenCalled()
  expect(content.style.translate).toBe('')
  expect(body.querySelector('[data-structure-landing]')).toBeNull()
  dispose()
})

it.each(['blur','lostpointercapture','visibilitychange'])('resets a lifted gesture after %s', (reason) => {
  const body=document.createElement('div');document.body.append(body)
  const source=document.createElement('button');source.dataset.structureReorder='lane';source.dataset.structureId='one';body.append(source)
  const capture=vi.fn(),release=vi.fn()
  source.setPointerCapture=capture;source.releasePointerCapture=release;source.hasPointerCapture=()=>true
  vi.spyOn(source,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,100,100))
  const save=vi.fn()
  const dispose=registerCanvasStructureReorder(body,{items:()=>[{id:'one',name:'One',parts:[source]},{id:'two',name:'Two',parts:[]}],scale:()=>1,save})
  const event=(type:string)=>{const e=new MouseEvent(type,{bubbles:true,button:0,clientX:10,clientY:type==='pointerdown'?10:80});Object.defineProperty(e,'pointerId',{value:1});return e}
  source.dispatchEvent(event('pointerdown'));document.dispatchEvent(event('pointermove'))
  expect(body.querySelector('[data-structure-lift]')).not.toBeNull()
  if(reason==='visibilitychange') {vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event(reason))}
  else (reason==='blur'?window:source).dispatchEvent(new Event(reason,{bubbles:true}))
  expect(body.querySelector('[data-structure-lift]')).toBeNull()
  expect(capture).toHaveBeenCalledWith(1)
  expect(save).not.toHaveBeenCalled()
  dispose()
})
