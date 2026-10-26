// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useStructureCreatePaths } from '@/hooks/useStructureCreatePaths'
import type { StructureDraft } from '@/contexts/EntityDetailContext'
import { PathOrderSection } from './PathOrderSection'
const read = vi.hoisted(() => ({
  paths: [
    {
      id: 'clicked',
      name: 'Clicked',
      items: [
        { id: 'start', name: 'Start', position: 4 },
        { id: 'finish', name: 'Finish', position: 9 },
      ],
    },
    {
      id: 'shared',
      name: 'Shared',
      items: [
        { id: 'start', name: 'Start', position: 1 },
        { id: 'finish', name: 'Finish', position: 2 },
      ],
    },
    {
      id: 'other',
      name: 'Other',
      items: [{ id: 'different', name: 'Different', position: 1 }],
    },
  ],
}))
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({
    status: 'ready',
    source: 'database',
    data: read.paths,
  }),
}))
afterEach(cleanup)
function Draft({ draft }: { draft: StructureDraft }) {
  const state = useStructureCreatePaths(draft, 'Review')
  return <PathOrderSection {...state} item={{ id: 'new', name: 'Review' }} />
}
const names = () =>
  within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((node) => node.getAttribute('aria-label'))
it('defaults after the same predecessor on another path, or to its end when absent', () => {
  render(<Draft draft={{ kind: 'step', pathId: 'clicked', atPosition: 9 }} />)
  expect(names()).toEqual([
    'Move Start in Clicked',
    'Move Review in Clicked',
    'Move Finish in Clicked',
  ])
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Shared' }))
  expect(names()).toEqual([
    'Move Start in Shared',
    'Move Review in Shared',
    'Move Finish in Shared',
  ])
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Other' }))
  expect(names()).toEqual(['Move Different in Other', 'Move Review in Other'])
})
it('defaults before the same next item when inserting first, and pre-ticks all spanned paths', () => {
  render(
    <Draft
      draft={{
        kind: 'step',
        pathId: 'clicked',
        pathIds: ['clicked', 'shared'],
        atPosition: 4,
      }}
    />,
  )
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Add to Shared',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Shared' }))
  expect(names()).toEqual([
    'Move Review in Shared',
    'Move Start in Shared',
    'Move Finish in Shared',
  ])
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Other' }))
  expect(names()).toEqual(['Move Review in Other', 'Move Different in Other'])
})

it('keeps selected paths when a duplicate name is typed and restored', () => {
  function NamedDraft({ name }: { name: string }) {
    const state = useStructureCreatePaths(
      {
        kind: 'lane',
        scenarioId: 'scenario',
        pathId: 'clicked',
        pathIds: ['clicked', 'shared'],
      },
      name,
    )
    const unavailable = Object.fromEntries(
      state.paths
        .filter((path) =>
          path.items.some(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
          ),
        )
        .map((path) => [path.id, 'Already has this name']),
    )
    return (
      <PathOrderSection
        {...state}
        item={{ id: 'new', name }}
        unavailable={unavailable}
      />
    )
  }
  const view = render(<NamedDraft name="Review" />)
  const selected = screen.getByRole('checkbox', {
    name: 'Add to Shared',
  }) as HTMLInputElement
  expect(selected.checked).toBe(true)
  view.rerender(<NamedDraft name="Start" />)
  expect(selected.checked).toBe(true)
  expect(selected.disabled).toBe(true)
  view.rerender(<NamedDraft name="Review" />)
  expect(selected.checked).toBe(true)
  expect(selected.disabled).toBe(false)
})
