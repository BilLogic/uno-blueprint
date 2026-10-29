// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CanvasSelectionProvider } from './CanvasSelectionProvider'
import { CanvasDesignTools } from './CanvasDesignTools'
import { BlueprintCellButton } from '@/components/blueprint/BlueprintCellButton'
import { BlueprintLabelRow } from '@/components/blueprint/BlueprintLabelRail'
import { StepHeaderAffordance } from '@/components/blueprint/StepHeaderAffordance'
import { useCellPick } from '@/contexts/cellPickContext'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
const mocks = vi.hoisted(() => ({ open: vi.fn(), lane: vi.fn(), close: vi.fn() }))
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => 'design', getSharedCanvasMode: () => 'design' }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => ({ canWrite: true, client: null }) }))
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({ enabled: true, selectCell: mocks.open, clearSelection: mocks.close, selection: null, selectedCellIds: new Set(), directlyConnectedCellIds: new Set() }),
  useBlueprintCellPreviewHover: () => null,
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetailOptional: () => ({ selection: null, toggleEntity: mocks.lane, openEntity: mocks.lane }),
  useEntityDetail: () => ({ selection: null, toggleEntity: mocks.lane, openEntity: mocks.lane }),
}))
vi.mock('@/contexts/scenarioBoardScopeContext', () => ({ useScenarioBoardInScope: () => true }))
vi.mock('@/components/editor/CreateSliceSheet', () => ({ CreateSliceSheet: ({ trigger }: { trigger: ReactNode }) => trigger }))
vi.mock('@/components/editor/SessionChangesSheet', () => ({ SessionChangesSheet: () => null }))
vi.mock('@/components/editor/MarqueeSelection', () => ({ MarqueeSelection: () => null }))
vi.mock('@/components/editor/CanvasCellContextMenu', () => ({ CanvasCellContextMenu: () => null }))
const selection: BlueprintCellSelection = { scenarioName: 'Intake', laneName: 'Actor', stepName: 'Begin', stepId: 'step', stepIndex: 0, paths: [] }
function Count() { const pick = useCellPick(); return <output aria-label="Picked cells">{pick?.picked.join(',') || 'none'}</output> }
function mount() {
  const lane = { id: 'lane', name: 'Actor', role: 'customer_actions' as const, position: 0 }
  return render(<CanvasSelectionProvider>
    <CanvasDesignTools /><Count />
    <BlueprintCellButton fill="actor" cellId="cell-a" selection={selection}>Action A</BlueprintCellButton>
    <BlueprintCellButton fill="actor" cellId="cell-b" selection={{ ...selection, stepId: 'next' }}>Action B</BlueprintCellButton>
    <BlueprintLabelRow row={{ kind: 'lane', label: 'Actor', lane, collapsed: false }} lanes={[lane]} />
    <StepHeaderAffordance stepId="step" name="Begin" />
  </CanvasSelectionProvider>)
}
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('normal cell and lane clicks open panels; Make slice explicitly takes over cell clicks', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Action A' }))
  expect(mocks.open).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Picked cells').textContent).toBe('none')
  fireEvent.click(screen.getByRole('button', { name: 'Actor' }))
  expect(mocks.lane).toHaveBeenLastCalledWith({ kind: 'lane', id: 'lane' })
  expect(screen.getByLabelText('Picked cells').textContent).toBe('none')
  fireEvent.click(screen.getByRole('button', { name: 'Make a slice — click cells to add them' }))
  fireEvent.click(screen.getByRole('button', { name: 'Action A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Action B' }))
  expect(screen.getByLabelText('Picked cells').textContent).toBe('cell-a,cell-b')
  expect(mocks.open).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Action A' }), { metaKey: true })
  expect(mocks.open).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Picked cells').textContent).toBe('cell-a,cell-b')
  mocks.lane.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Actor' }))
  expect(mocks.lane).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Actor' }), { metaKey: true })
  expect(mocks.lane).toHaveBeenCalledWith({ kind: 'lane', id: 'lane' })
  fireEvent.click(screen.getByRole('button', { name: 'View details: Begin' }), { ctrlKey: true })
  expect(mocks.lane).toHaveBeenLastCalledWith({ kind: 'step', id: 'step' })
  fireEvent.click(screen.getByRole('button', { name: 'Clear the selection' }))
  fireEvent.click(screen.getByRole('button', { name: 'Action B' }))
  expect(mocks.open).toHaveBeenCalledTimes(3)
  expect(screen.getByLabelText('Picked cells').textContent).toBe('none')
})
it('Escape leaves Make slice, and Shift-click outside it does not gather', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Make a slice — click cells to add them' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Action A' }), { shiftKey: true })
  expect(mocks.open).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Picked cells').textContent).toBe('none')
})
