// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Drawer } from '@/components/ui/drawer'
import { StepPanel } from './StepPanel'
import { LanePanel } from './LanePanel'
import { StructureRenameEditor } from './StructureRenameEditor'

const writes = vi.hoisted(() => ({
  step: vi.fn(async () => 'created-step'),
  lane: vi.fn(async () => ['created-lane']),
  renameStep: vi.fn(async () => {}),
  renameLane: vi.fn(async () => {}),
}))
vi.mock('@/lib/authoringRpc', () => ({
  createStepWithDetails: writes.step,
  createLaneWithDetails: writes.lane,
  renameStep: writes.renameStep,
  renameLane: writes.renameLane,
}))
vi.mock('@/hooks/useStepSpec', () => ({
  useStepSpec: () => ({ status: 'ready', data: null }),
}))
vi.mock('@/hooks/useLaneSpec', () => ({
  useLaneSpec: () => ({ status: 'ready', data: null }),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, canWrite: true }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'design',
}))
vi.mock('@/hooks/useOwnerTags', () => ({
  useOwnerTags: () => ({ status: 'ready', data: [] }),
}))
vi.mock('./DraftStoryboardFields', () => ({
  DraftStoryboardFields: () => null,
}))
vi.mock('./StakeholderSelect', () => ({ StakeholderSelect: () => null }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('keeps a step draft unwritten until Name is filled, then creates all fields together', async () => {
  const created = vi.fn()
  render(
    <Drawer open>
      <StepPanel
        stepId=""
        draft={{ kind: 'step', pathId: 'path', atPosition: 4 }}
        onCreated={created}
        onClose={() => {}}
      />
    </Drawer>,
  )
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await waitFor(() => expect(document.activeElement).toBe(name))
  const add = screen.getByRole('button', {
    name: 'Add step',
  }) as HTMLButtonElement
  expect(add.disabled).toBe(true)
  expect(writes.step).not.toHaveBeenCalled()
  fireEvent.change(name, { target: { value: 'Review' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), {
    target: { value: 'Review the request.' },
  })
  fireEvent.click(add)
  await waitFor(() =>
    expect(writes.step).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathId: 'path',
        atPosition: 4,
        name: 'Review',
        summary: 'Review the request.',
      }),
    ),
  )
  expect(created).toHaveBeenCalledWith('created-step')
})

it('requires both lane Name and Role and submits its properties in one write', async () => {
  const created = vi.fn()
  render(
    <Drawer open>
      <LanePanel
        laneId=""
        draft={{ kind: 'lane', scenarioId: 'scenario', atPosition: 7 }}
        onCreated={created}
        onClose={() => {}}
      />
    </Drawer>,
  )
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
    target: { value: 'Reviewer' },
  })
  const add = screen.getByRole('button', {
    name: 'Add lane',
  }) as HTMLButtonElement
  expect(add.disabled).toBe(true)
  fireEvent.change(await screen.findByLabelText('Owner team'), {
    target: { value: 'Operations' },
  })
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role' }), {
    button: 0,
  })
  const role = (await screen.findByText('Frontstage', { exact: true })).closest(
    '[role=option]',
  )!
  fireEvent.pointerDown(role, { pointerType: 'mouse', button: 0 })
  fireEvent.click(role)
  await waitFor(() => expect(add.disabled).toBe(false))
  fireEvent.click(add)
  await waitFor(() =>
    expect(writes.lane).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scenarioId: 'scenario',
        name: 'Reviewer',
        laneRole: 'frontstage_actions',
        atPosition: 7,
        ownerTeam: 'Operations',
      }),
    ),
  )
  expect(created).toHaveBeenCalledWith('created-lane')
})

for (const kind of ['lane', 'step'] as const) {
  it(`renames a ${kind} in place and captures the prior name for undo`, async () => {
    const done = vi.fn()
    render(
      <StructureRenameEditor
        kind={kind}
        id="saved"
        name="Review"
        onDone={done}
      />,
    )
    const input = screen.getByRole('textbox', { name: `Rename ${kind}` })
    fireEvent.change(input, { target: { value: 'Decision' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(
        kind === 'step' ? writes.renameStep : writes.renameLane,
      ).toHaveBeenCalledWith(expect.anything(), {
        [kind === 'step' ? 'stepId' : 'laneId']: 'saved',
        name: 'Decision',
        previousName: 'Review',
      }),
    )
    expect(done).toHaveBeenCalledOnce()
  })

  it(`cancels an in-place ${kind} rename without writing`, () => {
    const done = vi.fn()
    render(
      <StructureRenameEditor
        kind={kind}
        id="saved"
        name="Review"
        onDone={done}
      />,
    )
    fireEvent.keyDown(screen.getByRole('textbox', { name: `Rename ${kind}` }), {
      key: 'Escape',
    })
    expect(writes.renameStep).not.toHaveBeenCalled()
    expect(writes.renameLane).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledOnce()
  })
}

it('keeps a rejected step draft editable and reports why it did not save', async () => {
  writes.step.mockRejectedValueOnce(new Error('That path no longer exists.'))
  render(
    <Drawer open>
      <StepPanel
        stepId=""
        draft={{ kind: 'step', pathId: 'path' }}
        onCreated={() => {}}
        onClose={() => {}}
      />
    </Drawer>,
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Review' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
  expect(await screen.findByText('That path no longer exists.')).toBeTruthy()
  expect(
    (screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value,
  ).toBe('Review')
  expect(
    (screen.getByRole('button', { name: 'Add step' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})
