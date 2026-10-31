// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LaneHeaderAffordance } from './LaneHeaderAffordance'
import { StepHeaderAffordance } from './StepHeaderAffordance'

const writes = vi.hoisted(() => ({
  lane: vi.fn(async () => {}),
  step: vi.fn(async () => {}),
  toggle: vi.fn(),
}))
vi.mock('@/lib/authoringRpc', () => ({
  renameLane: writes.lane,
  renameStepName: writes.step,
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, canWrite: true }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'design',
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetail: () => ({ toggleEntity: writes.toggle, selection: null }),
}))
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({ enabled: true }),
}))
vi.mock('@/contexts/scenarioBoardScopeContext', () => ({
  useScenarioBoardInScope: () => true,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

for (const kind of ['lane', 'step'] as const) {
  it(`double-clicks a ${kind} label into a focused in-place name editor`, async () => {
    render(
      kind === 'lane' ? (
        <LaneHeaderAffordance laneId="saved" laneName="Review" />
      ) : (
        <StepHeaderAffordance stepId="saved" name="Review" />
      ),
    )
    const label = screen.getByText('Review', { exact: true })
    fireEvent.click(label, { detail: 1 })
    fireEvent.click(label, { detail: 2 })
    fireEvent.doubleClick(label)
    expect(writes.toggle).not.toHaveBeenCalled()
    const input = screen.getByRole('textbox', { name: `Rename ${kind}` })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'Decision' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(writes[kind]).toHaveBeenCalledWith(expect.anything(), {
        [kind === 'lane' ? 'laneId' : 'stepId']: 'saved',
        name: 'Decision',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
}
