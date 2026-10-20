// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BlueprintColumnHandles } from './BlueprintColumnHandles'
import { BlueprintLaneHandles } from './BlueprintLaneHandles'
import { BlueprintEmptyCellSlot } from './BlueprintEmptyCellSlot'

const writes = vi.hoisted(() => ({ step: vi.fn(async () => 'new-step'), lane: vi.fn(async () => ['new-lane']) }))
vi.mock('@/lib/authoringRpc', () => ({ addStep: writes.step, addLane: writes.lane }))
vi.mock('@/contexts/EditorContext', () => ({ useAtScenarioLevel: () => true, useEditor: () => ({ selectedScenarioId: 'scenario' }) }))
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => 'design' }))
vi.mock('@/contexts/cellPickContext', () => ({ useCellPick: () => ({ pickMany: vi.fn() }) }))
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({ useBlueprintCellDetailOptional: () => ({ openDraftCell: vi.fn() }) }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => ({ client: {}, canWrite: true }) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, Number(this.dataset.testY ?? 0), 600, 100)
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('inserts at the next step’s stored position, including gaps, and appends after the last', async () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(<>
    <div data-blueprint-cell-anchor="" data-step-index="0" />
    <div data-blueprint-cell-anchor="" data-step-index="1" />
    <BlueprintColumnHandles bodyRef={bodyRef} pathId="path" steps={[
      { id: 'first', name: 'First', position: 1 }, { id: 'next', name: 'Next', position: 4 },
    ]} />
  </>, { container: body })
  fireEvent.click(view.getByLabelText('Insert a step at position 2'))
  await waitFor(() => expect(writes.step).toHaveBeenCalledWith(expect.anything(), { pathId: 'path', name: '', atPosition: 4 }))
  await waitFor(() => expect((view.getByLabelText('Insert a step at position 3') as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(view.getByLabelText('Insert a step at position 3'))
  await waitFor(() => expect(writes.step).toHaveBeenLastCalledWith(expect.anything(), { pathId: 'path', name: '', atPosition: undefined }))
})

it('inserts before the visible lane’s stored position rather than its visible index', async () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(<>
    <div data-blueprint-row="" data-lane-id="first" data-lane-position="1" data-test-y="0" />
    <div data-blueprint-row="" data-lane-id="next" data-lane-position="4" data-test-y="100" />
    <BlueprintLaneHandles bodyRef={bodyRef} />
  </>, { container: body })
  fireEvent.click(view.getAllByLabelText('Insert a lane here')[1])
  const input = await screen.findByPlaceholderText('Lane name')
  fireEvent.change(input, { target: { value: 'Review lane' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(writes.lane).toHaveBeenCalledWith(expect.anything(), { scenarioId: 'scenario', name: 'Review lane', atPosition: 4 }))
})


it('keeps every column handle when an added step has only empty slots', () => {
  const bodyRef = createRef<HTMLDivElement>()
  const body = document.createElement('div')
  document.body.append(body)
  bodyRef.current = body
  const view = render(<>
    <div data-blueprint-cell-anchor="" data-step-index="0" />
    <BlueprintEmptyCellSlot pathId="path" laneId="lane" stepId="empty" laneName="Reviewer" laneRole={null} stepName="New moment" stepIndex={1} width={600} />
    <div data-blueprint-cell-anchor="" data-step-index="2" />
    <BlueprintColumnHandles bodyRef={bodyRef} pathId="path" steps={[
      { id: 'first', name: 'First', position: 1 },
      { id: 'empty', name: 'New moment', position: 2 },
      { id: 'last', name: 'Last', position: 4 },
    ]} />
  </>, { container: body })
  expect(view.getAllByLabelText(/^Select the .* step$/)).toHaveLength(3)
  expect(view.getByLabelText('Select the Last step')).toBeTruthy()
})
