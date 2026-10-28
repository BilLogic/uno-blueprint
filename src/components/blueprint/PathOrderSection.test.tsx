// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useState } from 'react'
import { PathOrderSection, type PathOrder } from './PathOrderSection'
afterEach(cleanup)
const paths = [
  {
    id: 'online',
    name: 'Online',
    items: [
      { id: 'start', name: 'Start' },
      { id: 'finish', name: 'Finish' },
    ],
  },
  { id: 'phone', name: 'Phone', items: [{ id: 'finish', name: 'Finish' }] },
]
function Form() {
  const [value, setValue] = useState<PathOrder[]>([
    { pathId: 'online', order: ['start', 'new', 'finish'], moved: [] },
  ])
  return (
    <PathOrderSection
      paths={paths}
      value={value}
      onChange={setValue}
      item={{ id: 'new', name: 'Review' }}
      defaultOrder={(path) => [...path.items.map((i) => i.id), 'new']}
    />
  )
}
it('keeps one path open, protects the last selection and lets every rail item move', () => {
  render(<Form />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Online' }))
  expect(
    screen
      .getByRole('checkbox', { name: 'Add to Online' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Move Finish in Online' }),
    { key: 'ArrowUp' },
  )
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Move Finish in Online' }),
    { key: 'ArrowUp' },
  )
  expect(screen.getByText('Moved')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Phone' }))
  expect(
    screen
      .getByRole('button', { name: /^Online/ })
      .getAttribute('aria-expanded'),
  ).toBe('false')
  expect(
    screen.queryByRole('button', { name: 'Move Finish in Online' }),
  ).toBeNull()
  expect(screen.getByText('1 moved')).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Move Review in Phone' }),
  ).toBeTruthy()
})

it('keeps a duplicate lane path unavailable and gives the reason', () => {
  render(
    <PathOrderSection
      paths={paths}
      value={[
        { pathId: 'online', order: ['start', 'new', 'finish'], moved: [] },
      ]}
      onChange={() => {}}
      item={{ id: 'new', name: 'Review' }}
      defaultOrder={() => ['finish', 'new']}
      unavailable={{ phone: 'Already has Review' }}
    />,
  )
  expect(
    (screen.getByRole('checkbox', { name: 'Add to Phone' }) as HTMLInputElement)
      .disabled,
  ).toBe(true)
  expect(screen.getByText('Already has Review')).toBeTruthy()
})

it('shows only the order rail when a scenario has one path', () => {
  render(
    <PathOrderSection
      paths={[paths[0]]}
      value={[
        { pathId: 'online', order: ['start', 'new', 'finish'], moved: [] },
      ]}
      onChange={() => {}}
      item={{ id: 'new', name: 'Review' }}
      defaultOrder={() => []}
    />,
  )
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByText('Add to paths')).toBeNull()
  expect(screen.getByText('Order')).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Move Review in Online' }),
  ).toBeTruthy()
})

it('opens the clicked path when its membership arrives after loading', () => {
  const props = {
    paths,
    value: [] as PathOrder[],
    onChange: () => {},
    item: { id: 'new', name: 'Review' },
    defaultOrder: () => [],
  }
  const view = render(<PathOrderSection {...props} />)
  view.rerender(
    <PathOrderSection
      {...props}
      value={[
        { pathId: 'online', order: ['start', 'new', 'finish'], moved: [] },
      ]}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Move Review in Online' }),
  ).toBeTruthy()
})

it('scopes the order rail to a section window with divider labels', () => {
  render(
    <PathOrderSection
      paths={[paths[0]]}
      value={[
        {
          pathId: 'online',
          order: ['start', 'new', 'finish', 'extra'],
          moved: [],
        },
      ]}
      onChange={() => {}}
      item={{ id: 'new', name: 'Review' }}
      defaultOrder={() => []}
      sectionForOrder={(_path, _order) => ({
        start: 1,
        end: 2,
        lineAbove: 'Line of interaction',
        lineBelow: 'Line of visibility',
      })}
    />,
  )
  expect(screen.getByText('Line of interaction')).toBeTruthy()
  expect(screen.getByText('Line of visibility')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Move Review in Online' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Move Finish in Online' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Move Start in Online' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Move Extra in Online' })).toBeNull()
})

it('clears one item’s moved tag when it returns, while another remains moved', () => {
  const path={id:'one',name:'One',items:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'},{id:'d',name:'D'}]}
  function Order() {
    const [value,setValue]=useState<PathOrder[]>([{pathId:'one',order:['a','b','c','d','new'],moved:[]}])
    return <PathOrderSection paths={[path]} value={value} onChange={setValue} item={{id:'new',name:'Review'}} defaultOrder={()=>[]} />
  }
  render(<Order />)
  const move=(name:string,key:string)=>fireEvent.keyDown(screen.getByRole('button',{name:`Move ${name} in One`}),{key})
  move('A','ArrowDown');move('A','ArrowDown')
  move('C','ArrowUp')
  expect(screen.getAllByText('Moved')).toHaveLength(2)
  move('A','ArrowUp');move('A','ArrowUp')
  expect(screen.getAllByText('Moved')).toHaveLength(1)
  expect(screen.getByRole('button',{name:'Move A in One'}).closest('li')?.textContent).not.toContain('Moved')
})
