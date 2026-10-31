// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EntityDetailPanel } from './EntityDetailPanel'
const state = vi.hoisted(() => ({
  entry: { id: 'add-own', revert: { fn: 'undo_structure_add', args: {} } },
  success: vi.fn(),
  revert: vi.fn(async () => {}),
  client: {},
  close: vi.fn(),
  open: vi.fn(),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: state.client }),
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetail: () => ({
    selection: {
      kind: 'step',
      id: 'draft',
      draft: { kind: 'step', pathId: 'one' },
      draftKey: 'draft',
    },
    preview: { name: 'Review', orders: [{}] },
    closeEntity: state.close,
    openEntity: state.open,
  }),
}))
vi.mock('./StepPanel', () => ({
  StepPanel: ({
    onCreated,
  }: {
    onCreated: (id: string, entry: unknown) => void
  }) => (
    <button onClick={() => onCreated('created', state.entry)}>
      Complete Add
    </button>
  ),
}))
vi.mock('./LanePanel', () => ({ LanePanel: () => null }))
vi.mock('./ServicePanel', () => ({ ServicePanel: () => null }))
vi.mock('./PhasePanel', () => ({ PhasePanel: () => null }))
vi.mock('./ScenarioPanel', () => ({ ScenarioPanel: () => null }))
vi.mock('./panelShell', () => ({
  PANEL_EXIT_MS: 100,
  DetailPanelErrorBoundary: ({ children }: { children: ReactNode }) => children,
  PanelDrawerShell: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/hooks/useCanvasTopOffset', () => ({ useCanvasTopOffset: () => {} }))
vi.mock('@/lib/authoringSession', () => ({
  sessionSnapshot: () => [
    { id: 'unrelated-later-write', revert: { fn: 'other' } },
  ],
  forgetChange: vi.fn(),
}))
vi.mock('@/lib/revertChange', () => ({ executeRevert: state.revert }))
vi.mock('@/lib/writeFailures', () => ({ reportWriteSuccess: state.success }))
afterEach(cleanup)
it('the Add toast uses the child write receipt rather than a newer session entry', async () => {
  const view = render(<EntityDetailPanel />)
  fireEvent.click(view.getByText('Complete Add'))
  expect(state.success).toHaveBeenCalledWith(
    'Added the Review step to 1 path',
    'add-own',
    expect.any(Function),
  )
  await state.success.mock.calls[0][2]()
  expect(state.revert).toHaveBeenCalledExactlyOnceWith(
    state.client,
    state.entry,
  )
})
