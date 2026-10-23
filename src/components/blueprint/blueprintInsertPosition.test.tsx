// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BlueprintColumnHandles } from './BlueprintColumnHandles'
import { BlueprintLaneHandles } from './BlueprintLaneHandles'
import { BlueprintEmptyCellSlot } from './BlueprintEmptyCellSlot'

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
  expect(view.getAllByLabelText(/^Select the .* step$/)).toHaveLength(3)
  expect(view.getByLabelText('Select the Last step')).toBeTruthy()
})

it('preserves later step selection and insertion when a middle step cannot be measured', async () => {
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
  expect(view.queryByLabelText('Select the Unmeasured step')).toBeNull()
  fireEvent.click(view.getByLabelText('Select the Last step'))
  expect(writes.pickMany).toHaveBeenCalledWith(['last-cell'], 'add')
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
  expect(view.getByLabelText('Select the First step')).toBeTruthy()
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
  expect(view.getAllByLabelText(/^Select the .* step$/)).toHaveLength(2)
  view.rerender(content(steps.slice(0, 1)))
  expect(view.getAllByLabelText(/^Select the .* step$/)).toHaveLength(1)
  view.rerender(content([]))
  expect(view.queryAllByLabelText(/^Add a step/)).toHaveLength(0)
})
