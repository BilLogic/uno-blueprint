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
import { recordChange, clearSession } from '@/lib/authoringSession'
import { StructureRenameEditor } from './StructureRenameEditor'

const reads = vi.hoisted(() => ({
  empty: false,
  selectedPath: 'path',
  items: [] as Array<{ id: string; name: string; role?: string | null }>,
  order: null as string[] | null,
}))
const writes = vi.hoisted(() => ({
  step: vi.fn(async () => ({id:'created-step',entry:recordChange('add_step_with_details', {})})),
  lane: vi.fn(async () => ({ids:['created-lane'],entry:recordChange('add_lane_with_details', {})})),
  renameStepName: vi.fn(async () => {}),
  renameLane: vi.fn(async () => {}),
}))
vi.mock('@/lib/authoringRpc', () => ({
  createStepWithDetails: writes.step,
  createLaneWithDetails: writes.lane,
  renameStepName: writes.renameStepName,
  renameLane: writes.renameLane,
}))
vi.mock('@/hooks/useStructureCreatePaths', () => ({
  NEW_STRUCTURE_ITEM: 'new',
  useStructureCreatePaths: () => {
    const order =
      reads.order ??
      (reads.empty ? [] : ['new', ...reads.items.map((item) => item.id)])
    return {
      status: 'ready',
      clickedPathId: 'path',
      paths: [
        { id: 'path', name: 'Default', items: reads.items },
        ...(reads.selectedPath === 'path'
          ? []
          : [{ id: reads.selectedPath, name: 'Other', items: [] }]),
      ],
      value: reads.empty
        ? []
        : [{ pathId: reads.selectedPath, order, moved: [] }],
      onChange: vi.fn(),
      defaultOrder: () => order,
    }
  },
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
vi.mock('./StakeholderSelect', () => ({ StakeholderSelect: () => null }))
afterEach(() => {
  cleanup()
  clearSession()
  reads.selectedPath = 'path'
  reads.empty = false
  reads.items = []
  reads.order = null
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
  expect(screen.queryByText('in no path yet')).toBeNull()
  expect(screen.getByRole('group', { name: /Add to paths/ }).getAttribute('data-required')).toBe('true')
  await waitFor(() => expect(document.activeElement).toBe(name))
  const add = screen.getByRole('button', {
    name: 'Add step',
  }) as HTMLButtonElement
  expect(add.disabled).toBe(false)
  fireEvent.click(add)
  expect(await screen.findByText('Enter a name')).toBeTruthy()
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
  const receipt = await writes.step.mock.results.at(-1)!.value
  expect(created).toHaveBeenCalledWith('created-step', receipt.entry)
  expect(created.mock.calls[0][1]).toBe(receipt.entry)
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
  expect(add.disabled).toBe(false)
  fireEvent.click(add)
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Choose a role',
  )
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
  const receipt = await writes.lane.mock.results.at(-1)!.value
  expect(created).toHaveBeenCalledWith('created-lane', receipt.entry)
  expect(created.mock.calls[0][1]).toBe(receipt.entry)
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
        kind === 'step' ? writes.renameStepName : writes.renameLane,
      ).toHaveBeenCalledWith(expect.anything(), {
        [kind === 'step' ? 'stepId' : 'laneId']: 'saved',
        name: 'Decision',
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
    expect(writes.renameStepName).not.toHaveBeenCalled()
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

it('translates raw rename failures into the shared write-failure copy', async () => {
  writes.renameStepName.mockRejectedValueOnce(
    new Error('relation "steps" does not exist'),
  )
  render(
    <StructureRenameEditor
      kind="step"
      id="saved"
      name="Review"
      onDone={() => {}}
    />,
  )
  const name = screen.getByRole('textbox', { name: 'Rename step' })
  fireEvent.change(name, { target: { value: 'Decision' } })
  fireEvent.keyDown(name, { key: 'Enter' })
  expect((await screen.findByRole('alert')).textContent).toBe(
    'That change could not be saved. The details are in the console.',
  )
})

it('shows the duplicate lane error on Name without writing', async () => {
  reads.items = [{ id: 'existing', name: ' reviewer ' }]
  render(
    <Drawer open>
      <LanePanel
        laneId=""
        draft={{ kind: 'lane', scenarioId: 'scenario', pathId: 'path' }}
        onClose={() => {}}
      />
    </Drawer>,
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Reviewer' },
  })
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role' }), {
    button: 0,
  })
  const role = (await screen.findByText('Frontstage', { exact: true })).closest(
    '[role=option]',
  )!
  fireEvent.pointerDown(role, { pointerType: 'mouse', button: 0 })
  fireEvent.click(role)
  fireEvent.click(screen.getByRole('button', { name: 'Add lane' }))
  expect((await screen.findByRole('alert')).textContent).toBe(
    'This path already has a lane with that name',
  )
  expect(writes.lane).not.toHaveBeenCalled()
})

it.each(['step','lane'] as const)('refuses an empty path selection before creating a %s', async kind=>{
  reads.empty=true
  render(<Drawer open>{kind==='step' ? <StepPanel stepId="" draft={{kind:'step',pathId:'path'}} onClose={()=>{}} /> : <LanePanel laneId="" draft={{kind:'lane',scenarioId:'scenario',pathId:'path'}} onClose={()=>{}} />}</Drawer>)
  fireEvent.change(await screen.findByRole('textbox',{name:'Name'}),{target:{value:'Review'}})
  if(kind==='lane') {
    fireEvent.mouseDown(screen.getByRole('combobox',{name:'Role'}),{button:0})
    const role=(await screen.findByText('Frontstage',{exact:true})).closest('[role=option]')!
    fireEvent.pointerDown(role,{pointerType:'mouse',button:0});fireEvent.click(role)
  }
  fireEvent.click(screen.getByRole('button',{name:`Add ${kind}`}))
  expect(await screen.findByText('Choose at least one path')).toBeTruthy()
  expect(writes.step).not.toHaveBeenCalled();expect(writes.lane).not.toHaveBeenCalled()
})

it('creates a step using a selected path when its original path is unchecked',async()=>{
  reads.selectedPath='other'
  render(<Drawer open><StepPanel stepId="" draft={{kind:'step',pathId:'path'}} onClose={()=>{}} /></Drawer>)
  fireEvent.change(await screen.findByRole('textbox',{name:'Name'}),{target:{value:'Review'}})
  fireEvent.click(screen.getByRole('button',{name:'Add step'}))
  await waitFor(()=>expect(writes.step).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({pathId:'other',pathOrders:{other:['new']}})))
})

it('scopes Add-to-paths to the insert band and auto-picks a band role', async () => {
  reads.items = [
    { id: 'story', name: 'Journey figures', role: 'storyboard' },
    { id: 'owner', name: 'Blueprint owner', role: 'customer_actions' },
    { id: 'touch', name: 'App & skill surface', role: 'frontstage_touchpoints' },
    { id: 'front', name: 'Claude in the IDE', role: 'frontstage_actions' },
    { id: 'back', name: 'Subagent fleet', role: 'backstage_actions' },
  ]
  // New sits between LoI and LoV (after owner/customer, before backstage).
  reads.order = ['story', 'owner', 'new', 'touch', 'front', 'back']
  render(
    <Drawer open>
      <LanePanel
        laneId=""
        draft={{ kind: 'lane', scenarioId: 'scenario', pathId: 'path' }}
        onClose={() => {}}
      />
    </Drawer>,
  )
  expect(await screen.findByText('Line of interaction')).toBeTruthy()
  expect(screen.getByText('Line of visibility')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Move New lane in Default' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Move App & skill surface in Default' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Move Claude in the IDE in Default' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Move Journey figures in Default' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Move Subagent fleet in Default' })).toBeNull()
  // Narrow frontstage band auto-defaults an unused role (touchpoints already
  // seats App & skill surface, so Frontstage actions wins).
  expect(screen.getByRole('combobox', { name: 'Role' }).textContent).toMatch(
    /Frontstage/,
  )
  expect(screen.getByRole('combobox', { name: 'Role' }).textContent).not.toMatch(
    /Storyboard/,
  )
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role' }), {
    button: 0,
  })
  expect(
    await screen.findAllByRole('option', { name: /Frontstage/ }),
  ).toHaveLength(2)
})

it('auto-picks a free customer-band role instead of cloning storyboard', async () => {
  reads.items = [
    { id: 'story', name: 'Journey figures', role: 'storyboard' },
    { id: 'owner', name: 'Blueprint owner', role: 'customer_actions' },
    { id: 'touch', name: 'App & skill surface', role: 'frontstage_touchpoints' },
  ]
  reads.order = ['new', 'story', 'owner', 'touch']
  render(
    <Drawer open>
      <LanePanel
        laneId=""
        draft={{
          kind: 'lane',
          scenarioId: 'scenario',
          pathId: 'path',
          beforeDivider: true,
        }}
        onClose={() => {}}
      />
    </Drawer>,
  )
  expect(await screen.findByText('Top of the board')).toBeTruthy()
  expect(screen.getByText('Line of interaction')).toBeTruthy()
  expect(screen.getByRole('combobox', { name: 'Role' }).textContent).toMatch(
    /Partner/,
  )
  expect(screen.getByRole('combobox', { name: 'Role' }).textContent).not.toMatch(
    /Storyboard/,
  )
})
