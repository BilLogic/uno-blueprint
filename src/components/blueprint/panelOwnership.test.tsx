// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { StepPanel } from './StepPanel'
import { Drawer } from '@/components/ui/drawer'
import { CanvasModeContext } from '@/contexts/canvasModeContext'

import { BlueprintCellDetailPanel } from './BlueprintCellDetailPanel'
import { BlueprintCellDetailProvider, useBlueprintCellDetail } from '@/contexts/BlueprintCellDetailContext'
import { normalizeBlueprint } from '@/lib/normalizeBlueprint'
import { buildBlueprintCellSelectionForId } from '@/lib/blueprintCellConnections'

// The wire and session are the only substitutes: panels, read hooks and fields
// render together, so these tests observe the public panel component seam.
const session = vi.hoisted(() => ({ client: null as unknown, canWrite: true }))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ ...session, configured: true }),
}))

function mount(mode: 'view' | 'design', children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wire = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const data = url.includes('/steps?')
      ? { id: 'step', name: 'Review request', summary: 'The reviewer checks the request.', scenario_id: 'scenario', scenarios: { name: 'Review', phases: { name: 'Intake' } } }
      : url.includes('/path_steps?')
      ? [{ position: 0, paths: { name: 'Default', created_at: '2026-01-01' } }, { position: 2, paths: { name: 'Exception', created_at: '2026-01-02' } }]
      : url.includes('/cells?')
      ? [{ frame: '/review.png', lanes: { name: 'Pictures', position: 0, lane_role: 'storyboard' } }]
      : []
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  })
  session.client = createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: wire } })
  return render(
    <QueryClientProvider client={client}>
      <CanvasModeContext.Provider value={{ mode, setMode: () => {}, available: true }}>
        {children}
      </CanvasModeContext.Provider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  session.canWrite = true
  vi.unstubAllGlobals()
})

it('gives an editor the step Name and Summary without storyboard pictures or a Position section', async () => {
  mount('design', <Drawer open><StepPanel stepId="step" onClose={() => {}} /></Drawer>)
  expect((await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Review request')
  expect((screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe('The reviewer checks the request.')
  expect(screen.queryByText('Storyboard', { exact: true })).toBeNull()
  expect(screen.queryByText('Position', { exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: /Expand: Pictures/ })).toBeNull()
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), { target: { value: 'The reviewer approves it.' } })
  expect(save.disabled).toBe(false)
})


const board = normalizeBlueprint({
  id: 'path', name: 'Default', kind: 'happy',
  lanes: [
    { id: 'pictures', name: 'Visual overview', lane_role: 'storyboard', position: 0 },
    { id: 'reviewer', name: 'Reviewer', lane_role: 'customer_actions', position: 1 },
  ],
  path_steps: [
    { position: 0, steps: { id: 'before', name: 'Prepare' } },
    { position: 7, steps: { id: 'step', name: 'Review request', summary: 'Step summary stays on the step.' } },
  ],
  cells: [
    { id: 'storyboard', lane_id: 'pictures', step_id: 'step', content: '', position: 0 },
    { id: 'review', lane_id: 'reviewer', step_id: 'step', content: 'Review request', summary: 'Checks the supplied details.', frame: '/reviewer.png', position: 0 },
  ],
})

function StoryboardPanel() {
  const { selectCell } = useBlueprintCellDetail()
  return <><button onClick={() => {
    const selection = buildBlueprintCellSelectionForId(board, 'storyboard', 'Review', 'Intake')!
    // A shared step can arrive with the index from a different path.
    selectCell({ ...selection, stepIndex: 4 })
  }}>Open storyboard</button><BlueprintCellDetailPanel /></>
}

it.each(['view', 'design'] as const)('identifies the storyboard independently of its lane label and keeps its selected-path step and pictures read-only in %s mode', async (mode) => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  mount(mode, <BlueprintCellDetailProvider blueprints={[board]}><StoryboardPanel /></BlueprintCellDetailProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Open storyboard' }))
  expect(await screen.findByText('Storyboard', { exact: true })).toBeTruthy()
  expect(screen.getByText('Step 2 · Review request', { exact: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Expand: Reviewer' })).toBeTruthy()
  expect(screen.getByText('Checks the supplied details.')).toBeTruthy()
  expect(screen.queryByText('Step summary stays on the step.')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: /Save|Add step|Rename step/ })).toBeNull()
})

it.each([
  ['view', true],
  ['design', false],
] as const)('shows the step name and summary as prose with no editing controls in %s mode when write access is %s', async (mode, canWrite) => {
  session.canWrite = canWrite
  mount(mode, <Drawer open><StepPanel stepId="step" onClose={() => {}} /></Drawer>)
  expect(await screen.findByText('Review request', { exact: true })).toBeTruthy()
  expect(screen.getByText('Step', { exact: true })).toBeTruthy()
  expect(screen.getByText('The reviewer checks the request.')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  expect(screen.queryByText('Storyboard', { exact: true })).toBeNull()
  expect(screen.queryByText('Position', { exact: true })).toBeNull()
})
