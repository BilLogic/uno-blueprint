// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { packAxisOffsets, registerCanvasStructureReorder } from './canvasStructureReorder'

it('keeps boundary routing space at its seat when the storyboard moves down', () => {
  // The second seat has 36px of routing space below its 192px content.
  const offsets = packAxisOffsets({
    ids: ['storyboard', 'recipient'],
    previewIds: ['recipient', 'storyboard'],
    starts: [0, 208],
    extents: [208, 228],
    seatInsets: [0, 36],
    section: { start: 0, end: 1 },
  })
  expect(offsets.get('recipient')).toBe(-208)
  expect(offsets.get('storyboard')).toBe(192)
})

it('keeps frontstage content seated when the next row has an overhead corridor', () => {
  const offsets = packAxisOffsets({
    ids: ['app', 'staff'], previewIds: ['staff', 'app'],
    starts: [0, 200], extents: [200, 232],
    seatInsets: [0, 0],
    section: { start: 0, end: 1 },
  })
  expect(offsets.get('staff')).toBe(-200)
  expect(offsets.get('app')).toBe(232)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete document.documentElement.dataset.structureMotion
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
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const shortcut = new KeyboardEvent('keydown', {
        key, altKey: true, bubbles: true, cancelable: true,
      })
      items[0].parts[0].dispatchEvent(shortcut)
      expect(shortcut.defaultPrevented).toBe(true)
    }
    expect(save).not.toHaveBeenCalled()
    document.dispatchEvent(pointer('pointerup', 150, 150))
    expect(save).toHaveBeenCalledExactlyOnceWith(kind, 'one', ['two', 'one'], ['one','two'])
    expect(body.querySelector('[data-structure-lift]')).toBeNull()
    // Destination preview remains until the consumer acknowledges the new seats.
    expect(items[0].parts[0].style.translate).not.toBe('')
    items[1].parts[0].dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))
    expect(insert).not.toHaveBeenCalled()
    dispose()
  })
}

it('parks the destination until the rendered order acknowledges the drop', () => {
  const body = document.createElement('div')
  document.body.append(body)
  const boxes = [new DOMRect(0, 0, 100, 100), new DOMRect(0, 100, 100, 100)]
  const items = ['one', 'two'].map((id, index) => {
    const header = document.createElement('button')
    header.dataset.structureReorder = 'lane'
    header.dataset.structureId = id
    const row = document.createElement('div')
    body.append(header, row)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    return { id, name: id, parts: [header, row] }
  })
  const settle = { release: null as (() => void) | null }
  let translateAtSave = ''
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    save: () => {
      translateAtSave = items[0]!.parts[0]!.style.translate
    },
    scale: () => 1,
    settle,
  })
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: y,
    })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    return event
  }
  items[0]!.parts[0]!.dispatchEvent(pointer('pointerdown', 50))
  document.dispatchEvent(pointer('pointermove', 150))
  // A closing insertion still owns the shared structure-motion clock.
  document.documentElement.dataset.structureMotion = ''
  document.dispatchEvent(pointer('pointerup', 150))
  expect(translateAtSave).toBe('0px 100px')
  // Browser capture is released by the completed gesture, not a cancellation
  // of the parked preview while the query observer still holds the old order.
  items[0]!.parts[0]!.dispatchEvent(new Event('lostpointercapture', { bubbles: true }))
  expect(items[0]!.parts[0]!.style.translate).toBe('0px 100px')
  settle.release?.()
  expect(items[0]!.parts[0]!.style.translate).toBe('')
  expect(document.documentElement.dataset.structureMotion).toBe('')
  expect(body.dataset.structureSettling).toBeUndefined()
  dispose()
})

it.each([false, true])('keeps settling chrome until the order renders, reduced motion: %s', (reduced) => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  const body = document.createElement('div')
  document.body.append(body)
  const boxes = [new DOMRect(0, 0, 100, 100), new DOMRect(0, 100, 100, 100)]
  const items = ['one', 'two'].map((id, index) => {
    const header = document.createElement('button')
    header.dataset.structureReorder = 'lane'
    header.dataset.structureId = id
    const row = document.createElement('div')
    body.append(header, row)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    return { id, name: id, parts: [header, row] }
  })
  const settle = { release: null as (() => void) | null }
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    save: vi.fn(),
    scale: () => 1,
    settle,
  })
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: y,
    })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    return event
  }
  items[0]!.parts[0]!.dispatchEvent(pointer('pointerdown', 50))
  document.dispatchEvent(pointer('pointermove', 150))
  document.dispatchEvent(pointer('pointerup', 150))
  vi.advanceTimersByTime(0)
  expect(items[0]!.parts[0]!.style.translate).toBe('0px 100px')
  expect(document.documentElement.dataset.structureMotion).toBeUndefined()
  expect(body.dataset.structureSettling).toBe('')
  settle.release?.()
  expect(document.documentElement.dataset.structureMotion).toBeUndefined()
  expect(body.dataset.structureSettling).toBeUndefined()
  dispose()
})
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
  expect(content.style.translate).toBe('0px 300px')
  button.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  document.dispatchEvent(pointer('pointerup', 125, 100))
  expect(save).not.toHaveBeenCalled()
  expect(content.style.translate).toBe('')
  expect(body.querySelector('[data-structure-landing]')).toBeNull()
  dispose()
})

it('keeps the landing visible when the pointer returns to the home seat', () => {
  const body = document.createElement('div')
  document.body.append(body)
  const boxes = [new DOMRect(0, 0, 100, 100), new DOMRect(0, 120, 100, 100)]
  const items = ['one', 'two'].map((id, index) => {
    const header = document.createElement('button')
    header.dataset.structureReorder = 'lane'
    header.dataset.structureId = id
    const row = document.createElement('div')
    body.append(header, row)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(boxes[index]!)
    return { id, name: id, parts: [header, row] }
  })
  const dispose = registerCanvasStructureReorder(body, {
    items: () => items,
    save: vi.fn(),
    scale: () => 1,
  })
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: y,
    })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    return event
  }
  items[0]!.parts[0]!.dispatchEvent(pointer('pointerdown', 50))
  document.dispatchEvent(pointer('pointermove', 170))
  const landing = body.querySelector<HTMLElement>('[data-structure-landing]')
  expect(landing?.style.opacity).not.toBe('0')
  // Back over the original seat — projection must stay up.
  document.dispatchEvent(pointer('pointermove', 50))
  expect(landing?.style.opacity).not.toBe('0')
  document.dispatchEvent(pointer('pointerup', 50))
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
