// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BlueprintColumnHandles } from './BlueprintColumnHandles'
import { BlueprintLaneHandles } from './BlueprintLaneHandles'
import { BlueprintEmptyCellSlot } from './BlueprintEmptyCellSlot'
import { COMPARE_LABEL_WIDTH, COMPARE_STEP_HEADER_HEIGHT } from '@/lib/sideBySideCompareLayout'

const writes = vi.hoisted(() => ({
  step: vi.fn(async () => 'new-step'),
  lane: vi.fn(async () => ['new-lane']),
  pickMany: vi.fn(),
  openCreate: vi.fn(),
}))
vi.mock('@/lib/authoringRpc', () => ({
  addStep: writes.step,
  addLane: writes.lane,
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetail: () => ({
    openCreate: writes.openCreate,
    selection: null,
    setSeam: vi.fn(),
  }),
}))
vi.mock('@/contexts/EditorContext', () => ({
  useAtScenarioLevel: () => true,
  useEditor: () => ({ selectedScenarioId: 'scenario' }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'design',
}))
vi.mock('@/contexts/cellPickContext', () => ({
  useCellPick: () => ({ pickMany: writes.pickMany }),
}))
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({ openDraftCell: vi.fn() }),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, canWrite: true }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(0, Number(this.dataset.testY ?? 0), 600, 100)
    },
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('inserts at the next step’s stored position, including gaps, and appends after the last', async () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(
    <>
      <div data-blueprint-cell-anchor="" data-step-index="0" />
      <div data-blueprint-cell-anchor="" data-step-index="1" />
      <BlueprintColumnHandles
        bodyRef={bodyRef}
        pathId="path"
        steps={[
          { id: 'first', name: 'First', position: 1 },
          { id: 'next', name: 'Next', position: 4 },
        ]}
      />
    </>,
    { container: body },
  )
  expect(view.getByLabelText('Add a step after First').style.height).toBe(`${COMPARE_STEP_HEADER_HEIGHT}px`)
  fireEvent.click(view.getByLabelText('Add a step after First'))
  await waitFor(() =>
    expect(writes.openCreate).toHaveBeenCalledWith(
      { kind: 'step', pathId: 'path', atPosition: 4, centered: true },
      expect.any(HTMLButtonElement),
    ),
  )
  await waitFor(() =>
    expect(
      (view.getByLabelText('Add a step after Next') as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(view.getByLabelText('Add a step after Next'))
  await waitFor(() =>
    expect(writes.openCreate).toHaveBeenLastCalledWith(
      { kind: 'step', pathId: 'path', atPosition: undefined, centered: false },
      expect.any(HTMLButtonElement),
    ),
  )
})

it('inserts before the visible lane’s stored position rather than its visible index', async () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(
    <>
      <div
        data-blueprint-row=""
        data-lane-id="first"
        data-lane-position="1"
        data-test-y="0"
      />
      <div
        data-blueprint-row=""
        data-lane-id="next"
        data-lane-position="4"
        data-test-y="100"
      />
      <BlueprintLaneHandles bodyRef={bodyRef} />
    </>,
    { container: body },
  )
  expect(view.getAllByLabelText(/^Add a lane/)[1].style.width).toBe(`${COMPARE_LABEL_WIDTH}px`)
  fireEvent.click(view.getAllByLabelText(/^Add a lane/)[1])
  expect(writes.lane).not.toHaveBeenCalled()
  expect(writes.openCreate).toHaveBeenCalledWith(
    { kind: 'lane', scenarioId: 'scenario', atPosition: 4, centered: true },
    expect.any(HTMLButtonElement),
  )
})

it('keeps every column handle when an added step has only empty slots', () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(
    <>
      <div data-blueprint-cell-anchor="" data-step-index="0" />
      <BlueprintEmptyCellSlot
        pathId="path"
        laneId="lane"
        stepId="empty"
        laneName="Reviewer"
        laneRole={null}
        stepName="New moment"
        stepIndex={1}
        width={600}
      />
      <div data-blueprint-cell-anchor="" data-step-index="2" />
      <BlueprintColumnHandles
        bodyRef={bodyRef}
        pathId="path"
        steps={[
          { id: 'first', name: 'First', position: 1 },
          { id: 'empty', name: 'New moment', position: 2 },
          { id: 'last', name: 'Last', position: 4 },
        ]}
      />
    </>,
    { container: body },
  )
  expect(view.getAllByLabelText(/^Add a step/)).toHaveLength(4)
  expect(view.getByLabelText('Add a step after Last')).toBeTruthy()
})

it('preserves later step insertion when a middle step cannot be measured', async () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(
    <>
      <div data-blueprint-cell-anchor="" data-step-index="0" />
      <div
        data-blueprint-cell-anchor=""
        data-step-index="2"
        data-blueprint-cell="last-cell"
        data-blueprint-cell-interactive=""
      />
      <BlueprintColumnHandles
        bodyRef={bodyRef}
        pathId="path"
        steps={[
          { id: 'first', name: 'First', position: 1 },
          { id: 'unmeasured', name: 'Unmeasured', position: 2 },
          { id: 'last', name: 'Last', position: 4 },
        ]}
      />
    </>,
    { container: body },
  )
  fireEvent.click(view.getByLabelText('Add a step after Unmeasured'))
  await waitFor(() =>
    expect(writes.openCreate).toHaveBeenCalledWith(
      { kind: 'step', pathId: 'path', atPosition: 4, centered: true },
      expect.any(HTMLButtonElement),
    ),
  )
  await waitFor(() =>
    expect(
      (view.getByLabelText('Add a step after Last') as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(view.getByLabelText('Add a step after Last'))
  await waitFor(() =>
    expect(writes.openCreate).toHaveBeenLastCalledWith(
      { kind: 'step', pathId: 'path', atPosition: undefined, centered: false },
      expect.any(HTMLButtonElement),
    ),
  )
})

it.each([undefined, '', 'not-a-position', 'Infinity'])(
  'hides lane insertions for invalid stored position %s and recovers',
  (position) => {
    const bodyRef = createRef<HTMLDivElement>()
    const body = document.createElement('div')
    document.body.append(body)
    bodyRef.current = body
    const content = (storedPosition: string | undefined) => (
      <>
        <div
          data-blueprint-row=""
          data-lane-id="lane"
          data-lane-position={storedPosition}
        />
        <BlueprintLaneHandles bodyRef={bodyRef} />
      </>
    )
    const view = render(content('1'), { container: body })
    expect(view.getAllByLabelText(/^Add a lane/)).toHaveLength(2)
    view.rerender(content(position))
    expect(view.queryByLabelText(/^Add a lane/)).toBeNull()
    view.rerender(content('4'))
    expect(view.getAllByLabelText(/^Add a lane/)).toHaveLength(2)
    expect(writes.lane).not.toHaveBeenCalled()
  },
)

it('does not place an end handle on an earlier column when the final step is unmeasured', () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(
    <>
      <div data-blueprint-cell-anchor="" data-step-index="0" />
      <BlueprintColumnHandles
        bodyRef={bodyRef}
        pathId="path"
        steps={[
          { id: 'first', name: 'First', position: 1 },
          { id: 'last', name: 'Last', position: 4 },
        ]}
      />
    </>,
    { container: body },
  )
  expect(view.getByLabelText('Add a step before First')).toBeTruthy()
  expect(view.getAllByRole('button', { name: /^Add a step/ })).toHaveLength(1)
  expect(view.queryByLabelText('Add a step after Unmeasured')).toBeNull()
})

it('keeps the canvas rendered while undo removes a measured step', () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const steps = [
    { id: 'first', name: 'First', position: 1 },
    { id: 'removed', name: 'Removed', position: 2 },
  ]
  const content = (current: typeof steps) => (
    <>
      <div data-blueprint-cell-anchor="" data-step-index="0" />
      <div data-blueprint-cell-anchor="" data-step-index="1" />
      <BlueprintColumnHandles bodyRef={bodyRef} pathId="path" steps={current} />
    </>
  )
  const view = render(content(steps), { container: body })
  expect(view.getAllByLabelText(/^Add a step/)).toHaveLength(3)
  view.rerender(content(steps.slice(0, 1)))
  expect(view.getAllByLabelText(/^Add a step/)).toHaveLength(2)
  view.rerender(content([]))
  expect(view.queryAllByLabelText(/^Add a step/)).toHaveLength(0)
})


it('offers one insertion trigger per canonical step header across stacked paths', () => {
  const board = document.createElement('div')
  board.dataset.structureBoard = ''
  board.innerHTML = '<div data-blueprint-column-header><button data-structure-id="first">Start</button></div>'
  document.body.append(board)
  const first = createRef<HTMLDivElement>(), second = createRef<HTMLDivElement>()
  first.current = document.createElement('div')
  second.current = document.createElement('div')
  first.current.dataset.structurePath = 'one'
  second.current.dataset.structurePath = 'two'
  first.current.dataset.structureStepIds = second.current.dataset.structureStepIds = 'first'
  board.append(first.current, second.current)
  try {
    render(<><div data-blueprint-cell-anchor="" data-step-index="0" />
      <BlueprintColumnHandles bodyRef={first} pathId="one" steps={[{id:'first',name:'Start',position:0}]} />
    </>, {container:first.current})
    render(<><div data-blueprint-cell-anchor="" data-step-index="0" />
      <BlueprintColumnHandles bodyRef={second} pathId="two" steps={[{id:'first',name:'Start',position:0}]} />
    </>, {container:second.current})
    expect(screen.getAllByLabelText(/^Add a step/)).toHaveLength(2)
  } finally {board.remove()}
})

it('derives one upper-side target from the canonical separator rather than its content copy', () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(<>
    <div data-blueprint-row="" data-lane-id="first" data-lane-position="1" data-test-y="0" />
    <div role="separator" aria-label="Line of interaction" data-blueprint-divider="interaction" data-test-y="100" />
    <div role="separator" data-blueprint-divider="interaction" data-test-y="100" />
    <div data-blueprint-row="" data-lane-id="next" data-lane-position="4" data-test-y="200" />
    <BlueprintLaneHandles bodyRef={bodyRef} pathId="path" />
  </>,{container:body})
  const upper = view.getAllByRole('button',{name:'Add a lane above Line of interaction'})
  expect(upper).toHaveLength(1)
  expect(view.queryByRole('button',{name:'Add a lane above null'})).toBeNull()
  fireEvent.click(upper[0])
  expect(writes.openCreate).toHaveBeenCalledWith(expect.objectContaining({kind:'lane',pathId:'path',atPosition:4,beforeDivider:true}),expect.any(HTMLButtonElement))
})
