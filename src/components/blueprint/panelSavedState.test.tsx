// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepPanel } from './StepPanel'
import { LanePanel } from './LanePanel'
import { Drawer } from '@/components/ui/drawer'

const state = vi.hoisted(() => ({
  step: { id: 'step', name: 'Review', summary: '', scenarioId: 'scenario', scenarioName: 'Sample', phaseName: 'Start', positions: [], frames: [] },
  lane: { id: 'lane', name: 'Reviewer', role: null, ownerTeam: '', kpis: [] as string[], tools: [] as string[], stakeholderId: null, scenarioId: 'scenario', scenarioName: 'Sample', phaseName: 'Start', siblingLaneIds: ['lane'] },
}))
vi.mock('@/hooks/useStepSpec', () => ({ useStepSpec: () => ({ status: 'ready', data: state.step }) }))
vi.mock('@/hooks/useLaneSpec', () => ({ useLaneSpec: () => ({ status: 'ready', data: state.lane }) }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => ({ client: {}, canWrite: true }) }))
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => 'design' }))
vi.mock('@/hooks/useOwnerTags', () => ({ useOwnerTags: () => [] }))
vi.mock('./StakeholderSelect', () => ({ StakeholderSelect: () => null }))
afterEach(cleanup)

for (const kind of ['step', 'lane'] as const) {
  describe(`${kind} editor after a stale cached snapshot is revalidated`, () => {
    const mount = () => kind === 'step'
      ? <StepPanel stepId="step" onClose={() => {}} />
      : <LanePanel laneId="lane" onClose={() => {}} />
    const setSaved = (text: string) => {
      if (kind === 'step') state.step = { ...state.step, summary: text }
      else state.lane = { ...state.lane, ownerTeam: text }
    }
    const input = (container: HTMLElement) => container.querySelector(kind === 'step' ? 'textarea' : 'input') as HTMLInputElement

    it('follows the saved value when the reader has not typed', () => {
      setSaved('')
      const view = render(<Drawer open>{mount()}</Drawer>)
      expect(input(view.container).value).toBe('')
      setSaved('Saved value')
      view.rerender(<Drawer open>{mount()}</Drawer>)
      expect(input(view.container).value).toBe('Saved value')
    })

    it('keeps an in-progress draft when a fresh response arrives', () => {
      setSaved('Original')
      const view = render(<Drawer open>{mount()}</Drawer>)
      fireEvent.change(input(view.container), { target: { value: 'My draft' } })
      setSaved('Saved elsewhere')
      view.rerender(<Drawer open>{mount()}</Drawer>)
      expect(input(view.container).value).toBe('My draft')
    })
  })
}
