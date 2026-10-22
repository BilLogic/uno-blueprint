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
