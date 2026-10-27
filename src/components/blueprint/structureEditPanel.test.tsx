// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StepPanel } from './StepPanel'
import { LanePanel } from './LanePanel'
import { Drawer } from '@/components/ui/drawer'
import {
  clearSession,
  recordChange,
  sessionSnapshot,
} from '@/lib/authoringSession'
import { writeFailureSnapshot, dismissWriteFailure } from '@/lib/writeFailures'
import type { OrderPath } from './PathOrderSection'

const state = vi.hoisted(() => ({
  paths: [] as OrderPath[],
  cells: [] as Array<{ id: string; updated_at: string }>,
  release: undefined as undefined | (() => void),
  fail: '',
  readAt: 1,
  rails: {} as Record<string, (order: string[]) => void>,
  drops: {} as Record<string, () => void>,
}))
const writes = vi.hoisted(() => ({
  membership: vi.fn(),
  step: vi.fn(),
  lane: vi.fn(),
  revert: vi.fn(),
}))
vi.mock('framer-motion', async (original) => {
  const real = await original<typeof import('framer-motion')>()
  const { createElement } = await import('react')
  return {
    ...real,
    useDragControls: () => ({ start: () => {} }),
    Reorder: {
      Group: (props: {
        children?: import('react').ReactNode
        'data-path-order': string
        onReorder: (ids: string[]) => void
      }) => {
        state.rails[props['data-path-order']] = props.onReorder
        return createElement('ul', {}, props.children)
      },
      Item: (props: {
        children?: import('react').ReactNode
        value: string
        onDragEnd: () => void
      }) => {
        state.drops[props.value] = props.onDragEnd
        return createElement('li', { 'data-order-row': '' }, props.children)
      },
    },
  }
})
vi.mock('@/hooks/useStructurePaths', () => ({
  useStructurePaths: () => ({
    status: 'ready',
    data: state.paths,
    readAt: state.readAt,
  }),
}))
vi.mock('@/hooks/useStructureCreatePaths', () => ({
  NEW_STRUCTURE_ITEM: 'new',
  useStructureCreatePaths: () => ({
    status: 'ready',
    paths: [],
    value: [],
    onChange: vi.fn(),
    defaultOrder: () => [],
  }),
}))
vi.mock('@/hooks/useStepSpec', () => ({
  useStepSpec: () => ({
    status: 'ready',
    data: {
      id: 'review',
      name: 'Review',
      summary: '',
      scenarioId: 'scenario',
      scenarioName: 'Service',
      phaseName: 'Phase',
      positions: [],
      frames: [],
    },
  }),
}))
vi.mock('@/hooks/useLaneSpec', () => ({
  useLaneSpec: () => ({
    status: 'ready',
    data: {
      id: 'actor',
      pathId: 'a',
      name: 'Actor',
      role: 'customer_actions',
      ownerTeam: '',
      kpis: [],
      tools: [],
      stakeholderId: null,
      scenarioId: 'scenario',
      scenarioName: 'Service',
      phaseName: 'Phase',
      siblingLaneIds: ['actor'],
    },
  }),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    canWrite: true,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: state.cells, error: null }),
            }),
          }),
        }),
      }),
    },
  }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'design',
}))
vi.mock('@/hooks/useOwnerTags', () => ({
  useOwnerTags: () => ({ status: 'ready', data: [] }),
}))
vi.mock('./StakeholderSelect', () => ({ StakeholderSelect: () => null }))
vi.mock('@/lib/revertChange', () => ({ executeRevert: writes.revert }))
vi.mock('@/lib/authoringRpc', () => ({
  changeStepPath: writes.membership,
  reorderSteps: writes.step,
  reorderLanes: writes.lane,
  updateStepWithDetails: vi.fn(),
  updateLaneWithDetails: vi.fn(),
  createStepWithDetails: vi.fn(),
  createLaneWithDetails: vi.fn(),
}))
const item = (id: string, name = id) => ({ id, name })
function mount(kind: 'step' | 'lane' = 'step', pathId: string | undefined = 'a') {
  return render(
    <Drawer open>
      {kind === 'step' ? (
        <StepPanel stepId="review" pathId={pathId} onClose={() => {}} />
      ) : (
        <LanePanel laneId="actor" onClose={() => {}} />
      )}
    </Drawer>,
  )
}
beforeEach(() => {
  state.paths = [
    {
      id: 'a',
      name: 'Online',
      items: [
        item('start', 'Start'),
        item('review', 'Review'),
        item('finish', 'Finish'),
      ],
    },
    {
      id: 'b',
      name: 'Phone',
      items: [item('start', 'Start'), item('finish', 'Finish')],
    },
  ]
  state.cells = []
  state.fail = ''
  state.readAt = 1
  state.release = undefined
  state.rails = {}
  state.drops = {}
  writes.membership.mockImplementation(async (_client, input) => {
    if (state.fail) throw new Error(state.fail)
    const target = state.paths.find((path) => path.id === input.pathId)!
    const order = target.items.filter((row) => row.id !== 'review')
    if (input.present)
      order.splice(input.atPosition, 0, item('review', 'Review'))
    state.paths = state.paths.map((path) =>
      path.id === target.id ? { ...path, items: order } : path,
    )
    return recordChange(
      'change_step_path',
      { present: input.present },
      { fn: 'undo_step_path_change', args: { receipt_id: 'own-receipt' } },
    )
  })
  for (const [kind, write] of [
    ['step', writes.step],
    ['lane', writes.lane],
  ] as const)
    write.mockImplementation(async (_client, pathId, ids) => {
      if (state.release)
        await new Promise<void>((resolve) => {
          state.release = resolve
        })
      if (state.fail) throw new Error(state.fail)
      state.paths = state.paths.map((path) =>
        path.id === pathId
          ? {
              ...path,
              items: ids.map(
                (id: string) => path.items.find((row) => row.id === id)!,
              ),
            }
          : path,
      )
      return recordChange(
        kind === 'step' ? 'reorder_steps' : 'reorder_lanes',
        {},
        { fn: 'undo_structure_order', args: { snapshot: { kind } } },
      )
    })
})
afterEach(() => {
  cleanup()
  clearSession()
  writeFailureSnapshot().forEach((notice) => dismissWriteFailure(notice.id))
  vi.clearAllMocks()
})

it('shows the shared Paths rail, protects the last path, and attaches after the opened-path predecessor', async () => {
  mount()
  const paths = screen.getByRole('group', { name: 'Paths' })
  expect(
    (
      within(paths).getByRole('checkbox', {
        name: 'Take off Online',
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true)
  expect(
    within(paths).getByText('Add another path before taking this step off this one.'),
  ).toBeTruthy()
  fireEvent.click(within(paths).getByRole('checkbox', { name: 'Add to Phone' }))
  await waitFor(() => expect(writes.membership).toHaveBeenCalledOnce())
  expect(writes.membership.mock.calls[0][1]).toMatchObject({
    stepId: 'review',
    pathId: 'b',
    present: true,
    atPosition: 1,
    expectedIds: ['start', 'finish'],
    expectedPathIds: ['a'],
  })
  expect(sessionSnapshot()).toHaveLength(1)
  expect(writeFailureSnapshot().at(-1)?.undo).toBeTypeOf('function')
  const own = sessionSnapshot()[0]
  recordChange('rename_path', {})
  await writeFailureSnapshot().at(-1)!.undo!()
  expect(writes.revert.mock.calls[0][1]).toBe(own)
})

it('uses the end when the predecessor is absent on the target path', async () => {
  state.paths[1].items = [item('finish', 'Finish')]
  mount()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Phone' }))
  await waitFor(() => expect(writes.membership).toHaveBeenCalledOnce())
  expect(writes.membership.mock.calls[0][1]).toMatchObject({
    atPosition: 1,
    expectedIds: ['finish'],
  })
})

it('reconciles an immediate Undo read before the saved membership was rendered', async () => {
  // The write succeeds before its refetch returns. Undo then returns the
  // original membership: equal ids, but a fresh authoritative read.
  writes.membership.mockImplementationOnce(async () =>
    recordChange(
      'change_step_path',
      {},
      { fn: 'undo_step_path_change', args: { receipt_id: 'own-receipt' } },
    ),
  )
  const view = mount()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Phone' }))
  await waitFor(() =>
    expect(writeFailureSnapshot().at(-1)?.undo).toBeTypeOf('function'),
  )
  expect(
    (screen.getByRole('checkbox', { name: 'Take off Phone' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  await act(async () => {
    await writeFailureSnapshot().at(-1)!.undo!()
  })
  state.readAt++ // Query structural sharing retains the original data identity.
  view.rerender(
    <Drawer open>
      <StepPanel stepId="review" pathId="a" onClose={() => {}} />
    </Drawer>,
  )
  expect(
    (screen.getByRole('checkbox', { name: 'Add to Phone' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Take off Online',
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true)
})

it('names the saved cell count, cancels without a write, then sends the exact confirmed set', async () => {
  state.paths[1].items.splice(1, 0, item('review', 'Review'))
  state.cells = [
    { id: 'cell-one', updated_at: '2026-10-26T12:00:00Z' },
    { id: 'cell-two', updated_at: '2026-10-26T12:00:01Z' },
  ]
  mount()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Take off Phone' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Remove step from this path?',
  })
  expect(within(dialog).getByText(/removes 2 saved cells/)).toBeTruthy()
  expect(writes.membership).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() =>
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Take off Phone',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true),
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'Take off Phone' }))
  const confirm = await screen.findByRole('button', {
    name: 'Remove from path',
  })
  fireEvent.click(confirm)
  await waitFor(() => expect(writes.membership).toHaveBeenCalledOnce())
  expect(writes.membership.mock.calls[0][1]).toMatchObject({
    present: false,
    pathId: 'b',
    confirmedCells: state.cells,
  })
  expect(sessionSnapshot()).toHaveLength(1)
})

it('shows only the lane owning path, has no checkbox, and saves one keyboard move', async () => {
  state.paths = [
    {
      id: 'a',
      name: 'Online',
      items: [item('actor', 'Actor'), item('staff', 'Staff')],
    },
    { id: 'b', name: 'Phone', items: [item('other', 'Actor')] },
  ]
  mount('lane')
  const paths = screen.getByRole('group', { name: 'Paths' })
  expect(within(paths).queryByRole('checkbox')).toBeNull()
  expect(within(paths).queryByText('Phone')).toBeNull()
  fireEvent.keyDown(
    within(paths).getByRole('button', { name: 'Move Actor in Online' }),
    { key: 'ArrowDown' },
  )
  await waitFor(() => expect(writes.lane).toHaveBeenCalledOnce())
  expect(writes.lane.mock.calls[0].slice(1)).toEqual([
    'a',
    ['staff', 'actor'],
    ['actor', 'staff'],
  ])
  expect(sessionSnapshot()).toHaveLength(1)
})

it('disables the rail during a save and surfaces a refusal without losing its prior order', async () => {
  state.release = () => {}
  mount()
  const move = screen.getByRole('button', {
    name: 'Move Review in Online',
  }) as HTMLButtonElement
  fireEvent.keyDown(move, { key: 'ArrowDown' })
  await waitFor(() => expect(move.disabled).toBe(true))
  fireEvent.keyDown(move, { key: 'ArrowUp' })
  expect(writes.step).toHaveBeenCalledOnce()
  state.fail = 'This path changed. Reload and try again'
  state.release!()
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    state.fail,
  )
  await waitFor(() => expect(move.disabled).toBe(false))
  expect(sessionSnapshot()).toHaveLength(0)
})

it('previews intermediate rail positions locally and writes only the dropped order', async () => {
  mount()
  act(() => state.rails.a(['start', 'finish', 'review']))
  act(() => state.rails.a(['finish', 'start', 'review']))
  expect(writes.step).not.toHaveBeenCalled()
  act(() => state.drops.review())
  await waitFor(() => expect(writes.step).toHaveBeenCalledOnce())
  expect(writes.step.mock.calls[0].slice(1)).toEqual([
    'a',
    ['finish', 'start', 'review'],
    ['start', 'review', 'finish'],
  ])
  expect(sessionSnapshot()).toHaveLength(1)
})

it('appends when the panel has no opened-path context, even when another path has a predecessor', async () => {
  mount('step', '')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add to Phone' }))
  await waitFor(() => expect(writes.membership).toHaveBeenCalledOnce())
  expect(writes.membership.mock.calls[0][1].atPosition).toBe(2)
})
