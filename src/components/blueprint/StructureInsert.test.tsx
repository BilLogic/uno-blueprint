// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StructureInsert } from './StructureInsert'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('opens the whole seam after its hover delay and closes after the leave delay', () => {
  vi.useFakeTimers()
  const part = vi.fn()
  const create = vi.fn()
  render(
    <StructureInsert
      orientation="vertical"
      label="Add a step after Review"
      onClick={create}
      onOpenChange={part}
    />,
  )
  const seam = screen.getByRole('button', { name: 'Add a step after Review' })
  fireEvent.pointerEnter(seam)
  act(() => vi.advanceTimersByTime(89))
  expect(seam.getAttribute('data-open')).toBeNull()
  act(() => vi.advanceTimersByTime(1))
  expect(seam.hasAttribute('data-open')).toBe(true)
  expect(part).toHaveBeenLastCalledWith(true)
  fireEvent.click(seam)
  expect(create).toHaveBeenCalledWith(seam)
  fireEvent.pointerLeave(seam)
  act(() => vi.advanceTimersByTime(139))
  expect(seam.hasAttribute('data-open')).toBe(true)
  act(() => vi.advanceTimersByTime(1))
  expect(seam.getAttribute('data-open')).toBeNull()
})
